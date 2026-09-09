import { useEffect, useRef, useState } from "react";
import { useApp } from "@/app/store";
import { AI_PRESETS, aiConfigured, loadAiConfig, saveAiConfig, type AiConfig } from "@/ai/config";
import { generateDiagram } from "@/ai/diagram";

const EXAMPLES = [
  "User login flow with 2FA and error handling",
  "Mind map of a product launch plan",
  "CI/CD pipeline from commit to production",
  "Org chart for a 20-person startup",
];

export function AiPanel() {
  const open = useApp((s) => s.aiOpen);
  const setOpen = useApp((s) => s.setAiOpen);
  const engine = useApp((s) => s.engine);

  const [cfg, setCfg] = useState<AiConfig>(loadAiConfig);
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const promptRef = useRef<HTMLTextAreaElement>(null);

  const configured = aiConfigured(cfg);

  useEffect(() => {
    if (open) {
      setError(null);
      setStatus(null);
      setShowSettings(!aiConfigured(cfg));
      setTimeout(() => promptRef.current?.focus(), 30);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null;

  const update = (patch: Partial<AiConfig>) => {
    const next = { ...cfg, ...patch };
    setCfg(next);
    saveAiConfig(next);
  };

  const run = async () => {
    if (!engine || !prompt.trim() || busy) return;
    if (!configured) {
      setShowSettings(true);
      setError("Add your model settings first.");
      return;
    }
    setBusy(true);
    setError(null);
    setStatus("Asking the model…");
    try {
      const r = await generateDiagram(cfg, engine, prompt.trim());
      setStatus(`Built “${r.title ?? "diagram"}” — ${r.nodeCount} shapes, ${r.edgeCount} links.`);
      setPrompt("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ai-scrim" onPointerDown={() => !busy && setOpen(false)}>
      <div className="ai-panel" onPointerDown={(e) => e.stopPropagation()}>
        <div className="ai-head">
          <strong>✨ Generate with AI</strong>
          <button className="ai-x" title="Close" onClick={() => setOpen(false)}>
            ✕
          </button>
        </div>

        <textarea
          ref={promptRef}
          className="ai-prompt"
          placeholder="Describe a diagram to create…"
          value={prompt}
          rows={3}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              run();
            }
            e.stopPropagation();
          }}
        />

        <div className="ai-examples">
          {EXAMPLES.map((ex) => (
            <button key={ex} className="ai-chip" onClick={() => setPrompt(ex)} disabled={busy}>
              {ex}
            </button>
          ))}
        </div>

        <div className="ai-actions">
          <button className="ai-gear" onClick={() => setShowSettings((v) => !v)}>
            ⚙ {cfg.model || "Configure model"}
          </button>
          <button className="ai-go" onClick={run} disabled={busy || !prompt.trim()}>
            {busy ? "Generating…" : "Generate"}
            {!busy && <kbd>⌘↵</kbd>}
          </button>
        </div>

        {error && <div className="ai-msg ai-err">{error}</div>}
        {status && !error && <div className="ai-msg ai-ok">{status}</div>}

        {showSettings && (
          <div className="ai-settings">
            <div className="ai-presets">
              {AI_PRESETS.map((p) => (
                <button
                  key={p.label}
                  className="ai-chip"
                  title={p.hint}
                  onClick={() => update({ ...p.cfg })}
                >
                  {p.label}
                </button>
              ))}
            </div>

            <label className="ai-field">
              <span>Provider API</span>
              <select
                value={cfg.provider}
                onChange={(e) => update({ provider: e.target.value as AiConfig["provider"] })}
              >
                <option value="openai">OpenAI-compatible</option>
                <option value="anthropic">Anthropic</option>
              </select>
            </label>

            <label className="ai-field">
              <span>Base URL</span>
              <input
                value={cfg.baseUrl}
                spellCheck={false}
                onChange={(e) => update({ baseUrl: e.target.value })}
                placeholder="https://api.openai.com/v1"
              />
            </label>

            <label className="ai-field">
              <span>Model</span>
              <input
                value={cfg.model}
                spellCheck={false}
                onChange={(e) => update({ model: e.target.value })}
                placeholder="gpt-4o-mini"
              />
            </label>

            <label className="ai-field">
              <span>API key</span>
              <input
                type="password"
                value={cfg.apiKey}
                spellCheck={false}
                onChange={(e) => update({ apiKey: e.target.value })}
                placeholder="Blank for local models"
              />
            </label>
            <p className="ai-note">
              Stored locally on this machine. Sent only to the endpoint above.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
