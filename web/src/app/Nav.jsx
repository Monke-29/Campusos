import { useEffect, useRef, useState } from "react";
import { Link, useMe, isStaff, signOut, ROLE_NAME } from "../lib/api.jsx";

export const Mark = () => (
  <svg viewBox="0 0 32 32" aria-hidden="true">
    <path d="M5 10h22v4a2 2 0 0 0 0 4v4H5v-4a2 2 0 0 0 0-4z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    <path d="M12 10v12" stroke="currentColor" strokeWidth="1.2" strokeDasharray="1.5 2" />
    <circle cx="19.5" cy="16" r="2.2" fill="var(--ember)" />
  </svg>
);

// One menu button for everyone. Signed out: pick a portal. Signed in: your pages, profile, sign out.
function Menu({ path }) {
  const { user } = useMe();
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    const away = (e) => !box.current?.contains(e.target) && setOpen(false);
    const esc = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => (document.removeEventListener("pointerdown", away), document.removeEventListener("keydown", esc));
  }, [open]);

  const item = (to, title, sub) => (
    <Link to={to} className={`menu-item ${path === to.split("?")[0] ? "on" : ""}`} role="menuitem" onClick={() => setOpen(false)}>
      <span>{title}</span>{sub && <small className="faint">{sub}</small>}
    </Link>
  );
  return (
    <div className="menu" ref={box}>
      <button className={`menu-btn ${open ? "open" : ""}`} onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="menu" aria-label="Menu">
        {user && <span className="avatar" aria-hidden="true">{user.name[0]}</span>}
        <span className="burger" aria-hidden="true"><i /><i /><i /></span>
      </button>
      <div className={`menu-panel ${open ? "show" : ""}`} role="menu" aria-hidden={!open}>
        {user ? (
          <>
            <div className="menu-who">
              <b>{user.name}</b>
              <small className="mono faint">{ROLE_NAME[user.role]}{user.department ? ` · ${user.department}` : ""}{user.usn ? ` · ${user.usn}` : ""}</small>
            </div>
            {isStaff(user) ? item("/admin", "Dashboard", "tickets, approvals, analytics") : item("/me", "My dashboard", "your reports and their status")}
            {item("/report", "Report an issue")}
            {item("/wifi", "Check the Wi-Fi here")}
            {item("/profile", "My profile")}
            <button className="menu-item danger" role="menuitem" onClick={signOut}><span>Sign out</span></button>
          </>
        ) : (
          <>
            <span className="menu-label mono faint">Sign in to</span>
            {item("/login", "Community portal", "students, faculty and campus staff")}
            {item("/login?portal=admin", "Admin portal", "facility admin, department heads, technicians")}
            <span className="menu-sep" />
            {item("/report", "Report without an account")}
          </>
        )}
      </div>
    </div>
  );
}

export function Nav({ path }) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 24);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  return (
    <header className={`nav ${scrolled || path !== "/" ? "scrolled" : ""}`}>
      <Link to="/" className="brand" aria-label="CampusOS home">
        <Mark />
        <span>Campus<i>OS</i></span>
      </Link>
      <nav className="nav-links">
        <Menu path={path} />
      </nav>
    </header>
  );
}
