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

const CONTAINER_TYPES = new Set([
  "program",
  "php_tag",
  "namespace_definition",
  "class_declaration",
  "interface_declaration",
  "trait_declaration",
  "enum_declaration",
  "class_body",
  "declaration_list",
  "compound_statement",
  "block",
  "ERROR",
]);

const DECLARATION_CONTAINER_TYPES = new Set([
  "namespace_definition",
  "class_declaration",
  "interface_declaration",
  "trait_declaration",
  "enum_declaration",
]);

const BODY_TYPES = new Set([
  "block",
  "compound_statement",
  "class_body",
  "declaration_list",
]);

const CALLABLE_TYPES = new Set([
  "function_definition",
  "method_declaration",
  "constructor_declaration",
  "anonymous_function_creation_expression",
  "arrow_function",
]);

export const phpAdapter: LanguageAdapter = {
  language: "php",
  unsupportedSyntax: {
    goto_statement: "goto statement",
    named_label_statement: "named label",
    yield_expression: "yield expression",
  },
  wasmFileForSource: (source) =>
    /<\?/.test(source)
      ? "tree-sitter-php/tree-sitter-php.wasm"
      : "tree-sitter-php/tree-sitter-php_only.wasm",
  parseRoot: (root, context) => container(root, context),
};

function container(node: TreeSitterNode, context: ParseContext): ControlFlowNode[] {
  return namedChildren(node).flatMap((child) => {
    if (DECLARATION_CONTAINER_TYPES.has(child.type)) {
      const declarationBody = childForField(child, "body") ?? child;
      return [{
        ...rangeFromNode(child, context.offset),
        kind: "container",
        code: firstLine(child.text),
        body: container(declarationBody, context),
      }];
    }
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
  return bodyNode ? parseBody(bodyNode, context) : [];
}

function parseBody(node: TreeSitterNode, context: ParseContext): ControlFlowNode[] {
  return BODY_TYPES.has(node.type) ? container(node, context) : [convert(node, context)].filter(Boolean) as ControlFlowNode[];
}

function convert(node: TreeSitterNode, context: ParseContext): ControlFlowNode | undefined {
  const range = rangeFromNode(node, context.offset);

  if (!CALLABLE_TYPES.has(node.type)) {
    const nestedCallable = findCallable(node);
    if (nestedCallable) {
      return convert(nestedCallable, context);
    }
  }

  if (CALLABLE_TYPES.has(node.type)) {
    const nameNode = childForField(node, "name");
    const name = nameNode?.text ??
      (node.type === "anonymous_function_creation_expression" || node.type === "arrow_function"
        ? "<closure>"
        : firstLine(node.text).match(/function\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/)?.[1] ?? "<function>");
    return {
      ...range,
      kind: "function",
      name,
      label: `${name}(...)`,
      code: firstLine(node.text),
      body: body(node, context),
    };
  }

  if (node.type === "if_statement" || node.type === "elseif_clause" || node.type === "else_if_clause") {
    return conditional(node, context);
  }

  if (["for_statement", "enhanced_for_statement", "foreach_statement", "while_statement", "do_statement"].includes(node.type)) {
    const condition = childForField(node, "condition") ?? namedChildren(node).find(
      (child) => !BODY_TYPES.has(child.type),
    );
    const keyword = node.type === "while_statement" ? "while" :
      node.type === "do_statement" ? "do/while" : "foreach";
    return {
      ...range,
      kind: "loop",
      label: node.type === "do_statement"
        ? `do while ${condition?.text ?? ""}`
        : `${keyword} ${condition?.text ?? firstLine(node.text)}`,
      code: firstLine(node.text),
      body: body(node, context),
      elseBody: [],
    };
  }

  if (node.type === "try_statement") {
    const handlers = namedChildren(node)
      .filter((child) => child.type === "catch_clause" || child.type === "catch_block" || child.type === "handler")
      .map((handler) => ({
        ...rangeFromNode(handler, context.offset),
        code: firstLine(handler.text),
        catchAll: !childForField(handler, "parameter") && !childForField(handler, "type"),
        body: body(handler, context),
      }));
    const finallyClause = namedChildren(node).find((child) => child.type === "finally_clause");
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

  if (node.type === "switch_statement") {
    return switchStatement(node, context);
  }

  if (node.type === "match_expression") {
    return matchStatement(node, context);
  }

  const simpleKinds: Record<string, "return" | "throw" | "break" | "continue"> = {
    return_statement: "return",
    throw_statement: "throw",
    break_statement: "break",
    continue_statement: "continue",
  };
  const simpleKind = simpleKinds[node.type];
  if (simpleKind) {
    return { ...range, kind: simpleKind, code: node.text };
  }
  if (
    node.type === "throw_expression" ||
    (node.type === "expression_statement" &&
      namedChildren(node).some((child) => child.type === "throw_expression"))
  ) {
    return { ...range, kind: "throw", code: node.text };
  }

  // The IR has no jump/label kinds; preserve both nodes instead of dropping them.
  return { ...range, kind: "statement", code: node.text };
}

function findCallable(node: TreeSitterNode): TreeSitterNode | undefined {
  for (const child of namedChildren(node)) {
    if (CALLABLE_TYPES.has(child.type)) {
      return child;
    }
    const nested = findCallable(child);
    if (nested) {
      return nested;
    }
  }
  return undefined;
}

function switchStatement(node: TreeSitterNode, context: ParseContext): ConditionalStatement {
  const switchBody = childForField(node, "body");
  const clauses = switchBody
    ? namedChildren(switchBody).filter((child) =>
        child.type === "case_statement" || child.type === "default_statement",
      )
    : [];
  const branches = clauses.map((clause) => {
    const value = childForField(clause, "value");
    const branchBody = namedChildren(clause).flatMap((child) => {
      if (child === value) {return [];}
      const parsed = convert(child, context);
      return parsed && parsed.kind !== "break" ? [parsed] : [];
    });
    const isDefault = clause.type === "default_statement";
    return {
      ...rangeFromNode(clause, context.offset),
      condition: isDefault ? undefined : value?.text,
      conditionLabel: isDefault ? undefined : `case ${value?.text ?? ""}`,
      isElse: isDefault,
      body: branchBody,
    };
  });
  return {
    ...rangeFromNode(node, context.offset),
    kind: "if",
    code: firstLine(node.text),
    branches,
  };
}

function matchStatement(node: TreeSitterNode, context: ParseContext): ConditionalStatement {
  const arms = namedChildren(node).flatMap((child) => matchArms(child));
  const branches = arms.map((arm) => {
    const text = firstLine(arm.text).replace(/=>[\s\S]*$/, "").trim();
    const value = childForField(arm, "body") ?? childForField(arm, "value") ?? namedChildren(arm).at(-1);
    const isDefault = /\bdefault\b/.test(text);
    return {
      ...rangeFromNode(arm, context.offset),
      condition: isDefault ? undefined : text,
      conditionLabel: isDefault ? undefined : `match ${text}`,
      isElse: isDefault,
      body: value ? parseBody(value, context) : [],
    };
  });
  return { ...rangeFromNode(node, context.offset), kind: "if", code: firstLine(node.text), branches };
}

function matchArms(node: TreeSitterNode): TreeSitterNode[] {
  if (node.type === "match_condition") {
    return [node];
  }
  if (node.type !== "match_block") {
    return [];
  }
  const conditions = namedChildren(node).filter((child) => child.type === "match_condition");
  return conditions.length > 0 ? conditions : [node];
}

function conditional(node: TreeSitterNode, context: ParseContext): ConditionalStatement {
  const result: ConditionalStatement = {
    ...rangeFromNode(node, context.offset),
    kind: "if",
    code: firstLine(node.text),
    branches: [],
  };
  appendBranch(result, node, context, false);
  for (const clause of namedChildren(node).filter((child) =>
    ["elseif_clause", "else_if_clause", "else_clause"].includes(child.type),
  )) {
    appendBranch(result, clause, context, clause.type === "else_clause");
  }
  const alternative = childForField(node, "alternative");
  if (result.branches.length === 1 && alternative) {
    if (["if_statement", "elseif_clause", "else_if_clause"].includes(alternative.type)) {
      result.branches.push(...conditional(alternative, context).branches);
    } else {
      appendBranch(result, alternative, context, true);
    }
  }
  return result;
}

function appendBranch(result: ConditionalStatement, node: TreeSitterNode, context: ParseContext, isElse: boolean): void {
  const condition = childForField(node, "condition");
  result.branches.push({
    ...rangeFromNode(node, context.offset),
    condition: isElse ? undefined : condition?.text,
    conditionLabel: isElse ? undefined : `if ${condition?.text ?? ""}`,
    isElse,
    body: body(node, context),
  });
}
