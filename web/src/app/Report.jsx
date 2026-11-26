import { useEffect, useRef, useState } from "react";
import { api, compressImage, fileToDataUrl, Link, myTickets, useMe, LABEL, timeLeft } from "../lib/api.jsx";

const EXAMPLES = [
  "Projector in C-204 not working",
  "Wi-Fi keeps dropping in the L-201 reading hall",
  "Sparks from the switchboard in B-110",
  "ಹಾಸ್ಟೆಲ್ H-105 ರಲ್ಲಿ ವಾಟರ್ ಕೂಲರ್ ಸೋರುತ್ತಿದೆ",
];
const LANGS = [["en-IN", "English"], ["kn-IN", "ಕನ್ನಡ"], ["hi-IN", "हिन्दी"]];
const SR = typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);

// Voice: ElevenLabs Scribe when the server has a key (record → upload), otherwise the browser's own recogniser.
function useVoice(onText, lang) {
  const [state, setState] = useState("idle"); // idle | listening | transcribing
  const [error, setError] = useState("");
  const rec = useRef(null);
  const elevenlabs = useRef(null);

  useEffect(() => {
    api("/api/config").then((c) => (elevenlabs.current = c.voice === "elevenlabs"), () => {});
  }, []);

  async function start() {
    setError("");
    if (elevenlabs.current && navigator.mediaDevices?.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const chunks = [];
        const mr = new MediaRecorder(stream);
        mr.ondataavailable = (e) => chunks.push(e.data);
        mr.onstop = async () => {
          stream.getTracks().forEach((t) => t.stop());
          setState("transcribing");
          try {
            const audio = await fileToDataUrl(new Blob(chunks, { type: mr.mimeType || "audio/webm" }));
            const { text } = await api("/api/transcribe", { audio });
            onText(text, true);
          } catch (e) {
            // Server-side voice failed: fall back to the browser recogniser for the next try.
            if (SR) elevenlabs.current = false;
            setError(SR ? "Couldn't transcribe that. Tap Speak again to use your browser's voice input, or type it." : e.message);
          }
          setState("idle");
        };
        mr.start();
        rec.current = mr;
        setState("listening");
        return;
      } catch (e) {
        setError("Microphone blocked: " + e.message);
        return;
      }
    }
    if (!SR) return setError("Voice needs Chrome or Edge (or an ElevenLabs key on the server).");
    const r = new SR();
    r.lang = lang;
    r.interimResults = true;
    r.onresult = (e) => onText(Array.from(e.results).map((x) => x[0].transcript).join(" "), e.results[e.results.length - 1].isFinal);
    r.onerror = (e) => setError(e.error === "not-allowed" ? "Microphone blocked" : e.error);
    r.onend = () => setState("idle");
    r.start();
    rec.current = r;
    setState("listening");
  }
  const stop = () => rec.current?.stop();
  return { state, error, start, stop };
}

