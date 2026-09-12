import { nanoid } from "nanoid";
import type { AnvayaDoc } from "@/document/doc";
import type {
  EdgeKind,
  NodeShape,
  SceneEdge,
  SceneNode,
} from "@/document/types";
import { shapeDefaults } from "@/document/theme";
import { fitBox, fitsToText } from "@/document/textfit";
import { layoutMindmapRight } from "@/layout/mindmap";

// ─────────────────────────────────────────────────────────────────────────────
// The Command layer is the spine of the app. Tools, keyboard, command palette,
// AI, and (later) plugins ALL go through these functions. Because every mutation
// is one path into the CRDT, undo/redo/history/collaboration work uniformly and
// there is exactly one place to test.
// ─────────────────────────────────────────────────────────────────────────────

export class Commands {
  constructor(private doc: AnvayaDoc) {}

  private nextZ(): number {
    let z = 0;
    for (const n of this.doc.allNodes()) z = Math.max(z, n.z + 1);
    return z;
  }

  createNode(opts: {
    shape?: NodeShape;
    x: number;
    y: number;
    text?: string;
    parentId?: string | null;
    layoutId?: string | null;
  }): SceneNode {
    const shape = opts.shape ?? "rounded";
    const def = shapeDefaults[shape];
    // Size the box to the initial text so labels never overflow (falls back to
    // the shape's default size when created empty).
    const fit = opts.text && opts.text.trim() ? fitBox(shape, def.style, opts.text) : null;
    const w = fit?.w ?? def.w;
    const h = fit?.h ?? def.h;
    const node: SceneNode = {
      id: nanoid(10),
      shape,
      x: Math.round(opts.x - w / 2),
      y: Math.round(opts.y - h / 2),
      w,
      h,
      text: opts.text ?? "",
      parentId: opts.parentId ?? null,
      layoutId: opts.layoutId ?? null,
      collapsed: false,
      style: {},
      z: this.nextZ(),
    };
    this.doc.putNode(node);
    return node;
  }

  /** Create a shape at an exact rectangle (used by drag-to-draw tools). */
  createShape(shape: NodeShape, rect: { x: number; y: number; w: number; h: number }): SceneNode {
    const node: SceneNode = {
      id: nanoid(10),
      shape,
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      w: Math.max(4, Math.round(rect.w)),
      h: Math.max(4, Math.round(rect.h)),
      text: "",
      parentId: null,
      layoutId: null,
      collapsed: false,
      style: {},
      z: this.nextZ(),
    };
    this.doc.putNode(node);
    return node;
  }

