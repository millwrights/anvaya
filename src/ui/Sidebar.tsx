import { useCallback, useEffect, useMemo, useState } from "react";
import { useApp } from "@/app/store";
import {
  createDiagram,
  currentDiagram,
  deleteDiagram,
  listDiagrams,
  onWorkspaceChange,
  openDiagram,
  setCurrentDiagramMeta,
  type DiagramMeta,
} from "@/workspace/backend";

// The workspace's diagram list. Diagrams can be organized into folders, tagged,
// and searched — so a workspace scales to many mindmaps. Clicking one opens it
// (flushing the current one first); the pencil edits its name/folder/tags.
export function Sidebar() {
  const open = useApp((s) => s.sidebarOpen);
  const [items, setItems] = useState<DiagramMeta[]>([]);
  const [current, setCurrent] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState<string | null>(null);
  const [metaEdit, setMetaEdit] = useState<DiagramMeta | null>(null);

  const refresh = useCallback(() => {
    listDiagrams().then(setItems);
    setCurrent(currentDiagram());
  }, []);

  useEffect(() => {
    refresh();
    return onWorkspaceChange(refresh);
  }, [refresh]);

  const fit = () => {
    const e = useApp.getState().engine;
    e?.setSelection([]);
    e?.zoomToFit();
  };

  const openIt = async (name: string) => {
    if (name === current) return;
    await openDiagram(name);
    fit();
  };

  const newIt = async () => {
    await createDiagram("Untitled");
    fit();
    const name = currentDiagram();
    if (name) setMetaEdit({ name, title: "Untitled", folder: "", tags: [] });
  };

  const saveMeta = async (m: DiagramMeta, title: string, folder: string, tags: string[]) => {
    if (m.name !== current) {
      await openDiagram(m.name);
      fit();
    }
    setCurrentDiagramMeta({ title, folder, tags });
    setMetaEdit(null);
    refresh();
  };

  const toggleFolder = (f: string) =>
    setCollapsed((s) => {
      const n = new Set(s);
      n.has(f) ? n.delete(f) : n.add(f);
      return n;
    });

  const q = query.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      items.filter(
        (d) =>
          !q ||
          d.title.toLowerCase().includes(q) ||
          d.folder.toLowerCase().includes(q) ||
          d.tags.some((t) => t.toLowerCase().includes(q)),
      ),
    [items, q],
  );

  const { ungrouped, folders } = useMemo(() => {
    const groups = new Map<string, DiagramMeta[]>();
    for (const d of filtered) {
      const f = d.folder || "";
      (groups.get(f) ?? groups.set(f, []).get(f)!).push(d);
    }
    return {
      ungrouped: groups.get("") ?? [],
      folders: [...groups.entries()]
        .filter(([f]) => f)
        .sort((a, b) => a[0].localeCompare(b[0])),
    };
  }, [filtered]);

  const allFolders = useMemo(
    () => [...new Set(items.map((d) => d.folder).filter(Boolean))].sort(),
    [items],
  );
  const allTags = useMemo(() => [...new Set(items.flatMap((d) => d.tags))].sort(), [items]);

  if (!open) return null;

  const item = (d: DiagramMeta) => (
    <div
      key={d.name}
      className={`sb-item ${d.name === current ? "active" : ""}`}
      onClick={() => openIt(d.name)}
      onDoubleClick={() => setMetaEdit(d)}
      title={`${d.title} — double-click to edit`}
    >
      <div className="sb-item-main">
        <span className="sb-title">{d.title || d.name}</span>
        {d.tags.length > 0 && (
          <span className="sb-tags">
            {d.tags.map((t) => (
              <span key={t} className="sb-tag">
                {t}
              </span>
            ))}
          </span>
        )}
      </div>
      {confirm === d.name ? (
        <span className="sb-confirm" onClick={(e) => e.stopPropagation()}>
          <button
            className="sb-yes"
            onClick={() => {
              void deleteDiagram(d.name).then(fit);
              setConfirm(null);
            }}
          >
            Delete
          </button>
          <button className="sb-no" onClick={() => setConfirm(null)}>
            Cancel
          </button>
        </span>
      ) : (
        <>
          <button
            className="sb-x"
            title="Edit name, folder & tags"
            onClick={(e) => {
              e.stopPropagation();
              setMetaEdit(d);
            }}
          >
            ✎
          </button>
          <button
            className="sb-x"
            title="Delete diagram"
            onClick={(e) => {
              e.stopPropagation();
              setConfirm(d.name);
            }}
          >
            ×
          </button>
        </>
      )}
    </div>
  );

  return (
    <div className="sidebar">
      <div className="sb-head">
        <span>Diagrams</span>
        <button className="sb-new" onClick={newIt} title="New diagram">
          +
        </button>
      </div>

      <input
        className="sb-search"
        placeholder="Search name or #tag…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => e.stopPropagation()}
      />

      <div className="sb-list">
        {filtered.length === 0 && (
          <div className="sb-empty">{items.length ? "No matches" : "No diagrams"}</div>
        )}
        {ungrouped.map(item)}
        {folders.map(([folder, ds]) => {
          const isCollapsed = collapsed.has(folder);
          return (
            <div className="sb-folder" key={folder}>
              <div className="sb-folder-head" onClick={() => toggleFolder(folder)}>
                <span className="sb-caret">{isCollapsed ? "▸" : "▾"}</span>
                <span className="sb-folder-name">{folder}</span>
                <span className="sb-folder-count">{ds.length}</span>
              </div>
              {!isCollapsed && ds.map(item)}
            </div>
          );
        })}
      </div>

      {metaEdit && (
        <MetaEditor
          meta={metaEdit}
          folders={allFolders}
          tags={allTags}
          onCancel={() => setMetaEdit(null)}
          onSave={(title, folder, tags) => void saveMeta(metaEdit, title, folder, tags)}
        />
      )}
    </div>
  );
}

function MetaEditor({
  meta,
  folders,
  tags,
  onSave,
  onCancel,
}: {
  meta: DiagramMeta;
  folders: string[];
  tags: string[];
  onSave: (title: string, folder: string, tags: string[]) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(meta.title);
  const [folder, setFolder] = useState(meta.folder);
  const [tagStr, setTagStr] = useState(meta.tags.join(", "));

  const save = () => {
    const t = [...new Set(tagStr.split(",").map((s) => s.trim()).filter(Boolean))];
    onSave(title.trim() || "Untitled", folder.trim(), t);
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") save();
    else if (e.key === "Escape") onCancel();
    e.stopPropagation();
  };

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h4>Diagram details</h4>
        <label className="modal-field">
          <span>Name</span>
          <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={onKey} />
        </label>
        <label className="modal-field">
          <span>Folder</span>
          <input
            value={folder}
            list="sb-folders"
            placeholder="e.g. Work / Auth (blank = none)"
            onChange={(e) => setFolder(e.target.value)}
            onKeyDown={onKey}
          />
          <datalist id="sb-folders">
            {folders.map((f) => (
              <option key={f} value={f} />
            ))}
          </datalist>
        </label>
        <label className="modal-field">
          <span>Tags</span>
          <input
            value={tagStr}
            list="sb-tags"
            placeholder="comma, separated"
            onChange={(e) => setTagStr(e.target.value)}
            onKeyDown={onKey}
          />
          <datalist id="sb-tags">
            {tags.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </label>
        <div className="modal-actions">
          <button className="shape-btn" onClick={onCancel}>
            Cancel
          </button>
          <button className="shape-btn primary" onClick={save}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
