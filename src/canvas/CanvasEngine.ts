import {
  Application,
  Container,
  Graphics,
  Rectangle,
  Sprite,
  Texture,
  Text,
  TextStyle,
  type Renderer,
} from "pixi.js";
import { getStrokePoints } from "perfect-freehand";
import type { AnvayaDoc } from "@/document/doc";
import type { Commands } from "@/commands/commands";
import type { EdgeRouting, NodeShape, NodeStyle, SceneEdge, SceneNode } from "@/document/types";
import { fontStack, onThemeChange, readableText, resolveStyle, shapeDefaults, theme } from "@/document/theme";
import { Camera, type Point } from "@/render/camera";

export type Tool =
  | "select"
  | "connect"
  | "pen"
  | "rect"
  | "ellipse"
  | "diamond"
  | "sticky"
  | "frame"
  | "text";

const SHAPE_TOOLS: Tool[] = ["rect", "ellipse", "diamond", "sticky", "frame", "text"];
export const INK_COLORS = ["#e8ebf0", "#2b6cff", "#16a34a", "#f5c400", "#f0392b", "#8b45ff"];
export const INK_WIDTHS = [2, 3.5, 6];
const DEFAULT_INK_COLOR = INK_COLORS[0];
const DEFAULT_INK_WIDTH = INK_WIDTHS[0];

function toolShape(t: Tool): SceneNode["shape"] {
  return t === "text"
    ? "text"
    : t === "diamond"
      ? "diamond"
      : t === "ellipse"
        ? "ellipse"
        : t === "sticky"
          ? "sticky"
          : t === "frame"
            ? "frame"
            : "rect";
}

interface Handle {
  key: "nw" | "ne" | "sw" | "se";
  x: number;
  y: number;
}

type Listener = () => void;

/**
 * CanvasEngine ties the renderer (PixiJS/WebGL) to the CRDT document and the
 * interaction layer. Rendering is split into two paths for performance:
 *   - renderScene():  rebuilds node/edge/selection graphics. Runs on doc or
 *                     selection change only.
 *   - applyCamera():  updates the world transform + grid. Cheap; runs on pan/zoom.
 * The heavy content lives on the GPU; text editing happens in a DOM overlay
 * (see EditorOverlay in the React layer), mirroring Figma/tldraw.
 */
export class CanvasEngine {
  readonly camera = new Camera();
  tool: Tool = "select";
  private inkColor = DEFAULT_INK_COLOR;
  private inkWidth = DEFAULT_INK_WIDTH;

  private app!: Application;
  private world = new Container();
  private gridLayer = new Graphics();
  // One container for edges + nodes so they can interleave by a shared z-order.
  private contentLayer = new Container();
  private previewGfx = new Graphics();
  private overlayLayer = new Container();

  private selection = new Set<string>();
  private edgeSel: string | null = null;
  private hoveredId: string | null = null;
  private hoverWorld: Point | null = null; // last cursor position, for the live connect anchor
  private spaceHeld = false; // hold Space to pan instead of marquee-select

  private sceneDirty = true;
  private cameraDirty = true;
  private rafHandle = 0;

  private listeners = new Set<Listener>();
  private editRequest: ((id: string) => void) | null = null;
  private pasteFallback: (() => void) | null = null;
  private cursorCb: ((w: Point) => void) | null = null;
  private unsubTheme: (() => void) | null = null;
  private texCache = new Map<string, Texture>();
  private editingId: string | null = null;
  private lastRenderZoom = 1;
  private exportRes = 0; // >0 while rendering for image export (forces crisp text)

  /** Text-texture density so labels stay crisp when zoomed in (or exporting). */
  private textRes(): number {
    // When exporting, bake text at the export scale so labels are razor-sharp.
    if (this.exportRes) return Math.min(16, Math.max(6, this.exportRes * 2));
    return Math.min(8, Math.max(2, this.camera.zoom * (window.devicePixelRatio || 1)));
  }

  constructor(
    private host: HTMLElement,
    private doc: AnvayaDoc,
    private cmd: Commands,
  ) {}

  async init() {
    this.app = new Application();
    await this.app.init({
      background: theme.canvasBg,
      antialias: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
      resizeTo: this.host,
      preference: "webgl",
    });
    this.host.appendChild(this.app.canvas);

    // previewGfx lives in world space (above nodes) so drag-to-draw previews
    // track the camera automatically.
    this.world.addChild(this.gridLayer, this.contentLayer, this.previewGfx);
    this.app.stage.addChild(this.world, this.overlayLayer);

    this.bindInput();
    this.unsubTheme = onThemeChange(() => this.refreshTheme());
    window.addEventListener("paste", this.onPaste);
    window.addEventListener("keydown", this.onSpaceKey);
    window.addEventListener("keyup", this.onSpaceKey);
    this.host.addEventListener("dragover", this.onDragOver);
    this.host.addEventListener("drop", this.onDrop);
    this.doc.ydoc.on("update", this.onDocUpdate);
    this.app.ticker.add(this.tick);

    // Frame the existing content.
    this.zoomToFit();
    this.markScene();
    this.markCamera();
  }

  /** Re-apply theme colors: canvas background, grid, and all node/edge colors. */
  refreshTheme() {
    if (!this.app) return;
    this.app.renderer.background.color = theme.canvasBg;
    this.markCamera();
    this.markScene();
  }

  destroy() {
    this.doc.ydoc.off("update", this.onDocUpdate);
    this.unsubTheme?.();
    window.removeEventListener("paste", this.onPaste);
    window.removeEventListener("keydown", this.onSpaceKey);
    window.removeEventListener("keyup", this.onSpaceKey);
    this.host.removeEventListener("dragover", this.onDragOver);
    this.host.removeEventListener("drop", this.onDrop);
    cancelAnimationFrame(this.rafHandle);
    this.app?.destroy(true, { children: true });
  }

