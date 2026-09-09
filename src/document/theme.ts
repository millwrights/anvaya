import type { NodeShape, NodeStyle } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Theming. Each preset defines canvas colors (Pixi), node defaults, and the UI
// chrome CSS variables. `theme`, `defaultNodeStyle`, and `shapeDefaults` are
// live bindings reassigned by applyTheme() — the engine and resolveStyle read
// them at render time, so switching themes re-colors everything on disk-default
// nodes while explicit per-node color overrides are preserved.
// ─────────────────────────────────────────────────────────────────────────────

export type ThemeKey = "dark" | "midnight" | "light";

interface CanvasColors {
  canvasBg: number;
  grid: number;
  gridStrong: number;
  selection: number;
  edge: number;
  edgeFlow: number;
  text: string;
  accent: number;
}

interface ShapePalette {
  node: NodeStyle;
  topicFill: string;
  topicStroke: string;
  ellipseFill: string;
  ellipseStroke: string;
  diamondFill: string;
  diamondStroke: string;
  noteFill: string;
  noteStroke: string;
  stickyFill: string;
  stickyStroke: string;
  stickyText: string;
  frameFill: string;
  frameStroke: string;
  frameText: string;
  imageStroke: string;
  drawStroke: string;
}

type Shapes = Record<NodeShape, { w: number; h: number; style: Partial<NodeStyle> }>;

function makeShapes(p: ShapePalette): Shapes {
  // Shapes are borderless by default (fill + soft shadow reads as a clean card);
  // the user can add a border from the inspector. Frame keeps its outline since
  // it's a section boundary; draw uses stroke as the ink; image keeps a hairline.
  return {
    topic: { w: 150, h: 44, style: { fill: p.topicFill } },
    rect: { w: 150, h: 64, style: {} },
    rounded: { w: 150, h: 64, style: {} },
    ellipse: { w: 140, h: 80, style: { fill: p.ellipseFill } },
    diamond: { w: 150, h: 90, style: { fill: p.diamondFill } },
    note: { w: 180, h: 100, style: { fill: p.noteFill } },
    sticky: { w: 168, h: 168, style: { fill: p.stickyFill, textColor: p.stickyText, fontSize: 17 } },
    frame: { w: 420, h: 300, style: { fill: p.frameFill, stroke: p.frameStroke, textColor: p.frameText, strokeWidth: 1 } },
    image: { w: 220, h: 160, style: { fill: "#00000000", stroke: p.imageStroke, strokeWidth: 1 } },
    text: { w: 160, h: 40, style: { fill: "#00000000", stroke: "#00000000" } },
    draw: { w: 100, h: 100, style: { fill: "#00000000", stroke: p.drawStroke, strokeWidth: 2.5 } },
  };
}

interface Preset {
  key: ThemeKey;
  name: string;
  canvas: CanvasColors;
  palette: ShapePalette;
  css: Record<string, string>;
}

// ── Solid Dark (default) — true near-black, high contrast ─────────────────────
const DARK: Preset = {
  key: "dark",
  name: "Dark",
  canvas: {
    canvasBg: 0x0b0b0f,
    grid: 0x33343d,
    gridStrong: 0x3a3b45,
    selection: 0x5b8cff,
    edge: 0x8a90a0,
    edgeFlow: 0xaab0c0,
    text: "#f4f5f7",
    accent: 0x5b8cff,
  },
  palette: {
    node: { fill: "#191b21", stroke: "#2d303a", textColor: "#f4f5f7", fontSize: 14.5, strokeWidth: 0 },
    topicFill: "#2b6cff", topicStroke: "#1e50c8",
    ellipseFill: "#16a34a", ellipseStroke: "#0f7d38",
    diamondFill: "#f5920b", diamondStroke: "#c9740a",
    noteFill: "#f5c400", noteStroke: "#cfa300",
    stickyFill: "#ffd60a", stickyStroke: "#d9b400", stickyText: "#1a1a1a",
    frameFill: "#101015", frameStroke: "#2a2a33", frameText: "#8a90a0",
    imageStroke: "#2d303a", drawStroke: "#f4f5f7",
  },
  css: {
    "--bg": "#0a0a0c",
    "--panel": "#141418",
    "--panel-2": "#1e1e24",
    "--border": "#2b2b33",
    "--text": "#f3f4f6",
    "--text-dim": "#9297a2",
    "--accent": "#4c8dff",
    "--accent-soft": "#4c8dff2b",
    "--shadow": "0 10px 34px rgba(0, 0, 0, 0.6)",
  },
};

