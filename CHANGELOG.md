# Changelog

All notable changes to GUY are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.8] - 2026-09-26

### Changed

- Release workflow now publishes to the VS Code Marketplace under the `gm64x` publisher, in addition to the existing GitHub Release.

## [0.1.7] - 2026-08-17

### Fixed

- Prevented graph controls from overlapping in the CFG preview.

## [0.1.6] - 2026-08-17

### Added

- Unsupported control-flow syntax warnings with construct names, source locations, and code previews for Python, Java, PHP, C, Go, and Rust.
- Function-mode filtering so warnings only describe unsupported constructs inside the selected callable.

## [0.1.5] - 2026-08-17

### Added

- A 256×256 Marketplace icon based on the GUY control-flow symbol.
- End-user documentation for installation, graph interpretation, language coverage, local processing, requirements, and limitations.
- Marketplace metadata for pricing, questions, discovery keywords, and a clearer display name and description.
- Project contribution guidelines in `CONTRIBUTING.md`.

### Changed

- Reworked the Marketplace README so the primary quick start explains how to use the installed extension instead of how to build the repository.

## [0.1.4] - 2026-08-17

### Fixed

- Corrected the packaged Tree-sitter WASM entrypoints for Go and Rust.

### Changed

- Documented the required version-bump and release validation process.

## [0.1.3] - 2026-08-17

### Added

- Control-flow graph support for Java, PHP, C, Go, and Rust while preserving Python support.
- Language adapters and a registry that translate Tree-sitter grammar nodes into the shared control-flow IR.
- Real WASM-backed coverage for file, selection, and callable-under-cursor modes across supported languages.
- Automatic preview refresh, file locking, and graph-version pinning controls.
- Marketplace keywords, repository links, issue links, and gallery banner metadata.
- Linux and WSL development launch scripts.

### Changed

- Moved examples out of the extension source tree and added broad construct examples for every supported language.
- Flattened the webview source layout and tightened repository and package hygiene.
- Standardized local development on Node.js 22 through `mise`.

### Fixed

- Preserved abrupt control-flow paths through loops, exception handling, and `finally` cleanup across languages.
- Improved recovery from Tree-sitter error containers and language-specific parser edge cases.

## [0.1.2] - 2026-07-29

### Added

- Python CFG generation from an entire file, a selected range, or the function under the cursor.
- Tree-sitter WASM parsing for functions, statements, conditionals, loops, returns, `break`, `continue`, exceptions, `with`, and loop `else`.
- An interactive React Flow preview with Dagre layout, simplified and detailed modes, and source-code navigation.
- Metrics for nodes, edges, decisions, connected components, independent paths, and cyclomatic complexity.
- Complexity suggestions, large-graph safeguards, syntax-recovery diagnostics, and editor highlighting.
- Automated VSIX release packaging through GitHub Actions.

### Changed

- Replaced the initial Bun scaffold with the npm, esbuild, TypeScript, ESLint, and VS Code Test Electron toolchain.

[Unreleased]: https://github.com/gm64x/guy-vscode/compare/v0.1.5...HEAD
[0.1.5]: https://github.com/gm64x/guy-vscode/compare/v0.1.4...v0.1.5
[0.1.4]: https://github.com/gm64x/guy-vscode/compare/v0.1.3...v0.1.4
[0.1.3]: https://github.com/gm64x/guy-vscode/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/gm64x/guy-vscode/releases/tag/v0.1.2
