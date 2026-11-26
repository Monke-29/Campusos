// Phone as a sensor: students' phones run a ~3 s speed test against this server. CampusOS keeps a live
// Wi-Fi map per room and files the ticket itself when several different phones see a room's Wi-Fi collapse.
import { update, getDb } from "./store.js";
import { handleReport } from "./agent.js";

const MIN = 60e3, H = 3600e3, DAY = 24 * H;
const fail = (status, message) => Object.assign(new Error(message), { status });
// Auto-ticket only when this many samples from this many distinct phones agree, so one bad phone can't file tickets.
const OUTAGE = { windowMin: 15, samples: 5, devices: 3 };

const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const r1 = (x) => (x == null ? null : Math.round(x * 10) / 10);
const age = (s, now) => now - Date.parse(s.at);

// "L-201", "l201", "Block L 201" -> "L-201"
export function parseRoom(s) {
  const m = /^(?:block\s*)?([a-hl])\s*-?\s*(\d{3})$/i.exec(String(s ?? "").trim());
  return m ? `${m[1].toUpperCase()}-${m[2]}` : null;
}

// down: under 1 Mbps or under 20% of the room's usual speed. slow: under half of usual.
export const statusOf = (now, base) =>
  now == null ? "quiet" : now < 1 || (base && now < base * 0.2) ? "down" : base && now < base * 0.5 ? "slow" : "ok";

function roomView(all, key, now) {
  const mine = all.filter((s) => s.room === key);
  const recent = mine.filter((s) => age(s, now) < 30 * MIN);
  const week = mine.filter((s) => age(s, now) < 7 * DAY && age(s, now) > H); // baseline leaves out the last hour
  const devices = new Set(recent.map((s) => s.device)).size;
  const current = recent.length >= 3 && devices >= 2 ? median(recent.map((s) => s.mbps)) : null;
  const base = median(week.map((s) => s.mbps));
  const spark = Array.from({ length: 12 }, (_, i) => {
    const hi = now - (11 - i) * H, lo = hi - H;
    return r1(median(mine.filter((s) => Date.parse(s.at) > lo && Date.parse(s.at) <= hi).map((s) => s.mbps)));
  });
  // A time of day that is reliably bad ("slow every night around 22:00")
  const byHour = {};
  for (const s of week) (byHour[new Date(s.at).getHours()] ??= []).push(s.mbps);
  let pattern = null;
  for (const [h, xs] of Object.entries(byHour)) {
    const m = median(xs);
    if (xs.length >= 4 && base && m < base * 0.4 && (!pattern || m < pattern.mbps)) pattern = { hour: Number(h), mbps: r1(m) };
  }
  return {
    room: key, building: `Block ${key[0]}`, now: r1(current), baseline: r1(base), status: statusOf(current, base),
    devices, latency: Math.round(median(recent.map((s) => s.latency)) ?? 0) || null,
    samples24h: mine.filter((s) => age(s, now) < DAY).length, spark, pattern,
  };
}

const openWifiTicket = (db, key) =>
  db.tickets.find((t) => t.category === "wifi" && t.status !== "resolved" && parseRoom(`${t.building.replace(/^Block\s*/i, "")}-${t.room}`) === key);

const ORDER = { down: 0, slow: 1, ok: 2, quiet: 3 };
export async function wifiMap(now = Date.now()) {
  const db = await getDb();
  const all = db.wifi ?? [];
  const rooms = [...new Set(all.map((s) => s.room))].map((k) => ({ ...roomView(all, k, now), ticketId: openWifiTicket(db, k)?.id ?? null }));
  rooms.sort((a, b) => ORDER[a.status] - ORDER[b.status] || (a.now ?? 1e9) - (b.now ?? 1e9));
  const today = all.filter((s) => age(s, now) < DAY);
  return { rooms, phonesToday: new Set(today.map((s) => s.device)).size, samplesToday: today.length };
}

export function roomOutage(all, key, now = Date.now()) {
  const recent = all.filter((s) => s.room === key && age(s, now) < OUTAGE.windowMin * MIN);
  const m = median(recent.map((s) => s.mbps));
  const base = median(all.filter((s) => s.room === key && age(s, now) > H && age(s, now) < 7 * DAY).map((s) => s.mbps));
  // only phones that themselves measured a collapse count towards the quorum
  const phones = new Set(recent.filter((s) => statusOf(s.mbps, base) === "down").map((s) => s.device)).size;
  const down = recent.length >= OUTAGE.samples && phones >= OUTAGE.devices && statusOf(m, base) === "down";
  return { down, phones, mbps: r1(m), baseline: r1(base) };
}

