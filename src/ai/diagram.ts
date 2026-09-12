// Turn a natural-language request into a real Anvaya diagram. The model returns
// a strict JSON spec (works across every provider); we validate it, lay it out,
// and build native, editable shapes through the normal command layer.

import type { CanvasEngine } from "@/canvas/CanvasEngine";
import { commands, doc } from "@/app/session";
import type { NodeShape } from "@/document/types";
import { fitBox } from "@/document/textfit";
import { chat } from "./provider";
import { parseMermaid } from "./mermaid";
import { backEdges, edgeKey, layoutGraph } from "./layout";
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

  // Pre-measure each node's box so the layout leaves room for its text.
  const dims = new Map<string, { w: number; h: number }>();
  for (const n of spec.nodes) {
    const fit = fitBox(shapeOf(n.shape), {}, n.label ?? "");
    dims.set(n.id, fit ?? { w: 150, h: 64 });
  }
  const size = (id: string) => dims.get(id)!;

  // Break cycles, then layer/order/place on the forward (DAG) edges.
  const back = backEdges(ids, edges);
  const forward = edges.filter((e) => !back.has(edgeKey(e.from, e.to)));
  const { depth, pos, bbox } = layoutGraph(ids, forward, size);

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
    let lane = 0;
    const gutterBase = cx + bbox.maxX + 60; // right of every box
    for (const e of edges) {
      const ds = depth.get(e.from) ?? 0;
      const dt = depth.get(e.to) ?? 0;
      const channel = !back.has(edgeKey(e.from, e.to)) && dt === ds + 1;
      // Adjacent forward edges route cleanly in the vertical channel; back-edges
      // and layer-skipping edges detour through a staggered side gutter so no
      // connector is hidden under, or drawn across, another box.
      const ends = channel
        ? undefined
        : { sourceAnchor: { fx: 1, fy: 0.5 }, targetAnchor: { fx: 1, fy: 0.5 } };
      const edge = commands.connect(real.get(e.from)!, real.get(e.to)!, "flow", ends);
      const patch: Record<string, unknown> = {};
      if (e.label) patch.label = String(e.label).slice(0, 80);
      if (!channel) {
        const laneX = Math.round(gutterBase + lane++ * 46);
        patch.routing = "step";
        patch.waypoints = [
          { x: laneX, y: Math.round(cy + pos.get(e.from)!.y) },
          { x: laneX, y: Math.round(cy + pos.get(e.to)!.y) },
        ];
      }
      if (Object.keys(patch).length) commands.updateEdge(edge.id, patch);
    }
  });

  engine.setSelection([...real.values()]);
  if (wasEmpty) engine.zoomToFit();
  else engine.panTo(cx, cy);

  return { title: spec.title, nodeCount: spec.nodes.length, edgeCount: edges.length };
}
