import { useEffect, useRef, useState } from "react";
import { useApp } from "@/app/store";
import { doc } from "@/app/session";

const W = 190;
const H = 128;

// A live overview of the whole board with the current viewport outlined.
// Click or drag to jump the camera — essential once a board gets large.
export function Minimap() {
  const engine = useApp((s) => s.engine);
  const [, tick] = useState(0);
  const dragging = useRef(false);

  useEffect(() => {
    if (!engine) return;
    return engine.subscribe(() => tick((n) => n + 1));
  }, [engine]);

  if (!engine) return null;
  const b = engine.contentBounds();
  const vp = engine.viewportWorld();

  // Fit content + current viewport, with a little padding.
  let minX = vp.x, minY = vp.y, maxX = vp.x + vp.w, maxY = vp.y + vp.h;
  if (b) {
    minX = Math.min(minX, b.minX);
    minY = Math.min(minY, b.minY);
    maxX = Math.max(maxX, b.maxX);
    maxY = Math.max(maxY, b.maxY);
  }
  const pad = Math.max(40, (maxX - minX) * 0.06);
  minX -= pad; minY -= pad; maxX += pad; maxY += pad;

  const scale = Math.min(W / (maxX - minX), H / (maxY - minY));
  const sx = (x: number) => (x - minX) * scale;
  const sy = (y: number) => (y - minY) * scale;

  const jump = (clientX: number, clientY: number, el: SVGSVGElement) => {
    const r = el.getBoundingClientRect();
    const wx = (clientX - r.left) / scale + minX;
    const wy = (clientY - r.top) / scale + minY;
    engine.panTo(wx, wy);
  };

  return (
    <svg
      className="minimap"
      width={W}
      height={H}
      onPointerDown={(e) => {
        dragging.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
        jump(e.clientX, e.clientY, e.currentTarget);
      }}
      onPointerMove={(e) => {
        if (dragging.current) jump(e.clientX, e.clientY, e.currentTarget);
      }}
      onPointerUp={(e) => {
        dragging.current = false;
        try {
          e.currentTarget.releasePointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
      }}
    >
      {doc.allNodes().map((n) => (
        <rect
          key={n.id}
          x={sx(n.x)}
          y={sy(n.y)}
          width={Math.max(1, n.w * scale)}
          height={Math.max(1, n.h * scale)}
          rx={1}
          fill={n.shape === "sticky" ? "#f4d35e" : "#4b5772"}
        />
      ))}
      <rect
        x={sx(vp.x)}
        y={sy(vp.y)}
        width={vp.w * scale}
        height={vp.h * scale}
        fill="rgba(76,141,255,0.12)"
        stroke="#4c8dff"
        strokeWidth={1.5}
      />
    </svg>
  );
}
