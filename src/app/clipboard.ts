import type { SceneEdge, SceneNode } from "@/document/types";
import type { CanvasEngine } from "@/canvas/CanvasEngine";
import { commands, doc } from "./session";

// A simple in-app clipboard for nodes (and edges wholly within the copied set).
let clip: { nodes: SceneNode[]; edges: SceneEdge[] } = { nodes: [], edges: [] };

export function copySelection(engine: CanvasEngine) {
  const ids = new Set(engine.getSelection());
  if (ids.size === 0) return;
  clip = {
    nodes: [...ids].map((id) => doc.getNode(id)).filter(Boolean) as SceneNode[],
    edges: doc.allEdges().filter((e) => ids.has(e.source) && ids.has(e.target)),
  };
}

export function pasteClipboard(engine: CanvasEngine) {
  if (clip.nodes.length === 0) return;
  const ids = commands.insertClones(clip.nodes, clip.edges, 24, 24);
  engine.setSelection(ids);
}
