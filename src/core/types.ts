export type CFGNodeKind =
  | "entry"
  | "exit"
  | "statement"
  | "condition"
  | "loop"
  | "return"
  | "merge";

export type CFGEdgeLabel =
  | "true"
  | "false"
  | "next"
  | "loop"
  | "break"
  | "continue"
  | "return";

export type CFGSourceMode = "file" | "selection" | "function";
export type CFGViewMode = "simplified" | "detailed";

export interface SourceRange {
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
}

export interface CFGNode extends SourceRange {
  id: string;
  label: string;
  kind: CFGNodeKind;
  code: string;
}

export interface CFGEdge {
  id: string;
  from: string;
  to: string;
  label?: CFGEdgeLabel;
}

export interface CFGMetrics {
  nodeCount: number;
  edgeCount: number;
  decisionCount: number;
  connectedComponents: number;
  cyclomaticComplexity: number;
  simplifiedCyclomaticComplexity: number;
}

export interface CFGIndependentPath {
  id: string;
  label: string;
  nodeIds: string[];
  edgeIds: string[];
}

export interface CFGAnalysis {
  highComplexityThreshold: number;
  suggestions: string[];
  independentPathLimitReason?: string;
  showMetricsPanel: boolean;
  maxNodesBeforeWarning: number;
  graphLayout: "top-bottom" | "left-right";
}

export interface CFGSourceMeta {
  mode: CFGSourceMode;
  fileName?: string;
  functionName?: string;
  language: "python";
  viewMode: CFGViewMode;
  generatedAt: string;
}

export interface PythonFunctionInfo extends SourceRange {
  name: string;
}

export interface CFG {
  nodes: CFGNode[];
  edges: CFGEdge[];
  entryNodeId: string;
  exitNodeId: string;
  metrics: CFGMetrics;
  independentPaths: CFGIndependentPath[];
  analysis: CFGAnalysis;
  sourceMeta: CFGSourceMeta;
  functions: PythonFunctionInfo[];
  diagnostics: string[];
}

export interface GenerateCFGOptions {
  source: string;
  fileName?: string;
  mode: CFGSourceMode;
  viewMode: CFGViewMode;
  selectionOffset?: SourceOffset;
  cursor?: SourcePosition;
  highComplexityThreshold?: number;
  showMetricsPanel?: boolean;
  maxNodesBeforeWarning?: number;
  graphLayout?: "top-bottom" | "left-right";
}

export interface SourcePosition {
  line: number;
  column: number;
}

export interface SourceOffset {
  line: number;
  column: number;
}
