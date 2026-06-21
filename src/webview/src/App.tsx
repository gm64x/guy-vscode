import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  applyNodeChanges,
  Background,
  Edge,
  Handle,
  Node,
  NodeChange,
  NodeProps,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
} from "@xyflow/react";
import dagre from "@dagrejs/dagre";
import "@xyflow/react/dist/style.css";
import "./styles.css";

/* ---- Types ---- */

type CFGNode = {
  id: string;
  label: string;
  kind:
    | "entry"
    | "exit"
    | "statement"
    | "condition"
    | "loop"
    | "return"
    | "merge";
  code: string;
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
};

type CFGEdge = {
  id: string;
  from: string;
  to: string;
  label?: string;
};

type CFG = {
  nodes: CFGNode[];
  edges: CFGEdge[];
  entryNodeId: string;
  exitNodeId: string;
  metrics: {
    nodeCount: number;
    edgeCount: number;
    decisionCount: number;
    connectedComponents: number;
    cyclomaticComplexity: number;
    simplifiedCyclomaticComplexity: number;
  };
  independentPaths: Array<{
    id: string;
    label: string;
    nodeIds: string[];
    edgeIds: string[];
  }>;
  analysis: {
    highComplexityThreshold: number;
    suggestions: string[];
    independentPathLimitReason?: string;
  };
  sourceMeta: {
    mode: "file" | "selection" | "function";
    fileName?: string;
    functionName?: string;
    viewMode: "simplified" | "detailed";
  };
  functions: Array<{ name: string; startLine: number }>;
  diagnostics: string[];
};

type WebviewState = "empty" | "loading" | "error" | "success";
type SidebarTab = "nodes" | "edges" | "functions" | "paths";

declare global {
  interface Window {
    __GUY_INITIAL_CFG__?: CFG | null;
    acquireVsCodeApi?: () => {
      postMessage: (message: unknown) => void;
    };
  }
}

const vscode = window.acquireVsCodeApi?.();

/* ---- Custom Node Component ---- */

function CFGNodeComponent({
  data,
  selected,
}: NodeProps & {
  data: { label: string; kind: string; code: string; line: number };
}) {
  const kindLabel = data.kind.charAt(0).toUpperCase() + data.kind.slice(1);
  return (
    <div
      className="cfg-node-content"
      title={`${kindLabel}: ${data.label}\nLine ${data.line}${data.code && data.code !== data.label ? `\n${data.code}` : ""}`}
    >
      <Handle
        type="target"
        position={Position.Top}
        style={{ visibility: "hidden" }}
      />
      <div className="cfg-node-kind">{data.kind}</div>
      <div className="cfg-node-label">{data.label}</div>
      {data.code && data.code !== data.label ? (
        <div className="cfg-node-code">{data.code.split("\n")[0]}</div>
      ) : null}
      <div className="cfg-node-line">L{data.line}</div>
      <Handle
        type="source"
        position={Position.Bottom}
        style={{ visibility: "hidden" }}
      />
    </div>
  );
}

const nodeTypes = { default: CFGNodeComponent };

/* ---- Icons (hand-drawn minimal paths) ---- */

const ICON_PATHS: Record<string, string> = {
  gitBranch: "M6 3v12m6-12v12m-3-6v6m0-6a3 3 0 1 0-3 3",
  alertTriangle:
    "M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4m0 4h.01",
  workflow:
    "M16 4h2a2 2 0 0 1 2 2v2m0 4v2a2 2 0 0 1-2 2h-2m0-12h-2a2 2 0 0 0-2 2v2m0 4v2a2 2 0 0 0 2 2h2M6 8h8M10 8v8",
  maximize:
    "M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3",
  rotateCcw: "M1 4v6h6M3.51 15a9 9 0 1 0 2.13-9.36L1 10",
  focus: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 6v8m-4-4h8",
  zoomIn: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zm6-2 4 4M11 8v6m3-3H8",
  zoomOut: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zm6-2 4 4M8 11h6",
  network:
    "M12 2a3 3 0 0 0-3 3c0 1.3.84 2.4 2 2.82V11H7.5A2.5 2.5 0 0 0 5 13.5v.68A3 3 0 0 0 3 17a3 3 0 1 0 6 0 3 3 0 0 0-2-2.82V13.5A.5.5 0 0 1 7.5 13h9a.5.5 0 0 1 .5.5v.68A3 3 0 0 0 15 17a3 3 0 1 0 6 0 3 3 0 0 0-2-2.82V13.5A2.5 2.5 0 0 0 16.5 11H13V7.82A3 3 0 0 0 15 5a3 3 0 0 0-3-3z",
  brances:
    "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71",
  fileJson:
    "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8m-6-6-4 4h4V2z",
  fileCode:
    "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8m-6-6-4 4h4V2z",
  layers: "M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5",
  image:
    "M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zm-2 0",
  fileType:
    "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8m-6-6-4 4h4V2z",
  eye: "M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8zm11-3a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
  eyeOff:
    "M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24M1 1l22 22",
  chevronLeft: "M15 18l-6-6 6-6",
  chevronRight: "M9 6l6 6-6 6",
  list: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
  search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zm6.5-2.5L21 21",
};

