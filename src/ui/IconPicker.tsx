import { useMemo, useRef, useState } from "react";
import { useApp } from "@/app/store";
import { commands } from "@/app/session";
import { ALL_ICONS, ICON_CATEGORIES, type LibIcon } from "@/document/icons";

export function IconPicker() {
  const open = useApp((s) => s.iconsOpen);
  const setOpen = useApp((s) => s.setIconsOpen);
  const engine = useApp((s) => s.engine);

  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return ALL_ICONS.filter(
      (i) =>
        (!cat || i.cat === cat) &&
        (!needle || i.name.toLowerCase().includes(needle) || i.key.includes(needle) || i.cat.toLowerCase().includes(needle)),
    );
  }, [q, cat]);

  if (!open || !engine) return null;

  const centerWorld = () => {
    const v = engine.viewportWorld();
    return { x: v.x + v.w / 2, y: v.y + v.h / 2 };
  };

  const drop = (def: LibIcon) => {
    const c = centerWorld();
    // Full-color icons (AWS/Azure/GCP logos) keep their own palette; only tint monochrome ones.
    const n = commands.createIcon(def.svg, c.x, c.y, 64, def.mono ? def.tint : undefined);
    engine.setSelection([n.id]);
    // keep the picker open so several icons can be placed in a row
  };

  const onImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const text = await file.text();
    if (!text.includes("<svg")) return;
    const c = centerWorld();
    // Imported SVGs keep their own colors (no tint) unless they use currentColor.
    const n = commands.createIcon(text, c.x, c.y, 96);
    engine.setSelection([n.id]);
    setOpen(false);
  };

  return (
    <div className="ic-col">
      <div className="ic-head">
        <strong>⬡ Icons</strong>
        <button className="ai-x" title="Close" onClick={() => setOpen(false)}>
          ✕
        </button>
      </div>

        <div className="ic-top">
          <input
            className="ic-search"
            placeholder="Search icons…"
            value={q}
            autoFocus
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.stopPropagation()}
          />
          <button className="ic-import" onClick={() => fileRef.current?.click()}>
            ＋ Import SVG…
          </button>
        </div>

        <div className="ic-cats">
          <button className={`ic-cat ${!cat ? "on" : ""}`} onClick={() => setCat(null)}>
            All
          </button>
          {ICON_CATEGORIES.map((c) => (
            <button key={c} className={`ic-cat ${cat === c ? "on" : ""}`} onClick={() => setCat(c)}>
              {c}
            </button>
          ))}
        </div>

        <div className="ic-grid">
          {results.map((def, i) => (
            <button
              key={`${def.cat}:${def.key}:${i}`}
              className="ic-cell"
              title={def.name}
              style={{ color: def.tint }}
              onClick={() => drop(def)}
              dangerouslySetInnerHTML={{ __html: def.svg }}
            />
          ))}
          {results.length === 0 && <div className="ic-empty">No icons match “{q}”.</div>}
        </div>

        <div className="ic-foot">Click an icon to drop it · recolor it in the inspector.</div>
      <input
        ref={fileRef}
        type="file"
        accept=".svg,image/svg+xml"
        style={{ display: "none" }}
        onChange={onImport}
      />
    </div>
  );
}
