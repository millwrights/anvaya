import type { AnvayaDocument } from "@/document/types";

// Deterministic serialization → small, stable, git-friendly diffs.
// Keys are sorted and records are ordered by id so the same logical document
// always produces byte-identical JSON. This is what makes the on-disk `.anvaya`
// file diff cleanly in git even though the runtime store is a CRDT.

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value as object).sort()) {
      out[k] = sortKeys((value as Record<string, unknown>)[k]);
    }
    return out;
  }
  return value;
}

export function serializeDocument(doc: AnvayaDocument): string {
  const normalized: AnvayaDocument = {
    ...doc,
    nodes: [...doc.nodes].sort((a, b) => a.id.localeCompare(b.id)),
    edges: [...doc.edges].sort((a, b) => a.id.localeCompare(b.id)),
    layouts: [...doc.layouts].sort((a, b) => a.id.localeCompare(b.id)),
  };
  return JSON.stringify(sortKeys(normalized), null, 2) + "\n";
}

export function parseDocument(text: string): AnvayaDocument {
  const json = JSON.parse(text) as AnvayaDocument;
  if (!json.schema?.startsWith("anvaya/diagram@")) {
    throw new Error("Not an Anvaya diagram file");
  }
  return json;
}

/** Browser download of the current diagram as a `.anvaya` file. */
export function downloadDocument(doc: AnvayaDocument) {
  const blob = new Blob([serializeDocument(doc)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${slug(doc.title)}.anvaya`;
  a.click();
  URL.revokeObjectURL(url);
}

export function slug(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "diagram";
}

/** Trigger a browser download for an already-built Blob. */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
