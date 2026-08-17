import { randomBytes } from "node:crypto";
import * as vscode from "vscode";
import { CFG, PreviewState } from "../core/types";

export function getWebviewHtml(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  cfg?: CFG,
  previewState: PreviewState = { sourceLocked: false, updatesPaused: false },
): string {
  const nonce = getNonce();
  const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "dist", "webview", "main.js"));
  const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "dist", "webview", "main.css"));
  const initial = serializeForInlineScript(cfg ?? null);
  const initialPreviewState = serializeForInlineScript(previewState);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>GUY - Graph Your Code</title>
  <link nonce="${nonce}" rel="stylesheet" href="${styleUri}">
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}">window.__GUY_INITIAL_CFG__ = ${initial}; window.__GUY_INITIAL_PREVIEW_STATE__ = ${initialPreviewState};</script>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}

function serializeForInlineScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function getNonce(): string {
  return randomBytes(16).toString("hex");
}
