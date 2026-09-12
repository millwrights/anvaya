import { useRef, useState } from "react";
import { useApp } from "@/app/store";
import { doc } from "@/app/session";
import { downloadBlob, downloadDocument, slug } from "@/workspace/serialize";
import { exportExcalidraw, importExcalidraw } from "@/workspace/excalidraw";

// Export the current diagram as a high-resolution image, a vector SVG, or the
// raw .anvaya document.
export function ExportMenu() {
  const engine = useApp((s) => s.engine);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const fname = (ext: string) => `${slug(doc.title())}.${ext}`;

  const excalidraw = () => {
    downloadBlob(new Blob([exportExcalidraw()], { type: "application/json" }), fname("excalidraw"));
    setOpen(false);
  };

  const onImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    if (!file || !engine) return;
    try {
      importExcalidraw(engine, await file.text());
    } catch (err) {
      console.error("[anvaya] Excalidraw import failed:", err);
    }
    setOpen(false);
  };

  const raster = async (format: "png" | "jpeg") => {
    if (!engine || busy) return;
    setBusy(true);
    try {
      const blob = await engine.exportImage(format, 3);
      if (blob) downloadBlob(blob, fname(format === "jpeg" ? "jpg" : "png"));
    } finally {
      setBusy(false);
      setOpen(false);
    }
  };

  const svg = () => {
    if (!engine) return;
    const markup = engine.exportSVG();
    downloadBlob(new Blob([markup], { type: "image/svg+xml" }), fname("svg"));
    setOpen(false);
  };

  const json = () => {
    downloadDocument(doc.toJSON());
    setOpen(false);
  };

  return (
    <div className="export-menu">
      <button className="tb" onClick={() => setOpen((o) => !o)} disabled={busy}>
        {busy ? "Exporting…" : "Export"}
      </button>
      {open && (
        <>
          <div className="ins-scrim" onClick={() => setOpen(false)} />
          <div className="ins-pop export-pop">
            <div className="ins-head">Export as</div>
            <button className="ins-item" onClick={() => void raster("png")}>
              🖼️ PNG · high-res
            </button>
            <button className="ins-item" onClick={() => void raster("jpeg")}>
              📷 JPEG · high-res
            </button>
            <button className="ins-item" onClick={svg}>
              ✒️ SVG · vector
            </button>
            <div className="ins-sep" />
            <button className="ins-item" onClick={json}>
              🗂️ Anvaya file
            </button>
            <button className="ins-item" onClick={excalidraw}>
              🎨 Excalidraw file
            </button>
            <div className="ins-sep" />
            <button className="ins-item" onClick={() => fileRef.current?.click()}>
              📥 Import Excalidraw…
            </button>
          </div>
        </>
      )}
      <input
        ref={fileRef}
        type="file"
        accept=".excalidraw,application/json"
        style={{ display: "none" }}
        onChange={onImportFile}
      />
    </div>
  );
}
