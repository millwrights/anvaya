import { useEffect, useState } from "react";
import { useApp } from "@/app/store";
import { commands, doc } from "@/app/session";

// The most-used quick actions, floated right above the selection (Miro/FigJam
// style) so edits happen where your eyes are — the full side Inspector stays for
// everything else.
const QUICK_FILLS = ["#2b6cff", "#16a34a", "#f5c400", "#f5920b", "#f0392b", "#8b45ff"];

export function FloatingToolbar() {
  const engine = useApp((s) => s.engine);
  const [, bump] = useState(0);

  useEffect(() => {
    if (!engine) return;
    return engine.subscribe(() => bump((n) => n + 1));
  }, [engine]);

  if (!engine) return null;
  const sel = engine.getSelection();
  // Only for node selections, and never while typing (the text caret owns focus).
  if (sel.length === 0 || engine.getEditingId()) return null;

  const rect = engine.selectionScreenRect();
  if (!rect) return null;

  const ref = doc.getNode(sel[0]);
  if (!ref) return null;
  const st = ref.style ?? {};

  const setStyle = (patch: Record<string, unknown>) => commands.updateNodesStyle(sel, patch);

  // Sit above the selection, clamped into the viewport; flip below if no room up top.
  const GAP = 12;
  const above = rect.y > 56;
  const top = above ? rect.y - GAP : rect.y + rect.h + GAP;
  const left = Math.max(12, rect.x + rect.w / 2);

  return (
    <div
      className="floatbar"
      style={{ left, top, transform: `translate(-50%, ${above ? "-100%" : "0"})` }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {QUICK_FILLS.map((c) => (
        <button
          key={c}
          className={`fb-swatch ${st.fill === c ? "on" : ""}`}
          style={{ background: c }}
          title="Fill color"
          onClick={() => setStyle({ fill: c })}
        />
      ))}
      <label className="fb-swatch fb-pick" title="Custom color…">
        <input
          type="color"
          value={/^#[0-9a-fA-F]{6}$/.test(st.fill ?? "") ? (st.fill as string) : "#2b6cff"}
          onChange={(e) => setStyle({ fill: e.target.value })}
        />
      </label>

      <span className="fb-div" />

      <button
        className={`fb-btn ${st.bold ? "on" : ""}`}
        style={{ fontWeight: 800 }}
        title="Bold"
        onClick={() => setStyle({ bold: !st.bold })}
      >
        B
      </button>
      <button
        className={`fb-btn ${st.italic ? "on" : ""}`}
        style={{ fontStyle: "italic", fontFamily: "Georgia, serif" }}
        title="Italic"
        onClick={() => setStyle({ italic: !st.italic })}
      >
        I
      </button>
      <button
        className={`fb-btn ${st.underline ? "on" : ""}`}
        style={{ textDecoration: "underline" }}
        title="Underline"
        onClick={() => setStyle({ underline: !st.underline })}
      >
        U
      </button>

      <span className="fb-div" />

      <button
        className="fb-btn"
        title="Duplicate"
        onClick={() => engine.setSelection(commands.duplicateNodes(sel))}
      >
        ⧉
      </button>
      <button
        className="fb-btn fb-danger"
        title="Delete"
        onClick={() => {
          commands.deleteNodes(sel);
          engine.setSelection([]);
        }}
      >
        🗑
      </button>
    </div>
  );
}
