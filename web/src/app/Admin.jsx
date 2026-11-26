import { useEffect, useMemo, useState } from "react";
import { api, useLive, useMe, isStaff, canActOn, navigate, ROLE_NAME, compressImage, Link, LABEL, timeLeft, ago, byEmergency } from "../lib/api.jsx";
import { Timeline } from "./Status.jsx";
import Overview from "./Overview.jsx";
import Kanban from "./Kanban.jsx";

const FILTERS = [
  ["all", "All", () => true],
  ["safety", "Safety", (t) => t.is_safety_hazard && t.status !== "resolved"],
  ["open", "Open", (t) => t.status === "open" || t.status === "in_progress"],
  ["escalated", "Escalated", (t) => t.status === "escalated"],
  ["review", "Needs review", (t) => (t.needsHumanReview || t.pendingAction) && t.status !== "resolved"],
  ["resolved", "Resolved", (t) => t.status === "resolved"],
];

const active = (t) => t.status !== "resolved";
const overdue = (t) => active(t) && Date.parse(t.dueBy) < Date.now();
const SORTS = [
  ["emergency", "Most urgent", byEmergency],
  ["newest", "Newest", (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)],
  ["oldest", "Oldest", (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)],
  ["deadline", "Deadline", (a, b) => active(b) - active(a) || Date.parse(a.dueBy) - Date.parse(b.dueBy)],
];

