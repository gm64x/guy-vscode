<div align="center">

# GUY

### Graphing Utility for Your code

Visualize control flow for Python, Java, PHP, C, Go, and Rust directly in Visual Studio Code.

[![VS Code](https://img.shields.io/badge/VS%20Code-%5E1.120.0-007ACC?style=for-the-badge&logo=visual-studio-code&logoColor=white)](https://code.visualstudio.com/)
[![GitHub stars](https://img.shields.io/github/stars/gm64x/guy-vscode?style=for-the-badge&logo=github)](https://github.com/gm64x/guy-vscode/stargazers)
[![License](https://img.shields.io/github/license/gm64x/guy-vscode?style=for-the-badge)](LICENSE.txt)

</div>

GUY uses Tree-sitter WASM to build an interactive control-flow graph (CFG) and connect it back to source code. Use it to inspect branching, cyclomatic complexity, and independent execution paths without leaving the editor.

## Supported languages and coverage

GUY supports these languages:

- Python (`.py`)
- Java (`.java`)
- PHP (`.php`)
- C (`.c`, plus `.h` when VS Code identifies the document as C)
- Go (`.go`)
- Rust (`.rs`)

The initial cross-language coverage includes functions, methods and constructors; `if`/`else-if`/`else`; `for`, `foreach`, and enhanced `for`; `while`; `return`; `break`; `continue`; and `try`/`catch`/`finally`/`throw` where the language provides them. Python also retains `with`, `raise`, and loop `else` behavior.

## Features

- Generate a CFG from an entire file, a selected range, or the callable under the cursor.
- Refresh the graph automatically while editing or switching between supported files.
- Lock the preview to one file or pin the current graph version independently.
- Switch between simplified and detailed graph views.
- Navigate from graph nodes, edges, callables, and paths to source ranges.
- Inspect nodes, edges, decisions, connected components, and cyclomatic complexity.
- Highlight source code and show lightweight warnings for large or complex graphs.
- Recover a partial CFG from many syntax errors, with a diagnostic when recovery was needed.

## Quick start

```sh
git clone https://github.com/gm64x/guy-vscode.git
cd guy-vscode
mise install
mise exec -- npm install
mise exec -- npm run compile
```

Press `F5` in VS Code to launch an Extension Development Host. Open a supported source file and run **GUY: Generate CFG from File** from the Command Palette or editor title bar.

For a focused graph, select code and run **GUY: Generate CFG from Selection**, or place the cursor inside a function, method, or constructor and run **GUY: Generate CFG from Current Function**.

## Commands

| Command | Description |
| --- | --- |
| `GUY: Generate CFG from File` | Builds a graph for the active supported file. |
| `GUY: Generate CFG from Selection` | Builds a graph for the selected code. |
| `GUY: Generate CFG from Current Function` | Builds a graph for the callable containing the cursor. |
| `GUY: Toggle Simplified/Detailed CFG View` | Switches the current graph detail mode. |

## Settings

| Setting | Default | Description |
| --- | ---: | --- |
| `guy.autoOpenPreview` | `true` | Open the CFG preview automatically after generation. |
| `guy.graphLayout` | `top-bottom` | Default graph direction: `top-bottom` or `left-right`. |
| `guy.showMetricsPanel` | `true` | Show the metrics panel in the preview. |
| `guy.highlightCodeOnNodeClick` | `true` | Highlight source code when graph items are selected. |
| `guy.maxNodesBeforeWarning` | `100` | Warn when a graph exceeds this number of nodes. |
| `guy.highComplexityThreshold` | `10` | Complexity threshold for suggestions. |

## Requirements and development

- Visual Studio Code `^1.120.0`.
- Node.js 22, configured locally by `mise.toml` (`mise install`).
- No language runtime is required for CFG generation; parsers run through `web-tree-sitter` and bundled grammar WASMs.

After activating mise in the shell, the regular npm commands are available:

```sh
npm install
npm run check-types
npm run lint
npm run compile-tests
npm run compile
npm test
```

Create a production bundle with `npm run package`, or build the installable extension with `npm run package:vsix`. The `.vsix` file is written to the repository root.

### Adding another language

1. Install its official `tree-sitter-*` grammar package.
2. Create an adapter that converts grammar nodes to the neutral control-flow IR.
3. Register its metadata, extension rules, display name, and VS Code language ID.
4. Enable its editor menu conditions.
5. Add real WASM-backed fixtures for file, selection, and callable modes.

The shared CFG builder and automatic WASM asset discovery do not need language-specific changes.

## Limitations

- `goto`/labels and language-specific jump semantics remain represented as source-ranged statements; `switch`/`case` and `match` are expanded into CFG branches where supported. Java `yield`, PHP `match` arms, and Rust/Go-specific constructs use the closest shared CFG representation.
- Exception matching is type-agnostic, so exception edges represent possible handlers and any possible unhandled path.
- Syntax recovery can produce an incomplete graph.
- Independent paths are limited for very large graphs to keep the preview responsive.

## Links

- [Report an issue](https://github.com/gm64x/guy-vscode/issues)
- [Source repository](https://github.com/gm64x/guy-vscode)
