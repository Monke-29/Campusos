import { useEffect, useLayoutEffect, useRef, useState, lazy, Suspense } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import { Link } from "../lib/api.jsx";
import "./landing.css";

gsap.registerPlugin(ScrollTrigger);
const Campus = lazy(() => import("./Campus.jsx"));


const MANIFESTO =
  "Projectors, Wi-Fi, water coolers, hostel repairs. Students report them on Google Forms, registers and WhatsApp groups. Those tools only record. Nobody owns the issue. Duplicates pile up. Nothing escalates. So students stop reporting.";

const STEPS = [
  { n: "01", t: "Understand", d: "A photo, a voice note in Kannada, a two-word WhatsApp. The agent pulls out the issue, building, room, urgency and whether anyone could get hurt.", v: "understand" },
  { n: "02", t: "Merge", d: "The fifteenth report about the same projector doesn't become ticket fifteen. It becomes ×15 on the one that already exists, and the priority climbs.", v: "merge" },
  { n: "03", t: "Assign", d: "Routed to the team that actually fixes it, with a deadline that matches the problem. Wi-Fi gets 12 hours. A loose wire gets 8.", v: "assign" },
  { n: "04", t: "Escalate", d: "Nothing quietly rots. Miss the deadline and the ticket lands on the HoD's desk, with the report count attached.", v: "escalate" },
  { n: "05", t: "Prove", d: "A ticket closes on evidence: the technician's after-photo is checked against the original by a vision model.", v: "prove" },
  { n: "06", t: "Close the loop", d: "Every student who reported it hears back. All fifteen. That's what makes them report the next one.", v: "close" },
];

const TOOLS = [
  ["report_issue", "auto"], ["list_tickets", "auto"], ["get_ticket", "auto"], ["ticket_stats", "auto"],
  ["check_overdue", "auto"], ["request_escalation", "approval"], ["request_resolution", "approval"],
];

function Vignette({ kind }) {
  if (kind === "understand")
    return (
      <div className="vg vg-understand">
        <p className="vg-quote">“c204 projector dead again, class can't start”</p>
        <div className="vg-json mono">
          {[["category", "projector"], ["building", "Block C"], ["room", "204"], ["urgency", "high"], ["safety", "false"]].map(([k, v], i) => (
            <div key={k} style={{ "--i": i }}><span className="faint">{k}</span><span>{v}</span></div>
          ))}
        </div>
      </div>
    );
  if (kind === "merge")
    return (
      <div className="vg vg-merge">
        <div className="vg-stack">{Array.from({ length: 5 }, (_, i) => <span key={i} style={{ "--i": i }} />)}</div>
        <div className="vg-count serif">×<b data-count="15">15</b></div>
        <p className="mono faint">T1001 · Projector · C-204</p>
      </div>
    );
  if (kind === "assign")
    return (
      <div className="vg vg-assign">
        {[["IT & AV Team", "24h"], ["Network Team", "12h"], ["Electrical", "8h"], ["Facilities", "24h"]].map(([d, h], i) => (
          <div key={d} className={i === 0 ? "on" : ""}><span>{d}</span><span className="mono">{h}</span></div>
        ))}
      </div>
    );
  if (kind === "escalate")
    return (
      <div className="vg vg-escalate">
        <div className="vg-bar"><i /></div>
        <div className="mono vg-row"><span>SLA 24h</span><span className="danger">+6h overdue</span></div>
        <div className="vg-hod"><span className="pill danger"><span className="dot live" />escalated</span><span>HoD / Facility Head</span></div>
      </div>
    );
  if (kind === "prove")
    return (
      <div className="vg vg-prove">
        <div className="vg-photo before"><span className="mono">NO SIGNAL</span></div>
        <div className="vg-photo after"><span className="serif">Lecture 12</span></div>
        <span className="pill ok vg-verdict">fixed · 94%</span>
      </div>
    );
  return (
    <div className="vg vg-close">
      {Array.from({ length: 15 }, (_, i) => <span key={i} style={{ "--i": i }} />)}
      <p className="mono faint">15 of 15 notified</p>
    </div>
  );
}

function Countdown() {
  const [s, setS] = useState(7200);
  useEffect(() => {
    const id = setInterval(() => setS((x) => (x > 0 ? x - 1 : 7200)), 1000);
    return () => clearInterval(id);
  }, []);
  const p = (n) => String(n).padStart(2, "0");
  return <span className="countdown serif">{p(Math.floor(s / 3600))}:{p(Math.floor((s % 3600) / 60))}:{p(s % 60)}</span>;
}

