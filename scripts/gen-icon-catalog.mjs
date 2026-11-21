// Generate mcp/icons.json — the icon catalog the MCP server uses to turn an
// `icon` key on a node into a native icon shape (glyph + caption). Mirrors the
// app's ALL_ICONS, assembled from the same three sources so the two never drift.
//
//   line icons     ← src/document/line-icons.json  (Feather, MIT)
//   brand logos    ← src/document/brand-icons.ts   (simple-icons, CC0)
//   architecture   ← src/document/arch-icons.ts    (SVG Logos CC0 / Carbon Apache-2.0 / Devicon MIT)
//
// Run: node scripts/gen-icon-catalog.mjs
import { readFileSync, writeFileSync } from "node:fs";

const root = new URL("..", import.meta.url);
const read = (p) => readFileSync(new URL(p, root), "utf8");

// Wrappers must match src/document/icons.ts exactly.
const iconSvg = (body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 24 24" ` +
  `fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">` +
  body +
  `</svg>`;
const brandSvg = (path) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 24 24">` +
  `<path fill="currentColor" d="${path}"/></svg>`;

/** Extract a `export const NAME: T[] = [...]` JSON array literal from a generated .ts file. */
function parseTsArray(src, name) {
  const m = src.match(new RegExp(`export const ${name}[^=]*=\\s*(\\[[\\s\\S]*\\]);`));
  if (!m) throw new Error(`could not find ${name} array`);
  return JSON.parse(m[1]);
}

const lineIcons = JSON.parse(read("src/document/line-icons.json"));
const brandIcons = parseTsArray(read("src/document/brand-icons.ts"), "BRAND_ICONS");
const archIcons = parseTsArray(read("src/document/arch-icons.ts"), "ARCH_ICONS");

const out = [];
const seen = new Set();
const add = (icon) => {
  if (seen.has(icon.key)) return;
  seen.add(icon.key);
  out.push(icon);
};

for (const i of lineIcons)
  add({ key: i.key, name: i.name, cat: i.cat, mono: true, tint: "#e8ebf0", svg: iconSvg(i.body) });
for (const b of brandIcons)
  add({ key: b.key, name: b.name, cat: b.cat, mono: true, tint: `#${b.hex}`, svg: brandSvg(b.path) });
for (const a of archIcons)
  add({ key: a.key, name: a.name, cat: a.cat, mono: a.mono, tint: a.mono ? "#e8ebf0" : "", svg: a.svg });

writeFileSync(new URL("mcp/icons.json", root), JSON.stringify(out) + "\n");
const cats = [...new Set(out.map((i) => i.cat))];
console.error(`wrote ${out.length} icons across ${cats.length} categories → mcp/icons.json`);