const greeting = (h = new Date().getHours()) => (h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening");

function Toast({ msg }) {
  return <div className={`toast ${msg ? "show" : ""}`} role="status">{msg?.text}</div>;
}

function useToast() {
  const [msg, setMsg] = useState(null);
  useEffect(() => { if (!msg) return; const t = setTimeout(() => setMsg(null), 3200); return () => clearTimeout(t); }, [msg]);
  return [msg, (text) => setMsg({ text, at: Date.now() })];
}

function People({ toast }) {
  const { data: users, reload } = useLive("/api/users");
  const { departments = [] } = useMe();
  const [f, setF] = useState({ name: "", email: "", role: "technician", department: "", password: "" });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function add(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const u = await api("/api/users", f);
      toast(`Added ${u.name} as ${ROLE_NAME[u.role].toLowerCase()}. Share the password with them privately.`);
      setF({ ...f, name: "", email: "", password: "" });
      reload();
    } catch (e2) { toast(e2.message); }
    setBusy(false);
  }
  const remove = (u) => api("/api/users/remove", { id: u.id }).then(() => (toast(`Removed ${u.name}`), reload()), (e) => toast(e.message));
  const staff = (users ?? []).filter((u) => u.role !== "student");
  const students = (users ?? []).filter((u) => u.role === "student");
  return (
    <div className="people">
      <section className="panel">
        <div className="panel-head"><h3>Add <em>staff</em></h3><span className="mono faint">students sign up themselves</span></div>
        <form className="people-form" onSubmit={add}>
          <input className="input" placeholder="Full name" value={f.name} onChange={set("name")} required maxLength={60} />
          <input className="input" type="email" placeholder="Work email" value={f.email} onChange={set("email")} required />
          <select className="input" value={f.role} onChange={set("role")} aria-label="Role">
            <option value="technician">Technician</option>
            <option value="dept_head">Department head</option>
            <option value="admin">Admin</option>
          </select>
          {f.role !== "admin" && (
            <select className="input" value={f.department} onChange={set("department")} required aria-label="Department">
              <option value="">Department…</option>
              {departments.map((d) => <option key={d}>{d}</option>)}
            </select>
          )}
          <input className="input" type="text" placeholder="Temporary password (8+, letter + number)" value={f.password} onChange={set("password")} required minLength={8} autoComplete="off" />
          <button className="btn btn-ember btn-sm" disabled={busy}>{busy ? <span className="spinner" /> : "Add account"}</button>
        </form>
        <p className="mono faint">Technicians can start work and upload after-photos for their department. Department heads can also close, escalate and approve AI requests for their department. Admins can do everything.</p>
      </section>
      <section className="panel">
        <div className="panel-head"><h3>Staff</h3><span className="mono faint">{staff.length}</span></div>
        <table className="score">
          <thead><tr><th>Name</th><th>Role</th><th>Department</th><th></th></tr></thead>
          <tbody>
            {staff.map((u) => (
              <tr key={u.id}>
                <td>{u.name}<br /><span className="mono faint">{u.email}</span></td>
                <td>{ROLE_NAME[u.role]}</td>
                <td className="faint">{u.department ?? "all"}</td>
                <td><button className="btn btn-sm btn-danger" onClick={() => remove(u)}>Remove</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="panel">
        <div className="panel-head"><h3>Students</h3><span className="mono faint">{students.length} signed up</span></div>
        <table className="score">
          <tbody>
            {students.slice(0, 50).map((u) => (
              <tr key={u.id}><td>{u.name}</td><td className="mono faint">{u.usn}</td><td className="mono faint">{u.email}</td></tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function Drawer({ id: openId, onClose, toast, user }) {
  // keep showing the last ticket while the drawer slides out
  const [id, setId] = useState(openId);
  useEffect(() => { if (openId) setId(openId); }, [openId]);
  const { data: t } = useLive(id ? `/api/tickets/${id}` : null);
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState("");
  const [override, setOverride] = useState(false);

  useEffect(() => {
    const k = (e) => e.key === "Escape" && onClose();
    addEventListener("keydown", k);
    return () => removeEventListener("keydown", k);
  }, [onClose]);
  useEffect(() => { setNote(""); setOverride(false); }, [id]);

  const run = (label, path, body, done) => async () => {
    setBusy(label);
    try { await api(path, body); toast(done); } catch (e) { toast(e.message); }
    setBusy("");
  };
  async function proof(file) {
    if (!file) return;
    setBusy("proof");
    try {
      const { ticket } = await api("/api/verify-fix", { ticketId: id, photo: await compressImage(file) });
      toast(ticket.proof.fixed === true ? "After-photo verified: fixed" : ticket.proof.fixed === false ? "AI says: not fixed yet" : "Photo saved. Needs a human check");
    } catch (e) { toast(e.message); }
    setBusy("");
  }

  const open = Boolean(openId);
  const live = t && t.id === id;
  const can = (action) => canActOn(user, t, action);
  return (
    <>
      <div className={`scrim ${open ? "show" : ""}`} onClick={onClose} />
      <aside className={`drawer ${open ? "show" : ""}`} aria-hidden={!open} aria-label="Ticket details">
        {live && (
          <div className="drawer-inner">
            <div className="drawer-top">
              <span className="eyebrow">{t.id} · {LABEL[t.category]}</span>
              <button className="btn btn-sm" onClick={onClose} aria-label="Close">Esc</button>
            </div>
            <h2>{t.summary}</h2>
            <div className="row wrap">
              <span className={`pill ${t.status === "resolved" ? "ok" : t.status === "escalated" ? "danger" : "ember"}`}>{t.status}</span>
              {t.is_safety_hazard && <span className="pill danger">safety</span>}
              {t.needsHumanReview && <span className="pill amber">{t.suspicious ? "possible prompt injection" : "low confidence"}</span>}
              <span className="pill">×{t.reportCount}</span>
              <span className="pill">{t.building} · {t.room}</span>
            </div>

            {t.pendingAction && can("decide") && (
              <div className="approval">
                <div>
                  <span className="mono amber">Approval needed</span>
                  <p><b>{t.pendingAction.requestedBy}</b> wants to <b>{t.pendingAction.action}</b> this ticket{t.pendingAction.reason ? `: “${t.pendingAction.reason}”` : "."}</p>
                </div>
                <div className="row">
                  <button className="btn btn-sm btn-ok" disabled={!!busy} onClick={run("approve", "/api/decide", { ticketId: id, approve: true }, "Approved")}>Approve</button>
                  <button className="btn btn-sm btn-danger" disabled={!!busy} onClick={run("reject", "/api/decide", { ticketId: id, approve: false }, "Rejected")}>Reject</button>
                </div>
              </div>
            )}

            <dl className="kv">
              <div><dt>Team</dt><dd>{t.department}<small className="faint"> · {t.deptEmail}</small></dd></div>
              <div><dt>Deadline</dt><dd>{t.status === "resolved" ? `fixed ${ago(t.resolvedAt)}` : timeLeft(t.dueBy)}</dd></div>
              <div><dt>Urgency</dt><dd className="cap">{t.urgency}</dd></div>
              <div><dt>Classified by</dt><dd>{t.classifiedBy} {t.confidence != null && <small className="faint">· {Math.round(t.confidence * 100)}%</small>}</dd></div>
              {t.impact && <div><dt>Impact today</dt><dd>{t.impact.students} students · {t.impact.label}</dd></div>}
              {t.ratings && (t.ratings.up + t.ratings.down > 0) && <div><dt>Students' rating</dt><dd>{t.ratings.up} 👍 · {t.ratings.down} 👎</dd></div>}
              <div><dt>Channels</dt><dd>{Object.entries(t.channels || {}).map(([k, v]) => `${k} ×${v}`).join(" · ")}</dd></div>
              {t.escalatedTo && <div><dt>Escalated to</dt><dd>{t.escalatedTo}</dd></div>}
            </dl>

            {t.status !== "resolved" && (
              <div className="actions">
                <h3 className="mono faint">Proof of fix</h3>
                <div className="proof-row">
                  {t.photos?.[0] ? <img src={t.photos[0]} alt="Reported" /> : <div className="ph mono faint">no photo reported</div>}
                  {t.proof?.photoUrl ? <img src={t.proof.photoUrl} alt="After" /> : <div className="ph mono faint">after-photo</div>}
                </div>
                {t.proof && (
                  <p className={`note ${t.proof.fixed === true ? "ok" : t.proof.fixed === false ? "danger" : "amber"}`}>
                    {t.proof.fixed === true ? "Verified fixed" : t.proof.fixed === false ? "Not fixed" : "Unverified"}
                    {t.proof.confidence != null && ` · ${Math.round(t.proof.confidence * 100)}%`} — {t.proof.reason}
                  </p>
                )}
                {can("verify") && (
                  <label className={`btn btn-sm ${busy === "proof" ? "loading" : ""}`}>
                    <input type="file" accept="image/*" hidden onChange={(e) => proof(e.target.files[0])} />
                    {busy === "proof" ? "Checking…" : "Upload after-photo"}
                  </label>
                )}
                {!can("move") && <p className="note">This is {t.department}'s ticket. You can see it, but only that team (or an admin) can act on it.</p>}

                {can("resolve") && <>
                <h3 className="mono faint">Close</h3>
                <input className="input" placeholder="Resolution note (sent to students)" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} />
                {user?.role === "admin" && (
                  <label className="check">
                    <input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} />
                    <span>Close without a verified photo (admin override)</span>
                  </label>
                )}
                </>}
                <div className="row wrap">
                  {can("resolve") && <button
                    className="btn btn-ember btn-sm" disabled={!!busy || (!override && t.proof?.fixed !== true)}
                    onClick={run("resolve", "/api/resolve", { ticketId: id, note, override }, `Resolved · ${t.reportCount} student(s) notified`)}
                  >Mark fixed & notify {t.reportCount}</button>}
                  {t.status === "open" && can("move") && (
                    <button className="btn btn-sm" disabled={!!busy} onClick={run("move", "/api/move", { ticketId: id, status: "in_progress" }, "Work started")}>Start work</button>
                  )}
                  {(t.status === "open" || t.status === "in_progress") && can("escalate") && (
                    <button className="btn btn-sm btn-danger" disabled={!!busy} onClick={run("esc", "/api/escalate", { ticketId: id, reason: `Escalated by ${user.name}` }, "Escalated to HoD")}>Escalate</button>
                  )}
                </div>
              </div>
            )}

            <h3 className="mono faint">Reports ({t.reports?.length})</h3>
            <ul className="reports">
              {t.reports?.map((r) => (
                <li key={r.id}>
                  <p>“{r.text}”</p>
                  <span className="mono faint">{r.channel} · {r.studentId} · {ago(r.createdAt)}</span>
                </li>
              ))}
            </ul>

            <h3 className="mono faint">Timeline</h3>
            <Timeline items={t.timeline || []} />
            <Link to={`/t/${t.id}`} className="link mono">Student view →</Link>
          </div>
        )}
      </aside>
    </>
  );
}

function Audit() {
  const { data } = useLive("/api/audit");
  if (!data) return <div className="skeleton" />;
  if (!data.length) return <p className="muted pad">Nothing yet. Every tool call (human or AI) shows up here.</p>;
  return (
    <div className="audit">
      {data.map((a) => (
        <div key={a.id} className="audit-row">
          <span className="mono faint">{new Date(a.at).toLocaleTimeString("en-IN")}</span>
          <span className={`pill ${/mcp|agent/.test(a.actor) ? "ember" : ""}`}>{a.actor}</span>
          <span className="mono">{a.action}</span>
          <span className="mono">{a.ticketId}</span>
          <span className="faint mono clip">{JSON.stringify(a.detail)}</span>
        </div>
      ))}
    </div>
  );
}

export default function Admin() {
  const me = useMe();
  useEffect(() => { if (!me.loading && !me.user) navigate("/login?next=/admin"); }, [me.loading, me.user]);
  if (!me.user) return <main className="app-page"><div className="skeleton" /></main>;
  if (!isStaff(me.user)) {
    return (
      <main className="app-page empty">
        <span className="eyebrow">Staff only</span>
        <h1>The dashboard is for <em>campus staff.</em></h1>
        <p className="muted">You're signed in as a student. Your reports and their status are on your own page.</p>
        <Link to="/me" className="btn btn-primary">My reports →</Link>
      </main>
    );
  }
  return <Dashboard user={me.user} />;
}

function Dashboard({ user }) {
  const { data: tickets, error } = useLive("/api/tickets");
  const { data: stats } = useLive("/api/stats");
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("emergency");
  const [q, setQ] = useState("");
  const [tab, setTab] = useState("overview");
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState("");
  const [msg, toast] = useToast();

  const list = useMemo(() => {
    const f = FILTERS.find((x) => x[0] === filter)[2];
    const s = q.trim().toLowerCase();
    return (tickets || []).filter(f).filter((t) => !s || `${t.id} ${t.summary} ${t.building} ${t.room} ${t.department} ${t.category}`.toLowerCase().includes(s))
      .sort(SORTS.find((x) => x[0] === sort)[2]);
  }, [tickets, filter, sort, q]);


  const control = (label, path, body, done) => async () => {
    setBusy(label);
    try { const r = await api(path, body); toast(done(r)); } catch (e) { toast(e.message); }
    setBusy("");
  };

  const count = (key) => (tickets || []).filter(FILTERS.find((x) => x[0] === key)[2]).length;

  return (
    <main className="app-page admin">
      <div className="console-head">
        <div className="who">
          <span className="live-chip"><i aria-hidden="true" />Live</span>
          <h1>{greeting()}, {user.name.replace(/^(Dr|Prof|Mr|Ms|Mrs)\.?\s+/i, "").split(" ")[0]}</h1>
          <p>{ROLE_NAME[user.role]}{user.department ? ` for ${user.department}` : ", whole campus"} · {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}</p>
        </div>
        <div className="row wrap head-actions">
          {user.role === "admin" && <button className="btn btn-sm" disabled={!!busy} onClick={control("demo", "/api/demo", {}, (r) => `Loaded ${r.loaded} demo complaints`)}>{busy === "demo" ? "Loading…" : "Load demo"}</button>}
          {["admin", "dept_head"].includes(user.role) && <button className="btn btn-sm" disabled={!!busy} onClick={control("time", "/api/check-overdue", { hours: 30 }, (r) => r.escalated.length ? `Escalated ${r.escalated.join(", ")}` : "Nothing overdue")}>Simulate +30h</button>}
          {user.role === "admin" && <button className="btn btn-sm btn-danger" disabled={!!busy} onClick={control("reset", "/api/reset", {}, () => "Campus data cleared (accounts kept)")}>Reset</button>}
        </div>
      </div>

      {tab !== "overview" && <div className="stats">
        {[
          ["Open", stats?.open], ["Safety", stats?.safety, "danger"], ["Escalated", stats?.escalated, "amber"],
          ["Resolved", stats?.resolved, "ok"], ["Duplicates merged", stats?.duplicatesMerged, "ember"], ["Needs review", stats?.review],
        ].map(([k, v, tone]) => (
          <div key={k} className={`stat ${tone || ""}`}><span className="serif">{v ?? "–"}</span><span className="mono faint">{k}</span></div>
        ))}
      </div>}

      <div className="pill-tabs" role="tablist">
        {[["overview", "Overview"], ["tickets", "Tickets", count("open") + count("escalated")], ["board", "Board"], ["audit", "Audit log"], ...(user.role === "admin" ? [["people", "People"]] : [])].map(([k, l, n]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l}{n ? <span className="badge">{n}</span> : null}</button>
        ))}
      </div>

      {tab === "tickets" && (
        <>
          <div className="filters">
            <div className="seg">
              {FILTERS.map(([k, l]) => (
                <button key={k} className={filter === k ? "on" : ""} onClick={() => setFilter(k)}>{l}<span className="mono">{count(k)}</span></button>
              ))}
            </div>
            <div className="row">
              <label className="sort">
                <span className="mono faint">Sort</span>
                <select className="input" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort tickets">
                  {SORTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              </label>
              <input className="input search" placeholder="Search room, team, ID…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
          </div>

          {error && <p className="note danger">{error.message}</p>}
          {tickets && !tickets.length && (
            <div className="empty-board">
              <h2>No tickets yet.</h2>
              <p className="muted">Load the demo (15 students, one projector) or <Link to="/report" className="link">report something</Link>.</p>
            </div>
          )}
          <div className="board">
            {list.map((t) => (
              <button key={t.id} className={`trow ${t.status} ${t.is_safety_hazard && t.status !== "resolved" ? "hazard" : ""} ${selected === t.id ? "sel" : ""}`} onClick={() => setSelected(t.id)}>
                <span className="tcount serif">×{t.reportCount}</span>
                <span className="tmain">
                  <span className="tsum">{t.summary}</span>
                  <span className="mono faint">{t.id} · {LABEL[t.category]} · {t.building} {t.room}{t.impact && t.status !== "resolved" ? <span className="impact"> · {t.impact.students} students affected</span> : null}</span>
                </span>
                <span className="tdept">{t.department}</span>
                <span className={`tdue mono ${t.status !== "resolved" && Date.parse(t.dueBy) < Date.now() ? "late" : ""}`}>
                  {t.status === "resolved" ? "fixed" : timeLeft(t.dueBy)}
                </span>
                <span className="tflags">
                  {overdue(t) && <span className="pill danger">overdue</span>}
                  {active(t) && !t.is_safety_hazard && t.urgency === "critical" && <span className="pill danger">critical</span>}
                  {t.pendingAction && <span className="pill amber">approve?</span>}
                  {t.needsHumanReview && !t.pendingAction && t.status !== "resolved" && <span className="pill amber">review</span>}
                  {t.is_safety_hazard && t.status !== "resolved" && <span className="pill danger">safety</span>}
                  <span className={`pill ${t.status === "resolved" ? "ok" : t.status === "escalated" ? "danger" : t.status === "in_progress" ? "ember" : ""}`}>{t.status.replace("_", " ")}</span>
                </span>
              </button>
            ))}
          </div>
        </>
      )}
      {tab === "overview" && <Overview tickets={tickets || []} onOpen={setSelected} onBuilding={(b) => { setQ(b); setFilter("all"); setTab("tickets"); }} />}
      {tab === "board" && tickets && <Kanban tickets={tickets} onOpen={setSelected} toast={toast} />}
      {tab === "audit" && <Audit />}
      {tab === "people" && user.role === "admin" && <People toast={toast} />}

      <Drawer id={selected} onClose={() => setSelected(null)} toast={toast} user={user} />
      <Toast msg={msg} />
    </main>
  );
}
