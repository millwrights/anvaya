import type { AnvayaDoc } from "@/document/doc";
import type { Commands } from "@/commands/commands";
import type { AnvayaDocument } from "@/document/types";
import { seedWelcome } from "./seed";
import { parseDocument, serializeDocument } from "./serialize";
import { isTauri, native } from "./tauri";

// Persistence is layered:
//   Storage    — a tiny "filesystem" of named .anvaya blobs (folder on disk via
//                the Rust core, or localStorage in the browser).
//   Workspace  — owns a Storage, the CRDT doc, and the notion of a *current*
//                diagram. Handles open/create/rename/delete + debounced autosave.
// A workspace therefore holds many diagrams; switching either the workspace
// (folder) or the current diagram runs through here. The canonical form on disk
// is always normalized JSON; the CRDT stays the runtime layer.

export interface WorkspaceInfo {
  kind: "browser" | "folder";
  label: string;
  path: string | null;
}
export interface DiagramMeta {
  name: string; // file name, e.g. "auth-flow.anvaya"
  title: string;
  folder: string; // "" = ungrouped
  tags: string[];
}

const EXT = ".anvaya";
const LAST_KEY = "anvaya:lastWorkspace";
const RECENTS_KEY = "anvaya:recentWorkspaces";

// ── pub/sub so the UI reflects workspace / diagram-list changes ───────────────
const listeners = new Set<() => void>();
export function onWorkspaceChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function notify() {
  listeners.forEach((l) => l());
}

// ── Storage ──────────────────────────────────────────────────────────────────
interface Storage {
  list(): Promise<string[]>;
  read(name: string): Promise<string | null>;
  write(name: string, contents: string): Promise<void>;
  remove(name: string): Promise<void>;
}

class NativeStorage implements Storage {
  constructor(private root: string) {}
  private path(name: string) {
    return `${this.root}/diagrams/${name}`;
  }
  async list() {
    return native.listFiles(`${this.root}/diagrams`, EXT);
  }
  read(name: string) {
    return native.readText(this.path(name));
  }
  write(name: string, contents: string) {
    return native.writeText(this.path(name), contents);
  }
  remove(name: string) {
    return native.deleteFile(this.path(name));
  }
}

class BrowserStorage implements Storage {
  private prefix = "anvaya:ws:browser:";
  private index(): string[] {
    try {
      return JSON.parse(localStorage.getItem(this.prefix + "index") || "[]");
    } catch {
      return [];
    }
  }
  private setIndex(names: string[]) {
    localStorage.setItem(this.prefix + "index", JSON.stringify(names));
  }
  async list() {
    return this.index();
  }
  async read(name: string) {
    return localStorage.getItem(this.prefix + "file:" + name);
  }
  async write(name: string, contents: string) {
    localStorage.setItem(this.prefix + "file:" + name, contents);
    const idx = this.index();
    if (!idx.includes(name)) this.setIndex([...idx, name].sort());
  }
  async remove(name: string) {
    localStorage.removeItem(this.prefix + "file:" + name);
    this.setIndex(this.index().filter((n) => n !== name));
  }
}

// ── Workspace ────────────────────────────────────────────────────────────────
class Workspace {
  info: WorkspaceInfo;
  current: string | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  // External-change watcher (picks up diagrams an AI agent / MCP server wrote).
  private watch: ReturnType<typeof setInterval> | null = null;
  private lastListKey = "";
  private lastDiskText: string | null = null;

  constructor(
    private doc: AnvayaDoc,
    private cmd: Commands,
    private storage: Storage,
    kind: "browser" | "folder",
    path: string | null,
  ) {
    this.info = {
      kind,
      label:
        kind === "folder"
          ? `Workspace · ${shorten(path!)}`
          : "Local workspace · auto-saved",
      path,
    };
  }

  async open(seedIfEmpty: boolean) {
    const files = await this.storage.list();
    if (files.length > 0) {
      await this.load(files[0]);
    } else if (seedIfEmpty) {
      seedWelcome(this.doc, this.cmd);
      this.current = "welcome" + EXT;
      await this.flushNow();
    } else {
      this.doc.loadJSON(emptyDocument("Untitled"));
      this.current = "untitled" + EXT;
      await this.flushNow();
    }
    this.startAutosave();
    this.startWatch();
  }

