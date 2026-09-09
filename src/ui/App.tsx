import { useEffect } from "react";
import { useApp } from "@/app/store";
import { commands } from "@/app/session";
import { copySelection, pasteClipboard } from "@/app/clipboard";
import type { Tool } from "@/canvas/CanvasEngine";

const TOOL_KEYS: Record<string, Tool> = {
  v: "select",
  p: "pen",
  r: "rect",
  o: "ellipse",
  d: "diamond",
  s: "sticky",
  f: "frame",
  t: "text",
  c: "connect",
};
import { Canvas } from "./Canvas";
import { Toolbar } from "./Toolbar";
import { Sidebar } from "./Sidebar";
import { Inspector } from "./Inspector";
import { Minimap } from "./Minimap";
import { CommandPalette } from "./CommandPalette";
import { StatusBar } from "./StatusBar";

function isTyping(): boolean {
  const el = document.activeElement;
  return (
    !!el &&
    (el.tagName === "INPUT" ||
      el.tagName === "TEXTAREA" ||
      (el as HTMLElement).isContentEditable)
  );
}

export function App() {
  const setPaletteOpen = useApp((s) => s.setPaletteOpen);
  const engine = useApp((s) => s.engine);

  // Route native Cmd+V paste: image → node, else paste copied nodes.
  useEffect(() => {
    if (engine) engine.onPasteFallback(() => pasteClipboard(engine));
  }, [engine]);

  // Global keyboard shortcuts. Everything routes through the command layer.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const engine = useApp.getState().engine;
      const mod = e.metaKey || e.ctrlKey;

      // Palette works even while typing elsewhere.
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen(true);
        return;
      }
      if (isTyping() || !engine) return;

      const sel = engine.getSelection();

      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        e.shiftKey ? commands.redo() : commands.undo();
        return;
      }

      // Modifier combos: select-all / duplicate / copy / paste / z-order.
      if (mod) {
        const k = e.key.toLowerCase();
        if (k === "a") {
          e.preventDefault();
          engine.selectAll();
          return;
        }
        if (k === "d") {
          e.preventDefault();
          if (sel.length) engine.setSelection(commands.duplicateNodes(sel));
          return;
        }
        if (k === "c") {
          e.preventDefault();
          copySelection(engine);
          return;
        }
        // Cmd+V is intentionally NOT handled here: letting the browser fire its
        // native `paste` event lets the engine paste an image from the clipboard,
        // falling back to in-app node paste (see onPasteFallback below).
        if (e.key === "]") {
          e.preventDefault();
          if (sel.length) commands.bringToFront(sel);
          return;
        }
        if (e.key === "[") {
          e.preventDefault();
          if (sel.length) commands.sendToBack(sel);
          return;
        }
        if (k === "g") {
          e.preventDefault();
          if (e.shiftKey) commands.ungroupNodes(sel);
          else if (sel.length >= 2) commands.groupNodes(sel);
          return;
        }
      }

      // Single-key tool switches (no modifier).
      const toolKey = TOOL_KEYS[e.key.toLowerCase()];
      if (toolKey && !mod) {
        e.preventDefault();
        engine.setTool(toolKey);
        return;
      }

      switch (e.key) {
        case "Tab":
          if (sel[0]) {
            e.preventDefault();
            const c = commands.addChildTopic(sel[0]);
            if (c) {
              engine.setSelection([c.id]);
              engine.requestEdit(c.id);
            }
          }
          break;
        case "Enter":
          if (sel[0]) {
            e.preventDefault();
            const s = commands.addSiblingTopic(sel[0]);
            if (s) {
              engine.setSelection([s.id]);
              engine.requestEdit(s.id);
            }
          }
          break;
        case "ArrowLeft":
        case "ArrowRight":
        case "ArrowUp":
        case "ArrowDown": {
          const dir = (
            { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down" } as const
          )[e.key];
          if (engine.selectNeighbor(dir)) e.preventDefault();
          break;
        }
        case "Delete":
        case "Backspace":
          if (sel.length) {
            e.preventDefault();
            commands.deleteNodes(sel);
            engine.setSelection([]);
          } else if (engine.getEdgeSelection()) {
            e.preventDefault();
            commands.deleteEdge(engine.getEdgeSelection()!);
            engine.setEdgeSelection(null);
          }
          break;
        case "n":
        case "N": {
          const w = engine.camera.screenToWorld(
            window.innerWidth / 2,
            window.innerHeight / 2,
          );
          const n = commands.createNode({ shape: "rounded", x: w.x, y: w.y });
          engine.setSelection([n.id]);
          engine.requestEdit(n.id);
          break;
        }
        case "!": // shift+1
          engine.zoomToFit();
          break;
        case "Escape":
          engine.setTool("select");
          engine.setSelection([]);
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setPaletteOpen]);

  return (
    <div className="app">
      <Toolbar />
      <div className="mid">
        <Sidebar />
        <Canvas />
      </div>
      <Inspector />
      <Minimap />
      <StatusBar />
      <CommandPalette />
    </div>
  );
}