  /** Commit a freehand pen stroke. `worldPoints` is flat [x0,y0,x1,y1,…]. */
  createStroke(worldPoints: number[], stroke: string, width: number): SceneNode | undefined {
    if (worldPoints.length < 4) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i < worldPoints.length; i += 2) {
      minX = Math.min(minX, worldPoints[i]);
      maxX = Math.max(maxX, worldPoints[i]);
      minY = Math.min(minY, worldPoints[i + 1]);
      maxY = Math.max(maxY, worldPoints[i + 1]);
    }
    const pad = width;
    minX -= pad; minY -= pad; maxX += pad; maxY += pad;
    const points: number[] = [];
    for (let i = 0; i < worldPoints.length; i += 2) {
      points.push(worldPoints[i] - minX, worldPoints[i + 1] - minY);
    }
    const node: SceneNode = {
      id: nanoid(10),
      shape: "draw",
      x: Math.round(minX),
      y: Math.round(minY),
      w: Math.max(1, Math.round(maxX - minX)),
      h: Math.max(1, Math.round(maxY - minY)),
      text: "",
      parentId: null,
      layoutId: null,
      collapsed: false,
      style: { stroke, strokeWidth: width },
      z: this.nextZ(),
      points,
    };
    this.doc.putNode(node);
    return node;
  }

  updateNode(id: string, patch: Partial<SceneNode>) {
    this.doc.updateNode(id, patch);
  }

  /** Apply a patch to many nodes in one undo step. */
  updateNodes(ids: string[], patch: Partial<SceneNode>) {
    this.doc.transact(() => {
      for (const id of ids) this.doc.updateNode(id, patch);
    });
  }

  /** Merge a style patch into each node's own style (preserves other keys). */
  updateNodesStyle(ids: string[], stylePatch: Partial<SceneNode["style"]>) {
    this.doc.transact(() => {
      for (const id of ids) {
        const n = this.doc.getNode(id);
        if (n) this.doc.updateNode(id, { style: { ...n.style, ...stylePatch } });
      }
    });
  }

  moveNode(id: string, x: number, y: number) {
    this.doc.updateNode(id, { x: Math.round(x), y: Math.round(y) });
  }

  setText(id: string, text: string) {
    const n = this.doc.getNode(id);
    // Grow/shrink the box to fit the edited text, keeping it centered in place.
    const fit = n && fitsToText(n.shape) ? fitBox(n.shape, n.style, text) : null;
    if (n && fit) {
      const cx = n.x + n.w / 2;
      const cy = n.y + n.h / 2;
      this.doc.updateNode(id, {
        text,
        w: fit.w,
        h: fit.h,
        x: Math.round(cx - fit.w / 2),
        y: Math.round(cy - fit.h / 2),
      });
    } else {
      this.doc.updateNode(id, { text });
    }
    this.reflowOwningLayout(id);
  }

  deleteNodes(ids: string[]) {
    const layouts = new Set<string>();
    this.doc.transact(() => {
      for (const id of ids) {
        const n = this.doc.getNode(id);
        if (n?.layoutId) layouts.add(n.layoutId);
        this.doc.deleteNode(id);
      }
    });
    layouts.forEach((lid) => this.reflowLayout(lid));
  }

  connect(
    source: string,
    target: string,
    kind: EdgeKind = "flow",
    ends?: {
      sourceAnchor?: { fx: number; fy: number };
      targetAnchor?: { fx: number; fy: number };
      sourcePoint?: { x: number; y: number };
      targetPoint?: { x: number; y: number };
    },
  ): SceneEdge {
    const edge: SceneEdge = {
      id: nanoid(10),
      source,
      target,
      kind,
      routing: "curved",
      label: "",
      style: {},
      arrowStart: false,
      arrowEnd: kind === "flow",
      ...(ends?.sourceAnchor ? { sourceAnchor: ends.sourceAnchor } : {}),
      ...(ends?.targetAnchor ? { targetAnchor: ends.targetAnchor } : {}),
      ...(ends?.sourcePoint ? { sourcePoint: ends.sourcePoint } : {}),
      ...(ends?.targetPoint ? { targetPoint: ends.targetPoint } : {}),
    };
    this.doc.putEdge(edge);
    return edge;
  }

  /** Move or re-attach one end of a connector. `ep` is either a free point or a node anchor. */
  setEdgeEndpoint(
    id: string,
    which: "source" | "target",
    ep: { point: { x: number; y: number } } | { node: string; anchor: { fx: number; fy: number } },
  ) {
    if ("point" in ep) {
      // detach → free-floating open end
      this.doc.reshapeEdge(
        id,
        { [which]: "", [`${which}Point`]: ep.point } as Partial<SceneEdge>,
        [`${which}Anchor`],
      );
    } else {
      // attach to a node at the given anchor
      this.doc.reshapeEdge(
        id,
        { [which]: ep.node, [`${which}Anchor`]: ep.anchor } as Partial<SceneEdge>,
        [`${which}Point`],
      );
    }
  }

  deleteEdge(id: string) {
    this.doc.deleteEdge(id);
  }
  updateEdge(id: string, patch: Partial<SceneEdge>) {
    this.doc.updateEdge(id, patch);
  }
  setWaypoints(id: string, waypoints: { x: number; y: number }[]) {
    this.doc.updateEdge(id, { waypoints });
  }

  // ── Mind-map operations ─────────────────────────────────────────────────────

  /** Turn a plain node into a mind-map root by attaching a layout. */
  makeMindmapRoot(rootId: string): string {
    const layoutId = nanoid(8);
    this.doc.transact(() => {
      this.doc.putLayout({
        id: layoutId,
        rootId,
        algorithm: "mindmap-right",
        params: {},
      });
      this.doc.updateNode(rootId, { shape: "topic", layoutId });
    });
    return layoutId;
  }

  /** Add a child topic under `parentId`, then reflow. Returns the new node. */
  addChildTopic(parentId: string): SceneNode | undefined {
    const parent = this.doc.getNode(parentId);
    if (!parent) return;
    let layoutId = parent.layoutId;
    if (!layoutId) layoutId = this.makeMindmapRoot(parentId);

    const child = this.createNode({
      shape: "topic",
      x: parent.x + parent.w + 90,
      y: parent.y,
      parentId,
      layoutId,
    });
    this.reflowLayout(layoutId);
    return child;
  }

  /** Add a sibling after `nodeId` (same parent). */
  addSiblingTopic(nodeId: string): SceneNode | undefined {
    const node = this.doc.getNode(nodeId);
    if (!node) return;
    if (node.parentId == null) {
      // A root's "sibling" is really its first child.
      return this.addChildTopic(nodeId);
    }
    const sibling = this.createNode({
      shape: "topic",
      x: node.x,
      y: node.y + node.h + 20,
      parentId: node.parentId,
      layoutId: node.layoutId,
    });
    if (node.layoutId) this.reflowLayout(node.layoutId);
    return sibling;
  }

  reflowOwningLayout(nodeId: string) {
    const n = this.doc.getNode(nodeId);
    if (n?.layoutId) this.reflowLayout(n.layoutId);
  }

  reflowLayout(layoutId: string) {
    const layout = this.doc.getLayout(layoutId);
    if (!layout) return;
    const root = this.doc.getNode(layout.rootId);
    if (!root) return;

    const patches = layoutMindmapRight(root, (id) =>
      this.doc.childrenOf(id).filter((c) => c.layoutId === layoutId),
    );
    this.doc.transact(() => {
      for (const p of patches) this.doc.updateNode(p.id, { x: p.x, y: p.y });
    });
  }

  // ── z-order ─────────────────────────────────────────────────────────────────
  // Nodes and edges (arrows) share one paint order, so the same layer controls
  // apply to both. Each op is expressed as a reordering of the full drawable list.
  bringToFront(ids: string[]) {
    const sel = new Set(ids);
    const items = this.drawables();
    this.applyOrder([...items.filter((i) => !sel.has(i.id)), ...items.filter((i) => sel.has(i.id))]);
  }
  sendToBack(ids: string[]) {
    const sel = new Set(ids);
    const items = this.drawables();
    this.applyOrder([...items.filter((i) => sel.has(i.id)), ...items.filter((i) => !sel.has(i.id))]);
  }
  /** Move the selection up one layer (toward the foreground), keeping its grouping. */
  bringForward(ids: string[]) {
    const sel = new Set(ids);
    const ordered = this.drawables();
    for (let i = ordered.length - 2; i >= 0; i--) {
      if (sel.has(ordered[i].id) && !sel.has(ordered[i + 1].id)) {
        [ordered[i], ordered[i + 1]] = [ordered[i + 1], ordered[i]];
      }
    }
    this.applyOrder(ordered);
  }
  /** Move the selection down one layer (toward the background), keeping its grouping. */
  sendBackward(ids: string[]) {
    const sel = new Set(ids);
    const ordered = this.drawables();
    for (let i = 1; i < ordered.length; i++) {
      if (sel.has(ordered[i].id) && !sel.has(ordered[i - 1].id)) {
        [ordered[i], ordered[i - 1]] = [ordered[i - 1], ordered[i]];
      }
    }
    this.applyOrder(ordered);
  }
  /** All z-ordered drawables (nodes + edges) in current paint order, back → front. */
  private drawables(): { id: string; z: number; isEdge: boolean }[] {
    return [
      ...this.doc.allNodes().map((n) => ({ id: n.id, z: n.z, isEdge: false })),
      // Edges without an explicit z sit just below objects (matches default paint).
      ...this.doc.allEdges().map((e) => ({ id: e.id, z: e.z ?? -1, isEdge: true })),
    ].sort((a, b) => a.z - b.z);
  }
  /** Write sequential z-values for the given paint order, touching only what changed. */
  private applyOrder(ordered: { id: string; z: number; isEdge: boolean }[]) {
    this.doc.transact(() => {
      ordered.forEach((it, i) => {
        if (it.z === i) return;
        if (it.isEdge) this.doc.updateEdge(it.id, { z: i });
        else this.doc.updateNode(it.id, { z: i });
      });
    });
  }

  // ── duplicate / paste ────────────────────────────────────────────────────────
  /** Insert copies of `nodes` (+ any edges wholly within them), offset by dx,dy. */
  insertClones(
    nodes: SceneNode[],
    edges: SceneEdge[],
    dx: number,
    dy: number,
  ): string[] {
    const idMap = new Map<string, string>();
    const created: string[] = [];
    this.doc.transact(() => {
      for (const n of nodes) {
        const nid = nanoid(10);
        idMap.set(n.id, nid);
        this.doc.putNode({
          ...n,
          id: nid,
          x: n.x + dx,
          y: n.y + dy,
          parentId: null, // clones are free (detached from any mind-map layout)
          layoutId: null,
          z: this.nextZ(),
        });
        created.push(nid);
      }
      for (const e of edges) {
        const s = idMap.get(e.source);
        const t = idMap.get(e.target);
        if (s && t) this.doc.putEdge({ ...e, id: nanoid(10), source: s, target: t });
      }
    });
    return created;
  }

  duplicateNodes(ids: string[]): string[] {
    const set = new Set(ids);
    const nodes = ids.map((id) => this.doc.getNode(id)).filter(Boolean) as SceneNode[];
    const edges = this.doc.allEdges().filter((e) => set.has(e.source) && set.has(e.target));
    return this.insertClones(nodes, edges, 20, 20);
  }

  // ── grouping ─────────────────────────────────────────────────────────────────
  groupNodes(ids: string[]): string | undefined {
    if (ids.length < 2) return;
    const gid = nanoid(8);
    this.doc.transact(() => {
      for (const id of ids) this.doc.updateNode(id, { groupId: gid });
    });
    return gid;
  }
  ungroupNodes(ids: string[]) {
    const gids = new Set(
      ids.map((id) => this.doc.getNode(id)?.groupId).filter(Boolean) as string[],
    );
    this.doc.transact(() => {
      for (const n of this.doc.allNodes())
        if (n.groupId && gids.has(n.groupId)) this.doc.updateNode(n.id, { groupId: undefined });
    });
  }
  /** All node ids sharing a group with any of `ids` (for select-whole-group). */
  expandGroups(ids: string[]): string[] {
    const gids = new Set(
      ids.map((id) => this.doc.getNode(id)?.groupId).filter(Boolean) as string[],
    );
    if (gids.size === 0) return ids;
    const out = new Set(ids);
    for (const n of this.doc.allNodes()) if (n.groupId && gids.has(n.groupId)) out.add(n.id);
    return [...out];
  }

  // ── lock ─────────────────────────────────────────────────────────────────────
  setLocked(ids: string[], locked: boolean) {
    this.doc.transact(() => {
      for (const id of ids) this.doc.updateNode(id, { locked });
    });
  }

  // ── align / distribute ───────────────────────────────────────────────────────
  alignNodes(
    ids: string[],
    mode: "left" | "hcenter" | "right" | "top" | "vcenter" | "bottom",
  ) {
    const nodes = ids.map((id) => this.doc.getNode(id)).filter(Boolean) as SceneNode[];
    if (nodes.length < 2) return;
    const minX = Math.min(...nodes.map((n) => n.x));
    const maxX = Math.max(...nodes.map((n) => n.x + n.w));
    const minY = Math.min(...nodes.map((n) => n.y));
    const maxY = Math.max(...nodes.map((n) => n.y + n.h));
    this.doc.transact(() => {
      for (const n of nodes) {
        const patch: Partial<SceneNode> = {};
        if (mode === "left") patch.x = Math.round(minX);
        else if (mode === "right") patch.x = Math.round(maxX - n.w);
        else if (mode === "hcenter") patch.x = Math.round((minX + maxX) / 2 - n.w / 2);
        else if (mode === "top") patch.y = Math.round(minY);
        else if (mode === "bottom") patch.y = Math.round(maxY - n.h);
        else if (mode === "vcenter") patch.y = Math.round((minY + maxY) / 2 - n.h / 2);
        this.doc.updateNode(n.id, patch);
      }
    });
  }

  distributeNodes(ids: string[], axis: "h" | "v") {
    const nodes = ids.map((id) => this.doc.getNode(id)).filter(Boolean) as SceneNode[];
    if (nodes.length < 3) return;
    const cen = (n: SceneNode) => (axis === "h" ? n.x + n.w / 2 : n.y + n.h / 2);
    nodes.sort((a, b) => cen(a) - cen(b));
    const first = cen(nodes[0]);
    const last = cen(nodes[nodes.length - 1]);
    const step = (last - first) / (nodes.length - 1);
    this.doc.transact(() => {
      nodes.forEach((n, i) => {
        const c = first + step * i;
        if (axis === "h") this.doc.updateNode(n.id, { x: Math.round(c - n.w / 2) });
        else this.doc.updateNode(n.id, { y: Math.round(c - n.h / 2) });
      });
    });
  }

  // ── images ───────────────────────────────────────────────────────────────────
  createImage(src: string, x: number, y: number, w: number, h: number): SceneNode {
    const node: SceneNode = {
      id: nanoid(10),
      shape: "image",
      x: Math.round(x - w / 2),
      y: Math.round(y - h / 2),
      w: Math.round(w),
      h: Math.round(h),
      text: "",
      parentId: null,
      layoutId: null,
      collapsed: false,
      style: {},
      z: this.nextZ(),
      src,
    };
    this.doc.putNode(node);
    return node;
  }

  undo() {
    this.doc.undoManager.undo();
  }
  redo() {
    this.doc.undoManager.redo();
  }
}
