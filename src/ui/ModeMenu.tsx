import { useEffect, useState } from "react";
import { useApp } from "@/app/store";
import { MODE_LIST, MODE_PRESETS, type DiagramMode } from "@/document/modes";

// Diagram-mode picker in the toolbar. A mode re-skins the same content: Canvas
// (free), MindMap (auto tree), Infographics (bold cards), SketchNotes (hand-drawn).
export function ModeMenu() {
  const engine = useApp((s) => s.engine);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<DiagramMode>("canvas");

  // Reflect the active diagram's mode (it travels with the document).
  useEffect(() => {
    if (!engine) return;
    setMode(engine.getMode() as DiagramMode);
    return engine.subscribe(() => setMode(engine.getMode() as DiagramMode));
  }, [engine]);

  const pick = (key: DiagramMode) => {
    engine?.setMode(key);
    setMode(key);
    setOpen(false);
  };

  const active = MODE_PRESETS[mode] ?? MODE_PRESETS.canvas;

  return (
    <div className="mode-menu">
      <button
        className="tb mode-trigger"
        title="Diagram mode — how this diagram is visualized"
        onClick={() => setOpen((o) => !o)}
        disabled={!engine}
      >
        <span className="mode-glyph">{active.glyph}</span>
        <span className="mode-name">{active.name}</span>
        <span className="mode-caret">▾</span>
      </button>
      {open && (
        <>
          <div className="ins-scrim" onClick={() => setOpen(false)} />
          <div className="ins-pop mode-pop">
            <div className="ins-head">Diagram mode</div>
            {MODE_LIST.map((key) => {
              const p = MODE_PRESETS[key];
              return (
                <button
                  key={key}
                  className={`ins-item mode-item ${mode === key ? "on" : ""}`}
                  onClick={() => pick(key)}
                >
                  <span className="mode-glyph">{p.glyph}</span>
                  <span className="mode-item-text">
                    <span className="mode-item-name">
                      {p.name}
                      {mode === key && <span className="mode-check">✓</span>}
                    </span>
                    <span className="mode-item-blurb">{p.blurb}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
