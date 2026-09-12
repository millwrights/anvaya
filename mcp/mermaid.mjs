// A small Mermaid flowchart parser → Anvaya's {title, nodes, edges} spec.
// Covers the common flowchart subset (graph/flowchart TD|LR, the standard node
// shapes, and --> / --- / -.-> / ==> edges with |labels| or inline labels).
// Unsupported lines are skipped rather than failing.

const SHAPE_FOR = (open) => {
  switch (open) {
    case "((": return "ellipse"; // ((circle))
    case "([": return "rounded"; // ([stadium])
    case "[[": return "rect"; // [[subroutine]]
    case "[/":
    case "[\\": return "rounded"; // [/parallelogram/]
    case "{{": return "diamond"; // {{hexagon}}
    case "{": return "diamond"; // {decision}
    case "(": return "rounded"; // (rounded)
    case "[": return "rect"; // [rectangle]
    case ">": return "note"; // >flag]
    default: return "rounded";
  }
};

const strip = (s) => {
  let t = (s ?? "").trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'")))
    t = t.slice(1, -1);
  return t.replace(/<br\s*\/?>/gi, "\n").replace(/&amp;/g, "&").trim();
};

// One node token: id plus an optional shape wrapper. Longest wrappers first.
const NODE_RE = new RegExp(
  "^([A-Za-z0-9_.-]+)" +
    "(?:" +
    "(\\(\\()(.*?)\\)\\)" + // ((circle))
    "|(\\(\\[)(.*?)\\]\\)" + // ([stadium])
    "|(\\[\\[)(.*?)\\]\\]" + // [[subroutine]]
    "|(\\[/)(.*?)/\\]" + // [/parallelogram/]
    "|(\\[\\\\)(.*?)\\\\\\]" + // [\\parallelogram\\]
    "|(\\{\\{)(.*?)\\}\\}" + // {{hexagon}}
    "|(\\{)(.*?)\\}" + // {decision}
    "|(\\()(.*?)\\)" + // (rounded)
    "|(\\[)(.*?)\\]" + // [rectangle]
    "|(>)(.*?)\\]" + // >flag]
    ")?",
);

function parseNodeToken(token, nodes) {
  const m = NODE_RE.exec(token.trim());
  if (!m) return null;
  const id = m[1];
  let open = null;
  let text = null;
  for (let i = 2; i < m.length; i += 2) {
    if (m[i] != null) {
      open = m[i];
      text = m[i + 1];
      break;
    }
  }
  if (!nodes.has(id)) {
    nodes.set(id, { id, label: text != null ? strip(text) : id, shape: SHAPE_FOR(open) });
  } else if (text != null) {
    const n = nodes.get(id);
    n.label = strip(text);
    n.shape = SHAPE_FOR(open);
  }
  return id;
}

export function parseMermaid(src) {
  const nodes = new Map();
  const edges = [];
  let title;

  const raw = String(src ?? "").split(/\r?\n/);
  for (let line of raw) {
    line = line.replace(/%%.*$/, "").trim();
    if (!line) continue;
    const low = line.toLowerCase();
    if (/^title\s+/i.test(line)) {
      title = line.replace(/^title\s+/i, "").trim();
      continue;
    }
    if (
      /^(graph|flowchart)\b/i.test(line) ||
      /^(subgraph|end|style|classdef|linkstyle|click|direction|class)\b/i.test(low)
    )
      continue;

    // Normalise inline edge labels (A -- text --> B) into pipe form (A -->|text| B).
    line = line
      .replace(/--\s*([^->|]+?)\s*-->/g, "-->|$1|")
      .replace(/--\s*([^->|]+?)\s*---/g, "---|$1|")
      .replace(/-\.\s*([^.>|]+?)\s*\.->/g, "-.->|$1|")
      .replace(/==\s*([^=>|]+?)\s*==>/g, "==>|$1|");

    // Split the statement into node / edge / node ... keeping edge operators.
    const EDGE = /\s*(-{2,3}>|-{2,3}|-\.->|-\.-|={2,3}>|={2,3}|--[ox])\s*(?:\|([^|]*)\|)?\s*/g;
    const parts = [];
    let lastIndex = 0;
    let mm;
    while ((mm = EDGE.exec(line)) !== null) {
      parts.push({ type: "node", text: line.slice(lastIndex, mm.index) });
      parts.push({ type: "edge", label: mm[2] ? strip(mm[2]) : "" });
      lastIndex = EDGE.lastIndex;
    }
    parts.push({ type: "node", text: line.slice(lastIndex) });

    // Walk node,edge,node,edge,... turning each adjacent pair into an edge.
    let prevId = null;
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
