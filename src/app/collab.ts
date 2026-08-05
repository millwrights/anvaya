import { WebsocketProvider } from "y-websocket";
import { doc } from "./session";
import { currentDiagram } from "@/workspace/backend";

// Real-time collaboration. Because the document is already a Yjs CRDT, a
// WebsocketProvider syncs edits across clients with no extra merge logic; the
// awareness protocol carries live cursors + presence. Runtime is unchanged when
// collaboration is off — this is purely additive.

const WS_URL = (import.meta.env.VITE_ANVAYA_WS as string) || "ws://localhost:1234";
const NAMES = ["Otter", "Falcon", "Maple", "Cobalt", "Sage", "Ember", "Wren", "Juniper"];
const COLORS = ["#4c8dff", "#3ecf8e", "#ffcf5c", "#ff6b6b", "#c58cff", "#f7a072"];

export interface CollabUser {
  name: string;
  color: string;
}
export interface Peer {
  clientId: number;
  name: string;
  color: string;
  cursor?: { x: number; y: number };
}

const me: CollabUser = {
  name: NAMES[Math.floor(Math.random() * NAMES.length)],
  color: COLORS[Math.floor(Math.random() * COLORS.length)],
};

let provider: WebsocketProvider | null = null;
let status: "off" | "connecting" | "live" = "off";

const listeners = new Set<() => void>();
export function onCollabChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
function notify() {
  listeners.forEach((l) => l());
}

export function localUser() {
  return me;
}
export function collabStatus() {
  return status;
}
export function isOn() {
  return provider != null;
}
export function roomName() {
  return `anvaya:${currentDiagram() ?? "welcome"}`;
}

export function startCollab() {
  if (provider) return;
  status = "connecting";
  provider = new WebsocketProvider(WS_URL, roomName(), doc.ydoc);
  provider.awareness.setLocalStateField("user", me);
  provider.on("status", (e: { status: string }) => {
    status = e.status === "connected" ? "live" : "connecting";
    notify();
  });
  provider.awareness.on("change", notify);
  notify();
}

export function stopCollab() {
  if (!provider) return;
  provider.awareness.setLocalState(null);
  provider.destroy();
  provider = null;
  status = "off";
  notify();
}

export function toggleCollab() {
  provider ? stopCollab() : startCollab();
}

export function setCursor(x: number, y: number) {
  provider?.awareness.setLocalStateField("cursor", { x, y });
}

export function peers(): Peer[] {
  if (!provider) return [];
  const self = provider.awareness.clientID;
  const out: Peer[] = [];
  provider.awareness.getStates().forEach((state, clientId) => {
    if (clientId === self) return;
    const s = state as { user?: CollabUser; cursor?: { x: number; y: number } };
    out.push({
      clientId,
      name: s.user?.name ?? "Guest",
      color: s.user?.color ?? "#8b93a3",
      cursor: s.cursor,
    });
  });
  return out;
}
