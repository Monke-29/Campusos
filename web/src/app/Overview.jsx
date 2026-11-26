import { useState } from "react";
import { api, useLive, LABEL, timeLeft, byEmergency } from "../lib/api.jsx";
import { BarList, MergeWall, DailyColumns, Forecast, CampusIso, band, Donut, Sparkline, CountUp, SERIES, Gauge, StackBar, StackedBars } from "./Charts.jsx";

const SUGGESTIONS = ["What's overdue?", "Any safety hazards?", "Which team is slowest?", "How many students are affected today?", "What's open in the hostel?"];

function Ask({ onOpen }) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState(null);
  async function ask(question) {
    if (!question.trim()) return;
    setQ(question);
    setBusy(true);
    try { setOut({ q: question, ...(await api("/api/ask", { question })) }); }
    catch (e) { setOut({ q: question, answer: e.message, ticketIds: [], source: "error" }); }
    setBusy(false);
  }
  return (
    <div className="ask">
      <form className="ask-row" onSubmit={(e) => { e.preventDefault(); ask(q); }}>
        <span className="ask-prompt mono" aria-hidden="true">ask&nbsp;›</span>
        <input className="ask-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="what's overdue in Block B?" maxLength={300} aria-label="Ask CampusOS a question" />
        <button className="btn btn-primary btn-sm" disabled={busy}>{busy ? <span className="spinner" /> : "Ask"}</button>
      </form>
      <div className="examples">
        {SUGGESTIONS.map((s) => <button key={s} type="button" className="example" onClick={() => ask(s)}>{s}</button>)}
      </div>
      {out && (
        <div className="ask-answer" key={out.q}>
          <p>{out.answer}</p>
          <div className="row wrap">
            {out.ticketIds.map((id) => <button key={id} className="pill" onClick={() => onOpen(id)}>{id}</button>)}
            <span className="mono faint">{out.source === "llm" ? "answered by the LLM" : out.source === "rules" ? "answered by rules (no LLM key)" : ""}</span>
          </div>
        </div>
      )}
    </div>
  );
}

const NAMES = { "Block L": "Library", "Block H": "Hostel" };

function Health({ score, rows, onSelect }) {
  const [word, tone] = score == null ? ["", "var(--ink)"] : band(score);
  return (
    <>
      <div className="health-top">
        <span className="serif" style={{ color: tone }}>{score ?? "–"}</span>
        <small>/ 100 campus health{word ? ` · ${word}` : ""}</small>
      </div>
      <ol className="board-list">
        {rows.map((h, i) => {
          const [w, c] = band(h.score);
          return (
            <li key={h.building} onClick={() => onSelect(h.building)}>
              <span className="rank mono">{i + 1}</span>
              <span className="nm">{NAMES[h.building] ?? h.building}</span>
              <span className="sc" style={{ color: c }}>{h.score}</span>
              <span className="meter"><i style={{ width: `${h.score}%`, background: c }} /></span>
              <span className="parts mono faint">{w} · on time {h.parts.speed ?? "–"}{h.parts.speed != null && "%"} · 👍 {h.parts.happy ?? "–"}{h.parts.happy != null && "%"} · {h.open} open{h.safety ? ` · ${h.safety} safety` : ""}</span>
            </li>
          );
        })}
      </ol>
    </>
  );
}

const WIFI_WORD = { down: "down", slow: "slow", ok: "fine", quiet: "no data" };

function Spark({ values, status }) {
  const max = Math.max(1, ...values.filter((v) => v != null));
  return (
    <span className={`spark ${status}`} aria-hidden="true">
      {values.map((v, i) => <i key={i} style={{ height: v == null ? 2 : `${Math.max(8, (v / max) * 100)}%` }} className={v == null ? "gap" : ""} />)}
    </span>
  );
}

