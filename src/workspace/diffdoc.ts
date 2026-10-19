// Build a visual diff between two versions of a diagram: one overlay document
// where every element is recolored by its status — added (green), removed (red),
// changed (amber). Identity is by node/edge id (stable across edits), so moving,
// relabeling or restyling an element shows as "changed", not add+remove.

import type { AnvayaDocument, SceneEdge, SceneNode } from "@/document/types";

export const DIFF_ADDED = "#22c55e";
export const DIFF_REMOVED = "#ff5a4a";
export const DIFF_CHANGED = "#ffab24";

export interface DiffResult {
  doc: AnvayaDocument;
  added: number;
  removed: number;
  changed: number;
}

/** Signature for change detection — everything but z-order (pure reordering
 *  shouldn't read as a change). Both files are serialized with sorted keys, so
 *  stringifying the parsed objects compares reliably. */
function sig(o: object): string {
  const c = { ...o } as Record<string, unknown>;
  delete c.z;
  return JSON.stringify(c);
}

function markNode(n: SceneNode, color: string): SceneNode {
  if (n.shape === "draw") return { ...n, style: { ...n.style, stroke: color } };
  return { ...n, shadow: false, style: { ...n.style, stroke: color, strokeWidth: 3 } };
}
function markEdge(e: SceneEdge, color: string): SceneEdge {
  return { ...e, style: { ...e.style, stroke: color, width: Math.max(3, e.style?.width ?? 2) } };
}

/** Diff older `aText` → newer `bText` (both raw .anvaya JSON). */
export function diffDocs(aText: string, bText: string): DiffResult {
  const a = JSON.parse(aText) as AnvayaDocument;
  const b = JSON.parse(bText) as AnvayaDocument;

  const aN = new Map((a.nodes ?? []).map((n) => [n.id, n]));
  const bN = new Map((b.nodes ?? []).map((n) => [n.id, n]));
  const nodes: SceneNode[] = [];
  let added = 0,
    removed = 0,
    changed = 0;

  for (const n of b.nodes ?? []) {
    const prev = aN.get(n.id);
    if (!prev) {
      nodes.push(markNode(n, DIFF_ADDED));
      added++;
    } else if (sig(prev) !== sig(n)) {
      nodes.push(markNode(n, DIFF_CHANGED));
      changed++;
    } else {
      nodes.push(n);
    }
  }
  for (const n of a.nodes ?? []) {
    if (!bN.has(n.id)) {
      nodes.push(markNode(n, DIFF_REMOVED));
      removed++;
    }
  }

  const aE = new Map((a.edges ?? []).map((e) => [e.id, e]));
  const bE = new Map((b.edges ?? []).map((e) => [e.id, e]));
  const edges: SceneEdge[] = [];
  for (const e of b.edges ?? []) {
    const prev = aE.get(e.id);
    if (!prev) edges.push(markEdge(e, DIFF_ADDED));
    else if (sig(prev) !== sig(e)) edges.push(markEdge(e, DIFF_CHANGED));
    else edges.push(e);
  }
  for (const e of a.edges ?? []) {
    if (!bE.has(e.id)) edges.push(markEdge(e, DIFF_REMOVED));
  }

  const doc: AnvayaDocument = {
    schema: "anvaya/diagram@1",
    id: "diff",
    title: b.title ?? "Diff",
    nodes,
    edges,
    layouts: b.layouts ?? [],
  };
  return { doc, added, removed, changed };
}
