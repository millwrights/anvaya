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
};

/** Native folder picker (returns the chosen directory, or null if cancelled). */
export async function pickWorkspaceFolder(): Promise<string | null> {
  const { open } = await import("@tauri-apps/plugin-dialog");
  const result = await open({ directory: true, multiple: false, title: "Choose a workspace folder" });
  return typeof result === "string" ? result : null;
}
