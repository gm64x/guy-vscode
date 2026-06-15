# Change Log

All notable changes to the "guy" extension will be documented in this file.

## [Unreleased]

### Added

- Python control-flow graph generation from the active file, selected code, or the function under the cursor.
- Tree-sitter based Python parsing for statements, functions, conditionals, loops, returns, `break`, and `continue`.
- CFG metrics including node count, edge count, decision count, connected components, and cyclomatic complexity.
- Independent path listing with safeguards for large graphs.
- React-based webview preview using React Flow and Dagre layout.
- Interactive graph navigation: select nodes, edges, functions, and independent paths from the preview/sidebar to highlight source code.
- Simplified and detailed CFG view modes with a command and webview toggle.
- Complexity suggestions when `V(G)` exceeds the configured threshold.
- Python examples for sequential code, conditionals, functions, loops, and simplified/detailed graph behavior.
- Extension icons and git-branch themed command icons for light and dark themes.

### Changed

- Refactored the extension into core CFG, parser, metrics, path analysis, VS Code integration, and webview modules.
- Replaced the initial scaffold documentation with project-specific extension documentation.
- Migrated the build setup to npm, esbuild, TypeScript, ESLint, and VS Code test tooling.
- Compacted the webview panel styling for a denser graph/sidebar layout.

### Removed

- Removed the previous Bun-specific scaffold and mock-based structure in favor of the VS Code extension build/test structure.
