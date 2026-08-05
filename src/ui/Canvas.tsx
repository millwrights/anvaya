import { useEffect, useRef } from "react";
import { CanvasEngine } from "@/canvas/CanvasEngine";
import { commands, doc, initSession } from "@/app/session";
import { setCursor } from "@/app/collab";
import { useApp } from "@/app/store";
import { EditorOverlay } from "./EditorOverlay";
import { PresenceLayer } from "./PresenceLayer";

export function Canvas() {
  const hostRef = useRef<HTMLDivElement>(null);
  const setEngine = useApp((s) => s.setEngine);
  const engineRef = useRef<CanvasEngine | null>(null);
  const editRef = useRef<((id: string) => void) | null>(null);

  useEffect(() => {
    let disposed = false;
    let engine: CanvasEngine | null = null;

    (async () => {
      await initSession();
      if (disposed || !hostRef.current) return;
      engine = new CanvasEngine(hostRef.current, doc, commands);
      await engine.init();
      if (disposed) {
        engine.destroy();
        return;
      }
      engine.onEditRequest((id) => editRef.current?.(id));
      engine.onCursorMove((w) => setCursor(w.x, w.y));
      engineRef.current = engine;
      setEngine(engine);
      if (import.meta.env.DEV) {
        (window as unknown as { anvayaEngine?: CanvasEngine }).anvayaEngine = engine;
      }
    })();

    return () => {
      disposed = true;
      engine?.destroy();
      setEngine(null);
    };
  }, [setEngine]);

  return (
    <div className="stage-wrap">
      <div className="stage" ref={hostRef} />
      <PresenceLayer />
      <EditorOverlay
        getEngine={() => engineRef.current}
        registerOpen={(fn) => (editRef.current = fn)}
      />
    </div>
  );
}
