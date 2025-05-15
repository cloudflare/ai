import "zx/globals";
import { z } from "zod";
import { createHash } from "node:crypto";

const repoRoot = path.resolve(__dirname, "../../..");

async function getDemos(): Promise<string[]> {
	return (await glob("./demos/*/package.json")).map((t) => path.dirname(t));
}

export async function generateNpmLockfiles(): Promise<void> {
	const config = await new DemosConfig().load();
	const demos = await getDemos();

	for (const name of demos) {
		echo(chalk.blue(`Updating template: ${chalk.grey(name)}`));
		cd(path.resolve(repoRoot, name));

		const packageJsonHash = await hashFile("./package.json");
		const modified = config.updateTemplateHash(name, packageJsonHash);

		if (!modified) {
			echo(chalk.grey("package-lock.json already up to date, skipping"));
			continue;
		}

		await fs.rm("./package-lock.json", { force: true });
		await fs.rm("./node_modules", { force: true, recursive: true });

		await $({
			verbose: true,
			stdio: "inherit",
		})`npm install --no-audit --progress=false`;

		await fs.rm("./node_modules", { force: true, recursive: true });
	}

	await config.save();

	// Restore dependencies with pnpm
	await $`pnpm install --child-concurrency=10`.verbose();
}

export async function lintNpmLockfiles(): Promise<void> {
	const config = await new DemosConfig().load();
	const demos = await getDemos();

	for (const name of demos) {
		cd(path.resolve(repoRoot, name));
		const packageJsonHash = await hashFile("./package.json");
		const modified = config.updateTemplateHash(name, packageJsonHash);

		if (modified) {
			echo(
				chalk.red(
					`npm package lock for ${name} is out of date! Please run \`pnpm run generate-npm-lockfiles\``,
				),
			);
			process.exit(1);
		}
	}
}

class DemosConfig {
	private configPath = path.resolve(repoRoot, "./demos.json");
	demos: Config["demos"] = {};

	async load(): Promise<DemosConfig> {
		const cfg = Config.parse(JSON.parse(await fs.readFile(this.configPath, "utf8")));

		this.demos = cfg.demos;
		return this;
	}

	async save(): Promise<void> {
		await fs.writeFile(
			this.configPath,
			JSON.stringify(
				Config.parse({
					demos: this.demos,
				} satisfies Config),
				null,
				2,
			),
		);
	}

	/**
	 * Updates the hash for the given template and returns
	 * whether the hash has changed
	 */
	updateTemplateHash(template: string, hash: string): boolean {
		const templateConfig = this.demos[template];
		if (templateConfig === undefined) {
			this.demos[template] = {
				package_json_hash: hash,
			};
			return true;
		}

		if (templateConfig.package_json_hash === hash) {
			return false;
		}

		templateConfig.package_json_hash = hash;
		return true;
	}
}

type TemplateConfig = z.infer<typeof TemplateConfig>;
const TemplateConfig = z.object({
	package_json_hash: z.string(),
});

type Config = z.infer<typeof Config>;
const Config = z.object({
	demos: z.record(z.string(), TemplateConfig),
});

async function hashFile(filePath: string): Promise<string> {
	const hash = createHash("sha1");

	const stream = fs.createReadStream(filePath);

	for await (const chunk of stream) {
		hash.update(chunk as Buffer);
	}

	return hash.digest("hex");
}
