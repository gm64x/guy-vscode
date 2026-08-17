# Contributing to GUY

Thanks for helping improve GUY. Contributions can include bug fixes, language support, tests, documentation, performance improvements, and usability refinements.

## Before you start

1. Search the [existing issues](https://github.com/gm64x/guy-vscode/issues) to avoid duplicate work.
2. For a bug, include a minimal source example, its language, the generation mode used, and the behavior you expected.
3. For a substantial feature or architectural change, open an issue before implementation so the scope and trade-offs can be discussed.
4. Keep each pull request focused on one problem.

## Development setup

GUY uses Node.js 22, pinned in `mise.toml`.

```sh
git clone https://github.com/gm64x/guy-vscode.git
cd guy-vscode
mise install
mise exec -- npm install
mise exec -- npm run compile
```

If `mise` is already activated in your shell, run the npm commands without the `mise exec --` prefix. The repository's `.npmrc` supplies the compatibility setting needed by the Tree-sitter dependency graph.

Open the repository in VS Code and press `F5` to start an Extension Development Host.

## Project structure

| Path | Responsibility |
| --- | --- |
| `src/core/` | Language-neutral control-flow IR, CFG construction, metrics, paths, and shared types |
| `src/core/languages/` | Tree-sitter runtime, language registry, and grammar adapters |
| `src/vscode/` | VS Code editor, navigation, webview panel, and message integration |
| `src/webview/` | React graph interface and secure webview bootstrap |
| `src/test/` | Tests executed with VS Code Test Electron |
| `examples/` | Manual examples and parser-tolerance fixtures by language |
| `media/` | Icons and other published assets |

Keep grammar-specific logic in language adapters. The shared CFG builder should consume the neutral IR and must not gain language-specific branches.

## Making a change

1. Create a branch from the latest `main`.
2. Read the related implementation and tests before editing.
3. Make the smallest change that fully addresses the issue.
4. Add or adjust a focused test that would fail without the change.
5. Update user-facing documentation and the `[Unreleased]` section of `CHANGELOG.md` when behavior or packaged content changes.
6. Run the applicable validation commands.
7. Review the final diff and remove generated artifacts before opening a pull request.

Do not commit `dist/`, `out/`, `node_modules/`, `.vscode-test/`, or `.vsix` files.

## Adding or changing language support

Language work must preserve the adapter and registry architecture:

1. Inspect the real Tree-sitter syntax tree for every construct being modeled.
2. Extend the language adapter when the existing neutral IR is sufficient.
3. Add new neutral IR only when the construct cannot be represented faithfully by the existing model.
4. Register the language metadata, extensions, display name, and VS Code language ID.
5. Update activation events, editor menus, dependencies, and WASM packaging when required.
6. Add real WASM-backed tests for file, selection, and callable-under-cursor modes.
7. Cover source offsets, navigation/highlighting, branches, loops, abrupt flow, exceptions, and parser recovery where applicable.
8. Add or update an example under `examples/`, including unsupported syntax when it helps verify graceful parser tolerance.

Treat constructs without dedicated IR and tests as opaque source-ranged statements. Do not approximate new semantics silently.

## Validation

Run the narrowest relevant test first, followed by the checks that match the change:

| Command | Use |
| --- | --- |
| `npm run check-types` | Strict TypeScript validation without emitted files |
| `npm run lint` | ESLint validation for `src/` |
| `npm run compile-tests` | Compile the extension test sources |
| `npm run compile` | Type-check, lint, and create a development bundle |
| `npm test` | Run the VS Code Test Electron suite |
| `npm run package` | Validate the production bundle |

Parser, CFG, navigation, message, and webview behavior changes should run `npm test`. Packaging and distributed-content changes should run `npm run package`.

Before submitting, also run:

```sh
git diff --check
git status --short
```

## Versioning and changelog

Changes to code, behavior, configuration, dependencies, commands, the webview, or other distributed content require a semantic version bump. Patch is the default unless the scope requires a minor or major release.

Keep these values synchronized:

- `package.json` version;
- top-level `package-lock.json` version;
- root package version inside `package-lock.json`.

Documentation that is purely internal, such as agent instructions, does not require a version bump. Do not create release tags or publish packages from a contribution branch unless a maintainer explicitly requests it.

## Commits and pull requests

Use clear [Conventional Commit](https://www.conventionalcommits.org/) messages, for example:

- `fix: preserve continue flow through finally`
- `feat: add language adapter for kotlin`
- `docs: explain graph navigation`
- `chore(release): bump version to 0.1.5`

A pull request should include:

- a concise description of the problem and solution;
- links to related issues;
- the validation commands executed and their results;
- screenshots or recordings for visible webview changes;
- limitations, compatibility concerns, or follow-up work.

By contributing, you agree that your contribution is licensed under the repository's [MIT License](LICENSE.txt).
