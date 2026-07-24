import * as assert from "node:assert";
import * as vscode from "vscode";
import { CFG } from "../core/types";
import { getWebviewHtml } from "../webview/webviewHtml";

suite("Webview HTML", () => {
  test("uses a nonce and escapes closing script tags in bootstrap data", () => {
    const webview = {
      cspSource: "vscode-webview:",
      asWebviewUri: (uri: vscode.Uri) => uri,
    } as vscode.Webview;
    const cfg = { diagnostics: ['</script><script id="injected">'] } as CFG;

    const html = getWebviewHtml(webview, vscode.Uri.file("/extension"), cfg);
    const cspNonce = html.match(/script-src 'nonce-([^']+)'/)?.[1];
    const scriptTags = [...html.matchAll(/<script\b[^>]*>/g)].map((match) => match[0]);

    assert.ok(cspNonce);
    assert.ok(scriptTags.length > 0);
    for (const scriptTag of scriptTags) {
      const nonces = [...scriptTag.matchAll(/\bnonce="([^"]+)"/g)].map((match) => match[1]);
      assert.deepStrictEqual(nonces, [cspNonce]);
    }
    assert.ok(html.includes('\\u003c/script>\\u003cscript id=\\"injected\\">'));
    assert.ok(!html.includes('</script><script id="injected">'));
  });
});
