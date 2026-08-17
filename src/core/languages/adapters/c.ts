import { createGenericAdapter } from "../generic";
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

const genericAdapter = createGenericAdapter("c", () => "tree-sitter-c/tree-sitter-c.wasm");

export const cAdapter: LanguageAdapter = {
  language: "c",
  wasmFileForSource: genericAdapter.wasmFileForSource,
  parseRoot: (root, context) => parseContainer(root, context),
};

function parseContainer(
  node: TreeSitterNode,
  context: ParseContext,
): ControlFlowNode[] {
  return namedChildren(node).flatMap((child) => {
    if (["translation_unit", "compound_statement", "declaration_list"].includes(child.type)) {
      return parseContainer(child, context);
    }
    const parsed = parseNode(child, context);
    return parsed ? [parsed] : [];
  });
}

function parseBody(node: TreeSitterNode | undefined, context: ParseContext): ControlFlowNode[] {
  if (!node) {return [];}
  return ["compound_statement", "declaration_list"].includes(node.type)
    ? parseContainer(node, context)
    : [parseNode(node, context)].filter((item): item is ControlFlowNode => Boolean(item));
}

function parseNode(
  node: TreeSitterNode,
  context: ParseContext,
): ControlFlowNode | undefined {
  const range = rangeFromNode(node, context.offset);

  if (node.type === "function_definition") {
    const declarator = childForField(node, "declarator");
    const name = findIdentifier(declarator ?? node)?.text ?? "<function>";
    return {
      ...range,
      kind: "function",
      name,
      label: `${name}(...)`,
      code: firstLine(node.text),
      body: parseBody(childForField(node, "body"), context),
    };
  }

  if (node.type === "if_statement") {
    return conditional(node, context);
  }

  if (["for_statement", "while_statement", "do_statement"].includes(node.type)) {
    const condition = childForField(node, "condition");
    const header = node.type === "do_statement"
      ? `do/while (${condition?.text ?? ""})`
      : firstLine(node.text).split("{", 1)[0]?.trim() ?? firstLine(node.text);
    const keyword = node.type === "do_statement"
      ? "do/while"
      : node.type === "while_statement" ? "while" : "for";
    return {
      ...range,
      kind: "loop",
      label: header || `${keyword} ${condition?.text ?? ""}`,
      code: firstLine(node.text),
      body: parseBody(childForField(node, "body"), context),
      elseBody: [],
    };
  }

  if (node.type === "switch_statement") {
    return switchStatement(node, context);
  }

  if (node.type === "labeled_statement") {
    const label = childForField(node, "label") ?? namedChildren(node)[0];
    const statement = childForField(node, "statement") ?? namedChildren(node)[1];
    return {
      ...range,
      kind: "container",
      code: firstLine(node.text),
      body: [
        {
          ...rangeFromNode(label ?? node, context.offset),
          kind: "statement",
          code: label?.text ?? firstLine(node.text),
        },
        ...parseBody(statement, context),
      ],
    };
  }

  const simpleKinds: Record<string, "return" | "break" | "continue"> = {
    return_statement: "return",
    break_statement: "break",
    continue_statement: "continue",
  };
  if (simpleKinds[node.type]) {
    return { ...range, kind: simpleKinds[node.type], code: node.text };
  }

  if (node.type === "goto_statement") {
    return { ...range, kind: "statement", code: node.text };
  }

  if (node.type === "compound_statement" || node.type === "declaration_list") {
    return { ...range, kind: "container", code: firstLine(node.text), body: parseContainer(node, context) };
  }

  return { ...range, kind: "statement", code: node.text };
}

function conditional(node: TreeSitterNode, context: ParseContext): ConditionalStatement {
  const condition = childForField(node, "condition");
  const consequence = childForField(node, "consequence") ?? childForField(node, "body");
  const result: ConditionalStatement = {
    ...rangeFromNode(node, context.offset),
    kind: "if",
    code: firstLine(node.text),
    branches: [{
      ...rangeFromNode(node, context.offset),
      condition: condition?.text,
      conditionLabel: `if ${condition?.text ?? ""}`,
      isElse: false,
      body: parseBody(consequence, context),
    }],
  };
  const alternative = childForField(node, "alternative");
  if (alternative?.type === "if_statement") {
    result.branches.push(...conditional(alternative, context).branches);
  } else if (alternative) {
    result.branches.push({
      ...rangeFromNode(alternative, context.offset),
      isElse: true,
      body: parseBody(alternative, context),
    });
  }
  return result;
}

function switchStatement(node: TreeSitterNode, context: ParseContext): ConditionalStatement {
  const condition = childForField(node, "condition");
  const switchBody = childForField(node, "body");
  const switchChildren = namedChildren(switchBody ?? node);
  const clauseIndexes = switchChildren
    .map((child, index) => [child, index] as const)
    .filter(([child]) => child.type === "case_statement");
  const branches = clauseIndexes.map(([clause, index], clauseIndex) => {
    const value = childForField(clause, "value");
    const body = childForField(clause, "body");
    const nextIndex = clauseIndexes[clauseIndex + 1]?.[1] ?? switchChildren.length;
    const trailingBody = switchChildren
      .slice(index + 1, nextIndex)
      .map((child) => parseNode(child, context))
      .filter((item): item is ControlFlowNode => Boolean(item));
    const clauseBody = body
      ? [...parseBody(body, context), ...trailingBody]
      : namedChildren(clause)
          .filter((child) => child !== value)
          .flatMap((child) => parseBody(child, context));
    return {
      ...rangeFromNode(clause, context.offset),
      condition: value?.text,
      conditionLabel: value ? `case ${value.text}` : "default",
      isElse: !value,
      body: clauseBody,
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
          condition: condition?.text,
          conditionLabel: `switch ${condition?.text ?? ""}`,
          isElse: false,
          body: parseBody(switchBody, context),
        }],
  };
}

function findIdentifier(node: TreeSitterNode): TreeSitterNode | undefined {
  if (["identifier", "field_identifier", "type_identifier"].includes(node.type)) {
    return node;
  }
  for (const child of namedChildren(node)) {
    const found = findIdentifier(child);
    if (found) {return found;}
  }
  return undefined;
}

