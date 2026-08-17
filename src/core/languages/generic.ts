import {
  ConditionalStatement,
  ControlFlowNode,
  LanguageAdapter,
  ParseContext,
  TreeSitterNode,
} from "./model";
import {
  childForField,
  firstLine,
  namedChildren,
  rangeFromNode,
} from "./treeSitter";

const CONTAINER_TYPES = new Set([
  "program",
  "translation_unit",
  "class_declaration",
  "interface_declaration",
  "enum_declaration",
  "class_body",
  "declaration_list",
  "compound_statement",
  "block",
  "namespace_definition",
  "php_tag",
  "ERROR",
]);

const BODY_TYPES = new Set([
  "block",
  "compound_statement",
  "class_body",
  "declaration_list",
]);

export function createGenericAdapter(
  language: "java" | "php" | "c",
  wasmFileForSource: (source: string) => string,
): LanguageAdapter {
  return {
    language,
    wasmFileForSource,
    parseRoot: (root, context) => container(root, context),
  };
}

function container(node: TreeSitterNode, context: ParseContext): ControlFlowNode[] {
  return namedChildren(node).flatMap((child) => {
    if (CONTAINER_TYPES.has(child.type)) {
      return container(childForField(child, "body") ?? child, context);
    }
    const value = convert(child, context);
    return value ? [value] : [];
  });
}

function body(node: TreeSitterNode, context: ParseContext): ControlFlowNode[] {
  const bodyNode =
    childForField(node, "body") ??
    childForField(node, "consequence") ??
    namedChildren(node).find((child) => BODY_TYPES.has(child.type));
  return bodyNode ? parseBodyNode(bodyNode, context) : [];
}

function convert(
  node: TreeSitterNode,
  context: ParseContext,
): ControlFlowNode | undefined {
  const range = rangeFromNode(node, context.offset);
  if (
    ["method_declaration", "constructor_declaration", "function_definition"].includes(
      node.type,
    )
  ) {
    const identifier =
      childForField(node, "name") ??
      findIdentifier(childForField(node, "declarator") ?? node);
    const name =
      identifier?.text ??
      firstLine(node.text).match(
        /(?:function\s+|[\w<>\[\]]+\s+)(\w+)\s*\(/,
      )?.[1] ??
      "<function>";
    return {
      ...range,
      kind: "function",
      name,
      label: name === "<function>" ? name : `${name}(...)`,
      code: firstLine(node.text),
      body: body(node, context),
    };
  }

  if (["if_statement", "elseif_clause", "else_if_clause"].includes(node.type)) {
    return conditional(node, context);
  }

  if (
    [
      "for_statement",
      "enhanced_for_statement",
      "foreach_statement",
      "while_statement",
    ].includes(node.type)
  ) {
    const condition =
      childForField(node, "condition") ??
      namedChildren(node).find((child) => !BODY_TYPES.has(child.type));
    const keyword = node.type === "while_statement" ? "while" : "for";
    const header = firstLine(node.text).split("{", 1)[0]?.trim();
    return {
      ...range,
      kind: "loop",
      label: header || `${keyword} ${condition?.text ?? ""}`,
      code: firstLine(node.text),
      body: body(node, context),
      elseBody: [],
    };
  }

  if (
    node.type === "try_statement" ||
    node.type === "try_with_resources_statement"
  ) {
    const handlers = namedChildren(node)
      .filter((child) =>
        ["catch_clause", "catch_block", "handler"].includes(child.type),
      )
      .map((handler) => ({
        ...rangeFromNode(handler, context.offset),
        code: firstLine(handler.text),
        catchAll:
          !childForField(handler, "parameter") &&
          !childForField(handler, "type"),
        body: body(handler, context),
      }));
    const finallyClause = namedChildren(node).find(
      (child) => child.type === "finally_clause",
    );
    return {
      ...range,
      kind: "try",
      label: "try",
      code: "try",
      body: body(node, context),
      handlers,
      elseBody: [],
      finallyBody: finallyClause ? body(finallyClause, context) : [],
    };
  }

  const kinds: Record<string, "return" | "throw" | "break" | "continue"> = {
    return_statement: "return",
    throw_statement: "throw",
    break_statement: "break",
    continue_statement: "continue",
  };
  if (kinds[node.type]) {
    return { ...range, kind: kinds[node.type], code: node.text };
  }
  if (
    node.type === "throw_expression" ||
    (node.type === "expression_statement" &&
      namedChildren(node).some((child) => child.type === "throw_expression"))
  ) {
    return { ...range, kind: "throw", code: node.text };
  }

  return { ...range, kind: "statement", code: node.text };
}

function conditional(
  node: TreeSitterNode,
  context: ParseContext,
): ConditionalStatement {
  const result: ConditionalStatement = {
    ...rangeFromNode(node, context.offset),
    kind: "if",
    code: firstLine(node.text),
    branches: [],
  };
  appendConditionalBranch(result, node, context, false);

  const directClauses = namedChildren(node).filter((child) =>
    ["elseif_clause", "else_if_clause", "else_clause"].includes(child.type),
  );
  if (directClauses.length > 0) {
    for (const clause of directClauses) {
      appendConditionalBranch(
        result,
        clause,
        context,
        clause.type === "else_clause",
      );
    }
    return result;
  }

  const alternative = childForField(node, "alternative");
  if (!alternative) {
    return result;
  }
  if (["if_statement", "elseif_clause", "else_if_clause"].includes(alternative.type)) {
    result.branches.push(...conditional(alternative, context).branches);
  } else {
    appendConditionalBranch(result, alternative, context, true);
  }
  return result;
}

function appendConditionalBranch(
  statement: ConditionalStatement,
  node: TreeSitterNode,
  context: ParseContext,
  isElse: boolean,
): void {
  const condition = childForField(node, "condition");
  const consequence =
    childForField(node, "consequence") ??
    childForField(node, "body") ??
    namedChildren(node).find((child) => BODY_TYPES.has(child.type));
  const branchBody = consequence ?? node;
  statement.branches.push({
    ...rangeFromNode(node, context.offset),
    condition: isElse ? undefined : condition?.text,
    conditionLabel: isElse ? undefined : `if ${condition?.text ?? ""}`,
    isElse,
    body: parseBodyNode(branchBody, context),
  });
}

function parseBodyNode(
  node: TreeSitterNode,
  context: ParseContext,
): ControlFlowNode[] {
  if (BODY_TYPES.has(node.type)) {
    return container(node, context);
  }
  const value = convert(node, context);
  return value ? [value] : [];
}

function findIdentifier(node: TreeSitterNode): TreeSitterNode | undefined {
  if (["identifier", "name"].includes(node.type)) {
    return node;
  }
  for (const child of namedChildren(node)) {
    const found = findIdentifier(child);
    if (found) {
      return found;
    }
  }
  return undefined;
}
