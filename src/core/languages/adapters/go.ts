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
  namedChildren,
  rangeFromNode,
} from "../treeSitter";

const BODY_TYPES = new Set(["block", "statement_list"]);
const FUNCTION_TYPES = new Set(["function_declaration", "method_declaration"]);
const LOOP_TYPES = new Set(["for_statement"]);
const SWITCH_TYPES = new Set([
  "expression_switch_statement",
  "type_switch_statement",
  "select_statement",
]);
const CASE_TYPES = new Set([
  "case_clause",
  "expression_case",
  "type_case",
  "communication_case",
  "default_case",
]);

export const goAdapter: LanguageAdapter = {
  language: "go",
  unsupportedSyntax: {
    defer_statement: "defer statement",
    go_statement: "goroutine launch",
    goto_statement: "goto statement",
    labeled_statement: "labeled control flow",
    fallthrough_statement: "fallthrough statement",
  },
  wasmFileForSource: () => "tree-sitter-wasm/out/go/tree-sitter-go.wasm",
  parseRoot: (root, context) => parseContainer(root, context),
};

function parseContainer(
  node: TreeSitterNode,
  context: ParseContext,
): ControlFlowNode[] {
  return namedChildren(node).flatMap((child) => {
    if (BODY_TYPES.has(child.type) || child.type === "source_file") {
      return parseContainer(child, context);
    }
    const parsed = convert(child, context);
    return parsed ? [parsed] : [];
  });
}

function parseBody(node: TreeSitterNode, context: ParseContext): ControlFlowNode[] {
  const body = childForField(node, "body") ?? findNamed(node, BODY_TYPES);
  return body ? parseContainer(body, context) : [];
}

function convert(
  node: TreeSitterNode,
  context: ParseContext,
): ControlFlowNode | undefined {
  const range = rangeFromNode(node, context.offset);

  if (FUNCTION_TYPES.has(node.type)) {
    const nameNode = childForField(node, "name") ?? findType(node, "identifier");
    const name = nameNode?.text ?? functionName(firstLine(node.text));
    const receiver = childForField(node, "receiver");
    const label = receiver
      ? `func (${receiver.text}) ${name}(...)`
      : `func ${name}(...)`;
    return {
      ...range,
      kind: "function",
      name,
      label,
      code: firstLine(node.text),
      body: parseBody(node, context),
    };
  }

  if (node.type === "if_statement") {
    return parseIf(node, context);
  }

  if (LOOP_TYPES.has(node.type)) {
    const header = firstLine(node.text).split("{", 1)[0]?.trim() ?? "for";
    return {
      ...range,
      kind: "loop",
      label: header,
      code: firstLine(node.text),
      body: parseBody(node, context),
      elseBody: [],
    };
  }

  if (SWITCH_TYPES.has(node.type)) {
    return parseCases(node, context);
  }

  if (isPanicCall(node)) {
    return { ...range, kind: "throw", code: node.text };
  }

  const simpleKinds: Record<
    string,
    "return" | "throw" | "break" | "continue"
  > = {
    return_statement: "return",
    break_statement: "break",
    continue_statement: "continue",
    panic_statement: "throw",
  };
  const simpleKind = simpleKinds[node.type];
  if (simpleKind) {
    return { ...range, kind: simpleKind, code: node.text };
  }

  // defer, go, goto, labels, and every grammar node not modeled above remain
  // visible as ordinary statements instead of being silently discarded.
  return { ...range, kind: "statement", code: node.text };
}

function parseIf(
  node: TreeSitterNode,
  context: ParseContext,
): ConditionalStatement {
  const condition = childForField(node, "condition");
  const consequence = childForField(node, "consequence") ?? findNamed(node, BODY_TYPES);
  const result: ConditionalStatement = {
    ...rangeFromNode(node, context.offset),
    kind: "if",
    code: firstLine(node.text),
    branches: [{
      ...rangeFromNode(node, context.offset),
      condition: condition?.text,
      conditionLabel: `if ${condition?.text ?? ""}`,
      isElse: false,
      body: consequence ? parseContainer(consequence, context) : [],
    }],
  };

  const alternative = childForField(node, "alternative");
  if (alternative?.type === "if_statement") {
    result.branches.push(...parseIf(alternative, context).branches);
  } else if (alternative) {
    result.branches.push({
      ...rangeFromNode(alternative, context.offset),
      isElse: true,
      body: parseContainer(alternative, context),
    });
  }
  return result;
}

function parseCases(
  node: TreeSitterNode,
  context: ParseContext,
): ConditionalStatement {
  const cases = findCases(node);
  const branches = cases.map((clause) => {
    const body = childForField(clause, "body") ?? findNamed(clause, BODY_TYPES);
    const label =
      childForField(clause, "value") ??
      childForField(clause, "type") ??
      childForField(clause, "communication") ??
      childForField(clause, "expression");
    const isDefault = clause.type === "default_case" || !label &&
      firstLine(clause.text).trim().startsWith("default");
    return {
      ...rangeFromNode(clause, context.offset),
      condition: isDefault ? undefined : label?.text ?? firstLine(clause.text),
      conditionLabel: isDefault ? undefined : `case ${label?.text ?? firstLine(clause.text)}`,
      isElse: isDefault,
      body: body ? parseContainer(body, context) : [],
    };
  });

  return {
    ...rangeFromNode(node, context.offset),
    kind: "if",
    code: firstLine(node.text),
    branches: branches.length > 0
      ? branches
      : [{
          ...rangeFromNode(node, context.offset),
          conditionLabel: firstLine(node.text),
          isElse: false,
          body: parseBody(node, context),
        }],
  };
}

function findCases(node: TreeSitterNode): TreeSitterNode[] {
  const cases: TreeSitterNode[] = [];
  for (const child of namedChildren(node)) {
    if (CASE_TYPES.has(child.type)) {
      cases.push(child);
    } else {
      cases.push(...findCases(child));
    }
  }
  return cases;
}

function findType(node: TreeSitterNode, type: string): TreeSitterNode | undefined {
  return namedChildren(node).find((child) => child.type === type);
}

function findNamed(
  node: TreeSitterNode,
  types: Set<string>,
): TreeSitterNode | undefined {
  return namedChildren(node).find((child) => types.has(child.type));
}

function isPanicCall(node: TreeSitterNode): boolean {
  const expression = node.type === "expression_statement"
    ? namedChildren(node)[0]
    : node;
  if (expression?.type !== "call_expression") {return false;}
  const callable = childForField(expression, "function") ?? namedChildren(expression)[0];
  return callable?.type === "identifier" && callable.text === "panic";
}

function functionName(text: string): string {
  return text.match(/\b(?:func)\s+(?:\([^)]*\)\s+)?([A-Za-z_][A-Za-z0-9_]*)/)?.[1] ?? "<function>";
}
