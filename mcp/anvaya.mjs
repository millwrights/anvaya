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

// Default sizes must match the app's shapeDefaults (src/document/theme.ts).
const SHAPE_SIZE = {
  topic: [150, 44],
  rect: [150, 64],
  rounded: [150, 64],
  ellipse: [140, 80],
  diamond: [150, 90],
  note: [180, 100],
  sticky: [168, 168],
};

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

  const byLayer = new Map();
  for (const id of ids) {
    const d = depth.get(id) ?? 0;
    if (!byLayer.has(d)) byLayer.set(d, []);
    byLayer.get(d).push(id);
  }
  const H_GAP = 220;
  const V_GAP = 150;
  const maxDepth = Math.max(0, ...ids.map((id) => depth.get(id) ?? 0));

  const pos = new Map();
  for (const [d, layerIds] of byLayer) {
    const k = layerIds.length;
    layerIds.forEach((id, i) => {
      pos.set(id, { x: (i - (k - 1) / 2) * H_GAP, y: (d - maxDepth / 2) * V_GAP });
    });
  }

  const real = new Map();
  let z = startZ;
  const nodes = specNodes.map((n) => {
    const shape = shapeOf(n.shape);
    const [w, h] = SHAPE_SIZE[shape] ?? SHAPE_SIZE.rounded;
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
