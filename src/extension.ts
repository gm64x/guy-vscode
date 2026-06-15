import * as vscode from "vscode";
import { CFGBuilder } from "./core/cfgBuilder";
import { CFG, CFGViewMode } from "./core/types";
import { EditorNavigator } from "./vscode/editorNavigation";
import { GuyWebviewPanel, WebviewMessage } from "./vscode/webviewPanel";

let currentCfg: CFG | undefined;
let currentViewMode: CFGViewMode = "simplified";
let lastFunctionCursor: { line: number; column: number } | undefined;
let lastSelectionOffset: { line: number; column: number } | undefined;
let panel: GuyWebviewPanel;
let navigator: EditorNavigator;

export function activate(context: vscode.ExtensionContext): void {
  const builder = new CFGBuilder();
  navigator = new EditorNavigator();
  panel = new GuyWebviewPanel(context.extensionUri, (message) =>
    handleWebviewMessage(message, builder),
  );

  context.subscriptions.push(
    navigator,
    vscode.commands.registerCommand("guy.generateCfgFromFile", () =>
      generateFromFile(builder),
    ),
    vscode.commands.registerCommand("guy.generateCfgFromSelection", () =>
      generateFromSelection(builder),
    ),
    vscode.commands.registerCommand("guy.generateCfgFromCurrentFunction", () =>
      generateFromCurrentFunction(builder),
    ),
    vscode.commands.registerCommand("guy.toggleGraphDetailMode", () =>
      toggleDetailMode(builder),
    ),
    vscode.window.onDidChangeTextEditorSelection((event) => {
      if (event.textEditor !== vscode.window.activeTextEditor) {
        return;
      }
      if (navigator.isSelectionFromNavigation()) {
        return;
      }
      const node = navigator.findNodeAt(currentCfg, event.selections[0].active);
      if (node) {
        panel.highlightNode(node.id);
      }
    }),
  );
}

export function deactivate(): void {
  navigator?.dispose();
}

async function generateFromFile(builder: CFGBuilder): Promise<void> {
  const editor = getPythonEditor();
  if (!editor) {
    return;
  }

  try {
    panel.loading();
    currentCfg = await builder.generate({
      source: editor.document.getText(),
      fileName: editor.document.fileName,
      mode: "file",
      viewMode: currentViewMode,
      highComplexityThreshold: getHighComplexityThreshold(),
    });
    panel.show(currentCfg);
    showDiagnostics(currentCfg);
  } catch (error) {
    showGenerationError(error);
  }
}

async function generateFromSelection(builder: CFGBuilder): Promise<void> {
  const editor = getPythonEditor();
  if (!editor) {
    return;
  }
  if (editor.selection.isEmpty) {
    void vscode.window.showInformationMessage(
      "Select a Python code range before running Generate CFG from Selection.",
    );
    return;
  }

  lastSelectionOffset = {
    line: editor.selection.start.line,
    column: editor.selection.start.character,
  };

  try {
    panel.loading();
    currentCfg = await builder.generate({
      source: editor.document.getText(editor.selection),
      fileName: editor.document.fileName,
      mode: "selection",
      viewMode: currentViewMode,
      selectionOffset: lastSelectionOffset,
      highComplexityThreshold: getHighComplexityThreshold(),
    });
    panel.show(currentCfg);
    showDiagnostics(currentCfg);
  } catch (error) {
    showGenerationError(error);
  }
}

async function generateFromCurrentFunction(builder: CFGBuilder): Promise<void> {
  const editor = getPythonEditor();
  if (!editor) {
    return;
  }

  lastFunctionCursor = {
    line: editor.selection.active.line,
    column: editor.selection.active.character,
  };

  try {
    panel.loading();
    currentCfg = await builder.generate({
      source: editor.document.getText(),
      fileName: editor.document.fileName,
      mode: "function",
      viewMode: currentViewMode,
      cursor: lastFunctionCursor,
      highComplexityThreshold: getHighComplexityThreshold(),
    });
    panel.show(currentCfg);
    showDiagnostics(currentCfg);
  } catch (error) {
    showGenerationError(error);
  }
}

