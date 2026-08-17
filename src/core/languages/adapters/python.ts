import {
  ConditionalStatement,
  ControlFlowNode,
  LanguageAdapter,
  ParseContext,
  TreeSitterNode,
} from "../model";
import {
  childForField,
  firstLine,
  mergeRange,
  namedChildren,
  rangeFromNode,
} from "../treeSitter";

export const pythonAdapter: LanguageAdapter = {
  language: "python",
  unsupportedSyntax: {
    yield: "yield expression",
    assert_statement: "assert statement",
  },
  wasmFileForSource: () => "tree-sitter-python/tree-sitter-python.wasm",
  parseRoot: (root, context) => nodesFromContainer(root, context),
};

function nodesFromContainer(
  container: TreeSitterNode,
  context: ParseContext,
): ControlFlowNode[] {
  const nodes: ControlFlowNode[] = [];
  for (const child of namedChildren(container)) {
    if (child.type === "block") {
      nodes.push(...nodesFromContainer(child, context));
      continue;
    }
    if (child.type === "class_definition") {
      const block = childForField(child, "body") ?? findType(child, "block");
      if (block) {nodes.push(...nodesFromContainer(block, context));}
      continue;
    }
    if (child.type === "decorated_definition") {
      const definition = childForField(child, "definition") ?? namedChildren(child).find(
        (item) => item.type === "function_definition" || item.type === "class_definition",
      );
      if (definition?.type === "class_definition") {
        const block = childForField(definition, "body") ?? findType(definition, "block");
        if (block) {nodes.push(...nodesFromContainer(block, context));}
      } else if (definition) {
        const parsed = nodeFromTreeSitter(definition, context);
        if (parsed) {nodes.push({ ...parsed, ...rangeFromNode(child, context.offset) });}
      }
      continue;
    }
    const parsed = nodeFromTreeSitter(child, context);
    if (parsed) {nodes.push(parsed);}
  }
  return nodes;
}

function nodeFromTreeSitter(
  node: TreeSitterNode,
  context: ParseContext,
): ControlFlowNode | undefined {
  const range = rangeFromNode(node, context.offset);
  if (node.type === "function_definition") {
    const nameNode = childForField(node, "name") ?? findType(node, "identifier");
    const name = nameNode?.text ?? extractFunctionName(firstLine(node.text));
    const block = childForField(node, "body") ?? findType(node, "block");
    return {
      ...range,
      kind: "function",
      name,
      label: `${firstLine(node.text).startsWith("async ") ? "async " : ""}def ${name}(...)`,
      code: firstLine(node.text),
      body: block ? nodesFromContainer(block, context) : [],
    };
  }
  if (node.type === "if_statement") {return ifFromTreeSitter(node, context);}

  if (node.type === "for_statement" || node.type === "while_statement") {
    const children = namedChildren(node);
    const block = childForField(node, "body") ?? children.find((child) => child.type === "block");
    const elseClause = childForField(node, "alternative") ?? findType(node, "else_clause");
    const elseBlock = elseClause && (childForField(elseClause, "body") ?? findType(elseClause, "block"));
    const conditionNode = node.type === "for_statement"
      ? undefined
      : childForField(node, "condition") ?? children.find(
          (child) => child.type !== "block" && child.type !== "else_clause",
        );
    const header = trimHeader(firstLine(node.text));
    const condition = conditionNode?.text ?? header;
    return {
      ...range,
      kind: "loop",
      label: node.type === "for_statement"
        ? firstLine(node.text).replace(/:$/, "")
        : `while ${condition}`,
      code: firstLine(node.text),
      body: block ? nodesFromContainer(block, context) : [],
      elseBody: elseBlock ? nodesFromContainer(elseBlock, context) : [],
    };
  }

  if (node.type === "try_statement") {
    const children = namedChildren(node);
    const block = childForField(node, "body") ?? children.find((child) => child.type === "block");
    const handlers = children.filter((child) => child.type === "except_clause").map((child) => {
      const handlerBlock = childForField(child, "body") ?? findType(child, "block");
      return {
        ...rangeFromNode(child, context.offset),
        code: firstLine(child.text),
        catchAll: namedChildren(child).every((item) => item.type === "block"),
        body: handlerBlock ? nodesFromContainer(handlerBlock, context) : [],
      };
    });
    const elseBlock = blockFromClause(children, "else_clause");
    const finallyBlock = blockFromClause(children, "finally_clause");
    return {
      ...range,
      kind: "try",
      label: "try",
      code: "try",
      body: block ? nodesFromContainer(block, context) : [],
      handlers,
      elseBody: elseBlock ? nodesFromContainer(elseBlock, context) : [],
      finallyBody: finallyBlock ? nodesFromContainer(finallyBlock, context) : [],
    };
  }

  if (node.type === "with_statement") {
    const block = childForField(node, "body") ?? findType(node, "block");
    return {
      ...range,
      kind: "container",
      code: firstLine(node.text),
      body: block ? nodesFromContainer(block, context) : [],
    };
  }

  if (node.type === "match_statement") {return matchFromTreeSitter(node, context);}

  const simpleKinds: Record<string, "return" | "throw" | "break" | "continue"> = {
    return_statement: "return",
    raise_statement: "throw",
    break_statement: "break",
    continue_statement: "continue",
  };
  const simpleKind = simpleKinds[node.type];
  if (simpleKind) {return { ...range, kind: simpleKind, code: node.text };}
  if (isStatementLike(node.type)) {return { ...range, kind: "statement", code: node.text };}
  return undefined;
}

