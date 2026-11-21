import { useMemo, useState } from "react";
import { useApp } from "@/app/store";
import { doc } from "@/app/session";
import { currentDiagram } from "@/workspace/backend";
import {
  buildPreviewHtml,
  loadConfluenceConfig,
  publishToConfluence,
  saveConfluenceConfig,
  type ConfluenceConfig,
} from "@/workspace/confluence";
import { isTauri } from "@/workspace/tauri";

type Status = { kind: "idle" | "busy" | "ok" | "err"; msg?: string; url?: string };

export function ConfluenceDialog() {
  const open = useApp((s) => s.confluenceOpen);
  const setOpen = useApp((s) => s.setConfluenceOpen);
  const engine = useApp((s) => s.engine);

  const [cfg, setCfg] = useState<ConfluenceConfig>(() => loadConfluenceConfig());
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [showPreview, setShowPreview] = useState(false);

  const previewHtml = useMemo(() => {
    if (!open || !showPreview) return "";
    try {
      return buildPreviewHtml(doc.allNodes(), doc.allEdges(), "diagram.png");
    } catch {
      return "";
    }
  }, [open, showPreview]);

  if (!open) return null;

  const set = (patch: Partial<ConfluenceConfig>) => {
    const next = { ...cfg, ...patch };
    setCfg(next);
    saveConfluenceConfig(next);
  };

  const publish = async () => {
    if (!engine) return;
    setStatus({ kind: "busy", msg: "Rendering diagram…" });
    try {
      const blob = await engine.exportImage("png", 2);
      if (!blob) throw new Error("Could not render the diagram image.");
      const png = new Uint8Array(await blob.arrayBuffer());
      setStatus({ kind: "busy", msg: "Publishing to Confluence…" });
      const res = await publishToConfluence(cfg, {
        title: doc.title(),
        diagramId: currentDiagram() || doc.title(),
        nodes: doc.allNodes(),
        edges: doc.allEdges(),
        png,
      });
      setStatus({
        kind: "ok",
        msg: res.created ? "Page created." : "Page updated.",
        url: res.url,
      });
    } catch (e) {
      setStatus({ kind: "err", msg: e instanceof Error ? e.message : String(e) });
    }
  };

  const field = (label: string, node: React.ReactNode) => (
    <label className="cf-field">
      <span>{label}</span>
      {node}
    </label>
  );

  return (
    <>
      <div className="ins-scrim" onClick={() => setOpen(false)} />
      <div className="cf-dialog">
        <div className="cf-head">
          <strong>Publish to Confluence</strong>
          <button className="ai-x" onClick={() => setOpen(false)} title="Close">
            ✕
          </button>
        </div>

        {!isTauri && (
          <div className="cf-note cf-warn">Publishing is only available in the desktop app.</div>
        )}

        <div className="cf-body">
          {field(
            "Base URL",
            <input
              className="sb-edit"
              placeholder="https://your-org.atlassian.net/wiki"
              value={cfg.baseUrl}
              onChange={(e) => set({ baseUrl: e.target.value })}
              onKeyDown={(e) => e.stopPropagation()}
            />,
          )}

          {field(
            "Authentication",
            <div className="shape-row">
              <button
                className={`shape-btn ${cfg.authType === "basic" ? "active" : ""}`}
                onClick={() => set({ authType: "basic" })}
              >
                Cloud (email + token)
              </button>
              <button
                className={`shape-btn ${cfg.authType === "bearer" ? "active" : ""}`}
                onClick={() => set({ authType: "bearer" })}
              >
                Server / DC (token)
              </button>
            </div>,
          )}

          {cfg.authType === "basic" &&
            field(
              "Atlassian email",
              <input
                className="sb-edit"
                placeholder="you@your-org.com"
                value={cfg.email}
                onChange={(e) => set({ email: e.target.value })}
                onKeyDown={(e) => e.stopPropagation()}
              />,
            )}

          {field(
            cfg.authType === "basic" ? "API token" : "Personal access token",
            <input
              className="sb-edit"
              type="password"
              placeholder="Paste your token"
              value={cfg.token}
              onChange={(e) => set({ token: e.target.value })}
              onKeyDown={(e) => e.stopPropagation()}
            />,
          )}

          <div className="cf-row">
            {field(
              "Space key",
              <input
                className="sb-edit"
                placeholder="ENG"
                value={cfg.spaceKey}
                onChange={(e) => set({ spaceKey: e.target.value })}
                onKeyDown={(e) => e.stopPropagation()}
              />,
            )}
            {field(
              "Parent page id (optional)",
              <input
                className="sb-edit"
                placeholder="e.g. 123456"
                value={cfg.parentPageId}
                onChange={(e) => set({ parentPageId: e.target.value })}
                onKeyDown={(e) => e.stopPropagation()}
              />,
            )}
          </div>

          <div className="cf-note">
            First publish creates a page in that space; later ones update the same page.
            Your token is stored locally, like your AI key.
          </div>

          <button className="cf-link-btn" onClick={() => setShowPreview((v) => !v)}>
            {showPreview ? "▾ Hide page preview" : "▸ Preview page content"}
          </button>
          {showPreview && (
            <div className="cf-preview" dangerouslySetInnerHTML={{ __html: previewHtml }} />
          )}
        </div>

        <div className="cf-foot">
          {status.kind === "ok" && status.url ? (
            <span className="cf-ok">
              {status.msg}{" "}
              <a href={status.url} target="_blank" rel="noreferrer">
                Open page ↗
              </a>
            </span>
          ) : status.kind === "err" ? (
            <span className="cf-err">{status.msg}</span>
          ) : (
            <span className="cf-status">{status.msg ?? ""}</span>
          )}
          <button
            className="cf-publish"
            disabled={status.kind === "busy" || !isTauri}
            onClick={() => void publish()}
          >
            {status.kind === "busy" ? "Publishing…" : "Publish"}
          </button>
        </div>
      </div>
    </>
  );
}
