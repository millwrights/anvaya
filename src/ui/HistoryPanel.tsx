import { useEffect, useState } from "react";
import { useApp } from "@/app/store";
import {
  compareCommits,
  diagramHistory,
  historyAvailable,
  previewCommit,
  type GitCommit,
} from "@/workspace/history";

function when(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function HistoryPanel() {
  const open = useApp((s) => s.historyOpen);
  const setOpen = useApp((s) => s.setHistoryOpen);

  const [commits, setCommits] = useState<GitCommit[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCommits(null);
    setError(null);
    setPicked([]);
    if (!historyAvailable()) {
      setError("Git history needs a folder workspace that's a git repository.");
      setCommits([]);
      return;
    }
    diagramHistory()
      .then(setCommits)
      .catch((e) => {
        setError(e instanceof Error ? e.message : String(e));
        setCommits([]);
      });
  }, [open]);

  if (!open) return null;

  const toggle = (hash: string) =>
    setPicked((p) => (p.includes(hash) ? p.filter((h) => h !== hash) : [...p, hash].slice(-2)));

  const view = async (c: GitCommit) => {
    setBusy(true);
    try {
      await previewCommit(c);
      setOpen(false);
    } finally {
      setBusy(false);
    }
  };

  const compare = async () => {
    if (!commits || picked.length !== 2) return;
    setBusy(true);
    try {
      // commits are newest-first; older = the one later in the list.
      const [i, j] = picked.map((h) => commits.findIndex((c) => c.hash === h));
      const older = commits[Math.max(i, j)];
      const newer = commits[Math.min(i, j)];
      await compareCommits(older, newer);
      setOpen(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="hist-scrim" onPointerDown={() => !busy && setOpen(false)}>
      <div className="hist-panel" onPointerDown={(e) => e.stopPropagation()}>
        <div className="hist-head">
          <strong>🕑 Version history</strong>
          <button className="ai-x" title="Close" onClick={() => setOpen(false)}>
            ✕
          </button>
        </div>

        {commits === null && <div className="hist-empty">Loading commits…</div>}
        {commits !== null && commits.length === 0 && (
          <div className="hist-empty">{error ?? "No commits found for this diagram yet."}</div>
        )}

        {commits && commits.length > 0 && (
          <>
            <div className="hist-hint">Tick two commits to compare, or click one to view it.</div>
            <div className="hist-list">
              {commits.map((c) => (
                <div key={c.hash} className={`hist-row ${picked.includes(c.hash) ? "on" : ""}`}>
                  <input
                    type="checkbox"
                    checked={picked.includes(c.hash)}
                    onChange={() => toggle(c.hash)}
                    title="Select for compare"
                  />
                  <button className="hist-main" onClick={() => void view(c)} disabled={busy}>
                    <span className="hist-subject">{c.subject || "(no message)"}</span>
                    <span className="hist-meta">
                      <code>{c.short}</code> · {when(c.date)} · {c.author}
                    </span>
                  </button>
                </div>
              ))}
            </div>
            <div className="hist-actions">
              <span className="hist-count">{picked.length}/2 selected</span>
              <button className="ai-go" disabled={picked.length !== 2 || busy} onClick={() => void compare()}>
                Compare
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