  // ── image paste / drag-drop ────────────────────────────────────────────────
  private onPaste = (e: ClipboardEvent) => {
    const el = document.activeElement;
    if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || (el as HTMLElement).isContentEditable))
      return; // let text paste into the field being edited
    const items = e.clipboardData?.items;
    let pastedImage = false;
    if (items) {
      for (const it of items) {
        if (it.type.startsWith("image/")) {
          const f = it.getAsFile();
          if (f) {
            e.preventDefault();
            this.addImageFile(f);
            pastedImage = true;
          }
        }
      }
    }
    // No image on the clipboard → fall back to the in-app clipboard (copied nodes).
    if (!pastedImage && this.pasteFallback) {
      e.preventDefault();
      this.pasteFallback();
    }
  };
  // Hold Space to pan the canvas (so left-drag on empty space can marquee-select).
  private onSpaceKey = (e: KeyboardEvent) => {
    if (e.code !== "Space") return;
    const el = document.activeElement;
    if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || (el as HTMLElement).isContentEditable))
      return; // don't hijack the spacebar while typing
    this.spaceHeld = e.type === "keydown";
    if (this.app) this.app.canvas.style.cursor = this.spaceHeld ? "grab" : "default";
  };
  private onDragOver = (e: DragEvent) => e.preventDefault();
  private onDrop = (e: DragEvent) => {
    e.preventDefault();
    const files = e.dataTransfer?.files;
    if (!files) return;
    const r = this.app.canvas.getBoundingClientRect();
    const world = this.camera.screenToWorld(e.clientX - r.left, e.clientY - r.top);
    for (const f of files) if (f.type.startsWith("image/")) this.addImageFile(f, world);
  };

  // ── external subscription (React) ─────────────────────────────────────────
  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  private emit() {
    this.listeners.forEach((l) => l());
  }
  onEditRequest(fn: (id: string) => void) {
    this.editRequest = fn;
  }
  /** Called on Cmd+V when the system clipboard has no image (in-app node paste). */
  onPasteFallback(fn: () => void) {
    this.pasteFallback = fn;
  }
  /** Report the pointer's world position (for collaboration presence cursors). */
  onCursorMove(fn: (w: Point) => void) {
    this.cursorCb = fn;
  }

  getSelection(): string[] {
    return [...this.selection];
  }
  setSelection(ids: string[]) {
    this.selection = new Set(ids);
    this.edgeSel = null;
    this.markScene();
    this.emit();
  }
  /** Select every object on the canvas (Cmd/Ctrl+A). */
  selectAll() {
    this.setSelection(this.doc.allNodes().map((n) => n.id));
  }

  /**
   * Move the selection to the nearest node in a cardinal direction (arrow-key
   * navigation). Picks the closest node that lies within a 90° cone toward
   * `dir`, and pans it into view. Returns true if it moved.
   */
  selectNeighbor(dir: "left" | "right" | "up" | "down"): boolean {
    const cur = this.selection.size === 1 ? this.doc.getNode([...this.selection][0]) : null;
    const nodes = this.doc.allNodes().filter((n) => n.shape !== "frame");
    if (!nodes.length) return false;
    // No single selection yet → just grab the top-left-most node to start.
    if (!cur) {
      const first = [...nodes].sort((a, b) => a.y - b.y || a.x - b.x)[0];
      this.setSelection([first.id]);
      this.panTo(first.x + first.w / 2, first.y + first.h / 2);
      return true;
    }
    const cx = cur.x + cur.w / 2;
    const cy = cur.y + cur.h / 2;
    let best: SceneNode | null = null;
    let bestScore = Infinity;
    for (const n of nodes) {
      if (n.id === cur.id) continue;
      const dx = n.x + n.w / 2 - cx;
      const dy = n.y + n.h / 2 - cy;
      const along = dir === "right" ? dx : dir === "left" ? -dx : dir === "down" ? dy : -dy;
      const across = dir === "left" || dir === "right" ? Math.abs(dy) : Math.abs(dx);
      if (along <= 1 || across > along) continue; // must be within ~45° of the direction
      const score = along + across * 0.5; // prefer close & well-aligned
      if (score < bestScore) {
        bestScore = score;
        best = n;
      }
    }
    if (!best) return false;
    this.setSelection([best.id]);
    const v = this.viewportWorld();
    const bcx = best.x + best.w / 2;
    const bcy = best.y + best.h / 2;
    if (bcx < v.x || bcx > v.x + v.w || bcy < v.y || bcy > v.y + v.h) this.panTo(bcx, bcy);
    return true;
  }
  getEdgeSelection(): string | null {
    return this.edgeSel;
  }
  setEdgeSelection(id: string | null) {
    this.edgeSel = id;
    this.selection.clear();
    this.markScene();
    this.emit();
  }
  /** Current pen ink (color + width) applied to new freehand strokes. */
  getInk() {
    return { color: this.inkColor, width: this.inkWidth };
  }
  setInk(color: string, width: number) {
    this.inkColor = color;
    this.inkWidth = width;
    this.emit();
  }

  setTool(t: Tool) {
    this.tool = t;
    if (this.app) {
      const drawing = t === "pen" || t === "connect" || SHAPE_TOOLS.includes(t);
      this.app.canvas.style.cursor = drawing ? "crosshair" : "default";
    }
    this.emit();
  }

  /** Screen rect (CSS px) of a node, for positioning DOM overlays. */
  nodeScreenRect(id: string) {
    const n = this.doc.getNode(id);
    if (!n) return null;
    const tl = this.camera.worldToScreen(n.x, n.y);
    return { x: tl.x, y: tl.y, w: n.w * this.camera.zoom, h: n.h * this.camera.zoom };
  }

  /** Screen-space bounding rect (CSS px) of the whole selection, for the
   *  floating toolbar. Null when nothing (or only edges) is selected. */
  selectionScreenRect() {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const id of this.selection) {
      const r = this.nodeScreenRect(id);
      if (!r) continue;
      x0 = Math.min(x0, r.x);
      y0 = Math.min(y0, r.y);
      x1 = Math.max(x1, r.x + r.w);
      y1 = Math.max(y1, r.y + r.h);
    }
    if (x0 === Infinity) return null;
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }

  /** The node currently being text-edited (so overlays can hide), or null. */
  getEditingId(): string | null {
    return this.editingId;
  }

  requestEdit(id: string) {
    this.editRequest?.(id);
  }

  /** While a node's DOM editor is open, suppress its baked-in label (so the
   *  live text isn't drawn twice). */
  setEditingId(id: string | null) {
    this.editingId = id;
    this.markScene();
  }

  // ── dirty flags / ticker ──────────────────────────────────────────────────
  private markScene() {
    this.sceneDirty = true;
  }
  private markCamera() {
    this.cameraDirty = true;
  }
  private onDocUpdate = () => {
    this.markScene();
    this.emit();
  };
  private tick = () => {
    if (this.cameraDirty) {
      this.applyCamera();
      this.cameraDirty = false;
    }
    if (this.sceneDirty) {
      this.renderScene();
      this.sceneDirty = false;
    }
  };

  // ── camera / grid ─────────────────────────────────────────────────────────
  private applyCamera() {
    const z = this.camera.zoom;
    this.world.scale.set(z);
    this.world.position.set(-this.camera.x * z, -this.camera.y * z);
    this.drawGrid();
    // Re-rasterize text at a higher density when zoom changes a lot (keeps
    // labels crisp instead of pixelated when zoomed in).
    const ratio = z / this.lastRenderZoom;
    if (ratio > 1.5 || ratio < 0.66) this.markScene();
    this.emit(); // let overlays reposition
  }

  private drawGrid() {
    const g = this.gridLayer;
    g.clear();
    const zoom = this.camera.zoom;
    const w = this.app.screen.width / zoom;
    const h = this.app.screen.height / zoom;
    const left = this.camera.x;
    const top = this.camera.y;

    // Adaptive spacing: keep dots ~28px+ apart on screen.
    let step = 32;
    while (step * zoom < 28) step *= 4;
    const fade = Math.min(1, (step * zoom - 28) / 40); // fade dots in as they spread

    const startX = Math.ceil(left / step) * step;
    const startY = Math.ceil(top / step) * step;
    const rad = 1.1 / zoom;
    for (let x = startX; x < left + w; x += step) {
      for (let y = startY; y < top + h; y += step) {
        g.circle(x, y, rad);
      }
    }
    g.fill({ color: theme.grid, alpha: 0.5 + 0.35 * fade });
  }

  // ── scene rendering ───────────────────────────────────────────────────────
  private renderScene() {
    this.contentLayer.removeChildren().forEach((c) => c.destroy());
    this.overlayLayer.removeChildren().forEach((c) => c.destroy());

    const nodes = this.doc.allNodes();
    const byId = new Map(nodes.map((n) => [n.id, n]));

    // Mind-map branches: implicit parent→child connectors (drawn from the tree
    // structure, not from explicit edges). Always at the very back.
    for (const n of nodes) {
      if (n.parentId && n.layoutId) {
        const p = byId.get(n.parentId);
        if (p) this.drawBranch(p, n);
      }
    }
    // Frames always render behind everything else (they're sections/containers).
    const framesBack = nodes.slice().sort((a, b) => a.z - b.z);
    for (const n of framesBack) if (n.shape === "frame") this.drawFrameNode(n);

    // Edges and non-frame nodes share one z-order so arrows can sit above or below
    // objects. Edges without an explicit z default below all objects (as before).
    const drawables: { z: number; draw: () => void }[] = [];
    for (const n of nodes)
      if (n.shape !== "frame") drawables.push({ z: n.z, draw: () => this.drawNode(n) });
    for (const e of this.doc.allEdges())
      drawables.push({ z: e.z ?? -1, draw: () => this.drawEdge(e, byId) });
    drawables.sort((a, b) => a.z - b.z);
    for (const d of drawables) d.draw();

    this.drawEdgeHandles(byId);
    this.drawSelection(byId);
    this.drawConnectHandles();
    this.lastRenderZoom = this.camera.zoom;
  }

  // ── export ────────────────────────────────────────────────────────────────
  /** World-space bounding box of all content, with padding. */
  private exportBounds(pad = 32): { x: number; y: number; w: number; h: number } {
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    const acc = (x: number, y: number) => {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    };
    for (const n of this.doc.allNodes()) {
      acc(n.x, n.y);
      acc(n.x + n.w, n.y + n.h);
    }
    const byId = new Map(this.doc.allNodes().map((n) => [n.id, n]));
    for (const e of this.doc.allEdges()) {
      const pts = this.edgePoints(e, byId);
      if (pts) for (const p of pts) acc(p.x, p.y);
    }
    if (!isFinite(minX)) {
      minX = 0;
      minY = 0;
      maxX = 400;
      maxY = 300;
    }
    return { x: minX - pad, y: minY - pad, w: maxX - minX + pad * 2, h: maxY - minY + pad * 2 };
  }

  /**
   * Render all content to a high-resolution raster image (PNG transparent, JPEG
   * on background). Shapes are vector-crisp; text is re-baked at the export scale
   * so labels are razor-sharp. `scale` is the minimum pixel density; small
   * diagrams are upscaled toward an HD target and everything is capped to the GPU
   * texture limit.
   */
  async exportImage(format: "png" | "jpeg", scale = 3): Promise<Blob | null> {
    const b = this.exportBounds();
    const maxDim = Math.max(b.w, b.h);
    const target = 2600; // aim for a crisp HD longest edge even for small diagrams
    const res = Math.max(
      1,
      Math.min(8, 8192 / maxDim, Math.max(scale, target / maxDim)),
    );

    // Re-render with high-density text before extracting.
    this.exportRes = res;
    this.renderScene();
    try {
      const canvas = this.app.renderer.extract.canvas({
        target: this.contentLayer,
        frame: new Rectangle(b.x, b.y, b.w, b.h),
        resolution: res,
        antialias: true,
        // PNG stays transparent; JPEG can't be, so use white (never the theme grey).
        clearColor: format === "jpeg" ? 0xffffff : { r: 0, g: 0, b: 0, a: 0 },
      }) as HTMLCanvasElement;
      return await new Promise((resolve) =>
        canvas.toBlob(
          (blob) => resolve(blob),
          format === "jpeg" ? "image/jpeg" : "image/png",
          0.95,
        ),
      );
    } finally {
      this.exportRes = 0;
      this.renderScene(); // restore on-screen text density
    }
  }

  /** Render all content to a resolution-independent SVG string. */
  exportSVG(): string {
    const b = this.exportBounds();
    const byId = new Map(this.doc.allNodes().map((n) => [n.id, n]));
    const nodes = this.doc.allNodes();
    const out: string[] = [];
    // No background fill — the SVG is transparent so it drops onto any surface.
    // mind-map branches (behind), then frames, then edges + nodes by z.
    for (const n of nodes) {
      if (n.parentId && n.layoutId) {
        const p = byId.get(n.parentId);
        if (p) out.push(this.branchSVG(p, n));
      }
    }
    for (const n of nodes.slice().sort((a, b) => a.z - b.z))
      if (n.shape === "frame") out.push(this.nodeSVG(n));
    const drawables: { z: number; svg: () => string }[] = [];
    for (const n of nodes)
      if (n.shape !== "frame") drawables.push({ z: n.z, svg: () => this.nodeSVG(n) });
    for (const e of this.doc.allEdges())
      drawables.push({ z: e.z ?? -1, svg: () => this.edgeSVG(e, byId) });
    drawables.sort((a, b) => a.z - b.z);
    for (const d of drawables) out.push(d.svg());

    return (
      `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(b.w)}" height="${Math.round(b.h)}" ` +
      `viewBox="${b.x} ${b.y} ${b.w} ${b.h}">\n${out.join("\n")}\n</svg>\n`
    );
  }

  private branchSVG(parent: SceneNode, child: SceneNode): string {
    const x1 = parent.x + parent.w;
    const y1 = parent.y + parent.h / 2;
    const x2 = child.x;
    const y2 = child.y + child.h / 2;
    const midX = (x1 + x2) / 2;
    return `<path d="M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}" fill="none" stroke="${hex(theme.edge)}" stroke-width="2" stroke-opacity="0.9"/>`;
  }

  private nodeSVG(n: SceneNode): string {
    const s = resolveStyle(n.shape, n.style);
    if (n.shape === "draw") {
      const pts = (n.points ?? [])
        .reduce<string[]>((acc, _v, i, a) => {
          if (i % 2 === 0) acc.push(`${n.x + a[i]},${n.y + a[i + 1]}`);
          return acc;
        }, [])
        .join(" ");
      return `<polyline points="${pts}" fill="none" stroke="${s.stroke}" stroke-width="${s.strokeWidth}" stroke-linecap="round" stroke-linejoin="round"/>`;
    }
    if (n.shape === "image" && n.src) {
      return `<image href="${esc(n.src)}" x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}"/>`;
    }
    let shape = "";
    if (n.shape !== "text") {
      const stroke =
        s.strokeWidth > 0 && s.stroke && s.stroke !== "#00000000"
          ? `stroke="${s.stroke}" stroke-width="${s.strokeWidth}"`
          : `stroke="none"`;
      if (n.shape === "ellipse")
        shape = `<ellipse cx="${n.x + n.w / 2}" cy="${n.y + n.h / 2}" rx="${n.w / 2}" ry="${n.h / 2}" fill="${s.fill}" ${stroke}/>`;
      else if (n.shape === "diamond")
        shape = `<polygon points="${n.x + n.w / 2},${n.y} ${n.x + n.w},${n.y + n.h / 2} ${n.x + n.w / 2},${n.y + n.h} ${n.x},${n.y + n.h / 2}" fill="${s.fill}" ${stroke}/>`;
      else
        shape = `<rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="${this.cornerRadius(n.shape)}" fill="${s.fill}" ${stroke}/>`;
    }
    const label = n.text.trim();
    return shape + (label ? this.textSVG(n, s, label) : "");
  }

  private textSVG(n: SceneNode, s: NodeStyle, label: string): string {
    const align = s.align ?? "center";
    const anchor = align === "left" ? "start" : align === "right" ? "end" : "middle";
    const pad = 10;
    const x = align === "left" ? n.x + pad : align === "right" ? n.x + n.w - pad : n.x + n.w / 2;
    const lines = label.split("\n");
    const lh = s.fontSize * 1.25;
    const top = n.y + n.h / 2 - ((lines.length - 1) * lh) / 2;
    const deco = [s.underline && "underline", s.strike && "line-through"].filter(Boolean).join(" ");
    const tspans = lines
      .map((ln, i) => `<tspan x="${x}" y="${top + i * lh}">${esc(ln)}</tspan>`)
      .join("");
    return (
      `<text text-anchor="${anchor}" dominant-baseline="central" ` +
      `font-family="${esc(fontStack(s.fontFamily))}" font-size="${s.fontSize}" ` +
      `font-weight="${s.bold ? 700 : 500}" font-style="${s.italic ? "italic" : "normal"}" ` +
      `fill="${readableText(s.textColor, s.fill)}"${deco ? ` text-decoration="${deco}"` : ""}>${tspans}</text>`
    );
  }

  private edgeSVG(e: SceneEdge, byId: Map<string, SceneNode>): string {
    const pts = this.edgePoints(e, byId);
    if (!pts) return "";
    const color = e.style.stroke ?? hex(e.kind === "flow" ? theme.edgeFlow : theme.edge);
    const width = e.style.width ?? 2;
    const poly = this.routedPolyline(pts, e.routing ?? "curved");
    const arrowEnd = e.arrowEnd ?? e.kind === "flow";
    const arrowStart = e.arrowStart ?? false;
    const head = e.arrowHead ?? "triangle";
    let headLen = width * 2 + 8;
    let halfW = width * 1.3 + 4;
    if (head === "thin") {
      headLen = width * 2.6 + 12;
      halfW = width * 0.8 + 2.5;
    } else if (head === "diamond") {
      headLen = width * 2.4 + 10;
      halfW = width * 1.1 + 3.5;
    } else if (head === "circle") {
      halfW = width * 1.1 + 3.5;
    }
    const retractLen = head === "open" ? width : head === "circle" ? halfW * 2 : headLen;
    const stroke = poly.map((p) => ({ ...p }));
    if (arrowEnd) retract(stroke, true, retractLen);
    if (arrowStart) retract(stroke, false, retractLen);

    const parts: string[] = [];
    parts.push(
      `<polyline points="${stroke.map((p) => `${p.x},${p.y}`).join(" ")}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`,
    );
    if (arrowEnd)
      parts.push(
        arrowheadSVG(poly[poly.length - 1], poly[poly.length - 2], color, headLen, halfW, head, width),
      );
    if (arrowStart) parts.push(arrowheadSVG(poly[0], poly[1], color, headLen, halfW, head, width));

    if (e.label.trim()) {
      const mid = poly[Math.floor(poly.length / 2)];
      const w = e.label.length * 6.6 + 10;
      parts.push(
        `<rect x="${mid.x - w / 2}" y="${mid.y - 10}" width="${w}" height="20" rx="5" fill="${hex(theme.canvasBg)}" fill-opacity="0.92"/>`,
      );
      parts.push(
        `<text x="${mid.x}" y="${mid.y}" text-anchor="middle" dominant-baseline="central" font-family="-apple-system, sans-serif" font-size="12" fill="${theme.text}">${esc(e.label)}</text>`,
      );
    }
    return parts.join("");
  }

  private drawNode(n: SceneNode) {
    const s = resolveStyle(n.shape, n.style);

    if (n.shape === "draw") {
      this.drawStrokeNode(n, s.stroke, s.strokeWidth);
      return;
    }

    if (n.shape === "image") {
      this.drawImageNode(n);
      return;
    }

    // "text" nodes are label-only (no box).
    if (n.shape !== "text") {
      const r = this.cornerRadius(n.shape);
      // Soft drop shadow for depth (layered low-alpha fills fake a blur, cheaply).
      if (n.shadow !== false) {
        const inv = 1 / this.camera.zoom;
        for (const L of [
          { dy: 8 * inv, sp: 5 * inv, a: 0.05 },
          { dy: 4 * inv, sp: 2.5 * inv, a: 0.07 },
          { dy: 1.5 * inv, sp: 0.5 * inv, a: 0.08 },
        ]) {
          const sh = new Graphics();
          this.shapePath(sh, n.shape, n.x - L.sp, n.y + L.dy, n.w + L.sp * 2, n.h, r);
          sh.fill({ color: 0x000000, alpha: L.a });
          this.contentLayer.addChild(sh);
        }
      }
      const g = new Graphics();
      this.shapePath(g, n.shape, n.x, n.y, n.w, n.h, r);
      g.fill(s.fill);
      // Border only when the user has set one (borderless by default).
      if (s.strokeWidth > 0 && s.stroke && s.stroke !== "#00000000") {
        g.stroke({ color: s.stroke, width: s.strokeWidth });
      }
      this.contentLayer.addChild(g);
    }

    const placeholder =
      n.shape === "topic" ? "Topic" : n.shape === "text" ? "Text" : n.shape === "sticky" ? "Note" : "";
    const label = this.editingId === n.id ? "" : n.text.trim() || placeholder;
    if (label) {
      const col = n.text.trim() ? readableText(s.textColor, s.fill) : theme.edge;
      const align = s.align ?? "center";
      const ax = align === "left" ? 0 : align === "right" ? 1 : 0.5;
      const pad = 10;
      const t = new Text({
        text: label,
        style: new TextStyle({
          fill: col,
          fontSize: s.fontSize,
          fontWeight: s.bold ? "700" : "500",
          fontStyle: s.italic ? "italic" : "normal",
          letterSpacing: 0.1,
          fontFamily: fontStack(s.fontFamily),
          align,
          wordWrap: true,
          wordWrapWidth: n.w - pad * 2,
        }),
      });
      t.resolution = this.textRes();
      t.anchor.set(ax, 0.5);
      const cx = n.x + (align === "left" ? pad : align === "right" ? n.w - pad : n.w / 2);
      const cy = n.y + n.h / 2;
      t.position.set(cx, cy);
      this.contentLayer.addChild(t);
      // Pixi Text has no underline/strikethrough — draw them as lines under the run.
      if (s.underline || s.strike) {
        const tw = t.width;
        const left = cx - ax * tw;
        const lw = Math.max(1, s.fontSize * 0.07);
        const dec = new Graphics();
        if (s.underline)
          dec.moveTo(left, cy + s.fontSize * 0.5).lineTo(left + tw, cy + s.fontSize * 0.5);
        if (s.strike) dec.moveTo(left, cy).lineTo(left + tw, cy);
        dec.stroke({ color: col, width: lw });
        this.contentLayer.addChild(dec);
      }
    }
  }

  private cornerRadius(shape: SceneNode["shape"]): number {
    return shape === "topic" || shape === "rounded" || shape === "sticky" ? 12 : 6;
  }

  private shapePath(g: Graphics, shape: SceneNode["shape"], x: number, y: number, w: number, h: number, r: number) {
    if (shape === "ellipse") g.ellipse(x + w / 2, y + h / 2, w / 2, h / 2);
    else if (shape === "diamond")
      g.poly([x + w / 2, y, x + w, y + h / 2, x + w / 2, y + h, x, y + h / 2]);
    else g.roundRect(x, y, w, h, r);
  }

  /** Render a titled frame/section (behind content, label at top-left). */
  private drawFrameNode(n: SceneNode) {
    const s = resolveStyle(n.shape, n.style);
    const g = new Graphics();
    g.roundRect(n.x, n.y, n.w, n.h, 8).fill(s.fill).stroke({ color: s.stroke, width: 1.5 });
    this.contentLayer.addChild(g);
    if (this.editingId === n.id) return;
    const t = new Text({
      text: n.text.trim() || "Frame",
      style: new TextStyle({
        fill: readableText(s.textColor, s.fill),
        fontSize: 14,
        fontWeight: "600",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      }),
    });
    t.resolution = this.textRes();
    t.position.set(n.x + 10, n.y + 8);
    this.contentLayer.addChild(t);
  }

  /** Render an embedded image (from a cached texture, loading lazily). */
  private drawImageNode(n: SceneNode) {
    if (!n.src) return;
    const tex = this.texCache.get(n.src);
    if (!tex) {
      // placeholder while the image decodes
      const g = new Graphics();
      g.roundRect(n.x, n.y, n.w, n.h, 4).fill("#1c2230").stroke({ color: "#33405c", width: 1 });
      this.contentLayer.addChild(g);
      const img = new Image();
      img.onload = () => {
        this.texCache.set(n.src!, Texture.from(img));
        this.markScene();
      };
      img.src = n.src;
      return;
    }
    const sprite = new Sprite(tex);
    sprite.position.set(n.x, n.y);
    sprite.width = n.w;
    sprite.height = n.h;
    this.contentLayer.addChild(sprite);
  }

  /** Load an image file (paste/drop/picker) into a new image node. */
  addImageFile(file: File, world?: Point) {
    const reader = new FileReader();
    reader.onload = () => {
      const src = reader.result as string;
      const img = new Image();
      img.onload = () => {
        const max = 360;
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const w = img.width * scale;
        const h = img.height * scale;
        const pos =
          world ??
          this.camera.screenToWorld(this.app.screen.width / 2, this.app.screen.height / 2);
        const node = this.cmd.createImage(src, pos.x, pos.y, w, h);
        this.setSelection([node.id]);
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
  }

  /** Render a freehand pen stroke (points are relative to n.x,n.y). */
  private drawStrokeNode(n: SceneNode, color: string, width: number) {
    const pts = n.points;
    if (!pts || pts.length < 4) return;
    const g = new Graphics();
    this.inkStroke(g, pts, n.x, n.y, width);
    g.stroke({ color, width, cap: "round", join: "round" });
    this.contentLayer.addChild(g);
  }

  /**
   * Build a smooth freehand path. perfect-freehand's `getStrokePoints` applies
   * the same input streamlining tldraw uses (low-pass filter that removes the
   * jitter/lag of Apple Pencil over Sidecar); we then draw quadratic curves
   * through the smoothed points and STROKE the result (constant width). We stroke
   * rather than fill an outline so overlapping/looping handwriting doesn't turn
   * into filled blobs. `pts` is a flat [x0,y0,x1,y1,…] array.
   */
  private inkStroke(g: Graphics, pts: number[], ox: number, oy: number, width: number) {
    const input: number[][] = [];
    for (let i = 0; i < pts.length; i += 2) input.push([ox + pts[i], oy + pts[i + 1]]);
    const sp = getStrokePoints(input, { streamline: 0.55, size: width });
    const n = sp.length;
    if (n < 2) return;
    const px = (i: number) => sp[i].point[0];
    const py = (i: number) => sp[i].point[1];
    g.moveTo(px(0), py(0));
    if (n < 3) {
      for (let i = 1; i < n; i++) g.lineTo(px(i), py(i));
      return;
    }
    let i = 1;
    for (; i < n - 2; i++) {
      g.quadraticCurveTo(px(i), py(i), (px(i) + px(i + 1)) / 2, (py(i) + py(i + 1)) / 2);
    }
    g.quadraticCurveTo(px(n - 2), py(n - 2), px(n - 1), py(n - 1));
  }

  // ── drag-to-draw previews (world space, above nodes) ───────────────────────
  private clearPreview() {
    this.previewGfx.clear();
  }
  private previewShape(shape: SceneNode["shape"], a: Point, b: Point) {
    const g = this.previewGfx;
    g.clear();
    const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
    const w = Math.abs(b.x - a.x), h = Math.abs(b.y - a.y);
    if (shape === "ellipse") g.ellipse(x + w / 2, y + h / 2, w / 2, h / 2);
    else if (shape === "diamond")
      g.poly([x + w / 2, y, x + w, y + h / 2, x + w / 2, y + h, x, y + h / 2]);
    else g.roundRect(x, y, w, h, shape === "text" ? 4 : 6);
    g.stroke({ color: theme.selection, width: 1.5 / this.camera.zoom });
  }
  private previewStroke(pts: number[]) {
    const g = this.previewGfx;
    g.clear();
    if (pts.length < 4) return;
    this.inkStroke(g, pts, 0, 0, this.inkWidth);
    g.stroke({ color: this.inkColor, width: this.inkWidth, cap: "round", join: "round" });
  }

  // ── snapping & alignment guides ────────────────────────────────────────────
  /** Snap the dragged rect's edges/centers to other objects; return delta + guides. */
  private computeSnap(x: number, y: number, w: number, h: number, exclude: Set<string>) {
    const thr = 6 / this.camera.zoom;
    const xs: number[] = [];
    const ys: number[] = [];
    for (const n of this.doc.allNodes()) {
      if (exclude.has(n.id)) continue;
      xs.push(n.x, n.x + n.w / 2, n.x + n.w);
      ys.push(n.y, n.y + n.h / 2, n.y + n.h);
    }
    const pick = (mine: number[], targets: number[]) => {
      let best: { delta: number; at: number } | null = null;
      for (const m of mine)
        for (const t of targets) {
          const d = t - m;
          if (Math.abs(d) <= thr && (!best || Math.abs(d) < Math.abs(best.delta)))
            best = { delta: d, at: t };
        }
      return best;
    };
    const sx = pick([x, x + w / 2, x + w], xs);
    const sy = pick([y, y + h / 2, y + h], ys);
    const guides: { vertical: boolean; at: number }[] = [];
    if (sx) guides.push({ vertical: true, at: sx.at });
    if (sy) guides.push({ vertical: false, at: sy.at });
    return { dx: sx ? sx.delta : 0, dy: sy ? sy.delta : 0, guides };
  }

  private drawGuides(guides: { vertical: boolean; at: number }[]) {
    const g = this.previewGfx;
    g.clear();
    const vp = this.viewportWorld();
    for (const gd of guides) {
      if (gd.vertical) g.moveTo(gd.at, vp.y).lineTo(gd.at, vp.y + vp.h);
      else g.moveTo(vp.x, gd.at).lineTo(vp.x + vp.w, gd.at);
    }
    g.stroke({ color: 0xff4d8d, width: 1 / this.camera.zoom, alpha: 0.9 });
  }

  /** A smooth mind-map branch from parent's right side to child's left side. */
  private drawBranch(parent: SceneNode, child: SceneNode) {
    const x1 = parent.x + parent.w;
    const y1 = parent.y + parent.h / 2;
    const x2 = child.x;
    const y2 = child.y + child.h / 2;
    const midX = (x1 + x2) / 2;
    const g = new Graphics();
    g.moveTo(x1, y1).bezierCurveTo(midX, y1, midX, y2, x2, y2);
    g.stroke({ color: theme.edge, width: 2, alpha: 0.9 });
    this.contentLayer.addChild(g);
  }

  /**
   * [sourceEnd, ...waypoints, targetEnd] in world coords, or null.
   * Either end may be attached to a node (border/anchor) or a free-floating point.
   */
  private edgePoints(e: SceneEdge, byId: Map<string, SceneNode>): Point[] | null {
    const a = e.source ? byId.get(e.source) : undefined;
    const b = e.target ? byId.get(e.target) : undefined;
    // A valid end is either a node or a free point; bail only if an end has neither.
    if (!a && !e.sourcePoint) return null;
    if (!b && !e.targetPoint) return null;
    const wps = e.waypoints ?? [];
    // Each node end aims toward the first bend, else the other end.
    const tgtRef = e.targetPoint ?? (b ? center(b) : undefined);
    const srcRef = e.sourcePoint ?? (a ? center(a) : undefined);
    const from = e.sourcePoint
      ? { x: e.sourcePoint.x, y: e.sourcePoint.y }
      : e.sourceAnchor
        ? anchorPoint(a!, e.sourceAnchor)
        : borderPoint(a!, wps[0] ?? tgtRef!);
    const to = e.targetPoint
      ? { x: e.targetPoint.x, y: e.targetPoint.y }
      : e.targetAnchor
        ? anchorPoint(b!, e.targetAnchor)
        : borderPoint(b!, wps[wps.length - 1] ?? srcRef!);
    return [from, ...wps.map((w) => ({ x: w.x, y: w.y })), to];
  }

  /** The drawn connector path as a dense polyline, honoring its routing style. */
  private routedPolyline(pts: Point[], routing: EdgeRouting): Point[] {
    if (routing === "straight") return pts;
    if (routing === "step") {
      const out: Point[] = [pts[0]];
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i];
        const b = pts[i + 1];
        const midX = (a.x + b.x) / 2;
        out.push({ x: midX, y: a.y }, { x: midX, y: b.y }, b);
      }
      return out;
    }
    // curved (Catmull-Rom) — sampled by on-screen length so it stays smooth when
    // zoomed in (a fixed step facets into a visible zig-zag at high zoom).
    if (pts.length === 2) {
      const from = pts[0];
      const to = pts[1];
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const horiz = Math.abs(dx) >= Math.abs(dy);
      const k = 0.5;
      const c1 = horiz ? { x: from.x + dx * k, y: from.y } : { x: from.x, y: from.y + dy * k };
      const c2 = horiz ? { x: to.x - dx * k, y: to.y } : { x: to.x, y: to.y - dy * k };
      const n = this.curveSteps(from, c1, c2, to);
      const out: Point[] = [from];
      for (let i = 1; i <= n; i++) out.push(bezierPoint(from, c1, c2, to, i / n));
      return out;
    }
    const segs = catmullRom(pts);
    const out: Point[] = [pts[0]];
    let prev = pts[0];
    for (const s of segs) {
      const n = this.curveSteps(prev, s.c1, s.c2, s.p);
      for (let i = 1; i <= n; i++) out.push(bezierPoint(prev, s.c1, s.c2, s.p, i / n));
      prev = s.p;
    }
    return out;
  }

  /** How many segments to sample a bezier into: ~1 point per 6 on-screen pixels. */
  private curveSteps(p0: Point, c1: Point, c2: Point, p1: Point): number {
    const len =
      Math.hypot(c1.x - p0.x, c1.y - p0.y) +
      Math.hypot(c2.x - c1.x, c2.y - c1.y) +
      Math.hypot(p1.x - c2.x, p1.y - c2.y); // control-polygon length ≈ upper bound
    return Math.max(8, Math.min(200, Math.ceil((len * this.camera.zoom) / 6)));
  }

  /** Draw an arrowhead of the given style at `tip`, pointing away from `from`. */
  private arrowhead(
    g: Graphics,
    tip: Point,
    from: Point,
    color: string | number,
    len: number,
    halfW: number,
    style: NonNullable<SceneEdge["arrowHead"]> = "triangle",
    width = 2,
  ) {
    const dx = tip.x - from.x;
    const dy = tip.y - from.y;
    const d = Math.hypot(dx, dy) || 1;
    const ux = dx / d;
    const uy = dy / d; // unit along the line, toward the tip
    const px = -uy;
    const py = ux; // perpendicular
    const bx = tip.x - ux * len;
    const by = tip.y - uy * len; // base center
    const ax = bx + px * halfW;
    const ay = by + py * halfW; // one base corner
    const cx = bx - px * halfW;
    const cy = by - py * halfW; // other base corner

    if (style === "open") {
      // Two lines meeting at the tip — the classic sharp/open arrow.
      g.moveTo(ax, ay).lineTo(tip.x, tip.y).lineTo(cx, cy);
      g.stroke({ color, width, cap: "round", join: "round" });
    } else if (style === "diamond") {
      const mx = tip.x - ux * (len / 2);
      const my = tip.y - uy * (len / 2);
      g.moveTo(tip.x, tip.y)
        .lineTo(mx + px * halfW, my + py * halfW)
        .lineTo(bx, by)
        .lineTo(mx - px * halfW, my - py * halfW)
        .closePath()
        .fill(color);
    } else if (style === "circle") {
      g.circle(tip.x - ux * halfW, tip.y - uy * halfW, halfW).fill(color);
    } else {
      // triangle / thin — filled isosceles (thin just uses a narrower base).
      g.moveTo(tip.x, tip.y).lineTo(ax, ay).lineTo(cx, cy).closePath().fill(color);
    }
  }

  private drawEdge(e: SceneEdge, byId: Map<string, SceneNode>) {
    const pts = this.edgePoints(e, byId);
    if (!pts) return;
    const color = e.style.stroke ?? (e.kind === "flow" ? theme.edgeFlow : theme.edge);
    const width = e.style.width ?? 2;
    const poly = this.routedPolyline(pts, e.routing ?? "curved");
    const arrowEnd = e.arrowEnd ?? e.kind === "flow";
    const arrowStart = e.arrowStart ?? false;
    const head = e.arrowHead ?? "triangle";
    // Arrowhead scales with line width; geometry varies by style.
    let headLen = width * 2 + 8;
    let halfW = width * 1.3 + 4;
    if (head === "thin") {
      headLen = width * 2.6 + 12;
      halfW = width * 0.8 + 2.5;
    } else if (head === "diamond") {
      headLen = width * 2.4 + 10;
      halfW = width * 1.1 + 3.5;
    } else if (head === "circle") {
      halfW = width * 1.1 + 3.5;
    }
    // How far the line must stop short so it doesn't poke through the head.
    const retractLen =
      head === "open" ? width : head === "circle" ? halfW * 2 : headLen;

    // The stroke ends at the arrowhead's base (retracted).
    const stroke = poly.map((p) => ({ ...p }));
    if (arrowEnd) retract(stroke, true, retractLen);
    if (arrowStart) retract(stroke, false, retractLen);

    const g = new Graphics();
    g.moveTo(stroke[0].x, stroke[0].y);
    for (let i = 1; i < stroke.length; i++) g.lineTo(stroke[i].x, stroke[i].y);
    g.stroke({ color, width, cap: "round", join: "round" });

    if (arrowEnd)
      this.arrowhead(g, poly[poly.length - 1], poly[poly.length - 2], color, headLen, halfW, head, width);
    if (arrowStart) this.arrowhead(g, poly[0], poly[1], color, headLen, halfW, head, width);
    this.contentLayer.addChild(g);

    if (e.label.trim()) {
      const mid = poly[Math.floor(poly.length / 2)];
      const t = new Text({
        text: e.label,
        style: new TextStyle({
          fill: theme.text,
          fontSize: 12,
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        }),
      });
      t.resolution = this.textRes();
      t.anchor.set(0.5);
      t.position.set(mid.x, mid.y);
      // readable pill behind the label so the line doesn't cross the text
      const pad = 5;
      const bg = new Graphics();
      bg.roundRect(mid.x - t.width / 2 - pad, mid.y - t.height / 2 - 2, t.width + pad * 2, t.height + 4, 5)
        .fill({ color: theme.canvasBg, alpha: 0.92 });
      this.contentLayer.addChild(bg);
      this.contentLayer.addChild(t);
    }
  }

  /** Dense polyline of the drawn connector (for hit-testing). */
  private sampleEdge(e: SceneEdge, byId: Map<string, SceneNode>): Point[] | null {
    const pts = this.edgePoints(e, byId);
    if (!pts) return null;
    return this.routedPolyline(pts, e.routing ?? "curved");
  }

  private hitEdge(world: Point): string | null {
    const byId = new Map(this.doc.allNodes().map((n) => [n.id, n]));
    const tol = 8 / this.camera.zoom;
    let best: { id: string; d: number } | null = null;
    for (const e of this.doc.allEdges()) {
      const s = this.sampleEdge(e, byId);
      if (!s) continue;
      for (let i = 0; i < s.length - 1; i++) {
        const d = distToSegment(world, s[i], s[i + 1]);
        if (d < tol && (!best || d < best.d)) best = { id: e.id, d };
      }
    }
    return best?.id ?? null;
  }

  /**
   * Hit an edge control: a free/attached endpoint (end set), a waypoint
   * (add:false), or a segment midpoint add-handle (add:true).
   */
  private hitEdgeHandle(
    world: Point,
  ): { index: number; add: boolean; end?: "source" | "target" } | null {
    if (!this.edgeSel) return null;
    const e = this.doc.getEdge(this.edgeSel);
    if (!e) return null;
    const byId = new Map(this.doc.allNodes().map((n) => [n.id, n]));
    const pts = this.edgePoints(e, byId);
    if (!pts) return null;
    const tol = 9 / this.camera.zoom;
    // Endpoints first so they win over an overlapping segment add-handle.
    if (Math.hypot(world.x - pts[0].x, world.y - pts[0].y) < tol)
      return { index: 0, add: false, end: "source" };
    const lastP = pts[pts.length - 1];
    if (Math.hypot(world.x - lastP.x, world.y - lastP.y) < tol)
      return { index: pts.length - 1, add: false, end: "target" };
    const wps = e.waypoints ?? [];
    for (let i = 0; i < wps.length; i++) {
      if (Math.hypot(world.x - wps[i].x, world.y - wps[i].y) < tol) return { index: i, add: false };
    }
    for (let s = 0; s < pts.length - 1; s++) {
      const mx = (pts[s].x + pts[s + 1].x) / 2;
      const my = (pts[s].y + pts[s + 1].y) / 2;
      if (Math.hypot(world.x - mx, world.y - my) < tol) return { index: s, add: true };
    }
    return null;
  }

  private drawEdgeHandles(byId: Map<string, SceneNode>) {
    if (!this.edgeSel) return;
    const e = this.doc.getEdge(this.edgeSel);
    if (!e) return;
    const pts = this.edgePoints(e, byId);
    if (!pts) return;
    const z = this.camera.zoom;
    // highlight the connector
    const sample = this.sampleEdge(e, byId);
    if (sample) {
      const hl = new Graphics();
      hl.moveTo(sample[0].x, sample[0].y);
      for (let i = 1; i < sample.length; i++) hl.lineTo(sample[i].x, sample[i].y);
      hl.stroke({ color: theme.selection, width: 4 / z, alpha: 0.28, cap: "round" });
      this.overlayLayer.addChild(hl);
    }
    // segment midpoint add-handles (hollow accent dots)
    for (let s = 0; s < pts.length - 1; s++) {
      const mx = (pts[s].x + pts[s + 1].x) / 2;
      const my = (pts[s].y + pts[s + 1].y) / 2;
      const g = new Graphics();
      g.circle(mx, my, 4 / z).fill(theme.selection).stroke({ color: "#ffffff", width: 1 / z });
      this.overlayLayer.addChild(g);
    }
    // existing waypoint handles (solid white)
    for (const w of e.waypoints ?? []) {
      const g = new Graphics();
      g.circle(w.x, w.y, 5.5 / z).fill("#ffffff").stroke({ color: theme.selection, width: 1.5 / z });
      this.overlayLayer.addChild(g);
    }
    // endpoint handles — draggable to reposition or (re)attach the ends.
    for (const end of [pts[0], pts[pts.length - 1]]) {
      const g = new Graphics();
      g.circle(end.x, end.y, 6.5 / z).fill(theme.selection).stroke({ color: "#ffffff", width: 2 / z });
      this.overlayLayer.addChild(g);
    }
  }

  // ── hover-to-connect: connection points on the hovered node ────────────────
  private connectHandles(n: SceneNode): Point[] {
    return [
      { x: n.x + n.w / 2, y: n.y }, // N
      { x: n.x + n.w, y: n.y + n.h / 2 }, // E
      { x: n.x + n.w / 2, y: n.y + n.h }, // S
      { x: n.x, y: n.y + n.h / 2 }, // W
    ];
  }

  /**
   * A connection can start from anywhere along the hovered node's border, not
   * just fixed points. Returns the exact attachment point (world) plus its
   * fractional anchor, so the connector stays glued to that spot on the object.
   */
  private hitConnectZone(
    world: Point,
  ): { nodeId: string; x: number; y: number; fx: number; fy: number } | null {
    if (!this.hoveredId) return null;
    const n = this.doc.getNode(this.hoveredId);
    if (!n) return null;
    // A selected node's corner resize handles win over the border band.
    const band = 12 / this.camera.zoom;
    if (distToPerimeter(n, world) > band) return null;
    const a = perimeterAnchor(n, world);
    const p = anchorPoint(n, a);
    return { nodeId: n.id, x: p.x, y: p.y, fx: a.fx, fy: a.fy };
  }

  private drawConnectHandles() {
    if (!this.hoveredId) return;
    const n = this.doc.getNode(this.hoveredId);
    if (!n) return;
    const z = this.camera.zoom;
    // "Connect from anywhere on this edge" — highlight the whole perimeter.
    if (!this.selection.has(n.id)) {
      const ring = new Graphics();
      ring
        .roundRect(n.x - 2, n.y - 2, n.w + 4, n.h + 4, this.cornerRadius(n.shape) + 2)
        .stroke({ color: theme.accent, width: 1.5 / z, alpha: 0.5 });
      this.overlayLayer.addChild(ring);
    }
    // Grab handles on each side — drag one out to draw a connector, or drop in
    // empty space to spawn a new connected node (Miro-style quick-connect).
    for (const h of this.connectHandles(n)) {
      const g = new Graphics();
      g.circle(h.x, h.y, 4.5 / z).fill("#ffffff").stroke({ color: theme.accent, width: 1.5 / z });
      this.overlayLayer.addChild(g);
    }
    // live anchor: the exact spot the connector will attach as you move along the edge
    if (this.hoverWorld && distToPerimeter(n, this.hoverWorld) <= 12 / z) {
      const p = anchorPoint(n, perimeterAnchor(n, this.hoverWorld));
      const dot = new Graphics();
      dot.circle(p.x, p.y, 11 / z).fill({ color: theme.accent, alpha: 0.18 });
      dot.circle(p.x, p.y, 6 / z).fill(theme.accent).stroke({ color: "#ffffff", width: 2 / z });
      this.overlayLayer.addChild(dot);
    }
  }

  private previewLink(from: Point, to: Point) {
    const g = this.previewGfx;
    g.clear();
    const z = this.camera.zoom;
    g.moveTo(from.x, from.y).lineTo(to.x, to.y);
    g.stroke({ color: theme.edgeFlow, width: 2 / z, cap: "round" });
    const ang = Math.atan2(to.y - from.y, to.x - from.x);
    const len = 12 / z;
    const sp = Math.PI / 8;
    g.moveTo(to.x, to.y)
      .lineTo(to.x - len * Math.cos(ang - sp), to.y - len * Math.sin(ang - sp))
      .lineTo(to.x - len * Math.cos(ang + sp), to.y - len * Math.sin(ang + sp))
      .closePath()
      .fill(theme.edgeFlow);
  }

  /** The rubber-band selection box (world space, above content). */
  private drawMarquee(a: Point, b: Point) {
    const g = this.previewGfx;
    g.clear();
    const z = this.camera.zoom;
    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);
    const w = Math.abs(b.x - a.x);
    const h = Math.abs(b.y - a.y);
    g.rect(x, y, w, h)
      .fill({ color: theme.selection, alpha: 0.1 })
      .stroke({ color: theme.selection, width: 1 / z, alpha: 0.9 });
  }

  /** Ids of nodes whose box overlaps the marquee rectangle. */
  private nodesInRect(a: Point, b: Point): string[] {
    const x0 = Math.min(a.x, b.x);
    const y0 = Math.min(a.y, b.y);
    const x1 = Math.max(a.x, b.x);
    const y1 = Math.max(a.y, b.y);
    return this.doc
      .allNodes()
      .filter((n) => n.x < x1 && n.x + n.w > x0 && n.y < y1 && n.y + n.h > y0)
      .map((n) => n.id);
  }

  private drawSelection(byId: Map<string, SceneNode>) {
    const z = this.camera.zoom;
    for (const id of this.selection) {
      const n = byId.get(id);
      if (!n) continue;
      const r = this.cornerRadius(n.shape) + 3;
      // soft outer glow + crisp inner accent ring
      const glow = new Graphics();
      glow.roundRect(n.x - 4, n.y - 4, n.w + 8, n.h + 8, r);
      glow.stroke({ color: theme.selection, width: 4 / z, alpha: 0.16 });
      this.overlayLayer.addChild(glow);
      const g = new Graphics();
      g.roundRect(n.x - 3, n.y - 3, n.w + 6, n.h + 6, r);
      g.stroke({ color: theme.selection, width: 1.5 / z });
      this.overlayLayer.addChild(g);
    }
    // resize handles for single selection (not for freehand strokes or locked)
    if (this.selection.size === 1) {
      const n = byId.get([...this.selection][0]);
      if (n && n.shape !== "draw" && !n.locked) {
        for (const h of handlesFor(n)) {
          const hs = 8 / z;
          const g = new Graphics();
          g.roundRect(h.x - hs / 2, h.y - hs / 2, hs, hs, 2 / z)
            .fill("#ffffff")
            .stroke({ color: theme.selection, width: 1.5 / z });
          this.overlayLayer.addChild(g);
        }
      }
    }
    this.overlayLayer.scale.set(this.camera.zoom);
    this.overlayLayer.position.set(
      -this.camera.x * this.camera.zoom,
      -this.camera.y * this.camera.zoom,
    );
  }

  // ── hit testing ───────────────────────────────────────────────────────────
  private hitNode(world: Point): SceneNode | null {
    const nodes = this.doc.allNodes().sort((a, b) => b.z - a.z);
    let frameHit: SceneNode | null = null;
    for (const n of nodes) {
      const inside =
        world.x >= n.x && world.x <= n.x + n.w && world.y >= n.y && world.y <= n.y + n.h;
      if (!inside) continue;
      if (n.shape === "frame") {
        if (!frameHit) frameHit = n; // frames yield to content on top of them
      } else {
        return n;
      }
    }
    return frameHit;
  }

  /** Ids of nodes whose center sits inside frame `f` (moved with the frame). */
  private nodesInFrame(f: SceneNode): string[] {
    return this.doc
      .allNodes()
      .filter(
        (n) =>
          n.id !== f.id &&
          n.shape !== "frame" &&
          n.x + n.w / 2 >= f.x &&
          n.x + n.w / 2 <= f.x + f.w &&
          n.y + n.h / 2 >= f.y &&
          n.y + n.h / 2 <= f.y + f.h,
      )
      .map((n) => n.id);
  }

  private hitHandle(world: Point): Handle | null {
    if (this.selection.size !== 1) return null;
    const n = this.doc.getNode([...this.selection][0]);
    if (!n || n.locked || n.shape === "draw") return null;
    const tol = 9 / this.camera.zoom;
    for (const h of handlesFor(n)) {
      if (Math.abs(world.x - h.x) < tol && Math.abs(world.y - h.y) < tol)
        return h;
    }
    return null;
  }

  // ── input ─────────────────────────────────────────────────────────────────
  private bindInput() {
    const el = this.app.canvas;
    let mode:
      | "idle"
      | "pan"
      | "move"
      | "resize"
      | "create"
      | "draw"
      | "wp"
      | "link"
      | "marquee" = "idle";
    let marqueeStart: Point | null = null; // world anchor of the selection box
    let marqueeBase: string[] = []; // selection to add to (shift-drag)
    // A link starts either anchored to a node (fx/fy set) or free-floating (nodeId "").
    let linkSource: {
      nodeId: string;
      x: number;
      y: number;
      fx?: number;
      fy?: number;
    } | null = null;
    let last = { x: 0, y: 0 };
    let moveOrigin: { id: string; x: number; y: number }[] = [];
    let resizeHandle: Handle | null = null;
    let resizeStart: SceneNode | null = null;
    let downWorld: Point = { x: 0, y: 0 };
    let dragged = false;
    let strokePts: number[] = []; // world coords for pen tool
    let wpEdge: string | null = null; // connector being reshaped
    let wpIndex = 0;
    let wpEnd: "source" | "target" | null = null; // dragging a connector endpoint
    // Quick-connect (Miro-style): a link dragged out from a hovered node's border
    // with the select tool. Dropped in empty space it spawns a new connected node.
    let linkQuick = false;

    const dragWaypoint = (world: Point) => {
      if (!wpEdge) return;
      if (wpEnd) {
        // Live-drag a free endpoint; snapping/attaching happens on release.
        this.cmd.setEdgeEndpoint(wpEdge, wpEnd, {
          point: { x: Math.round(world.x), y: Math.round(world.y) },
        });
        return;
      }
      const e = this.doc.getEdge(wpEdge);
      if (!e) return;
      const wps = (e.waypoints ?? []).map((w) => ({ ...w }));
      if (wpIndex < wps.length) {
        wps[wpIndex] = { x: Math.round(world.x), y: Math.round(world.y) };
        this.cmd.setWaypoints(wpEdge, wps);
      }
    };

    const localXY = (e: { clientX: number; clientY: number }) => {
      const r = el.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };

    el.addEventListener("pointerdown", (e) => {
      el.setPointerCapture(e.pointerId);
      const p = localXY(e);
      const world = this.camera.screenToWorld(p.x, p.y);
      last = p;
      downWorld = world;
      dragged = false;

      // middle button or space-pan → pan
      if (e.button === 1) {
        mode = "pan";
        return;
      }

      // Drawing tools take precedence over selection/hit-testing.
      if (this.tool === "pen") {
        mode = "draw";
        strokePts = [world.x, world.y];
        this.previewStroke(strokePts);
        return;
      }
      if (SHAPE_TOOLS.includes(this.tool)) {
        mode = "create";
        this.previewShape(toolShape(this.tool), world, world);
        return;
      }

      // Arrow tool: press-drag-release. Either end may land on an object (attaches)
      // or in open space (stays a free, open-ended endpoint — no block is created).
      if (this.tool === "connect") {
        const hitN = this.hitNode(world);
        if (hitN) {
          const a = freeAnchor(hitN, world);
          const p = anchorPoint(hitN, a);
          linkSource = { nodeId: hitN.id, x: p.x, y: p.y, fx: a.fx, fy: a.fy };
        } else {
          linkSource = { nodeId: "", x: world.x, y: world.y };
        }
        mode = "link";
        linkQuick = false;
        this.previewLink({ x: linkSource.x, y: linkSource.y }, world);
        return;
      }

      // Grabbing a connector endpoint / waypoint / add-handle takes priority.
      const eh = this.hitEdgeHandle(world);
      if (eh && this.edgeSel) {
        if (eh.end) {
          wpEnd = eh.end; // drag the whole end of the arrow
        } else if (eh.add) {
          const e = this.doc.getEdge(this.edgeSel);
          const wps = (e?.waypoints ?? []).map((w) => ({ ...w }));
          wps.splice(eh.index, 0, { x: Math.round(world.x), y: Math.round(world.y) });
          this.cmd.setWaypoints(this.edgeSel, wps);
          wpIndex = eh.index;
        } else {
          wpIndex = eh.index;
        }
        wpEdge = this.edgeSel;
        mode = "wp";
        return;
      }

      const handle = this.hitHandle(world);
      if (handle) {
        mode = "resize";
        resizeHandle = handle;
        resizeStart = this.doc.getNode([...this.selection][0])!;
        return;
      }

      // Dragging out from anywhere along a hovered node's border starts an arrow,
      // anchored at that exact point on the object.
      const ch = this.hitConnectZone(world);
      if (ch && this.tool === "select") {
        mode = "link";
        linkQuick = true;
        linkSource = ch;
        this.previewLink({ x: ch.x, y: ch.y }, world);
        return;
      }

      const hit = this.hitNode(world);

      if (hit) {
        const groupSel = this.cmd.expandGroups([hit.id]); // clicking a member selects the group
        if (e.shiftKey) {
          const s = new Set(this.selection);
          const has = groupSel.every((id) => s.has(id));
          groupSel.forEach((id) => (has ? s.delete(id) : s.add(id)));
          this.setSelection([...s]);
        } else if (!this.selection.has(hit.id)) {
          this.setSelection(groupSel);
        }
        mode = "move";
        // Build the move set: selection (minus locked) + any framed contents.
        const ids = new Set(this.getSelection());
        for (const id of this.getSelection()) {
          const nn = this.doc.getNode(id);
          if (nn && nn.shape === "frame") for (const c of this.nodesInFrame(nn)) ids.add(c);
        }
        moveOrigin = [...ids]
          .map((id) => this.doc.getNode(id))
          .filter((n): n is SceneNode => !!n && !n.locked)
          .map((n) => ({ id: n.id, x: n.x, y: n.y }));
      } else {
        // No node under the cursor — try selecting a connector.
        const eid = this.hitEdge(world);
        if (eid) {
          this.setEdgeSelection(eid);
          mode = "idle";
        } else if (this.spaceHeld || this.tool !== "select") {
          // Hold Space (or a non-select tool) → pan the canvas.
          if (!e.shiftKey) this.setSelection([]);
          this.setEdgeSelection(null);
          mode = "pan";
        } else {
          // Drag on empty canvas → rubber-band (marquee) select.
          this.setEdgeSelection(null);
          marqueeBase = e.shiftKey ? [...this.selection] : [];
          if (!e.shiftKey) this.setSelection([]);
          marqueeStart = world;
          mode = "marquee";
        }
      }
    });

    el.addEventListener("pointermove", (e) => {
      const p = localXY(e);
      const dx = p.x - last.x;
      const dy = p.y - last.y;
      if (Math.abs(p.x - last.x) + Math.abs(p.y - last.y) > 0) dragged = true;
      const world = this.camera.screenToWorld(p.x, p.y);
      this.cursorCb?.(world);

      if (mode === "pan") {
        this.camera.panBy(dx, dy);
        this.markCamera();
      } else if (mode === "move") {
        let ddx = world.x - downWorld.x;
        let ddy = world.y - downWorld.y;
        // Snap the primary node's edges/centers to nearby objects; show guides.
        const prim = moveOrigin[0];
        const pn = prim && this.doc.getNode(prim.id);
        if (prim && pn) {
          const snap = this.computeSnap(
            prim.x + ddx,
            prim.y + ddy,
            pn.w,
            pn.h,
            new Set(moveOrigin.map((o) => o.id)),
          );
          ddx += snap.dx;
          ddy += snap.dy;
          this.drawGuides(snap.guides);
        }
        this.doc.transact(() => {
          for (const o of moveOrigin)
            this.cmd.moveNode(o.id, o.x + ddx, o.y + ddy);
        });
      } else if (mode === "resize" && resizeHandle && resizeStart) {
        this.applyResize(resizeStart, resizeHandle, world);
      } else if (mode === "create") {
        this.previewShape(toolShape(this.tool), downWorld, world);
      } else if (mode === "draw") {
        // Apple Pencil (and other high-rate pointers) coalesce many samples into
        // one move event; pull them all out so the stroke follows the real path
        // instead of one jagged point per frame. Drop near-duplicate samples.
        const samples = e.getCoalescedEvents?.() ?? [];
        const minWorld = 0.6 / this.camera.zoom; // ~0.6 screen px
        for (const ev of samples.length ? samples : [e]) {
          const lp = localXY(ev);
          const w = this.camera.screenToWorld(lp.x, lp.y);
          const m = strokePts.length;
          if (m >= 2) {
            const ex = w.x - strokePts[m - 2];
            const ey = w.y - strokePts[m - 1];
            if (ex * ex + ey * ey < minWorld * minWorld) continue;
          }
          strokePts.push(w.x, w.y);
        }
        this.previewStroke(strokePts);
      } else if (mode === "wp") {
        dragWaypoint(world);
      } else if (mode === "link") {
        this.previewLink(linkSource!, world);
      } else if (mode === "marquee" && marqueeStart) {
        this.drawMarquee(marqueeStart, world);
        const inside = this.nodesInRect(marqueeStart, world);
        this.setSelection([...new Set([...marqueeBase, ...inside])]);
      } else if (mode === "idle" && this.tool === "select") {
        // Hover: show connection points on the node under the cursor.
        const hit = this.hitNode(world);
        const id = hit && hit.shape !== "frame" && hit.shape !== "draw" ? hit.id : null;
        if (id !== this.hoveredId) {
          this.hoveredId = id;
          this.markScene();
        }
        this.hoverWorld = world;
        if (this.hoveredId) this.markScene(); // refresh the live connect anchor
        el.style.cursor = this.hitConnectZone(world) ? "crosshair" : "default";
      }
      last = p;
    });

    const endDrag = (e: PointerEvent) => {
      try {
        el.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      // a move that owns a layout should reflow it
      if (mode === "move") {
        this.clearPreview(); // remove alignment guides
        if (dragged)
          for (const id of this.getSelection()) this.cmd.reflowOwningLayout(id);
      } else if (mode === "create") {
        this.commitShape(downWorld, this.camera.screenToWorld(last.x, last.y), dragged);
      } else if (mode === "draw") {
        const stroke = this.cmd.createStroke(strokePts, this.inkColor, this.inkWidth);
        if (stroke) this.setSelection([]); // stay in pen tool, ready for the next stroke
        strokePts = [];
        this.clearPreview();
      } else if (mode === "link" && linkSource) {
        const src = linkSource;
        const world = this.camera.screenToWorld(last.x, last.y);
        const target = this.hitNode(world);
        // Ignore accidental taps that didn't actually drag anywhere.
        const dist = Math.hypot(world.x - src.x, world.y - src.y);
        // Miro-style quick-connect: dragged out from a node into empty space →
        // spawn a new connected node at the drop point and open it for typing.
        if (linkQuick && src.nodeId !== "" && !target && dist >= 14 / this.camera.zoom) {
          const source = this.doc.getNode(src.nodeId);
          const shape = quickConnectShape(source?.shape);
          const node = this.cmd.createNode({ shape, x: world.x, y: world.y });
          this.cmd.connect(src.nodeId, node.id, "flow");
          this.setSelection([node.id]);
          this.requestEdit(node.id);
          linkSource = null;
          linkQuick = false;
          this.clearPreview();
          mode = "idle";
          return;
        }
        if (dist >= 6 / this.camera.zoom) {
          const ends: {
            sourceAnchor?: { fx: number; fy: number };
            targetAnchor?: { fx: number; fy: number };
            sourcePoint?: { x: number; y: number };
            targetPoint?: { x: number; y: number };
          } = {};
          // Source end: attached to its node, or a free open point.
          if (src.nodeId !== "") ends.sourceAnchor = { fx: src.fx!, fy: src.fy! };
          else ends.sourcePoint = { x: Math.round(src.x), y: Math.round(src.y) };
          // Target end: attach if released on an object, else leave it open-ended.
          if (target && target.id !== src.nodeId) ends.targetAnchor = cleanAnchor(freeAnchor(target, world));
          else ends.targetPoint = { x: Math.round(world.x), y: Math.round(world.y) };
          const edge = this.cmd.connect(src.nodeId, target ? target.id : "", "flow", ends);
          // A freehand endpoint inside an object would hide behind it — lift it.
          if (isInteriorAnchor(ends.sourceAnchor) || isInteriorAnchor(ends.targetAnchor))
            this.cmd.bringToFront([edge.id]);
          this.setEdgeSelection(edge.id); // select it so ends can be nudged or deleted
        }
        // Arrow tool makes one arrow, then returns to select for editing.
        if (this.tool === "connect") this.setTool("select");
        linkSource = null;
        this.clearPreview();
      } else if (mode === "wp" && wpEnd && wpEdge && dragged) {
        // Released an endpoint: attach to the object under it, else leave it open.
        const world = this.camera.screenToWorld(last.x, last.y);
        const node = this.hitNode(world);
        const e = this.doc.getEdge(wpEdge);
        const otherId = wpEnd === "source" ? e?.target : e?.source;
        if (node && node.id !== otherId) {
          const anchor = cleanAnchor(freeAnchor(node, world));
          this.cmd.setEdgeEndpoint(wpEdge, wpEnd, { node: node.id, anchor });
          if (isInteriorAnchor(anchor)) this.cmd.bringToFront([wpEdge]);
        }
      } else if (mode === "marquee") {
        this.clearPreview(); // remove the selection box; selection already applied live
      }
      mode = "idle";
      marqueeStart = null;
      marqueeBase = [];
      resizeHandle = null;
      resizeStart = null;
      wpEdge = null;
      wpEnd = null;
    };
    el.addEventListener("pointerup", endDrag);

    el.addEventListener("dblclick", (e) => {
      const p = localXY(e);
      const world = this.camera.screenToWorld(p.x, p.y);
      // Double-click a waypoint to remove it (endpoints aren't removable).
      const eh = this.hitEdgeHandle(world);
      if (eh && !eh.add && !eh.end && this.edgeSel) {
        const edge = this.doc.getEdge(this.edgeSel);
        const wps = (edge?.waypoints ?? []).filter((_, i) => i !== eh.index);
        this.cmd.setWaypoints(this.edgeSel, wps);
        return;
      }
      const hit = this.hitNode(world);
      if (hit) {
        this.requestEdit(hit.id);
      } else {
        const n = this.cmd.createNode({ shape: "rounded", x: world.x, y: world.y });
        this.setSelection([n.id]);
        this.requestEdit(n.id);
      }
    });

    el.addEventListener("pointerleave", () => {
      this.hoverWorld = null;
      if (this.hoveredId) {
        this.hoveredId = null;
        this.markScene();
      }
    });

    el.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        const p = localXY(e);
        if (e.ctrlKey || e.metaKey) {
          const factor = Math.exp(-e.deltaY * 0.01);
          this.camera.zoomAt(p.x, p.y, factor);
        } else {
          this.camera.panBy(-e.deltaX, -e.deltaY);
        }
        this.markCamera();
      },
      { passive: false },
    );
  }

  /** Commit a drag-to-draw shape. A click (no drag) yields a default-size box. */
  private commitShape(a: Point, b: Point, dragged: boolean) {
    this.clearPreview();
    const shape = toolShape(this.tool);
    const def = shapeDefaults[shape];
    let rect = {
      x: Math.min(a.x, b.x),
      y: Math.min(a.y, b.y),
      w: Math.abs(b.x - a.x),
      h: Math.abs(b.y - a.y),
    };
    if (!dragged || (rect.w < 6 && rect.h < 6)) {
      rect = { x: a.x - def.w / 2, y: a.y - def.h / 2, w: def.w, h: def.h };
    }
    const node = this.cmd.createShape(shape, rect);
    this.setSelection([node.id]);
    this.setTool("select"); // shapes revert to select; the pen tool stays active
    this.requestEdit(node.id);
  }

  private applyResize(start: SceneNode, h: Handle, world: Point) {
    let { x, y, w } = start;
    const right = start.x + start.w;
    const bottom = start.y + start.h;
    let nx = x,
      ny = y,
      nw = w,
      nh = start.h;
    const min = 40;
    if (h.key === "se") {
      nw = Math.max(min, world.x - x);
      nh = Math.max(min, world.y - y);
    } else if (h.key === "ne") {
      nw = Math.max(min, world.x - x);
      ny = Math.min(world.y, bottom - min);
      nh = bottom - ny;
    } else if (h.key === "sw") {
      nx = Math.min(world.x, right - min);
      nw = right - nx;
      nh = Math.max(min, world.y - y);
    } else if (h.key === "nw") {
      nx = Math.min(world.x, right - min);
      ny = Math.min(world.y, bottom - min);
      nw = right - nx;
      nh = bottom - ny;
    }
    this.cmd.updateNode(start.id, {
      x: Math.round(nx),
      y: Math.round(ny),
      w: Math.round(nw),
      h: Math.round(nh),
    });
  }

  // ── viewport helpers ──────────────────────────────────────────────────────
  zoomToFit(padding = 80) {
    const nodes = this.doc.allNodes();
    if (nodes.length === 0) {
      this.camera.x = -this.host.clientWidth / 2;
      this.camera.y = -this.host.clientHeight / 2;
      this.camera.zoom = 1;
      this.markCamera();
      return;
    }
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const n of nodes) {
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + n.w);
      maxY = Math.max(maxY, n.y + n.h);
    }
    const w = maxX - minX + padding * 2;
    const h = maxY - minY + padding * 2;
    const sw = this.host.clientWidth || 1;
    const sh = this.host.clientHeight || 1;
    this.camera.zoom = Math.min(2, Math.min(sw / w, sh / h));
    this.camera.x = minX - padding - (sw / this.camera.zoom - w) / 2;
    this.camera.y = minY - padding - (sh / this.camera.zoom - h) / 2;
    this.markCamera();
  }

  zoomBy(factor: number) {
    this.camera.zoomAt(this.host.clientWidth / 2, this.host.clientHeight / 2, factor);
    this.markCamera();
  }

  /** Zoom to an absolute level (1 = 100%), centered on the viewport. */
  zoomTo(level: number) {
    this.zoomBy(level / this.camera.zoom);
  }

  // ── overview helpers (minimap) ─────────────────────────────────────────────
  contentBounds(): { minX: number; minY: number; maxX: number; maxY: number } | null {
    const nodes = this.doc.allNodes();
    if (nodes.length === 0) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of nodes) {
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + n.w);
      maxY = Math.max(maxY, n.y + n.h);
    }
    return { minX, minY, maxX, maxY };
  }

  viewportWorld(): { x: number; y: number; w: number; h: number } {
    return {
      x: this.camera.x,
      y: this.camera.y,
      w: this.app.screen.width / this.camera.zoom,
      h: this.app.screen.height / this.camera.zoom,
    };
  }

  /** Center the viewport on a world point. */
  panTo(cx: number, cy: number) {
    this.camera.x = cx - this.app.screen.width / this.camera.zoom / 2;
    this.camera.y = cy - this.app.screen.height / this.camera.zoom / 2;
    this.markCamera();
  }

  get pixiRenderer(): Renderer {
    return this.app.renderer;
  }
}