function CompareSlider() {
  const ref = useRef(null);
  const [x, setX] = useState(50);
  const drag = useRef(false);
  // sweep once on first view, so it's obvious the handle moves
  useEffect(() => {
    const o = { v: 88 };
    const st = ScrollTrigger.create({
      trigger: ref.current, start: "top 70%", once: true,
      onEnter: () => gsap.fromTo(o, { v: 88 }, { v: 50, duration: 1.6, ease: "expo.inOut", onUpdate: () => !drag.current && setX(o.v) }),
    });
    return () => st.kill();
  }, []);
  const move = (e) => {
    const r = ref.current.getBoundingClientRect();
    setX(Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100)));
  };
  return (
    <div
      ref={ref}
      className="compare"
      style={{ "--x": `${x}%` }}
      onPointerDown={(e) => { drag.current = true; e.currentTarget.setPointerCapture(e.pointerId); move(e); }}
      onPointerMove={(e) => drag.current && move(e)}
      onPointerUp={() => (drag.current = false)}
      role="slider"
      aria-label="Before and after the repair"
      aria-valuenow={Math.round(x)}
      aria-valuemin={0}
      aria-valuemax={100}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") setX((v) => Math.max(0, v - 5));
        if (e.key === "ArrowRight") setX((v) => Math.min(100, v + 5));
      }}
    >
      <div className="screen after">
        <div className="slide">
          <span className="mono faint">ME201 · Lecture 12</span>
          <h4>Entropy, and why your<br />coffee goes cold</h4>
          <div className="slide-lines"><i /><i /><i /></div>
        </div>
        <span className="tag pill ok">after · verified</span>
      </div>
      <div className="screen before">
        <div className="nosignal"><span className="mono">NO SIGNAL</span><small className="mono">HDMI 1</small></div>
        <span className="tag pill danger">before · reported ×15</span>
      </div>
      <div className="handle"><span /></div>
    </div>
  );
}

