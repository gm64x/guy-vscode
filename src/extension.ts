import * as vscode from "vscode";
import { CFGBuilder } from "./core/cfgBuilder";
import { CFG, CFGSourceMode, CFGViewMode, SourcePosition } from "./core/types";
import { getLanguageDefinition, getSupportedLanguageNames, resolveSupportedLanguage } from "./core/languages/registry";
import { EditorNavigator } from "./vscode/editorNavigation";
import { GuyWebviewPanel, WebviewMessage } from "./vscode/webviewPanel";

interface GraphSource {
  uri: vscode.Uri;
  mode: CFGSourceMode;
  cursor?: SourcePosition;
  selection?: vscode.Range;
  snapshot?: string;
}

let currentCfg: CFG | undefined;
let currentSource: GraphSource | undefined;
let currentViewMode: CFGViewMode = "simplified";
let sourceLocked = false;
let updatesPaused = false;
let generationRevision = 0;
let refreshTimer: ReturnType<typeof setTimeout> | undefined;
let panel: GuyWebviewPanel;
let navigator: EditorNavigator;

export function activate(context: vscode.ExtensionContext): void {
  const builder = new CFGBuilder();
  navigator = new EditorNavigator();
  panel = new GuyWebviewPanel(context.extensionUri, (message) =>
    handleWebviewMessage(message, builder),
  );
  updatePreviewState();

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
      const node = currentCfg?.sourceMeta.fileName === event.textEditor.document.fileName
        ? navigator.findNodeAt(currentCfg, event.selections[0].active)
        : undefined;
      if (node) {
        panel.highlightNode(node.id);
      }
    }),
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (panel.isOpen && !updatesPaused && currentSource?.uri.toString() === event.document.uri.toString()) {
        scheduleRefresh(builder);
      }
    }),
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (!panel.isOpen || !currentSource || sourceLocked || updatesPaused || !editor || !isSupportedDocument(editor.document)) {
        return;
      }
      if (currentSource?.uri.toString() !== editor.document.uri.toString()) {
        void generateSource(builder, { uri: editor.document.uri, mode: "file" }, false, false, editor.document);
      }
    }),
  );
}

export function deactivate(): void {
  if (refreshTimer) {
    clearTimeout(refreshTimer);
  }
  navigator?.dispose();
}

async function generateFromFile(builder: CFGBuilder): Promise<void> {
  const editor = getSupportedEditor();
  if (!editor) {
    return;
  }
  await generateSource(
    builder,
    { uri: editor.document.uri, mode: "file" },
    true,
    true,
    editor.document,
  );
}

async function generateFromSelection(builder: CFGBuilder): Promise<void> {
  const editor = getSupportedEditor();
  if (!editor) {
    return;
  }
  if (editor.selection.isEmpty) {
    const language = resolveSupportedLanguage(editor.document.languageId, editor.document.fileName)!;
    void vscode.window.showInformationMessage(
      `Select a ${getLanguageDefinition(language).displayName} code range before running Generate CFG from Selection.`,
    );
    return;
  }

  await generateSource(
    builder,
    {
      uri: editor.document.uri,
      mode: "selection",
      selection: new vscode.Range(editor.selection.start, editor.selection.end),
    },
    true,
    true,
    editor.document,
  );
}

async function generateFromCurrentFunction(builder: CFGBuilder): Promise<void> {
  const editor = getSupportedEditor();
  if (!editor) {
    return;
  }

  await generateSource(
    builder,
    {
      uri: editor.document.uri,
      mode: "function",
      cursor: {
        line: editor.selection.active.line,
        column: editor.selection.active.character,
      },
    },
    true,
    true,
    editor.document,
  );
}

async function toggleDetailMode(builder: CFGBuilder): Promise<void> {
  if (!currentCfg || !currentSource) {
    return;
  }

  const nextViewMode = currentViewMode === "simplified" ? "detailed" : "simplified";
  const updated = await generateSource(
    builder,
    currentSource,
    false,
    true,
    undefined,
    nextViewMode,
  );
  if (updated) {
    void vscode.window.showInformationMessage(
      `GUY graph mode: ${nextViewMode}.`,
    );
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
    return;
  }
  if (message.type === "TOGGLE_SOURCE_LOCK") {
    sourceLocked = !sourceLocked;
    updatePreviewState();
    if (!sourceLocked) {
      followActiveEditor(builder);
    }
    return;
  }
  if (message.type === "TOGGLE_LIVE_UPDATES") {
    updatesPaused = !updatesPaused;
    if (updatesPaused) {
      generationRevision++;
      if (refreshTimer) {
        clearTimeout(refreshTimer);
        refreshTimer = undefined;
      }
      if (currentCfg) {
        panel.postCfg(currentCfg);
      }
    }
    updatePreviewState();
    if (!updatesPaused && currentSource) {
      void generateSource(builder, currentSource, false, false);
    }
  }
}