  async listDiagrams(): Promise<DiagramMeta[]> {
    const files = await this.storage.list();
    const metas = await Promise.all(
      files.map(async (name): Promise<DiagramMeta> => {
        if (name === this.current)
          return {
            name,
            title: this.doc.title(),
            folder: this.doc.folder(),
            tags: this.doc.tags(),
          };
        const text = await this.storage.read(name);
        let title = name.replace(EXT, "");
        let folder = "";
        let tags: string[] = [];
        try {
          if (text) {
            const d = parseDocument(text);
            title = d.title || title;
            folder = d.folder ?? "";
            tags = d.tags ?? [];
          }
        } catch {
          /* keep filename as title */
        }
        return { name, title, folder, tags };
      }),
    );
    return metas.sort((a, b) => a.title.localeCompare(b.title));
  }

  async openDiagram(name: string) {
    if (name === this.current) return;
    await this.flushNow(); // persist the diagram we're leaving
    this.stopAutosave();
    await this.load(name);
    this.startAutosave();
    notify();
  }

  /**
   * Re-read the workspace from disk, DISCARDING in-memory state — this is how you
   * pick up external changes (e.g. after a `git pull`). It deliberately does NOT
   * flush first, so a stale in-memory copy can't clobber the fresh files. Also
   * refreshes the diagram list, so newly pulled diagrams appear.
   */
  async reloadCurrent() {
    this.stopAutosave();
    const files = await this.storage.list();
    // Keep the current diagram if it still exists on disk; otherwise the first.
    const name = this.current && files.includes(this.current) ? this.current : files[0];
    if (name) {
      await this.load(name);
    } else {
      this.doc.loadJSON(emptyDocument("Untitled"));
      this.current = "untitled" + EXT;
      await this.flushNow();
    }
    this.startAutosave();
    notify();
  }

  async createDiagram(title: string): Promise<string> {
    await this.flushNow();
    this.stopAutosave();
    const files = await this.storage.list();
    const name = uniqueName(title, files);
    this.doc.loadJSON(emptyDocument(title));
    this.current = name;
    this.doc.undoManager.clear();
    await this.flushNow();
    this.startAutosave();
    notify();
    return name;
  }

  renameCurrent(title: string) {
    this.doc.setTitle(title); // update triggers debounced autosave
    notify();
  }

  /** Update the current diagram's folder + tags (triggers debounced autosave). */
  setCurrentMeta(meta: { folder?: string; tags?: string[]; title?: string }) {
    this.doc.transact(() => {
      if (meta.title !== undefined) this.doc.setTitle(meta.title.trim() || "Untitled");
      if (meta.folder !== undefined) this.doc.setFolder(meta.folder.trim());
      if (meta.tags !== undefined) this.doc.setTags(meta.tags);
    });
    notify();
  }

  async deleteDiagram(name: string) {
    await this.storage.remove(name);
    if (name === this.current) {
      this.stopAutosave();
      this.current = null;
      const files = await this.storage.list();
      if (files.length > 0) {
        await this.load(files[0]);
      } else {
        this.doc.loadJSON(emptyDocument("Untitled"));
        this.current = "untitled" + EXT;
        await this.flushNow();
      }
      this.startAutosave();
    }
    notify();
  }

  private async load(name: string) {
    const text = await this.storage.read(name);
    if (text) this.doc.loadJSON(parseDocument(text));
    this.current = name;
    this.lastDiskText = text ?? null;
    this.doc.undoManager.clear();
  }

  /** Poll for changes made on disk outside the app (e.g. by the MCP server):
   *  refresh the list when diagrams appear/disappear, and reload the open one if
   *  it changed externally — but only while idle, so it never clobbers edits. */
  private startWatch() {
    if (this.watch) return;
    this.watch = setInterval(() => void this.poll(), 2500);
  }
  private async poll() {
    try {
      const files = await this.storage.list();
      const key = files.join("|");
      if (this.lastListKey && key !== this.lastListKey) notify(); // new/removed diagram
      this.lastListKey = key;
      // Reload the current diagram only for on-disk workspaces, when the user
      // isn't mid-edit (no pending autosave) and the file actually differs.
      if (
        this.info.kind === "folder" &&
        this.current &&
        this.timer === null &&
        files.includes(this.current)
      ) {
        const text = await this.storage.read(this.current);
        if (text != null && this.lastDiskText != null && text !== this.lastDiskText) {
          await this.reloadCurrent();
        }
      }
    } catch {
      /* transient FS error — try again next tick */
    }
  }

