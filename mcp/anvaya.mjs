// Read and write Anvaya `.anvaya` diagram files. A `.anvaya` file is a
// self-contained JSON document (schema/id/title/folder/tags/nodes/edges/
// layouts). We accept a high-level {nodes,edges} spec from the agent and turn it
// into valid native shapes with a layered auto-layout — so the agent never has
// to know Anvaya's internal geometry. Empty per-node `style` lets the app paint
// its vivid theme colors on load.

import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

const ALLOWED_SHAPES = ["rounded", "rect", "ellipse", "diamond", "note", "sticky", "topic"];

// Size a box to its label so text doesn't overflow. Node has no canvas to
// measure with, so estimate from character counts (the app re-fits precisely on
// edit). Approximates a ~15px sans font with pad=10 like the renderer.
const CHAR_W = 8.0; // avg px per character
const LINE_H = 20; // px per line
const H_PAD = 20; // total horizontal padding
const V_PAD = 22; // total vertical padding
const MIN_W = 110;
const MAX_W = 300;
const MIN_H = 48;

function fitSize(shape, label) {
  if (shape === "sticky") return [168, 168];
  const lines = String(label ?? "").split("\n");
  const longest = Math.max(1, ...lines.map((l) => l.length));
  let w = Math.min(MAX_W, Math.max(MIN_W, Math.round(longest * CHAR_W) + H_PAD));
  const contentW = w - H_PAD;
  let rows = 0;
  for (const l of lines) rows += Math.max(1, Math.ceil((l.length * CHAR_W) / contentW));
  let h = Math.max(MIN_H, rows * LINE_H + V_PAD);
  if (shape === "ellipse") { w = Math.round(w * 1.3); h = Math.round(h * 1.5); }
  if (shape === "diamond") { w = Math.round(w * 1.5); h = Math.round(h * 1.7); }
  return [w, h];
}

export function workspaceRoot() {
  const env = process.env.ANVAYA_WORKSPACE;
  if (env && env.trim()) return env.trim();
  return path.join(os.homedir(), "Documents", "Anvaya");
}

function diagramsDir() {
  return path.join(workspaceRoot(), "diagrams");
}

const rand = (n = 10) => {
  const a = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-";
  let s = "";
  for (let i = 0; i < n; i++) s += a[Math.floor(Math.random() * a.length)];
  return s;
};

const shapeOf = (s) => (ALLOWED_SHAPES.includes(s) ? s : "rounded");

function slug(s) {
  return (
    (s || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "diagram"
  );
}

// Deterministic serialization (sorted keys, records ordered by id) so files diff
// cleanly — mirrors src/workspace/serialize.ts.
function sortKeys(v) {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === "object") {
    const out = {};
    for (const k of Object.keys(v).sort()) out[k] = sortKeys(v[k]);
    return out;
  }
  return v;
}
function serialize(doc) {
  const normalized = {
    ...doc,
    nodes: [...doc.nodes].sort((a, b) => a.id.localeCompare(b.id)),
    edges: [...doc.edges].sort((a, b) => a.id.localeCompare(b.id)),
    layouts: [...(doc.layouts ?? [])].sort((a, b) => a.id.localeCompare(b.id)),
  };
  return JSON.stringify(sortKeys(normalized), null, 2) + "\n";
}

/** Longest-path layering so a DAG reads as clean top-down layers. */
function layers(ids, edges) {
  const succ = new Map();
  const indeg = new Map();
  ids.forEach((id) => (succ.set(id, []), indeg.set(id, 0)));
  for (const e of edges) {
    if (!succ.has(e.from) || !indeg.has(e.to)) continue;
    succ.get(e.from).push(e.to);
    indeg.set(e.to, indeg.get(e.to) + 1);
  }
  const depth = new Map(ids.map((id) => [id, 0]));
  const left = new Map(indeg);
  const q = ids.filter((id) => left.get(id) === 0);
  while (q.length) {
    const u = q.shift();
    for (const v of succ.get(u)) {
      depth.set(v, Math.max(depth.get(v), depth.get(u) + 1));
      left.set(v, left.get(v) - 1);
      if (left.get(v) === 0) q.push(v);
    }
  }
  return depth;
}

/**
 * Build node/edge records from a spec, laid out around (originX, originY).
 * Returns { nodes, edges, bounds }.
 */