// ── geometry helpers ──────────────────────────────────────────────────────────
function center(n: SceneNode): Point {
  return { x: n.x + n.w / 2, y: n.y + n.h / 2 };
}

/** Point where the segment from n's center toward `toward` crosses n's border. */
/** World point for a free anchor expressed as fractions of the node's box. */
function anchorPoint(n: SceneNode, a: { fx: number; fy: number }): Point {
  return { x: n.x + a.fx * n.w, y: n.y + a.fy * n.h };
}

/** Shape a quick-connect spawns: mirror the source when it's a labelled box,
 *  else fall back to a plain rounded card (frames/images/strokes/text). */
function quickConnectShape(src?: SceneNode["shape"]): NodeShape {
  const mirror: NodeShape[] = ["topic", "rect", "rounded", "ellipse", "diamond", "note", "sticky"];
  return src && mirror.includes(src) ? src : "rounded";
}

/** Shortest distance from a point to the node's rectangular border. */
function distToPerimeter(n: SceneNode, p: Point): number {
  const left = n.x,
    right = n.x + n.w,
    top = n.y,
    bottom = n.y + n.h;
  const inside = p.x >= left && p.x <= right && p.y >= top && p.y <= bottom;
  if (inside) return Math.min(p.x - left, right - p.x, p.y - top, bottom - p.y);
  const cx = Math.max(left, Math.min(right, p.x));
  const cy = Math.max(top, Math.min(bottom, p.y));
  return Math.hypot(p.x - cx, p.y - cy);
}

