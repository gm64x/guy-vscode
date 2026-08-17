import { SourceOffset, SourcePosition, SourceRange } from "../types";

export type SupportedLanguage = "python" | "java" | "php" | "c" | "go" | "rust";

export interface ControlFlowBase extends SourceRange {
  code: string;
}

export interface SimpleStatement extends ControlFlowBase {
  kind: "statement" | "return" | "throw" | "break" | "continue";
}

export interface ControlFlowBranch extends SourceRange {
  condition?: string;
  conditionLabel?: string;
  isElse: boolean;
  body: ControlFlowNode[];
}

export interface ConditionalStatement extends ControlFlowBase {
  kind: "if";
  branches: ControlFlowBranch[];
}

export interface LoopStatement extends ControlFlowBase {
  kind: "loop";
  label: string;
  body: ControlFlowNode[];
  elseBody: ControlFlowNode[];
}

export interface CatchBranch extends ControlFlowBase {
  catchAll: boolean;
  body: ControlFlowNode[];
}

export interface TryStatement extends ControlFlowBase {
  kind: "try";
  label: string;
  body: ControlFlowNode[];
  handlers: CatchBranch[];
  elseBody: ControlFlowNode[];
  finallyBody: ControlFlowNode[];
}

export interface ContainerStatement extends ControlFlowBase {
  kind: "container";
  body: ControlFlowNode[];
}

export interface CallableStatement extends ControlFlowBase {
  kind: "function";
  name: string;
  label: string;
  body: ControlFlowNode[];
}

export type ControlFlowNode =
  | SimpleStatement
  | ConditionalStatement
  | LoopStatement
  | TryStatement
  | ContainerStatement
  | CallableStatement;

export interface ParsedSource {
  body: ControlFlowNode[];
  functions: CallableStatement[];
  diagnostics: string[];
  treeSitterAvailable: boolean;
}

export interface ParseContext {
  source: string;
  offset: SourceOffset;
  wasmFile: string;
}

export interface LanguageAdapter {
  readonly language: SupportedLanguage;
  wasmFileForSource(source: string): string;
  parseRoot(root: TreeSitterNode, context: ParseContext): ControlFlowNode[];
}

export interface LanguageParser {
  parse(source: string, offset?: SourceOffset): Promise<ParsedSource>;
  findCurrentFunction(
    parsed: ParsedSource,
    cursor: SourcePosition,
  ): CallableStatement | undefined;
}

export interface LanguageDefinition {
  language: SupportedLanguage;
  displayName: string;
  vscodeLanguageIds: readonly string[];
  extensions: readonly string[];
  adapter: LanguageAdapter;
}

export interface TreeSitterPoint {
  row: number;
  column: number;
}

export interface TreeSitterNode {
  type: string;
  text: string;
  startPosition: TreeSitterPoint;
  endPosition: TreeSitterPoint;
  namedChildCount: number;
  namedChild(index: number): TreeSitterNode | null;
  childForFieldName(name: string): TreeSitterNode | null;
  hasError: boolean;
}