function ifFromTreeSitter(
  node: TreeSitterNode,
  context: ParseContext,
): ConditionalStatement {
  const children = namedChildren(node);
  const condition = childForField(node, "condition") ?? children.find(
    (child) => child.type !== "block" && child.type !== "elif_clause" && child.type !== "else_clause",
  );
  const block = childForField(node, "consequence") ?? children.find((child) => child.type === "block");
  const branches: ConditionalStatement["branches"] = [{
    ...(block
      ? mergeRange(rangeFromNode(condition ?? node, context.offset), rangeFromNode(block, context.offset))
      : rangeFromNode(node, context.offset)),
    condition: condition?.text ?? trimHeader(firstLine(node.text)),
    conditionLabel: `if ${condition?.text ?? trimHeader(firstLine(node.text))}`,
    isElse: false,
    body: block ? nodesFromContainer(block, context) : [],
  }];
  for (const child of children) {
    if (child.type === "elif_clause") {
      const clauseCondition = childForField(child, "condition") ?? namedChildren(child).find((item) => item.type !== "block");
      const clauseBlock = childForField(child, "consequence") ?? findType(child, "block");
      const text = clauseCondition?.text ?? trimHeader(firstLine(child.text));
      branches.push({
        ...rangeFromNode(child, context.offset),
        condition: text,
        conditionLabel: `elif ${text}`,
        isElse: false,
        body: clauseBlock ? nodesFromContainer(clauseBlock, context) : [],
      });
    } else if (child.type === "else_clause") {
      const clauseBlock = childForField(child, "body") ?? findType(child, "block");
      branches.push({
        ...rangeFromNode(child, context.offset),
        isElse: true,
        body: clauseBlock ? nodesFromContainer(clauseBlock, context) : [],
      });
    }
  }
  return { ...rangeFromNode(node, context.offset), kind: "if", code: firstLine(node.text), branches };
}

function matchFromTreeSitter(
  node: TreeSitterNode,
  context: ParseContext,
): ConditionalStatement {
  const subject = childForField(node, "subject") ?? namedChildren(node).find(
    (child) => child.type !== "case_clause",
  );
  const cases = namedChildren(node).filter((child) => child.type === "case_clause");
  const branches: ConditionalStatement["branches"] = [];

  for (const clause of cases) {
    const children = namedChildren(clause);
    const consequence = childForField(clause, "consequence") ?? findType(clause, "block");
    const pattern = children.find((child) => child.type !== "block" && child.type !== "if_clause");
    const guard = childForField(clause, "guard");
    const patternText = pattern?.text ?? trimHeader(firstLine(clause.text));
    const condition = guard ? `${patternText} ${guard.text}` : patternText;
    const isWildcard = patternText.trim() === "_";
    branches.push({
      ...rangeFromNode(clause, context.offset),
      condition: isWildcard ? undefined : condition,
      conditionLabel: `case ${condition}`,
      isElse: isWildcard,
      body: consequence ? nodesFromContainer(consequence, context) : [],
    });
  }

  return {
    ...rangeFromNode(node, context.offset),
    kind: "if",
    code: firstLine(node.text),
    branches: branches.length > 0
      ? branches
      : [{
          ...rangeFromNode(node, context.offset),
          condition: subject?.text ?? "match",
          conditionLabel: `match ${subject?.text ?? ""}`,
          isElse: false,
          body: [],
        }],
  };
}

function findType(node: TreeSitterNode, type: string): TreeSitterNode | undefined {
  return namedChildren(node).find((child) => child.type === type);
}

function blockFromClause(children: TreeSitterNode[], type: string): TreeSitterNode | undefined {
  const clause = children.find((child) => child.type === type);
  return clause && (childForField(clause, "body") ?? findType(clause, "block"));
}

function trimHeader(text: string): string {
  return text.replace(/:$/, "").replace(/^(if|elif|while|for)\s+/, "");
}

function extractFunctionName(text: string): string {
  return text.match(/^(?:async\s+)?def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/)?.[1] ?? "<anonymous>";
}

function isStatementLike(type: string): boolean {
  return [
    "expression_statement",
    "assignment",
    "augmented_assignment",
    "call",
    "import_statement",
    "import_from_statement",
    "pass_statement",
    "assert_statement",
    "yield",
  ].includes(type);
}