function buildRecords(spec, startZ, originX, originY) {
  const specNodes = spec.nodes ?? [];
  const ids = specNodes.map((n) => n.id);
  const idset = new Set(ids);
  const specEdges = (spec.edges ?? []).filter((e) => idset.has(e.from) && idset.has(e.to));
  const depth = layers(ids, specEdges);

  // Pre-compute every node's box size so the layout can leave room for it.
  const size = new Map();
  for (const n of specNodes) size.set(n.id, fitSize(shapeOf(n.shape), n.label));

  const byLayer = new Map();
  for (const id of ids) {
    const d = depth.get(id) ?? 0;
    if (!byLayer.has(d)) byLayer.set(d, []);
    byLayer.get(d).push(id);
  }
  const H_GAP = 70; // gap between boxes in a layer
  const V_GAP = 90; // gap between layers
  const layerDepths = [...byLayer.keys()].sort((a, b) => a - b);

  // Vertical: each layer's row height is its tallest box; stack with V_GAP.
  const rowH = new Map();
  for (const d of layerDepths) rowH.set(d, Math.max(...byLayer.get(d).map((id) => size.get(id)[1])));
  const totalH = layerDepths.reduce((s, d) => s + rowH.get(d), 0) + V_GAP * (layerDepths.length - 1);

  const pos = new Map();
  let y = -totalH / 2;
  for (const d of layerDepths) {
    const layerIds = byLayer.get(d);
    const rh = rowH.get(d);
    // Horizontal: pack boxes left-to-right by their widths, centered.
    const rowW =
      layerIds.reduce((s, id) => s + size.get(id)[0], 0) + H_GAP * (layerIds.length - 1);
    let x = -rowW / 2;
    for (const id of layerIds) {
      const [w] = size.get(id);
      pos.set(id, { x: x + w / 2, y: y + rh / 2 }); // centers
      x += w + H_GAP;
    }
    y += rh + V_GAP;
  }

  const real = new Map();
  let z = startZ;
  const nodes = specNodes.map((n) => {
    const shape = shapeOf(n.shape);
    const [w, h] = size.get(n.id);
    const p = pos.get(n.id);
    const cx = originX + p.x;
    const cy = originY + p.y;
    const id = rand();
    real.set(n.id, id);
    return {
      id,
      shape,
      x: Math.round(cx - w / 2),
      y: Math.round(cy - h / 2),
      w,
      h,
      text: String(n.label ?? "").slice(0, 200),
      parentId: null,
      layoutId: null,
      collapsed: false,
      style: {},
      z: z++,
    };
  });

  const edges = specEdges.map((e) => ({
    id: rand(),
    source: real.get(e.from),
    target: real.get(e.to),
    kind: "flow",
    routing: "curved",
    label: e.label ? String(e.label).slice(0, 80) : "",
    style: {},
    arrowStart: false,
    arrowEnd: true,
  }));

  return { nodes, edges };
}

async function listFiles() {
  try {
    const names = await fs.readdir(diagramsDir());
    return names.filter((n) => n.endsWith(".anvaya")).sort();
  } catch (e) {
    if (e.code === "ENOENT") return [];
    throw e;
  }
}

async function readDoc(name) {
  const text = await fs.readFile(path.join(diagramsDir(), name), "utf8");
  const doc = JSON.parse(text);
  if (!doc.schema || !String(doc.schema).startsWith("anvaya/diagram@")) {
    throw new Error(`${name} is not an Anvaya diagram file.`);
  }
  return doc;
}

async function writeDoc(name, doc) {
  const dir = diagramsDir();
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, name), serialize(doc), "utf8");
}

async function uniqueName(title) {
  const base = slug(title);
  const existing = new Set(await listFiles());
  let name = base + ".anvaya";
  let i = 1;
  while (existing.has(name)) name = `${base}-${i++}.anvaya`;
  return name;
}

// ── public API ────────────────────────────────────────────────────────────────

export async function listDiagrams() {
  const files = await listFiles();
  const out = [];
  for (const name of files) {
    try {
      const d = await readDoc(name);
      out.push({
        name,
        title: d.title || name.replace(".anvaya", ""),
        folder: d.folder ?? "",
        tags: d.tags ?? [],
        nodes: (d.nodes ?? []).length,
        edges: (d.edges ?? []).length,
      });
    } catch {
      out.push({ name, title: name.replace(".anvaya", ""), folder: "", tags: [], nodes: 0, edges: 0 });
    }
  }
  return out;
}

export async function readDiagram(name) {
  const d = await readDoc(name);
  return {
    name,
    title: d.title,
    folder: d.folder ?? "",
    tags: d.tags ?? [],
    nodes: (d.nodes ?? [])
      .filter((n) => n.shape !== "draw" && n.shape !== "image")
      .map((n) => ({ id: n.id, label: n.text, shape: n.shape })),
    edges: (d.edges ?? []).map((e) => ({ from: e.source, to: e.target, label: e.label ?? "" })),
  };
}

export async function createDiagram({ title, nodes, edges, folder, tags }) {
  const { nodes: nodeRecs, edges: edgeRecs } = buildRecords({ nodes, edges }, 1, 0, 0);
  const doc = {
    schema: "anvaya/diagram@1",
    id: "diagram",
    title: title || "Untitled",
    folder: folder ?? "",
    tags: tags ?? [],
    nodes: nodeRecs,
    edges: edgeRecs,
    layouts: [],
  };
  const name = await uniqueName(title || "diagram");
  await writeDoc(name, doc);
  return { name, title: doc.title, nodeCount: nodeRecs.length, edgeCount: edgeRecs.length };
}

