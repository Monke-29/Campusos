// Small hand-rolled SVG charts for the dashboard (no chart library).
// Thin marks, recessive axes, hover tooltips, legends for 2+ series, text in ink colours.
import { useEffect, useMemo, useRef, useState } from "react";

// validated categorical slots for the dark surface (web / WhatsApp / voice)
export const SERIES = { web: "#d95926", whatsapp: "#199e70", voice: "#3987e5" };

function useTip() {
  const [tip, setTip] = useState(null);
  const box = useRef(null);
  const show = (e, content) => {
    const r = box.current.getBoundingClientRect();
    setTip({ x: e.clientX - r.left, y: e.clientY - r.top, content });
  };
  const el = tip && (
    <div className="viz-tip" style={{ left: tip.x, top: tip.y }}>{tip.content}</div>
  );
  return { box, show, hide: () => setTip(null), el };
}

const fmtDay = (d) => new Date(d + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" });
// Horizontal bars, one series. rows: [{ label, value, sub? }]
export function BarList({ rows, unit = "", color = "var(--ember)", max: forcedMax }) {
  const { box, show, hide, el } = useTip();
  const max = forcedMax ?? Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="viz" ref={box}>
      <div className="bars">
        {rows.map((r) => (
          <div key={r.label} className="bar-row" onMouseMove={(e) => show(e, <><b>{r.label}</b><span>{r.value}{unit}{r.sub ? ` · ${r.sub}` : ""}</span></>)} onMouseLeave={hide}>
            <span className="bar-label">{r.label}</span>
            <span className="bar-track"><span className="bar-fill" style={{ width: `${(r.value / max) * 100}%`, background: color }} /></span>
            <span className="bar-value mono">{r.value}{unit}</span>
          </div>
        ))}
      </div>
      {el}
    </div>
  );
}

// D6: channel mix as one 100% bar with direct labels.
export function ChannelMix({ channels }) {
  const total = Object.values(channels).reduce((a, b) => a + b, 0) || 1;
  const rows = useMemo(() => Object.entries(channels).map(([k, v]) => ({ k, v, pct: Math.round((v / total) * 100) })), [channels, total]);
  const label = { web: "Web", whatsapp: "WhatsApp", voice: "Voice" };
  return (
    <div className="viz">
      <div className="mix-big">
        {rows.map((r) => (
          <div key={r.k}>
            <span className="mix-pct">{r.pct}<small>%</small></span>
            <span><i className="sw" style={{ background: SERIES[r.k] }} />{label[r.k]} <span className="faint mono">{r.v}</span></span>
          </div>
        ))}
      </div>
      <div className="mix">{rows.map((r) => r.v ? <span key={r.k} style={{ flexGrow: r.v, background: SERIES[r.k] }} title={`${label[r.k]}: ${r.v}`} /> : null)}</div>
    </div>
  );
}

const DAY = 86400e3;
const fmtDate = (ms) => new Date(ms).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

// The dedup story as a unit chart: one dot per report, each cluster is the ticket they merged into.
export function MergeWall({ tickets, onOpen }) {
  const { box, show, hide, el } = useTip();
  const sorted = useMemo(
    () => [...tickets].sort((a, b) => (a.status === "resolved") - (b.status === "resolved") || b.reportCount - a.reportCount),
    [tickets],
  );
  // Merge animation: when a live report lands on an existing ticket, its new dot pops in and the cluster flashes.
  const seen = useRef(null);
  const timer = useRef();
  const [fresh, setFresh] = useState({}); // id -> report count before the merge
  useEffect(() => {
    const prev = seen.current;
    seen.current = Object.fromEntries(tickets.map((t) => [t.id, t.reportCount]));
    if (!prev) return;
    const grew = Object.fromEntries(tickets.filter((t) => prev[t.id] != null && t.reportCount > prev[t.id]).map((t) => [t.id, prev[t.id]]));
    if (!Object.keys(grew).length) return;
    setFresh(grew);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setFresh({}), 2600);
  }, [tickets]);
  let n = 0; // running dot index for the stagger
  return (
    <div className="viz" ref={box}>
      <div className="wall">
        {sorted.map((t) => {
          const tone = t.status === "resolved" ? "done" : t.is_safety_hazard ? "hazard" : "open";
          return (
            <button key={t.id} className={`cluster ${tone}${t.id in fresh ? " grew" : ""}`} onClick={() => onOpen(t.id)} onMouseLeave={hide}
              onMouseMove={(e) => show(e, <><b>{t.id} · {t.building} {t.room}</b><span>{t.summary}</span><span className="faint">{t.reportCount} report{t.reportCount > 1 ? "s" : ""} · {t.status.replace("_", " ")}</span></>)}
              aria-label={`${t.id}: ${t.reportCount} reports, ${t.status}`}>
              <span className="dots" style={{ gridTemplateColumns: `repeat(${Math.ceil(Math.sqrt(t.reportCount))}, 11px)` }}>
                {Array.from({ length: t.reportCount }, (_, k) => k >= (fresh[t.id] ?? Infinity)
                  ? <i key={k} className="new" />
                  : <i key={k} style={{ "--d": `${Math.min(n++, 140) * 5}ms` }} />)}
              </span>
              <span className="mono">×{t.reportCount}</span>
            </button>
          );
        })}
      </div>
      {el}
    </div>
  );
}

