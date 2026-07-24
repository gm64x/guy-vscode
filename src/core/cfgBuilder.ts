import {
  PythonAstNode,
  PythonFunctionStatement,
  PythonIfStatement,
  PythonLoopStatement,
  PythonParser,
  PythonStatement,
  PythonTryStatement,
  PythonWithStatement,
} from "./parser";
import { calculateMetrics } from "./metrics";
import { calculateIndependentPaths } from "./paths";
import {
  CFG,
  CFGEdge,
  CFGEdgeLabel,
  CFGNode,
  CFGNodeKind,
  CFGSourceMeta,
  CFGViewMode,
  GenerateCFGOptions,
  PythonFunctionInfo,
  SourceRange,
} from "./types";

interface AbruptTarget {
  nodeId: string;
  finallyDepth: number;
}

const MAX_SOURCE_BYTES = 2_000_000;
const MAX_GRAPH_NODES = 10_000;

interface BuildContext {
  loopStack: Array<{
    condition: AbruptTarget;
    afterLoop: AbruptTarget;
  }>;
  exceptionTargets: AbruptTarget[];
  finallyStack: PythonAstNode[][];
}

export class CFGBuilder {
  private parser = new PythonParser();

  async generate(options: GenerateCFGOptions): Promise<CFG> {
    const session = new CFGBuildSession(this.parser, options);
    return session.run();
  }
}

class CFGBuildSession {
  private nodes: CFGNode[] = [];
  private edges: CFGEdge[] = [];
  private nodeSequence = 0;
  private edgeSequence = 0;
  private exitNodeId = "";
  private diagnostics: string[] = [];

  constructor(
    private parser: PythonParser,
    private options: GenerateCFGOptions,
  ) {}

  async run(): Promise<CFG> {
    if (Buffer.byteLength(this.options.source, "utf8") > MAX_SOURCE_BYTES) {
      throw new Error("The Python source is too large to analyze.");
    }

    const parsed = await this.parser.parse(
      this.options.source,
      this.options.selectionOffset,
    );
    let body = parsed.body;
    let functionName: string | undefined;
    this.diagnostics = [...parsed.diagnostics];

    if (this.options.mode === "function") {
      if (!this.options.cursor) {
        throw new Error(
          "Cursor position is required to generate CFG from current function.",
        );
      }
      const currentFunction = this.parser.findCurrentFunction(
        parsed,
        this.options.cursor,
      );
      if (!currentFunction) {
        throw new Error(
          "Place the cursor inside a Python function to generate its CFG.",
        );
      }
      body = currentFunction.body;
      functionName = currentFunction.name;
    }

    const sourceMeta: CFGSourceMeta = {
      mode: this.options.mode,
      fileName: this.options.fileName,
      functionName,
      language: "python",
      viewMode: this.options.viewMode,
      generatedAt: new Date().toISOString(),
    };

    const defaultRange = body[0] ?? {
      startLine: this.options.selectionOffset?.line ?? 0,
      startColumn: this.options.selectionOffset?.column ?? 0,
      endLine: this.options.selectionOffset?.line ?? 0,
      endColumn: this.options.selectionOffset?.column ?? 0,
    };
    const entry = this.addNode("Entry", "entry", "", defaultRange);
    const exit = this.addNode(
      "Exit",
      "exit",
      "",
      body[body.length - 1] ?? defaultRange,
    );
    this.exitNodeId = exit.id;

    const open = this.buildSequence(
      body,
      [entry.id],
      undefined,
      {
        loopStack: [],
        exceptionTargets: [{ nodeId: exit.id, finallyDepth: 0 }],
        finallyStack: [],
      },
      this.options.viewMode,
    );
    for (const from of open) {
      this.addEdge(from, exit.id, "next");
    }
    if (this.nodes.length > MAX_GRAPH_NODES) {
      throw new Error("The generated CFG is too large to display.");
    }

    const metrics = calculateMetrics(this.nodes, this.edges);
    const independentPathResult = calculateIndependentPaths(
      this.nodes,
      this.edges,
      entry.id,
      exit.id,
      metrics.cyclomaticComplexity,
    );
    const highComplexityThreshold = this.options.highComplexityThreshold ?? 10;
    const suggestions =
      metrics.cyclomaticComplexity > highComplexityThreshold
        ? [
            `This graph has V(G) = ${metrics.cyclomaticComplexity}, above the configured threshold ${highComplexityThreshold}.`,
            "Consider splitting the function or reducing nested conditionals.",
          ]
        : [];

    return {
      nodes: this.nodes,
      edges: this.edges,
      entryNodeId: entry.id,
      exitNodeId: exit.id,
      metrics,
      independentPaths: independentPathResult.paths,
      analysis: {
        highComplexityThreshold,
        suggestions,
        independentPathLimitReason: independentPathResult.limitReason,
        showMetricsPanel: this.options.showMetricsPanel ?? false,
        maxNodesBeforeWarning: this.options.maxNodesBeforeWarning ?? 100,
        graphLayout: this.options.graphLayout ?? "top-bottom",
      },
      sourceMeta,
      functions: parsed.functions.map(toFunctionInfo),
      diagnostics: this.diagnostics,
    };
  }

