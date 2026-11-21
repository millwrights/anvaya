// Built-in icon library — clean monochrome line icons that recolor cleanly
// (they draw in `currentColor`, which the renderer swaps for the node's tint).
// Icon path data is adapted from Feather Icons (https://feathericons.com, MIT).

export interface IconDef {
  key: string;
  name: string;
  cat: string;
  /** Inner SVG markup (paths/shapes) on a 0 0 24 24 viewBox. */
  body: string;
}

/** Wrap an icon body in a standalone SVG document (128px so it rasterizes crisp). */
export function iconSvg(body: string): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 24 24" ` +
    `fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">` +
    body +
    `</svg>`
  );
}

export const ICONS: IconDef[] = [
  // ── Infrastructure ──────────────────────────────────────────────────────────
  { key: "server", name: "Server", cat: "Infrastructure", body: `<rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/>` },
  { key: "database", name: "Database", cat: "Infrastructure", body: `<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>` },
  { key: "cloud", name: "Cloud", cat: "Infrastructure", body: `<path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/>` },
  { key: "cpu", name: "CPU / chip", cat: "Infrastructure", body: `<rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/><line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="14" x2="23" y2="14"/><line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="14" x2="4" y2="14"/>` },
  { key: "harddrive", name: "Storage", cat: "Infrastructure", body: `<line x1="22" y1="12" x2="2" y2="12"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/><line x1="6" y1="16" x2="6.01" y2="16"/><line x1="10" y1="16" x2="10.01" y2="16"/>` },
  { key: "network", name: "Network", cat: "Infrastructure", body: `<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>` },
  { key: "balancer", name: "Load balancer", cat: "Infrastructure", body: `<circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M6 21V9a9 9 0 0 0 9 9"/>` },
  { key: "box", name: "Container", cat: "Infrastructure", body: `<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>` },
  { key: "layers", name: "Layers", cat: "Infrastructure", body: `<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>` },
  { key: "wifi", name: "Wi-Fi", cat: "Infrastructure", body: `<path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/>` },

  // ── Devices ─────────────────────────────────────────────────────────────────
  { key: "monitor", name: "Monitor", cat: "Devices", body: `<rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>` },
  { key: "browser", name: "Browser", cat: "Devices", body: `<rect x="2" y="4" width="20" height="16" rx="2"/><line x1="2" y1="9" x2="22" y2="9"/><line x1="5" y1="6.5" x2="5.01" y2="6.5"/><line x1="8" y1="6.5" x2="8.01" y2="6.5"/>` },
  { key: "phone", name: "Mobile", cat: "Devices", body: `<rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/>` },
  { key: "globe", name: "Globe", cat: "Devices", body: `<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>` },
  { key: "terminal", name: "Terminal", cat: "Devices", body: `<polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>` },
  { key: "code", name: "Code", cat: "Devices", body: `<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>` },

  // ── People ──────────────────────────────────────────────────────────────────
  { key: "user", name: "User", cat: "People", body: `<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>` },
  { key: "users", name: "Users", cat: "People", body: `<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>` },
  { key: "bot", name: "Bot / AI", cat: "People", body: `<rect x="4" y="8" width="16" height="12" rx="2"/><path d="M12 8V4"/><circle cx="12" cy="3" r="1"/><line x1="9" y1="13" x2="9" y2="14"/><line x1="15" y1="13" x2="15" y2="14"/><line x1="1" y1="13" x2="2" y2="13"/><line x1="22" y1="13" x2="23" y2="13"/>` },

  // ── Security ────────────────────────────────────────────────────────────────
  { key: "lock", name: "Lock", cat: "Security", body: `<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>` },
  { key: "key", name: "Key", cat: "Security", body: `<path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>` },
  { key: "shield", name: "Shield", cat: "Security", body: `<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>` },

  // ── Data & Comms ────────────────────────────────────────────────────────────
  { key: "mail", name: "Mail", cat: "Data & Comms", body: `<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>` },
  { key: "send", name: "Send", cat: "Data & Comms", body: `<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>` },
  { key: "bell", name: "Notification", cat: "Data & Comms", body: `<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>` },
  { key: "folder", name: "Folder", cat: "Data & Comms", body: `<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>` },
  { key: "file", name: "File", cat: "Data & Comms", body: `<path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/>` },
  { key: "barchart", name: "Chart", cat: "Data & Comms", body: `<line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/>` },

  // ── Status ──────────────────────────────────────────────────────────────────
  { key: "check", name: "Success", cat: "Status", body: `<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>` },
  { key: "x", name: "Error", cat: "Status", body: `<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>` },
  { key: "alert", name: "Warning", cat: "Status", body: `<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>` },
  { key: "clock", name: "Clock", cat: "Status", body: `<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>` },
  { key: "search", name: "Search", cat: "Status", body: `<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>` },
  { key: "settings", name: "Settings", cat: "Status", body: `<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>` },

  // ── Flow ────────────────────────────────────────────────────────────────────
  { key: "arrow", name: "Arrow", cat: "Flow", body: `<line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>` },
  { key: "link", name: "Link", cat: "Flow", body: `<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>` },
  { key: "gitbranch", name: "Git branch", cat: "Flow", body: `<line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/>` },
  { key: "zap", name: "Function", cat: "Flow", body: `<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>` },
  { key: "cart", name: "Cart", cat: "Flow", body: `<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>` },
  { key: "card", name: "Payment", cat: "Flow", body: `<rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/>` },
];

// ── unified library: line icons + brand logos + cloud-architecture icons ──────
import { BRAND_ICONS } from "./brand-icons";
import { ARCH_ICONS } from "./arch-icons";

export interface LibIcon {
  key: string;
  name: string;
  cat: string;
  /** Full standalone SVG markup, ready to drop / preview. */
  svg: string;
  /** Default tint when dropped (brand color for logos, light for line icons). */
  tint: string;
  /** Monochrome icons recolor via the inspector; full-color icons keep their palette. */
  mono: boolean;
}

/** Wrap a single filled brand path (simple-icons) so it recolors via currentColor. */
function brandSvg(path: string): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 24 24">` +
    `<path fill="currentColor" d="${path}"/></svg>`
  );
}

export const ALL_ICONS: LibIcon[] = [
  ...ICONS.map((i) => ({ key: i.key, name: i.name, cat: i.cat, svg: iconSvg(i.body), tint: "#e8ebf0", mono: true })),
  ...BRAND_ICONS.map((b) => ({ key: b.key, name: b.name, cat: b.cat, svg: brandSvg(b.path), tint: `#${b.hex}`, mono: true })),
  ...ARCH_ICONS.map((a) => ({ key: a.key, name: a.name, cat: a.cat, svg: a.svg, tint: a.mono ? "#e8ebf0" : "", mono: a.mono })),
];

export const ICON_CATEGORIES = [...new Set(ALL_ICONS.map((i) => i.cat))];
