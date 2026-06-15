import { CFGEdge, CFGMetrics, CFGNode } from "./types";

export function calculateMetrics(nodes: CFGNode[], edges: CFGEdge[]): CFGMetrics {
  const decisionCount = nodes.filter((node) => node.kind === "condition" || node.kind === "loop").length;
  const connectedComponents = countConnectedComponents(nodes, edges);
  const cyclomaticComplexity = Math.max(1, edges.length - nodes.length + 2 * connectedComponents);

  return {
    nodeCount: nodes.length,
    edgeCount: edges.length,
    decisionCount,
    connectedComponents,
    cyclomaticComplexity,
    simplifiedCyclomaticComplexity: decisionCount + 1
  };
}

function countConnectedComponents(nodes: CFGNode[], edges: CFGEdge[]): number {
  if (nodes.length === 0) {
    return 0;
  }

  const adjacency = new Map<string, string[]>();
  for (const node of nodes) {
    adjacency.set(node.id, []);
  }
  for (const edge of edges) {
    adjacency.get(edge.from)?.push(edge.to);
    adjacency.get(edge.to)?.push(edge.from);
  }

  const visited = new Set<string>();
  let components = 0;
  const queue: string[] = [];

  for (const node of nodes) {
    if (visited.has(node.id)) {
      continue;
    }
    components += 1;
    queue.push(node.id);
    visited.add(node.id);
    
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const next of adjacency.get(current) ?? []) {
        if (!visited.has(next)) {
          visited.add(next);
          queue.push(next);
        }
      }
    }
  }

  return components;
}
