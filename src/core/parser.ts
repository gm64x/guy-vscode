import * as path from "node:path";
import { SourceOffset, SourcePosition, SourceRange } from "./types";

export type PythonStatementKind =
  | "statement"
  | "if"
  | "loop"
  | "return"
  | "break"
  | "continue"
  | "function";

export interface PythonBaseStatement extends SourceRange {
  code: string;
}

export interface PythonStatement extends PythonBaseStatement {
  kind: "statement" | "return" | "break" | "continue";
}

export interface PythonBranch extends SourceRange {
  condition?: string;
  label: "if" | "elif" | "else";
  body: PythonAstNode[];
}

export interface PythonIfStatement extends PythonBaseStatement {
  kind: "if";
  branches: PythonBranch[];
}

export interface PythonLoopStatement extends PythonBaseStatement {
  kind: "loop";
  loopKind: "for" | "while";
  condition: string;
  body: PythonAstNode[];
}

export interface PythonFunctionStatement extends PythonBaseStatement {
  kind: "function";
  name: string;
  body: PythonAstNode[];
}

export type PythonAstNode =
  | PythonStatement
  | PythonIfStatement
  | PythonLoopStatement
  | PythonFunctionStatement;

export interface ParsedPython {
  body: PythonAstNode[];
  functions: PythonFunctionStatement[];
  diagnostics: string[];
  treeSitterAvailable: boolean;
}

export interface LanguageParser<TParsed, TFunction> {
  parse(source: string, offset?: SourceOffset): Promise<TParsed>;
  findCurrentFunction(
    parsed: TParsed,
    cursor: SourcePosition,
  ): TFunction | undefined;
}

interface TreeSitterNode {
  type: string;
  text: string;
  startPosition: { row: number; column: number };
  endPosition: { row: number; column: number };
  namedChildCount: number;
  namedChild(index: number): TreeSitterNode | null;
  hasError: boolean;
}

interface WebTreeSitterRuntime {
  Parser: new () => {
    setLanguage(language: unknown): void;
    parse(source: string): { rootNode: TreeSitterNode; delete(): void } | null;
    delete(): void;
  };
  python: unknown;
}

export class PythonParser implements LanguageParser<
  ParsedPython,
  PythonFunctionStatement
