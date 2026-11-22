// Diagram modes. A mode is a *preset* over two orthogonal axes — how content is
// laid out, and how it's painted — applied over the one unified scene graph.
// Switching modes re-skins the same nodes/edges; it never rebuilds them.
//
//   layout:      "free"     — you place everything (whiteboard / flowchart)
//                "mindmap"  — auto tree from a root (Tab/Enter to branch)
//   renderStyle: "clean"    — the crisp default
//                "sketch"   — hand-drawn: wobbly outlines + marker lettering
//                "infographic" — bold: icon cards + accent-barred blocks

export type DiagramLayout = "free" | "mindmap";
export type RenderStyle = "clean" | "sketch" | "infographic";
export type DiagramMode = "canvas" | "mindmap" | "infographic" | "sketch";

export interface ModePreset {
  key: DiagramMode;
  name: string;
  /** Toolbar glyph. */
  glyph: string;
  layout: DiagramLayout;
  renderStyle: RenderStyle;
  blurb: string;
}

export const MODE_PRESETS: Record<DiagramMode, ModePreset> = {
  canvas: {
    key: "canvas",
    name: "Canvas",
    glyph: "▦",
    layout: "free",
    renderStyle: "clean",
    blurb: "Free-form whiteboard — place everything yourself.",
  },
  mindmap: {
    key: "mindmap",
    name: "MindMap",
    glyph: "⌘",
    layout: "mindmap",
    renderStyle: "clean",
    blurb: "Auto-arranged tree from a central topic.",
  },
  infographic: {
    key: "infographic",
    name: "Infographics",
    glyph: "◫",
    layout: "free",
    renderStyle: "infographic",
    blurb: "Bold presentation — icon cards and accent blocks.",
  },
  sketch: {
    key: "sketch",
    name: "SketchNotes",
    glyph: "✐",
    layout: "free",
    renderStyle: "sketch",
    blurb: "Hand-drawn look — wobbly strokes and marker lettering.",
  },
};

export const MODE_LIST: DiagramMode[] = ["canvas", "mindmap", "infographic", "sketch"];

export const DEFAULT_MODE: DiagramMode = "canvas";

export function modePreset(mode: string | undefined | null): ModePreset {
  return MODE_PRESETS[(mode as DiagramMode) ?? DEFAULT_MODE] ?? MODE_PRESETS.canvas;
}

/** The painting style for a mode (what the engine branches on each render). */
export function renderStyleOf(mode: string | undefined | null): RenderStyle {
  return modePreset(mode).renderStyle;
}
