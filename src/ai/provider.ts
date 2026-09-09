// Provider-agnostic chat call. Two request/response shapes cover the market:
//   • "openai"    — /chat/completions (OpenAI, OpenRouter, Groq, Ollama, LM Studio…)
//   • "anthropic" — /messages (Claude)
// The request goes through the native layer (no CORS, key stays off the web
// storage) when running in the desktop app, and falls back to a direct fetch in
// the browser build.

import { isTauri, native } from "@/workspace/tauri";
import type { AiConfig } from "./config";

async function post(url: string, headers: Record<string, string>, body: unknown): Promise<string> {
  const payload = JSON.stringify(body);
  if (isTauri) return native.aiComplete(url, headers, payload);
  // Browser fallback — subject to the provider's CORS policy.
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: payload,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text}`);
  return text;
}

/** Send a system+user prompt to the configured model; return its raw text. */
export async function chat(cfg: AiConfig, system: string, user: string): Promise<string> {
  const base = cfg.baseUrl.replace(/\/+$/, "");

  if (cfg.provider === "anthropic") {
    const headers: Record<string, string> = {
      "x-api-key": cfg.apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    };
    const body = {
      model: cfg.model,
      max_tokens: 4096,
      system,
      messages: [{ role: "user", content: user }],
    };
    const raw = await post(`${base}/messages`, headers, body);
    const json = JSON.parse(raw);
    const text = json?.content?.map((c: { text?: string }) => c.text ?? "").join("") ?? "";
    if (!text) throw new Error("The model returned an empty response.");
    return text;
  }

  // OpenAI-compatible
  const headers: Record<string, string> = {};
  if (cfg.apiKey) headers.authorization = `Bearer ${cfg.apiKey}`;
  const body = {
    model: cfg.model,
    temperature: 0.2,
    stream: false,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  };
  const raw = await post(`${base}/chat/completions`, headers, body);
  const json = JSON.parse(raw);
  const text = json?.choices?.[0]?.message?.content ?? "";
  if (!text) throw new Error("The model returned an empty response.");
  return text;
}
