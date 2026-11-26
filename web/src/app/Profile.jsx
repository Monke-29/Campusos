import { useEffect, useState } from "react";
import { api, useMe, refreshMe, navigate, isStaff, ROLE_NAME, Link } from "../lib/api.jsx";

function Field({ label, hint, ...props }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input className="input" {...props} />
      {hint && <small className="mono faint">{hint}</small>}
    </label>
  );
}

export default function Profile() {
  const me = useMe();
  useEffect(() => { if (!me.loading && !me.user) navigate("/login?next=/profile"); }, [me.loading, me.user]);
  const [name, setName] = useState("");
  const [pw, setPw] = useState({ current: "", next: "", again: "" });
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState(null); // { tone, text }
  useEffect(() => { if (me.user) setName(me.user.name); }, [me.user?.name]);
  if (!me.user) return <main className="app-page"><div className="skeleton" /></main>;
  const u = me.user;

  async function save(kind, body, done) {
    setBusy(kind);
    setMsg(null);
    try {
      await api("/api/me/profile", body);
      await refreshMe();
      setMsg({ tone: "ok", text: done });
      if (kind === "pw") setPw({ current: "", next: "", again: "" });
    } catch (e) { setMsg({ tone: "danger", text: e.message }); }
    setBusy("");
  }
  const savePw = (e) => {
    e.preventDefault();
    if (pw.next !== pw.again) return setMsg({ tone: "danger", text: "The two new passwords don't match" });
    save("pw", { currentPassword: pw.current, newPassword: pw.next }, u.google ? "Password added. You can now also sign in with your email." : "Password changed");
  };
  const since = u.createdAt && new Date(u.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });

  return (
    <main className="app-page profile">
      <section className="profile-head">
        <span className="profile-avatar serif" aria-hidden="true">{u.name[0]}</span>
        <div>
          <span className="eyebrow">My profile</span>
          <h1>{u.name.split(" ")[0]}, <em>{ROLE_NAME[u.role].toLowerCase()}</em></h1>
          <p className="muted">{u.email}{since ? ` · member since ${since}` : ""}</p>
        </div>
        <Link to={isStaff(u) ? "/admin" : "/me"} className="btn btn-sm">{isStaff(u) ? "Dashboard" : "My dashboard"} →</Link>
      </section>

      {msg && <p className={`note ${msg.tone}`} role="status">{msg.text}</p>}

      <div className="profile-grid">
        <form className="panel profile-card" onSubmit={(e) => { e.preventDefault(); save("name", { name }, "Name saved"); }}>
          <div className="panel-head"><h3>Your <em>details</em></h3></div>
          <Field label="Full name" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={60} autoComplete="name" />
          <Field label="Email" value={u.email} readOnly disabled hint={u.google ? "signed in with Google" : "used to sign in"} />
          {u.usn && <Field label="USN" value={u.usn} readOnly disabled hint="your reports are filed under this; ask the admin to change it" />}
          {u.department && <Field label="Department" value={u.department} readOnly disabled />}
          <Field label="Account type" value={ROLE_NAME[u.role]} readOnly disabled />
          <button className="btn btn-ember btn-sm" disabled={busy === "name" || name.trim() === u.name}>{busy === "name" ? <span className="spinner" /> : "Save details"}</button>
        </form>

        <form className="panel profile-card" onSubmit={savePw}>
          <div className="panel-head"><h3>{u.google ? <>Add a <em>password</em></> : <>Change <em>password</em></>}</h3></div>
          <p className="muted">{u.google ? "You sign in with Google. Add a password if you also want to sign in with your email." : "8+ characters, with at least one letter and one number."}</p>
          {!u.google && <Field label="Current password" type="password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} required autoComplete="current-password" />}
          <Field label="New password" type="password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} required minLength={8} autoComplete="new-password" />
          <Field label="New password again" type="password" value={pw.again} onChange={(e) => setPw({ ...pw, again: e.target.value })} required minLength={8} autoComplete="new-password" />
          <button className="btn btn-sm" disabled={busy === "pw"}>{busy === "pw" ? <span className="spinner" /> : u.google ? "Add password" : "Change password"}</button>
        </form>
      </div>
    </main>
  );
}
