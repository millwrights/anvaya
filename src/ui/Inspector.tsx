import { useEffect, useState } from "react";
import { useApp } from "@/app/store";
import { commands, doc } from "@/app/session";
import type { EdgeRouting, NodeShape, SceneEdge } from "@/document/types";
import { INK_COLORS, INK_WIDTHS } from "@/canvas/CanvasEngine";
import { FONT_FAMILIES, resolveStyle } from "@/document/theme";

const SHAPES: { key: NodeShape; label: string }[] = [
  { key: "rounded", label: "Box" },
  { key: "ellipse", label: "Oval" },
  { key: "diamond", label: "Decision" },
  { key: "note", label: "Note" },
];

// Distinct, saturated fills that read clearly in both dark and light themes.
const FILLS = [
  "#2a2e38", "#4a90d9", "#4caf72", "#e0c04a",
  "#e08a3c", "#e0655f", "#a878e0", "#5a6070",
];
const STICKY_COLORS = ["#f4d35e", "#f6bd60", "#f28482", "#84a59d", "#8ecae6", "#cdb4db"];
const BORDER_COLORS = ["#5b8cff", "#3ecf8e", "#e0c04a", "#e08a3c", "#e0655f", "#a878e0", "#9298a5"];
const BORDER_WIDTHS = [
  { w: 1, l: "Thin" },
  { w: 2, l: "Med" },
  { w: 3.5, l: "Thick" },
];
const EDGE_COLORS = [
  "#aab0c0", "#ffffff", "#111318", "#5b8cff", "#3ecf8e",
  "#e0c04a", "#e08a3c", "#e0655f", "#a878e0",
];
const WIDTH_LABELS = ["S", "M", "L"];
const TEXT_COLORS = ["#f4f5f7", "#111318", "#aab0c0", "#5b8cff", "#3ecf8e", "#e0655f", "#e0c04a"];
const ARROW_HEADS: { k: NonNullable<SceneEdge["arrowHead"]>; g: string; title: string }[] = [
  { k: "triangle", g: "▶", title: "Filled triangle" },
  { k: "open", g: "❯", title: "Open / sharp" },
  { k: "thin", g: "➤", title: "Thin" },
  { k: "diamond", g: "◆", title: "Diamond" },
  { k: "circle", g: "●", title: "Dot" },
];