// ── Midnight — the original deep blue-gray ────────────────────────────────────
const MIDNIGHT: Preset = {
  key: "midnight",
  name: "Midnight",
  canvas: {
    canvasBg: 0x0f1115,
    grid: 0x1b1f27,
    gridStrong: 0x232833,
    selection: 0x4c8dff,
    edge: 0x8b95a7,
    edgeFlow: 0xa2acbe,
    text: "#e8eaed",
    accent: 0x4c8dff,
  },
  palette: {
    node: { fill: "#1c2230", stroke: "#33405c", textColor: "#e8eaed", fontSize: 15, strokeWidth: 0 },
    topicFill: "#2b6cff", topicStroke: "#1e50c8",
    ellipseFill: "#16a34a", ellipseStroke: "#0f7d38",
    diamondFill: "#f5920b", diamondStroke: "#c9740a",
    noteFill: "#f5c400", noteStroke: "#cfa300",
    stickyFill: "#ffd60a", stickyStroke: "#d9b400", stickyText: "#20242c",
    frameFill: "#141a24", frameStroke: "#2c3648", frameText: "#8b93a3",
    imageStroke: "#33405c", drawStroke: "#e8eaed",
  },
  css: {
    "--bg": "#0f1115",
    "--panel": "#161a22",
    "--panel-2": "#1c2130",
    "--border": "#262c3a",
    "--text": "#e8eaed",
    "--text-dim": "#8b93a3",
    "--accent": "#4c8dff",
    "--accent-soft": "#4c8dff22",
    "--shadow": "0 8px 30px rgba(0, 0, 0, 0.45)",
  },
};

// ── Light — solid, crisp ──────────────────────────────────────────────────────
const LIGHT: Preset = {
  key: "light",
  name: "Light",
  canvas: {
    canvasBg: 0xf6f7f9,
    grid: 0xccd0d8,
    gridStrong: 0xbcc1cb,
    selection: 0x2f6fed,
    edge: 0x7c8493,
    edgeFlow: 0x5b6472,
    text: "#1a1d23",
    accent: 0x2f6fed,
  },
  palette: {
    node: { fill: "#ffffff", stroke: "#dfe3e9", textColor: "#1a1d23", fontSize: 14.5, strokeWidth: 0 },
    topicFill: "#2b6cff", topicStroke: "#1e50c8",
    ellipseFill: "#16a34a", ellipseStroke: "#0f7d38",
    diamondFill: "#f5920b", diamondStroke: "#c9740a",
    noteFill: "#f5c400", noteStroke: "#cfa300",
    stickyFill: "#ffd60a", stickyStroke: "#e6c000", stickyText: "#20242c",
    frameFill: "#eef1f5", frameStroke: "#dbe0e7", frameText: "#7c8493",
    imageStroke: "#dfe3e9", drawStroke: "#1a1d23",
  },
  css: {
    "--bg": "#f5f6f8",
    "--panel": "#ffffff",
    "--panel-2": "#eef0f3",
    "--border": "#d8dce2",
    "--text": "#1a1d23",
    "--text-dim": "#6b7280",
    "--accent": "#2f6fed",
    "--accent-soft": "#2f6fed1f",
    "--shadow": "0 8px 30px rgba(20, 30, 60, 0.14)",
  },
};

export const PRESETS: Record<ThemeKey, Preset> = {
  dark: DARK,
  midnight: MIDNIGHT,
  light: LIGHT,
};
export const THEME_LIST = [DARK, MIDNIGHT, LIGHT].map((p) => ({ key: p.key, name: p.name }));

// ── live active state (reassigned by applyTheme) ──────────────────────────────
export let theme: CanvasColors = DARK.canvas;
export let defaultNodeStyle: NodeStyle = DARK.palette.node;
export let shapeDefaults: Shapes = makeShapes(DARK.palette);

let activeKey: ThemeKey = "dark";
const listeners = new Set<() => void>();
export function onThemeChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
export function currentTheme(): ThemeKey {
  return activeKey;
}

export function applyTheme(key: ThemeKey) {
  const p = PRESETS[key] ?? DARK;
  activeKey = p.key;
  theme = p.canvas;
  defaultNodeStyle = p.palette.node;
  shapeDefaults = makeShapes(p.palette);
  if (typeof document !== "undefined") {
    const root = document.documentElement;
    for (const [k, v] of Object.entries(p.css)) root.style.setProperty(k, v);
    root.dataset.theme = p.key;
    try {
      localStorage.setItem("anvaya:theme", p.key);
    } catch {
      /* ignore */
    }
  }
  listeners.forEach((l) => l());
}

