// Publish an Anvaya diagram to Confluence as a full page: the diagram image
// plus a written breakdown of every component (box) and every connection
// (A → B) including each arrow's detail. Config is generic (Cloud or
// Server/Data Center) and stored locally, mirroring the AI settings — the token
// never leaves this machine except in the request to the user's own Confluence.

import type { SceneEdge, SceneNode } from "@/document/types";
import { edgeHasDetail } from "@/document/types";
import { isTauri, native } from "@/workspace/tauri";

export type ConfluenceAuth = "basic" | "bearer";

export interface ConfluenceConfig {
  /** Wiki base, e.g. https://acme.atlassian.net/wiki or https://confluence.acme.com */
  baseUrl: string;
  /** "basic" = Cloud (email + API token); "bearer" = Server/DC personal access token. */
  authType: ConfluenceAuth;
  email: string; // for basic auth (Cloud)
  token: string; // API token / PAT
  spaceKey: string; // target space, e.g. ENG
  parentPageId: string; // optional parent page id ("" = top level)
}

const DEFAULT: ConfluenceConfig = {
  baseUrl: "",
  authType: "basic",
  email: "",
  token: "",
  spaceKey: "",
  parentPageId: "",
};

const KEY = "anvaya:confluence:config";

export function loadConfluenceConfig(): ConfluenceConfig {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULT, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return { ...DEFAULT };
}

export function saveConfluenceConfig(cfg: ConfluenceConfig): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(cfg));
  } catch {
    /* ignore */
  }
}