async function generateFunctionByLine(
  builder: CFGBuilder,
  startLine: number,
): Promise<void> {
  let editor: vscode.TextEditor | undefined;
  if (currentCfg?.sourceMeta.fileName) {
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
  if (!editor) {editor = getSupportedEditor(false);}
  if (!editor) {
    return;
  }
  const line = editor.document.lineAt(
    Math.min(startLine, editor.document.lineCount - 1),
  );
  editor.selection = new vscode.Selection(line.range.start, line.range.start);
  await generateFromCurrentFunction(builder);
}

function getSupportedEditor(showMessage = true): vscode.TextEditor | undefined {
  const editor = vscode.window.activeTextEditor;
  const language = resolveSupportedLanguage(editor?.document.languageId, editor?.document.fileName);
  if (!editor || !language) {
    if (showMessage) {
      void vscode.window.showWarningMessage(
        `Open a ${formatLanguageNames(getSupportedLanguageNames())} file before running GUY.`,
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

function showGenerationError(error: unknown, notify = true): void {
  if (!notify) {
    return;
  }
  const message = error instanceof Error ? error.message : String(error);
  panel.error(message);
  void vscode.window.showWarningMessage(message);
}


function getHighComplexityThreshold(): number {
  return vscode.workspace
    .getConfiguration("guy")
    .get<number>("highComplexityThreshold", 10);
}

function formatLanguageNames(names: string[]): string {
  return names.length < 2
    ? names.join("")
    : `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}`;
}

function updatePanel(cfg: CFG): void {
  if (getSetting("autoOpenPreview", true)) {
    panel.show(cfg);
  } else {
    panel.postCfg(cfg);
  }
}

async function generateSource(
  builder: CFGBuilder,
  source: GraphSource,
  reveal: boolean,
  notify: boolean,
  openDocument?: vscode.TextDocument,
  viewMode: CFGViewMode = currentViewMode,
): Promise<boolean> {
  const revision = ++generationRevision;
  if (reveal || notify) {
    panel.loading();
  }

  try {
    const document = openDocument ?? await vscode.workspace.openTextDocument(source.uri);
    const language = resolveSupportedLanguage(document.languageId, document.fileName);
    if (!language) {
      return false;
    }
    const selection = source.mode === "selection" ? source.selection : undefined;
    const sourceText = updatesPaused && source.snapshot !== undefined
      ? source.snapshot
      : selection ? document.getText(selection) : document.getText();
    const cfg = await builder.generate({
      source: sourceText,
      language,
      fileName: document.fileName,
      mode: source.mode,
      viewMode,
      cursor: source.cursor,
      selectionOffset: selection
        ? { line: selection.start.line, column: selection.start.character }
        : undefined,
      highComplexityThreshold: getHighComplexityThreshold(),
      ...getDisplaySettings(),
    });
    if (revision !== generationRevision) {
      return false;
    }
    currentCfg = cfg;
    currentSource = { ...source, snapshot: sourceText };
    currentViewMode = viewMode;
    if (reveal) {
      updatePanel(cfg);
    } else {
      panel.postCfg(cfg);
    }
    if (notify) {
      showDiagnostics(cfg);
    }
    return true;
  } catch (error) {
    if (revision === generationRevision) {
      showGenerationError(error, notify);
    }
    return false;
  }
}

function scheduleRefresh(builder: CFGBuilder): void {
  if (refreshTimer) {
    clearTimeout(refreshTimer);
  }
  refreshTimer = setTimeout(() => {
    refreshTimer = undefined;
    if (panel.isOpen && currentSource && !updatesPaused) {
      void generateSource(builder, currentSource, false, false);
    }
  }, 300);
}

function followActiveEditor(builder: CFGBuilder): void {
  if (updatesPaused) {
    return;
  }
  const editor = vscode.window.activeTextEditor;
  if (!editor || !isSupportedDocument(editor.document)) {
    return;
  }
  if (currentSource?.uri.toString() !== editor.document.uri.toString()) {
    void generateSource(
      builder,
      { uri: editor.document.uri, mode: "file" },
      false,
      false,
      editor.document,
    );
  }
}

function isSupportedDocument(document: vscode.TextDocument): boolean {
  return resolveSupportedLanguage(document.languageId, document.fileName) !== undefined;
}

function updatePreviewState(): void {
  panel.setPreviewState({ sourceLocked, updatesPaused });
}

function getSetting<T>(key: string, fallback: T): T {
  return vscode.workspace.getConfiguration("guy").get<T>(key, fallback);
}

function getDisplaySettings() {
  return {
    showMetricsPanel: getSetting("showMetricsPanel", true),
    maxNodesBeforeWarning: getSetting("maxNodesBeforeWarning", 100),
    graphLayout: getSetting<"top-bottom" | "left-right">("graphLayout", "top-bottom"),
  };
}
