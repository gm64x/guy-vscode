import * as assert from "node:assert/strict";
import { CFGBuilder } from "../core/cfgBuilder";
import {
  LanguageParser,
  ParsedPython,
  PythonFunctionStatement,
  PythonParser,
} from "../core/parser";
import { CFG } from "../core/types";

suite("CFGBuilder parser regressions", () => {
  test("PythonParser implements the exported LanguageParser contract", () => {
    const parser: LanguageParser<ParsedPython, PythonFunctionStatement> =
      new PythonParser();

    assert.ok(parser instanceof PythonParser);
  });

  test("rejects Python source above the analysis limit", async () => {
    await assert.rejects(
      () => generate("x".repeat(2_000_001)),
      /source is too large/,
    );
  });

  test("raise outside try terminates at Exit with an exception edge", async () => {
    const cfg = await generate("raise ValueError()\nprint('unreachable')");
    const raise = nodeByLabel(cfg, "raise ValueError()");
    const following = cfg.nodes.find(
      (candidate) => candidate.label === "print('unreachable')",
    );

    assert.ok(
      cfg.edges.some(
        (edge) =>
          edge.from === raise.id &&
          edge.to === cfg.exitNodeId &&
          edge.label === "exception",
      ),
    );
    assert.ok(
      !following ||
        !cfg.edges.some(
          (edge) => edge.from === raise.id && edge.to === following.id,
        ),
    );
  });

  test("raise inside try reaches a handler through an exception edge", async () => {
    const cfg = await generate(
      "try:\n    raise ValueError()\nexcept ValueError:\n    recover()\nafter()",
    );
    const tryNode = nodeByLabel(cfg, "try");
    const raise = nodeByLabel(cfg, "raise ValueError()");
    const handler = nodeByLabel(cfg, "except ValueError:");
    const recover = nodeByLabel(cfg, "recover()");

    assert.ok(!hasEdge(cfg, tryNode.id, handler.id, "exception"));
    assert.ok(!hasEdge(cfg, tryNode.id, handler.id, "next"));
    assert.ok(hasEdge(cfg, raise.id, handler.id, "exception"));
    assert.ok(hasEdge(cfg, raise.id, cfg.exitNodeId, "exception"));
    assert.ok(hasEdge(cfg, handler.id, recover.id, "next"));
    assert.ok(
      cfg.diagnostics.some((diagnostic) =>
        diagnostic.includes("type-agnostic"),
      ),
    );
  });

  test("catch-all handler ends the unhandled exception path", async () => {
    const cfg = await generate(
      "try:\n    raise ValueError()\nexcept:\n    recover()",
    );
    const raise = nodeByLabel(cfg, "raise ValueError()");
    const handler = nodeByLabel(cfg, "except:");

    assert.ok(hasEdge(cfg, raise.id, handler.id, "exception"));
    assert.ok(!hasEdge(cfg, raise.id, cfg.exitNodeId, "exception"));
  });

  test("return runs nested finally blocks before exiting", async () => {
    const cfg = await generateFunction(
      "def run():\n    try:\n        try:\n            return result()\n        finally:\n            inner_cleanup()\n    finally:\n        outer_cleanup()",
    );
    const returnNode = nodeByLabel(cfg, "return result()");
    const innerCleanup = nodeByLabel(cfg, "inner_cleanup()");
    const outerCleanup = nodeByLabel(cfg, "outer_cleanup()");

    assert.ok(hasEdge(cfg, returnNode.id, innerCleanup.id, "next"));
    assert.ok(hasEdge(cfg, innerCleanup.id, outerCleanup.id, "next"));
    assert.ok(hasEdge(cfg, outerCleanup.id, cfg.exitNodeId, "return"));
    assert.ok(!hasEdge(cfg, returnNode.id, cfg.exitNodeId, "return"));
  });

  test("raise keeps a possible handler and an unhandled path through finally", async () => {
    const cfg = await generate(
      "try:\n    raise ValueError()\nexcept TypeError:\n    recover()\nfinally:\n    cleanup()",
    );
    const raise = nodeByLabel(cfg, "raise ValueError()");
    const handler = nodeByLabel(cfg, "except TypeError:");
    const cleanupNodes = cfg.nodes.filter((node) => node.label === "cleanup()");

    assert.ok(hasEdge(cfg, raise.id, handler.id, "exception"));
    assert.ok(!hasEdge(cfg, raise.id, cfg.exitNodeId, "exception"));
    assert.ok(
      cleanupNodes.some(
        (cleanup) =>
          hasEdge(cfg, raise.id, cleanup.id, "next") &&
          hasEdge(cfg, cleanup.id, cfg.exitNodeId, "exception"),
      ),
    );
  });

  test("break runs finally before leaving its loop", async () => {
    const cfg = await generate(
      "while ready():\n    try:\n        break\n    finally:\n        cleanup()\nafter()",
    );
    const breakNode = nodeByLabel(cfg, "break");
    const cleanup = nodeByLabel(cfg, "cleanup()");
    const afterLoop = nodeByLabel(cfg, "after loop");

    assert.ok(hasEdge(cfg, breakNode.id, cleanup.id, "next"));
    assert.ok(hasEdge(cfg, cleanup.id, afterLoop.id, "break"));
    assert.ok(!hasEdge(cfg, breakNode.id, afterLoop.id, "break"));
  });

  test("continue runs finally before repeating its loop", async () => {
    const cfg = await generate(
      "while ready():\n    try:\n        continue\n    finally:\n        cleanup()",
    );
    const loop = nodeByLabel(cfg, "while ready()");
    const continueNode = nodeByLabel(cfg, "continue");
    const cleanup = nodeByLabel(cfg, "cleanup()");

    assert.ok(hasEdge(cfg, continueNode.id, cleanup.id, "next"));
    assert.ok(hasEdge(cfg, cleanup.id, loop.id, "continue"));
    assert.ok(!hasEdge(cfg, continueNode.id, loop.id, "continue"));
  });

  test("try else and finally preserve normal and exceptional flow", async () => {
    const cfg = await generate(
      "try:\n    work()\nexcept ValueError:\n    recover()\nelse:\n    success()\nfinally:\n    cleanup()\nafter()",
    );
    const tryNode = nodeByLabel(cfg, "try");
    const work = nodeByLabel(cfg, "work()");
    const handler = nodeByLabel(cfg, "except ValueError:");
    const recover = nodeByLabel(cfg, "recover()");
    const success = nodeByLabel(cfg, "success()");
    const cleanup = nodeByLabel(cfg, "cleanup()");
    const after = nodeByLabel(cfg, "after()");

    assert.ok(!hasEdge(cfg, tryNode.id, handler.id, "exception"));
    assert.ok(hasEdge(cfg, work.id, success.id, "next"));
    assert.ok(!cfg.edges.some((edge) => edge.from === handler.id && edge.to === success.id));
    assert.ok(hasEdge(cfg, success.id, cleanup.id, "next"));
    assert.ok(hasEdge(cfg, recover.id, cleanup.id, "next"));
    assert.ok(reaches(cfg, cleanup.id, after.id));
  });

  test("with body remains represented", async () => {
    const cfg = await generate("with resource() as value:\n    use(value)");

    nodeByLabel(cfg, "use(value)");
  });

  test("loop else runs on exhaustion while break skips it", async () => {
    const cfg = await generate(
      "for x in xs:\n    if stop(x):\n        break\nelse:\n    exhausted()\nafter()",
    );
    const loop = nodeByLabel(cfg, "for x in xs");
    const breakNode = nodeByLabel(cfg, "break");
    const elseNode = nodeByLabel(cfg, "exhausted()");
    const afterLoop = nodeByLabel(cfg, "after loop");

    assert.ok(
      cfg.edges.some(
        (edge) => edge.from === loop.id && edge.to === elseNode.id && edge.label === "false",
      ),
    );
    assert.ok(
      cfg.edges.some(
        (edge) =>
          edge.from === breakNode.id &&
          edge.to === afterLoop.id &&
          edge.label === "break",
      ),
    );
    assert.ok(!cfg.edges.some((edge) => edge.from === breakNode.id && edge.to === elseNode.id));
  });

  test("while else runs on exhaustion", async () => {
    const cfg = await generate(
      "while ready():\n    work()\nelse:\n    exhausted()",
    );
    const loop = nodeByLabel(cfg, "while ready()");
    const elseNode = nodeByLabel(cfg, "exhausted()");

    assert.ok(
      cfg.edges.some(
        (edge) => edge.from === loop.id && edge.to === elseNode.id && edge.label === "false",
      ),
    );
  });

  test("for label contains a single for prefix", async () => {
    const cfg = await generate("for x in xs:\n    consume(x)");

    nodeByLabel(cfg, "for x in xs");
    assert.ok(!cfg.nodes.some((node) => node.label === "for for x in xs"));
  });
});

