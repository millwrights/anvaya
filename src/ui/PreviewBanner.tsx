import { useApp } from "@/app/store";
import { endHistoryPreview } from "@/workspace/history";

// A bar across the top of the canvas while viewing a past version or a diff.
// Read-only: leaving restores the live diagram from disk.
export function PreviewBanner() {
  const preview = useApp((s) => s.preview);
  if (!preview) return null;

  return (
    <div className="preview-banner">
      <span className="pv-eye">👁</span>
      <span className="pv-label">{preview.label}</span>
      {preview.legend && (
        <span className="pv-legend">
          {preview.legend.map((l) => (
            <span key={l.text} className="pv-chip">
              <span className="pv-dot" style={{ background: l.color }} />
              {l.text}
            </span>
          ))}
        </span>
      )}
      <span className="pv-spacer" />
      <span className="pv-ro">read-only</span>
      <button className="pv-exit" onClick={() => void endHistoryPreview()}>
        Exit
      </button>
    </div>
  );
}
