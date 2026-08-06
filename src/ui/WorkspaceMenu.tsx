import { useEffect, useState } from "react";
import { useApp } from "@/app/store";
import {
  activeWorkspace,
  onWorkspaceChange,
  recentWorkspaces,
  reloadFromDisk,
  switchWorkspace,
} from "@/workspace/backend";
import { isTauri, pickWorkspaceFolder } from "@/workspace/tauri";

// The workspace switcher: a chip in the status bar that opens a popover for
// choosing / switching the on-disk workspace folder (desktop) and jumping to
// recent workspaces. In the browser build it just reports the local store.
export function WorkspaceMenu() {
  const [open, setOpen] = useState(false);
  const [, bump] = useState(0);
  const [busy, setBusy] = useState(false);
  const [busyText, setBusyText] = useState("Switching…");

  useEffect(() => onWorkspaceChange(() => bump((n) => n + 1)), []);

  const info = activeWorkspace();
  const recents = recentWorkspaces().filter((p) => p !== info?.path);

  const afterSwitch = () => {
    const engine = useApp.getState().engine;
    engine?.setSelection([]);
    engine?.zoomToFit();
  };

  const go = async (root: string) => {
    setBusyText("Switching…");
    setBusy(true);
    try {
      await switchWorkspace(root);
      afterSwitch();
    } finally {
      setBusy(false);
      setOpen(false);
    }
  };

  // Re-read the workspace from disk — picks up changes pulled in via git.
  const reload = async () => {
    setBusyText("Reloading…");
    setBusy(true);
    try {
      await reloadFromDisk();
      afterSwitch();
    } finally {
      setBusy(false);
      setOpen(false);
    }
  };

  const choose = async () => {
    const dir = await pickWorkspaceFolder();
    if (dir) await go(dir);
    else setOpen(false);
  };

  return (
    <div className="ws">
      <button className="ws-chip" onClick={() => setOpen((o) => !o)} disabled={busy}>
        <span className="dot" />
        {busy ? busyText : (info?.label ?? "Workspace")}
        <span className="ws-caret">▴</span>
      </button>

      {open && (
        <>
          <div className="ws-scrim" onClick={() => setOpen(false)} />
          <div className="ws-pop" role="menu">
            <div className="ws-head">Workspace</div>
            <div className="ws-path" title={info?.path ?? ""}>
              {info?.path ?? "Browser storage (IndexedDB)"}
            </div>

            <button
              className="ws-item"
              onClick={reload}
              title="Re-read this workspace's files (e.g. after a git pull)"
            >
              ↻ Reload from disk
            </button>

            {isTauri ? (
              <>
                <button className="ws-item" onClick={choose}>
                  Open folder…
                </button>
                {recents.length > 0 && <div className="ws-sub">Recent</div>}
                {recents.map((p) => (
                  <button
                    key={p}
                    className="ws-item ws-recent"
                    onClick={() => go(p)}
                    title={p}
                  >
                    {lastTwo(p)}
                  </button>
                ))}
              </>
            ) : (
              <div className="ws-note">
                Folder workspaces are available in the desktop app.
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function lastTwo(path: string): string {
  const parts = path.split("/").filter(Boolean);
  return parts.slice(-2).join("/");
}