async function toggleDetailMode(builder: CFGBuilder): Promise<void> {
  currentViewMode =
    currentViewMode === "simplified" ? "detailed" : "simplified";

  if (!currentCfg) {
    return;
  }

  const document = await resolveDocumentForCfg(currentCfg);
  if (!document) {
    void vscode.window.showWarningMessage(
      "Cannot toggle view mode: the source file is not available.",
    );
    return;
  }

  try {
    panel.loading();
    if (currentCfg.sourceMeta.mode === "selection" && lastSelectionOffset) {
      const editor = vscode.window.visibleTextEditors.find(
        (e) => e.document === document,
      );
      if (editor && !editor.selection.isEmpty) {
        currentCfg = await builder.generate({
          source: document.getText(editor.selection),
          fileName: document.fileName,
          mode: "selection",
          viewMode: currentViewMode,
          selectionOffset: {
            line: editor.selection.start.line,
            column: editor.selection.start.character,
          },
          highComplexityThreshold: getHighComplexityThreshold(),
        });
      } else {
        currentCfg = await builder.generate({
          source: document.getText(),
          fileName: document.fileName,
          mode: "file",
          viewMode: currentViewMode,
          highComplexityThreshold: getHighComplexityThreshold(),
        });
      }
    } else if (
      currentCfg.sourceMeta.mode === "function" &&
      lastFunctionCursor
    ) {
      currentCfg = await builder.generate({
        source: document.getText(),
        fileName: document.fileName,
        mode: "function",
        viewMode: currentViewMode,
        cursor: lastFunctionCursor,
        highComplexityThreshold: getHighComplexityThreshold(),
      });
    } else {
      currentCfg = await builder.generate({
        source: document.getText(),
        fileName: document.fileName,
        mode: "file",
        viewMode: currentViewMode,
        highComplexityThreshold: getHighComplexityThreshold(),
      });
    }
    panel.postCfg(currentCfg);
    showDiagnostics(currentCfg);
    void vscode.window.showInformationMessage(
      `GUY graph mode: ${currentViewMode}.`,
    );
  } catch (error) {
    showGenerationError(error);
  }
}

function handleWebviewMessage(
  message: WebviewMessage,
  builder: CFGBuilder,
): void {
  if (message.type === "NODE_SELECTED") {
    void navigator.highlightNode(currentCfg, message.payload.nodeId);
    return;
  }
  if (message.type === "EDGE_SELECTED") {
    void navigator.highlightEdge(currentCfg, message.payload.edgeId);
    return;
  }
  if (message.type === "PATH_SELECTED") {
    void navigator.highlightPath(currentCfg, message.payload.nodeIds);
    return;
  }
  if (message.type === "FUNCTION_SELECTED") {
    void generateFunctionByLine(builder, message.payload.startLine);
    return;
  }
  if (message.type === "TOGGLE_VIEW_MODE") {
    void toggleDetailMode(builder);
  }
}

async function generateFunctionByLine(
  builder: CFGBuilder,
  startLine: number,
): Promise<void> {
  let editor = getPythonEditor(false);
  if (!editor && currentCfg?.sourceMeta.fileName) {
    try {
      const document = await vscode.workspace.openTextDocument(
        vscode.Uri.file(currentCfg.sourceMeta.fileName),
      );
      editor = await vscode.window.showTextDocument(
        document,
        vscode.ViewColumn.One,
        false,
      );
    } catch {
      // ignore
    }
  }
  if (!editor) {
    return;
  }
  const line = editor.document.lineAt(
    Math.min(startLine, editor.document.lineCount - 1),
  );
  editor.selection = new vscode.Selection(line.range.start, line.range.start);
  lastFunctionCursor = {
    line: editor.selection.active.line,
    column: editor.selection.active.character,
  };
  await generateFromCurrentFunction(builder);
}

function getPythonEditor(showMessage = true): vscode.TextEditor | undefined {
  const editor = vscode.window.activeTextEditor;
  const isPython =
    editor?.document.languageId === "python" ||
    editor?.document.fileName.endsWith(".py");
  if (!editor || !isPython) {
    if (showMessage) {
      void vscode.window.showWarningMessage(
        "Open a Python file before running GUY.",
      );
    }
    return undefined;
  }
  return editor;
}

function showDiagnostics(cfg: CFG): void {
  if (cfg.diagnostics.length > 0) {
    void vscode.window.showInformationMessage(cfg.diagnostics[0]);
  }
}

function showGenerationError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  panel.error(message);
  void vscode.window.showWarningMessage(message);
}

async function resolveDocumentForCfg(
  cfg: CFG,
): Promise<vscode.TextDocument | undefined> {
  if (cfg.sourceMeta.fileName) {
    try {
      return await vscode.workspace.openTextDocument(
        vscode.Uri.file(cfg.sourceMeta.fileName),
      );
    } catch {
      // ignore
    }
  }
  const active = getPythonEditor(false);
  return active?.document;
}

function getHighComplexityThreshold(): number {
  return vscode.workspace
    .getConfiguration("guy")
    .get<number>("highComplexityThreshold", 10);
}
