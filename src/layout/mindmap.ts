import type { SceneNode } from "@/document/types";

// Layout engines are PURE functions: (nodes, params) -> positions.
// This is the core "layout-as-behavior" idea: a mind map is just a subtree with
// a layout attached. The engine computes positions; the command layer writes
// them back into the CRDT. Adding "org chart", "timeline", etc. later = adding
// another function here — no new editor.

export interface PositionPatch {
  id: string;
  x: number;
  y: number;
}

interface TreeParams {
  hGap: number; // horizontal gap between depth levels
  vGap: number; // vertical gap between sibling subtrees
}

const DEFAULTS: TreeParams = { hGap: 70, vGap: 24 };

/**
 * Classic right-growing mind-map tree. Root stays put; descendants are placed
 * to its right, vertically centered on their subtrees.
 */
export function layoutMindmapRight(
  root: SceneNode,
  childrenOf: (id: string) => SceneNode[],
  params: Partial<TreeParams> = {},
): PositionPatch[] {
  const p = { ...DEFAULTS, ...params };
  const patches: PositionPatch[] = [];

  // First pass: compute the vertical extent (height) of each subtree.
  const heightCache = new Map<string, number>();
  const subtreeHeight = (node: SceneNode): number => {
    const kids = childrenOf(node.id);
    if (kids.length === 0) {
      heightCache.set(node.id, node.h);
      return node.h;
    }
    let total = 0;
    for (const k of kids) total += subtreeHeight(k);
    total += p.vGap * (kids.length - 1);
    const h = Math.max(node.h, total);
    heightCache.set(node.id, h);
    return h;
  };
  subtreeHeight(root);

  // Second pass: place. Each subtree gets a vertical band; center the node in it.
  const place = (node: SceneNode, left: number, bandTop: number) => {
    const band = heightCache.get(node.id) ?? node.h;
    const cy = bandTop + band / 2;
    patches.push({ id: node.id, x: left, y: cy - node.h / 2 });

    const kids = childrenOf(node.id);
    if (kids.length === 0) return;
    const childLeft = left + node.w + p.hGap;
    let cursor = bandTop;
    for (const k of kids) {
      const kh = heightCache.get(k.id) ?? k.h;
      place(k, childLeft, cursor);
      cursor += kh + p.vGap;
    }
  };

  const totalH = heightCache.get(root.id) ?? root.h;
  place(root, root.x, root.y + root.h / 2 - totalH / 2);
  // Pin the root exactly where the user left it.
  patches[0] = { id: root.id, x: root.x, y: root.y };
  return patches;
}