/** True when an anchor sits well inside an object (not hugging an edge). Such an
 *  arrow is lifted above objects so its freehand endpoint stays visible. */
function isInteriorAnchor(a?: { fx: number; fy: number }): boolean {
  if (!a) return false;
  const m = 0.15;
  return a.fx > m && a.fx < 1 - m && a.fy > m && a.fy < 1 - m;
}

/** Snap a free anchor to a clean point (edge-midpoints, corners, or center) when
 *  it lands near one — so most connectors attach tidily, while an intentional
 *  off-point drop stays exactly where you put it. */
function cleanAnchor(a: { fx: number; fy: number }): { fx: number; fy: number } {
  const snap = (v: number) => {
    for (const t of [0, 0.5, 1]) if (Math.abs(v - t) < 0.16) return t;
    return v;
  };
  return { fx: snap(a.fx), fy: snap(a.fy) };
}

/** The exact point under `p`, clamped to the box, as fractions [0..1] — no border snap.
 *  Lets a connector attach freehand anywhere on an object, including its middle. */
function freeAnchor(n: SceneNode, p: Point): { fx: number; fy: number } {
  return {
    fx: n.w ? Math.max(0, Math.min(1, (p.x - n.x) / n.w)) : 0.5,
    fy: n.h ? Math.max(0, Math.min(1, (p.y - n.y) / n.h)) : 0.5,
  };
}

