import * as assert from "assert";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";
import { CFG } from "../core/types";
import { EditorNavigator } from "../vscode/editorNavigation";

suite("Editor navigation", () => {
  test("does not navigate the active editor when the CFG source cannot be opened", async () => {
    const document = await vscode.workspace.openTextDocument({
      content: "first\nsecond\nthird",
      language: "python"
    });
    const editor = await vscode.window.showTextDocument(document);
    const originalSelection = new vscode.Selection(2, 0, 2, 0);
    editor.selection = originalSelection;

    const cfg = {
      nodes: [
        {
          id: "node-1",
          label: "first",
          kind: "statement",
          code: "first",
          startLine: 0,
          startColumn: 0,
          endLine: 0,
          endColumn: 5
        }
      ],
      edges: [],
      entryNodeId: "node-1",
      exitNodeId: "node-1",
      metrics: {
        nodeCount: 1,
        edgeCount: 0,
        decisionCount: 0,
        connectedComponents: 1,
        cyclomaticComplexity: 1,
        simplifiedCyclomaticComplexity: 1
      },
      independentPaths: [],
      analysis: {
        highComplexityThreshold: 10,
        suggestions: [],
        independentPathLimitReason: undefined,
        showMetricsPanel: false,
        maxNodesBeforeWarning: 100,
        graphLayout: "top-bottom"
      },
      sourceMeta: {
        mode: "file",
        fileName: path.join(os.tmpdir(), `guy-missing-${Date.now()}.py`),
        language: "python",
        viewMode: "simplified",
        generatedAt: new Date().toISOString()
      },
      functions: [],
      diagnostics: []
    } satisfies CFG;
    const navigator = new EditorNavigator();

    try {
      await navigator.highlightNode(cfg, "node-1");
      assert.ok(editor.selection.isEqual(originalSelection));
    } finally {
      navigator.dispose();
      await vscode.commands.executeCommand("workbench.action.closeActiveEditor");
    }
  });
});