  private startAutosave() {
    this.doc.ydoc.on("update", this.schedule);
  }
  private stopAutosave() {
    this.doc.ydoc.off("update", this.schedule);
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
  private schedule = () => {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flushNow(), 500);
  };
  private async flushNow() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (!this.current) return;
    const text = serializeDocument(this.doc.toJSON());
    await this.storage.write(this.current, text);
    this.lastDiskText = text; // so the watcher doesn't treat our own save as external
  }

  async dispose() {
    this.stopAutosave();
    if (this.watch) {
      clearInterval(this.watch);
      this.watch = null;
    }
    await this.flushNow();
  }
}

// ── module state + public API ────────────────────────────────────────────────
let theDoc: AnvayaDoc;
let theCmd: Commands;
let active: Workspace | null = null;

export function activeWorkspace(): WorkspaceInfo | null {
  return active?.info ?? null;
}
export function currentDiagram(): string | null {
  return active?.current ?? null;
}
export function listDiagrams(): Promise<DiagramMeta[]> {
  return active ? active.listDiagrams() : Promise.resolve([]);
}
export function openDiagram(name: string): Promise<void> {
  return active ? active.openDiagram(name) : Promise.resolve();
}
/** Re-read the current workspace from disk (e.g. to pick up a `git pull`). */
export function reloadFromDisk(): Promise<void> {
  return active ? active.reloadCurrent() : Promise.resolve();
}
export async function createDiagram(title: string): Promise<void> {
  await active?.createDiagram(title);
}
export function renameCurrentDiagram(title: string): void {
  active?.renameCurrent(title);
}
export function setCurrentDiagramMeta(meta: {
  folder?: string;
  tags?: string[];
  title?: string;
}): void {
  active?.setCurrentMeta(meta);
}
export function deleteDiagram(name: string): Promise<void> {
  return active ? active.deleteDiagram(name) : Promise.resolve();
}

export async function createBackend(
  doc: AnvayaDoc,
  cmd: Commands,
): Promise<void> {
  theDoc = doc;
  theCmd = cmd;

  if (!isTauri) {
    active = new Workspace(doc, cmd, new BrowserStorage(), "browser", null);
    await active.open(true);
    notify();
    return;
  }

  const def = await native.defaultWorkspace();
  const remembered = localStorage.getItem(LAST_KEY);
  let root = remembered || def;
  try {
    active = new Workspace(doc, cmd, new NativeStorage(root), "folder", root);
    await active.open(root === def);
  } catch {
    root = def;
    active = new Workspace(doc, cmd, new NativeStorage(root), "folder", root);
    await active.open(true);
  }
  localStorage.setItem(LAST_KEY, root);
  rememberRecent(root);
  notify();
}

/** Switch to a different workspace folder at runtime (desktop only). */
export async function switchWorkspace(root: string): Promise<void> {
  if (!isTauri || !theDoc) return;
  await active?.dispose();
  active = new Workspace(theDoc, theCmd, new NativeStorage(root), "folder", root);
  await active.open(false);
  localStorage.setItem(LAST_KEY, root);
  rememberRecent(root);
  notify();
}

export function recentWorkspaces(): string[] {
  try {
    const raw = localStorage.getItem(RECENTS_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}
function rememberRecent(root: string) {
  const list = recentWorkspaces().filter((p) => p !== root);
  list.unshift(root);
  localStorage.setItem(RECENTS_KEY, JSON.stringify(list.slice(0, 6)));
}

// ── helpers ──────────────────────────────────────────────────────────────────
function emptyDocument(title: string): AnvayaDocument {
  return {
    schema: "anvaya/diagram@1",
    id: "diagram",
    title,
    nodes: [],
    edges: [],
    layouts: [],
  };
}
function slug(s: string): string {
  return (
    s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") ||
    "diagram"
  );
}
function uniqueName(title: string, existing: string[]): string {
  const base = slug(title);
  let name = base + EXT;
  let i = 1;
  while (existing.includes(name)) name = `${base}-${i++}${EXT}`;
  return name;
}
function shorten(path: string): string {
  const parts = path.split("/").filter(Boolean);
  return parts.length <= 2 ? path : ".../" + parts.slice(-2).join("/");
}