function Result({ out, onAgain }) {
  const t = out.ticket, c = out.classification;
  const rows = [
    ["Issue", LABEL[t.category] || t.category],
    ["Where", `${t.building} · ${t.room}`],
    ["Urgency", t.urgency],
    ["Team", t.department],
    ["Deadline", timeLeft(t.dueBy)],
    ["Read by", c.source === "keywords" ? "keyword fallback" : c.source],
  ];
  return (
    <div className="result">
      <span className={`pill ${t.is_safety_hazard ? "danger" : out.merged ? "ember" : "ok"}`}>
        <span className="dot" />
        {t.is_safety_hazard ? "safety · fast lane" : out.merged ? "merged" : "new ticket"}
      </span>
      <h2>
        {out.merged ? <>Already on it. <em>You're report ×{t.reportCount}.</em></> : <>Ticket <em>{t.id}</em> is open.</>}
      </h2>
      <dl className="result-rows">
        {rows.map(([k, v], i) => (
          <div key={k} style={{ "--i": i }}><dt className="mono">{k}</dt><dd>{v}</dd></div>
        ))}
      </dl>
      {t.needsHumanReview && <p className="note amber">A person will double-check this one before it moves.</p>}
      <div className="row">
        <Link to={`/t/${t.id}`} className="btn btn-primary">Track {t.id} <span className="arrow">→</span></Link>
        <button className="btn" onClick={onAgain}>Report something else</button>
      </div>
    </div>
  );
}

export default function Report() {
  const { user } = useMe();
  const [text, setText] = useState("");
  const [studentId, setStudentId] = useState(() => { try { return localStorage.getItem("campusos.usn") || ""; } catch { return ""; } });
  const [photo, setPhoto] = useState(null);
  const [lang, setLang] = useState("en-IN");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [out, setOut] = useState(null);
  const [drag, setDrag] = useState(false);
  const usedVoice = useRef(false);
  const base = useRef("");
  const voice = useVoice((t, final) => {
    usedVoice.current = true;
    setText((base.current ? base.current + " " : "") + t);
    if (final) base.current = (base.current ? base.current + " " : "") + t;
  }, lang);

  async function pick(file) {
    if (!file) return;
    if (!file.type.startsWith("image/")) return setError("That's not an image.");
    setError("");
    setPhoto(await compressImage(file));
  }

  async function submit(e) {
    e.preventDefault();
    if (!text.trim() && !photo) return setError("Tell us what's broken, or add a photo.");
    setBusy(true);
    setError("");
    try {
      try { localStorage.setItem("campusos.usn", studentId); } catch {}
      const res = await api("/api/report", {
        text: text.trim() || "Photo report (see image)", studentId, photo, channel: usedVoice.current ? "voice" : "web",
      });
      myTickets.add(res.ticket.id);
      setOut(res);
    } catch (e) {
      setError(e.message);
    }
    setBusy(false);
  }

  const again = () => { setOut(null); setText(""); setPhoto(null); base.current = ""; usedVoice.current = false; };

  return (
    <main className="app-page report">
      <section className="report-intro">
        <span className="eyebrow">Report an issue</span>
        <h1>What's <em>broken?</em></h1>
        <p className="muted">Write it, say it or snap it. Mention the room if you can. If someone already reported it, we'll add you to that ticket instead of starting over.</p>
        <MyTickets />
      </section>

      <section className="report-card">
        {out ? (
          <Result out={out} onAgain={again} />
        ) : (
          <form onSubmit={submit} className="report-form">
            <label className="field">
              <span>The problem</span>
              <textarea
                className="input" value={text} maxLength={500} placeholder="e.g. Projector in C-204 shows no display"
                onChange={(e) => { setText(e.target.value); base.current = e.target.value; }}
              />
            </label>
            <div className="examples">
              {EXAMPLES.map((x) => (
                <button type="button" key={x} className="example" onClick={() => { setText(x); base.current = x; }}>{x}</button>
              ))}
            </div>

            <div className="tools-row">
              <div className="voice">
                <button
                  type="button"
                  className={`btn voice-btn ${voice.state}`}
                  onClick={voice.state === "listening" ? voice.stop : voice.start}
                  disabled={voice.state === "transcribing"}
                  aria-pressed={voice.state === "listening"}
                >
                  <span className="mic" />
                  {voice.state === "listening" ? "Stop" : voice.state === "transcribing" ? "Transcribing…" : "Speak"}
                </button>
                <select className="input lang" value={lang} onChange={(e) => setLang(e.target.value)} aria-label="Voice language">
                  {LANGS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>

              <label
                className={`drop ${drag ? "over" : ""} ${photo ? "has" : ""}`}
                onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
                onDragLeave={() => setDrag(false)}
                onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files[0]); }}
              >
                <input type="file" accept="image/*" capture="environment" onChange={(e) => pick(e.target.files[0])} hidden />
                {photo ? <img src={photo} alt="Attached" /> : <span>Add a photo</span>}
                {photo && <button type="button" className="drop-x" onClick={(e) => { e.preventDefault(); setPhoto(null); }} aria-label="Remove photo">×</button>}
              </label>
            </div>
            {voice.error && <p className="note amber">{voice.error}</p>}

            {user?.usn ? (
              <p className="mono faint">Reporting as {user.name} · {user.usn}. You'll see it under <Link to="/me" className="link">My reports</Link>.</p>
            ) : (
              <label className="field">
                <span>USN / student ID (optional · <Link to="/login?next=/report" className="link">sign in</Link> to track all your reports)</span>
                <input className="input" value={studentId} maxLength={40} onChange={(e) => setStudentId(e.target.value)} placeholder="1MS22CS000" />
              </label>
            )}

            {error && <p className="note danger" role="alert">{error}</p>}
            <button className="btn btn-ember submit" disabled={busy}>
              {busy ? <><span className="spinner" /> Reading your report…</> : <>Send report <span className="arrow">→</span></>}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}

function MyTickets() {
  const ids = myTickets.get();
  if (!ids.length) return null;
  return (
    <div className="mine">
      <span className="mono faint">Your reports</span>
      <div>{ids.slice(0, 6).map((id) => <Link key={id} to={`/t/${id}`} className="pill">{id}</Link>)}</div>
    </div>
  );
}
