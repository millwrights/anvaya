import type { CanvasEngine } from "@/canvas/CanvasEngine";
import { commands } from "./session";

// Ready-made boards. Each template drops a cluster of nodes at the current
// viewport center and selects them. This is also how "kanban / tables" ship —
// as structured starting points rather than bespoke node types.

export interface Template {
  id: string;
  name: string;
  apply: (e: CanvasEngine) => void;
}

function origin(e: CanvasEngine, w: number, h: number) {
  const vp = e.viewportWorld();
  return { x: Math.round(vp.x + vp.w / 2 - w / 2), y: Math.round(vp.y + vp.h / 2 - h / 2) };
}

function columns(e: CanvasEngine, title: string, cols: string[]) {
  const colW = 200;
  const totalW = cols.length * colW + 40;
  const o = origin(e, totalW, 420);
  const frame = commands.createShape("frame", { x: o.x, y: o.y, w: totalW, h: 420 });
  commands.updateNode(frame.id, { text: title });
  const created = [frame.id];
  cols.forEach((c, i) => {
    const hx = o.x + 20 + i * colW;
    const head = commands.createShape("text", { x: hx, y: o.y + 36, w: colW - 20, h: 28 });
    commands.updateNode(head.id, { text: c, style: { fontSize: 15 } });
    const card = commands.createShape("sticky", { x: hx, y: o.y + 76, w: colW - 24, h: 110 });
    created.push(head.id, card.id);
  });
  e.setSelection([frame.id]);
}

export const TEMPLATES: Template[] = [
  {
    id: "kanban",
    name: "Kanban board",
    apply: (e) => columns(e, "Kanban", ["To do", "Doing", "Done"]),
  },
  {
    id: "retro",
    name: "Retrospective",
    apply: (e) => columns(e, "Retrospective", ["What went well", "To improve", "Action items"]),
  },
  {
    id: "swot",
    name: "SWOT analysis",
    apply: (e) => columns(e, "SWOT", ["Strengths", "Weaknesses", "Opportunities", "Threats"]),
  },
  {
    id: "mindmap",
    name: "Mind map",
    apply: (e) => {
      const vp = e.viewportWorld();
      const root = commands.createNode({
        shape: "topic",
        x: vp.x + vp.w / 2 - 260,
        y: vp.y + vp.h / 2,
        text: "Central idea",
      });
      commands.makeMindmapRoot(root.id);
      ["Branch 1", "Branch 2", "Branch 3"].forEach((t) => {
        const c = commands.addChildTopic(root.id);
        if (c) commands.setText(c.id, t);
      });
      e.setSelection([root.id]);
    },
  },
];