function Icon({ name, size = 15 }: { name: string; size?: number }) {
  const d = ICON_PATHS[name] ?? ICON_PATHS.search;
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={d} />
    </svg>
  );
}

/* ---- Helpers ---- */

function getComplexityClass(value: number, threshold: number): string {
  if (value <= threshold) return "good";
  if (value <= threshold * 2) return "warning";
  return "critical";
}

function describeSource(cfg: CFG): string {
  const source = cfg.sourceMeta.functionName
    ? `fn: ${cfg.sourceMeta.functionName}`
    : cfg.sourceMeta.mode;
  const file = cfg.sourceMeta.fileName?.split(/[\\/]/).pop() ?? "untitled";
  return `${source} — ${file}`;
}

function toFlowGraph(
  cfg: CFG | null,
  selectedNodeId?: string,
  selectedEdgeId?: string,
  selectedPath?: { nodeIds: string[]; edgeIds: string[] } | null,
): { nodes: Node[]; edges: Edge[] } {
  if (!cfg) return { nodes: [], edges: [] };

  const nodeMap = new Map(cfg.nodes.map((n) => [n.id, n]));
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: "TB",
    nodesep: 70,
    ranksep: 100,
    ranker: "longest-path",
  });

  const nodes: Node[] = cfg.nodes.map((node) => {
    const inPath = selectedPath?.nodeIds.includes(node.id) ?? false;
    const isEntry = node.kind === "entry";
    const isExit = node.kind === "exit";
    const isCondition = node.kind === "condition";
    const isLoop = node.kind === "loop";
    const w = isCondition || isLoop ? 180 : isEntry || isExit ? 120 : 180;
    const h = isCondition || isLoop ? 56 : 48;
    g.setNode(node.id, { width: w, height: h });
    return {
      id: node.id,
      type: "default",
      data: {
        label: node.label,
        kind: node.kind,
        code: node.code,
        line: node.startLine + 1,
      },
      className: `cfg-node cfg-${node.kind}${selectedNodeId === node.id || inPath ? " selected" : ""}`,
      position: { x: 0, y: 0 },
      sourcePosition: Position.Bottom,
      targetPosition: Position.Top,
      draggable: true,
    };
  });

  cfg.edges.forEach((edge) =>
    g.setEdge(edge.from, edge.to, {
      minlen: edge.label === "loop" || edge.label === "continue" ? 2 : 1,
    }),
  );
  dagre.layout(g);

  const laidOutNodes = nodes.map((node) => {
    const pos = g.node(node.id);
    return {
      ...node,
      position: { x: pos.x - pos.width / 2, y: pos.y - pos.height / 2 },
    };
  });

  const edges: Edge[] = cfg.edges.map((edge) => ({
    id: edge.id,
    source: edge.from,
    target: edge.to,
    label: edge.label,
    animated: edge.label === "loop" || edge.label === "continue",
    className:
      selectedEdgeId === edge.id || selectedPath?.edgeIds.includes(edge.id)
        ? "selected"
        : "",
    markerEnd: { type: "arrowclosed" as const },
    type: "smoothstep",
  }));

  return { nodes: laidOutNodes, edges };
}

/* ---- Main App ---- */

function AppShell() {
  return (
    <ReactFlowProvider>
      <App />
    </ReactFlowProvider>
  );
}