/** Relabel / reshape one node by id (auto-refits its box, keeping its center). */
export async function updateNode({ name, id, label, shape }) {
  const doc = await readDoc(name);
  const n = (doc.nodes ?? []).find((x) => x.id === id);
  if (!n) throw new Error(`No node "${id}" in ${name}.`);
  if (shape != null) n.shape = shapeOf(shape);
  if (label != null) n.text = String(label).slice(0, 200);
  const [w, h] = fitSize(n.shape, n.text);
  const cx = n.x + n.w / 2;
  const cy = n.y + n.h / 2;
  n.w = w;
  n.h = h;
  n.x = Math.round(cx - w / 2);
  n.y = Math.round(cy - h / 2);
  await writeDoc(name, doc);
  return { name, id, label: n.text, shape: n.shape };
}

/** Delete a node and any connectors touching it. */
export async function deleteNode({ name, id }) {
  const doc = await readDoc(name);
  const before = (doc.nodes ?? []).length;
  doc.nodes = (doc.nodes ?? []).filter((n) => n.id !== id);
  if (doc.nodes.length === before) throw new Error(`No node "${id}" in ${name}.`);
  const e0 = (doc.edges ?? []).length;
  doc.edges = (doc.edges ?? []).filter((e) => e.source !== id && e.target !== id);
  await writeDoc(name, doc);
  return { name, removedNode: id, removedEdges: e0 - doc.edges.length };
}

/** Set (or clear, with null/"") a node's fill color. */
export async function setNodeColor({ name, id, color }) {
  const doc = await readDoc(name);
  const n = (doc.nodes ?? []).find((x) => x.id === id);
  if (!n) throw new Error(`No node "${id}" in ${name}.`);
  n.style = n.style ?? {};
  if (color) n.style.fill = String(color);
  else delete n.style.fill;
  await writeDoc(name, doc);
  return { name, id, fill: n.style.fill ?? "default" };
}

/** Connect two existing nodes by id. */
export async function addEdge({ name, from, to, label }) {
  const doc = await readDoc(name);
  const ids = new Set((doc.nodes ?? []).map((n) => n.id));
  if (!ids.has(from) || !ids.has(to)) throw new Error(`Both "${from}" and "${to}" must exist.`);
  const edge = {
    id: rand(),
    source: from,
    target: to,
    kind: "flow",
    routing: "curved",
    label: label ? String(label).slice(0, 80) : "",
    style: {},
    arrowStart: false,
    arrowEnd: true,
  };
  doc.edges = doc.edges ?? [];
  doc.edges.push(edge);
  await writeDoc(name, doc);
  return { name, edge: edge.id, from, to };
}

/**
 * Inspect a diagram: geometry per node plus computed problems (overlapping
 * boxes). Lets an agent self-correct layout the way a screenshot would, but
 * headless — the app already auto-fits text, so overflow is handled there.
 */
export async function describeDiagram(name) {
  const doc = await readDoc(name);
  const nodes = (doc.nodes ?? []).filter((n) => n.shape !== "draw");
  const boxes = nodes.map((n) => ({ id: n.id, label: n.text, shape: n.shape, x: n.x, y: n.y, w: n.w, h: n.h }));
  const overlaps = [];
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i];
      const b = boxes[j];
      if (a.shape === "frame" || b.shape === "frame") continue;
      const ox = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
      const oy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
      if (ox > 4 && oy > 4) overlaps.push({ a: a.id, b: b.id, overlapPx: Math.round(ox * oy) });
    }
  }
  return {
    name,
    title: doc.title,
    nodeCount: boxes.length,
    edgeCount: (doc.edges ?? []).length,
    nodes: boxes,
    overlaps,
    ok: overlaps.length === 0,
  };
}

export async function appendToDiagram({ name, nodes, edges }) {
  const doc = await readDoc(name);
  doc.nodes = doc.nodes ?? [];
  doc.edges = doc.edges ?? [];
  doc.layouts = doc.layouts ?? [];

  // Place the new cluster below whatever already exists so it doesn't overlap.
  let maxY = 0;
  let maxZ = 0;
  for (const n of doc.nodes) {
    maxY = Math.max(maxY, (n.y ?? 0) + (n.h ?? 0));
    maxZ = Math.max(maxZ, n.z ?? 0);
  }
  const originY = doc.nodes.length ? maxY + 180 : 0;
  const { nodes: nodeRecs, edges: edgeRecs } = buildRecords({ nodes, edges }, maxZ + 1, 0, originY);
  doc.nodes.push(...nodeRecs);
  doc.edges.push(...edgeRecs);
  await writeDoc(name, doc);
  return { name, added: nodeRecs.length, links: edgeRecs.length };
}
