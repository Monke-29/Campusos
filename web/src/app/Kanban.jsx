import { useState } from "react";
import { api, LABEL, timeLeft } from "../lib/api.jsx";

const COLS = [
  ["open", "Open"],
  ["in_progress", "In progress"],
  ["escalated", "Escalated"],
  ["resolved", "Fixed"],
];

// Drag a card to move it. Open ⇄ In progress move directly; Escalated / Fixed go through their own checks.
export default function Kanban({ tickets, onOpen, toast }) {
  const [over, setOver] = useState(null);
  const [dragging, setDragging] = useState(null);

  async function drop(id, to) {
    setOver(null);
    const t = tickets.find((x) => x.id === id);
    if (!t || t.status === to) return;
    try {
      if (to === "open" || to === "in_progress") await api("/api/move", { ticketId: id, status: to });
      else if (to === "escalated") await api("/api/escalate", { ticketId: id, reason: "Escalated from the board" });
      else if (t.proof?.fixed === true) await api("/api/resolve", { ticketId: id, note: "" });
      else return toast("Needs a verified after-photo first. Opening the ticket."), onOpen(id);
      toast(`${id} → ${COLS.find((c) => c[0] === to)[1]}`);
    } catch (e) {
      toast(e.message);
    }
  }

  return (
    <div className="kanban">
      {COLS.map(([key, label]) => {
        const list = tickets.filter((t) => t.status === key);
        return (
          <section
            key={key}
            className={`kcol ${over === key ? "over" : ""} ${key}`}
            onDragOver={(e) => { e.preventDefault(); setOver(key); }}
            onDragLeave={() => setOver(null)}
            onDrop={(e) => drop(e.dataTransfer.getData("text/plain"), key)}
          >
            <header><span>{label}</span><span className="mono faint">{list.length}</span></header>
            <div className="kcards">
              {list.slice(0, key === "resolved" ? 8 : 50).map((t) => (
                <button
                  key={t.id}
                  draggable
                  onDragStart={(e) => { e.dataTransfer.setData("text/plain", t.id); setDragging(t.id); }}
                  onDragEnd={() => setDragging(null)}
                  onClick={() => onOpen(t.id)}
                  className={`kcard ${t.is_safety_hazard && key !== "resolved" ? "hazard" : ""} ${dragging === t.id ? "dragging" : ""}`}
                >
                  <span className="row"><span className="tcount serif">×{t.reportCount}</span><span className="mono faint">{t.id}</span></span>
                  <span className="ksum">{t.summary}</span>
                  <span className="mono faint">{LABEL[t.category]} · {t.building} {t.room}</span>
                  {t.impact && key !== "resolved" && <span className="impact mono">{t.impact.students} students · {t.impact.label}</span>}
                  {key !== "resolved" && <span className={`mono ${Date.parse(t.dueBy) < Date.now() ? "late" : "faint"}`}>{timeLeft(t.dueBy)}</span>}
                </button>
              ))}
              {!list.length && <p className="kempty mono faint">drop here</p>}
            </div>
          </section>
        );
      })}
    </div>
  );
}