function WifiPanel({ onOpen }) {
  const { data } = useLive("/api/wifi");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  if (!data) return null;
  if (!data.rooms.length) return <p className="muted">No measurements yet. Open <a className="link" href="/wifi">/wifi</a> on a phone, or press Load demo.</p>;
  async function simulate() {
    setBusy(true);
    try {
      const r = await api("/api/wifi/simulate", { room: "A-101" });
      setNote(r.filed ? `6 phones in ${r.room} saw it drop. CampusOS opened ${r.filed} on its own.` : `${r.room} already has an open Wi-Fi ticket.`);
    } catch (e) { setNote(e.message); }
    setBusy(false);
  }
  return (
    <div className="wifi-panel">
      <div className="health-top">
        <span className="serif">{data.phonesToday}</span>
        <small>phones measured Wi-Fi today · {data.samplesToday} tests · nobody had to complain</small>
      </div>
      <table className="score wifi-table">
        <thead><tr><th>Room</th><th>Last 12 h</th><th>Now</th><th>Usual</th><th></th></tr></thead>
        <tbody>
          {data.rooms.map((r) => (
            <tr key={r.room}>
              <td className="mono">{r.room}</td>
              <td><Spark values={r.spark} status={r.status} /></td>
              <td className={`mono ${r.status === "down" ? "late" : ""}`}>{r.now ?? "–"}<span className="faint"> Mbps</span></td>
              <td className="mono faint">{r.baseline ?? "–"}</td>
              <td className="wifi-flags">
                <span className={`pill ${r.status === "down" ? "danger" : r.status === "slow" ? "amber" : r.status === "ok" ? "ok" : ""}`}>{WIFI_WORD[r.status]}</span>
                {r.ticketId && <button className="tid mono" onClick={() => onOpen(r.ticketId)}>{r.ticketId}</button>}
                {r.pattern && <span className="mono faint">slow ~{String(r.pattern.hour).padStart(2, "0")}:00</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="row wrap">
        <button className="btn btn-sm" onClick={simulate} disabled={busy}>{busy ? <span className="spinner" /> : "Demo: outage in A-101"}</button>
        {note && <span className="mono faint" role="status">{note}</span>}
      </div>
    </div>
  );
}

function Scorecard({ sla, ratings }) {
  const rate = Object.fromEntries(ratings.map((s) => [s.department, s]));
  const max = Math.max(1, ...sla.map((s) => s.onTime + s.open + s.late));
  return (
    <>
      <div className="legend">
        <span><i className="sw" style={{ background: "var(--ok)" }} />Fixed on time</span>
        <span><i className="sw" style={{ background: "var(--ink-3)" }} />Open, within deadline</span>
        <span><i className="sw" style={{ background: "var(--danger)" }} />Late</span>
      </div>
      <table className="score">
        <thead><tr><th>Team</th><th>Deadlines</th><th>Late</th><th>Students 👍</th></tr></thead>
        <tbody>
          {sla.map((s) => {
            const r = rate[s.department], pct = r ? Math.round((r.up / (r.up + r.down)) * 100) : null;
            return (
              <tr key={s.department}>
                <td>{s.department}</td>
                <td>
                  <span className="split" style={{ width: `${((s.onTime + s.open + s.late) / max) * 100}%` }} title={`${s.onTime} on time · ${s.open} open · ${s.late} late`}>
                    {s.onTime > 0 && <i style={{ flexGrow: s.onTime, background: "var(--ok)" }} />}
                    {s.open > 0 && <i style={{ flexGrow: s.open, background: "var(--ink-3)" }} />}
                    {s.late > 0 && <i style={{ flexGrow: s.late, background: "var(--danger)" }} />}
                  </span>
                </td>
                <td className={`mono ${s.late ? "late" : "faint"}`}>{s.late}</td>
                <td className="mono">{pct == null ? <span className="faint">–</span> : <><b className={pct < 50 ? "late" : ""}>{pct}%</b> <span className="faint">({r.up + r.down})</span></>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}

const CAT_COLOR = { projector: "#ff7a3d", wifi: "#3987e5", water: "#2fb5b0", electrical: "#f0b65c", hostel: "#a78bfa", equipment: "#8fbf6a", other: "#7f7568" };
const STATUS = [["open", "Open", "var(--ember)"], ["in_progress", "Being fixed", "var(--amber)"], ["escalated", "Escalated", "var(--danger)"], ["resolved", "Fixed", "var(--ok)"]];
const URGENCY = [["safety", "Safety hazard", "var(--danger)"], ["critical", "Critical", "#ff9a7a"], ["high", "High", "var(--amber)"], ["medium", "Medium", "var(--ember-2)"], ["low", "Low", "var(--ink-3)"]];
const CHANNELS = [["web", "Web"], ["whatsapp", "WhatsApp"], ["voice", "Voice"]];

const tally = (list, key) => list.reduce((m, t) => ((m[key(t)] = (m[key(t)] ?? 0) + 1), m), {});

// One tile of the status strip. The visual on the right is whatever explains that number best.
function Stat({ label, value, unit, decimals, note, tone, children }) {
  return (
    <div className={`tile ${tone ?? ""}`}>
      <div className="tile-text">
        <span className="tile-label">{label}</span>
        <span className="tile-num serif"><CountUp value={value} decimals={decimals} />{unit && value != null && <small>{unit}</small>}</span>
        {note && <span className="tile-note">{note}</span>}
      </div>
      {children && <div className="tile-viz">{children}</div>}
    </div>
  );
}

// What a facility manager should look at first: safety, overdue, waiting for approval, then the rest by urgency.
function Attention({ tickets, onOpen }) {
  const rows = tickets.filter((t) => t.status !== "resolved").sort(byEmergency).slice(0, 6);
  if (!rows.length) return <p className="muted">Nothing open. Every report has been fixed.</p>;
  return (
    <ol className="attn">
      {rows.map((t) => {
        const late = Date.parse(t.dueBy) < Date.now();
        const why = t.is_safety_hazard ? ["Safety", "danger"] : late ? ["Overdue", "danger"] : t.pendingAction ? ["Needs approval", "amber"] : t.status === "escalated" ? ["Escalated", "danger"] : [t.urgency, ""];
        return (
          <li key={t.id}>
            <button onClick={() => onOpen(t.id)}>
              <span className={`attn-bar ${why[1]}`} aria-hidden="true" />
              <span className="attn-main">
                <span className="attn-sum">{t.summary}</span>
                <span className="attn-meta">{t.building} {t.room} · {t.department}{t.reportCount > 1 ? ` · ${t.reportCount} reports` : ""}</span>
              </span>
              <span className="attn-side">
                <span className={`pill ${why[1]}`}>{why[0]}</span>
                <span className={`attn-due ${late ? "late" : ""}`}>{timeLeft(t.dueBy)}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function Panel({ title, note, className = "", children }) {
  return (
    <section className={`card ${className}`}>
      <header className="card-head"><h3>{title}</h3>{note && <span className="card-note">{note}</span>}</header>
      {children}
    </section>
  );
}

export default function Overview({ tickets, onOpen, onBuilding }) {
  const { data: a } = useLive("/api/analytics");
  const { data: cfg } = useLive("/api/config");
  if (!a) return <div className="skeleton" />;
  const h = a.headline;
  const open = a.buildings.reduce((n, b) => n + b.open, 0);
  const safety = a.buildings.reduce((n, b) => n + b.safety, 0);
  const merged = h.reports - h.tickets;
  const days = a.perDay.slice(-30);
  const live = tickets.filter((t) => t.status !== "resolved");
  const byStatus = tally(tickets, (t) => t.status);
  const byCat = tally(live, (t) => t.category);
  const byUrg = tally(live, (t) => (t.is_safety_hazard ? "safety" : t.urgency));
  const acc = cfg?.accuracy?.llm ?? cfg?.accuracy?.keywords;

  return (
    <div className="console">
      <section className="tiles" aria-label="Campus at a glance">
        <Stat label="Open right now" value={open} tone={safety ? "hot" : ""} note={safety ? `${safety} safety hazard${safety === 1 ? "" : "s"} among them` : "no safety hazards"}>
          <StackBar parts={URGENCY.map(([k, l, c]) => ({ key: k, label: l.toLowerCase(), value: byUrg[k] ?? 0, color: c }))} />
        </Stat>
        <Stat label="Duplicates merged" value={merged} note={`${h.reports} reports became ${h.tickets} tickets`}>
          <Gauge value={h.reports ? Math.round((merged / h.reports) * 100) : null} color="var(--ember-2)" label="Share of reports merged" />
          <span className="gauge-cap">{h.reports ? Math.round((merged / h.reports) * 100) : 0}% merged</span>
        </Stat>
        <Stat label="Average time to fix" value={h.avgFixHours} decimals={h.avgFixHours % 1 ? 1 : 0} unit="h" note={a.mttr.length > 1 ? `fastest ${LABEL[a.mttr.at(-1).category]} ${a.mttr.at(-1).hours}h · slowest ${LABEL[a.mttr[0].category]} ${a.mttr[0].hours}h` : "report to verified fix"}>
          <Sparkline values={days.map((d) => d.tickets)} color="var(--ink-2)" label="New tickets per day, last 30 days" />
          <span className="gauge-cap">new tickets, 30 days</span>
        </Stat>
        <Stat label="Fixed on time" value={h.onTimeRate} unit="%" note="within the team's deadline">
          <Gauge value={h.onTimeRate} color={h.onTimeRate >= 80 ? "var(--ok)" : h.onTimeRate >= 60 ? "var(--amber)" : "var(--danger)"} label="Fixed on time" />
        </Stat>
        <Stat label="AI triage accuracy" value={acc?.category ?? null} unit="%" note={acc ? `on ${cfg.accuracy.n} labelled complaints` : "run npm run eval"}>
          <Gauge value={acc?.category ?? null} color="var(--ok)" label="AI triage accuracy" />
        </Stat>
      </section>

      <Panel title="Needs attention" note="most urgent first" className="span-5 attention">
        <Attention tickets={tickets} onOpen={onOpen} />
      </Panel>

      <Panel title="Campus map" note="click a building to see its tickets" className="span-7 map">
        <CampusIso buildings={a.buildings} health={a.health} onSelect={onBuilding} />
      </Panel>

      <section className="card span-12 ask-card">
        <Ask onOpen={onOpen} />
      </section>

      <section className="card span-12 breakdown" aria-label="Ticket breakdown">
        <div>
          <header className="card-head"><h3>Where tickets stand</h3><span className="card-note">all {tickets.length}</span></header>
          <Donut sub="tickets" segments={STATUS.map(([k, l, c]) => ({ key: k, label: l, value: byStatus[k] ?? 0, color: c }))} />
        </div>
        <div>
          <header className="card-head"><h3>What's broken</h3><span className="card-note">open, by issue</span></header>
          <Donut sub="open" segments={Object.keys(CAT_COLOR).filter((k) => byCat[k]).map((k) => ({ key: k, label: LABEL[k] ?? k, value: byCat[k], color: CAT_COLOR[k] }))} />
        </div>
        <div className="wide">
          <header className="card-head"><h3>Workload by team</h3><span className="card-note">every ticket, by stage</span></header>
          <StackedBars keys={STATUS.map(([k, l, c]) => ({ key: k, label: l, color: c }))}
            rows={Object.entries(tally(tickets, (t) => t.department)).sort((x, y) => y[1] - x[1]).map(([dept]) => ({
              label: dept, parts: STATUS.map(([k]) => ({ key: k, value: tickets.filter((t) => t.department === dept && t.status === k).length })),
            }))} />
        </div>
      </section>

      <Panel title={<>{h.reports} reports, {h.tickets} tickets</>} note="one dot per report, grouped by the ticket it merged into" className="span-12">
        <MergeWall tickets={tickets} onOpen={onOpen} />
        <div className="legend">
          <span><i className="sw round" style={{ background: "var(--ember)" }} />open</span>
          <span><i className="sw round" style={{ background: "var(--danger)" }} />safety hazard</span>
          <span><i className="sw round" style={{ background: "var(--ink-3)" }} />fixed</span>
        </div>
      </Panel>

      <Panel title="Reports per day" note="last 30 days" className="span-7">
        <DailyColumns data={a.perDay} />
      </Panel>

      <Panel title="Likely to break next" note="from repeat failures" className="span-5">
        {a.recurring.length ? <Forecast items={a.recurring.slice(0, 5)} label={(c) => LABEL[c] ?? c} /> : <p className="muted">No repeat failures yet.</p>}
      </Panel>

      <Panel title="Team report card" note="deadlines met and student ratings" className="span-7">
        <Scorecard sla={a.sla} ratings={a.satisfaction} />
      </Panel>

      <Panel title="Building health" note="speed, ratings and open load" className="span-5">
        <Health score={h.campusScore} rows={a.health.filter((r) => r.building !== "Unknown")} onSelect={onBuilding} />
      </Panel>

      <Panel title="Time to fix" note="average hours, by issue" className="span-6">
        <BarList rows={a.mttr.map((m) => ({ label: LABEL[m.category] ?? m.category, value: m.hours, sub: `${m.n} fixed` }))} unit="h" />
      </Panel>

      <Panel title="How people report" note={`${h.reports} reports`} className="span-6">
        <Donut sub="reports" segments={CHANNELS.map(([k, l]) => ({ key: k, label: l, value: a.channels[k] ?? 0, color: SERIES[k] }))} />
      </Panel>

      <Panel title="Wi-Fi from students' phones" note="when several phones in a room see it drop, CampusOS opens the ticket itself" className="span-12">
        <WifiPanel onOpen={onOpen} />
      </Panel>
    </div>
  );
}