/** Coerce any css color string to the `#rrggbb` a native color input needs. */
function toHex(c?: string): string {
  if (!c) return "#888888";
  if (/^#[0-9a-fA-F]{6}$/.test(c)) return c;
  if (/^#[0-9a-fA-F]{8}$/.test(c)) return c.slice(0, 7);
  if (/^#[0-9a-fA-F]{3}$/.test(c)) return `#${c[1]}${c[1]}${c[2]}${c[2]}${c[3]}${c[3]}`;
  return "#888888";
}

/** A rainbow swatch that opens the OS color wheel — pick any RGB color. */
function ColorPick({
  value,
  onPick,
  title = "Custom color…",
}: {
  value?: string;
  onPick: (c: string) => void;
  title?: string;
}) {
  return (
    <label className="swatch color-pick" title={title}>
      <input type="color" value={toHex(value)} onChange={(e) => onPick(e.target.value)} />
    </label>
  );
}

export function Inspector() {
  const engine = useApp((s) => s.engine);
  const [sel, setSel] = useState<string[]>([]);
  const [, bump] = useState(0);

  useEffect(() => {
    if (!engine) return;
    return engine.subscribe(() => {
      setSel(engine.getSelection());
      bump((n) => n + 1); // reflect tool / ink changes too
    });
  }, [engine]);

  if (!engine) return null;

  // Connector (edge) selected → show connector controls.
  const edgeId = engine.getEdgeSelection();
  if (sel.length === 0 && edgeId) {
    const e = doc.getEdge(edgeId);
    const routing = e?.routing ?? "curved";
    const width = e?.style?.width ?? 2;
    const arrowStart = e?.arrowStart ?? false;
    const arrowEnd = e?.arrowEnd ?? e?.kind === "flow";
    const routes: { k: EdgeRouting; label: string }[] = [
      { k: "straight", label: "Straight" },
      { k: "curved", label: "Curved" },
      { k: "step", label: "Step" },
    ];
    return (
      <div className="inspector">
        <h3>Connector</h3>

        <div className="field"><label>Line</label></div>
        <div className="shape-row" style={{ marginBottom: 10 }}>
          {routes.map((r) => (
            <button
              key={r.k}
              className={`shape-btn ${routing === r.k ? "active" : ""}`}
              onClick={() => commands.updateEdge(edgeId, { routing: r.k })}
            >
              {r.label}
            </button>
          ))}
        </div>

        <div className="field"><label>Ends</label></div>
        <div className="shape-row" style={{ marginBottom: 10 }}>
          <button
            className={`shape-btn ${arrowStart ? "active" : ""}`}
            onClick={() => commands.updateEdge(edgeId, { arrowStart: !arrowStart })}
          >
            ◄ Tail
          </button>
          <button
            className={`shape-btn ${arrowEnd ? "active" : ""}`}
            onClick={() => commands.updateEdge(edgeId, { arrowEnd: !arrowEnd })}
          >
            Head ►
          </button>
        </div>

        <div className="field"><label>Arrowhead</label></div>
        <div className="shape-row" style={{ marginBottom: 10 }}>
          {ARROW_HEADS.map((a) => (
            <button
              key={a.k}
              className={`shape-btn ${(e?.arrowHead ?? "triangle") === a.k ? "active" : ""}`}
              title={a.title}
              style={{ fontSize: 15 }}
              onClick={() => commands.updateEdge(edgeId, { arrowHead: a.k })}
            >
              {a.g}
            </button>
          ))}
        </div>

        <div className="field"><label>Size</label></div>
        <div className="shape-row" style={{ marginBottom: 10 }}>
          {[
            { w: 1.5, l: "S" },
            { w: 3, l: "M" },
            { w: 5, l: "L" },
          ].map((s) => (
            <button
              key={s.l}
              className={`shape-btn ${width === s.w ? "active" : ""}`}
              onClick={() => commands.updateEdge(edgeId, { style: { ...e?.style, width: s.w } })}
            >
              {s.l}
            </button>
          ))}
        </div>

        <div className="field"><label>Color</label></div>
        <div className="swatches" style={{ marginBottom: 10 }}>
          {EDGE_COLORS.map((c) => (
            <div
              key={c}
              className={`swatch ${(e?.style?.stroke ?? EDGE_COLORS[0]) === c ? "on" : ""}`}
              style={{ background: c }}
              onClick={() => commands.updateEdge(edgeId, { style: { ...e?.style, stroke: c } })}
            />
          ))}
          <ColorPick
            value={e?.style?.stroke ?? EDGE_COLORS[0]}
            onPick={(c) => commands.updateEdge(edgeId, { style: { ...e?.style, stroke: c } })}
            title="Custom arrow color…"
          />
        </div>

        <div className="field"><label>Label</label></div>
        <input
          className="sb-edit"
          style={{ marginBottom: 10 }}
          placeholder="Text on the line…"
          value={e?.label ?? ""}
          onChange={(ev) => commands.updateEdge(edgeId, { label: ev.target.value })}
          onKeyDown={(ev) => ev.stopPropagation()}
        />

        <div className="ins-hint">
          Drag a dot on the line to add a bend · double-click a bend to remove.
        </div>
        <div className="field"><label>Layer</label></div>
        <div className="shape-row" style={{ marginBottom: 6 }}>
          <button
            className="shape-btn"
            style={{ flex: 1 }}
            title="Bring to front — above objects"
            onClick={() => commands.bringToFront([edgeId])}
          >
            ⤒ To front
          </button>
          <button
            className="shape-btn"
            style={{ flex: 1 }}
            title="Bring forward one layer"
            onClick={() => commands.bringForward([edgeId])}
          >
            ↑ Forward
          </button>
        </div>
        <div className="shape-row" style={{ marginBottom: 6 }}>
          <button
            className="shape-btn"
            style={{ flex: 1 }}
            title="Send backward one layer"
            onClick={() => commands.sendBackward([edgeId])}
          >
            ↓ Backward
          </button>
          <button
            className="shape-btn"
            style={{ flex: 1 }}
            title="Send to back — behind objects"
            onClick={() => commands.sendToBack([edgeId])}
          >
            ⤓ To back
          </button>
        </div>
        <div className="shape-row" style={{ marginBottom: 6 }}>
          <button
            className="shape-btn"
            disabled={!e?.waypoints?.length}
            onClick={() => commands.setWaypoints(edgeId, [])}
          >
            Clear bends
          </button>
        </div>
        <div className="shape-row">
          <button
            className="shape-btn"
            style={{ flex: 1, color: "#ff9a9a" }}
            onClick={() => {
              commands.deleteEdge(edgeId);
              engine.setEdgeSelection(null);
            }}
          >
            Delete
          </button>
        </div>
      </div>
    );
  }

  const single = sel.length === 1 ? doc.getNode(sel[0]) : undefined;
  const strokeNode = single?.shape === "draw" ? single : undefined;
  const penMode = engine.tool === "pen";

  // Style controls apply to ALL selected (non-freehand) nodes; `ref` shows the
  // currently-active values.
  const nodeSel = sel
    .map((id) => doc.getNode(id))
    .filter((n): n is NonNullable<typeof n> => !!n && n.shape !== "draw");
  const nodeIds = nodeSel.map((n) => n.id);
  const ref = nodeSel[0];

  // Nothing to show unless there's a selection or the pen tool is active.
  if (sel.length === 0 && !penMode) return null;

  // Current ink: from the selected stroke, else the pen's live ink.
  const ink = engine.getInk();
  const curColor = strokeNode?.style.stroke ?? ink.color;
  const curWidth = strokeNode?.style.strokeWidth ?? ink.width;

  const applyInk = (color?: string, width?: number) => {
    if (strokeNode) {
      const style = { ...strokeNode.style };
      if (color != null) style.stroke = color;
      if (width != null) style.strokeWidth = width;
      commands.updateNode(strokeNode.id, { style });
    }
    engine.setInk(color ?? ink.color, width ?? ink.width);
  };

  const showStroke = penMode || !!strokeNode;
  const showNodeProps = !!ref && !strokeNode;

  return (
    <div className="inspector">
      <h3>
        {strokeNode
          ? "Stroke"
          : penMode && sel.length === 0
            ? "Pen"
            : sel.length > 1
              ? `${sel.length} selected`
              : "Node"}
      </h3>

      {showStroke && (
        <>
          <div className="field">
            <label>Color</label>
          </div>
          <div className="swatches" style={{ marginBottom: 12 }}>
            {INK_COLORS.map((c) => (
              <div
                key={c}
                className={`swatch ${curColor === c ? "on" : ""}`}
                style={{ background: c }}
                onClick={() => applyInk(c, undefined)}
              />
            ))}
            <ColorPick value={curColor} onPick={(c) => applyInk(c, undefined)} title="Custom pen color…" />
          </div>

          <div className="field">
            <label>Width</label>
          </div>
          <div className="shape-row" style={{ marginBottom: showNodeProps ? 12 : 0 }}>
            {INK_WIDTHS.map((w, i) => (
              <button
                key={w}
                className={`shape-btn ${curWidth === w ? "active" : ""}`}
                onClick={() => applyInk(undefined, w)}
              >
                {WIDTH_LABELS[i]}
              </button>
            ))}
          </div>
        </>
      )}

      {showNodeProps && (
        <>
          <div className="field">
            <label>Shape</label>
          </div>
          <div className="shape-row" style={{ marginBottom: 12 }}>
            {SHAPES.map((s) => (
              <button
                key={s.key}
                className={`shape-btn ${ref!.shape === s.key ? "active" : ""}`}
                onClick={() => commands.updateNodes(nodeIds, { shape: s.key })}
              >
                {s.label}
              </button>
            ))}
          </div>

          <div className="field">
            <label>Fill</label>
          </div>
          <div className="swatches" style={{ marginBottom: 12 }}>
            {(ref!.shape === "sticky" ? STICKY_COLORS : FILLS).map((c) => (
              <div
                key={c}
                className={`swatch ${ref!.style.fill === c ? "on" : ""}`}
                style={{ background: c }}
                onClick={() => commands.updateNodesStyle(nodeIds, { fill: c })}
              />
            ))}
            <ColorPick
              value={ref!.style.fill}
              onPick={(c) => commands.updateNodesStyle(nodeIds, { fill: c })}
              title="Custom fill color…"
            />
          </div>

          <div className="field">
            <label>Border</label>
          </div>
          <div className="swatches" style={{ marginBottom: 8 }}>
            <div
              className={`swatch none ${!ref!.style.strokeWidth ? "on" : ""}`}
              title="No border"
              onClick={() => commands.updateNodesStyle(nodeIds, { strokeWidth: 0 })}
            />
            {BORDER_COLORS.map((c) => (
              <div
                key={c}
                className={`swatch ${ref!.style.stroke === c && ref!.style.strokeWidth ? "on" : ""}`}
                style={{ background: c }}
                onClick={() =>
                  commands.updateNodesStyle(nodeIds, {
                    stroke: c,
                    strokeWidth: ref!.style.strokeWidth || 1.5,
                  })
                }
              />
            ))}
            <ColorPick
              value={ref!.style.stroke}
              onPick={(c) =>
                commands.updateNodesStyle(nodeIds, {
                  stroke: c,
                  strokeWidth: ref!.style.strokeWidth || 1.5,
                })
              }
              title="Custom border color…"
            />
          </div>
          <div className="shape-row" style={{ marginBottom: 12 }}>
            {BORDER_WIDTHS.map((b) => (
              <button
                key={b.l}
                className={`shape-btn ${ref!.style.strokeWidth === b.w ? "active" : ""}`}
                onClick={() =>
                  commands.updateNodesStyle(nodeIds, {
                    strokeWidth: b.w,
                    stroke: ref!.style.stroke || BORDER_COLORS[6],
                  })
                }
              >
                {b.l}
              </button>
            ))}
          </div>

          <div className="field">
            <label>Shadow</label>
            <button
              className={`toggle ${ref!.shadow !== false ? "on" : ""}`}
              onClick={() => commands.updateNodes(nodeIds, { shadow: ref!.shadow === false })}
            >
              {ref!.shadow !== false ? "On" : "Off"}
            </button>
          </div>

          {(() => {
            const rs = resolveStyle(ref!.shape, ref!.style);
            const align = ref!.style.align ?? "center";
            const size = Math.round(rs.fontSize);
            const setSize = (v: number) =>
              commands.updateNodesStyle(nodeIds, { fontSize: Math.max(8, Math.min(96, v)) });
            return (
              <>
                <div className="field">
                  <label>Text</label>
                </div>
                <div className="shape-row" style={{ marginBottom: 6 }}>
                  <select
                    className="font-select"
                    value={ref!.style.fontFamily ?? "sans"}
                    onChange={(ev) =>
                      commands.updateNodesStyle(nodeIds, { fontFamily: ev.target.value })
                    }
                  >
                    {[...FONT_FAMILIES]
                      .sort((a, b) => a.label.localeCompare(b.label))
                      .map((f) => (
                        <option key={f.key} value={f.key}>
                          {f.label}
                        </option>
                      ))}
                  </select>
                </div>
                <div className="shape-row" style={{ marginBottom: 6 }}>
                  <button
                    className={`shape-btn ${ref!.style.bold ? "active" : ""}`}
                    style={{ flex: 1, fontWeight: 700 }}
                    title="Bold"
                    onClick={() => commands.updateNodesStyle(nodeIds, { bold: !ref!.style.bold })}
                  >
                    B
                  </button>
                  <button
                    className={`shape-btn ${ref!.style.italic ? "active" : ""}`}
                    style={{ flex: 1, fontStyle: "italic" }}
                    title="Italic"
                    onClick={() => commands.updateNodesStyle(nodeIds, { italic: !ref!.style.italic })}
                  >
                    I
                  </button>
                  <button
                    className={`shape-btn ${ref!.style.underline ? "active" : ""}`}
                    style={{ flex: 1, textDecoration: "underline" }}
                    title="Underline"
                    onClick={() =>
                      commands.updateNodesStyle(nodeIds, { underline: !ref!.style.underline })
                    }
                  >
                    U
                  </button>
                  <button
                    className={`shape-btn ${ref!.style.strike ? "active" : ""}`}
                    style={{ flex: 1, textDecoration: "line-through" }}
                    title="Strikethrough"
                    onClick={() => commands.updateNodesStyle(nodeIds, { strike: !ref!.style.strike })}
                  >
                    S
                  </button>
                </div>
                <div className="shape-row" style={{ marginBottom: 6 }}>
                  <button className="shape-btn" title="Smaller" onClick={() => setSize(size - 1)}>
                    A−
                  </button>
                  <span className="size-val">{size}</span>
                  <button className="shape-btn" title="Larger" onClick={() => setSize(size + 1)}>
                    A+
                  </button>
                </div>
                <div className="shape-row" style={{ marginBottom: 12 }}>
                  <button
                    className={`shape-btn ${align === "left" ? "active" : ""}`}
                    style={{ flex: 1 }}
                    title="Align left"
                    onClick={() => commands.updateNodesStyle(nodeIds, { align: "left" })}
                  >
                    ⇤
                  </button>
                  <button
                    className={`shape-btn ${align === "center" ? "active" : ""}`}
                    style={{ flex: 1 }}
                    title="Align center"
                    onClick={() => commands.updateNodesStyle(nodeIds, { align: "center" })}
                  >
                    ≡
                  </button>
                  <button
                    className={`shape-btn ${align === "right" ? "active" : ""}`}
                    style={{ flex: 1 }}
                    title="Align right"
                    onClick={() => commands.updateNodesStyle(nodeIds, { align: "right" })}
                  >
                    ⇥
                  </button>
                </div>
                <div className="field">
                  <label>Text color</label>
                </div>
                <div className="swatches" style={{ marginBottom: 12 }}>
                  {TEXT_COLORS.map((c) => (
                    <div
                      key={c}
                      className={`swatch ${rs.textColor === c ? "on" : ""}`}
                      style={{ background: c }}
                      onClick={() => commands.updateNodesStyle(nodeIds, { textColor: c })}
                    />
                  ))}
                  <ColorPick
                    value={rs.textColor}
                    onPick={(c) => commands.updateNodesStyle(nodeIds, { textColor: c })}
                    title="Custom text color…"
                  />
                </div>
              </>
            );
          })()}

          {sel.length === 1 && (
            <div className="field">
              <label>Size</label>
              <span>
                {Math.round(ref!.w)} × {Math.round(ref!.h)}
              </span>
            </div>
          )}
        </>
      )}

      {sel.length >= 2 && (
        <>
          <div className="field">
            <label>Align</label>
          </div>
          <div className="align-grid" style={{ marginBottom: 6 }}>
            <button className="shape-btn" title="Align left" onClick={() => commands.alignNodes(sel, "left")}>⇤</button>
            <button className="shape-btn" title="Align center" onClick={() => commands.alignNodes(sel, "hcenter")}>⇔</button>
            <button className="shape-btn" title="Align right" onClick={() => commands.alignNodes(sel, "right")}>⇥</button>
            <button className="shape-btn" title="Align top" onClick={() => commands.alignNodes(sel, "top")}>⤒</button>
            <button className="shape-btn" title="Align middle" onClick={() => commands.alignNodes(sel, "vcenter")}>⇕</button>
            <button className="shape-btn" title="Align bottom" onClick={() => commands.alignNodes(sel, "bottom")}>⤓</button>
          </div>
          {sel.length >= 3 && (
            <div className="shape-row" style={{ marginBottom: 6 }}>
              <button className="shape-btn" onClick={() => commands.distributeNodes(sel, "h")}>
                Distribute H
              </button>
              <button className="shape-btn" onClick={() => commands.distributeNodes(sel, "v")}>
                Distribute V
              </button>
            </div>
          )}
        </>
      )}

      {(sel.length >= 2 || sel.some((id) => doc.getNode(id)?.groupId)) && (
        <div className="shape-row" style={{ marginBottom: 6 }}>
          {sel.length >= 2 && (
            <button className="shape-btn" onClick={() => commands.groupNodes(sel)}>
              Group
            </button>
          )}
          {sel.some((id) => doc.getNode(id)?.groupId) && (
            <button className="shape-btn" onClick={() => commands.ungroupNodes(sel)}>
              Ungroup
            </button>
          )}
        </div>
      )}

      {sel.length > 0 && (
        <>
          <div className="field">
            <label>Layer</label>
          </div>
          <div className="shape-row" style={{ marginBottom: 6 }}>
            <button
              className="shape-btn"
              style={{ flex: 1 }}
              title="Bring to front — full foreground"
              onClick={() => commands.bringToFront(sel)}
            >
              ⤒ To front
            </button>
            <button
              className="shape-btn"
              style={{ flex: 1 }}
              title="Bring forward one layer"
              onClick={() => commands.bringForward(sel)}
            >
              ↑ Forward
            </button>
          </div>
          <div className="shape-row" style={{ marginBottom: 6 }}>
            <button
              className="shape-btn"
              style={{ flex: 1 }}
              title="Send backward one layer"
              onClick={() => commands.sendBackward(sel)}
            >
              ↓ Backward
            </button>
            <button
              className="shape-btn"
              style={{ flex: 1 }}
              title="Send to back — full background"
              onClick={() => commands.sendToBack(sel)}
            >
              ⤓ To back
            </button>
          </div>
          <div className="shape-row" style={{ marginBottom: 6 }}>
            <button
              className="shape-btn"
              style={{ flex: 1 }}
              onClick={() => engine.setSelection(commands.duplicateNodes(sel))}
            >
              Duplicate
            </button>
          </div>
          <div className="shape-row" style={{ marginBottom: 6 }}>
            {(() => {
              const allLocked = sel.every((id) => doc.getNode(id)?.locked);
              return (
                <button
                  className="shape-btn"
                  style={{ flex: 1 }}
                  onClick={() => commands.setLocked(sel, !allLocked)}
                >
                  {allLocked ? "🔓 Unlock" : "🔒 Lock"}
                </button>
              );
            })()}
            <button
              className="shape-btn"
              style={{ flex: 1, color: "#ff9a9a" }}
              onClick={() => {
                commands.deleteNodes(sel);
                engine.setSelection([]);
              }}
            >
              Delete
            </button>
          </div>
        </>
      )}
    </div>
  );
}
