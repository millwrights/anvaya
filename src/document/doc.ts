import * as Y from "yjs";
import { IndexeddbPersistence } from "y-indexeddb";
import type {
  AnvayaDocument,
  LayoutRecord,
  SceneEdge,
  SceneNode,
} from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// The document layer.
//
// The single source of truth at runtime is a Yjs (CRDT) document. This buys us,
// from ONE mechanism: undo/redo, crash recovery, offline edits, and a clean path
// to real-time collaboration later. Nodes/edges/layouts are stored as flat
// Y.Maps keyed by id (never deeply nested) so merges and partial updates are
// cheap and conflict-free.
//
// On disk we serialize to normalized JSON (see workspace/serialize.ts). The
// CRDT is the runtime; the JSON is the git-friendly source of truth.
// ─────────────────────────────────────────────────────────────────────────────

export type NodeMap = Y.Map<unknown>; // one node record
export type EdgeMap = Y.Map<unknown>;
export type LayoutMap = Y.Map<unknown>;

export class AnvayaDoc {
  readonly ydoc: Y.Doc;
  readonly nodes: Y.Map<NodeMap>;
  readonly edges: Y.Map<EdgeMap>;
  readonly layouts: Y.Map<LayoutMap>;
  readonly meta: Y.Map<unknown>;
  readonly undoManager: Y.UndoManager;

  private persistence?: IndexeddbPersistence;

  constructor(ydoc = new Y.Doc()) {
    this.ydoc = ydoc;
    this.nodes = ydoc.getMap("nodes");
    this.edges = ydoc.getMap("edges");
    this.layouts = ydoc.getMap("layouts");
    this.meta = ydoc.getMap("meta");
    // Scope undo to the structural maps; user text edits are tracked too.
    this.undoManager = new Y.UndoManager(
      [this.nodes, this.edges, this.layouts],
      { captureTimeout: 300 },
    );
  }

  /** Wire up local auto-persistence (crash recovery). Returns when ready. */
  async persist(workspaceId: string): Promise<void> {
    this.persistence = new IndexeddbPersistence(
      `anvaya:${workspaceId}`,
      this.ydoc,
    );
    await this.persistence.whenSynced;
  }

  title(): string {
    return (this.meta.get("title") as string) ?? "Untitled";
  }
  setTitle(t: string) {
    this.meta.set("title", t);
  }
  folder(): string {
    return (this.meta.get("folder") as string) ?? "";
  }
  setFolder(f: string) {
    this.meta.set("folder", f);
  }
  tags(): string[] {
    return (this.meta.get("tags") as string[]) ?? [];
  }
  setTags(t: string[]) {
    this.meta.set("tags", t);
  }

  // ── Node accessors ────────────────────────────────────────────────────────
  getNode(id: string): SceneNode | undefined {
    const m = this.nodes.get(id);
    return m ? (mapToObject(m) as SceneNode) : undefined;
  }

  allNodes(): SceneNode[] {
    const out: SceneNode[] = [];
    this.nodes.forEach((m) => out.push(mapToObject(m) as SceneNode));
    return out;
  }

  putNode(node: SceneNode) {
    this.ydoc.transact(() => {
      const m = this.nodes.get(node.id) ?? new Y.Map();
      objectIntoMap(node, m);
      if (!this.nodes.has(node.id)) this.nodes.set(node.id, m);
    });
  }

  updateNode(id: string, patch: Partial<SceneNode>) {
    const m = this.nodes.get(id);
    if (!m) return;
    this.ydoc.transact(() => objectIntoMap(patch, m));
  }

  deleteNode(id: string) {
    this.ydoc.transact(() => {
      this.nodes.delete(id);
      // cascade: drop edges touching this node
      const dead: string[] = [];
      this.edges.forEach((e, eid) => {
        if (e.get("source") === id || e.get("target") === id) dead.push(eid);
      });
      dead.forEach((eid) => this.edges.delete(eid));
      // reparent orphans to null (keep them on the canvas as free nodes)
      this.nodes.forEach((n) => {
        if (n.get("parentId") === id) n.set("parentId", null);
      });
    });
  }

