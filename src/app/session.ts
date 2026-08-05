import { AnvayaDoc } from "@/document/doc";
import { Commands } from "@/commands/commands";
import { createBackend } from "@/workspace/backend";

// A single runtime session. The persistence backend is chosen at startup:
//   • Tauri build → a real workspace folder on disk (normalized JSON source of
//     truth), the Rust core owning file I/O.
//   • Browser build → IndexedDB (auto-save + crash recovery).
// The CRDT document and command layer are identical either way.

export const doc = new AnvayaDoc();
export const commands = new Commands(doc);

let ready: Promise<void> | null = null;

export function initSession(): Promise<void> {
  if (!ready) ready = createBackend(doc, commands).then(() => undefined);
  return ready;
}