/** Nearest point on the node's border to `p`, as fractions [0..1] of its box. */
function perimeterAnchor(n: SceneNode, p: Point): { fx: number; fy: number } {
  const left = n.x,
    right = n.x + n.w,
    top = n.y,
    bottom = n.y + n.h;
  const cx = Math.max(left, Math.min(right, p.x));
  const cy = Math.max(top, Math.min(bottom, p.y));
  // Snap the clamped point onto whichever edge it is closest to.
  const dl = cx - left,
    dr = right - cx,
    dt = cy - top,
    db = bottom - cy;
  const m = Math.min(dl, dr, dt, db);
  let px = cx,
    py = cy;
  if (m === dl) px = left;
  else if (m === dr) px = right;
  else if (m === dt) py = top;
  else py = bottom;
  return {
    fx: n.w ? (px - n.x) / n.w : 0.5,
    fy: n.h ? (py - n.y) / n.h : 0.5,
  };
}

// ── SVG export helpers ─────────────────────────────────────────────────────
function hex(n: number): string {
  return "#" + ((n >>> 0) & 0xffffff).toString(16).padStart(6, "0");
}
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
function arrowheadSVG(
  tip: Point,
  from: Point,
  color: string,
  len: number,
  halfW: number,
  style: NonNullable<SceneEdge["arrowHead"]>,
  width: number,
): string {
  const dx = tip.x - from.x;
  const dy = tip.y - from.y;
  const d = Math.hypot(dx, dy) || 1;
  const ux = dx / d;
  const uy = dy / d;
  const px = -uy;
  const py = ux;
  const bx = tip.x - ux * len;
  const by = tip.y - uy * len;
  const ax = bx + px * halfW;
  const ay = by + py * halfW;
  const cx = bx - px * halfW;
  const cy = by - py * halfW;
  if (style === "open")
    return `<polyline points="${ax},${ay} ${tip.x},${tip.y} ${cx},${cy}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`;
  if (style === "diamond") {
    const mx = tip.x - ux * (len / 2);
    const my = tip.y - uy * (len / 2);
    return `<polygon points="${tip.x},${tip.y} ${mx + px * halfW},${my + py * halfW} ${bx},${by} ${mx - px * halfW},${my - py * halfW}" fill="${color}"/>`;
  }
  if (style === "circle")
    return `<circle cx="${tip.x - ux * halfW}" cy="${tip.y - uy * halfW}" r="${halfW}" fill="${color}"/>`;
  return `<polygon points="${tip.x},${tip.y} ${ax},${ay} ${cx},${cy}" fill="${color}"/>`;
}