async function generate(source: string): Promise<CFG> {
  return new CFGBuilder().generate({
    source,
    mode: "file",
    viewMode: "detailed",
  });
}

async function generateFunction(source: string): Promise<CFG> {
  return new CFGBuilder().generate({
    source,
    mode: "function",
    viewMode: "detailed",
    cursor: { line: 1, column: 8 },
  });
}

function nodeByLabel(cfg: CFG, label: string) {
  const node = cfg.nodes.find((candidate) => candidate.label === label);
  assert.ok(node, `Expected CFG node ${JSON.stringify(label)}`);
  return node;
}

function hasEdge(
  cfg: CFG,
  from: string,
  to: string,
  label: CFG["edges"][number]["label"],
): boolean {
  return cfg.edges.some(
    (edge) => edge.from === from && edge.to === to && edge.label === label,
  );
}

function reaches(cfg: CFG, from: string, to: string): boolean {
  const seen = new Set<string>();
  const pending = [from];
  while (pending.length > 0) {
    const current = pending.pop()!;
    if (current === to) {
      return true;
    }
    if (seen.has(current)) {
      continue;
    }
    seen.add(current);
    pending.push(
      ...cfg.edges
        .filter((edge) => edge.from === current)
        .map((edge) => edge.to),
    );
  }
  return false;
}
