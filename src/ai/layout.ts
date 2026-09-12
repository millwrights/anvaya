// Layered graph layout for generated diagrams. Breaks cycles, ranks nodes into
// top-down layers, reduces crossings (barycenter), and packs each layer by real
// box sizes — so children sit under their parents and connectors have clear
// channels. Kept in sync with mcp/anvaya.mjs. Callers route adjacent-forward
// edges in-channel and everything else through a side gutter.

export const H_GAP = 100; // gap between boxes within a layer
export const V_GAP = 140; // gap between layers

export const edgeKey = (from: string, to: string) => `${from} ${to}`;

type Size = (id: string) => { w: number; h: number };
interface Edge {
  from: string;
  to: string;
}

/** Longest-path layering (expects a DAG — call after removing back-edges). */
function layers(ids: string[], edges: Edge[]): Map<string, number> {
  const succ = new Map<string, string[]>(ids.map((id) => [id, []]));
  const indeg = new Map<string, number>(ids.map((id) => [id, 0]));
  for (const e of edges) {
    if (!succ.has(e.from) || !indeg.has(e.to)) continue;
    succ.get(e.from)!.push(e.to);
    indeg.set(e.to, indeg.get(e.to)! + 1);
  }
  const depth = new Map(ids.map((id) => [id, 0]));
  const left = new Map(indeg);
  const q = ids.filter((id) => left.get(id) === 0);
  while (q.length) {
    const u = q.shift()!;
    for (const v of succ.get(u)!) {
      depth.set(v, Math.max(depth.get(v)!, depth.get(u)! + 1));
      left.set(v, left.get(v)! - 1);
      if (left.get(v) === 0) q.push(v);
    }
  }
  return depth;
}

/** Back-edges (pointing to an ancestor) via iterative DFS, so cycles can layer. */
export function backEdges(ids: string[], edges: Edge[]): Set<string> {
  const adj = new Map<string, string[]>(ids.map((id) => [id, []]));
  for (const e of edges) if (adj.has(e.from) && adj.has(e.to)) adj.get(e.from)!.push(e.to);
  const state = new Map<string, number>(ids.map((id) => [id, 0])); // 0 unseen, 1 on-stack, 2 done
  const back = new Set<string>();
  for (const start of ids) {
    if (state.get(start) !== 0) continue;
    const stack: [string, number][] = [[start, 0]];
    state.set(start, 1);
    while (stack.length) {
      const frame = stack[stack.length - 1];
      const [u, i] = frame;
      const nbrs = adj.get(u)!;
      if (i < nbrs.length) {
        frame[1]++;
        const v = nbrs[i];
        const s = state.get(v);
        if (s === 1) back.add(edgeKey(u, v));
        else if (s === 0) {
          state.set(v, 1);
          stack.push([v, 0]);
        }
      } else {
        state.set(u, 2);
        stack.pop();
      }
    }
  }
  return back;
}

export interface Layout {
  depth: Map<string, number>;
  pos: Map<string, { x: number; y: number }>;
  bbox: { minX: number; maxX: number; minY: number; maxY: number };
}

/** Position nodes as centers around (0,0). `edges` should be the forward (DAG) edges. */
export function layoutGraph(ids: string[], edges: Edge[], size: Size): Layout {
  const depth = layers(ids, edges);
  const maxD = Math.max(0, ...ids.map((id) => depth.get(id) ?? 0));
  const layerArr: string[][] = Array.from({ length: maxD + 1 }, () => []);
  for (const id of ids) layerArr[depth.get(id) ?? 0].push(id);

  const pred = new Map<string, string[]>(ids.map((id) => [id, []]));
  const succ = new Map<string, string[]>(ids.map((id) => [id, []]));
  for (const e of edges) {
    if (succ.has(e.from) && pred.has(e.to)) {
      succ.get(e.from)!.push(e.to);
      pred.get(e.to)!.push(e.from);
    }
  }

  const idx = new Map<string, number>();
  const reindex = () => layerArr.forEach((layer) => layer.forEach((id, i) => idx.set(id, i)));
  reindex();
  for (let iter = 0; iter < 6; iter++) {
    const down = iter % 2 === 0;
    const order = down ? [...layerArr.keys()] : [...layerArr.keys()].reverse();
    for (const d of order) {
      const neigh = down ? pred : succ;
      const bc = new Map<string, number>();
      layerArr[d].forEach((id, i) => {
        const vs = neigh.get(id)!.map((n) => idx.get(n)).filter((v): v is number => v != null);
        bc.set(id, vs.length ? vs.reduce((a, b) => a + b, 0) / vs.length : i);
      });
      layerArr[d].sort((a, b) => bc.get(a)! - bc.get(b)!);
      layerArr[d].forEach((id, i) => idx.set(id, i));
    }
  }

  const rowH = layerArr.map((layer) => Math.max(0, ...layer.map((id) => size(id).h)));
  const totalH = rowH.reduce((a, b) => a + b, 0) + V_GAP * (layerArr.length - 1);
  const pos = new Map<string, { x: number; y: number }>();
  let y = -totalH / 2;
  for (let d = 0; d < layerArr.length; d++) {
    const rowW = layerArr[d].reduce((s, id) => s + size(id).w, 0) + H_GAP * (layerArr[d].length - 1);
    let x = -rowW / 2;
    for (const id of layerArr[d]) {
      const w = size(id).w;
      pos.set(id, { x: x + w / 2, y: y + rowH[d] / 2 });
      x += w + H_GAP;
    }
    y += rowH[d] + V_GAP;
  }

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const id of ids) {
    const p = pos.get(id)!;
    const { w, h } = size(id);
    minX = Math.min(minX, p.x - w / 2);
    maxX = Math.max(maxX, p.x + w / 2);
    minY = Math.min(minY, p.y - h / 2);
    maxY = Math.max(maxY, p.y + h / 2);
  }
  return { depth, pos, bbox: { minX, maxX, minY, maxY } };
}
