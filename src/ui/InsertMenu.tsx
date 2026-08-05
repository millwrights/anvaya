import { useState } from "react";
import { useApp } from "@/app/store";
import { commands } from "@/app/session";
import { TEMPLATES } from "@/app/templates";

const EMOJIS = [
  "✅", "❌", "⭐", "🔥", "💡", "⚠️", "📌", "🎯", "🚀", "❤️", "👍", "👎",
  "🙂", "😀", "🤔", "🎉", "📈", "📉", "🐛", "🔒", "🔑", "⏰", "💬", "📝",
];

export function InsertMenu() {
  const engine = useApp((s) => s.engine);
  const [open, setOpen] = useState<null | "tpl" | "emo">(null);
  if (!engine) return null;

  const placeEmoji = (emo: string) => {
    const vp = engine.viewportWorld();
    const n = commands.createShape("text", {
      x: vp.x + vp.w / 2 - 32,
      y: vp.y + vp.h / 2 - 32,
      w: 64,
      h: 64,
    });
    commands.updateNode(n.id, { text: emo, style: { fontSize: 52 } });
    engine.setSelection([n.id]);
    setOpen(null);
  };

  return (
    <div className="insert">
      <button
        className={`tb ${open === "tpl" ? "active" : ""}`}
        onClick={() => setOpen(open === "tpl" ? null : "tpl")}
      >
        Templates
      </button>
      <button
        className={`tb icon ${open === "emo" ? "active" : ""}`}
        title="Sticker / emoji"
        onClick={() => setOpen(open === "emo" ? null : "emo")}
      >
        ☺
      </button>

      {open && (
        <>
          <div className="ins-scrim" onClick={() => setOpen(null)} />
          {open === "tpl" ? (
            <div className="ins-pop">
              <div className="ins-head">Templates</div>
              {TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  className="ins-item"
                  onClick={() => {
                    t.apply(engine);
                    setOpen(null);
                  }}
                >
                  {t.name}
                </button>
              ))}
            </div>
          ) : (
            <div className="ins-pop emo">
              {EMOJIS.map((e) => (
                <button key={e} className="emo-btn" onClick={() => placeEmoji(e)}>
                  {e}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