// Reports per day, split into "started a new ticket" and "merged into an existing one".
export function DailyColumns({ data }) {
  const W = 720, H = 210, P = { l: 26, r: 4, t: 10, b: 24 };
  const { box, show, hide, el } = useTip();
  const [hover, setHover] = useState(null);
  const max = Math.max(4, ...data.map((d) => Math.max(d.reports, d.tickets)));
  const step = (W - P.l - P.r) / data.length, bw = Math.max(4, step - 6);
  const h = (v) => (v / max) * (H - P.t - P.b);
  const base = H - P.b;
  const ticks = [0, Math.round(max / 2), max];
  return (
    <div className="viz" ref={box}>
      <div className="legend">
        <span><i className="sw" style={{ background: "var(--ink-2)" }} />Started a new ticket</span>
        <span><i className="sw" style={{ background: "var(--ember)" }} />Merged into an existing ticket</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="viz-svg" role="img" aria-label="Reports per day for the last 30 days, split into new tickets and merged duplicates" onMouseLeave={() => (hide(), setHover(null))}>
        <defs>
          <linearGradient id="dc-merged" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#ffb07a" /><stop offset="1" stopColor="#ff7a3d" /></linearGradient>
          <linearGradient id="dc-new" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#d8ccba" /><stop offset="1" stopColor="#8f8474" /></linearGradient>
        </defs>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={P.l} x2={W - P.r} y1={base - h(t)} y2={base - h(t)} className="grid" />
            <text x={P.l - 8} y={base - h(t) + 3} className="axis" textAnchor="end">{t}</text>
          </g>
        ))}
        {data.map((d, i) => {
          const merged = Math.max(0, d.reports - d.tickets), x = P.l + i * step + (step - bw) / 2;
          const hn = h(d.tickets), hm = h(merged);
          return (
            <g key={d.day} className={hover != null && hover !== i ? "col dim" : "col"}>
              {hn > 0 && <rect x={x} y={base - hn} width={bw} height={hn} rx="3" fill="url(#dc-new)" />}
              {hm > 0 && <rect x={x} y={base - hn - hm - (hn ? 2 : 0)} width={bw} height={hm} rx="3" fill="url(#dc-merged)" />}
              <rect x={P.l + i * step} y={P.t} width={step} height={base - P.t} fill="transparent"
                onMouseMove={(e) => (setHover(i), show(e, <><b>{fmtDay(d.day)}</b><span>{d.reports} report{d.reports === 1 ? "" : "s"}</span><span><i className="sw" style={{ background: "var(--ink-2)" }} />{d.tickets} new ticket{d.tickets === 1 ? "" : "s"}</span><span><i className="sw" style={{ background: "var(--ember)" }} />{merged} merged</span></>))} />
            </g>
          );
        })}
        {[0, 10, 20, data.length - 1].map((i) => <text key={i} x={P.l + i * step + step / 2} y={H - 6} className="axis" textAnchor="middle">{fmtDay(data[i].day)}</text>)}
      </svg>
      {el}
    </div>
  );
}

