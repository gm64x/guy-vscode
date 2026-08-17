import * as assert from "node:assert/strict";
import { CFGBuilder } from "../core/cfgBuilder";
import { SupportedLanguage } from "../core/languages/model";
import {
  getSupportedLanguageNames,
  resolveSupportedLanguage,
} from "../core/languages/registry";
import { CFG } from "../core/types";

suite("Multi-language support", () => {
  test("resolves language ids and safe extension fallbacks", () => {
    assert.deepEqual(getSupportedLanguageNames(), ["Python", "Java", "PHP", "C", "Go", "Rust"]);
    assert.equal(resolveSupportedLanguage("python", "x.py"), "python");
    assert.equal(resolveSupportedLanguage("java", "x.java"), "java");
    assert.equal(resolveSupportedLanguage("php", "x.php"), "php");
    assert.equal(resolveSupportedLanguage("c", "x.h"), "c");
    assert.equal(resolveSupportedLanguage("go", "x.go"), "go");
    assert.equal(resolveSupportedLanguage("rust", "x.rs"), "rust");
    assert.equal(resolveSupportedLanguage(undefined, "x.go"), "go");
    assert.equal(resolveSupportedLanguage(undefined, "x.rs"), "rust");
    assert.equal(resolveSupportedLanguage("cpp", "x.h"), undefined);
    assert.equal(resolveSupportedLanguage(undefined, "x.h"), undefined);
    assert.equal(resolveSupportedLanguage(undefined, "x.c"), "c");
    assert.equal(resolveSupportedLanguage("cpp", "x.cpp"), undefined);
  });

  test("records the requested language for all supported languages", async () => {
    for (const language of ["python", "java", "php", "c", "go", "rust"] as const) {
      const cfg = await generate(language, "", "file");
      assert.equal(cfg.sourceMeta.language, language);
    }
  });

  test("Java recognizes constructors, methods, and parity control flow", async () => {
    const source = [
      "class Demo {",
      "  Demo() { init(); }",
      "  int run(int n) {",
      "    for (int x : values) { if (x > n) continue; consume(x); }",
      "    while (n-- > 0) { if (n == 2) break; tick(); }",
      "    if (n > 0) return n; else if (n == 0) return 0; else return -1;",
      "  }",
      "}",
    ].join("\n");
    const file = await generate("java", source, "file");
    assert.deepEqual(file.functions.map((fn) => fn.name), ["Demo", "run"]);

    const cfg = await generateFunction("java", source, "run");
    assertParityEdges(cfg);
    assert.ok(cfg.nodes.filter((node) => node.kind === "condition").length >= 4);
    assert.equal(cfg.sourceMeta.functionName, "run");
  });

  test("Java and PHP accept a cursor in declaration-line whitespace", async () => {
    const fixtures: Array<[SupportedLanguage, string, number]> = [
      ["java", "class Demo {\n  int run() { return 1; }\n}", 1],
      ["php", "<?php\nfunction run() { return 1; }", 1],
    ];
    for (const [language, source, line] of fixtures) {
      const cfg = await new CFGBuilder().generate({
        language,
        source,
        mode: "function",
        viewMode: "detailed",
        cursor: { line, column: 0 },
      });
      assert.equal(cfg.sourceMeta.functionName, "run");
    }
  });

  test("PHP recognizes functions, methods, foreach, and parity control flow", async () => {
    const source = [
      "<?php",
      "function helper() { return 1; }",
      "class Demo {",
      "  function run($values) {",
      "    foreach ($values as $value) { if ($value) continue; consume($value); }",
      "    while (ready()) { if (stop()) break; tick(); }",
      "    if (count($values) > 1) return 1; elseif (count($values) === 1) return 0; else return -1;",
      "  }",
      "}",
    ].join("\n");
    const file = await generate("php", source, "file");
    assert.deepEqual(file.functions.map((fn) => fn.name), ["helper", "run"]);

    const cfg = await generateFunction("php", source, "run");
    assertParityEdges(cfg);
    assert.ok(cfg.nodes.filter((node) => node.kind === "condition").length >= 4);
    assert.equal(cfg.sourceMeta.functionName, "run");
  });

  test("Go and Rust recognize functions and switch-like branches", async () => {
    const fixtures: Array<[SupportedLanguage, string, string]> = [
      ["go", "package main\nfunc run(value int) int {\n switch value { case 1: return 1; default: return 0 }\n}", "run"],
      ["rust", "fn run(value: i32) -> i32 {\n match value { 1 => return 1, _ => return 0 }\n}", "run"],
    ];
    for (const [language, source, name] of fixtures) {
      const cfg = await new CFGBuilder().generate({
        language,
        source,
        mode: "function",
        viewMode: "detailed",
        cursor: { line: 1, column: 0 },
      });
      assert.equal(cfg.sourceMeta.functionName, name);
      assert.ok(cfg.nodes.some((node) => node.kind === "condition"));
    }
  });

  test("C recognizes functions and parity control flow without exceptions", async () => {
    const source = [
      "int run(int n) {",
      "  for (int i = 0; i < n; i++) { if (i == 2) continue; consume(i); }",
      "  while (n-- > 0) { if (n == 1) break; tick(); }",
      "  if (n > 0) return n; else return 0;",
      "}",
    ].join("\n");
    const file = await generate("c", source, "file");
    assert.deepEqual(file.functions.map((fn) => fn.name), ["run"]);

    const cfg = await generateFunction("c", source, "run");
    assertParityEdges(cfg);
    assert.ok(!cfg.edges.some((edge) => edge.label === "exception"));
  });

  test("selection offsets apply to Python, Java, PHP, and C fragments", async () => {
    const fragments: Record<SupportedLanguage, string> = {
      python: "if ready():\n    work()",
      java: "if (ready) { work(); }",
      php: "if ($ready) { work(); }",
      c: "if (ready) { work(); }",
      go: "if ready { work() }",
      rust: "if ready { work(); }",
    };
    for (const [language, source] of Object.entries(fragments) as Array<
      [SupportedLanguage, string]
    >) {
      const cfg = await new CFGBuilder().generate({
        language,
        source,
        mode: "selection",
        viewMode: "detailed",
        selectionOffset: { line: 7, column: 4 },
      });
      const sourceNodes = cfg.nodes.filter((node) => !["entry", "exit", "merge"].includes(node.kind));
      assert.ok(sourceNodes.length > 0, `${language} selection should produce source nodes`);
      assert.ok(sourceNodes.every((node) => node.startLine >= 7));
      assert.ok(sourceNodes.some((node) => node.startLine > 7 || node.startColumn >= 4));
    }
  });

  test("PHP selects full and php-only grammars", async () => {
    const full = await generate("php", "<?php if ($ok) { work(); }", "file");
    const fragment = await generate("php", "if ($ok) { work(); }", "selection");
    for (const cfg of [full, fragment]) {
      assert.ok(cfg.nodes.length > 2);
      assert.ok(!cfg.diagnostics.some((diagnostic) => diagnostic.includes("WASM could not be loaded")));
    }
  });

  test("Java and PHP throw route to handlers and through finally", async () => {
    const fixtures: Array<[SupportedLanguage, string]> = [
      [
        "java",
        "class Demo { int run() { try { throw new RuntimeException(); } catch (RuntimeException error) { recover(); } finally { cleanup(); } return 0; } }",
      ],
      [
        "php",
        "<?php function run() { try { throw new Exception(); } catch (Exception $error) { recover(); } finally { cleanup(); } return 0; }",
      ],
    ];
    for (const [language, source] of fixtures) {
      const cfg = await generateFunction(language, source, "run");
      const thrown = cfg.nodes.find((node) => node.label.startsWith("throw "));
      const handler = cfg.nodes.find((node) => node.label.startsWith("catch "));
      const cleanupNodes = cfg.nodes.filter((node) => node.label.includes("cleanup"));
      assert.ok(thrown && handler && cleanupNodes.length > 0);
      assert.ok(cfg.edges.some((edge) => edge.from === thrown.id && edge.to === handler.id && edge.label === "exception"));
      assert.ok(cleanupNodes.some((cleanup) => reaches(cfg, handler.id, cleanup.id)));
    }
  });
});