  childrenOf(id: string | null): SceneNode[] {
    return this.allNodes()
      .filter((n) => n.parentId === id)
      .sort((a, b) => a.z - b.z);
  }

  // ── Edge accessors ────────────────────────────────────────────────────────
  allEdges(): SceneEdge[] {
    const out: SceneEdge[] = [];
    this.edges.forEach((m) => out.push(mapToObject(m) as SceneEdge));
    return out;
  }
  putEdge(edge: SceneEdge) {
    this.ydoc.transact(() => {
      const m = new Y.Map();
      objectIntoMap(edge, m);
      this.edges.set(edge.id, m);
    });
  }
  updateEdge(id: string, patch: Partial<SceneEdge>) {
    const m = this.edges.get(id);
    if (!m) return;
    this.ydoc.transact(() => objectIntoMap(patch, m));
  }
  /** Apply a patch and remove the named keys in one undo step (e.g. re-anchoring). */
  reshapeEdge(id: string, patch: Partial<SceneEdge>, remove: string[] = []) {
    const m = this.edges.get(id);
    if (!m) return;
    this.ydoc.transact(() => {
      objectIntoMap(patch, m);
      for (const k of remove) m.delete(k);
    });
  }
  getEdge(id: string): SceneEdge | undefined {
    const m = this.edges.get(id);
    return m ? (mapToObject(m) as SceneEdge) : undefined;
  }
  deleteEdge(id: string) {
    this.ydoc.transact(() => this.edges.delete(id));
  }

  // ── Layout accessors ──────────────────────────────────────────────────────
  allLayouts(): LayoutRecord[] {
    const out: LayoutRecord[] = [];
    this.layouts.forEach((m) => out.push(mapToObject(m) as LayoutRecord));
    return out;
  }
  getLayout(id: string): LayoutRecord | undefined {
    const m = this.layouts.get(id);
    return m ? (mapToObject(m) as LayoutRecord) : undefined;
  }
  putLayout(layout: LayoutRecord) {
    this.ydoc.transact(() => {
      const m = this.layouts.get(layout.id) ?? new Y.Map();
      objectIntoMap(layout, m);
      if (!this.layouts.has(layout.id)) this.layouts.set(layout.id, m);
    });
  }

  /** Batch several mutations into one undo step. */
  transact(fn: () => void) {
    this.ydoc.transact(fn);
  }

  // ── Serialization ─────────────────────────────────────────────────────────
  toJSON(): AnvayaDocument {
    return {
      schema: "anvaya/diagram@1",
      id: (this.meta.get("id") as string) ?? "diagram",
      title: this.title(),
      folder: this.folder(),
      tags: this.tags(),
      nodes: this.allNodes(),
      edges: this.allEdges(),
      layouts: this.allLayouts(),
    };
  }

  loadJSON(json: AnvayaDocument) {
    this.ydoc.transact(() => {
      this.nodes.clear();
      this.edges.clear();
      this.layouts.clear();
      this.meta.set("id", json.id);
      this.meta.set("title", json.title);
      this.meta.set("folder", json.folder ?? "");
      this.meta.set("tags", json.tags ?? []);
      json.nodes.forEach((n) => this.putNode(n));
      json.edges.forEach((e) => this.putEdge(e));
      json.layouts.forEach((l) => this.putLayout(l));
    });
  }
}

// ── helpers: object <-> Y.Map ────────────────────────────────────────────────
function objectIntoMap(obj: object, m: Y.Map<unknown>) {
  for (const [k, v] of Object.entries(obj)) m.set(k, v);
}
function mapToObject(m: Y.Map<unknown>): unknown {
  const out: Record<string, unknown> = {};
  m.forEach((v, k) => (out[k] = v));
  return out;
}
