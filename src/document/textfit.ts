// Size a node's box to fit its text, so labels never spill outside the shape.
// Measures with a real 2D canvas context (matching the renderer's font + pad=10
// wrap width), then clamps to sensible min/max. Used when a node is created with
// text and whenever its text is edited.

import { fontStack, resolveStyle } from "./theme";
import type { NodeShape, NodeStyle } from "./types";

const PAD = 10; // must match the renderer's text padding (see drawNode)
const LINE = 1.3; // line height as a multiple of font size
const V_PAD = 10; // extra top/bottom breathing room
const MIN_W = 90;
const MAX_W = 300;
const MIN_H = 40;

// Shapes whose label lives inside a box we can grow. Others (sticky/frame/
// image/draw) keep their own sizing.
const FIT_SHAPES: NodeShape[] = ["rect", "rounded", "topic", "ellipse", "diamond", "note", "text"];
export const fitsToText = (shape: NodeShape) => FIT_SHAPES.includes(shape);

// A shape's text only occupies part of its bounding box; pad the box so the
// text clears the curved/pointed edges.
const SHAPE_SCALE: Partial<Record<NodeShape, { w: number; h: number }>> = {
  ellipse: { w: 1.3, h: 1.5 },
  diamond: { w: 1.5, h: 1.7 },
};

let ctx: CanvasRenderingContext2D | null = null;
function measurer(): CanvasRenderingContext2D | null {
  if (!ctx && typeof document !== "undefined") {
    ctx = document.createElement("canvas").getContext("2d");
  }
  return ctx;
}

/** Greedily wrap one paragraph to `maxW` px; returns the lines' widths. */
function wrap(c: CanvasRenderingContext2D, line: string, maxW: number): number[] {
  const words = line.split(/\s+/).filter(Boolean);
  if (!words.length) return [0];
  const widths: number[] = [];
  let cur = words[0];
  for (let i = 1; i < words.length; i++) {
    const next = cur + " " + words[i];
    if (c.measureText(next).width <= maxW) cur = next;
    else {
      widths.push(c.measureText(cur).width);
      cur = words[i];
    }
  }
  widths.push(c.measureText(cur).width);
  return widths;
}

/** Compute the box size that fits `text` for a node of `shape` with `style`. */
export function fitBox(
  shape: NodeShape,
  style: Partial<NodeStyle>,
  text: string,
): { w: number; h: number } | null {
  if (!fitsToText(shape)) return null;
  const c = measurer();
  const s = resolveStyle(shape, style);
  const minW = shape === "topic" ? 70 : MIN_W;

  if (!c) return { w: shape === "topic" ? 150 : 150, h: MIN_H }; // no DOM (SSR); safe default
  c.font = `${s.italic ? "italic " : ""}${s.bold ? 700 : 500} ${s.fontSize}px ${fontStack(s.fontFamily)}`;

  const paragraphs = (text || "").split("\n");
  const naturalMax = Math.max(0, ...paragraphs.map((p) => c.measureText(p || " ").width));
  const contentMax = MAX_W - PAD * 2;

  let lineWidths: number[];
  let contentW: number;
  if (naturalMax <= contentMax) {
    // Everything fits on its own line — box only as wide as the widest line.
    lineWidths = paragraphs.map((p) => c.measureText(p || "").width);
    contentW = Math.max(...lineWidths, 1);
  } else {
    // Too wide — wrap to the max content width and stack the resulting lines.
    lineWidths = paragraphs.flatMap((p) => wrap(c, p, contentMax));
    contentW = contentMax;
  }

  let w = Math.round(Math.min(MAX_W, Math.max(minW, contentW + PAD * 2)));
  let h = Math.round(Math.max(MIN_H, lineWidths.length * s.fontSize * LINE + V_PAD * 2));

  const scale = SHAPE_SCALE[shape];
  if (scale) {
    w = Math.round(w * scale.w);
    h = Math.round(h * scale.h);
  }
  return { w, h };
}
