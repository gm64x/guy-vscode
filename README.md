<div align="center">

<img src="media/icons/gfc.svg" alt="GUY logo" width="72" height="72">

# GUY

### Graphing Utility for Your code

Visualize Python control flow directly inside Visual Studio Code.

[![VS Code](https://img.shields.io/badge/VS%20Code-%5E1.120.0-007ACC?style=for-the-badge&logo=visual-studio-code&logoColor=white)](https://code.visualstudio.com/)
[![GitHub stars](https://img.shields.io/github/stars/gm64x/guy-vscode?style=for-the-badge&logo=github)](https://github.com/gm64x/guy-vscode/stargazers)
[![License](https://img.shields.io/github/license/gm64x/guy-vscode?style=for-the-badge)](LICENSE.txt)

</div>

GUY parses Python code, builds an interactive control-flow graph (CFG), and connects the graph back to your source code. Use it to understand branching logic, inspect complexity, and explore independent execution paths without leaving VS Code.

## Features

- Generate a CFG from an entire Python file, a selected code range, or the function under the cursor.
- Explore the graph in an interactive preview with zoom, fit, center, and layout controls.
- Switch between simplified and detailed graph views.
- Navigate between graph nodes, edges, functions, independent paths, and source code.
- Inspect cyclomatic complexity, nodes, edges, decisions, and connected components.
- Highlight source code when selecting graph items.
- Get lightweight complexity suggestions and visual warnings for large graphs.
- Understand common Python constructs including `if`/`elif`/`else`, `for`, `while`, `return`, `break`, and `continue`.

## Quick start

### Run locally

Clone the repository, install dependencies, and open it in VS Code:

```sh
git clone https://github.com/gm64x/guy-vscode.git
cd guy-vscode
npm install
npm run compile
```

Press `F5` in VS Code to launch an Extension Development Host with GUY enabled.

### Generate your first graph

1. Open a Python file.
2. Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`).
3. Run **GUY: Generate CFG from File**.

For a focused view, select Python code and run **GUY: Generate CFG from Selection**, or place the cursor inside a function and run **GUY: Generate CFG from Current Function**.

## Commands

| Command | Description |
| --- | --- |
| `GUY: Generate CFG from File` | Builds a graph for the active Python file. |
| `GUY: Generate CFG from Selection` | Builds a graph for the selected Python code. |
| `GUY: Generate CFG from Current Function` | Builds a graph for the function containing the cursor. |
| `GUY: Toggle Simplified/Detailed CFG View` | Switches the current graph between simplified and detailed mode. |

The file command is also available in the Python editor title bar. Selection and current-function commands are available in the Python editor context menu.

## Working with the preview

The CFG preview provides:

- an interactive graph canvas with pan, zoom, fit, center, and reset controls;
- a sidebar for nodes, edges, functions, and independent paths;
- a metrics panel with the cyclomatic complexity formula;
- source navigation and highlighting from graph selections;
- a simplified/detailed view toggle.

## Settings

Configure GUY through **Settings** or `settings.json`:

| Setting | Default | Description |
| --- | ---: | --- |
| `guy.autoOpenPreview` | `true` | Open the CFG preview automatically after generation. |
| `guy.graphLayout` | `top-bottom` | Default graph direction: `top-bottom` or `left-right`. |
| `guy.showMetricsPanel` | `false` | Show the metrics panel in the preview. |
| `guy.highlightCodeOnNodeClick` | `true` | Highlight source code when nodes or edges are selected. |
| `guy.maxNodesBeforeWarning` | `100` | Warn when a graph exceeds this number of nodes. |
| `guy.highComplexityThreshold` | `10` | Complexity threshold for lightweight suggestions. |

## Requirements

- Visual Studio Code `^1.120.0`.
- Python source files (`.py` or `python` language mode).

## Development

```sh
npm install
npm run compile
npm test
```

Create a production bundle with:

```sh
npm run package
```

Example Python inputs are available in [`src/examples`](src/examples).

## Limitations

- CFG generation currently supports Python only.
- Source with syntax errors may produce incomplete graphs because of parser recovery.
- Independent paths are hidden for very large graphs to keep the preview responsive.

## Links

- [Report an issue](https://github.com/gm64x/guy-vscode/issues)
- [Source repository](https://github.com/gm64x/guy-vscode)