/** Remembered Confluence page id per diagram, so re-publishing updates in place. */
export function loadPageId(diagramId: string): string {
  try {
    const map = JSON.parse(localStorage.getItem("anvaya:confluence:pages") || "{}");
    return map[diagramId] || "";
  } catch {
    return "";
  }
}
export function savePageId(diagramId: string, pageId: string): void {
  try {
    const map = JSON.parse(localStorage.getItem("anvaya:confluence:pages") || "{}");
    map[diagramId] = pageId;
    localStorage.setItem("anvaya:confluence:pages", JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

const esc = (s: string) =>
  String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Human-readable type for a node, for the components table. */
function nodeType(n: SceneNode): string {
  if (n.shape === "icon") return "Service / component";
  const map: Record<string, string> = {
    rounded: "Process",
    rect: "Box",
    ellipse: "Start / end",
    diamond: "Decision",
    note: "Note",
    sticky: "Sticky",
    topic: "Idea",
    frame: "Group",
    text: "Label",
  };
  return map[n.shape] ?? n.shape;
}

const nodeName = (n: SceneNode) => n.text.trim() || nodeType(n);

/**
 * Build the Confluence storage-format body for a diagram: the diagram image
 * (an attachment named `imageName`), a Components table listing every box, and
 * a Connections section describing every A → B link with its arrow detail.
 */
export function buildConfluenceStorage(
  nodes: SceneNode[],
  edges: SceneEdge[],
  imageName: string,
): string {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const diagramNodes = nodes.filter(
    (n) => n.shape !== "draw" && n.shape !== "frame" && n.shape !== "text",
  );
  const realEdges = edges.filter((e) => byId.has(e.source) && byId.has(e.target));

  const parts: string[] = [];

  // 1. The diagram image (attachment embedded at the top).
  parts.push(
    `<ac:image ac:align="center"><ri:attachment ri:filename="${esc(imageName)}" /></ac:image>`,
  );

  // 2. Components — every box, what it is.
  parts.push(`<h2>Components</h2>`);
  parts.push(
    `<table><tbody><tr><th>Component</th><th>Type</th></tr>` +
      diagramNodes
        .map((n) => `<tr><td><strong>${esc(nodeName(n))}</strong></td><td>${esc(nodeType(n))}</td></tr>`)
        .join("") +
      `</tbody></table>`,
  );

  // 3. Connections — every A → B, in words, with the arrow's detail.
  parts.push(`<h2>Connections</h2>`);
  if (!realEdges.length) {
    parts.push(`<p><em>No connections in this diagram.</em></p>`);
  } else {
    realEdges.forEach((e, i) => {
      const a = nodeName(byId.get(e.source)!);
      const b = nodeName(byId.get(e.target)!);
      parts.push(`<h3>${i + 1}. ${esc(a)} &rarr; ${esc(b)}</h3>`);
      const rel = e.label.trim()
        ? `<strong>${esc(a)}</strong> connects to <strong>${esc(b)}</strong> (${esc(e.label.trim())}).`
        : `<strong>${esc(a)}</strong> connects to <strong>${esc(b)}</strong>.`;
      parts.push(`<p>${rel}</p>`);
      const d = e.detail;
      if (edgeHasDetail(e) && d) {
        const fields = (d.fields ?? []).filter((f) => f.k.trim() || f.v.trim());
        if (fields.length) {
          parts.push(
            `<table><tbody><tr><th>Field</th><th>Value</th></tr>` +
              fields
                .map((f) => `<tr><td>${esc(f.k)}</td><td>${esc(f.v)}</td></tr>`)
                .join("") +
              `</tbody></table>`,
          );
        }
        const notes = (d.notes ?? "").trim();
        if (notes) parts.push(`<p>${esc(notes).replace(/\n/g, "<br/>")}</p>`);
      }
    });
  }

  parts.push(
    `<hr/><p><em>Generated from Anvaya. ${diagramNodes.length} components, ${realEdges.length} connections.</em></p>`,
  );
  return parts.join("\n");
}

// ── live publishing (desktop only; requests go through the native layer) ──────

function authHeaders(cfg: ConfluenceConfig): Record<string, string> {
  if (cfg.authType === "bearer") return { Authorization: `Bearer ${cfg.token}` };
  return { Authorization: `Basic ${btoa(`${cfg.email}:${cfg.token}`)}` };
}

const apiBase = (cfg: ConfluenceConfig) => cfg.baseUrl.replace(/\/+$/, "");

interface ConfResp {
  status: number;
  // deno-lint-ignore no-explicit-any
  json: any;
  body: string;
}

async function confReq(
  cfg: ConfluenceConfig,
  method: string,
  path: string,
  body?: unknown,
): Promise<ConfResp> {
  if (!isTauri) throw new Error("Publishing to Confluence needs the desktop app.");
  const url = apiBase(cfg) + path;
  const headers = { ...authHeaders(cfg), "Content-Type": "application/json", Accept: "application/json" };
  const resp = await native.httpRequest(method, url, headers, body ? JSON.stringify(body) : undefined);
  let json: unknown = null;
  try {
    json = resp.body ? JSON.parse(resp.body) : null;
  } catch {
    /* non-JSON error page */
  }
  if (resp.status < 200 || resp.status >= 300) {
    const msg = (json as { message?: string } | null)?.message || resp.body.slice(0, 300) || `HTTP ${resp.status}`;
    throw new Error(`Confluence ${resp.status}: ${msg}`);
  }
  return { status: resp.status, json, body: resp.body };
}

async function uploadImage(
  cfg: ConfluenceConfig,
  pageId: string,
  filename: string,
  png: Uint8Array,
): Promise<void> {
  const headers = { ...authHeaders(cfg), "X-Atlassian-Token": "nocheck" };
  const data = Array.from(png);
  // Reuse the existing attachment (update its data) if one with this name exists.
  const list = await confReq(
    cfg,
    "GET",
    `/rest/api/content/${pageId}/child/attachment?filename=${encodeURIComponent(filename)}`,
  );
  const existing = (list.json as { results?: { id: string }[] } | null)?.results?.[0];
  const url = existing
    ? `${apiBase(cfg)}/rest/api/content/${pageId}/child/attachment/${existing.id}/data`
    : `${apiBase(cfg)}/rest/api/content/${pageId}/child/attachment`;
  const resp = await native.httpUpload(url, headers, "file", filename, "image/png", data);
  if (resp.status < 200 || resp.status >= 300) {
    let m = resp.body.slice(0, 300);
    try {
      m = JSON.parse(resp.body).message || m;
    } catch {
      /* ignore */
    }
    throw new Error(`Image upload ${resp.status}: ${m}`);
  }
}

export interface PublishResult {
  url: string;
  pageId: string;
  created: boolean;
}

/** Create or update a Confluence page for a diagram, with the image + detail. */
export async function publishToConfluence(
  cfg: ConfluenceConfig,
  opts: { title: string; diagramId: string; nodes: SceneNode[]; edges: SceneEdge[]; png: Uint8Array },
): Promise<PublishResult> {
  if (!cfg.baseUrl.trim()) throw new Error("Set your Confluence base URL first.");
  if (!cfg.token.trim()) throw new Error("Set your Confluence API token first.");
  if (!cfg.spaceKey.trim()) throw new Error("Set a target space key first.");
  if (cfg.authType === "basic" && !cfg.email.trim()) throw new Error("Cloud auth needs your Atlassian email.");

  const imageName = "diagram.png";
  const storage = buildConfluenceStorage(opts.nodes, opts.edges, imageName);
  const title = opts.title.trim() || "Untitled diagram";

  let pageId = loadPageId(opts.diagramId);
  if (pageId) {
    // Confirm the remembered page still exists; otherwise fall back to create.
    try {
      await confReq(cfg, "GET", `/rest/api/content/${pageId}?expand=version`);
    } catch {
      pageId = "";
    }
  }

  // deno-lint-ignore no-explicit-any
  let page: any;
  let created = false;
  if (pageId) {
    const g = await confReq(cfg, "GET", `/rest/api/content/${pageId}?expand=version`);
    const version = ((g.json?.version?.number as number) ?? 1) + 1;
    const put = await confReq(cfg, "PUT", `/rest/api/content/${pageId}`, {
      id: pageId,
      type: "page",
      title,
      space: { key: cfg.spaceKey },
      version: { number: version },
      body: { storage: { value: storage, representation: "storage" } },
    });
    page = put.json;
  } else {
    const createBody: Record<string, unknown> = {
      type: "page",
      title,
      space: { key: cfg.spaceKey },
      body: { storage: { value: storage, representation: "storage" } },
    };
    if (cfg.parentPageId.trim()) createBody.ancestors = [{ id: cfg.parentPageId.trim() }];
    const c = await confReq(cfg, "POST", `/rest/api/content`, createBody);
    page = c.json;
    pageId = page.id as string;
    created = true;
    savePageId(opts.diagramId, pageId);
  }

  await uploadImage(cfg, pageId, imageName, opts.png);

  const links = page?._links as { base?: string; webui?: string } | undefined;
  const url = links?.webui
    ? (links.base || apiBase(cfg)) + links.webui
    : `${apiBase(cfg)}/pages/viewpage.action?pageId=${pageId}`;
  return { url, pageId, created };
}

/**
 * A browser-renderable preview of the same content (Confluence macros swapped
 * for plain HTML), so the page can be reviewed before publishing.
 */
export function buildPreviewHtml(nodes: SceneNode[], edges: SceneEdge[], imageName: string): string {
  const storage = buildConfluenceStorage(nodes, edges, imageName);
  return storage.replace(
    /<ac:image[^>]*><ri:attachment ri:filename="([^"]*)"\s*\/><\/ac:image>/g,
    (_m, f) =>
      `<div style="border:1px dashed #9aa;border-radius:8px;padding:28px;text-align:center;color:#667;">🖼 ${esc(f)} (diagram image)</div>`,
  );
}