> {
  private webTreeSitter: Promise<WebTreeSitterRuntime> | undefined;

  async parse(
    source: string,
    offset: SourceOffset = { line: 0, column: 0 },
  ): Promise<ParsedPython> {
    const diagnostics: string[] = [];
    try {
      const runtime = await this.getWebTreeSitter();
      const parser = new runtime.Parser();
      parser.setLanguage(runtime.python);
      const tree = parser.parse(source);
      if (!tree) {
        parser.delete();
        throw new Error("Tree-sitter could not parse this source.");
      }
      if (tree.rootNode.hasError) {
        diagnostics.push(
          "Tree-sitter found syntax errors. The CFG was generated from the recoverable structure and may be incomplete.",
        );
      }
      const body = this.nodesFromTreeSitterContainer(tree.rootNode, offset);
      tree.delete();
      parser.delete();
      const functions = this.collectFunctions(body);
      return {
        body,
        functions,
        diagnostics,
        treeSitterAvailable: true,
      };
    } catch (err: any) {
      diagnostics.push(
        `Tree-sitter WASM could not be loaded: ${err?.message ?? err}`,
      );
      return {
        body: [],
        functions: [],
        diagnostics,
        treeSitterAvailable: false,
      };
    }
  }

  findCurrentFunction(
    parsed: ParsedPython,
    cursor: SourcePosition,
  ): PythonFunctionStatement | undefined {
    return parsed.functions
      .filter((fn) => containsPosition(fn, cursor))
      .sort((a, b) => spanSize(a) - spanSize(b))[0];
  }

  private getWebTreeSitter(): Promise<WebTreeSitterRuntime> {
    this.webTreeSitter ??= loadWebTreeSitter();
    return this.webTreeSitter;
  }

  private nodesFromTreeSitterContainer(
    container: TreeSitterNode,
    offset: SourceOffset,
  ): PythonAstNode[] {
    const nodes: PythonAstNode[] = [];
    for (const child of namedChildren(container)) {
      if (child.type === "block") {
        nodes.push(...this.nodesFromTreeSitterContainer(child, offset));
        continue;
      }
      const parsed = this.nodeFromTreeSitter(child, offset);
      if (parsed) {
        nodes.push(parsed);
      }
    }
    return nodes;
  }

  private nodeFromTreeSitter(
    node: TreeSitterNode,
    offset: SourceOffset,
  ): PythonAstNode | undefined {
    if (node.type === "function_definition") {
      const name =
        namedChildren(node).find((child) => child.type === "identifier")
          ?.text ?? extractFunctionName(firstLine(node.text));
      const block = namedChildren(node).find((child) => child.type === "block");
      return {
        ...rangeFromTreeSitter(node, offset),
        kind: "function",
        name,
        code: firstLine(node.text),
        body: block ? this.nodesFromTreeSitterContainer(block, offset) : [],
      };
    }

    if (node.type === "if_statement") {
      return this.ifFromTreeSitter(node, offset);
    }

    if (node.type === "for_statement" || node.type === "while_statement") {
      const children = namedChildren(node);
      const block = children.find((child) => child.type === "block");
      const condition =
        children.find((child) => child.type !== "block")?.text ??
        trimHeader(firstLine(node.text));
      return {
        ...rangeFromTreeSitter(node, offset),
        kind: "loop",
        loopKind: node.type === "for_statement" ? "for" : "while",
        condition,
        code: firstLine(node.text),
        body: block ? this.nodesFromTreeSitterContainer(block, offset) : [],
      };
    }

    if (node.type === "return_statement") {
      return {
        ...rangeFromTreeSitter(node, offset),
        kind: "return",
        code: node.text,
      };
    }
    if (node.type === "break_statement") {
      return {
        ...rangeFromTreeSitter(node, offset),
        kind: "break",
        code: node.text,
      };
    }
    if (node.type === "continue_statement") {
      return {
        ...rangeFromTreeSitter(node, offset),
        kind: "continue",
        code: node.text,
      };
    }

    if (isStatementLike(node.type)) {
      return {
        ...rangeFromTreeSitter(node, offset),
        kind: "statement",
        code: node.text,
      };
    }

    return undefined;
  }

  private ifFromTreeSitter(
    node: TreeSitterNode,
    offset: SourceOffset,
  ): PythonIfStatement {
    const children = namedChildren(node);
    const condition = children.find(
      (child) =>
        child.type !== "block" &&
        child.type !== "elif_clause" &&
        child.type !== "else_clause",
    );
    const block = children.find((child) => child.type === "block");
    const branches: PythonBranch[] = [
      {
        ...(block
          ? mergeRange(
              rangeFromTreeSitter(condition ?? node, offset),
              rangeFromTreeSitter(block, offset),
            )
          : rangeFromTreeSitter(node, offset)),
        label: "if",
        condition: condition?.text ?? trimHeader(firstLine(node.text)),
        body: block ? this.nodesFromTreeSitterContainer(block, offset) : [],
      },
    ];

    for (const child of children) {
      if (child.type === "elif_clause") {
        const clauseChildren = namedChildren(child);
        const clauseCondition = clauseChildren.find(
          (item) => item.type !== "block",
        );
        const clauseBlock = clauseChildren.find(
          (item) => item.type === "block",
        );
        branches.push({
          ...rangeFromTreeSitter(child, offset),
          label: "elif",
          condition: clauseCondition?.text ?? trimHeader(firstLine(child.text)),
          body: clauseBlock
            ? this.nodesFromTreeSitterContainer(clauseBlock, offset)
            : [],
        });
      }
      if (child.type === "else_clause") {
        const clauseBlock = namedChildren(child).find(
          (item) => item.type === "block",
        );
        branches.push({
          ...rangeFromTreeSitter(child, offset),
          label: "else",
          body: clauseBlock
            ? this.nodesFromTreeSitterContainer(clauseBlock, offset)
            : [],
        });
      }
    }

    return {
      ...rangeFromTreeSitter(node, offset),
      kind: "if",
      code: firstLine(node.text),
      branches,
    };
  }

  private collectFunctions(nodes: PythonAstNode[]): PythonFunctionStatement[] {
    const functions: PythonFunctionStatement[] = [];
    for (const node of nodes) {
      if (node.kind === "function") {
        functions.push(node);
        functions.push(...this.collectFunctions(node.body));
      } else if (node.kind === "if") {
        for (const branch of node.branches) {
          functions.push(...this.collectFunctions(branch.body));
        }
      } else if (node.kind === "loop") {
        functions.push(...this.collectFunctions(node.body));
      }
    }
    return functions;
  }
}

