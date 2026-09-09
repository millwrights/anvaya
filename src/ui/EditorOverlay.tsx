import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CanvasEngine } from "@/canvas/CanvasEngine";
import { commands, doc } from "@/app/session";
import { fontStack, readableText, resolveStyle } from "@/document/theme";

interface Props {
  getEngine: () => CanvasEngine | null;
  registerOpen: (fn: (id: string) => void) => void;
}

/**
 * Convert a contentEditable's DOM to plain text with exact line breaks — a <br>
 * is one newline, each block (<div>/<p>) starts a new line, and text nodes keep
 * their own "\n". This matches what's rendered, unlike innerText (over-counts a
 * leading bare line) or textContent (drops <br>/<div> newlines entirely).
 */
function domToText(root: HTMLElement): string {
  let out = "";
  const walk = (node: Node) => {
    node.childNodes.forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        out += child.textContent ?? "";
      } else if (child.nodeName === "BR") {
        out += "\n";
      } else if (child.nodeName === "DIV" || child.nodeName === "P") {
        if (out !== "" && !out.endsWith("\n")) out += "\n";
        walk(child);
      } else {
        walk(child);
      }
    });
  };
  walk(root);
  return out;
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
    if (ref.current) commands.setText(editingId, domToText(ref.current).replace(/\n+$/, ""));
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
          color: readableText(s.textColor, s.fill),
          caretColor: readableText(s.textColor, s.fill),
          fontFamily: fontStack(s.fontFamily),
          fontWeight: s.bold ? 700 : 500,
          fontStyle: s.italic ? "italic" : "normal",
          textDecoration:
            [s.underline && "underline", s.strike && "line-through"].filter(Boolean).join(" ") ||
            "none",
          textAlign: s.align ?? "center",
        }}
        onBlur={commit}
        onPaste={(e) => {
          // Paste as plain text (no HTML), so foreign formatting doesn't come in.
          e.preventDefault();
          document.execCommand("insertText", false, e.clipboardData.getData("text/plain"));
        }}
        onKeyDown={(e) => {
          // Mind-map topics: Enter commits so you can add the next topic fast.
          // Every other shape is free-form text: Enter inserts a newline
          // (finish by clicking away or pressing Escape). Shift+Enter always
          // inserts a newline.
          if (e.key === "Enter" && !e.shiftKey && node.shape === "topic") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            commit();
          }
          e.stopPropagation(); // don't let global shortcuts fire while typing
        }}
      />
    </div>
  );
}
