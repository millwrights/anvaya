// Git history for the current diagram: list commits, preview a past version
// (read-only), or compare two versions as a color-coded overlay. All previews go
// through the backend's preview mode, so the live file on disk is never touched.

import { useApp } from "@/app/store";
import { native, type GitCommit } from "./tauri";
import { parseDocument } from "./serialize";
import { currentDiagramGit, exitPreview, previewVersion } from "./backend";
import { diffDocs, DIFF_ADDED, DIFF_CHANGED, DIFF_REMOVED } from "./diffdoc";

export type { GitCommit };

/** Commits that touched the current diagram (newest first). Empty if the
 *  workspace isn't a git repo or git isn't available. */
export async function diagramHistory(): Promise<GitCommit[]> {
  const g = currentDiagramGit();
  if (!g) return [];
  return native.gitLog(g.dir, g.file);
}

/** True only for an on-disk (folder) workspace where git history is meaningful. */
export function historyAvailable(): boolean {
  return !!currentDiagramGit();
}

function fit() {
  // Frame the loaded version (doc is updated synchronously by previewVersion).
  useApp.getState().engine?.zoomToFit();
}

/** Load one past version for viewing. */
export async function previewCommit(c: GitCommit): Promise<void> {
  const g = currentDiagramGit();
  if (!g) return;
  const text = await native.gitShow(g.dir, c.hash, g.file);
  previewVersion(parseDocument(text));
  fit();
  useApp.getState().setPreview({ label: `${c.short} · ${c.subject}` });
}

/** Overlay the difference between two versions (older → newer). */
export async function compareCommits(older: GitCommit, newer: GitCommit): Promise<void> {
  const g = currentDiagramGit();
  if (!g) return;
  const [aText, bText] = await Promise.all([
    native.gitShow(g.dir, older.hash, g.file),
    native.gitShow(g.dir, newer.hash, g.file),
  ]);
  const r = diffDocs(aText, bText);
  previewVersion(r.doc);
  fit();
  useApp.getState().setPreview({
    label: `${older.short} → ${newer.short}  ·  +${r.added}  −${r.removed}  ~${r.changed}`,
    legend: [
      { color: DIFF_ADDED, text: "added" },
      { color: DIFF_REMOVED, text: "removed" },
      { color: DIFF_CHANGED, text: "changed" },
    ],
  });
}

/** Leave history/diff view and restore the live diagram. */
export async function endHistoryPreview(): Promise<void> {
  await exitPreview();
  useApp.getState().setPreview(null);
  fit();
}
