// Thin, typed bridge to the native (Rust) workspace commands. All of this is
// no-op / unavailable in the browser build; callers gate on `isTauri`.

export const isTauri =
  typeof window !== "undefined" &&
  ("__TAURI_INTERNALS__" in window || "__TAURI__" in window);

type InvokeFn = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const core = await import("@tauri-apps/api/core");
  return (core.invoke as InvokeFn)<T>(cmd, args);
}

export const native = {
  defaultWorkspace: () => invoke<string>("default_workspace"),
  ensureWorkspace: (path: string) => invoke<string>("ensure_workspace", { path }),
  readText: (path: string) => invoke<string | null>("read_text", { path }),
  writeText: (path: string, contents: string) =>
    invoke<void>("write_text", { path, contents }),
  deleteFile: (path: string) => invoke<void>("delete_file", { path }),
  listFiles: (dir: string, ext: string) =>
    invoke<string[]>("list_files", { dir, ext }),
  /** POST a JSON body to an AI endpoint through the native layer (no CORS). */
  aiComplete: (url: string, headers: Record<string, string>, body: string) =>
    invoke<string>("ai_complete", { url, headers, body }),
  /** Git commit history for one diagram file (newest first; empty if not a repo). */
  gitLog: (dir: string, file: string) => invoke<GitCommit[]>("git_log", { dir, file }),
  /** The diagram file's contents at a given commit. */
  gitShow: (dir: string, commit: string, file: string) =>
    invoke<string>("git_show", { dir, commit, file }),
};

export interface GitCommit {
  hash: string;
  short: string;
  author: string;
  date: string; // ISO 8601
  subject: string;
}

/** Native folder picker (returns the chosen directory, or null if cancelled). */
export async function pickWorkspaceFolder(): Promise<string | null> {
  const { open } = await import("@tauri-apps/plugin-dialog");
  const result = await open({ directory: true, multiple: false, title: "Choose a workspace folder" });
  return typeof result === "string" ? result : null;
}
