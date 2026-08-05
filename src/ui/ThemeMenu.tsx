import { useState } from "react";
import { applyTheme, currentTheme, THEME_LIST, type ThemeKey } from "@/document/theme";

// Theme picker in the toolbar. Applies instantly and persists.
export function ThemeMenu() {
  const [open, setOpen] = useState(false);
  const [, force] = useState(0);
  const active = currentTheme();

  const pick = (key: ThemeKey) => {
    applyTheme(key);
    force((n) => n + 1);
    setOpen(false);
  };

  return (
    <div className="theme">
      <button
        className="tb icon"
        title="Theme"
        onClick={() => setOpen((o) => !o)}
      >
        ◐
      </button>
      {open && (
        <>
          <div className="ins-scrim" onClick={() => setOpen(false)} />
          <div className="ins-pop theme-pop">
            <div className="ins-head">Theme</div>
            {THEME_LIST.map((t) => (
              <button
                key={t.key}
                className={`ins-item ${active === t.key ? "on" : ""}`}
                onClick={() => pick(t.key as ThemeKey)}
              >
                <span className={`theme-dot ${t.key}`} />
                {t.name}
                {active === t.key && <span className="theme-check">✓</span>}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
