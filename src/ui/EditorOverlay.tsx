import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CanvasEngine } from "@/canvas/CanvasEngine";
import { commands, doc } from "@/app/session";
import { fontStack, resolveStyle } from "@/document/theme";

interface Props {
  getEngine: () => CanvasEngine | null;
  registerOpen: (fn: (id: string) => void) => void;
}

// In-place text editing that matches the node exactly: a transparent, centered
// contentEditable sitting over the node, while the engine hides the node's baked
// label. The shape/fill stay visible underneath — so editing a yellow sticky
// keeps it yellow (Miro/FigJam behavior), instead of covering it with a box.
export function EditorOverlay({ getEngine, registerOpen }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [, force] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    registerOpen((id) => {
      getEngine()?.setEditingId(id);
      setEditingId(id);
    });
  }, [registerOpen, getEngine]);

  // Seed text, focus, and select-all once mounted — before paint.
  useLayoutEffect(() => {
    if (editingId && ref.current) {
      ref.current.textContent = doc.getNode(editingId)?.text ?? "";
      ref.current.focus();
      const r = document.createRange();
      r.selectNodeContents(ref.current);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(r);
    }
  }, [editingId]);

  // Track camera / node changes so the editor stays glued to the node.
  useEffect(() => {
    const engine = getEngine();
    if (!engine) return;
    return engine.subscribe(() => force((n) => n + 1));
  }, [getEngine, editingId]);

  const engine = getEngine();
  if (!editingId || !engine) return null;
  const node = doc.getNode(editingId);
  const rect = engine.nodeScreenRect(editingId);
  if (!node || !rect) return null;

  const s = resolveStyle(node.shape, node.style);

  const close = () => {
    engine.setEditingId(null);
    setEditingId(null);
  };
  const commit = () => {
    if (ref.current) commands.setText(editingId, ref.current.textContent ?? "");
    close();
  };

  // Wrapper centers the editable; the editable itself stays a plain block so the
  // text caret renders correctly (a flex/grid contentEditable hides the caret).
  return (
    <div
      className="node-editor"
      style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
    >
      <div
        ref={ref}
        className="node-editor-input"
        contentEditable
        suppressContentEditableWarning
        spellCheck={false}
        style={{
          fontSize: s.fontSize * engine.camera.zoom,
          color: s.textColor,
          caretColor: s.textColor,
          fontFamily: fontStack(s.fontFamily),
          fontWeight: s.bold ? 700 : 500,
          fontStyle: s.italic ? "italic" : "normal",
          textDecoration:
            [s.underline && "underline", s.strike && "line-through"].filter(Boolean).join(" ") ||
            "none",
          textAlign: s.align ?? "center",
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            close();
          }
          e.stopPropagation(); // don't let global shortcuts fire while typing
        }}
      />
    </div>
  );
}
