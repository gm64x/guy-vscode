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
  "source_file",
  "block",
  "match_block",
  "declaration_list",
  "impl_item",
  "trait_item",
  "mod_item",
]);
const FUNCTION_TYPES = new Set([
  "function_item",
  "closure_expression",
]);
const LOOP_TYPES = new Set([
  "loop_expression",
  "while_expression",
  "for_expression",
]);
const ARM_TYPES = new Set(["match_arm"]);

export const rustAdapter: LanguageAdapter = {
  language: "rust",
  wasmFileForSource: () => "tree-sitter-wasm/out/rust/tree-sitter-rust.wasm",
  parseRoot: (root, context) => parseContainer(root, context),
};

function parseContainer(
  node: TreeSitterNode,
  context: ParseContext,
): ControlFlowNode[] {
  return namedChildren(node).flatMap((child) => {
    if (CONTAINER_TYPES.has(child.type)) {
      return parseContainer(child, context);
    }
    const parsed = convert(child, context);
    return parsed ? [parsed] : [];
  });
}

function parseBody(
  node: TreeSitterNode | undefined,
  context: ParseContext,
): ControlFlowNode[] {
  if (!node) {return [];}
  return CONTAINER_TYPES.has(node.type)
    ? parseContainer(node, context)
    : [convert(node, context)].filter(
        (item): item is ControlFlowNode => Boolean(item),
      );
}

function convert(
  node: TreeSitterNode,
  context: ParseContext,
): ControlFlowNode | undefined {
  const range = rangeFromNode(node, context.offset);

  if (FUNCTION_TYPES.has(node.type)) {
    const name = node.type === "closure_expression"
      ? "<closure>"
      : childForField(node, "name")?.text ?? functionName(node.text);
    const asyncPrefix = /\basync\b/.test(firstLine(node.text)) ? "async " : "";
    return {
      ...range,
      kind: "function",
      name,
      label: `${asyncPrefix}${name}(...)`,
      code: firstLine(node.text),
      body: parseBody(childForField(node, "body"), context),
    };
  }

  if (node.type === "async_block") {
    return {
      ...range,
      kind: "container",
      code: firstLine(node.text),
      body: parseBody(childForField(node, "body"), context),
    };
  }

  if (node.type === "expression_statement") {
    const expression = namedChildren(node)[0];
    return expression ? convert(expression, context) : undefined;
  }

  if (node.type === "if_expression") {
    return parseIf(node, context);
  }

  if (LOOP_TYPES.has(node.type)) {
    const header = firstLine(node.text).split("{", 1)[0]?.trim() ?? node.text;
    return {
      ...range,
      kind: "loop",
      label: header,
      code: firstLine(node.text),
      body: parseBody(childForField(node, "body"), context),
      elseBody: [],
    };
  }

  if (node.type === "match_expression") {
    return parseMatch(node, context);
  }

  if (node.type === "labeled_statement") {
    const label = childForField(node, "label") ?? namedChildren(node)[0];
    const statement = childForField(node, "body") ??
      childForField(node, "statement") ?? namedChildren(node)[1];
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
    return_expression: "return",
    break_expression: "break",
    continue_expression: "continue",
  };
  const simpleKind = simpleKinds[node.type];
  if (simpleKind) {
    return { ...range, kind: simpleKind, code: node.text };
  }

  if (node.type === "try_expression" || isPanic(node)) {
    return { ...range, kind: "throw", code: node.text };
  }

  // Rust expressions, declarations, await expressions, labels, and grammar
  // nodes not modeled above remain visible as ordinary statements.
  return { ...range, kind: "statement", code: node.text };
}

function parseIf(
  node: TreeSitterNode,
  context: ParseContext,
): ConditionalStatement {
  const condition = childForField(node, "condition");
  const consequence = childForField(node, "consequence") ??
    childForField(node, "body");
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
  const nestedAlternative = alternative && namedChildren(alternative).find(
    (child) => child.type === "if_expression",
  );
  if (nestedAlternative) {
    result.branches.push(...parseIf(nestedAlternative, context).branches);
  } else if (alternative) {
    result.branches.push({
      ...rangeFromNode(alternative, context.offset),
      isElse: true,
      body: parseBody(alternative, context),
    });
  }
  return result;
}

function parseMatch(
  node: TreeSitterNode,
  context: ParseContext,
): ConditionalStatement {
  const matchBody = childForField(node, "body");
  const arms = findArms(matchBody ?? node);
  const branches = arms.map((arm) => {
    const pattern = childForField(arm, "pattern") ?? namedChildren(arm)[0];
    const body = childForField(arm, "value") ?? namedChildren(arm).at(-1);
    const isDefault = pattern?.text === "_";
    return {
      ...rangeFromNode(arm, context.offset),
      condition: isDefault ? undefined : pattern?.text,
      conditionLabel: isDefault ? "default" : `match ${pattern?.text ?? ""}`,
      isElse: isDefault,
      body: parseBody(body, context),
    };
  });
  return {
    ...rangeFromNode(node, context.offset),
    kind: "if",
    code: firstLine(node.text),
    branches: branches.length > 0 ? branches : [{
      ...rangeFromNode(node, context.offset),
      conditionLabel: firstLine(node.text),
      isElse: false,
      body: parseBody(matchBody, context),
    }],
  };
}

function findArms(node: TreeSitterNode): TreeSitterNode[] {
  return namedChildren(node).flatMap((child) =>
    ARM_TYPES.has(child.type) ? [child] : findArms(child),
  );
}

function functionName(text: string): string {
  return text.match(/\bfn\s+([A-Za-z_][A-Za-z0-9_]*)/)?.[1] ?? "<function>";
}

function isPanic(node: TreeSitterNode): boolean {
  return node.type === "macro_invocation" && /^panic\s*!/.test(node.text.trim());
}
