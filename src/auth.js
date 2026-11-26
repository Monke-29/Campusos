// Accounts and sessions. Students sign up themselves; staff accounts (technician, dept head, admin) are created by an admin.
// The very first account on a fresh install is the admin ("setup"). Passwords: scrypt. Sessions: random token in an
// HttpOnly cookie, only its SHA-256 is stored, so a leaked database can't be used to log in.
import crypto from "node:crypto";
import fs from "node:fs";
import { update, getDb } from "./store.js";

const DEPTS = JSON.parse(fs.readFileSync(new URL("../data/departments.json", import.meta.url), "utf8"));
export const DEPARTMENTS = [...new Set(Object.values(DEPTS).map((d) => d.dept))];
export const ROLES = ["student", "faculty", "technician", "dept_head", "admin"];
// Community accounts (students and faculty) report and track issues; staff run the dashboard.
export const COMMUNITY = new Set(["student", "faculty"]);
// The ID a community member's reports are filed under: USN for students, email for faculty.
export const reporterId = (u) => (u && COMMUNITY.has(u.role) ? u.usn || u.email : null);
export const STAFF = new Set(["technician", "dept_head", "admin"]);
const SESSION_DAYS = 7;
const COOKIE = "cos_session";
const fail = (status, message) => Object.assign(new Error(message), { status });

const USN = /^\d[A-Z]{2}\d{2}[A-Z]{2}\d{3}$/;
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,}$/i;
const domain = () => process.env.COLLEGE_EMAIL_DOMAIN?.replace(/^@/, "").toLowerCase();

const hashPassword = (password, salt = crypto.randomBytes(16).toString("hex")) =>
  new Promise((resolve, reject) =>
    crypto.scrypt(password, salt, 64, (err, key) => (err ? reject(err) : resolve(`scrypt$${salt}$${key.toString("hex")}`))));
async function checkPassword(password, stored) {
  const [, salt, hex] = String(stored).split("$");
  const fresh = (await hashPassword(password, salt)).split("$")[2];
  return crypto.timingSafeEqual(Buffer.from(fresh, "hex"), Buffer.from(hex, "hex"));
}
const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");

export const publicUser = (u) => u && { id: u.id, name: u.name, email: u.email, usn: u.usn ?? null, role: u.role, department: u.department ?? null, google: !u.passHash, createdAt: u.createdAt ?? null };

function validPassword(p) {
  if (typeof p !== "string" || p.length < 8 || p.length > 200) throw fail(400, "Password must be at least 8 characters");
  if (!/[a-z]/i.test(p) || !/\d/.test(p)) throw fail(400, "Use at least one letter and one number in the password");
}
function cleanName(n) {
  n = String(n ?? "").trim().replace(/\s+/g, " ").slice(0, 60);
  if (n.length < 2) throw fail(400, "Enter your name");
  return n;
}
function cleanEmail(e, forStudent) {
  e = String(e ?? "").trim().toLowerCase();
  if (!EMAIL.test(e)) throw fail(400, "Enter a valid email");
  if (forStudent && domain() && !e.endsWith(`@${domain()}`)) throw fail(400, `Use your college email (@${domain()})`);
  return e;
}

async function createUser(db, { name, email, usn = null, role, department = null, password }) {
  if (db.users.some((u) => u.email === email)) throw fail(409, "An account with that email already exists");
  if (usn && db.users.some((u) => u.usn === usn)) throw fail(409, "An account with that USN already exists");
  // passHash null = Google-only account (password sign-in always fails for it)
  const user = { id: `U${db.users.length + 1}${crypto.randomBytes(3).toString("hex")}`, name, email, usn, role, department, passHash: password == null ? null : await hashPassword(password), createdAt: new Date().toISOString() };
  db.users.push(user);
  return user;
}

export async function needsSetup() {
  const { users = [] } = await getDb();
  return !users.some((u) => u.role === "admin" && !u.disabled);
}

// The first admin. Only allowed while no admin exists.
export async function setup({ name, email, password }) {
  name = cleanName(name);
  email = cleanEmail(email, false);
  validPassword(password);
  return update(async (db) => {
    db.users ??= [];
    if (db.users.some((u) => u.role === "admin" && !u.disabled)) throw fail(403, "CampusOS is already set up. Ask an admin for an account.");
    return createUser(db, { name, email, role: "admin", password });
  });
}

