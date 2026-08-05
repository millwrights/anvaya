import { useEffect, useState } from "react";
import { useApp } from "@/app/store";
import { onCollabChange, peers } from "@/app/collab";

// Renders remote collaborators' cursors as a DOM overlay over the canvas,
// positioned through the camera so they track pan/zoom.
export function PresenceLayer() {
  const engine = useApp((s) => s.engine);
  const [, tick] = useState(0);

  useEffect(() => {
    const u1 = onCollabChange(() => tick((n) => n + 1));
    const u2 = engine ? engine.subscribe(() => tick((n) => n + 1)) : () => {};
    return () => {
      u1();
      u2();
    };
  }, [engine]);

  if (!engine) return null;

  return (
    <div className="presence-layer">
      {peers()
        .filter((p) => p.cursor)
        .map((p) => {
          const s = engine.camera.worldToScreen(p.cursor!.x, p.cursor!.y);
          return (
            <div key={p.clientId} className="cursor" style={{ left: s.x, top: s.y }}>
              <svg width="20" height="20" viewBox="0 0 20 20">
                <path
                  d="M3 2 L3 16 L7 12 L10 18 L12.5 17 L9.5 11 L15 11 Z"
                  fill={p.color}
                  stroke="rgba(0,0,0,0.4)"
                  strokeWidth="0.6"
                />
              </svg>
              <span className="cursor-name" style={{ background: p.color }}>
                {p.name}
              </span>
            </div>
          );
        })}
    </div>
  );
}
