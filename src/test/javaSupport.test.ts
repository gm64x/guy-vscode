import * as assert from "node:assert/strict";
import { ControlFlowNode } from "../core/languages/model";
import { getLanguageParser } from "../core/languages/registry";

suite("Java language support", () => {
  test("covers Java-specific control flow and callables", async () => {
    const source = [
      "class Demo {",
      "  Demo() {}",
      "  int run(int value) {",
      "    outer: for (int item : values) {",
      "      do { if (item == value) continue outer; } while (ready());",
      "      synchronized (this) { assert item > 0; yieldValue(item); }",
      "      if (item < 0) break outer;",
      "    }",
      "    switch (value) { case 1: yield 2; break; default: value++; }",
      "    try { work(); } catch (RuntimeException error) { recover(); } finally { cleanup(); }",
      "    return value;",
      "  }",
      "}",
    ].join("\n");
    const parsed = await getLanguageParser("java").parse(source);
    assert.deepEqual(parsed.functions.map((fn) => fn.name), ["Demo", "run"]);

    const run = parsed.functions[1];
    assert.ok(run);
    const nodes = flatten(run.body);
    assert.ok(
      nodes.some((node) => node.kind === "loop" && node.label.startsWith("do/while")),
    );
    assert.ok(
      nodes.some(
        (node) =>
          node.kind === "if" &&
          node.branches.some((branch) => branch.condition?.includes("case 1")),
      ),
    );
    assert.ok(
      nodes.some(
        (node) =>
          node.kind === "try" &&
          node.handlers.length === 1 &&
          node.finallyBody.length > 0,
      ),
    );
    assert.ok(nodes.some((node) => node.kind === "container" && node.code.startsWith("synchronized")));
    assert.ok(nodes.some((node) => node.kind === "statement" && node.code.startsWith("assert")));
    assert.ok(nodes.some((node) => node.kind === "statement" && node.code.startsWith("yield")));
    assert.ok(
      nodes.some(
        (node) =>
          ["break", "continue"].includes(node.kind) &&
          node.code.includes("outer"),
      ),
    );
  });
});

function flatten(nodes: ControlFlowNode[]): ControlFlowNode[] {
  return nodes.flatMap((node) => [node, ...children(node).flatMap((child) => flatten(child))]);
}

function children(node: ControlFlowNode): ControlFlowNode[][] {
  if (node.kind === "if") {
    return node.branches.map((branch) => branch.body);
  }
  if (node.kind === "try") {
    return [node.body, ...node.handlers.map((handler) => handler.body), node.finallyBody];
  }
  if (node.kind === "loop" || node.kind === "container" || node.kind === "function") {
    return [node.body];
  }
  return [];
}
