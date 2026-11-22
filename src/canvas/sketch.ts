// Shared geometry for the hand-drawn ("sketch") render style. These are pure
// helpers with no Pixi/DOM dependency so the live canvas and the SVG exporter
// produce the *same* wobble.
//
// Every wobble is driven by a seed derived from the node/edge identity, so the
// drawing is stable across re-renders (pan, zoom, selection) — it must not
// shimmer every frame the way Math.random() would.

import type { NodeShape } from "@/document/types";

export interface Pt {
  x: number;
  y: number;
}

/** Deterministic FNV-1a hash of a string → uint32 seed. */
export function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32 PRNG — small, fast, seedable. Returns a function in [0, 1). */
export function seededRand(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Perceptual brightness of a 0xRRGGBB int, 0..1. */
export function brightness(c: number): number {
  const r = (c >> 16) & 255;
  const g = (c >> 8) & 255;
  const b = c & 255;
  return (r * 299 + g * 587 + b * 114) / 1000 / 255;
}

/** A paper-ink color that reads on the given canvas background. */
export function inkColor(canvasBg: number): string {
  return brightness(canvasBg) < 0.4 ? "#ece7d8" : "#26231d";
}

/**
 * A wobbly closed outline for a box, as a point list. Rectangular shapes become
 * a jittered quad (sampled a few points per side); diamonds a jittered diamond;
 * ellipses a jittered oval. The seed keeps the hand stable between frames.
 */
export function sketchOutline(
  shape: NodeShape,
  x: number,
  y: number,
  w: number,
  h: number,
  seed: number,
  amp = 2.4,
): Pt[] {
  const rnd = seededRand(seed);
  const j = () => (rnd() * 2 - 1) * amp;

  if (shape === "ellipse") {
    const cx = x + w / 2;
    const cy = y + h / 2;
    const rx = w / 2;
    const ry = h / 2;
    const n = 28;
    const pts: Pt[] = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      pts.push({ x: cx + Math.cos(a) * rx + j(), y: cy + Math.sin(a) * ry + j() });
    }
    return pts;
  }

  const corners: Pt[] =
    shape === "diamond"
      ? [
          { x: x + w / 2, y },
          { x: x + w, y: y + h / 2 },
          { x: x + w / 2, y: y + h },
          { x, y: y + h / 2 },
        ]
      : [
          { x, y },
          { x: x + w, y },
          { x: x + w, y: y + h },
          { x, y: y + h },
        ];

  const per = 3; // samples per side
  const pts: Pt[] = [];
  for (let c = 0; c < corners.length; c++) {
    const a = corners[c];
    const b = corners[(c + 1) % corners.length];
    for (let i = 0; i < per; i++) {
      const t = i / per;
      pts.push({ x: a.x + (b.x - a.x) * t + j(), y: a.y + (b.y - a.y) * t + j() });
    }
  }
  return pts;
}

/**
 * Jitter an interior of a connector polyline for a hand-drawn line. Endpoints
 * are left exactly in place so arrowheads still attach to the box border.
 */
export function jitterLine(poly: Pt[], seed: number, amp = 1.4): Pt[] {
  if (poly.length < 3) return poly.map((p) => ({ ...p }));
  const rnd = seededRand(seed);
  return poly.map((p, i) => {
    if (i === 0 || i === poly.length - 1) return { ...p };
    return { x: p.x + (rnd() * 2 - 1) * amp, y: p.y + (rnd() * 2 - 1) * amp };
  });
}

/** SVG `points="x,y x,y …"` string from a point list. */
export function ptsAttr(pts: Pt[]): string {
  return pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
}