/** Apply the saved (or default) theme — call once at startup. */
export function initTheme() {
  let key: ThemeKey = "dark";
  try {
    const saved = localStorage.getItem("anvaya:theme") as ThemeKey | null;
    if (saved && PRESETS[saved]) key = saved;
  } catch {
    /* ignore */
  }
  applyTheme(key);
}

export function resolveStyle(shape: NodeShape, override: Partial<NodeStyle>): NodeStyle {
  return { ...defaultNodeStyle, ...shapeDefaults[shape].style, ...override };
}

// ── color contrast ────────────────────────────────────────────────────────────
// So vivid fills stay legible: pick black-or-white text when the requested text
// color would be unreadable on the fill (and leave good-contrast picks alone).
function alphaOf(hex: string): number {
  const h = hex.replace("#", "");
  return h.length >= 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
}
/** WCAG relative luminance of an #rgb/#rrggbb(aa) color (alpha ignored). */
function luminance(hex: string): number {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (h.length < 6) return 1;
  const chan = (i: number) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * chan(0) + 0.7152 * chan(2) + 0.0722 * chan(4);
}
function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
/**
 * The text color to actually paint over `fill`. Keeps `preferred` when it reads
 * well (or when the fill is transparent — text then sits on the canvas), and
 * otherwise flips to near-black/near-white so vivid fills stay readable.
 */
export function readableText(preferred: string, fill?: string): string {
  if (!fill || alphaOf(fill) < 0.15) return preferred;
  if (contrast(preferred, fill) >= 3.2) return preferred;
  // Flip to whichever of near-black / near-white reads best on this fill.
  return contrast("#15171c", fill) >= contrast("#f6f7f9", fill) ? "#15171c" : "#f6f7f9";
}

// ── fonts ────────────────────────────────────────────────────────────────────
// NodeStyle.fontFamily stores a KEY here; the engine/editor resolve it to a CSS
// font stack so text stays consistent whether baked (Pixi) or edited (DOM).
export const FONT_FAMILIES: { key: string; label: string; stack: string }[] = [
  {
    key: "sans",
    label: "Sans",
    stack: "-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, sans-serif",
  },
  {
    key: "grotesk",
    label: "Grotesk",
    stack: "'Helvetica Neue', Helvetica, Arial, sans-serif",
  },
  {
    key: "calibri",
    label: "Calibri",
    stack: "Calibri, 'Segoe UI', Candara, 'Helvetica Neue', Arial, sans-serif",
  },
  {
    key: "display",
    label: "Display",
    stack: "Futura, 'Century Gothic', 'Trebuchet MS', sans-serif",
  },
  {
    key: "rounded",
    label: "Rounded",
    stack: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', 'Varela Round', ui-rounded, sans-serif",
  },
  { key: "serif", label: "Serif", stack: "Georgia, 'Times New Roman', Times, serif" },
  {
    key: "elegant",
    label: "Elegant",
    stack: "Palatino, 'Palatino Linotype', 'Book Antiqua', Georgia, serif",
  },
  {
    key: "classic",
    label: "Classic",
    stack: "Baskerville, 'Baskerville Old Face', 'Hoefler Text', Garamond, Georgia, serif",
  },
  {
    key: "slab",
    label: "Slab",
    stack: "Rockwell, 'Rockwell Nova', 'Roboto Slab', 'Courier New', serif",
  },
  {
    key: "typewriter",
    label: "Typewriter",
    stack: "'American Typewriter', 'Courier New', Courier, monospace",
  },
  {
    key: "consolas",
    label: "Consolas",
    stack: "Consolas, 'SF Mono', Menlo, 'Cascadia Code', 'Courier New', monospace",
  },
  {
    key: "mono",
    label: "Mono",
    stack: "'SF Mono', ui-monospace, Menlo, 'Cascadia Code', 'Courier New', monospace",
  },
  {
    key: "marker",
    label: "Marker",
    stack: "'Marker Felt', 'Comic Sans MS', 'Segoe Print', cursive",
  },
  {
    key: "script",
    label: "Script",
    stack: "'Snell Roundhand', 'Segoe Script', 'Brush Script MT', cursive",
  },
];

export function fontStack(key?: string): string {
  return FONT_FAMILIES.find((f) => f.key === key)?.stack ?? FONT_FAMILIES[0].stack;
}
