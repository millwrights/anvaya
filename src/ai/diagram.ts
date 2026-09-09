// Turn a natural-language request into a real Anvaya diagram. The model returns
// a strict JSON spec (works across every provider); we validate it, lay it out,
// and build native, editable shapes through the normal command layer.

import type { CanvasEngine } from "@/canvas/CanvasEngine";
import { commands, doc } from "@/app/session";
import type { NodeShape } from "@/document/types";
import { chat } from "./provider";
import type { AiConfig } from "./config";

const ALLOWED: NodeShape[] = ["rounded", "rect", "ellipse", "diamond", "note", "sticky", "topic"];

interface SpecNode {
  id: string;
  label: string;
  shape?: string;
}
interface SpecEdge {
  from: string;
  to: string;
  label?: string;
}
interface DiagramSpec {
  title?: string;
  nodes: SpecNode[];
  edges: SpecEdge[];
}

export const SYSTEM_PROMPT = `You are a diagramming assistant for a visual-thinking app. Convert the user's request into a diagram described as STRICT JSON and nothing else — no prose, no markdown fences.

Schema:
{
  "title": string,                       // short title for the diagram
  "nodes": [ { "id": string, "label": string, "shape": string } ],
  "edges": [ { "from": string, "to": string, "label": string } ]  // label optional
}

Rules:
- "id" is a short unique slug you invent (e.g. "start", "check_stock"). Edges reference these ids.
- Choose "shape" by meaning: start/end -> "ellipse"; a step/process -> "rounded"; a decision/branch -> "diamond"; a note/data -> "note"; a mind-map idea -> "topic"; default -> "rounded".
- Keep labels concise (a few words). For decision branches, put "Yes"/"No" (etc.) on the edge label.
- Produce a connected graph. Return ONLY the JSON object.`;

/** Pull the JSON object out of a model reply (tolerates code fences / stray text). */
function extractJson(text: string): DiagramSpec {
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("The model did not return a diagram. Try rephrasing your request.");
  }
  let spec: DiagramSpec;
  try {
    spec = JSON.parse(t.slice(start, end + 1));
  } catch {
    throw new Error("The model's diagram wasn't valid JSON. Try again or use a stronger model.");
  }
  if (!Array.isArray(spec.nodes) || spec.nodes.length === 0) {
    throw new Error("The model returned no shapes. Try a more specific request.");
  }
  spec.edges = Array.isArray(spec.edges) ? spec.edges : [];
  return spec;
}

const shapeOf = (s?: string): NodeShape =>
  s && (ALLOWED as string[]).includes(s) ? (s as NodeShape) : "rounded";

/** Longest-path layering (topological) so a DAG reads as clean top-down layers. */
function layers(ids: string[], edges: SpecEdge[]): Map<string, number> {
  const succ = new Map<string, string[]>();
  const indeg = new Map<string, number>();
  ids.forEach((id) => (succ.set(id, []), indeg.set(id, 0)));
  for (const e of edges) {
    if (!succ.has(e.from) || !indeg.has(e.to)) continue;
    succ.get(e.from)!.push(e.to);
    indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1);
  }
  const depth = new Map(ids.map((id) => [id, 0]));
  const left = new Map(indeg);
  const queue = ids.filter((id) => left.get(id) === 0);
  while (queue.length) {
    const u = queue.shift()!;
    for (const v of succ.get(u)!) {
      depth.set(v, Math.max(depth.get(v)!, depth.get(u)! + 1));
      left.set(v, left.get(v)! - 1);
      if (left.get(v) === 0) queue.push(v);
    }
  }
  return depth; // nodes in cycles keep depth 0 (still get placed)
}

export interface BuildResult {
  title?: string;
  nodeCount: number;
  edgeCount: number;
}

/** Ask the model, then build the diagram onto the canvas. */
export async function generateDiagram(
  cfg: AiConfig,
  engine: CanvasEngine,
  request: string,
): Promise<BuildResult> {
  const reply = await chat(cfg, SYSTEM_PROMPT, request);
  const spec = extractJson(reply);

  const ids = spec.nodes.map((n) => n.id);
  const idset = new Set(ids);
  const edges = spec.edges.filter((e) => idset.has(e.from) && idset.has(e.to));
  const depth = layers(ids, edges);

  // Group node ids by layer, preserving the model's order within each layer.
  const byLayer = new Map<number, string[]>();
  for (const id of ids) {
    const d = depth.get(id) ?? 0;
    if (!byLayer.has(d)) byLayer.set(d, []);
    byLayer.get(d)!.push(id);
  }

  const H_GAP = 220;
  const V_GAP = 150;
  const maxDepth = Math.max(0, ...ids.map((id) => depth.get(id) ?? 0));

  // Lay out centered on (0,0), then translate to the current viewport center.
  const pos = new Map<string, { x: number; y: number }>();
  for (const [d, layerIds] of byLayer) {
    const k = layerIds.length;
    layerIds.forEach((id, i) => {
      pos.set(id, { x: (i - (k - 1) / 2) * H_GAP, y: (d - maxDepth / 2) * V_GAP });
    });
  }
  const v = engine.viewportWorld();
  const cx = v.x + v.w / 2;
  const cy = v.y + v.h / 2;

  const wasEmpty = doc.allNodes().length === 0;
  const real = new Map<string, string>();

  doc.transact(() => {
    for (const n of spec.nodes) {
      const p = pos.get(n.id)!;
      const node = commands.createNode({
        shape: shapeOf(n.shape),
        x: cx + p.x,
        y: cy + p.y,
        text: (n.label ?? "").slice(0, 200),
      });
      real.set(n.id, node.id);
    }
    for (const e of edges) {
      const edge = commands.connect(real.get(e.from)!, real.get(e.to)!, "flow");
      if (e.label) commands.updateEdge(edge.id, { label: String(e.label).slice(0, 80) });
    }
  });

  engine.setSelection([...real.values()]);
  if (wasEmpty) engine.zoomToFit();
  else engine.panTo(cx, cy);

  return { title: spec.title, nodeCount: spec.nodes.length, edgeCount: edges.length };
}