  private buildSequence(
    statements: PythonAstNode[],
    predecessors: string[],
    firstLabel: CFGEdgeLabel | undefined,
    context: BuildContext,
    viewMode: CFGViewMode,
  ): string[] {
    let open = predecessors;
    let pendingLabel = firstLabel;
    const sequence =
      viewMode === "simplified" ? compactStatements(statements) : statements;

    for (const statement of sequence) {
      const result = this.buildStatement(
        statement,
        open,
        pendingLabel,
        context,
        viewMode,
      );
      open = result;
      pendingLabel = undefined;
    }

    return open;
  }

  private buildStatement(
    statement: PythonAstNode,
    predecessors: string[],
    firstLabel: CFGEdgeLabel | undefined,
    context: BuildContext,
    viewMode: CFGViewMode,
  ): string[] {
    if (statement.kind === "if") {
      return this.buildIf(
        statement,
        predecessors,
        firstLabel,
        context,
        viewMode,
      );
    }
    if (statement.kind === "loop") {
      return this.buildLoop(
        statement,
        predecessors,
        firstLabel,
        context,
        viewMode,
      );
    }
    if (statement.kind === "try") {
      return this.buildTry(
        statement,
        predecessors,
        firstLabel,
        context,
        viewMode,
      );
    }
    if (statement.kind === "with") {
      return this.buildWith(
        statement,
        predecessors,
        firstLabel,
        context,
        viewMode,
      );
    }
    if (statement.kind === "function") {
      const node = this.addNode(
        `def ${statement.name}(...)`,
        "statement",
        statement.code,
        statement,
      );
      this.connect(predecessors, node.id, firstLabel ?? "next");
      return [node.id];
    }
    if (statement.kind === "return") {
      const node = this.addNode(
        labelFor(statement),
        "return",
        statement.code,
        statement,
      );
      this.connect(predecessors, node.id, firstLabel ?? "next");
      this.routeAbrupt(
        node.id,
        { nodeId: this.exitNodeId, finallyDepth: 0 },
        "return",
        context,
        viewMode,
      );
      return [];
    }
    if (statement.kind === "raise") {
      const node = this.addNode(
        labelFor(statement),
        "statement",
        statement.code,
        statement,
      );
      this.connect(predecessors, node.id, firstLabel ?? "next");
      if (
        context.exceptionTargets.some(
          (target) => target.nodeId !== this.exitNodeId,
        )
      ) {
        this.addTypeAgnosticRaiseDiagnostic();
      }
      for (const target of context.exceptionTargets) {
        this.routeAbrupt(node.id, target, "exception", context, viewMode);
      }
      return [];
    }
    if (statement.kind === "break") {
      const node = this.addNode(
        "break",
        "statement",
        statement.code,
        statement,
      );
      this.connect(predecessors, node.id, firstLabel ?? "next");
      const loop = context.loopStack[context.loopStack.length - 1];
      if (loop) {
        this.routeAbrupt(
          node.id,
          loop.afterLoop,
          "break",
          context,
          viewMode,
        );
      }
      return [];
    }
    if (statement.kind === "continue") {
      const node = this.addNode(
        "continue",
        "statement",
        statement.code,
        statement,
      );
      this.connect(predecessors, node.id, firstLabel ?? "next");
      const loop = context.loopStack[context.loopStack.length - 1];
      if (loop) {
        this.routeAbrupt(
          node.id,
          loop.condition,
          "continue",
          context,
          viewMode,
        );
      }
      return [];
    }

    return this.buildSimple(
      statement,
      predecessors,
      firstLabel,
      "statement",
      labelFor(statement),
    );
  }

  private buildSimple(
    statement: PythonStatement,
    predecessors: string[],
    firstLabel: CFGEdgeLabel | undefined,
    kind: CFGNodeKind,
    label: string,
  ): string[] {
    const node = this.addNode(label, kind, statement.code, statement);
    this.connect(predecessors, node.id, firstLabel ?? "next");
    return [node.id];
  }

