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

const CONTAINERS = new Set([
  "program",
  "class_declaration",
  "interface_declaration",
  "enum_declaration",
  "annotation_type_declaration",
  "class_body",
  "interface_body",
  "enum_body",
  "annotation_type_body",
  "module_declaration",
  "module_body",
]);

const BODIES = new Set(["block", "class_body", "interface_body", "enum_body"]);

export const javaAdapter: LanguageAdapter = {
  language: "java",
  unsupportedSyntax: {
    labeled_statement: "labeled control flow",
    yield_statement: "yield statement",
    assert_statement: "assert statement",
  },
  wasmFileForSource: () => "tree-sitter-java/tree-sitter-java.wasm",
  parseRoot: (root, context) => container(root, context),
};

function container(node: TreeSitterNode, context: ParseContext): ControlFlowNode[] {
  return namedChildren(node).flatMap((child) => {
    if (CONTAINERS.has(child.type)) {
      return container(childForField(child, "body") ?? child, context);
    }
    const value = convert(child, context);
    return value ? [value] : [];
  });
}

function parseBody(node: TreeSitterNode, context: ParseContext): ControlFlowNode[] {
  if (BODIES.has(node.type)) {
    return container(node, context);
  }
  const value = convert(node, context);
  return value ? [value] : [];
}

function body(node: TreeSitterNode, context: ParseContext): ControlFlowNode[] {
  const bodyNode =
    childForField(node, "body") ??
    childForField(node, "consequence") ??
    childForField(node, "statement") ??
    namedChildren(node).find((child) => BODIES.has(child.type));
  return bodyNode ? parseBody(bodyNode, context) : [];
}

function convert(node: TreeSitterNode, context: ParseContext): ControlFlowNode | undefined {
  const range = rangeFromNode(node, context.offset);

  if (["method_declaration", "constructor_declaration"].includes(node.type)) {
    const name = childForField(node, "name")?.text ?? findIdentifier(node)?.text ?? "<function>";
    return {
      ...range,
      kind: "function",
      name,
      label: `${name}(...)`,
      code: firstLine(node.text),
      body: body(node, context),
    };
  }

  if (node.type === "if_statement") {
    return conditional(node, context);
  }

  if (["for_statement", "enhanced_for_statement", "while_statement", "do_statement"].includes(node.type)) {
    const condition = childForField(node, "condition");
    const keyword = node.type === "do_statement" ? "do/while" : node.type === "while_statement" ? "while" : "for";
    return {
      ...range,
      kind: "loop",
      label: `${keyword}${condition ? ` ${condition.text}` : ""}`,
      code: firstLine(node.text),
      body: body(node, context),
      elseBody: [],
    };
  }

  if (node.type === "switch_statement" || node.type === "switch_expression") {
    return switchStatement(node, context);
  }

  if (["try_statement", "try_with_resources_statement"].includes(node.type)) {
    const handlers = namedChildren(node)
      .filter((child) => child.type === "catch_clause")
      .map((handler) => ({
        ...rangeFromNode(handler, context.offset),
        code: firstLine(handler.text),
        catchAll: !childForField(handler, "parameter"),
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

  if (node.type === "synchronized_statement") {
    return {
      ...range,
      kind: "container",
      code: firstLine(node.text),
      body: body(node, context),
    };
  }

  if (node.type === "labeled_statement") {
    const statement =
      childForField(node, "body") ??
      childForField(node, "statement") ??
      namedChildren(node).find((child) => child.type !== "identifier");
    return {
      ...range,
      kind: "container",
      code: firstLine(node.text),
      body: statement ? parseBody(statement, context) : [],
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
  if (node.type === "throw_expression") {
    return { ...range, kind: "throw", code: node.text };
  }

  return { ...range, kind: "statement", code: node.text };
}

function conditional(node: TreeSitterNode, context: ParseContext): ConditionalStatement {
  const result: ConditionalStatement = {
    ...rangeFromNode(node, context.offset),
    kind: "if",
    code: firstLine(node.text),
    branches: [],
  };
  appendBranch(result, node, context, false);
  const alternative = childForField(node, "alternative");
  if (alternative?.type === "if_statement") {
    result.branches.push(...conditional(alternative, context).branches);
  } else if (alternative) {
    appendBranch(result, alternative, context, true);
  }
  return result;
}

function appendBranch(
  result: ConditionalStatement,
  node: TreeSitterNode,
  context: ParseContext,
  isElse: boolean,
): void {
  const condition = childForField(node, "condition");
  const branch = childForField(node, "consequence") ?? childForField(node, "body") ?? node;
  result.branches.push({
    ...rangeFromNode(node, context.offset),
    condition: isElse ? undefined : condition?.text,
    conditionLabel: isElse ? undefined : `if ${condition?.text ?? ""}`,
    isElse,
    body: parseBody(branch, context),
  });
}

function switchStatement(node: TreeSitterNode, context: ParseContext): ConditionalStatement {
  const result: ConditionalStatement = {
    ...rangeFromNode(node, context.offset),
    kind: "if",
    code: firstLine(node.text),
    branches: [],
  };
  const switchBody = childForField(node, "body") ?? namedChildren(node).find((child) => child.type === "switch_block");
  const groups = switchBody ? namedChildren(switchBody) : [];
  for (const group of groups) {
    const labels = namedChildren(group).filter((child) => child.type === "switch_label");
    const statements = namedChildren(group).filter((child) => child.type !== "switch_label");
    if (group.type === "switch_rule") {
      const label = childForField(group, "label") ?? labels[0];
      labels.splice(0, labels.length, ...(label ? [label] : []));
    }
    for (const label of labels) {
      const isDefault = /^default\b/.test(label.text.trim());
      const ruleBody = childForField(group, "body") ?? childForField(group, "value");
      result.branches.push({
        ...rangeFromNode(label, context.offset),
        condition: isDefault ? undefined : label.text,
        conditionLabel: isDefault ? undefined : label.text,
        isElse: isDefault,
        body: ruleBody
          ? parseBody(ruleBody, context)
          : statements.flatMap((statement) => parseBody(statement, context)),
      });
    }
  }
  return result;
}

function findIdentifier(node: TreeSitterNode): TreeSitterNode | undefined {
  if (node.type === "identifier") {
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