function borderPoint(n: SceneNode, toward: Point): Point {
  const c = center(n);
  const dx = toward.x - c.x;
  const dy = toward.y - c.y;
  if (dx === 0 && dy === 0) return c;
  const hw = n.w / 2;
  const hh = n.h / 2;
  const scale = 1 / Math.max(Math.abs(dx) / hw, Math.abs(dy) / hh);
  return { x: c.x + dx * scale, y: c.y + dy * scale };
}

/** Catmull-Rom → cubic-bezier segments for a smooth curve through all points. */
function catmullRom(pts: Point[]): { c1: Point; c2: Point; p: Point }[] {
  const segs: { c1: Point; c2: Point; p: Point }[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? pts[i + 1];
    segs.push({
      c1: { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 },
      c2: { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 },
      p: p2,
    });
  }
  return segs;
}

function bezierPoint(p0: Point, c1: Point, c2: Point, p1: Point, t: number): Point {
  const u = 1 - t;
  const a = u * u * u,
    b = 3 * u * u * t,
    c = 3 * u * t * t,
    d = t * t * t;
  return {
    x: a * p0.x + b * c1.x + c * c2.x + d * p1.x,
    y: a * p0.y + b * c1.y + c * c2.y + d * p1.y,
  };
}

/** Shorten a polyline by `len` from one end (so an arrowhead can sit there). */
function retract(poly: Point[], fromEnd: boolean, len: number) {
  let rem = len;
  while (poly.length >= 2 && rem > 0) {
    const a = fromEnd ? poly[poly.length - 1] : poly[0];
    const b = fromEnd ? poly[poly.length - 2] : poly[1];
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    const d = Math.hypot(dx, dy) || 1;
    if (d >= rem) {
      const np = { x: a.x - (dx / d) * rem, y: a.y - (dy / d) * rem };
      if (fromEnd) poly[poly.length - 1] = np;
      else poly[0] = np;
      rem = 0;
    } else {
      rem -= d;
      if (fromEnd) poly.pop();
      else poly.shift();
    }
  }
}

/** Distance from point p to segment ab. */
function distToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = a.x + t * dx;
  const cy = a.y + t * dy;
  return Math.hypot(p.x - cx, p.y - cy);
}

function handlesFor(n: SceneNode): Handle[] {
  return [
    { key: "nw", x: n.x, y: n.y },
    { key: "ne", x: n.x + n.w, y: n.y },
    { key: "sw", x: n.x, y: n.y + n.h },
    { key: "se", x: n.x + n.w, y: n.y + n.h },
  ];
}
