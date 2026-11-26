import { useEffect, useState, useCallback, useSyncExternalStore } from "react";

const MINE_KEY = "campusos.myTickets";
const safe = (fn, fallback) => { try { return fn(); } catch { return fallback; } };

export const myTickets = {
  get: () => safe(() => JSON.parse(localStorage.getItem(MINE_KEY)) || [], []),
  add: (id) => safe(() => localStorage.setItem(MINE_KEY, JSON.stringify([id, ...myTickets.get().filter((x) => x !== id)].slice(0, 20)))),
};

export async function api(path, body, { method } = {}) {
  const res = await fetch(path, {
    method: method || (body === undefined ? "GET" : "POST"),
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `Request failed (${res.status})`), { status: res.status });
  return data;
}

// One EventSource for the whole app; components subscribe to "something changed".
let source;
const subs = new Set();
function subscribe(fn) {
  subs.add(fn);
  if (!source) {
    source = new EventSource("/api/stream");
    source.onmessage = () => subs.forEach((s) => s());
  }
  return () => {
    subs.delete(fn);
    if (!subs.size) source?.close(), (source = null);
  };
}

// Fetch `path` and refetch whenever the server reports a change.
export function useLive(path) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const load = useCallback(() => {
    if (!path) return;
    api(path).then((data) => setState({ data, error: null, loading: false }), (error) => setState((s) => ({ ...s, error, loading: false })));
  }, [path]);
  useEffect(() => {
    load();
    let t;
    // debounce bursts (e.g. "load demo" fires 19 writes)
    return subscribe(() => (clearTimeout(t), (t = setTimeout(load, 120))));
  }, [load]);
  return { ...state, reload: load };
}

export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

// Shrinks phone photos (often 4–8 MB) to ~1600px JPEG before upload.
export async function compressImage(file, max = 1600) {
  const url = await fileToDataUrl(file);
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * scale);
  c.height = Math.round(img.height * scale);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.85);
}

// Tiny pushState router.
const listeners = new Set();
window.addEventListener("popstate", () => listeners.forEach((l) => l()));
export const navigate = (to) => {
  if (to === location.pathname + location.search) return;
  history.pushState(null, "", to);
  window.scrollTo(0, 0);
  listeners.forEach((l) => l());
};
export const usePath = () =>
  useSyncExternalStore((cb) => (listeners.add(cb), () => listeners.delete(cb)), () => location.pathname);
export const useSearch = () =>
  useSyncExternalStore((cb) => (listeners.add(cb), () => listeners.delete(cb)), () => location.search);

export function Link({ to, onClick, ...props }) {
  return (
    <a
      href={to}
      onClick={(e) => {
        onClick?.(e);
        if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        navigate(to);
      }}
      {...props}
    />
  );
}

export const timeLeft = (iso, now = Date.now()) => {
  const ms = Date.parse(iso) - now;
  const h = Math.floor(Math.abs(ms) / 3600e3), m = Math.floor((Math.abs(ms) % 3600e3) / 60e3);
  const s = h >= 24 ? `${Math.floor(h / 24)}d ${h % 24}h` : h ? `${h}h ${m}m` : `${m}m`;
  return ms < 0 ? `${s} overdue` : `${s} left`;
};
export const ago = (iso) => {
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  return s < 60 ? "just now" : s < 3600 ? `${Math.floor(s / 60)}m ago` : s < 86400 ? `${Math.floor(s / 3600)}h ago` : `${Math.floor(s / 86400)}d ago`;
};
export const LABEL = { projector: "Projector", wifi: "Wi-Fi", water: "Water", electrical: "Electrical", hostel: "Hostel", equipment: "Equipment", other: "Other" };

// Signed-in user, shared by every page (session cookie set by the server). refreshMe() after sign-in / sign-out.
let meState = { loading: true, user: null };
let mePending = null;
const meSubs = new Set();
export function refreshMe() {
  mePending ??= api("/api/auth/me")
    .then((r) => (meState = { loading: false, ...r }), () => (meState = { loading: false, user: null }))
    .finally(() => { mePending = null; meSubs.forEach((f) => f()); });
  return mePending;
}
export function useMe() {
  useEffect(() => { if (meState.loading) refreshMe(); }, []);
  return useSyncExternalStore((cb) => (meSubs.add(cb), () => meSubs.delete(cb)), () => meState);
}
export async function signOut() {
  await api("/api/auth/logout", {}).catch(() => {});
  await refreshMe();
  navigate("/login");
}
export const ROLE_NAME = { student: "Student", faculty: "Faculty", technician: "Technician", dept_head: "Department head", admin: "Admin" };
export const isStaff = (u) => ["technician", "dept_head", "admin"].includes(u?.role);
// Mirrors canActOn() on the server (which is what actually enforces it); used to hide buttons you can't use.
export function canActOn(u, t, action) {
  if (!isStaff(u) || !t) return false;
  if (u.role === "admin") return true;
  if (t.department !== u.department) return false;
  return u.role === "technician" ? ["move", "verify"].includes(action) : ["move", "verify", "resolve", "escalate", "decide"].includes(action);
}
export const homeFor = (u) => (isStaff(u) ? "/admin" : u ? "/me" : "/login");

// Emergency order: anything still open before fixed, then safety hazards, then past their deadline,
// then urgency, then how many students it blocks today, then how many reported it.
const URGENCY = { critical: 3, high: 2, medium: 1, low: 0 };
const active = (t) => t.status !== "resolved";
const overdue = (t) => active(t) && Date.parse(t.dueBy) < Date.now();
export const byEmergency = (a, b) =>
  active(b) - active(a) ||
  (active(b) && b.is_safety_hazard) - (active(a) && a.is_safety_hazard) ||
  overdue(b) - overdue(a) ||
  (URGENCY[b.urgency] ?? 1) - (URGENCY[a.urgency] ?? 1) ||
  (b.impact?.students ?? 0) - (a.impact?.students ?? 0) ||
  b.reportCount - a.reportCount;
