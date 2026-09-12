// Mermaid flowchart → Anvaya {title, nodes, edges} spec. Covers the common
// flowchart subset (graph/flowchart TD|LR, the standard node shapes, and
// --> / --- / -.-> / ==> edges with |labels| or inline labels). Kept in sync
// with mcp/mermaid.mjs. Unsupported lines are skipped, not fatal.

import type { NodeShape } from "@/document/types";

export interface MermaidSpec {
  title?: string;
  nodes: { id: string; label: string; shape: NodeShape }[];
  edges: { from: string; to: string; label: string }[];
}

function shapeFor(open: string | null): NodeShape {
  switch (open) {
    case "((": return "ellipse";
    case "([": return "rounded";
    case "[[": return "rect";
    case "[/":
    case "[\\": return "rounded";
    case "{{": return "diamond";
    case "{": return "diamond";
    case "(": return "rounded";
    case "[": return "rect";
    case ">": return "note";
    default: return "rounded";
  }
}

function strip(s: string | undefined): string {
  let t = (s ?? "").trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'")))
    t = t.slice(1, -1);
  return t.replace(/<br\s*\/?>/gi, "\n").replace(/&amp;/g, "&").trim();
}

const NODE_RE = new RegExp(
  "^([A-Za-z0-9_.-]+)" +
    "(?:" +
    "(\\(\\()(.*?)\\)\\)" +
    "|(\\(\\[)(.*?)\\]\\)" +
    "|(\\[\\[)(.*?)\\]\\]" +
    "|(\\[/)(.*?)/\\]" +
    "|(\\[\\\\)(.*?)\\\\\\]" +
    "|(\\{\\{)(.*?)\\}\\}" +
    "|(\\{)(.*?)\\}" +
    "|(\\()(.*?)\\)" +
    "|(\\[)(.*?)\\]" +
    "|(>)(.*?)\\]" +
    ")?",
);

function parseNodeToken(token: string, nodes: Map<string, MermaidSpec["nodes"][number]>): string | null {
  const m = NODE_RE.exec(token.trim());
  if (!m) return null;
  const id = m[1];
  let open: string | null = null;
  let text: string | null = null;
  for (let i = 2; i < m.length; i += 2) {
    if (m[i] != null) {
      open = m[i];
      text = m[i + 1];
      break;
    }
  }
  if (!nodes.has(id)) {
    nodes.set(id, { id, label: text != null ? strip(text) : id, shape: shapeFor(open) });
  } else if (text != null) {
    const n = nodes.get(id)!;
    n.label = strip(text);
    n.shape = shapeFor(open);
  }
  return id;
}

/** True if the text looks like a Mermaid flowchart (so we parse instead of prompting a model). */
export function looksLikeMermaid(text: string): boolean {
  return /^\s*(graph|flowchart)\s+(TD|TB|BT|LR|RL)\b/i.test(text) || /-->|-\.->|==>/.test(text);
}

export function parseMermaid(src: string): MermaidSpec {
  const nodes = new Map<string, MermaidSpec["nodes"][number]>();
  const edges: MermaidSpec["edges"] = [];
  let title: string | undefined;

  for (let line of String(src ?? "").split(/\r?\n/)) {
    line = line.replace(/%%.*$/, "").trim();
    if (!line) continue;
    if (/^title\s+/i.test(line)) {
      title = line.replace(/^title\s+/i, "").trim();
      continue;
    }
    if (
      /^(graph|flowchart)\b/i.test(line) ||
      /^(subgraph|end|style|classdef|linkstyle|click|direction|class)\b/i.test(line.toLowerCase())
    )
      continue;

    line = line
      .replace(/--\s*([^->|]+?)\s*-->/g, "-->|$1|")
      .replace(/--\s*([^->|]+?)\s*---/g, "---|$1|")
      .replace(/-\.\s*([^.>|]+?)\s*\.->/g, "-.->|$1|")
      .replace(/==\s*([^=>|]+?)\s*==>/g, "==>|$1|");

    const EDGE = /\s*(-{2,3}>|-{2,3}|-\.->|-\.-|={2,3}>|={2,3}|--[ox])\s*(?:\|([^|]*)\|)?\s*/g;
    const parts: ({ type: "node"; text: string } | { type: "edge"; label: string })[] = [];
    let lastIndex = 0;
    let mm: RegExpExecArray | null;
    while ((mm = EDGE.exec(line)) !== null) {
      parts.push({ type: "node", text: line.slice(lastIndex, mm.index) });
      parts.push({ type: "edge", label: mm[2] ? strip(mm[2]) : "" });
      lastIndex = EDGE.lastIndex;
    }
    parts.push({ type: "node", text: line.slice(lastIndex) });

    let prevId: string | null = null;
    let pendingLabel = "";
    for (const part of parts) {
      if (part.type === "node") {
        if (!part.text.trim()) {
          prevId = null;
          continue;
        }
        const id = parseNodeToken(part.text, nodes);
        if (id && prevId) edges.push({ from: prevId, to: id, label: pendingLabel });
        prevId = id;
        pendingLabel = "";
      } else {
        pendingLabel = part.label;
      }
    }
  }

  return { title, nodes: [...nodes.values()], edges };
}
