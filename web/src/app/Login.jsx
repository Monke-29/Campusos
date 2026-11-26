import { useEffect, useRef, useState } from "react";
import { api, useMe, refreshMe, navigate, homeFor, isStaff, ROLE_NAME, useSearch } from "../lib/api.jsx";

// Student or faculty, for new community accounts.
function RolePick({ role, setRole }) {
  return (
    <div className="seg role-pick" role="radiogroup" aria-label="I am">
      {[["student", "Student"], ["faculty", "Faculty"]].map(([k, l]) => (
        <button key={k} type="button" role="radio" aria-checked={role === k} className={role === k ? "on" : ""} onClick={() => setRole(k)}>{l}</button>
      ))}
    </div>
  );
}

// Google Identity Services: renders Google's own button and hands us an ID token, which the server verifies.
let gsi;
const loadGsi = () => (gsi ??= new Promise((ok, bad) => {
  const s = document.createElement("script");
  s.src = "https://accounts.google.com/gsi/client";
  s.async = true;
  s.onload = ok;
  s.onerror = () => ((gsi = null), bad(new Error("Couldn't load Google sign-in")));
  document.head.appendChild(s);
}));

function GoogleSignIn({ clientId, onError }) {
  const box = useRef(null);
  const [pending, setPending] = useState(null); // { credential, name, email } while we ask for the USN
  const [usn, setUsn] = useState("");
  const [role, setRole] = useState("student");
  const [busy, setBusy] = useState(false);

  async function send(credential, usnValue, roleValue) {
    setBusy(true);
    onError("");
    try {
      const r = await api("/api/auth/google", { credential, usn: usnValue, role: roleValue });
      if (r.needUsn) setPending({ credential, name: r.name, email: r.email });
      else await refreshMe();
    } catch (e) { onError(e.message); }
    setBusy(false);
  }

  useEffect(() => {
    let live = true;
    loadGsi().then(() => {
      if (!live || !box.current) return;
      google.accounts.id.initialize({ client_id: clientId, callback: (r) => send(r.credential) });
      google.accounts.id.renderButton(box.current, { theme: "filled_black", size: "large", shape: "pill", text: "continue_with", width: 320 });
    }, (e) => onError(e.message));
    return () => { live = false; };
  }, [clientId]);

  if (pending) {
    return (
      <form className="report-form google-usn" onSubmit={(e) => { e.preventDefault(); send(pending.credential, role === "student" ? usn : "", role); }}>
        <p className="muted">Hi {pending.name?.split(" ")[0] || "there"}, one last thing. Are you a student or faculty?</p>
        <RolePick role={role} setRole={setRole} />
        {role === "student" && <Field label="USN, so your reports are linked to you" value={usn} onChange={(e) => setUsn(e.target.value)} placeholder="1MS23CS042" required maxLength={12} autoCapitalize="characters" autoFocus />}
        <button className="btn btn-ember submit" disabled={busy}>{busy ? <span className="spinner" /> : <>Finish sign-up <span className="arrow">→</span></>}</button>
      </form>
    );
  }
  return (
    <div className="google-signin">
      <div ref={box} className={busy ? "dim" : ""} />
      <span className="or mono faint">or with your email</span>
    </div>
  );
}

const nextUrl = () => {
  const n = new URLSearchParams(location.search).get("next") || "";
  return n.startsWith("/") && !n.startsWith("//") ? n : null; // same-site paths only
};

function Field({ label, ...props }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input className="input" {...props} />
    </label>
  );
}

