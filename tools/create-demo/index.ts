import { exec, execSync } from "node:child_process";
import * as path from "node:path";
import {
	cancel,
	confirm,
	intro,
	isCancel,
	log,
	multiselect,
	outro,
	spinner,
	text,
} from "@clack/prompts";
import chalk from "chalk";
import { copyDirectoryOrFile, readPackageJson, writePackageJson } from "./utils";

const DEMO_PATH_PREFIX = "./demos/";
const projectNameArg = process.argv[2];

async function main(): Promise<void> {
	intro("Creating a new demo project");

	const projectPath = projectNameArg
		? `${DEMO_PATH_PREFIX}${projectNameArg}`
		: ((await text({
				initialValue: DEMO_PATH_PREFIX,
				message: "Enter the full path for the new project location:",
			})) as string);

	const withClient = await confirm({
		initialValue: false,
		message: "Create scaffolding for client side?",
	});

	const projectName = projectPath.split("/").pop();

	if (isCancel(projectName)) {
		cancel("Operation cancelled.");
		process.exit(0);
	}

	if (!projectName) {
		log.error("Invalid project name provided.");
		process.exit(1);
	}

	const deps = (await multiselect({
		message: "Select which dependencies to install:",
		options: [
			{
				label: "Workers AI Provider for the Vercel AI SDK (also installs zod and ai)",
				value: "workers-ai-provider",
			},
			{ label: "Agents SDK", value: "agents" },
			{ label: "Zod", value: "zod" },
			{ label: "Vercel AI SDK", value: "ai" },
		],
	})) as string[];

	const scaffoldingFolderName = withClient ? "worker-with-client" : "worker";
	const scaffoldingPath = path.join(__dirname, "scaffolding", scaffoldingFolderName);

	try {
		await copyDirectoryOrFile(scaffoldingPath, projectPath, {
			projectName,
		});
	} catch (error) {
		log.error(JSON.stringify(error, null, 2));
		log.error("An error occurred while generating the project.");
		process.exit(1);
	}

	/*
	  For each dep, we want to add it to the dependencies object package.json in the projectPath
	 */
	const packageJson = await readPackageJson(path.resolve(projectPath, "package.json"));
	const rootPackageJson = await readPackageJson(
		path.resolve(__dirname, "..", "..", "package.json"),
	);

	deps.push("hono");
	if (deps.includes("workers-ai-provider")) {
		deps.push("zod");
		deps.push("ai");
	}

	for (const dep of deps) {
		packageJson.dependencies[dep] = rootPackageJson.dependencies[dep];
	}
	await writePackageJson(path.resolve(projectPath, "package.json"), packageJson);

	await new Promise((resolve) => {
		const s = spinner();
		s.start("Running pnpm install...");

		exec("pnpm install --child-concurrency=10", { cwd: projectPath }, (error, _, stderr) => {
			if (error) {
				log.error("An error occurred while running pnpm install.");
				s.stop("pnpm install failed.");
				process.exit(1);
			}

			if (stderr) {
				log.error(`stderr: ${stderr}`);
			}

			s.stop("pnpm install completed successfully.");
			resolve(true);
		});
	});

	await new Promise((resolve) => {
		const s = spinner();
		s.start("Running pnpm nx cf-typegen...");

		exec(`pnpm nx cf-typegen ${projectName}`, { cwd: projectPath }, (error, _, stderr) => {
			if (error) {
				log.error("An error occurred while running pnpm nx cf-typegen.");
				s.stop(`pnpm nx cf-typegen ${projectName} failed.`);
				process.exit(1);
			}

			if (stderr) {
				log.error(`stderr: ${stderr}`);
			}

			s.stop(`pnpm nx cf-typegen ${projectName} completed successfully.`);
			resolve(true);
		});
	});

	execSync(`biome format --write ${projectPath}`);

	outro(`You're all set! To start your worker:

   ${chalk.dim("$")} ${chalk.green(`pnpm nx dev ${projectName}`)}`);
}

// Execute the main function and handle any unexpected errors.
main().catch((error) => {
	log.error(`Unexpected error: ${error}`);
	process.exit(1);
});
