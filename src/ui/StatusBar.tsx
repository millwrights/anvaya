import { useEffect, useState } from "react";
import { useApp } from "@/app/store";
import { doc } from "@/app/session";
import { WorkspaceMenu } from "./WorkspaceMenu";

export function StatusBar() {
  const engine = useApp((s) => s.engine);
  const [stats, setStats] = useState({ nodes: 0, edges: 0, zoom: 1, sel: 0 });

  useEffect(() => {
    if (!engine) return;
    return engine.subscribe(() =>
      setStats({
        nodes: doc.allNodes().length,
        edges: doc.allEdges().length,
        zoom: engine.camera.zoom,
        sel: engine.getSelection().length,
      }),
    );
  }, [engine]);

  return (
    <div className="statusbar">
      <WorkspaceMenu />
      <span className="spacer" />
      {stats.sel > 0 && <span>{stats.sel} selected</span>}
      <span>
        {stats.nodes} nodes · {stats.edges} edges
      </span>
      <div className="zoomctl">
        <button className="zc-btn" title="Zoom out" onClick={() => engine?.zoomBy(1 / 1.2)}>
          −
        </button>
        <button
          className="zc-pct"
          title="Reset to 100%"
          onClick={() => engine?.zoomTo(1)}
        >
          {Math.round(stats.zoom * 100)}%
        </button>
        <button className="zc-btn" title="Zoom in" onClick={() => engine?.zoomBy(1.2)}>
          +
        </button>
        <button className="zc-btn zc-fit" title="Zoom to fit" onClick={() => engine?.zoomToFit()}>
          ⤢
        </button>
      </div>
    </div>
  );
}
