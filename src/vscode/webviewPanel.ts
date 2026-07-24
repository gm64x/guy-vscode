import * as vscode from "vscode";
import { CFG } from "../core/types";
import { getWebviewHtml } from "../webview/webviewHtml";

export type WebviewMessage =
  | { type: "NODE_SELECTED"; payload: { nodeId: string } }
  | { type: "EDGE_SELECTED"; payload: { edgeId: string } }
  | { type: "PATH_SELECTED"; payload: { nodeIds: string[]; edgeIds: string[] } }
  | {
      type: "FUNCTION_SELECTED";
      payload: { functionName: string; startLine: number };
    }
  | { type: "TOGGLE_VIEW_MODE" };

export class GuyWebviewPanel {
  private panel: vscode.WebviewPanel | undefined;
  private cfg: CFG | undefined;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly onMessage: (message: WebviewMessage) => void,
  ) {}

  show(cfg: CFG): void {
    this.cfg = cfg;
    const title = getPanelTitle(cfg);

    if (!this.panel) {
      this.panel = vscode.window.createWebviewPanel(
        "guyCfgPreview",
        title,
        vscode.ViewColumn.Beside,
        {
          enableScripts: true,
          retainContextWhenHidden: true,
          localResourceRoots: [this.extensionUri],
        },
      );
      this.panel.iconPath = vscode.Uri.joinPath(
        this.extensionUri,
        "media",
        "icons",
        "gfc.svg",
      );
      this.panel.onDidDispose(() => {
        this.panel = undefined;
      });
      this.panel.webview.onDidReceiveMessage((message: unknown) => {
        if (this.cfg && isValidWebviewMessage(message, this.cfg)) {
          this.onMessage(message);
        }
      });
      this.panel.webview.html = getWebviewHtml(
        this.panel.webview,
        this.extensionUri,
        cfg,
      );
    } else {
      this.panel.title = title;
      void this.panel.webview.postMessage({ type: "CFG_DATA", payload: cfg });
    }

    this.panel.reveal(vscode.ViewColumn.Beside, false);
  }

  postCfg(cfg: CFG): void {
    this.cfg = cfg;
    if (!this.panel) {
      this.show(cfg);
      return;
    }
    void this.panel.webview.postMessage({ type: "CFG_DATA", payload: cfg });
  }

  highlightNode(nodeId: string): void {
    void this.panel?.webview.postMessage({
      type: "HIGHLIGHT_NODE",
      payload: { nodeId },
    });
  }

  loading(): void {
    void this.panel?.webview.postMessage({ type: "LOADING" });
  }

  error(message: string): void {
    void this.panel?.webview.postMessage({
      type: "ERROR",
      payload: { message },
    });
  }
}

export function isValidWebviewMessage(
  message: unknown,
  cfg: CFG,
): message is WebviewMessage {
  if (!isObject(message) || typeof message.type !== "string") {
    return false;
  }

  switch (message.type) {
    case "NODE_SELECTED":
      return hasStringPayload(message, "nodeId") &&
        cfg.nodes.some((node) => node.id === message.payload.nodeId);
    case "EDGE_SELECTED":
      return hasStringPayload(message, "edgeId") &&
        cfg.edges.some((edge) => edge.id === message.payload.edgeId);
    case "PATH_SELECTED":
      return hasPathPayload(message) &&
        message.payload.nodeIds.every((id) =>
          cfg.nodes.some((node) => node.id === id),
        ) &&
        message.payload.edgeIds.every((id) =>
          cfg.edges.some((edge) => edge.id === id),
        );
    case "FUNCTION_SELECTED": {
      const payload = message.payload;
      return isObject(payload) &&
        typeof payload.functionName === "string" &&
        typeof payload.startLine === "number" &&
        Number.isInteger(payload.startLine) &&
        cfg.functions.some(
          (fn) =>
            fn.name === payload.functionName && fn.startLine === payload.startLine,
        );
    }
    case "TOGGLE_VIEW_MODE":
      return !("payload" in message);
    default:
      return false;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function hasStringPayload(
  message: Record<string, unknown>,
  key: string,
): message is Record<string, unknown> & { payload: Record<string, unknown> } {
  return isObject(message.payload) && typeof message.payload[key] === "string";
}

function hasPathPayload(
  message: Record<string, unknown>,
): message is Record<string, unknown> & {
  payload: { nodeIds: string[]; edgeIds: string[] };
} {
  return isObject(message.payload) &&
    Array.isArray(message.payload.nodeIds) &&
    message.payload.nodeIds.every((id): id is string => typeof id === "string") &&
    Array.isArray(message.payload.edgeIds) &&
    message.payload.edgeIds.every((id): id is string => typeof id === "string");
}

function getPanelTitle(cfg: CFG): string {
  const fileName = cfg.sourceMeta.fileName?.split(/[\\/]/).pop() ?? "CFG";
  return `${fileName} | GFC`;
}