async function generate(
  language: SupportedLanguage,
  source: string,
  mode: "file" | "selection",
): Promise<CFG> {
  return new CFGBuilder().generate({ language, source, mode, viewMode: "detailed" });
}

async function generateFunction(
  language: SupportedLanguage,
  source: string,
  name: string,
): Promise<CFG> {
  const line = source.slice(0, source.indexOf(name)).split("\n").length - 1;
  const lineStart = source.lastIndexOf("\n", source.indexOf(name)) + 1;
  return new CFGBuilder().generate({
    language,
    source,
    mode: "function",
    viewMode: "detailed",
    cursor: { line, column: source.indexOf(name) - lineStart },
  });
}

function assertParityEdges(cfg: CFG): void {
  for (const label of ["true", "false", "loop", "break", "continue", "return"] as const) {
    assert.ok(cfg.edges.some((edge) => edge.label === label), `missing ${label} edge`);
  }
  assert.ok(cfg.nodes.every((node) => node.startLine >= 0 && node.startColumn >= 0));
}

function reaches(cfg: CFG, from: string, to: string): boolean {
  const seen = new Set<string>();
  const pending = [from];
  while (pending.length > 0) {
    const current = pending.pop()!;
    if (current === to) {return true;}
    if (seen.has(current)) {continue;}
    seen.add(current);
    pending.push(...cfg.edges.filter((edge) => edge.from === current).map((edge) => edge.to));
  }
  return false;
}
