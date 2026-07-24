import * as assert from "node:assert/strict";
import { isValidWebviewMessage } from "../vscode/webviewPanel";
import { CFG } from "../core/types";

suite("Webview message validation", () => {
  const cfg = {
    nodes: [{ id: "n1" }],
    edges: [{ id: "e1" }],
    functions: [{ name: "run", startLine: 3 }],
  } as CFG;

  test("accepts valid selections and rejects forged identifiers", () => {
    assert.equal(
      isValidWebviewMessage(
        { type: "NODE_SELECTED", payload: { nodeId: "n1" } },
        cfg,
      ),
      true,
    );
    assert.equal(
      isValidWebviewMessage(
        { type: "NODE_SELECTED", payload: { nodeId: "forged" } },
        cfg,
      ),
      false,
    );
    assert.equal(
      isValidWebviewMessage(
        { type: "PATH_SELECTED", payload: { nodeIds: ["n1"], edgeIds: ["e1"] } },
        cfg,
      ),
      true,
    );
  });

  test("rejects malformed function and toggle messages", () => {
    assert.equal(
      isValidWebviewMessage(
        { type: "FUNCTION_SELECTED", payload: { functionName: "run", startLine: -1 } },
        cfg,
      ),
      false,
    );
    assert.equal(
      isValidWebviewMessage(
        { type: "FUNCTION_SELECTED", payload: { functionName: "run", startLine: 99 } },
        cfg,
      ),
      false,
    );
    assert.equal(
      isValidWebviewMessage({ type: "TOGGLE_VIEW_MODE", payload: {} }, cfg),
      false,
    );
    assert.equal(isValidWebviewMessage(null, cfg), false);
  });
});