// Failure forecast: one lane per repeat problem, last failure ○ - - - ● next predicted failure.
export function Forecast({ items, label }) {
  const { box, show, hide, el } = useTip();
  const now = Date.now();
  const t0 = Math.min(now - 5 * DAY, ...items.map((r) => Date.parse(r.lastAt))) - DAY;
  const t1 = Math.max(now + 10 * DAY, ...items.map((r) => Date.parse(r.nextAt))) + 4 * DAY;
  const W = 470, L = 128, lane = 50, top = 28, H = top + items.length * lane;
  const x = (ms) => L + ((ms - t0) / (t1 - t0)) * (W - L - 10);
  const weeks = [];
  for (let t = now + 7 * DAY; t < t1 - 2 * DAY; t += 7 * DAY) weeks.push(t);
  return (
    <div className="viz" ref={box}>
      <svg viewBox={`0 0 ${W} ${H}`} className="viz-svg" role="img" aria-label="Predicted next failure per recurring problem">
        <rect x={x(now)} y={top - 8} width={W - 10 - x(now)} height={H - top + 8} className="fc-future" />
        {weeks.map((t) => (
          <g key={t}>
            <line x1={x(t)} x2={x(t)} y1={top - 8} y2={H} className="grid" />
            <text x={x(t)} y={12} className="axis" textAnchor="middle">{fmtDate(t)}</text>
          </g>
        ))}
        <line x1={x(now)} x2={x(now)} y1={top - 8} y2={H} className="fc-today" />
        <text x={x(now)} y={12} className="axis fc-today-label" textAnchor="middle">today</text>
        {items.map((r, i) => {
          const y = top + i * lane + lane / 2, last = Date.parse(r.lastAt), next = Date.parse(r.nextAt);
          const days = Math.round((next - now) / DAY);
          const tone = days <= 2 ? "var(--danger)" : days <= 7 ? "var(--amber)" : "var(--ember)";
          const when = days < 0 ? `overdue ${-days}d` : days === 0 ? "today" : `in ${days}d`;
          return (
            <g key={r.key} onMouseLeave={hide}
              onMouseMove={(e) => show(e, <><b>{label(r.category)} · {r.place}</b><span>{r.count} failures, every ~{r.everyDays} days</span><span>last {fmtDate(last)} → next ~{fmtDate(next)}</span></>)}>
              <rect x="0" y={y - lane / 2} width={W} height={lane} fill="transparent" />
              <text x="0" y={y - 3} className="fc-name">{label(r.category)} <tspan className="fc-place">{r.place}</tspan></text>
              <text x="0" y={y + 13} className="axis">{r.count}× · every ~{Math.round(r.everyDays)}d</text>
              <line x1={x(last)} x2={x(next)} y1={y} y2={y} className="fc-gap" />
              <circle cx={x(last)} cy={y} r="4.5" className="fc-last" />
              <circle cx={x(next)} cy={y} r="7" fill={tone} className="fc-next" />
              <text x={x(next) + 13} y={y + 4} className="fc-when" fill={tone}>{when}</text>
            </g>
          );
        })}
      </svg>
      {el}
    </div>
  );
}


// Health band, always shown with its word so it never relies on colour alone.
export const band = (s) => (s >= 80 ? ["good", "var(--ok)"] : s >= 60 ? ["fair", "var(--amber)"] : ["poor", "var(--danger)"]);

// Isometric clay campus. Roof tint = building health, number in front = health score, pins = open issues (red = safety).
const BLOCKS = [ // name, x, y, width, depth, height (campus units)
  ["Block A", 40, 46, 150, 86, 38], ["Block C", 230, 40, 170, 96, 54], ["Block D", 440, 46, 120, 86, 30],
  ["Block B", 40, 196, 140, 86, 30], ["Block L", 240, 192, 120, 100, 22], ["Block H", 410, 200, 150, 80, 60],
];
const TREES = [[210, 290], [205, 24], [420, 168], [585, 150], [22, 168], [385, 300], [585, 300], [20, 24]];
const NAMES = { "Block L": "Library", "Block H": "Hostel" };
const C = Math.cos(Math.PI / 6), S = 0.5;
const iso = (x, y, z = 0) => [(x - y) * C, (x + y) * S - z];
const poly = (...ps) => ps.map((p) => iso(...p).map((v) => v.toFixed(1)).join(",")).join(" ");