export default function Landing() {
  const root = useRef(null);
  const progress = useRef(0);
  const pointer = useRef({ x: 0, y: 0 });
  const [count, setCount] = useState(1);

  useEffect(() => {
    const onMove = (e) => (pointer.current = { x: e.clientX / innerWidth - 0.5, y: e.clientY / innerHeight - 0.5 });
    addEventListener("pointermove", onMove, { passive: true });
    return () => removeEventListener("pointermove", onMove);
  }, []);

  useLayoutEffect(() => {
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const lenis = reduce ? null : new Lenis({ duration: 1.15, easing: (t) => 1 - Math.pow(1 - t, 4) });
    const raf = (t) => lenis?.raf(t * 1000);
    if (lenis) {
      lenis.on("scroll", ScrollTrigger.update);
      gsap.ticker.add(raf);
      gsap.ticker.lagSmoothing(0);
    }
    // in-page anchors go through Lenis so they glide too
    const onAnchor = (e) => {
      const a = e.target.closest('a[href^="#"]');
      if (!a) return;
      e.preventDefault();
      const el = document.querySelector(a.getAttribute("href"));
      lenis ? lenis.scrollTo(el, { offset: -40 }) : el?.scrollIntoView();
    };
    document.addEventListener("click", onAnchor);

    const ctx = gsap.context(() => {
      // ---- intro ----
      gsap.from(".hero-line > span", { yPercent: 110, rotate: 2, duration: 1.3, ease: "expo.out", stagger: 0.09, delay: 0.15 });
      gsap.from(".hero-sub, .hero-cta, .hero-meta", { opacity: 0, y: 18, duration: 1, ease: "power3.out", stagger: 0.08, delay: 0.7 });
      gsap.from(".hero-canvas", { opacity: 0, scale: 0.96, duration: 1.8, ease: "expo.out", delay: 0.2 });

      // ---- hero scroll: pins pop up over Block C, then merge into one ticket ----
      const hero = gsap.timeline({
        scrollTrigger: {
          trigger: ".hero", start: "top top", end: "bottom bottom", scrub: true,
          onUpdate: (st) => {
            progress.current = st.progress;
            setCount(Math.max(0, Math.min(15, Math.ceil((st.progress - 0.08) / 0.024))));
          },
        },
      });
      hero
        .to(".hero-copy", { opacity: 0, y: -60, filter: "blur(6px)", duration: 0.14, ease: "none" }, 0.02)
        .fromTo(".hero-counter", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.08, ease: "none" }, 0.1)
        .to(".hero-counter", { opacity: 0, y: -20, duration: 0.06, ease: "none" }, 0.56)
        .fromTo(".hero-ticket", { opacity: 0, y: 40, filter: "blur(8px)" }, { opacity: 1, y: 0, filter: "blur(0px)", duration: 0.12, ease: "none" }, 0.62)
        .fromTo(".hero-ticket .meta > *", { opacity: 0, y: 10 }, { opacity: 1, y: 0, stagger: 0.02, duration: 0.06, ease: "none" }, 0.68)
        .to(".scroll-hint", { opacity: 0, duration: 0.05 }, 0);

      // ---- manifesto: words light up as you read ----
      gsap.fromTo(".manifesto .w", { opacity: 0.12 }, {
        opacity: 1, stagger: 0.05, ease: "none",
        scrollTrigger: { trigger: ".manifesto", start: "top 75%", end: "bottom 55%", scrub: true },
      });

      // ---- generic reveals ----
      gsap.utils.toArray(".reveal").forEach((el) =>
        gsap.from(el, { opacity: 0, y: 40, duration: 1.1, ease: "expo.out", scrollTrigger: { trigger: el, start: "top 85%" } })
      );
      gsap.utils.toArray(".split-up").forEach((el) =>
        gsap.from(el.querySelectorAll(".ln > span"), {
          yPercent: 110, duration: 1.2, ease: "expo.out", stagger: 0.08, scrollTrigger: { trigger: el, start: "top 82%" },
        })
      );

      // ---- the loop: horizontal scroll on desktop ----
      const mm = gsap.matchMedia();
      mm.add("(min-width: 900px)", () => {
        const track = document.querySelector(".loop-track");
        const dist = () => track.scrollWidth - innerWidth + parseFloat(getComputedStyle(track).paddingLeft);
        const tween = gsap.to(track, {
          x: () => -dist(), ease: "none",
          scrollTrigger: { trigger: ".loop", start: "top top", end: () => `+=${dist()}`, pin: true, scrub: 0.6, invalidateOnRefresh: true },
        });
        gsap.utils.toArray(".step").forEach((step) =>
          ScrollTrigger.create({
            trigger: step, containerAnimation: tween, start: "left 70%", end: "right 30%",
            toggleClass: { targets: step, className: "live" },
          })
        );
        gsap.to(".loop-progress i", { scaleX: 1, ease: "none", scrollTrigger: { trigger: ".loop", start: "top top", end: () => `+=${dist()}`, scrub: true } });
      });
      mm.add("(max-width: 899px)", () => {
        gsap.utils.toArray(".step").forEach((step) =>
          ScrollTrigger.create({ trigger: step, start: "top 70%", toggleClass: { targets: step, className: "live" }, once: true })
        );
      });

      // ---- safety: the page heats up ----
      gsap.timeline({ scrollTrigger: { trigger: ".safety", start: "top 70%", end: "bottom 30%", scrub: true } })
        .to(".safety-bg", { opacity: 1, duration: 0.3 })
        .to(".safety-bg", { opacity: 1, duration: 0.4 })
        .to(".safety-bg", { opacity: 0, duration: 0.3 });
      gsap.from(".safety h2 .ln > span", { yPercent: 115, skewY: 4, duration: 1.2, ease: "expo.out", stagger: 0.1, scrollTrigger: { trigger: ".safety", start: "top 60%" } });

      // ---- channels: cards rise with a slight rotation ----
      gsap.from(".channel", { y: 90, rotate: (i) => (i - 1) * 4, opacity: 0, duration: 1.2, ease: "expo.out", stagger: 0.1, scrollTrigger: { trigger: ".channels-grid", start: "top 80%" } });

      // ---- MCP terminal: lines type in ----
      ScrollTrigger.create({ trigger: ".terminal", start: "top 75%", once: true, onEnter: () => document.querySelector(".terminal").classList.add("typing") });

      // ---- numbers count up ----
      gsap.utils.toArray("[data-to]").forEach((el) => {
        const to = parseFloat(el.dataset.to), obj = { v: 0 };
        gsap.to(obj, {
          v: to, duration: 1.8, ease: "expo.out", scrollTrigger: { trigger: el, start: "top 88%" },
          onUpdate: () => (el.textContent = (to % 1 ? obj.v.toFixed(1) : Math.round(obj.v)) + (el.dataset.suffix || "")),
        });
      });

      // ---- final CTA: giant type slides in from the sides ----
      gsap.fromTo(".cta-big .l1", { xPercent: -12 }, { xPercent: 0, ease: "none", scrollTrigger: { trigger: ".cta", start: "top bottom", end: "center center", scrub: true } });
      gsap.fromTo(".cta-big .l2", { xPercent: 12 }, { xPercent: 0, ease: "none", scrollTrigger: { trigger: ".cta", start: "top bottom", end: "center center", scrub: true } });
    }, root);

    // fonts change line heights; re-measure once they're in
    document.fonts?.ready.then(() => ScrollTrigger.refresh());

    return () => {
      ctx.revert();
      document.removeEventListener("click", onAnchor);
      if (lenis) gsap.ticker.remove(raf), lenis.destroy();
    };
  }, []);

  const words = MANIFESTO.split(" ");

  return (
    <main ref={root} className="landing">
      {/* ---------------- HERO ---------------- */}
      <section className="hero">
        <div className="hero-stage">
          <div className="hero-canvas">
            <Suspense fallback={null}>
              <Campus progress={progress} pointer={pointer} />
            </Suspense>
          </div>
          <div className="hero-vignette" />

          <div className="hero-copy">
            <span className="eyebrow hero-meta">wHACKiest 2026 · Make MCP Matter</span>
            <h1>
              <span className="hero-line"><span>Fifteen students.</span></span>
              <span className="hero-line"><span>One broken projector.</span></span>
              <span className="hero-line"><span><em>Zero updates.</em></span></span>
            </h1>
            <p className="hero-sub muted">CampusOS is an AI agent that doesn't just record campus complaints. It gets them fixed.</p>
            <div className="hero-cta">
              <Link to="/report" className="btn btn-ember">Report an issue <span className="arrow">→</span></Link>
              <Link to="/admin" className="btn">Open the dashboard</Link>
            </div>
          </div>

          <div className="hero-counter" aria-live="polite">
            <span className="big serif">{count}</span>
            <p><b>complaints about one projector</b><span className="muted">Block C, room 204. Each one would have been a separate form, register entry or WhatsApp message.</span></p>
          </div>

          <div className="hero-ticket">
            <span className="eyebrow">T1001 · open</span>
            <h2>One ticket. <em>×15.</em></h2>
            <div className="meta mono">
              <span>Projector · Block C 204</span>
              <span>IT &amp; AV Team</span>
              <span className="ember">due in 24h</span>
              <span>blocks 6 lectures · 240 students today</span>
            </div>
          </div>

          <div className="scroll-hint mono faint"><span />scroll</div>
        </div>
      </section>

      {/* ---------------- MANIFESTO ---------------- */}
      <section className="manifesto">
        <span className="eyebrow">The problem</span>
        <p>
          {words.map((w, i) => <span key={i} className="w">{w} </span>)}
        </p>
      </section>

      {/* ---------------- LOOP ---------------- */}
      <section className="loop" id="loop">
        <div className="loop-head">
          <span className="eyebrow">How it works</span>
          <h2 className="split-up">
            <span className="ln"><span>Report once.</span></span>
            <span className="ln"><span><em>The loop</em> does the rest.</span></span>
          </h2>
          <div className="loop-progress"><i /></div>
        </div>
        <div className="loop-track">
          {STEPS.map((s) => (
            <article key={s.n} className="step">
              <div className="step-top">
                <span className="step-n serif">{s.n}</span>
                <h3>{s.t}</h3>
              </div>
              <Vignette kind={s.v} />
              <p className="muted">{s.d}</p>
            </article>
          ))}
        </div>
      </section>

      {/* ---------------- SAFETY ---------------- */}
      <section className="safety">
        <div className="safety-bg" />
        <div className="safety-inner">
          <span className="eyebrow">Safety fast lane</span>
          <h2>
            <span className="ln"><span>Sparks don't wait</span></span>
            <span className="ln"><span><em>twenty-four hours.</em></span></span>
          </h2>
          <div className="safety-row reveal">
            <Countdown />
            <p className="muted">
              Exposed wires, smoke, water near a socket: flagged <b>critical</b> on arrival, a 2-hour deadline,
              and the top of every dashboard. Even if only one person reported it.
            </p>
          </div>
        </div>
      </section>

      {/* ---------------- CHANNELS ---------------- */}
      <section className="channels">
        <div className="section-head">
          <span className="eyebrow">Channels</span>
          <h2 className="split-up">
            <span className="ln"><span>Tell it the way</span></span>
            <span className="ln"><span>you'd tell <em>a friend.</em></span></span>
          </h2>
        </div>
        <div className="channels-grid">
          <article className="channel">
            <span className="mono faint">WhatsApp</span>
            <div className="chat">
              <p className="me">cooler leaking near H-105 🙃 <small>[photo]</small></p>
              <p className="bot">Ticket T1003 created: water, Block H 105, high. Assigned to Facilities. I'll message you when it's fixed.</p>
            </div>
          </article>
          <article className="channel">
            <span className="mono faint">Voice · ಕನ್ನಡ</span>
            <div className="wave">{Array.from({ length: 28 }, (_, i) => <i key={i} style={{ "--i": i }} />)}</div>
            <p className="kn">“ಸಿ-204 ರಲ್ಲಿ ಪ್ರೊಜೆಕ್ಟರ್ ಕೆಲಸ ಮಾಡುತ್ತಿಲ್ಲ”</p>
            <p className="mono faint">→ projector · Block C 204 · high</p>
          </article>
          <article className="channel">
            <span className="mono faint">Web · photo</span>
            <div className="photo-drop"><span className="serif">Drop a photo</span><small className="mono faint">the vision model reads it</small></div>
            <p className="mono faint">→ electrical · Block B 110 · critical</p>
          </article>
        </div>
      </section>

      {/* ---------------- MCP ---------------- */}
      <section className="mcp" id="mcp">
        <div className="mcp-copy">
          <span className="eyebrow">Built on MCP</span>
          <h2 className="split-up">
            <span className="ln"><span>Any assistant can run</span></span>
            <span className="ln"><span>campus maintenance.</span></span>
            <span className="ln"><span><em>None can go rogue.</em></span></span>
          </h2>
          <p className="muted reveal">
            CampusOS is an MCP server. A voice agent, a desktop assistant or an admin bot gets a fixed set of tools.
            Reading and reporting are automatic. Escalating and closing need a human's approval, and every call lands in the audit log.
          </p>
          <ul className="tools reveal">
            {TOOLS.map(([t, mode]) => (
              <li key={t}><span className="mono">{t}</span><span className={`pill ${mode === "auto" ? "" : "ember"}`}>{mode === "auto" ? "auto" : "needs approval"}</span></li>
            ))}
          </ul>
        </div>
        <div className="terminal" aria-label="Example MCP session">
          <div className="term-bar"><i /><i /><i /><span className="mono faint">voice-agent → campusos</span></div>
          <div className="term-body mono">
            {[
              ["u", "“The projector in C-204 is dead again”"],
              ["c", "→ report_issue({ text, channel: \"voice\" })"],
              ["o", "  merged into T1001 · reports: 15 · IT & AV"],
              ["u", "“Close it, it's working now”"],
              ["c", "→ request_resolution({ ticketId: \"T1001\" })"],
              ["w", "  pending_approval · waiting for an admin"],
              ["a", "✓ admin approved · 15 students notified"],
            ].map(([k, t], i) => (
              <div key={i} className={`tl ${k}`} style={{ "--i": i, "--n": t.length }}><span>{t}</span></div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------- PROOF ---------------- */}
      <section className="proof">
        <div className="section-head">
          <span className="eyebrow">Proof of fix</span>
          <h2 className="split-up">
            <span className="ln"><span>Closed means</span></span>
            <span className="ln"><span><em>actually fixed.</em></span></span>
          </h2>
          <p className="muted reveal">Drag. The technician's after-photo is compared with the original report before anyone gets told it's done.</p>
        </div>
        <CompareSlider />
      </section>

      {/* ---------------- NUMBERS ---------------- */}
      <section className="numbers">
        <div className="num reveal"><span className="serif" data-to="15">0</span><p className="muted">complaints, one ticket</p></div>
        <div className="num reveal"><span className="serif" data-to="2" data-suffix="h">0</span><p className="muted">deadline for safety hazards</p></div>
        <div className="num reveal"><span className="serif" data-to="4.5" data-suffix=" cr">0</span><p className="muted">students in Indian higher education</p></div>
        <div className="num reveal"><span className="serif" data-to="0">0</span><p className="muted">new apps to install</p></div>
      </section>

      {/* ---------------- CTA ---------------- */}
      <section className="cta">
        <h2 className="cta-big">
          <span className="l1">Stop recording.</span>
          <span className="l2"><em>Get it fixed.</em></span>
        </h2>
        <div className="cta-row">
          <Link to="/report" className="btn btn-ember">Report an issue <span className="arrow">→</span></Link>
          <Link to="/admin" className="btn">Open the dashboard</Link>
        </div>
      </section>

      <footer className="footer">
        <span className="brand-sm serif">Campus<i>OS</i></span>
        <span className="mono faint">Team CodeBrew · wHACKiest 2026 · Track 1</span>
      </footer>
    </main>
  );
}
