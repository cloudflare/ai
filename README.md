# Cloudflare AI

This repository contains various packages and demo apps related consuming Cloudflare's AI offerings on the client-side. It is a monorepo powered by [Nx](https://nx.dev/) and [Changesets](https://github.com/changesets/changesets).

## Packages

- [`workers-ai-provider`](./packages/workers-ai-provider/README.md): A custom provider that enables [Workers AI](https://ai.cloudflare.com/)'s models for the [Vercel AI SDK](https://sdk.vercel.ai/).
- [`ai-gateway-provider`](./packages/ai-gateway-provider/README.md): [AI Gateway](https://developers.cloudflare.com/ai-gateway/) Provider for [Vercel AI SDK](https://sdk.vercel.ai/).

## Local Development

1. Clone the repository.

   ```bash
   git clone git@github.com:cloudflare/ai.git
    ```
   
2. Install Dependencies.

   From the root directory, run:

   ```bash
   cd ai
   pnpm install
   ```

3. Develop.

   To start a development server for a specific app (for instance, `tool-calling`):

   ```bash
   pnpm nx dev tool-calling
   ```

   *Ideally all commands should be executed from the repository root with the `pnpm nx` prefix. This will ensure that the dependency graph is managed correctly, e.g. if one package relies on the output of an other.*

4. Testing and Linting.

  - To execute your continuous integration tests for a specific project (e.g., `workers-ai-provider`):

    ```bash
    pnpm nx test:ci workers-ai-provider
    ```

  - To lint a specific project:

    ```bash
    pnpm nx lint my-project
    ```

  - To run a more comprehensive sweep of tasks (lint, tests, type checks, build) against one or more projects:

    ```bash
    pnpm nx run-many -t lint test:ci type-check build -p "my-project other-project"
    ```

5. Other Nx Tasks.

  - `build`: Compiles a project or a set of projects.
  - `test`: Runs project tests in watch mode.
  - `test:ci`: Runs tests in CI mode (no watch).
  - `test:smoke`: Runs smoke tests.
  - `type-check`: Performs TypeScript type checks.

## Creating a New Demo App

In order to scaffold a new demo app, you can use the `create-demo` script. This script will create a new demo app in the `demos` directory.

```bash
pnpm create-demo <demo-name>
```

After creating the app, `pnpm install` will be run to install the dependencies, and `pnpm nx cf-typegen <demo-name>` will be run to generate the types for the demo app. Then it's simply a case of starting the app with:

```bash
pnpm nx dev <demo-name>
```

## Contributing

We appreciate contributions and encourage pull requests. Please follow these guidelines:

1. Project Setup: After forking or cloning, install dependencies with `pnpm install`.
2. Branching: Create a new branch for your feature or fix.
3. Making Changes:
  - Add or update relevant tests.
  - On pushing your changes, automated tasks will be run (courtesy of a Husky pre-push hook).
4. Changesets: If your changes affect a published package, run `pnpm changeset` to create a changeset. Provide a concise summary of your changes in the changeset prompt.
5. Pull Request: Submit a pull request to the `main` branch. The team will review it and merge if everything is in order.

## Release Process

This repository uses [Changesets](https://github.com/changesets/changesets) to manage versioning and publication:

1. **Changeset Creation**: Whenever a change is made that warrants a new release (e.g., bug fixes, new features), run:

   ```bash
   pnpm changeset
   ```

   Provide a clear description of the changes.

2. **Merging**: Once the changeset is merged into `main`, our GitHub Actions workflows will:
  - Detect the changed packages, and create a Version Packages PR.
  - Increment versions automatically (via Changesets).
  - Publish any package that has a version number to npm. (Demos and other internal items do not require versioning.)

3. **Publication**: The release workflow (`.github/workflows/release.yml`) will run on every push to `main`. It ensures each published package is tagged and released on npm. Any package with a version field in its `package.json` will be included in this process.

---

For any queries or guidance, kindly open an issue or submit a pull request. We hope this structure and process help you to contribute effectively.