function Block({ b: [name, x, y, w, d, h], health, onSelect, show, hide }) {
  const hl = health?.[name];
  const [word, tone] = hl ? band(hl.score) : [];
  const floors = [];
  for (let z = 13; z < h - 4; z += 13) floors.push(z);
  return (
    <g className="iso-b" onClick={() => onSelect(name)} onMouseLeave={hide}
      onMouseMove={(e) => show(e, hl ? <><b>{NAMES[name] ?? name} · health {hl.score} ({word})</b><span>fixed on time {hl.parts.speed ?? "–"}{hl.parts.speed != null ? "%" : ""} · 👍 {hl.parts.happy ?? "–"}{hl.parts.happy != null ? "%" : ""}</span><span>{hl.open} open{hl.safety ? ` · ${hl.safety} safety` : ""}</span><span className="faint">click to see its tickets</span></> : <><b>{NAMES[name] ?? name}</b><span className="faint">no tickets yet</span></>)}>
      <polygon points={poly([x, y + d, 0], [x + w, y + d, 0], [x + w, y + d, h], [x, y + d, h])} className="iso-left" />
      <polygon points={poly([x + w, y, 0], [x + w, y + d, 0], [x + w, y + d, h], [x + w, y, h])} className="iso-right" />
      {floors.map((z) => <polyline key={z} points={poly([x + 4, y + d, z], [x + w - 4, y + d, z])} className="iso-floor" />)}
      {floors.map((z) => <polyline key={`r${z}`} points={poly([x + w, y + d - 4, z], [x + w, y + 4, z])} className="iso-floor" />)}
      <polygon points={poly([x, y, h], [x + w, y, h], [x + w, y + d, h], [x, y + d, h])} className="iso-top"
        style={tone ? { fill: `color-mix(in oklab, ${tone} 16%, var(--clay-top))` } : undefined} />
    </g>
  );
}

export function CampusIso({ buildings, health, onSelect }) {
  const { box, show, hide, el } = useTip();
  const open = Object.fromEntries(buildings.map((b) => [b.building, b]));
  const hb = Object.fromEntries(health.map((h) => [h.building, h]));
  // painter's order: far (small x+y) first, trees mixed in
  const items = [
    ...BLOCKS.map((b) => ({ k: b[1] + b[3] / 2 + b[2] + b[4] / 2, b })),
    ...TREES.map((t) => ({ k: t[0] + t[1], t })),
  ].sort((a, b) => a.k - b.k);
  return (
    <div className="viz" ref={box}>
      <svg viewBox="-300 -40 840 520" className="viz-svg iso" role="img" aria-label="Isometric campus map: building health scores and open issues">
        <polygon points={poly([0, 320, 0], [600, 320, 0], [600, 320, -12], [0, 320, -12])} className="iso-slab-l" />
        <polygon points={poly([600, 0, 0], [600, 320, 0], [600, 320, -12], [600, 0, -12])} className="iso-slab-r" />
        <polygon points={poly([0, 0, 0], [600, 0, 0], [600, 320, 0], [0, 320, 0])} className="iso-ground" />
        <polygon points={poly([12, 158, 0], [588, 158, 0], [588, 172, 0], [12, 172, 0])} className="iso-path" />
        <polygon points={poly([303, 12, 0], [317, 12, 0], [317, 308, 0], [303, 308, 0])} className="iso-path" />
        {items.map((it) => it.b
          ? <Block key={it.b[0]} b={it.b} health={hb} onSelect={onSelect} show={show} hide={hide} />
          : (() => { const [tx, ty] = iso(it.t[0], it.t[1]); return (
              <g key={`t${it.k}`} className="iso-tree"><line x1={tx} y1={ty} x2={tx} y2={ty - 12} /><circle cx={tx} cy={ty - 18} r="9" /></g>
            ); })())}
        {BLOCKS.map(([name, x, y, w, d, h]) => {
          const hl = hb[name], [lx, ly] = iso(x + w * 0.6, y + d * 0.72, h);
          const [word, tone] = hl ? band(hl.score) : [];
          return (
            <g key={name} className="iso-label" pointerEvents="none">
              <rect x={lx - 40} y={ly - 15} width="80" height={hl ? 38 : 22} rx="6" />
              <text x={lx} y={ly} textAnchor="middle" className="iso-name">{NAMES[name] ?? name}</text>
              {hl && <text x={lx} y={ly + 17} textAnchor="middle" className="iso-score" fill={tone}>{hl.score}<tspan className="iso-word"> {word}</tspan></text>}
            </g>
          );
        })}
        {BLOCKS.map(([name, x, y, w, d, h], i) => {
          const b = open[name];
          if (!b?.open) return null;
          const r = 10 + Math.min(b.open, 5) * 2;
          const [tx, ty] = iso(x + w * 0.35, y + d * 0.28, h);
          const cy = ty - r * 1.7 - 6;
          return (
            <g key={name} className={`pin ${b.safety ? "hazard" : ""}`} style={{ "--d": `${300 + i * 90}ms` }} pointerEvents="none">
              <ellipse cx={tx} cy={ty} rx={r * 0.6} ry={r * 0.22} className="pin-shadow" />
              {b.safety > 0 && <circle cx={tx} cy={cy} r={r} className="pin-ring" />}
              <path d={`M${tx - r * 0.62},${cy + r * 0.78} L${tx},${ty - 6} L${tx + r * 0.62},${cy + r * 0.78} Z`} className="pin-head" />
              <circle cx={tx} cy={cy} r={r} className="pin-head" />
              <text x={tx} y={cy + 4.5} textAnchor="middle" className="pin-n">{b.open}</text>
            </g>
          );
        })}
      </svg>
      <div className="legend scale">
        <span><i className="sw round" style={{ background: "var(--ember)" }} />open issues (pin size = count)</span>
        <span><i className="sw round" style={{ background: "var(--danger)" }} />safety hazard</span>
        <span className="faint">number = health score, roof tint = good / fair / poor</span>
      </div>
      {el}
    </div>
  );
}

