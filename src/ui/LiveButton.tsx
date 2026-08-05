import { useEffect, useState } from "react";
import {
  collabStatus,
  isOn,
  localUser,
  onCollabChange,
  peers,
  toggleCollab,
} from "@/app/collab";

// Toolbar control for real-time collaboration: toggles the session and shows
// presence (you + connected peers) with a connection indicator.
export function LiveButton() {
  const [, tick] = useState(0);
  useEffect(() => onCollabChange(() => tick((n) => n + 1)), []);

  const on = isOn();
  const st = collabStatus();
  const ps = on ? peers() : [];
  const you = localUser();

  return (
    <div className="live">
      {on && (
        <div className="avatars">
          <span className="avatar" style={{ background: you.color }} title={`${you.name} (you)`}>
            {you.name[0]}
          </span>
          {ps.map((p) => (
            <span key={p.clientId} className="avatar" style={{ background: p.color }} title={p.name}>
              {p.name[0]}
            </span>
          ))}
        </div>
      )}
      <button
        className={`tb ${on ? "active" : ""}`}
        onClick={() => toggleCollab()}
        title="Real-time collaboration"
      >
        <span className={`live-dot ${st}`} />
        {st === "live" ? "Live" : st === "connecting" ? "…" : "Share"}
      </button>
    </div>
  );
}
