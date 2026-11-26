// Store: Supabase (if SUPABASE_URL + SUPABASE_SERVICE_KEY are set) or a local JSON file.
// Same interface either way: getDb() / update(fn) / reset() / onChange(fn).
// Supabase schema: docs/supabase.sql (tables tickets, reports, audit_log, wifi_samples, app_users, app_sessions, each `id text pk, data jsonb`).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FILE = process.env.DB_FILE
  ? path.resolve(process.env.DB_FILE)
  : fileURLToPath(new URL("../data/db.json", import.meta.url));
const TABLES = { tickets: "tickets", reports: "reports", audit: "audit_log", wifi: "wifi_samples", users: "app_users", sessions: "app_sessions" };
const EMPTY = () => ({ tickets: [], reports: [], audit: [], wifi: [], users: [], sessions: [] });

const SB_URL = process.env.SUPABASE_URL?.replace(/\/$/, "");
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
export const storeKind = SB_URL && SB_KEY ? "supabase" : "json";

async function sb(pathAndQuery, init = {}) {
  const res = await fetch(`${SB_URL}/rest/v1/${pathAndQuery}`, {
    ...init,
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json", ...init.headers },
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  return res.status === 204 || init.method === "DELETE" ? null : res.json().catch(() => null);
}

const json = {
  async load() {
    if (!fs.existsSync(FILE)) return EMPTY();
    return { ...EMPTY(), ...JSON.parse(fs.readFileSync(FILE, "utf8")) };
  },
  async save(db) {
    fs.writeFileSync(FILE, JSON.stringify(db, null, 2));
  },
  async reset(keep) {
    const old = await json.load();
    fs.writeFileSync(FILE, JSON.stringify({ ...EMPTY(), ...Object.fromEntries(keep.map((k) => [k, old[k]])) }, null, 2));
  },
};

// ponytail: loads every row per request and upserts only changed rows. Fine for one campus;
// move to per-ticket queries + pgvector match_open_tickets() if rows reach the tens of thousands.
let snapshot = {};
const supabase = {
  async load() {
    const db = EMPTY();
    // Supabase returns at most 1000 rows per request, so read each table in pages.
    await Promise.all(Object.entries(TABLES).map(async ([key, table]) => {
      for (let offset = 0; ; offset += 1000) {
        const rows = await sb(`${table}?select=id,data&order=created_at.asc,id.asc&limit=1000&offset=${offset}`);
        db[key].push(...rows.map((r) => r.data));
        if (rows.length < 1000) break;
      }
    }));
    snapshot = Object.fromEntries(Object.keys(TABLES).map((k) => [k, new Map(db[k].map((x) => [x.id, JSON.stringify(x)]))]));
    return db;
  },
  async save(db) {
    for (const [key, table] of Object.entries(TABLES)) {
      const changed = db[key].filter((x) => snapshot[key]?.get(x.id) !== JSON.stringify(x));
      if (changed.length) {
        await sb(table, {
          method: "POST",
          headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
          body: JSON.stringify(changed.map((x) => ({ id: x.id, data: x }))),
        });
      }
      // rows the app dropped (signed-out sessions, trimmed Wi-Fi samples) must be deleted too
      const kept = new Set(db[key].map((x) => x.id));
      const gone = [...(snapshot[key]?.keys() ?? [])].filter((id) => !kept.has(id));
      for (let i = 0; i < gone.length; i += 100) {
        const ids = gone.slice(i, i + 100).map((id) => `"${String(id).replace(/["\\]/g, "")}"`).join(",");
        await sb(`${table}?id=in.(${encodeURIComponent(ids)})`, { method: "DELETE" });
      }
    }
  },
  async reset(keep) {
    for (const [key, table] of Object.entries(TABLES)) if (!keep.includes(key)) await sb(`${table}?id=neq.__none__`, { method: "DELETE" });
  },
};

const backend = storeKind === "supabase" ? supabase : json;
const listeners = new Set();
export const onChange = (fn) => (listeners.add(fn), () => listeners.delete(fn));
const emit = () => listeners.forEach((fn) => fn());

// ponytail: one in-process queue serialises writes. Run a single server instance; use row locks if you scale out.
let queue = Promise.resolve();
const serial = (job) => {
  const run = queue.then(job);
  queue = run.catch(() => {});
  return run;
};

export const getDb = () => serial(() => backend.load());

// Read-modify-write in one step
export const update = (fn) =>
  serial(async () => {
    const db = await backend.load();
    const result = await fn(db);
    await backend.save(db);
    emit();
    return result;
  });

// Clears the campus data. Accounts and sessions survive, so "Load demo" doesn't log everyone out.
export const reset = (keep = ["users", "sessions"]) => serial(async () => (await backend.reset(keep), emit()));