const reduced = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

// Number that counts up to its value (eases out over ~0.9 s). Re-animates from the old value when it changes.
export function CountUp({ value, decimals = 0 }) {
  const [shown, setShown] = useState(reduced() ? value : 0);
  const from = useRef(0);
  useEffect(() => {
    if (value == null || reduced()) return setShown(value);
    const start = performance.now(), a = from.current, d = 900;
    let raf;
    const tick = (now) => {
      const p = Math.min(1, (now - start) / d), e = 1 - Math.pow(1 - p, 3);
      setShown(a + (value - a) * e);
      if (p < 1) raf = requestAnimationFrame(tick);
      else from.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  if (value == null) return "–";
  return Number(shown).toFixed(decimals);
}

// Small area sparkline that draws itself in.
export function Sparkline({ values, color = "var(--ember)", label }) {
  const W = 120, H = 34;
  const vs = values.length > 1 ? values : [0, ...values, 0];
  const max = Math.max(1, ...vs), step = W / (vs.length - 1);
  const pts = vs.map((v, i) => [i * step, H - 3 - (v / max) * (H - 6)]);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join("");
  const id = useMemo(() => `sg${Math.random().toString(36).slice(2, 8)}`, []);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="sparkline" role="img" aria-label={label} preserveAspectRatio="none">
      <defs><linearGradient id={id} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={color} stopOpacity="0.32" /><stop offset="1" stopColor={color} stopOpacity="0" /></linearGradient></defs>
      <path d={`${line}L${W},${H}L0,${H}Z`} fill={`url(#${id})`} className="spark-area" />
      <path d={line} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" pathLength="1" className="spark-line" />
    </svg>
  );
}

// Donut with an animated sweep, hover to highlight a slice, direct legend with counts and shares.
// segments: [{ key, label, value, color }]
export function Donut({ segments, center, sub, onSelect }) {
  const { box, show, hide, el } = useTip();
  const [hover, setHover] = useState(null);
  const total = segments.reduce((n, s) => n + s.value, 0);
  const R = 52, SW = 14, C = 2 * Math.PI * R, GAP = total && segments.filter((s) => s.value).length > 1 ? 2.5 : 0;
  let acc = 0;
  return (
    <div className="viz donut-wrap" ref={box}>
      <div className="donut">
        <svg viewBox="0 0 140 140" role="img" aria-label={`${sub}: ${segments.map((s) => `${s.label} ${s.value}`).join(", ")}`} onMouseLeave={() => (hide(), setHover(null))}>
          <circle cx="70" cy="70" r={R} className="donut-track" strokeWidth={SW} />
          {total > 0 && segments.map((s, i) => {
            if (!s.value) return null;
            const len = (s.value / total) * C, off = acc;
            acc += len;
            return (
              <circle key={s.key} cx="70" cy="70" r={R} fill="none" stroke={s.color} strokeWidth={hover === s.key ? SW + 4 : SW}
                strokeDasharray={`${Math.max(0, len - GAP)} ${C}`} strokeDashoffset={-off}
                className={`donut-seg ${hover && hover !== s.key ? "dim" : ""}`} style={{ "--len": len, "--d": `${i * 90}ms` }}
                onClick={() => onSelect?.(s.key)}
                onMouseMove={(e) => (setHover(s.key), show(e, <><b>{s.label}</b><span>{s.value} · {Math.round((s.value / total) * 100)}%</span></>))} />
            );
          })}
        </svg>
        <div className="donut-center"><span className="serif"><CountUp value={center ?? total} /></span><small className="mono faint">{sub}</small></div>
      </div>
      <ul className="donut-legend">
        {segments.map((s) => (
          <li key={s.key} className={hover && hover !== s.key ? "dim" : ""} onMouseEnter={() => setHover(s.key)} onMouseLeave={() => setHover(null)}>
            <i className="sw round" style={{ background: s.color }} />
            <span>{s.label}</span>
            <span className="mono">{s.value}</span>
            <span className="mono faint">{total ? Math.round((s.value / total) * 100) : 0}%</span>
          </li>
        ))}
      </ul>
      {el}
    </div>
  );
}

// Half-ring gauge for a percentage (0–100), sweeps in on load.
export function Gauge({ value, color = "var(--ember)", label }) {
  const R = 44, L = Math.PI * R, v = Math.max(0, Math.min(100, value ?? 0));
  return (
    <svg viewBox="0 0 100 56" className="gauge" role="img" aria-label={`${label}: ${value ?? "no data"}%`}>
      <path d="M6,50 A44,44 0 0 1 94,50" className="gauge-track" pathLength={L} />
      {value != null && <path d="M6,50 A44,44 0 0 1 94,50" className="gauge-fill" stroke={color} strokeDasharray={`${(v / 100) * L} ${L}`} style={{ "--l": L }} />}
    </svg>
  );
}

// One thin 100% bar split into parts, with a legend underneath. parts: [{ key, label, value, color }]
export function StackBar({ parts }) {
  const total = parts.reduce((n, p) => n + p.value, 0);
  return (
    <div className="stackbar-wrap">
      <span className="stackbar" aria-hidden="true">
        {total ? parts.filter((p) => p.value).map((p, i) => <i key={p.key} style={{ flexGrow: p.value, background: p.color, "--d": `${i * 80}ms` }} />) : <i className="empty" />}
      </span>
      <span className="stackbar-legend">
        {parts.filter((p) => p.value).map((p) => <span key={p.key}><i className="sw round" style={{ background: p.color }} />{p.value} {p.label}</span>)}
      </span>
    </div>
  );
}

// Horizontal stacked bars, one row per group, same scale across rows. Hover a segment for its count.
// rows: [{ label, parts: [{ key, value }] }], keys: [{ key, label, color }]
export function StackedBars({ rows, keys, onSelect }) {
  const { box, show, hide, el } = useTip();
  const [hover, setHover] = useState(null);
  const max = Math.max(1, ...rows.map((r) => r.parts.reduce((n, p) => n + p.value, 0)));
  const color = Object.fromEntries(keys.map((k) => [k.key, k.color]));
  const name = Object.fromEntries(keys.map((k) => [k.key, k.label]));
  return (
    <div className="viz" ref={box}>
      <div className="legend">
        {keys.map((k) => <span key={k.key} className={hover && hover !== k.key ? "dim" : ""} onMouseEnter={() => setHover(k.key)} onMouseLeave={() => setHover(null)}><i className="sw" style={{ background: k.color }} />{k.label}</span>)}
      </div>
      <div className="sbars">
        {rows.map((r, ri) => {
          const total = r.parts.reduce((n, p) => n + p.value, 0);
          return (
            <div key={r.label} className="sbar-row" onClick={() => onSelect?.(r.label)}>
              <span className="sbar-label">{r.label}</span>
              <span className="sbar-track">
                <span className="sbar-fill" style={{ width: `${(total / max) * 100}%`, "--d": `${ri * 60}ms` }}>
                  {r.parts.filter((p) => p.value).map((p) => (
                    <i key={p.key} className={hover && hover !== p.key ? "dim" : ""} style={{ flexGrow: p.value, background: color[p.key] }}
                      onMouseMove={(e) => (setHover(p.key), show(e, <><b>{r.label}</b><span>{p.value} {name[p.key].toLowerCase()}</span><span className="faint">{total} tickets in all</span></>))}
                      onMouseLeave={() => (setHover(null), hide())} />
                  ))}
                </span>
              </span>
              <span className="sbar-total mono">{total}</span>
            </div>
          );
        })}
      </div>
      {el}
    </div>
  );
}
