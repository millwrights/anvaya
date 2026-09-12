// Interop with Excalidraw's .excalidraw JSON. Import maps the core element types
// (rectangle/ellipse/diamond/text/arrow/line/freedraw/frame) onto native Anvaya
// shapes and connectors; export does the reverse. Images and exotic properties
// are skipped — this is diagram interchange, not a pixel-perfect round trip.

import type { CanvasEngine } from "@/canvas/CanvasEngine";
import { commands, doc } from "@/app/session";
import type { NodeShape, SceneNode } from "@/document/types";

interface ExElement {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  strokeColor?: string;
  backgroundColor?: string;
  strokeWidth?: number;
  text?: string;
  name?: string;
  containerId?: string | null;
  points?: [number, number][];
  startBinding?: { elementId: string } | null;
  endBinding?: { elementId: string } | null;
  roundness?: unknown;
  isDeleted?: boolean;
}

const rand = () => Math.floor(Math.random() * 2 ** 31);

// ── import ──────────────────────────────────────────────────────────────────
export function importExcalidraw(engine: CanvasEngine, source: string | object) {
  const data = (typeof source === "string" ? JSON.parse(source) : source) as { elements?: ExElement[] };
  const els = (data.elements ?? []).filter((e) => !e.isDeleted);
  if (!els.length) throw new Error("No elements found in that .excalidraw file.");

  // Center the imported group on the current viewport.
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const e of els) {
    if (!isFinite(e.x) || !e.width) continue;
    minX = Math.min(minX, e.x);
    minY = Math.min(minY, e.y);
    maxX = Math.max(maxX, e.x + e.width);
    maxY = Math.max(maxY, e.y + e.height);
  }
  const v = engine.viewportWorld();
  const off =
    minX === Infinity
      ? { x: 0, y: 0 }
      : { x: v.x + v.w / 2 - (minX + maxX) / 2, y: v.y + v.h / 2 - (minY + maxY) / 2 };

  // Text bound to a container (shape or arrow) supplies that element's label.
  const labelFor = new Map<string, string>();
  for (const e of els) if (e.type === "text" && e.containerId) labelFor.set(e.containerId, e.text ?? "");

  const idMap = new Map<string, string>();
  const created: string[] = [];

  doc.transact(() => {
    for (const e of els) {
      if (e.type === "rectangle" || e.type === "ellipse" || e.type === "diamond" || e.type === "frame") {
        const shape: NodeShape =
          e.type === "ellipse" ? "ellipse"
          : e.type === "diamond" ? "diamond"
          : e.type === "frame" ? "frame"
          : e.roundness ? "rounded"
          : "rect";
        const n = commands.createShape(shape, { x: e.x + off.x, y: e.y + off.y, w: e.width, h: e.height });
        const style: Partial<SceneNode["style"]> = {};
        if (e.backgroundColor && e.backgroundColor !== "transparent") style.fill = e.backgroundColor;
        if (e.strokeColor && shape !== "frame") {
          style.stroke = e.strokeColor;
          style.strokeWidth = e.strokeWidth || 2;
        }
        commands.updateNode(n.id, { text: e.name ?? labelFor.get(e.id) ?? "", style });
        idMap.set(e.id, n.id);
        created.push(n.id);
      } else if (e.type === "text" && !e.containerId) {
        const n = commands.createShape("text", { x: e.x + off.x, y: e.y + off.y, w: e.width, h: e.height });
        commands.updateNode(n.id, { text: e.text ?? "", style: { textColor: e.strokeColor || "#f4f5f7" } });
        idMap.set(e.id, n.id);
        created.push(n.id);
      } else if (e.type === "freedraw" || e.type === "line") {
        const pts: number[] = [];
        for (const [px, py] of e.points ?? []) pts.push(e.x + off.x + px, e.y + off.y + py);
        const s = commands.createStroke(pts, e.strokeColor || "#f4f5f7", e.strokeWidth || 2);
        if (s) {
          idMap.set(e.id, s.id);
          created.push(s.id);
        }
      }
    }
    // Arrows become connectors once their endpoints exist.
    for (const e of els) {
      if (e.type !== "arrow") continue;
      const sid = e.startBinding?.elementId ? idMap.get(e.startBinding.elementId) : undefined;
      const tid = e.endBinding?.elementId ? idMap.get(e.endBinding.elementId) : undefined;
      const label = labelFor.get(e.id) ?? "";
      if (sid && tid) {
        const edge = commands.connect(sid, tid, "flow");
        if (label) commands.updateEdge(edge.id, { label });
      } else {
        const p = e.points ?? [];
        if (p.length >= 2) {
          const a = { x: Math.round(e.x + off.x + p[0][0]), y: Math.round(e.y + off.y + p[0][1]) };
          const b = { x: Math.round(e.x + off.x + p[p.length - 1][0]), y: Math.round(e.y + off.y + p[p.length - 1][1]) };
          commands.connect("", "", "flow", { sourcePoint: a, targetPoint: b });
        }
      }
    }
  });

  engine.setSelection(created);
  engine.zoomToFit();
  return { nodes: created.length };
}