// Community signup: students give their USN, faculty don't.
const cleanUsn = (usn) => {
  usn = String(usn ?? "").trim().toUpperCase();
  if (!USN.test(usn)) throw fail(400, "Enter your USN, e.g. 1MS23CS042");
  return usn;
};
export async function signupStudent({ name, usn, email, password, role = "student" }) {
  if (!COMMUNITY.has(role)) throw fail(400, "Sign up as a student or faculty member");
  name = cleanName(name);
  usn = role === "student" ? cleanUsn(usn) : null;
  email = cleanEmail(email, true);
  validPassword(password);
  return update(async (db) => {
    db.users ??= [];
    return createUser(db, { name, email, usn, role, password });
  });
}

// My profile: change your name, and set or change your password (Google-only accounts can add one).
export async function updateProfile(user, { name, currentPassword, newPassword }) {
  if (!user?.id || user.id === "token") throw fail(401, "Sign in to continue");
  const changes = {};
  if (name != null) changes.name = cleanName(name);
  if (newPassword) {
    validPassword(newPassword);
    if (user.passHash && !(await checkPassword(String(currentPassword ?? ""), user.passHash))) throw fail(403, "Your current password is wrong");
    changes.passHash = await hashPassword(newPassword);
  }
  return update((db) => {
    const u = (db.users ?? []).find((x) => x.id === user.id && !x.disabled);
    if (!u) throw fail(404, "No such account");
    Object.assign(u, changes);
    return publicUser(u);
  });
}

export async function createStaff({ name, email, role, department, password }, by) {
  if (by?.role !== "admin") throw fail(403, "Only an admin can add staff");
  if (!STAFF.has(role)) throw fail(400, "Role must be technician, dept_head or admin");
  if (role !== "admin" && !DEPARTMENTS.includes(department)) throw fail(400, "Pick a department");
  name = cleanName(name);
  email = cleanEmail(email, false);
  validPassword(password);
  return update(async (db) => {
    db.users ??= [];
    const u = await createUser(db, { name, email, role, department: role === "admin" ? null : department, password });
    db.audit.push({ id: `A${db.audit.length + 1}`, at: new Date().toISOString(), actor: by.name, action: "add_user", ticketId: null, detail: { email, role, department: u.department } });
    return publicUser(u);
  });
}

export async function listUsers(by) {
  if (by?.role !== "admin") throw fail(403, "Only an admin can see accounts");
  const { users = [] } = await getDb();
  return users.filter((u) => !u.disabled).map(publicUser);
}

export async function disableUser(id, by) {
  if (by?.role !== "admin") throw fail(403, "Only an admin can remove accounts");
  if (id === by.id) throw fail(400, "You can't remove your own account");
  return update((db) => {
    const u = (db.users ?? []).find((x) => x.id === id && !x.disabled);
    if (!u) throw fail(404, "No such account");
    u.disabled = true;
    db.sessions = (db.sessions ?? []).filter((s) => s.userId !== id);
    db.audit.push({ id: `A${db.audit.length + 1}`, at: new Date().toISOString(), actor: by.name, action: "remove_user", ticketId: null, detail: { email: u.email } });
    return { ok: true };
  });
}

// ---- sign-in throttle: 8 failures per identifier+IP per 15 minutes ----
// ponytail: in-memory, per process. Move to the store if you run more than one server.
const failures = new Map();
const throttleKey = (id, ip) => `${String(id).toLowerCase()}|${ip}`;
function throttled(key) {
  const f = failures.get(key);
  if (!f || Date.now() - f.first > 15 * 60e3) return false;
  return f.n >= 8;
}
function noteFailure(key) {
  const f = failures.get(key);
  if (!f || Date.now() - f.first > 15 * 60e3) failures.set(key, { n: 1, first: Date.now() });
  else f.n++;
}

// login accepts an email or a USN
export async function login({ id, password }, ip = "") {
  const key = throttleKey(id, ip);
  if (throttled(key)) throw fail(429, "Too many attempts. Try again in 15 minutes.");
  const ident = String(id ?? "").trim();
  const { users = [] } = await getDb();
  const u = users.find((x) => !x.disabled && (x.email === ident.toLowerCase() || (x.usn && x.usn === ident.toUpperCase())));
  // same error and similar timing whether or not the account exists
  const ok = await checkPassword(String(password ?? ""), u?.passHash ?? "scrypt$00$" + "0".repeat(128));
  if (!u || !ok) {
    noteFailure(key);
    throw fail(401, "Wrong email/USN or password");
  }
  failures.delete(key);
  return startSession(u);
}

