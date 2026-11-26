import { useEffect, useState } from "react";
import { api, useMe, useLive, navigate, Link, LABEL, timeLeft, ago, isStaff, ROLE_NAME } from "../lib/api.jsx";
import { CountUp, Donut } from "./Charts.jsx";

const STEPS = ["open", "in_progress", "resolved"];
// Reported → Being fixed → Fixed, as a three-step progress line (escalated sits on step 2, in red).
function Progress({ status }) {
  const at = status === "escalated" ? 1 : STEPS.indexOf(status);
  return (
    <span className={`progress ${status}`} aria-label={`Stage: ${STAGE[status]}`}>
      {["Reported", status === "escalated" ? "Escalated" : "Being fixed", "Fixed"].map((l, i) => (
        <span key={l} className={i <= at ? "on" : ""}><i />{l}</span>
      ))}
    </span>
  );
}

const STAGE = { open: "Reported", in_progress: "Being fixed", escalated: "Escalated", resolved: "Fixed" };

function Rate({ t }) {
  const [done, setDone] = useState(t.rated);
  const [err, setErr] = useState("");
  const vote = (v) => api("/api/rate", { ticketId: t.id, vote: v }).then(() => setDone(true), (e) => (setErr(e.message), /already/.test(e.message) && setDone(true)));
  if (done) return <span className="mono faint">rated, thanks</span>;
  return (
    <span className="row">
      <span className="muted">Is it fixed?</span>
      <button className="btn btn-sm" onClick={() => vote("up")}>👍</button>
      <button className="btn btn-sm" onClick={() => vote("down")}>👎</button>
      {err && <span className="mono late">{err}</span>}
    </span>
  );
}

export default function Me() {
  const me = useMe();
  useEffect(() => { if (!me.loading && !me.user) navigate("/login?next=/me"); }, [me.loading, me.user]);
  const { data: tickets, error } = useLive(me.user && !isStaff(me.user) ? "/api/my/tickets" : null);
  if (!me.user) return <main className="app-page"><div className="skeleton" /></main>;
  if (isStaff(me.user)) {
    return (
      <main className="app-page empty">
        <h1>This page is for <em>students and faculty.</em></h1>
        <Link to="/admin" className="btn btn-primary">Go to the dashboard →</Link>
      </main>
    );
  }
  const open = (tickets ?? []).filter((t) => t.status !== "resolved");
  const fixed = (tickets ?? []).filter((t) => t.status === "resolved");
  const toRate = fixed.filter((t) => !t.rated).length;
  const first = me.user.name.split(" ")[0];

  return (
    <main className="app-page portal">
      <section className="portal-head">
        <div>
          <span className="eyebrow">{ROLE_NAME[me.user.role]}{me.user.usn ? ` · ${me.user.usn}` : ""}</span>
          <h1>Hi {first}, <em>{open.length ? `${open.length} issue${open.length === 1 ? " of yours is" : "s of yours are"} being worked on` : "nothing of yours is broken"}</em></h1>
        </div>
        <div className="row wrap">
          <Link to="/report" className="btn btn-ember">Report something <span className="arrow">→</span></Link>
          <Link to="/wifi" className="btn">Check Wi-Fi here</Link>
        </div>
      </section>

      <div className="portal-grid">
        <section className="kpis portal-kpis">
          {[["Reported", tickets?.length ?? null], ["Being fixed", open.length], ["Fixed", fixed.length], ["Waiting for your rating", toRate]].map(([l, v]) => (
            <div key={l} className="kpi"><span className="mono faint">{l}</span><span className="kpi-num serif"><CountUp value={v} /></span></div>
          ))}
        </section>
        {tickets?.length > 0 && (
          <section className="panel portal-donut">
            <div className="panel-head"><h3>Your <em>reports</em></h3></div>
            <Donut sub="reports" segments={[["open", "Reported", "var(--ember)"], ["in_progress", "Being fixed", "var(--amber)"], ["escalated", "Escalated", "var(--danger)"], ["resolved", "Fixed", "var(--ok)"]]
              .map(([k, l, c]) => ({ key: k, label: l, value: tickets.filter((t) => t.status === k).length, color: c }))} />
          </section>
        )}
      </div>

      {error && <p className="note danger">{error.message}</p>}
      {tickets && !tickets.length && (
        <div className="empty-board">
          <h2>No reports yet.</h2>
          <p className="muted">Report something while signed in (typing, a photo, or the voice button in the corner) and it shows up here. You're told the moment it's fixed.</p>
        </div>
      )}

      <div className="mine-cards">
        {[...open, ...fixed].map((t, i) => (
          <article key={t.id} className={`mine-card ${t.status}`} style={{ animationDelay: `${Math.min(i, 8) * 60}ms` }}>
            <div className="mine-top">
              <span className="mono faint">{t.id} · {LABEL[t.category]} · {t.building} {t.room}</span>
              <span className={`tdue mono ${t.status !== "resolved" && Date.parse(t.dueBy) < Date.now() ? "late" : ""}`}>
                {t.status === "resolved" ? `fixed ${ago(t.resolvedAt)}` : timeLeft(t.dueBy)}
              </span>
            </div>
            <Link to={`/t/${t.id}`} className="mine-sum">{t.summary}</Link>
            <Progress status={t.status} />
            <div className="mine-foot">
              <span className="muted">{t.department} · {t.reportCount > 1 ? `you + ${t.reportCount - 1} other${t.reportCount === 2 ? "" : "s"} reported this` : "only you so far"}</span>
              {t.status === "resolved" ? <Rate t={t} /> : <Link to={`/t/${t.id}`} className="link mono">Details →</Link>}
            </div>
          </article>
        ))}
      </div>
    </main>
  );
}
