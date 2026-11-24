// Tiny JSON-file store for the ideathon prototype. Swap for Supabase on hack day.
import fs from "node:fs";

const FILE = new URL("../data/db.json", import.meta.url);
const EMPTY = () => ({ tickets: [], reports: [] });

function load() {
  if (!fs.existsSync(FILE)) return EMPTY();
  return JSON.parse(fs.readFileSync(FILE, "utf8"));
}

function save(db) {
  fs.writeFileSync(FILE, JSON.stringify(db, null, 2));
}

export function getDb() {
  return load();
}

// Read-modify-write in one step
export function update(fn) {
  const db = load();
  const result = fn(db);
  save(db);
  return result;
}

export function reset() {
  save(EMPTY());
}
