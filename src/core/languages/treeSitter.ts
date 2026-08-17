import * as path from "node:path";
import {
  CallableStatement,
  ControlFlowNode,
  LanguageAdapter,
  LanguageParser,
  ParsedSource,
  TreeSitterNode,
  UnsupportedSyntax,
} from "./model";
import { SourceOffset, SourcePosition, SourceRange } from "../types";

interface TreeSitterParser {
  setLanguage(language: unknown): void;
  parse(source: string): { rootNode: TreeSitterNode; delete(): void } | null;
  delete(): void;
}

interface WebTreeSitterModule {
  Parser: {
    init(options?: { locateFile?: (file: string) => string }): Promise<void>;
    new (): TreeSitterParser;
  };
  Language: { load(input: string | Uint8Array): Promise<unknown> };
}

let runtimePromise: Promise<WebTreeSitterModule> | undefined;
const grammarCache = new Map<string, Promise<unknown>>();

export class TreeSitterLanguageParser implements LanguageParser {
  constructor(private readonly adapter: LanguageAdapter) {}

  async parse(
    source: string,
    offset: SourceOffset = { line: 0, column: 0 },
  ): Promise<ParsedSource> {
    const diagnostics: string[] = [];
    let parser: TreeSitterParser | undefined;
    let tree: ReturnType<TreeSitterParser["parse"]> | undefined;
    try {
      const wasmFile = this.adapter.wasmFileForSource(source);
      const runtime = await loadRuntime();
      const language = await loadGrammar(runtime, wasmFile);
      parser = new runtime.Parser();
      parser.setLanguage(language);
      tree = parser.parse(source);
      if (!tree) {
        throw new Error("Tree-sitter could not parse this source.");
      }
      if (tree.rootNode.hasError) {
        diagnostics.push(
          "Tree-sitter found syntax errors. The CFG was generated from the recoverable structure and may be incomplete.",
        );
      }
      const body = this.adapter.parseRoot(tree.rootNode, {
        source,
        offset,
        wasmFile,
      });
      const unsupportedSyntax = collectUnsupportedSyntax(
        tree.rootNode,
        this.adapter.unsupportedSyntax,
        offset,
      );
      return {
        body,
        functions: collectFunctions(body),
        diagnostics,
        unsupportedSyntax,
        treeSitterAvailable: true,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      diagnostics.push(
        `${this.adapter.language} Tree-sitter grammar could not be loaded: ${message}. ` +
        "Run npm install and npm run package:vsix before installing the extension.",
      );
      return {
        body: [],
        functions: [],
        diagnostics,
        unsupportedSyntax: [],
        treeSitterAvailable: false,
      };
    } finally {
      tree?.delete();
      parser?.delete();
    }
  }

  findCurrentFunction(
    parsed: ParsedSource,
    cursor: SourcePosition,
  ): CallableStatement | undefined {
    return parsed.functions
      .filter((fn) => containsPosition(fn, cursor))
      .sort((a, b) => spanSize(a) - spanSize(b))[0];
  }
}

async function loadRuntime(): Promise<WebTreeSitterModule> {
  runtimePromise ??= (async () => {
    const runtime = require("web-tree-sitter") as WebTreeSitterModule;
    const runtimeWasmPath = require.resolve(
      "web-tree-sitter/web-tree-sitter.wasm",
    );
    await runtime.Parser.init({ locateFile: () => runtimeWasmPath });
    return runtime;
  })();
  return runtimePromise;
}

async function loadGrammar(
  runtime: WebTreeSitterModule,
  wasmFile: string,
): Promise<unknown> {
  const wasmPath = resolveGrammarWasm(wasmFile);
  let grammar = grammarCache.get(wasmPath);
  if (!grammar) {
    grammar = runtime.Language.load(wasmPath);
    grammarCache.set(wasmPath, grammar);
  }
  return grammar;
}

function resolveGrammarWasm(wasmFile: string): string {
  const separator = wasmFile.indexOf("/");
  const packageName = wasmFile.slice(0, separator);
  const fileName = wasmFile.slice(separator + 1);
  let packageDirectory: string;
  try {
    packageDirectory = path.dirname(
      require.resolve(`${packageName}/package.json`),
    );
  } catch {
    packageDirectory = path.dirname(require.resolve(packageName));
  }
  return path.join(packageDirectory, fileName);
}

export function namedChildren(node: TreeSitterNode): TreeSitterNode[] {
  const children: TreeSitterNode[] = [];
  for (let index = 0; index < node.namedChildCount; index += 1) {
    const child = node.namedChild(index);
    if (child) {children.push(child);}
  }
  return children;
}

export function childForField(
  node: TreeSitterNode,
  field: string,
): TreeSitterNode | undefined {
  return node.childForFieldName(field) ?? undefined;
}

export function rangeFromNode(
  node: TreeSitterNode,
  offset: SourceOffset,
): SourceRange {
  return {
    startLine: offset.line + node.startPosition.row,
    startColumn:
      node.startPosition.row === 0
        ? offset.column + node.startPosition.column
        : node.startPosition.column,
    endLine: offset.line + node.endPosition.row,
    endColumn:
      node.endPosition.row === 0
        ? offset.column + node.endPosition.column
        : node.endPosition.column,
  };
}

export function mergeRange(start: SourceRange, end: SourceRange): SourceRange {
  return {
    startLine: start.startLine,
    startColumn: start.startColumn,
    endLine: end.endLine,
    endColumn: end.endColumn,
  };
}

export function firstLine(text: string): string {
  return text.split(/\r?\n/, 1)[0]?.trim() ?? text.trim();
}

function collectUnsupportedSyntax(
  root: TreeSitterNode,
  rules: Readonly<Record<string, string>> | undefined,
  offset: SourceOffset,
): UnsupportedSyntax[] {
  if (!rules) {return [];}
  const unsupported: UnsupportedSyntax[] = [];
  const visit = (node: TreeSitterNode): void => {
    const description = rules[node.type];
    if (description) {
      unsupported.push({
        ...rangeFromNode(node, offset),
        nodeType: node.type,
        description,
        code: firstLine(node.text),
      });
    }
    for (const child of namedChildren(node)) {
      visit(child);
    }
  };
  visit(root);
  return unsupported;
}

function collectFunctions(nodes: ControlFlowNode[]): CallableStatement[] {
  const functions: CallableStatement[] = [];
  for (const node of nodes) {
    if (node.kind === "function") {
      functions.push(node, ...collectFunctions(node.body));
    } else if (node.kind === "if") {
      for (const branch of node.branches) {
        functions.push(...collectFunctions(branch.body));
      }
    } else if (node.kind === "loop") {
      functions.push(...collectFunctions(node.body));
      functions.push(...collectFunctions(node.elseBody));
    } else if (node.kind === "try") {
      functions.push(...collectFunctions(node.body));
      for (const handler of node.handlers) {
        functions.push(...collectFunctions(handler.body));
      }
      functions.push(...collectFunctions(node.elseBody));
      functions.push(...collectFunctions(node.finallyBody));
    } else if (node.kind === "container") {
      functions.push(...collectFunctions(node.body));
    }
  }
  return functions;
}

function spanSize(range: SourceRange): number {
  return (range.endLine - range.startLine) * 1000 + range.endColumn - range.startColumn;
}

function containsPosition(range: SourceRange, position: SourcePosition): boolean {
  if (position.line < range.startLine || position.line > range.endLine) {return false;}
  // Treat the declaration line as part of the callable so indentation or a
  // cursor in its leading whitespace still selects the function.
  if (position.line === range.startLine) {return true;}
  return position.line !== range.endLine || position.column <= range.endColumn;
}