async function startSession(u) {
  const token = crypto.randomBytes(32).toString("base64url");
  await update((db) => {
    db.sessions = (db.sessions ?? []).filter((s) => Date.parse(s.expires) > Date.now());
    db.sessions.push({ id: sha(token), userId: u.id, expires: new Date(Date.now() + SESSION_DAYS * 86400e3).toISOString() });
  });
  return { token, user: publicUser(u) };
}

// Google sign-in. The browser gets an ID token from Google; Google's tokeninfo endpoint checks its signature and
// expiry, we check it was issued for our client ID and the email is verified. Existing account with that email:
// signed in. New: becomes a student once they give their USN (first call returns needUsn).
export async function googleSignIn({ credential, usn, role = "student" }) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) throw fail(501, "Google sign-in isn't set up on this server");
  const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
  const g = res.ok ? await res.json() : null;
  const verified = g?.email_verified === true || g?.email_verified === "true";
  if (!g || g.aud !== clientId || !["accounts.google.com", "https://accounts.google.com"].includes(g.iss) || !verified) {
    throw fail(401, "Google sign-in failed. Try again.");
  }
  const email = cleanEmail(g.email, false);
  const { users = [] } = await getDb();
  let u = users.find((x) => !x.disabled && x.email === email);
  if (!u) {
    cleanEmail(email, true); // new accounts are community members, so the college-domain rule applies
    if (!COMMUNITY.has(role)) throw fail(400, "Sign up as a student or faculty member");
    if (role === "student" && !String(usn ?? "").trim()) return { needUsn: true, name: g.name ?? "", email };
    const id = role === "student" ? cleanUsn(usn) : null;
    const name = cleanName(g.name || email.split("@")[0]);
    u = await update(async (db) => {
      db.users ??= [];
      return createUser(db, { name, email, usn: id, role, password: null });
    });
  }
  return startSession(u);
}

export async function logout(token) {
  if (!token) return;
  const id = sha(token);
  await update((db) => void (db.sessions = (db.sessions ?? []).filter((s) => s.id !== id)));
}

export async function userFromToken(token) {
  if (!token) return null;
  const { sessions = [], users = [] } = await getDb();
  const s = sessions.find((x) => x.id === sha(token) && Date.parse(x.expires) > Date.now());
  const u = s && users.find((x) => x.id === s.userId && !x.disabled);
  return u ?? null;
}

// ---- cookies ----
export function readToken(req) {
  for (const part of (req.headers.cookie ?? "").split(";")) {
    const [k, v] = part.trim().split("=");
    if (k === COOKIE && v && /^[A-Za-z0-9_-]{20,100}$/.test(v)) return v;
  }
  return null;
}
export function sessionCookie(token, { clear = false } = {}) {
  const secure = /^https:/.test(process.env.PUBLIC_URL ?? "") ? "; Secure" : "";
  return `${COOKIE}=${clear ? "" : encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${clear ? 0 : SESSION_DAYS * 86400}${secure}`;
}

// What a staff member may do to a ticket. Admin: everything. Dept head / technician: their own department's tickets.
export function canActOn(user, ticket, action) {
  if (!user || !STAFF.has(user.role)) return false;
  if (user.role === "admin") return true;
  if (ticket.department !== user.department) return false;
  if (user.role === "technician") return ["move", "verify"].includes(action);
  return ["move", "verify", "resolve", "escalate", "decide"].includes(action); // dept_head
}

// Demo accounts for the judges' walkthrough (created by "Load demo", which only an admin can press).
export const DEMO_PASSWORD = "campusos-demo1";
export const DEMO_USERS = [
  { name: "Ananya Rao", email: "ananya@student.demo", usn: "1MS23CS042", role: "student" },
  { name: "Ravi Kumar", email: "ravi@itav.demo", role: "technician", department: "IT & AV Team" },
  { name: "Dr. Meena Iyer", email: "meena@network.demo", role: "dept_head", department: "Network Team" },
];
export async function seedDemoUsers(db) {
  db.users ??= [];
  for (const d of DEMO_USERS) if (!db.users.some((u) => u.email === d.email)) await createUser(db, { ...d, password: DEMO_PASSWORD });
}
