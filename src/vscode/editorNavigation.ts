import * as vscode from "vscode";
import { CFG, CFGEdge, CFGNode } from "../core/types";

export class EditorNavigator {
  private ignoreSelectionUntil = 0;
  private readonly NAVIGATION_TIMEOUT_MS = 800;
  private clearDecorationsTimeout: ReturnType<typeof setTimeout> | undefined;
  private decorationType = vscode.window.createTextEditorDecorationType({
    backgroundColor: new vscode.ThemeColor("editor.findMatchHighlightBackground"),
    border: "1px solid",
    borderColor: new vscode.ThemeColor("editor.findMatchBorder")
  });

  async highlightNode(cfg: CFG | undefined, nodeId: string): Promise<void> {
    if (!cfg || !vscode.workspace.getConfiguration("guy").get("highlightCodeOnNodeClick", true)) return;
    const node = cfg?.nodes.find((item) => item.id === nodeId);
    if (!node) {
      return;
    }
    await this.highlightRanges(cfg, [node]);
  }

  async highlightEdge(cfg: CFG | undefined, edgeId: string): Promise<void> {
    if (!cfg || !vscode.workspace.getConfiguration("guy").get("highlightCodeOnNodeClick", true)) return;
    const edge = cfg?.edges.find((item) => item.id === edgeId);
    if (!edge) {
      return;
    }
    const ranges = [cfg?.nodes.find((node) => node.id === edge.from), cfg?.nodes.find((node) => node.id === edge.to)].filter(
      (node): node is CFGNode => Boolean(node)
    );
    await this.highlightRanges(cfg, ranges);
  }

  async highlightPath(cfg: CFG | undefined, nodeIds: string[]): Promise<void> {
    if (!cfg || !vscode.workspace.getConfiguration("guy").get("highlightCodeOnNodeClick", true)) {
      return;
    }
    const idSet = new Set(nodeIds);
    const ranges = cfg.nodes.filter((node) => idSet.has(node.id));
    await this.highlightRanges(cfg, ranges);
  }

  findNodeAt(cfg: CFG | undefined, position: vscode.Position): CFGNode | undefined {
    if (!cfg) {
      return undefined;
    }
    return cfg.nodes
      .filter((node) => containsPosition(node, position))
      .sort((a, b) => rangeSize(a) - rangeSize(b))[0];
  }

  dispose(): void {
    this.decorationType.dispose();
  }

  isSelectionFromNavigation(): boolean {
    return Date.now() < this.ignoreSelectionUntil;
  }

  private async highlightRanges(cfg: CFG | undefined, nodes: CFGNode[]): Promise<void> {
    const editor = await this.resolveEditor(cfg);
    if (!editor || nodes.length === 0) {
      return;
    }

    const ranges = nodes.map(toRange);
    editor.setDecorations(this.decorationType, ranges);
    this.ignoreSelectionUntil = Date.now() + this.NAVIGATION_TIMEOUT_MS;
    editor.selection = new vscode.Selection(ranges[0].start, ranges[0].start);
    editor.revealRange(ranges[0], vscode.TextEditorRevealType.InCenterIfOutsideViewport);

    if (this.clearDecorationsTimeout) {
      clearTimeout(this.clearDecorationsTimeout);
    }
    this.clearDecorationsTimeout = setTimeout(() => {
      editor.setDecorations(this.decorationType, []);
    }, 1800);
  }

  private async resolveEditor(cfg: CFG | undefined): Promise<vscode.TextEditor | undefined> {
    const active = vscode.window.activeTextEditor;
    if (active && isEditorForCfg(active, cfg)) {
      return active;
    }

    const fileName = cfg?.sourceMeta.fileName;
    if (!fileName) {
      return active;
    }

    const visible = vscode.window.visibleTextEditors.find((editor) => isEditorForCfg(editor, cfg));
    if (visible) {
      return visible;
    }

    try {
      const document = await vscode.workspace.openTextDocument(vscode.Uri.file(fileName));
      return await vscode.window.showTextDocument(document, vscode.ViewColumn.One, false);
    } catch {
      return undefined;
    }
  }
}

function isEditorForCfg(editor: vscode.TextEditor, cfg: CFG | undefined): boolean {
  const fileName = cfg?.sourceMeta.fileName;
  if (!fileName) {
    return editor.document.languageId === "python" || editor.document.fileName.endsWith(".py");
  }
  return editor.document.fileName === fileName;
}

function toRange(node: CFGNode): vscode.Range {
  return new vscode.Range(
    new vscode.Position(node.startLine, node.startColumn),
    new vscode.Position(node.endLine, Math.max(node.endColumn, node.startColumn + 1))
  );
}

function containsPosition(node: CFGNode, position: vscode.Position): boolean {
  if (position.line < node.startLine || position.line > node.endLine) {
    return false;
  }
  if (position.line === node.startLine && position.character < node.startColumn) {
    return false;
  }
  if (position.line === node.endLine && position.character > node.endColumn) {
    return false;
  }
  return true;
}

function rangeSize(node: CFGNode): number {
  return (node.endLine - node.startLine) * 1000 + node.endColumn - node.startColumn;
}
