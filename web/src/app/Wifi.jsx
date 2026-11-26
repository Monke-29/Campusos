import { useEffect, useRef, useState } from "react";
import { api, Link } from "../lib/api.jsx";

const ROOMS = ["A-101", "A-102", "B-110", "B-112", "C-204", "C-205", "D-301", "L-201", "H-105", "H-210"];
const store = {
  get: (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
};
function deviceId() {
  let id = store.get("campusos.device", "");
  if (!id) store.set("campusos.device", (id = (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`).replace(/[^a-z0-9-]/gi, "").slice(0, 36)));
  return id;
}

// ~3 s test against the CampusOS server: latency from tiny requests, then a download that grows until it takes ~0.8 s.
async function speedTest(onPhase) {
  const get = async (kb) => {
    const t = performance.now();
    const buf = await (await fetch(`/api/speed/blob?kb=${kb}&r=${Math.random()}`, { cache: "no-store" })).arrayBuffer();
    return { ms: performance.now() - t, bytes: buf.byteLength };
  };
  onPhase("ping");
  const pings = [];
  for (let i = 0; i < 4; i++) pings.push((await get(16)).ms);
  onPhase("download");
  let kb = 256, best = 0;
  const start = performance.now();
  while (performance.now() - start < 3000) {
    const r = await get(kb);
    best = Math.max(best, (r.bytes * 8) / (r.ms / 1000) / 1e6);
    if (r.ms > 800 || kb >= 4096) break;
    kb = Math.min(4096, kb * 4);
  }
  return { mbps: best, latency: Math.min(...pings) };
}

// Log-scale gauge, 0.1 to 100+ Mbps.
function Gauge({ mbps, status, testing }) {
  const k = mbps == null ? 0 : Math.max(0, Math.min(1, (Math.log10(Math.max(mbps, 0.1)) + 1) / 3));
  const a = Math.PI * (1 - k), R = 120;
  const arc = (from, to) => `M${140 + R * Math.cos(from)},${150 - R * Math.sin(from)} A${R},${R} 0 0 1 ${140 + R * Math.cos(to)},${150 - R * Math.sin(to)}`;
  return (
    <svg viewBox="-24 0 328 170" className={`gauge ${status ?? ""} ${testing ? "testing" : ""}`} role="img" aria-label={mbps == null ? "Not measured yet" : `${mbps.toFixed(1)} megabits per second`}>
      <path d={arc(Math.PI, 0)} className="g-track" />
      {mbps != null && <path d={arc(Math.PI, a)} className="g-fill" />}
      {[0.1, 1, 10, 100].map((v) => {
        const t = Math.PI * (1 - (Math.log10(v) + 1) / 3);
        return <text key={v} x={140 + (R + 24) * Math.cos(t)} y={154 - (R + 24) * Math.sin(t)} textAnchor="middle" className="axis">{v}</text>;
      })}
      {testing && <circle cx="140" cy="150" r="20" className="g-ripple" />}
    </svg>
  );
}

export default function Wifi() {
  const initial = new URLSearchParams(location.search).get("room")?.toUpperCase() || store.get("campusos.room", "L-201");
  const [room, setRoom] = useState(ROOMS.includes(initial) ? initial : "L-201");
  const [phase, setPhase] = useState("idle"); // idle | ping | download | done | error
  const [res, setRes] = useState(null);
  const [err, setErr] = useState("");
  const [auto, setAuto] = useState(false);
  const [info, setInfo] = useState(null);
  const busy = useRef(false);

  useEffect(() => { api("/api/wifi").then((m) => setInfo(m.rooms.find((r) => r.room === room) ?? null), () => {}); }, [room, res]);

  async function run() {
    if (busy.current) return;
    busy.current = true;
    setErr("");
    try {
      const m = await speedTest(setPhase);
      const out = await api("/api/speed", { room, mbps: m.mbps, latency: m.latency, device: deviceId() });
      setRes({ ...m, ...out });
      setPhase("done");
    } catch (e) {
      setErr(e.message);
      setPhase("error");
    }
    busy.current = false;
  }

  // The installed app would measure in the background; here it repeats every 2 minutes while the page is open.
  useEffect(() => {
    if (!auto) return;
    const t = setInterval(run, 120e3);
    return () => clearInterval(t);
  }, [auto, room]);

  const testing = phase === "ping" || phase === "download";
  const base = res?.room?.baseline ?? info?.baseline;
  const ratio = res && base ? res.mbps / base : null;
  const verdict = !res ? null : res.mbps < 1 || (ratio != null && ratio < 0.2) ? "down" : ratio != null && ratio < 0.5 ? "slow" : "ok";
  const ticket = res?.filed ?? info?.ticketId;

  return (
    <main className="app-page wifi">
      <section className="wifi-intro">
        <span className="eyebrow">Phone as a sensor</span>
        <h1>Is the Wi-Fi <em>bad, or is it you?</em></h1>
        <p className="muted">Your phone measures this room's Wi-Fi in about three seconds. When several phones in the same room see it collapse, CampusOS opens the ticket itself. Nobody has to write a complaint.</p>
        <label className="field">
          <span>Room you're in</span>
          <select className="input" value={room} onChange={(e) => { setRoom(e.target.value); store.set("campusos.room", e.target.value); setRes(null); setPhase("idle"); }}>
            {ROOMS.map((r) => <option key={r}>{r}</option>)}
          </select>
        </label>
        {info && (
          <p className="mono faint">
            {room} usually gets {info.baseline ?? "–"} Mbps · {info.samples24h} measurements today
            {info.pattern ? ` · slow most days around ${String(info.pattern.hour).padStart(2, "0")}:00` : ""}
          </p>
        )}
      </section>

      <section className="report-card wifi-card">
        <Gauge mbps={testing ? null : res?.mbps ?? null} status={verdict} testing={testing} />
        <div className="wifi-read">
          {testing ? (
            <p className="wifi-phase">{phase === "ping" ? "Checking response time…" : "Downloading test data…"}</p>
          ) : res ? (
            <>
              <span className="wifi-num serif">{res.mbps < 10 ? res.mbps.toFixed(1) : Math.round(res.mbps)}<small> Mbps</small></span>
              <span className="mono faint">{Math.round(res.latency)} ms response{base ? ` · this room usually ${base} Mbps` : ""}</span>
            </>
          ) : (
            <span className="wifi-num serif faint">–<small> Mbps</small></span>
          )}
        </div>

        {res && verdict && (
          <p className={`note ${verdict === "down" ? "danger" : verdict === "slow" ? "amber" : "ok"}`} role="status">
            {verdict === "ok" && "Wi-Fi is fine here. If a site won't load, the problem is probably that site or your device."}
            {verdict === "slow" && "Slower than usual for this room. CampusOS is watching; it acts once other phones see the same."}
            {verdict === "down" && (res.filed
              ? <>You were one of {res.room?.devices ?? 3} phones that saw it. CampusOS opened <b>{res.filed}</b> automatically.</>
              : ticket ? <>Confirmed: it's not you. It's already being fixed as <b>{ticket}</b>.</>
              : "It's not you. Waiting for a couple more phones in this room to confirm before opening a ticket.")}
          </p>
        )}
        {ticket && res && verdict !== "ok" && <Link to={`/t/${ticket}`} className="link">Track {ticket} →</Link>}
        {err && <p className="note danger" role="alert">{err}</p>}

        <button className="btn btn-ember submit" onClick={run} disabled={testing}>
          {testing ? <><span className="spinner" /> Measuring…</> : res ? "Measure again" : <>Measure {room} <span className="arrow">→</span></>}
        </button>
        <label className="auto-row">
          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
          <span>Keep measuring every 2 minutes while this page is open</span>
        </label>
        <p className="mono faint">Measures the connection to CampusOS, not to one website. No browsing data is collected; only the room, speed and an anonymous device ID.</p>
      </section>
    </main>
  );
}
