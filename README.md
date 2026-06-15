# Guy

Guy is a VS Code extension for visualizing Python control-flow graphs (CFGs).
It parses Python code, builds an interactive graph, and shows useful control-flow
metrics such as cyclomatic complexity.

**GUY** stands for **Graphing Utility for Your code**.

## Features

- Generate a CFG from:
  - the whole active Python file;
  - the current editor selection;
  - the Python function under the cursor.
- Preview the graph in an interactive webview powered by React Flow.
- Toggle between simplified and detailed CFG views.
- Navigate between the graph and source code by selecting nodes, edges, functions,
  or independent paths.
- Inspect graph metrics:
  - `V(G)` cyclomatic complexity;
  - nodes;
  - edges;
  - decisions;
  - connected components.
- View independent paths, with limits for large graphs to keep the preview responsive.
- Receive lightweight suggestions when the graph exceeds the configured complexity threshold.
- Analyze common Python control-flow structures including `if`/`elif`/`else`, `for`,
  `while`, `return`, `break`, and `continue`.

## Usage

Open a Python file and run one of the `GUY` commands from the Command Palette.

| Command | Description |
| --- | --- |
| `GUY: Generate CFG from File` | Builds a graph for the active Python file. |
| `GUY: Generate CFG from Selection` | Builds a graph for the selected Python code. |
| `GUY: Generate CFG from Current Function` | Builds a graph for the function containing the cursor. |
| `GUY: Toggle Simplified/Detailed CFG View` | Switches the current graph between simplified and detailed mode. |

The file command is also available from the Python editor title bar. Selection and
current-function commands are available from the Python editor context menu.

## Webview controls

The CFG preview includes:

- a graph canvas with fit, center, reset zoom, zoom in, and zoom out controls;
- a collapsible sidebar with nodes, edges, functions, and independent paths;
- a metrics panel with the cyclomatic complexity formula;
- source highlighting when graph items are selected;
- a simplified/detailed mode toggle in the preview header.

## Extension settings

This extension contributes the following settings:

| Setting | Default | Description |
| --- | --- | --- |
| `guy.autoOpenPreview` | `true` | Open the CFG preview automatically after generation. |
| `guy.graphLayout` | `top-bottom` | Default graph layout direction. Supported values: `top-bottom`, `left-right`. |
| `guy.showMetricsPanel` | `false` | Show the metrics panel in the CFG preview. |
| `guy.highlightCodeOnNodeClick` | `true` | Highlight source code when nodes or edges are selected. |
| `guy.maxNodesBeforeWarning` | `100` | Show a visual complexity warning when the graph exceeds this number of nodes. |
| `guy.highComplexityThreshold` | `10` | Cyclomatic complexity threshold used to show lightweight suggestions. |

## Requirements

- VS Code `^1.120.0`.
- Python source files (`.py` or `python` language mode).

## Development

Install dependencies:

```sh
npm install
```

Run checks and build the extension:

```sh
npm run compile
```

Create a production bundle:

```sh
npm run package
```

Run tests:

```sh
npm test
```

Useful development scripts:

| Script | Description |
| --- | --- |
| `npm run check-types` | Run TypeScript type checking. |
| `npm run lint` | Run ESLint over `src`. |
| `npm run watch` | Run TypeScript and esbuild watchers in parallel. |
| `npm run compile-tests` | Compile test sources. |

## Example files

Example Python inputs are available under `src/examples`:

- `sequential.py`
- `conditional.py`
- `functions.py`
- `loop_break_continue.py`
- `example_simplified_detailed.py`

## Known limitations

- CFG generation currently targets Python only.
- Tree-sitter recovery can produce incomplete graphs when the source contains syntax errors.
- Independent paths are hidden for very large graphs to keep the preview responsive.
