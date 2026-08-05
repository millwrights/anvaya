import { useState } from "react";
import { useApp } from "@/app/store";
import { doc } from "@/app/session";
import { downloadBlob, downloadDocument, slug } from "@/workspace/serialize";

// Export the current diagram as a high-resolution image, a vector SVG, or the
// raw .anvaya document.
export function ExportMenu() {
  const engine = useApp((s) => s.engine);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const fname = (ext: string) => `${slug(doc.title())}.${ext}`;

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
          </div>
        </>
      )}
    </div>
  );
}
