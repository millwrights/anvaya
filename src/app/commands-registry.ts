import type { CanvasEngine } from "@/canvas/CanvasEngine";
import { commands, doc } from "./session";
import { downloadDocument, parseDocument } from "@/workspace/serialize";
import { createDiagram, switchWorkspace } from "@/workspace/backend";
import { isTauri, pickWorkspaceFolder } from "@/workspace/tauri";
import { TEMPLATES } from "./templates";

// The registry of user-facing commands. The command palette (⌘K), keyboard
// shortcuts, and menus all resolve to entries here — one list, one behavior.

export interface AppCommand {
  id: string;
  title: string;
  hint?: string;
  run: (engine: CanvasEngine) => void;
}

export function buildCommands(): AppCommand[] {
  const list: AppCommand[] = [
    {
      id: "diagram.new",
      title: "New diagram",
      run: async (e) => {
        await createDiagram("Untitled");
        e.setSelection([]);
        e.zoomToFit();
      },
    },
    {
      id: "node.create",
      title: "New node (center)",
      hint: "N",
      run: (e) => {
        const w = e.camera.screenToWorld(
          e.pixiRenderer.width / (2 * (window.devicePixelRatio || 1)),
          e.pixiRenderer.height / (2 * (window.devicePixelRatio || 1)),
        );
        const n = commands.createNode({ shape: "rounded", x: w.x, y: w.y });
        e.setSelection([n.id]);
        e.requestEdit(n.id);
      },
    },
    {
      id: "mind.child",
      title: "Add child topic",
      hint: "Tab",
      run: (e) => {
        const sel = e.getSelection();
        if (sel[0]) {
          const c = commands.addChildTopic(sel[0]);
          if (c) {
            e.setSelection([c.id]);
            e.requestEdit(c.id);
          }
        }
      },
    },
    {
      id: "mind.sibling",
      title: "Add sibling topic",
      hint: "Enter",
      run: (e) => {
        const sel = e.getSelection();
        if (sel[0]) {
          const s = commands.addSiblingTopic(sel[0]);
          if (s) {
            e.setSelection([s.id]);
            e.requestEdit(s.id);
          }
        }
      },
    },
    {
      id: "tool.connect",
      title: "Connect nodes",
      hint: "C",
      run: (e) => e.setTool("connect"),
    },
    {
      id: "tool.sticky",
      title: "Sticky note",
      hint: "S",
      run: (e) => e.setTool("sticky"),
    },
    {
      id: "insert.image",
      title: "Insert image…",
      run: (e) => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = "image/*";
        input.onchange = () => {
          const f = input.files?.[0];
          if (f) e.addImageFile(f);
        };
        input.click();
      },
    },
    {
      id: "edit.duplicate",
      title: "Duplicate selection",
      hint: "⌘D",
      run: (e) => {
        const sel = e.getSelection();
        if (sel.length) e.setSelection(commands.duplicateNodes(sel));
      },
    },
    {
      id: "arrange.front",
      title: "Bring to front",
      hint: "⌘]",
      run: (e) => commands.bringToFront(e.getSelection()),
    },
    {
      id: "arrange.back",
      title: "Send to back",
      hint: "⌘[",
      run: (e) => commands.sendToBack(e.getSelection()),
    },
    {
      id: "group.group",
      title: "Group selection",
      hint: "⌘G",
      run: (e) => commands.groupNodes(e.getSelection()),
    },
    {
      id: "group.ungroup",
      title: "Ungroup",
      hint: "⇧⌘G",
      run: (e) => commands.ungroupNodes(e.getSelection()),
    },
    ...TEMPLATES.map((t) => ({
      id: `template.${t.id}`,
      title: `Template: ${t.name}`,
      run: (e: CanvasEngine) => t.apply(e),
    })),
    {
      id: "layout.reflow",
      title: "Tidy / reflow mind map",
      run: (e) => {
        const sel = e.getSelection();
        if (sel[0]) commands.reflowOwningLayout(sel[0]);
      },
    },
    { id: "view.fit", title: "Zoom to fit", hint: "⇧1", run: (e) => e.zoomToFit() },
    { id: "view.zoomIn", title: "Zoom in", run: (e) => e.zoomBy(1.2) },
    { id: "view.zoomOut", title: "Zoom out", run: (e) => e.zoomBy(1 / 1.2) },
    { id: "edit.undo", title: "Undo", hint: "⌘Z", run: () => commands.undo() },
    { id: "edit.redo", title: "Redo", hint: "⇧⌘Z", run: () => commands.redo() },
    {
      id: "file.export",
      title: "Export diagram (.anvaya)",
      run: () => downloadDocument(doc.toJSON()),
    },
    {
      id: "file.import",
      title: "Import diagram (.anvaya)",
      run: (e) => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".anvaya,application/json";
        input.onchange = async () => {
          const file = input.files?.[0];
          if (!file) return;
          try {
            doc.loadJSON(parseDocument(await file.text()));
            e.zoomToFit();
          } catch (err) {
            alert(`Import failed: ${(err as Error).message}`);
          }
        };
        input.click();
      },
    },
  ];

  // Desktop-only: switch the on-disk workspace folder.
  if (isTauri) {
    list.push({
      id: "workspace.open",
      title: "Open workspace folder…",
      run: async (e) => {
        const dir = await pickWorkspaceFolder();
        if (!dir) return;
        await switchWorkspace(dir);
        e.setSelection([]);
        e.zoomToFit();
      },
    });
  }

  return list;
}