// ── export ──────────────────────────────────────────────────────────────────
function base(el: Record<string, unknown> & { type: string; id: string }) {
  return {
    angle: 0,
    strokeColor: "#1e1e1e",
    backgroundColor: "transparent",
    fillStyle: "solid",
    strokeWidth: 2,
    strokeStyle: "solid",
    roughness: 1,
    opacity: 100,
    groupIds: [] as string[],
    frameId: null,
    roundness: null as unknown,
    seed: rand(),
    version: 1,
    versionNonce: rand(),
    isDeleted: false,
    boundElements: [] as { id: string; type: string }[],
    updated: 1,
    link: null,
    locked: false,
    ...el,
  };
}

const EX_TYPE: Partial<Record<NodeShape, string>> = {
  rect: "rectangle",
  rounded: "rectangle",
  topic: "rectangle",
  note: "rectangle",
  sticky: "rectangle",
  ellipse: "ellipse",
  diamond: "diamond",
  frame: "frame",
};

export function exportExcalidraw(): string {
  const nodes = doc.allNodes();
  const edges = doc.allEdges();
  const elements: Record<string, unknown>[] = [];
  const byId = new Map(nodes.map((n) => [n.id, n]));

  for (const n of nodes) {
    if (n.shape === "image") continue; // skip embedded images
    if (n.shape === "draw") {
      const pts: [number, number][] = [];
      for (let i = 0; i < (n.points?.length ?? 0); i += 2) pts.push([n.points![i], n.points![i + 1]]);
      elements.push(
        base({
          id: n.id,
          type: "freedraw",
          x: n.x,
          y: n.y,
          width: n.w,
          height: n.h,
          strokeColor: n.style.stroke || "#1e1e1e",
          strokeWidth: n.style.strokeWidth || 2,
          points: pts,
        }) as unknown as Record<string, unknown>,
      );
      continue;
    }
    const type = EX_TYPE[n.shape] ?? "rectangle";
    const boundText = n.text?.trim() ? [{ id: `${n.id}_t`, type: "text" }] : [];
    elements.push(
      base({
        id: n.id,
        type,
        x: n.x,
        y: n.y,
        width: n.w,
        height: n.h,
        strokeColor: n.style.stroke && n.style.strokeWidth ? n.style.stroke : "#1e1e1e",
        backgroundColor: n.style.fill && !n.style.fill.endsWith("00") ? n.style.fill : "transparent",
        roundness: n.shape === "rounded" || n.shape === "topic" ? { type: 3 } : null,
        boundElements: boundText,
      }) as unknown as Record<string, unknown>,
    );
    if (n.text?.trim()) {
      elements.push(
        base({
          id: `${n.id}_t`,
          type: "text",
          x: n.x + 8,
          y: n.y + n.h / 2 - 10,
          width: Math.max(10, n.w - 16),
          height: 20,
          strokeColor: n.style.textColor || "#1e1e1e",
          text: n.text,
          fontSize: n.style.fontSize || 16,
          fontFamily: 1,
          textAlign: n.style.align || "center",
          verticalAlign: "middle",
          containerId: n.id,
          originalText: n.text,
          lineHeight: 1.25,
        }) as unknown as Record<string, unknown>,
      );
    }
  }

  for (const e of edges) {
    const s = e.source ? byId.get(e.source) : undefined;
    const t = e.target ? byId.get(e.target) : undefined;
    const from = s ? { x: s.x + s.w / 2, y: s.y + s.h / 2 } : e.sourcePoint ?? { x: 0, y: 0 };
    const to = t ? { x: t.x + t.w / 2, y: t.y + t.h / 2 } : e.targetPoint ?? { x: 100, y: 0 };
    elements.push(
      base({
        id: e.id,
        type: "arrow",
        x: from.x,
        y: from.y,
        width: to.x - from.x,
        height: to.y - from.y,
        points: [[0, 0], [to.x - from.x, to.y - from.y]] as [number, number][],
        startBinding: s ? { elementId: s.id, focus: 0, gap: 4 } : null,
        endBinding: t ? { elementId: t.id, focus: 0, gap: 4 } : null,
        startArrowhead: e.arrowStart ? "arrow" : null,
        endArrowhead: e.arrowEnd === false ? null : "arrow",
      }) as unknown as Record<string, unknown>,
    );
  }

  return JSON.stringify(
    { type: "excalidraw", version: 2, source: "anvaya", elements, appState: { viewBackgroundColor: "#ffffff" }, files: {} },
    null,
    2,
  );
}