  private buildIf(
    statement: PythonIfStatement,
    predecessors: string[],
    firstLabel: CFGEdgeLabel | undefined,
    context: BuildContext,
    viewMode: CFGViewMode,
  ): string[] {
    let pendingFalseFrom = predecessors;
    let pendingLabel = firstLabel ?? "next";
    const exits: string[] = [];

    for (const branch of statement.branches) {
      if (branch.label === "else") {
        const elseExits = this.buildSequence(
          branch.body,
          pendingFalseFrom,
          pendingLabel,
          context,
          viewMode,
        );
        exits.push(...elseExits);
        pendingFalseFrom = [];
        break;
      }

      const prefix = branch.label === "elif" ? "elif" : "if";
      const condition = this.addNode(
        `${prefix} ${branch.condition ?? ""}`,
        "condition",
        branch.condition ?? statement.code,
        branch,
      );
      this.connect(pendingFalseFrom, condition.id, pendingLabel);
      const branchExits = this.buildSequence(
        branch.body,
        [condition.id],
        "true",
        context,
        viewMode,
      );
      exits.push(...branchExits);
      pendingFalseFrom = [condition.id];
      pendingLabel = "false";
    }

    if (pendingFalseFrom.length === 0 && exits.length === 0) {
      return [];
    }
    const merge = this.addNode("merge", "merge", "", statement);
    this.connect(pendingFalseFrom, merge.id, pendingLabel);
    this.connect(exits, merge.id, "next");
    return [merge.id];
  }

  private buildTry(
    statement: PythonTryStatement,
    predecessors: string[],
    firstLabel: CFGEdgeLabel | undefined,
    context: BuildContext,
    viewMode: CFGViewMode,
  ): string[] {
    const tryNode = this.addNode("try", "statement", statement.code, statement);
    this.connect(predecessors, tryNode.id, firstLabel ?? "next");
    const handlers = statement.handlers.map((handler) => ({
      statement: handler,
      node: this.addNode(handler.code, "statement", handler.code, handler),
    }));

    const protectedFinallyStack = statement.finallyBody.length > 0
      ? [...context.finallyStack, statement.finallyBody]
      : context.finallyStack;
    const possibleHandlers: AbruptTarget[] = [];
    let hasCatchAll = false;
    for (const handler of handlers) {
      if (hasCatchAll) {
        continue;
      }
      possibleHandlers.push({
        nodeId: handler.node.id,
        finallyDepth: protectedFinallyStack.length,
      });
      hasCatchAll = handler.statement.catchAll;
    }
    const tryContext: BuildContext = {
      ...context,
      exceptionTargets: hasCatchAll
        ? possibleHandlers
        : [...possibleHandlers, ...context.exceptionTargets],
      finallyStack: protectedFinallyStack,
    };
    const continuationContext: BuildContext = {
      ...context,
      finallyStack: protectedFinallyStack,
    };
    const bodyExits = this.buildSequence(
      statement.body,
      [tryNode.id],
      "next",
      tryContext,
      viewMode,
    );
    const normalExits = statement.elseBody.length > 0
      ? this.buildSequence(
          statement.elseBody,
          bodyExits,
          "next",
          continuationContext,
          viewMode,
        )
      : bodyExits;
    const handlerExits = handlers.flatMap((handler) =>
      this.buildSequence(
        handler.statement.body,
        [handler.node.id],
        "next",
        continuationContext,
        viewMode,
      ),
    );
    const exits = [...normalExits, ...handlerExits];
    const finalExits = statement.finallyBody.length > 0
      ? this.buildSequence(
          statement.finallyBody,
          exits,
          "next",
          context,
          viewMode,
        )
      : exits;

    if (finalExits.length === 0) {
      return [];
    }
    const merge = this.addNode("merge", "merge", "", statement);
    this.connect(finalExits, merge.id, "next");
    return [merge.id];
  }

  private buildWith(
    statement: PythonWithStatement,
    predecessors: string[],
    firstLabel: CFGEdgeLabel | undefined,
    context: BuildContext,
    viewMode: CFGViewMode,
  ): string[] {
    const withNode = this.addNode(
      statement.code,
      "statement",
      statement.code,
      statement,
    );
    this.connect(predecessors, withNode.id, firstLabel ?? "next");
    return this.buildSequence(
      statement.body,
      [withNode.id],
      "next",
      context,
      viewMode,
    );
  }

