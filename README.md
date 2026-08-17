<div align="center">

<img src="media/icon.png" alt="GUY control-flow graph logo" width="128">

# GUY

### Graphing Utility for Your code

Interactive control-flow graphs for Python, Java, PHP, C, Go, and Rust — directly in Visual Studio Code.

[![VS Code](https://img.shields.io/badge/VS%20Code-%5E1.120.0-007ACC?style=for-the-badge&logo=visual-studio-code&logoColor=white)](https://code.visualstudio.com/)
[![GitHub stars](https://img.shields.io/github/stars/gm64x/guy-vscode?style=for-the-badge&logo=github)](https://github.com/gm64x/guy-vscode/stargazers)
[![License](https://img.shields.io/github/license/gm64x/guy-vscode?style=for-the-badge)](LICENSE.txt)

</div>

GUY turns source code into an interactive control-flow graph (CFG). Follow branches and loops, inspect complexity, explore independent execution paths, and jump from the graph back to the exact source range without leaving the editor.

All analysis runs locally. GUY uses bundled Tree-sitter WASM parsers and does not require a language runtime or send source code to an external service.

## Why use GUY?

- **Understand unfamiliar code:** see decisions, loops, early returns, and exception paths at a glance.
- **Focus the analysis:** graph an entire file, the current selection, or only the function under the cursor.
- **Connect graph and source:** select nodes, edges, callables, or paths to highlight their corresponding code.
- **Spot risky complexity:** review node, edge, component, path, and cyclomatic-complexity metrics.
- **Keep working while editing:** the preview refreshes as the active source changes and can be locked or pinned when needed.

## Getting started

1. Install **GUY - Control Flow Graphs** from the Extensions view.
2. Open a supported source file.
3. Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) and run **GUY: Generate CFG from File**.
4. Click a graph item to navigate to and highlight its source code.

You can also use the branch icon in the editor title bar. To narrow the graph, right-click selected code and choose **GUY: Generate CFG from Selection**, or place the cursor inside a callable and choose **GUY: Generate CFG from Current Function**.

## What the graph shows

- Statements and sequential execution flow.
- Decision branches for `if`/`else-if`/`else` and supported `switch`/`match` forms.
- Loop entry, body, continuation, and exit paths.
- Abrupt flow from `return`, `break`, `continue`, and exceptions.
- Callable boundaries and source ranges.
- Metrics for nodes, edges, decisions, connected components, independent paths, and cyclomatic complexity.

Use **simplified** mode to compact consecutive statements or **detailed** mode to inspect individual operations. The preview can switch between top-to-bottom and left-to-right layouts.

## Supported languages

| Language | Files | Core coverage |
| --- | --- | --- |
| Python | `.py` | Functions, branches, loops, `with`, `return`, `break`, `continue`, `raise`, `try`/`except`/`finally`, and loop `else` |
| Java | `.java` | Methods, constructors, branches, classic/enhanced loops, jumps, and `try`/`catch`/`finally`/`throw` |
| PHP | `.php` | Functions, methods, branches, `for`/`foreach`/`while`, jumps, and exception flow |
| C | `.c`, `.h`* | Functions, branches, loops, `return`, `break`, and `continue` |
| Go | `.go` | Functions, methods, branches, loops, `return`, `break`, and `continue` |
| Rust | `.rs` | Functions, methods, branches, loops, `return`, `break`, and `continue` |

\* Header files are supported when VS Code identifies the document language as C.

GUY can recover a partial graph from many syntax errors. When parser recovery was required, the preview displays a diagnostic so you know the graph may be incomplete.

## Commands

| Command | Description |
| --- | --- |
| `GUY: Generate CFG from File` | Build a graph for the active supported file. |
| `GUY: Generate CFG from Selection` | Build a graph for the selected source range. |
| `GUY: Generate CFG from Current Function` | Build a graph for the function, method, or constructor containing the cursor. |
| `GUY: Toggle Simplified/Detailed CFG View` | Switch the current graph detail mode. |

## Settings

| Setting | Default | Description |
| --- | ---: | --- |
| `guy.autoOpenPreview` | `true` | Open the CFG preview automatically after generation. |
| `guy.graphLayout` | `top-bottom` | Set the default direction to `top-bottom` or `left-right`. |
| `guy.showMetricsPanel` | `true` | Show graph metrics in the preview. |
| `guy.highlightCodeOnNodeClick` | `true` | Highlight source code when a graph item is selected. |
| `guy.maxNodesBeforeWarning` | `100` | Warn when a graph exceeds this number of nodes. |
| `guy.highComplexityThreshold` | `10` | Set the cyclomatic-complexity threshold for suggestions. |

## Requirements

- Visual Studio Code `^1.120.0`.
- No Python, Java, PHP, C, Go, or Rust runtime is required for graph generation.

## Current limitations

- Exception matching is type-agnostic, so exception edges represent possible handlers and a possible unhandled route.
- Syntax recovery can produce an incomplete graph.
- Independent paths are capped for very large graphs to keep the preview responsive.
- Some language-specific constructs use the closest shared CFG representation. Labels and `goto` remain source-ranged statements until dedicated flow modeling is added.

## Development

The project uses Node.js 22, configured in `mise.toml`.

```sh
git clone https://github.com/gm64x/guy-vscode.git
cd guy-vscode
mise install
mise exec -- npm install
mise exec -- npm run compile
```

Press `F5` in VS Code to launch an Extension Development Host. Useful validation commands are:

```sh
npm run check-types
npm run lint
npm run compile-tests
npm run compile
npm test
```

Create a production bundle with `npm run package`, or build an installable package with `npm run package:vsix`.

### Adding another language

1. Install its official `tree-sitter-*` grammar package.
2. Create an adapter that converts grammar nodes to the neutral control-flow IR.
3. Register its metadata, extension rules, display name, and VS Code language ID.
4. Enable its editor menu conditions.
5. Add real WASM-backed fixtures for file, selection, and callable modes.

The shared CFG builder and automatic WASM asset discovery do not need language-specific branches.

## Help and feedback

- [Ask a question or share an idea](https://github.com/gm64x/guy-vscode/issues/new)
- [Report a bug or request a feature](https://github.com/gm64x/guy-vscode/issues)
- [Read the contribution guide](CONTRIBUTING.md)
- [Review release changes](CHANGELOG.md)
- [Browse the source code](https://github.com/gm64x/guy-vscode)
