// AI connection settings — provider-agnostic, bring-your-own-key. Persisted
// locally; the key never leaves this machine except in the request to the
// endpoint the user configured.

export type AiProvider = "openai" | "anthropic";

export interface AiConfig {
  provider: AiProvider; // request/response shape to speak
  baseUrl: string; // e.g. https://api.openai.com/v1
  model: string; // e.g. gpt-4o-mini
  apiKey: string; // bearer / x-api-key (blank for keyless local servers)
}

/** One-click starting points. "OpenAI-compatible" covers most of the market. */
export const AI_PRESETS: { label: string; hint: string; cfg: Omit<AiConfig, "apiKey"> }[] = [
  {
    label: "OpenAI",
    hint: "gpt-4o-mini, etc. Needs an API key.",
    cfg: { provider: "openai", baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini" },
  },
  {
    label: "Anthropic",
    hint: "Claude models. Needs an API key.",
    cfg: { provider: "anthropic", baseUrl: "https://api.anthropic.com/v1", model: "claude-3-5-sonnet-latest" },
  },
  {
    label: "Ollama (local)",
    hint: "Runs on your machine, no key. Start Ollama first.",
    cfg: { provider: "openai", baseUrl: "http://localhost:11434/v1", model: "llama3.1" },
  },
  {
    label: "LM Studio (local)",
    hint: "Local server, no key. Start LM Studio first.",
    cfg: { provider: "openai", baseUrl: "http://localhost:1234/v1", model: "local-model" },
  },
  {
    label: "OpenRouter",
    hint: "Hundreds of models via one key.",
    cfg: { provider: "openai", baseUrl: "https://openrouter.ai/api/v1", model: "openai/gpt-4o-mini" },
  },
];

const DEFAULT: AiConfig = {
  provider: "openai",
  baseUrl: "https://api.openai.com/v1",
  model: "gpt-4o-mini",
  apiKey: "",
};

const KEY = "anvaya:ai:config";

export function loadAiConfig(): AiConfig {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULT, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return { ...DEFAULT };
}

export function saveAiConfig(cfg: AiConfig) {
  try {
    localStorage.setItem(KEY, JSON.stringify(cfg));
  } catch {
    /* ignore */
  }
}

export function aiConfigured(cfg: AiConfig): boolean {
  // Local servers are keyless; hosted providers need a key.
  const local = /localhost|127\.0\.0\.1/.test(cfg.baseUrl);
  return !!cfg.model && !!cfg.baseUrl && (local || !!cfg.apiKey);
}