function trimHeader(text: string): string {
  return text
    .replace(/:$/, "")
    .replace(/^(if|elif|while)\s+/, "")
    .replace(/^for\s+/, "for ");
}

function extractFunctionName(text: string): string {
  const match = text.match(/^(?:async\s+)?def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/);
  return match?.[1] ?? "<anonymous>";
}

async function loadWebTreeSitter(): Promise<WebTreeSitterRuntime> {
  const TreeSitter = require("web-tree-sitter") as {
    Parser: {
      init(options?: { locateFile?: (file: string) => string }): Promise<void>;
      new (): WebTreeSitterRuntime["Parser"] extends new () => infer T
        ? T
        : never;
    };
    Language: {
      load(input: string | Uint8Array): Promise<unknown>;
    };
  };
  const runtimeWasmPath =
    require.resolve("web-tree-sitter/web-tree-sitter.wasm");
  const pythonPackagePath = require.resolve("tree-sitter-python/package.json");
  const pythonWasmPath = path.join(
    path.dirname(pythonPackagePath),
    "tree-sitter-python.wasm",
  );

  await TreeSitter.Parser.init({
    locateFile: () => runtimeWasmPath,
  });
  const python = await TreeSitter.Language.load(pythonWasmPath);

  return {
    Parser: TreeSitter.Parser as unknown as WebTreeSitterRuntime["Parser"],
    python,
  };
}

function namedChildren(node: TreeSitterNode): TreeSitterNode[] {
  const children: TreeSitterNode[] = [];
  for (let index = 0; index < node.namedChildCount; index += 1) {
    const child = node.namedChild(index);
    if (child) {
      children.push(child);
    }
  }
  return children;
}

function rangeFromTreeSitter(
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

function firstLine(text: string): string {
  return text.split(/\r?\n/, 1)[0]?.trim() ?? text.trim();
}

function isStatementLike(type: string): boolean {
  return (
    type === "expression_statement" ||
    type === "assignment" ||
    type === "augmented_assignment" ||
    type === "call" ||
    type === "import_statement" ||
    type === "import_from_statement" ||
    type === "pass_statement" ||
    type === "raise_statement" ||
    type === "assert_statement"
  );
}

function mergeRange(start: SourceRange, end: SourceRange): SourceRange {
  return {
    startLine: start.startLine,
    startColumn: start.startColumn,
    endLine: end.endLine,
    endColumn: end.endColumn,
  };
}

function spanSize(range: SourceRange): number {
  return (
    (range.endLine - range.startLine) * 1000 +
    range.endColumn -
    range.startColumn
  );
}

function containsPosition(
  range: SourceRange,
  position: SourcePosition,
): boolean {
  if (position.line < range.startLine || position.line > range.endLine) {
    return false;
  }
  if (
    position.line === range.startLine &&
    position.column < range.startColumn
  ) {
    return false;
  }
  if (position.line === range.endLine && position.column > range.endColumn) {
    return false;
  }
  return true;
}
