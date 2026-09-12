// Turn a natural-language request into a real Anvaya diagram. The model returns
// a strict JSON spec (works across every provider); we validate it, lay it out,
// and build native, editable shapes through the normal command layer.

import type { CanvasEngine } from "@/canvas/CanvasEngine";
import { commands, doc } from "@/app/session";
import type { NodeShape } from "@/document/types";
import { fitBox } from "@/document/textfit";
import { chat } from "./provider";
import { parseMermaid } from "./mermaid";
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
- Keep the labels on flow nodes concise (a few words). For decision branches, put "Yes"/"No" (etc.) on the edge label.
- Add helpful detail mind-map style: for the important steps, add a separate "note" node holding a short one-line description or example, connected to that step. These annotations sit outside the main boxes and enrich the diagram — include a few, but don't clutter every node.
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
  return buildSpec(engine, extractJson(reply));
}

/** Build a diagram from Mermaid flowchart text — no model needed. */
export function buildFromMermaid(engine: CanvasEngine, text: string): BuildResult {
  const spec = parseMermaid(text);
  if (!spec.nodes.length) throw new Error("No shapes found in that Mermaid text.");
  return buildSpec(engine, spec);
}

/** Lay out and build a {nodes, edges} spec onto the canvas. */
function buildSpec(engine: CanvasEngine, spec: DiagramSpec): BuildResult {
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

  const H_GAP = 70; // gap between boxes in a layer
  const V_GAP = 90; // gap between layers

  // Pre-measure each node's box so the layout leaves room for its text.
  const dims = new Map<string, { w: number; h: number }>();
  for (const n of spec.nodes) {
    const shape = shapeOf(n.shape);
    const fit = fitBox(shape, {}, n.label ?? "");
    dims.set(n.id, fit ?? { w: 150, h: 64 });
  }

  // Lay out centered on (0,0), packing each layer by real box sizes so nothing
  // overlaps; then translate to the current viewport center.
  const layerDepths = [...byLayer.keys()].sort((a, b) => a - b);
  const rowH = new Map<number, number>();
  for (const d of layerDepths)
    rowH.set(d, Math.max(...byLayer.get(d)!.map((id) => dims.get(id)!.h)));
  const totalH =
    layerDepths.reduce((s, d) => s + rowH.get(d)!, 0) + V_GAP * (layerDepths.length - 1);

  const pos = new Map<string, { x: number; y: number }>();
  let ly = -totalH / 2;
  for (const d of layerDepths) {
    const layerIds = byLayer.get(d)!;
    const rh = rowH.get(d)!;
    const rowW =
      layerIds.reduce((s, id) => s + dims.get(id)!.w, 0) + H_GAP * (layerIds.length - 1);
    let lx = -rowW / 2;
    for (const id of layerIds) {
      const w = dims.get(id)!.w;
      pos.set(id, { x: lx + w / 2, y: ly + rh / 2 });
      lx += w + H_GAP;
    }
    ly += rh + V_GAP;
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
