import { useEffect, useRef, useState } from "react";
import { api, useLive, useMe, Link, LABEL, timeLeft, ago } from "../lib/api.jsx";

const VOTED = "campusos.voted";
const voted = () => { try { return JSON.parse(localStorage.getItem(VOTED)) || {}; } catch { return {}; } };

function RateFix({ t }) {
  const { user } = useMe();
  const [mine, setMine] = useState(() => voted()[t.id]);
  const [err, setErr] = useState("");
  async function vote(v) {
    try {
      await api("/api/rate", { ticketId: t.id, vote: v });
      setMine(v);
      try { localStorage.setItem(VOTED, JSON.stringify({ ...voted(), [t.id]: v })); } catch {}
    } catch (e) { setErr(e.message); if (/already/.test(e.message)) setMine(v); }
  }
  return (
    <div className="card rate">
      <div>
        <p className="lg">{mine ? "Thanks for rating the fix." : "Is it actually fixed?"}</p>
        <span className="muted">{mine ? "The team sees this on their dashboard." : user?.usn ? "Your rating goes to the team that fixed it." : "Only students who reported it can rate the fix."}</span>
        {err && <p className="note danger">{err}</p>}
      </div>
      {!user?.usn && !mine ? <Link to={`/login?next=/t/${t.id}`} className="btn btn-primary">Sign in to rate</Link> : <div className="row">
        <button className={`btn ${mine === "up" ? "btn-ok on" : ""}`} disabled={!!mine} onClick={() => vote("up")}>👍 Yes</button>
        <button className={`btn ${mine === "down" ? "btn-danger on" : ""}`} disabled={!!mine} onClick={() => vote("down")}>👎 Not really</button>
      </div>}
    </div>
  );
}

const STAGES = [["open", "Reported"], ["assigned", "Being fixed"], ["escalated", "Escalated"], ["resolved", "Fixed"]];

export function Timeline({ items }) {
  return (
    <ol className="timeline">
      {[...items].reverse().map((e, i) => (
        <li key={i} className={`tl-${e.type}`}>
          <span className="tl-dot" />
          <div>
            <p>{e.text}</p>
            <span className="mono faint">{ago(e.at)} · {new Date(e.at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</span>
          </div>
        </li>
      ))}
    </ol>
  );
}

// Reads the status aloud: ElevenLabs if configured, otherwise the browser voice.
function Listen({ t }) {
  const [busy, setBusy] = useState(false);
  const audio = useRef(null);
  const line =
    t.status === "resolved" ? `Good news. Your report about the ${LABEL[t.category]} in ${t.building} ${t.room} is fixed.` :
    t.status === "escalated" ? `Ticket ${t.id} missed its deadline and has been escalated to the head of department. ${t.reportCount} students reported it.` :
    `Ticket ${t.id} is open with the ${t.department}. ${t.reportCount} students reported it. ${timeLeft(t.dueBy)}.`;
  async function play() {
    setBusy(true);
    try {
      const res = await fetch("/api/tts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: line }) });
      if (!res.ok) throw new Error("fallback");
      audio.current?.pause();
      audio.current = new Audio(URL.createObjectURL(await res.blob()));
      await audio.current.play();
    } catch {
      speechSynthesis.cancel();
      speechSynthesis.speak(Object.assign(new SpeechSynthesisUtterance(line), { lang: "en-IN" }));
    }
    setBusy(false);
  }
  return <button className="btn btn-sm" onClick={play} disabled={busy}>{busy ? "…" : "▶ Listen"}</button>;
}

export default function Status({ id }) {
  const { data: t, error, loading } = useLive(`/api/tickets/${id}`);
  const [, tick] = useState(0);
  useEffect(() => { const i = setInterval(() => tick((x) => x + 1), 30_000); return () => clearInterval(i); }, []);

  if (loading) return <main className="app-page"><div className="skeleton" /></main>;
  if (error || !t)
    return (
      <main className="app-page empty">
        <h1>No ticket <em>{id}</em></h1>
        <p className="muted">It may have been reset. <Link to="/report" className="link">Report an issue</Link></p>
      </main>
    );

  const reached = { open: 0, in_progress: 1, escalated: 2, resolved: 3 }[t.status] ?? 0;
  const stageOn = (i) => (i === 2 ? t.status === "escalated" || Boolean(t.escalatedAt) : i <= reached);

  return (
    <main className="app-page status">
      <div className="status-head">
        <span className="eyebrow">{t.id} · {LABEL[t.category]}</span>
        <h1>{t.summary}</h1>
        <div className="row wrap">
          <span className={`pill ${t.status === "resolved" ? "ok" : t.status === "escalated" ? "danger" : "ember"}`}><span className="dot live" />{t.status}</span>
          {t.is_safety_hazard && <span className="pill danger">safety hazard</span>}
          <span className="pill">{t.building} · {t.room}</span>
          <Listen t={t} />
        </div>
      </div>

      <ol className="stages">
        {STAGES.map(([k, label], i) => (
          <li key={k} className={stageOn(i) ? "on" : ""}><span className="mono">{String(i + 1).padStart(2, "0")}</span>{label}</li>
        ))}
      </ol>

      <div className="status-grid">
        <div className="card stat-big">
          <span className="serif big">×{t.reportCount}</span>
          <span className="muted">{t.reportCount === 1 ? "report" : "students reported this"}</span>
        </div>
        <div className="card">
          <span className="mono faint">Team</span>
          <p className="lg">{t.department}</p>
          <span className="mono faint">{t.status === "resolved" ? `fixed ${ago(t.resolvedAt)}` : timeLeft(t.dueBy)}</span>
        </div>
        <div className="card">
          <span className="mono faint">Urgency</span>
          <p className="lg cap">{t.urgency}</p>
          <span className="mono faint">SLA {t.slaHours}h{t.impact && t.status !== "resolved" ? ` · ${t.impact.students} students affected today` : ""}</span>
        </div>
      </div>

      {t.status === "resolved" && <RateFix t={t} />}

      {(t.photos?.length > 0 || t.proof) && (
        <div className="photos">
          {t.photos?.[0] && <figure><img src={t.photos[0]} alt="Reported problem" /><figcaption className="mono faint">reported</figcaption></figure>}
          {t.proof?.photoUrl && <figure><img src={t.proof.photoUrl} alt="After the repair" /><figcaption className="mono faint">after · {t.proof.fixed === true ? "verified fixed" : t.proof.fixed === false ? "not fixed yet" : "awaiting check"}</figcaption></figure>}
        </div>
      )}

      <h2 className="sub">Timeline</h2>
      <Timeline items={t.timeline || []} />
    </main>
  );
}