export default function Login() {
  const me = useMe();
  const admin = new URLSearchParams(useSearch()).get("portal") === "admin";
  const [mode, setMode] = useState("signin"); // signin | signup | setup
  const [role, setRole] = useState("student");
  useEffect(() => { if (admin && mode === "signup") setMode("signin"); }, [admin]);
  const [f, setF] = useState({ id: "", password: "", name: "", usn: "", email: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  useEffect(() => { if (me.setup) setMode("setup"); }, [me.setup]);
  // already signed in: go where you belong
  useEffect(() => {
    if (me.loading || !me.user) return;
    const next = nextUrl();
    // a leftover ?next=/admin must not send a student to the staff dashboard
    navigate(next && !(next.startsWith("/admin") && !isStaff(me.user)) ? next : homeFor(me.user));
  }, [me.loading, me.user]);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const body = mode === "signin" ? { id: f.id, password: f.password }
        : mode === "signup" ? { name: f.name, usn: role === "student" ? f.usn : "", email: f.email, password: f.password, role }
        : { name: f.name, email: f.email, password: f.password };
      await api(`/api/auth/${mode === "signin" ? "login" : mode}`, body);
      await refreshMe();
    } catch (e2) {
      setErr(e2.message);
    }
    setBusy(false);
  }

  const title = mode === "setup" ? <>Set up <em>CampusOS</em></> : mode === "signup" ? <>Create your <em>account</em></> : admin ? <>Admin <em>portal</em></> : <>Community <em>portal</em></>;
  return (
    <main className="app-page login">
      <section className="login-intro">
        <span className="eyebrow">{mode === "setup" ? "First run" : admin ? "Staff sign in" : "Students · faculty · campus staff"}</span>
        <h1>{title}</h1>
        <p className="muted">
          {mode === "setup"
            ? "No admin exists yet. The account you create now runs this campus: it adds technicians and department heads, and approves what AI agents ask to do."
            : admin
              ? "For the facility admin, department heads and technicians: your department's tickets, approvals for AI agents, and campus analytics."
              : "Report what's broken, track every report, get told when it's fixed and rate the fix. For students, faculty and anyone on campus."}
        </p>
        <ul className="login-points">
          {admin ? <>
            <li><b>Staff accounts</b> are created by the facility admin, so nobody can sign up as staff.</li>
            <li>Students and faculty use the <a className="link" href="/login">community portal</a>.</li>
          </> : <>
            <li><b>Students</b> sign in with Google, or sign up with their USN and college email.</li>
            <li><b>Faculty</b> sign up with their college email, no USN needed.</li>
            <li>Reporting a problem never needs an account.</li>
          </>}
        </ul>
      </section>

      <section className="report-card login-card">
        {mode !== "setup" && !admin && (
          <div className="seg login-tabs">
            <button type="button" className={mode === "signin" ? "on" : ""} onClick={() => (setMode("signin"), setErr(""))}>Sign in</button>
            <button type="button" className={mode === "signup" ? "on" : ""} onClick={() => (setMode("signup"), setErr(""))}>New account</button>
          </div>
        )}

        {mode !== "setup" && !admin && me.googleClientId && <GoogleSignIn clientId={me.googleClientId} onError={setErr} />}

        <form className="report-form" onSubmit={submit}>
          {mode === "signin" && (
            <>
              <Field label="Email or USN" value={f.id} onChange={set("id")} autoComplete="username" placeholder={admin ? "you@college.edu" : "you@college.edu or 1MS23CS042"} required autoFocus />
              <Field label="Password" type="password" value={f.password} onChange={set("password")} autoComplete="current-password" required />
            </>
          )}
          {mode !== "signin" && (
            <>
              {mode === "signup" && <RolePick role={role} setRole={setRole} />}
              <Field label="Full name" value={f.name} onChange={set("name")} autoComplete="name" required autoFocus maxLength={60} />
              {mode === "signup" && role === "student" && <Field label="USN" value={f.usn} onChange={set("usn")} placeholder="1MS23CS042" required maxLength={12} autoCapitalize="characters" />}
              <Field label={mode === "signup" ? `College email${me.collegeDomain ? ` (@${me.collegeDomain})` : ""}` : "Email"} type="email" value={f.email} onChange={set("email")} autoComplete="email" required />
              <Field label="Password (8+ characters, a letter and a number)" type="password" value={f.password} onChange={set("password")} autoComplete="new-password" required minLength={8} />
            </>
          )}
          {err && <p className="note danger" role="alert">{err}</p>}
          <button className="btn btn-ember submit" disabled={busy}>
            {busy ? <span className="spinner" /> : mode === "signin" ? <>Sign in <span className="arrow">→</span></> : mode === "signup" ? <>Create account <span className="arrow">→</span></> : <>Create admin account <span className="arrow">→</span></>}
          </button>
        </form>

        {mode === "signin" && me.demoAccounts && (
          <div className="demo-accounts">
            <span className="mono faint">Demo accounts · password {me.demoAccounts[0].password}</span>
            <div className="row wrap">
              {me.demoAccounts.filter((d) => admin ? d.role !== "student" : d.role === "student").map((d) => (
                <button key={d.email} type="button" className="example" onClick={() => setF({ ...f, id: d.email, password: d.password })}>
                  {ROLE_NAME[d.role]}{d.department ? ` · ${d.department}` : ""}: {d.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