  private buildLoop(
    statement: PythonLoopStatement,
    predecessors: string[],
    firstLabel: CFGEdgeLabel | undefined,
    context: BuildContext,
    viewMode: CFGViewMode,
  ): string[] {
    const condition = this.addNode(
      `${statement.loopKind} ${statement.condition}`,
      "loop",
      statement.code,
      statement,
    );
    const afterLoop = this.addNode("after loop", "merge", "", statement);
    this.connect(predecessors, condition.id, firstLabel ?? "next");

    const loopContext: BuildContext = {
      ...context,
      loopStack: [
        ...context.loopStack,
        {
          condition: {
            nodeId: condition.id,
            finallyDepth: context.finallyStack.length,
          },
          afterLoop: {
            nodeId: afterLoop.id,
            finallyDepth: context.finallyStack.length,
          },
        },
      ],
    };
    const bodyExits = this.buildSequence(
      statement.body,
      [condition.id],
      "true",
      loopContext,
      viewMode,
    );
    this.connect(bodyExits, condition.id, "loop");
    if (statement.elseBody.length > 0) {
      const elseExits = this.buildSequence(
        statement.elseBody,
        [condition.id],
        "false",
        context,
        viewMode,
      );
      this.connect(elseExits, afterLoop.id, "next");
    } else {
      this.addEdge(condition.id, afterLoop.id, "false");
    }
    return [afterLoop.id];
  }

  private routeAbrupt(
    fromId: string,
    target: AbruptTarget,
    label: CFGEdgeLabel,
    context: BuildContext,
    viewMode: CFGViewMode,
  ): void {
    let open = [fromId];
    for (
      let index = context.finallyStack.length - 1;
      index >= target.finallyDepth && open.length > 0;
      index--
    ) {
      open = this.buildSequence(
        context.finallyStack[index],
        open,
        "next",
        {
          ...context,
          exceptionTargets: context.exceptionTargets.filter(
            (exceptionTarget) => exceptionTarget.finallyDepth <= index,
          ),
          finallyStack: context.finallyStack.slice(0, index),
        },
        viewMode,
      );
    }
    this.connect(open, target.nodeId, label);
  }

  private addTypeAgnosticRaiseDiagnostic(): void {
    const diagnostic =
      "Raise matching is type-agnostic; exception edges show possible handlers and an unhandled path.";
    if (!this.diagnostics.includes(diagnostic)) {
      this.diagnostics.push(diagnostic);
    }
  }

  private connect(fromIds: string[], toId: string, label?: CFGEdgeLabel): void {
    for (const fromId of fromIds) {
      this.addEdge(fromId, toId, label);
    }
  }

  private addNode(
    label: string,
    kind: CFGNodeKind,
    code: string,
    range: SourceRange,
  ): CFGNode {
    const node: CFGNode = {
      id: `n${++this.nodeSequence}`,
      label: truncate(label || code || kind, 72),
      kind,
      code,
      startLine: range.startLine,
      startColumn: range.startColumn,
      endLine: range.endLine,
      endColumn: range.endColumn,
    };
    this.nodes.push(node);
    return node;
  }

  private addEdge(from: string, to: string, label?: CFGEdgeLabel): void {
    if (from === to && label !== "loop" && label !== "continue") {
      return;
    }
    this.edges.push({
      id: `e${++this.edgeSequence}`,
      from,
      to,
      label,
    });
  }
}

function compactStatements(statements: PythonAstNode[]): PythonAstNode[] {
  const compacted: PythonAstNode[] = [];
  let buffer: PythonStatement[] = [];

  const flush = () => {
    if (buffer.length === 0) {
      return;
    }
    if (buffer.length === 1) {
      compacted.push(buffer[0]);
    } else {
      const first = buffer[0];
      const last = buffer[buffer.length - 1];
      compacted.push({
        kind: "statement",
        code: buffer.map((item) => item.code).join("\n"),
        startLine: first.startLine,
        startColumn: first.startColumn,
        endLine: last.endLine,
        endColumn: last.endColumn,
      });
    }
    buffer = [];
  };

  for (const statement of statements) {
    if (statement.kind === "statement") {
      buffer.push(statement);
    } else {
      flush();
      compacted.push(statement);
    }
  }

  flush();
  return compacted;
}

function labelFor(statement: PythonStatement): string {
  const firstLine = statement.code.split("\n")[0] ?? statement.kind;
  return firstLine.trim();
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength
    ? `${value.slice(0, maxLength - 1)}...`
    : value;
}

function toFunctionInfo(fn: PythonFunctionStatement): PythonFunctionInfo {
  return {
    name: fn.name,
    startLine: fn.startLine,
    startColumn: fn.startColumn,
    endLine: fn.endLine,
    endColumn: fn.endColumn,
  };
}
