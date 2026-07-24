import { CFGEdge, CFGIndependentPath, CFGNode } from "./types";

interface QueueItem {
  nodeId: string;
  nodeIds: string[];
  edgeIds: string[];
  visitedEdges: Set<string>;
}

export function calculateIndependentPaths(
  nodes: CFGNode[],
  edges: CFGEdge[],
  entryNodeId: string,
  exitNodeId: string,
  targetCount: number
): { paths: CFGIndependentPath[]; limitReason?: string } {
  if (nodes.length > 120 || edges.length > 180) {
    return {
      paths: [],
      limitReason: "Independent paths are hidden for large graphs to keep the preview responsive."
    };
  }

  const wanted = Math.max(1, Math.min(targetCount, 20));
  const capped = targetCount > 20;
  const outgoing = new Map<string, CFGEdge[]>();
  for (const edge of edges) {
    const list = outgoing.get(edge.from) ?? [];
    list.push(edge);
    outgoing.set(edge.from, list);
  }

  const maxDepth = Math.max(8, nodes.length * 2);
  const queue: QueueItem[] = [
    {
      nodeId: entryNodeId,
      nodeIds: [entryNodeId],
      edgeIds: [],
      visitedEdges: new Set()
    }
  ];
  const complete: CFGIndependentPath[] = [];
  const seenSignatures = new Set<string>();

  while (queue.length > 0 && complete.length < wanted) {
    const current = queue.shift();
    if (!current) {
      break;
    }

    if (current.nodeId === exitNodeId) {
      const signature = current.edgeIds.join(">");
      const usedBySelected = new Set(complete.flatMap((path) => path.edgeIds));
      const contributesNewEdge = current.edgeIds.some((edgeId) => !usedBySelected.has(edgeId));
      if (!seenSignatures.has(signature) && (complete.length === 0 || contributesNewEdge)) {
        seenSignatures.add(signature);
        complete.push({
          id: `p${complete.length + 1}`,
          label: `Path ${complete.length + 1}`,
          nodeIds: current.nodeIds,
          edgeIds: current.edgeIds
        });
      }
      continue;
    }

    if (current.edgeIds.length >= maxDepth) {
      continue;
    }

    const nextEdges = outgoing.get(current.nodeId) ?? [];
    for (const edge of prioritizeEdges(nextEdges)) {
      const alreadyUsed = current.visitedEdges.has(edge.id);
      if (alreadyUsed && edge.label !== "loop" && edge.label !== "continue") {
        continue;
      }
      if (alreadyUsed) {
        continue;
      }
      queue.push({
        nodeId: edge.to,
        nodeIds: [...current.nodeIds, edge.to],
        edgeIds: [...current.edgeIds, edge.id],
        visitedEdges: new Set([...current.visitedEdges, edge.id])
      });
    }
  }

  return {
    paths: complete,
    limitReason: capped
      ? `Showing the first ${wanted} independent path(s); the calculated target was ${targetCount}.`
      : complete.length < wanted
        ? `Only ${complete.length} independent path(s) could be listed for this graph.`
        : undefined
  };
}

function prioritizeEdges(edges: CFGEdge[]): CFGEdge[] {
  const order = new Map<string, number>([
    ["true", 0],
    ["false", 1],
    ["next", 2],
    ["loop", 3],
    ["continue", 4],
    ["break", 5],
    ["return", 6]
  ]);
  return [...edges].sort((a, b) => {
    const aLabel = a.label ?? "next";
    const bLabel = b.label ?? "next";
    return (order.get(aLabel) ?? 2) - (order.get(bLabel) ?? 2);
  });
}
