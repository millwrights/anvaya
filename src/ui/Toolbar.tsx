import { useEffect, useState } from "react";
import { useApp } from "@/app/store";
import { commands, doc } from "@/app/session";
import { renameCurrentDiagram } from "@/workspace/backend";
import { LiveButton } from "./LiveButton";
import { InsertMenu } from "./InsertMenu";
import { ThemeMenu } from "./ThemeMenu";
import { ExportMenu } from "./ExportMenu";
import type { Tool } from "@/canvas/CanvasEngine";

const TOOLS: { id: Tool; glyph: string; label: string; key: string }[] = [
  { id: "select", glyph: "⬉", label: "Select", key: "V" },
  { id: "pen", glyph: "✎", label: "Pen (draw)", key: "P" },
  { id: "rect", glyph: "▭", label: "Box", key: "R" },
  { id: "ellipse", glyph: "◯", label: "Circle / oval", key: "O" },
  { id: "diamond", glyph: "◇", label: "Diamond", key: "D" },
  { id: "sticky", glyph: "🟨", label: "Sticky note", key: "S" },
  { id: "frame", glyph: "⛶", label: "Frame / section", key: "F" },
  { id: "text", glyph: "T", label: "Text", key: "T" },
  { id: "connect", glyph: "↳", label: "Connect", key: "C" },
];

export function Toolbar() {
  const engine = useApp((s) => s.engine);
  const setPaletteOpen = useApp((s) => s.setPaletteOpen);
  const toggleSidebar = useApp((s) => s.toggleSidebar);
  const [tool, setTool] = useState<Tool>("select");
  const [title, setTitle] = useState(doc.title());
  const [renaming, setRenaming] = useState(false);

  const commitTitle = (v: string) => {
    const t = v.trim() || "Untitled";
    renameCurrentDiagram(t);
    setTitle(t);
    setRenaming(false);
  };

  useEffect(() => {
    if (!engine) return;
    return engine.subscribe(() => {
      setTool(engine.tool);
      setTitle(doc.title());
    });
  }, [engine]);

  return (
    <div className="toolbar" data-tauri-drag-region>
      <span className="brand" data-tauri-drag-region>
        Anvaya{" "}
        {renaming ? (
          <input
            className="brand-edit"
            autoFocus
            defaultValue={title}
            onFocus={(e) => e.target.select()}
            onBlur={(e) => commitTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              else if (e.key === "Escape") setRenaming(false);
              e.stopPropagation();
            }}
          />
        ) : (
          <small
            className="brand-title"
            title="Click to rename this diagram"
            onClick={() => setRenaming(true)}
          >
            {title}
          </small>
        )}
      </span>

      <button className="tb icon" onClick={toggleSidebar} title="Toggle sidebar">
        ☰
      </button>

      <div className="toolgroup">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            className={`tb icon ${tool === t.id ? "active" : ""}`}
            onClick={() => engine?.setTool(t.id)}
            title={`${t.label} (${t.key})`}
          >
            {t.glyph}
          </button>
        ))}
      </div>

      <button className="tb" onClick={() => commands.undo()}>
        Undo
      </button>
      <button className="tb" onClick={() => commands.redo()}>
        Redo
      </button>

      <InsertMenu />

      <span className="spacer" data-tauri-drag-region />

      <LiveButton />
      <ThemeMenu />
      <button className="tb" onClick={() => engine?.zoomToFit()}>
        Fit
      </button>
      <ExportMenu />
      <button className="tb" onClick={() => setPaletteOpen(true)}>
        Commands <kbd>⌘K</kbd>
      </button>
    </div>
  );
}