export async function recordSample({ room, mbps, latency, device }, now = Date.now()) {
  const key = parseRoom(room);
  if (!key) throw fail(400, "Pick a room, e.g. L-201");
  mbps = Number(mbps), latency = Number(latency);
  if (!(mbps >= 0 && mbps <= 5000)) throw fail(400, "mbps out of range");
  if (!(latency >= 0 && latency <= 20000)) throw fail(400, "latency out of range");
  if (!/^[a-z0-9-]{8,40}$/i.test(String(device ?? ""))) throw fail(400, "device id missing");

  const decision = await update((db) => {
    db.wifi ??= [];
    // one sample per phone per room every 20 s, so a single phone can't flood a room
    if (db.wifi.some((s) => s.device === device && s.room === key && age(s, now) < 20e3)) return { accepted: false };
    db.wifi.push({ id: `W${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`, room: key, mbps: r1(mbps), latency: Math.round(latency), device, at: new Date(now).toISOString() });
    // ponytail: keeps 8 days / 20k samples in the main store. Move to a time-series table if many campuses use it.
    db.wifi = db.wifi.filter((s) => age(s, now) < 8 * DAY).slice(-20000);
    const o = roomOutage(db.wifi, key, now);
    return { accepted: true, outage: o, file: o.down && !openWifiTicket(db, key) };
  });

  let filed = null;
  if (decision.file) {
    const o = decision.outage;
    // Goes through the normal pipeline, so it merges if a student files the same thing a moment later.
    const out = await handleReport({
      text: `Wi-Fi outage in ${key}: ${o.phones} phones measured ${o.mbps} Mbps${o.baseline ? ` (usually ${o.baseline} Mbps)` : ""}. Detected automatically by CampusOS.`,
      studentId: "wifi-sensor", channel: "sensor", actor: "wifi-sensor",
    });
    filed = out.ticket.id;
  }
  const view = roomView((await getDb()).wifi, key, now);
  return { accepted: decision.accepted, room: view, filed };
}

// Demo: several phones in one room measure a collapse within a few minutes.
export async function simulateOutage(room = "A-101") {
  const key = parseRoom(room) ?? "A-101";
  let filed = null;
  for (let i = 0; i < 6; i++) {
    const r = await recordSample({ room: key, mbps: 0.2 + i * 0.08, latency: 900 + i * 140, device: `demo-phone-${i}-${Date.now().toString(36)}` });
    filed ??= r.filed;
  }
  return { room: key, filed };
}

// A week of measurements so the map, baselines and the "slow every night" pattern have data.
// [room, usual Mbps, bad hour of day or null, Mbps right now or null (= normal)]
const SEED = [
  ["C-204", 42, null, null], ["A-101", 18, null, null], ["L-201", 21, null, 0.7], ["H-105", 16, 22, null],
  ["B-112", 26, null, null], ["D-301", 35, null, null], ["C-205", 30, null, 11], ["H-210", 12, 23, null],
];
export function seedWifi(db, now = Date.now()) {
  let x = 7;
  const rnd = () => ((x = (x * 1103515245 + 12345) % 2147483648) / 2147483648);
  const devices = Array.from({ length: 260 }, (_, i) => `seed-${i.toString(36).padStart(4, "0")}`);
  db.wifi = [];
  for (const [room, usual, badHour, current] of SEED) {
    const hostel = room.startsWith("H");
    for (let t = now - 7 * DAY; t < now - 30 * MIN; t += 20 * MIN) {
      const hour = new Date(t).getHours();
      if (!hostel && (hour < 8 || hour > 19)) continue;
      if (rnd() < 0.35) continue;
      const bad = badHour !== null && hour === badHour;
      const mbps = bad ? 1.2 + rnd() * 1.8 : usual * (0.75 + rnd() * 0.45);
      db.wifi.push({ id: `W${db.wifi.length + 1}`, room, mbps: r1(mbps), latency: Math.round(bad ? 300 + rnd() * 400 : 18 + rnd() * 40), device: devices[Math.floor(rnd() * devices.length)], at: new Date(t).toISOString() });
    }
    // the last half hour: normal, or the current problem if the room has one
    for (let k = 0; k < (current ? 7 : 4); k++) {
      const mbps = current ? current * (0.7 + rnd() * 0.6) : usual * (0.8 + rnd() * 0.35);
      db.wifi.push({ id: `W${db.wifi.length + 1}`, room, mbps: r1(mbps), latency: Math.round(current ? 600 + rnd() * 900 : 20 + rnd() * 30), device: devices[Math.floor(rnd() * devices.length)], at: new Date(now - (k + 1) * 3.5 * MIN).toISOString() });
    }
  }
}
