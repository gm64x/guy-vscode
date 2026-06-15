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

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly onMessage: (message: WebviewMessage) => void,
  ) {}

  show(cfg: CFG): void {
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
      this.panel.webview.onDidReceiveMessage((message: WebviewMessage) =>
        this.onMessage(message),
      );
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

function getPanelTitle(cfg: CFG): string {
  const fileName = cfg.sourceMeta.fileName?.split(/[\\/]/).pop() ?? "CFG";
  return `${fileName} | GFC`;
}