function App() {
  const [cfg, setCfg] = useState<CFG | null>(
    window.__GUY_INITIAL_CFG__ ?? null,
  );
  const [state, setState] = useState<WebviewState>(
    window.__GUY_INITIAL_CFG__ ? "success" : "empty",
  );
  const [error, setError] = useState("");
  const [selectedNodeId, setSelectedNodeId] = useState<string | undefined>();
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | undefined>();
  const [selectedPathId, setSelectedPathId] = useState<string | undefined>();
  const [activeTab, setActiveTab] = useState<SidebarTab>("nodes");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [flowNodes, setFlowNodes] = useState<Node[]>([]);
  const [flowEdges, setFlowEdges] = useState<Edge[]>([]);
  const reactFlow = useReactFlow();

  useEffect(() => {
    const listener = (event: MessageEvent) => {
      const msg = event.data;
      if (msg.type === "CFG_DATA") {
        setCfg(msg.payload);
        setState("success");
        setError("");
        setSelectedNodeId(undefined);
        setSelectedEdgeId(undefined);
        setSelectedPathId(undefined);
      } else if (msg.type === "LOADING") {
        setState("loading");
      } else if (msg.type === "ERROR") {
        setState("error");
        setError(msg.payload.message);
      } else if (msg.type === "HIGHLIGHT_NODE") {
        setSelectedNodeId(msg.payload.nodeId);
        setSelectedEdgeId(undefined);
      }
    };
    window.addEventListener("message", listener);
    return () => window.removeEventListener("message", listener);
  }, [cfg, selectedPathId]);

  // Recalculate dagre layout only when CFG changes (not on selection changes)
  useEffect(() => {
    if (!cfg) return;
    const { nodes, edges } = toFlowGraph(cfg);
    setFlowNodes(nodes);
    setFlowEdges(edges);
  }, [cfg]);

  // Re-apply selection styling without resetting positions
  useEffect(() => {
    if (!cfg) return;
    const selectedPath = cfg.independentPaths.find(
      (p) => p.id === selectedPathId,
    );
    const pathNodeIds = new Set(selectedPath?.nodeIds ?? []);
    const pathEdgeIds = new Set(selectedPath?.edgeIds ?? []);

    setFlowNodes((prev) =>
      prev.map((node) => {
        const inPath = pathNodeIds.has(node.id);
        const isSelected = node.id === selectedNodeId;
        const baseClass = `cfg-node cfg-${node.data.kind as string}`;
        const selectedClass = isSelected || inPath ? " selected" : "";
        return {
          ...node,
          className: `${baseClass}${selectedClass}`,
        };
      }),
    );

    setFlowEdges((prev) =>
      prev.map((edge) => {
        const inPath = pathEdgeIds.has(edge.id);
        const isSelected = edge.id === selectedEdgeId;
        return {
          ...edge,
          className: isSelected || inPath ? "selected" : "",
        };
      }),
    );
  }, [cfg, selectedNodeId, selectedEdgeId, selectedPathId]);

  useEffect(() => {
    if (cfg && state === "success") {
      const id = setTimeout(() => {
        void reactFlow.fitView({ padding: 0.2, duration: 300 });
      }, 50);
      return () => clearTimeout(id);
    }
  }, [cfg, state, reactFlow]);

  const selectedPath = useMemo(
    () => cfg?.independentPaths.find((p) => p.id === selectedPathId),
    [cfg, selectedPathId],
  );
  const selectedNode = useMemo(
    () => cfg?.nodes.find((n) => n.id === selectedNodeId),
    [cfg, selectedNodeId],
  );

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setFlowNodes((nds) => applyNodeChanges(changes, nds));
  }, []);

  const selectNode = useCallback((nodeId: string) => {
    setSelectedNodeId(nodeId);
    setSelectedEdgeId(undefined);
    setSelectedPathId(undefined);
    vscode?.postMessage({ type: "NODE_SELECTED", payload: { nodeId } });
  }, []);

  const selectEdge = useCallback((edgeId: string) => {
    setSelectedEdgeId(edgeId);
    setSelectedNodeId(undefined);
    setSelectedPathId(undefined);
    vscode?.postMessage({ type: "EDGE_SELECTED", payload: { edgeId } });
  }, []);

  const selectPath = useCallback(
    (pathId: string) => {
      const path = cfg?.independentPaths.find((i) => i.id === pathId);
      if (!path) return;
      setSelectedPathId(pathId);
      setSelectedNodeId(undefined);
      setSelectedEdgeId(undefined);
      vscode?.postMessage({
        type: "PATH_SELECTED",
        payload: { nodeIds: path.nodeIds, edgeIds: path.edgeIds },
      });
    },
    [cfg],
  );

  const fitView = useCallback(() => {
    void reactFlow.fitView({ padding: 0.2, duration: 300 });
  }, [reactFlow]);
  const resetZoom = useCallback(() => {
    reactFlow.setViewport({ x: 0, y: 0, zoom: 1 }, { duration: 300 });
  }, [reactFlow]);
  const centerGraph = useCallback(() => {
    void reactFlow.fitView({ padding: 0.35, duration: 300 });
  }, [reactFlow]);
  const zoomIn = useCallback(() => {
    void reactFlow.zoomIn({ duration: 200 });
  }, [reactFlow]);
  const zoomOut = useCallback(() => {
    void reactFlow.zoomOut({ duration: 200 });
  }, [reactFlow]);
  const toggleSidebar = useCallback(() => {
    setIsSidebarCollapsed((value) => !value);
  }, []);

  const viewMode = cfg?.sourceMeta.viewMode ?? "simplified";

  return (
    <div className={`shell${isSidebarCollapsed ? " collapsed" : ""}`}>
      <header>
        <div className="header-meta">
          {cfg ? (
            <button
              className="view-toggle"
              title="Toggle Simplified / Detailed view"
              onClick={() => vscode?.postMessage({ type: "TOGGLE_VIEW_MODE" })}
            >
              <Icon
                name={viewMode === "simplified" ? "eye" : "eyeOff"}
                size={12}
              />
              {viewMode === "simplified" ? "Simplified" : "Detailed"}
            </button>
          ) : null}
          <IconButton
            title={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            onClick={toggleSidebar}
          >
            <Icon
              name={isSidebarCollapsed ? "chevronLeft" : "chevronRight"}
              size={12}
            />
          </IconButton>
        </div>
      </header>

      <main className="graph-wrap">
        {state === "success" && cfg ? (
          <ReactFlow
            nodes={flowNodes}
            edges={flowEdges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            key={isSidebarCollapsed ? "c" : "e"}
            fitView
            fitViewOptions={{ padding: 0.2, minZoom: 0.3, maxZoom: 1.5 }}
            onNodeClick={(_, node) => selectNode(node.id)}
            onEdgeClick={(_, edge) => selectEdge(edge.id)}
            nodesConnectable={false}
            elementsSelectable
            minZoom={0.3}
            maxZoom={2.5}
            proOptions={{ hideAttribution: true }}
          >
            <Background color="var(--border)" gap={20} size={0.5} />
          </ReactFlow>
        ) : (
          <div className="empty">
            {state === "loading" ? (
              <>
                <div className="loading-spinner" />
                <p className="loading-text">Analyzing control flow...</p>
              </>
            ) : state === "error" ? (
              <>
                <Icon name="alertTriangle" size={32} />
                <p className="error-title">Analysis Failed</p>
                <p className="empty-subtitle">
                  {error || "Could not generate CFG for this code."}
                </p>
              </>
            ) : (
              <>
                <Icon name="workflow" size={48} />
                <p className="empty-title">Ready to Analyze</p>
                <p className="empty-subtitle">
                  Open a Python file and run{" "}
                  <strong>Generate CFG from File</strong> to visualize its
                  control flow.
                </p>
              </>
            )}
          </div>
        )}
      </main>

      <aside aria-hidden={isSidebarCollapsed}>
        <Metrics cfg={cfg} />
        {cfg?.analysis.suggestions.length ? <Suggestions cfg={cfg} /> : null}
        {selectedNode ? <NodePreview node={selectedNode} /> : null}
        <div className="tabs-header">
          <TabButton
            id="nodes"
            label="Nodes"
            active={activeTab}
            onClick={setActiveTab}
          />
          <TabButton
            id="edges"
            label="Edges"
            active={activeTab}
            onClick={setActiveTab}
          />
          <TabButton
            id="functions"
            label="Fns"
            active={activeTab}
            onClick={setActiveTab}
          />
          <TabButton
            id="paths"
            label="Paths"
            active={activeTab}
            onClick={setActiveTab}
          />
        </div>
        <div className={`tab-panel ${activeTab === "nodes" ? "active" : ""}`}>
          <NodeList
            cfg={cfg}
            selectedNodeId={selectedNodeId}
            onSelect={selectNode}
          />
        </div>
        <div className={`tab-panel ${activeTab === "edges" ? "active" : ""}`}>
          <EdgeList
            cfg={cfg}
            selectedEdgeId={selectedEdgeId}
            onSelect={selectEdge}
          />
        </div>
        <div
          className={`tab-panel ${activeTab === "functions" ? "active" : ""}`}
        >
          <Functions cfg={cfg} />
        </div>
        <div className={`tab-panel ${activeTab === "paths" ? "active" : ""}`}>
          <Paths
            cfg={cfg}
            selectedPathId={selectedPathId}
            onSelect={selectPath}
          />
        </div>
      </aside>

      <div className="toolbar">
        <div className="tool-group">
          <IconButton title="Fit View" onClick={fitView}>
            <Icon name="maximize" />
          </IconButton>
          <IconButton title="Reset Zoom" onClick={resetZoom}>
            <Icon name="rotateCcw" />
          </IconButton>
          <IconButton title="Center" onClick={centerGraph}>
            <Icon name="focus" />
          </IconButton>
          <IconButton title="Zoom In" onClick={zoomIn}>
            <Icon name="zoomIn" />
          </IconButton>
          <IconButton title="Zoom Out" onClick={zoomOut}>
            <Icon name="zoomOut" />
          </IconButton>
        </div>
      </div>
    </div>
  );
}

/* ---- Sub-components ---- */

function TabButton({
  id,
  label,
  active,
  onClick,
}: {
  id: SidebarTab;
  label: string;
  active: SidebarTab;
  onClick: (t: SidebarTab) => void;
}) {
  return (
    <button
      className={`tab-btn ${active === id ? "active" : ""}`}
      onClick={() => onClick(id)}
      title={label}
    >
      {label}
    </button>
  );
}

function IconButton({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      className="icon-button"
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function Metrics({ cfg }: { cfg: CFG | null }) {
  if (!cfg) {
    return (
      <section>
        <h2>Metrics</h2>
        <p className="meta">No graph generated.</p>
      </section>
    );
  }

  const vg = cfg.metrics.cyclomaticComplexity;
  const threshold = cfg.analysis.highComplexityThreshold;
  const ccClass = getComplexityClass(vg, threshold);

  return (
    <section>
      <h2>Metrics</h2>
      <div className="metric-grid">
        <Metric label="V(G)" value={vg} className={ccClass} />
        <Metric label="Nodes" value={cfg.metrics.nodeCount} />
        <Metric label="Edges" value={cfg.metrics.edgeCount} />
        <Metric label="Decisions" value={cfg.metrics.decisionCount} />
      </div>
      <p className="formula">
        E − N + 2P = {cfg.metrics.edgeCount} − {cfg.metrics.nodeCount} + 2×
        {cfg.metrics.connectedComponents}
      </p>
      {cfg.metrics.nodeCount > 100 ? (
        <p className="warning">
          Graph exceeds 100 nodes and may be visually dense.
        </p>
      ) : null}
      {cfg.diagnostics.map((d) => (
        <p className="warning" key={d}>
          {d}
        </p>
      ))}
    </section>
  );
}

function Metric({
  label,
  value,
  className,
}: {
  label: string;
  value: number;
  className?: string;
}) {
  return (
    <div className={`metric ${className ?? ""}`}>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function Suggestions({ cfg }: { cfg: CFG }) {
  if (!cfg.analysis.suggestions.length) return null;
  return (
    <section>
      <h2>Suggestions</h2>
      {cfg.analysis.suggestions.map((s) => (
        <div className="suggestion-item" key={s}>
          {s}
        </div>
      ))}
    </section>
  );
}

function NodePreview({ node }: { node: CFGNode }) {
  return (
    <section>
      <h2>Selected Node</h2>
      <div className="node-detail-header">
        <NodeKindBadge kind={node.kind} />
        <span className="node-detail-line">Line {node.startLine + 1}</span>
      </div>
      <div className="code-preview">{highlightCode(node.code)}</div>
    </section>
  );
}

function highlightCode(code: string): React.ReactNode {
  if (!code) return <span className="comment">—</span>;
  const keywords = [
    "def",
    "class",
    "if",
    "elif",
    "else",
    "for",
    "while",
    "return",
    "break",
    "continue",
    "pass",
    "try",
    "except",
    "finally",
    "with",
    "as",
    "import",
    "from",
    "raise",
    "assert",
    "lambda",
    "yield",
    "async",
    "await",
    "and",
    "or",
    "not",
    "in",
    "is",
    "None",
    "True",
    "False",
  ];
  const tokens = code.split(/(\s+|[()[\]{}:;,.=+<>!&|*/%-])/);
  let inString = false;
  let stringChar = "";

  return tokens.map((token, i) => {
    if (keywords.includes(token))
      return (
        <span key={i} className="kw">
          {token}
        </span>
      );

    const quotePrefixes = ['"', "'", 'f"', "f'", 'r"', "r'"];
    const isStringStart =
      !inString && quotePrefixes.some((p) => token.startsWith(p));
    if (isStringStart) {
      const rawChar = token.replace(/^f|^r/, "").charAt(0);
      const isClosed = token.endsWith(rawChar) && token.length > 1;
      if (isClosed) {
        return (
          <span key={i} className="str">
            {token}
          </span>
        );
      }
      inString = true;
      stringChar = rawChar;
      return (
        <span key={i} className="str">
          {token}
        </span>
      );
    }

    if (inString) {
      const isClosed = token.endsWith(stringChar) && token.length > 0;
      if (isClosed) {
        inString = false;
        stringChar = "";
      }
      return (
        <span key={i} className="str">
          {token}
        </span>
      );
    }

    if (/^\d+$/.test(token))
      return (
        <span key={i} className="num">
          {token}
        </span>
      );
    if (token.startsWith("#"))
      return (
        <span key={i} className="comment">
          {token}
        </span>
      );
    return <span key={i}>{token}</span>;
  });
}

function NodeKindBadge({ kind }: { kind: CFGNode["kind"] }) {
  return <span className={`node-kind ${kind}`}>{kind}</span>;
}

function NodeList({
  cfg,
  selectedNodeId,
  onSelect,
}: {
  cfg: CFG | null;
  selectedNodeId?: string;
  onSelect: (id: string) => void;
}) {
  return (
    <section>
      <div className="list">
        {cfg?.nodes.map((node) => (
          <button
            className={node.id === selectedNodeId ? "selected-item" : ""}
            key={node.id}
            onClick={() => onSelect(node.id)}
          >
            <NodeKindBadge kind={node.kind} />
            {node.label}
          </button>
        ))}
      </div>
    </section>
  );
}

function EdgeList({
  cfg,
  selectedEdgeId,
  onSelect,
}: {
  cfg: CFG | null;
  selectedEdgeId?: string;
  onSelect: (id: string) => void;
}) {
  return (
    <section>
      <div className="list">
        {cfg?.edges.map((edge) => (
          <button
            className={edge.id === selectedEdgeId ? "selected-item" : ""}
            key={edge.id}
            onClick={() => onSelect(edge.id)}
          >
            {edge.from} <span className="path-arrow">→</span> {edge.to}
            {edge.label ? ` · ${edge.label}` : ""}
          </button>
        ))}
      </div>
    </section>
  );
}

function Functions({ cfg }: { cfg: CFG | null }) {
  return (
    <section>
      <div className="list">
        {cfg?.functions.length ? (
          cfg.functions.map((fn) => (
            <button
              key={`${fn.name}-${fn.startLine}`}
              onClick={() =>
                vscode?.postMessage({
                  type: "FUNCTION_SELECTED",
                  payload: { functionName: fn.name, startLine: fn.startLine },
                })
              }
            >
              <span style={{ fontWeight: 600 }}>{fn.name}()</span>
              <span style={{ color: "var(--muted)", marginLeft: 6 }}>
                line {fn.startLine + 1}
              </span>
            </button>
          ))
        ) : (
          <p className="meta">No functions detected.</p>
        )}
      </div>
    </section>
  );
}

function Paths({
  cfg,
  selectedPathId,
  onSelect,
}: {
  cfg: CFG | null;
  selectedPathId?: string;
  onSelect: (id: string) => void;
}) {
  return (
    <section>
      <h2>Independent Paths</h2>
      {cfg?.analysis.independentPathLimitReason ? (
        <p className="meta">{cfg.analysis.independentPathLimitReason}</p>
      ) : null}
      <div className="list">
        {cfg?.independentPaths.length ? (
          cfg.independentPaths.map((path) => (
            <button
              className={path.id === selectedPathId ? "selected-item" : ""}
              key={path.id}
              onClick={() => onSelect(path.id)}
            >
              <span style={{ fontWeight: 600, marginRight: 4 }}>
                {path.label}
              </span>
              <span className="path-arrow">→</span>
              {path.nodeIds.join(" → ")}
            </button>
          ))
        ) : (
          <p className="meta">No independent paths listed.</p>
        )}
      </div>
    </section>
  );
}

createRoot(document.getElementById("root")!).render(<AppShell />);
