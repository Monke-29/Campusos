# CampusOS: complete prototype, built in phases (night of 24–25 Nov 2026)

Phase 1 (ideathon submission) shipped a terminal demo, the MCP server and a plain HTML board.
This document covers the full prototype built on top of it. **Nothing is pushed to GitHub yet.** Latest: Phase G (26–27 Nov), accounts, voice agent, dashboard v3.

## How to run it

```bash
npm install
npm run build     # builds the React app into dist/
npm start         # http://localhost:3000  (API + MCP + the app)
# or, while editing the UI:
npm run dev       # http://localhost:5173  (Vite with hot reload; starts the API on :3000 too)
npm test          # agent self-check (dedup, safety lane, approvals, injection, Twilio signatures)
npm run eval      # accuracy on 30 hand-labelled complaints, writes data/accuracy.json
```

> If port 3000 is busy (an old `node src/server.js` from earlier may still be running), close it or use `PORT=3100 npm start`.

---

## Phase A: Backend (done)

| What | Where | Live with | Falls back to |
|---|---|---|---|
| Async store, same shape for both | `src/store.js` | Supabase (`SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, run `docs/supabase.sql`) | `data/db.json` |
| Classification (text **and photo**) | `src/classify.js`, `src/ai.js` | Bedrock Converse (`AWS_BEARER_TOKEN_BEDROCK`, `BEDROCK_MODEL_ID`) or any OpenAI-compatible API | keyword classifier |
| Duplicate detection | `src/agent.js` `findSimilar` | Titan / OpenAI embeddings + same category/location check | same category + building + room |
| Prompt-injection guard | `src/classify.js` | always on | complaint goes to "Needs review" |
| Proof-of-fix (before/after photo check) | `verifyFix` | vision model | photo stored, admin must override |
| Photos | `src/integrations.js` | Supabase Storage | `data/uploads/` |
| Email to department / HoD | `sendEmail` | any SMTP (AWS SES SMTP works) | console log |
| WhatsApp in + out | `POST /api/whatsapp`, `sendWhatsApp` | Twilio (signature-checked) | endpoint returns 503, sends are logged |
| Voice notes → text | `POST /api/transcribe` | ElevenLabs Scribe | browser speech recognition (Chrome/Edge) |
| Status read aloud | `POST /api/tts` | ElevenLabs TTS | browser `speechSynthesis` |
| Live dashboard | `GET /api/stream` (SSE) | always on | |
| Audit log | every action | always on | |
| MCP over HTTP | `POST /mcp` | always on (`MCP_TOKEN` to lock it) | stdio still works: `npm run mcp` |
| Human approval for agents | `request_escalation`, `request_resolution` → Approve/Reject in the dashboard | always on | |

MCP tools now: `report_issue`, `list_tickets`, `get_ticket`, `ticket_stats`, `check_overdue`,
`request_escalation`, `request_resolution`. Agents can no longer close or escalate directly.

## Phase B: Landing page (done)

`web/src/landing/`: React + three.js (react-three-fiber) + GSAP ScrollTrigger + Lenis smooth scroll.

1. **Hero (3D, clay campus):** a miniature clay campus under warm studio light (Blocks A–D, library, hostel). On scroll, 15 complaint pins pop up over Block C,
   merge into one glowing ticket pin, room C-204 lights up and the camera dollies in: "One ticket. ×15." (`web/src/landing/Campus.jsx`; replaced the first particle version)
2. **Manifesto:** the problem paragraph lights up word by word as you scroll.
3. **The loop:** pinned horizontal scroll through 6 steps; each card has a small animated product vignette.
4. **Safety fast lane:** the page heats to red, live 2-hour countdown.
5. **Channels:** WhatsApp, Kannada voice (animated waveform), photo.
6. **MCP:** tool list with auto / needs-approval badges, terminal that types out an agent session.
7. **Proof of fix:** draggable before/after slider (keyboard accessible).
8. **Numbers** count up, **CTA** with giant type sliding in.

Type: **Commissioner** (humanist sans) for headings and UI, **Zodiak** serif italic only on accent words and big numbers, **Fragment Mono** for labels.
Colour: warm near-black, off-white ink, one ember accent; red only for safety. Film grain overlay.
Respects `prefers-reduced-motion`. Mobile: chips hidden, loop becomes a vertical stack.

## Phase C: The product (done)

- **/report**: text, example chips, photo (drag/drop or camera, compressed client-side), voice (English / ಕನ್ನಡ / हिन्दी), USN. Result card shows the triage and whether you were merged ("You're report ×16").
- **/t/T1001**: student status page: stage tracker, report count, team + deadline, photos, timeline, **Listen** (TTS).
- **/admin**: Overview tab (KPIs, Ask CampusOS, charts, campus heatmap, failure predictions, live feed), Board tab (drag-and-drop Kanban), live stats, filters (Safety / Open / Escalated / Needs review / Resolved), search, ticket drawer (approve/reject agent requests, upload after-photo → AI check, resolve with note or override, escalate), **Audit log** tab, **Integrations** tab (shows which keys are live). Demo controls: Load demo, Simulate +30h, Reset.

## Phase D: Verified tonight

- `npm test`: all checks pass (dedup merge, 2h safety SLA, injection → review, no close without proof, agent request needs approval, escalation, audit, phone numbers never leave the server, Twilio signature against Twilio's published example).
- End-to-end over HTTP: demo load, photo report, proof upload, MCP `initialize` / `tools/list` / `request_resolution` → admin approve → 15 notified.
- Headless browser click-through of report → result → status → admin resolve → audit → integrations: **no console errors**.
- Path traversal on `/uploads` blocked.

**Verified live on 26 Nov (Phase F):** Supabase, Gemini, ElevenLabs, Twilio credentials. **Still not verified:** Bedrock, SMTP (no keys), and a real WhatsApp message end to end (sandbox webhook not set yet).

---


## Setup checklist (status 26 Nov)

1. ✅ `.env` filled. Never commit it.
2. ✅ `npm start`, open `/admin` → **Integrations**: Classification, Duplicate detection, Database, Photos, Voice, WhatsApp are green. Email is grey (no SMTP).
3. ✅ LLM: Gemini through the OpenAI-compatible path: `LLM_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai`, `LLM_MODEL=gemini-flash-lite-latest`, `EMBEDDING_MODEL=gemini-embedding-001`. `gemini-2.5-flash` is closed to new keys, and the bigger Flash models often return 503 on the free tier. Bedrock is supported but not set (it wins over Gemini if both are set).
4. ✅ Supabase: project **campusos** (Mumbai), schema from `docs/supabase.sql`, public bucket `campusos`, service-role key in `.env`.
5. ✅ ElevenLabs: key with only Text to Speech + Speech to Text. On the free plan the voice ID must be a **default** voice (library voices return 402); we use George, `JBFqnCBsd6RMkjVDRZzb`.
6. ⏳ Twilio: trial account verified. Expose the server with `cloudflared tunnel --url http://localhost:3000` (no account; ngrok also works), set `PUBLIC_URL` to the https URL and restart. Then in the console set Sandbox settings → "When a message comes in" = `$PUBLIC_URL/api/whatsapp` (POST), and send the join code from each phone. The tunnel URL changes on every restart, so redo `PUBLIC_URL` and the webhook each time.
7. ⏳ Before anything public: a longer `MCP_TOKEN` (32+ chars) and `DEMO_ACCOUNTS=off`.

## Open questions for you

- **Demo recordings:** which flows do you want recorded? A suggested 3-minute order is in `docs/BUILD_PHASE_PLAN.md` §4.
- **Copy:** hero line, step texts and numbers are in `web/src/landing/Landing.jsx` (top of file). The "4.5 cr students" figure is from AISHE 2023-24.
- **Before/after visuals** on the landing page are CSS illustrations; swap in real photos from campus if you have them.


Phase E (dashboard + redesign, 25 Nov): see `docs/NEXT_PHASE_PITCH.md` §8.

## Phase F: Live keys + accuracy (26 Nov)

| What | Where |
|---|---|
| Live integrations: Supabase, Gemini (classification + embeddings), ElevenLabs, Twilio | `.env` (checklist above) |
| Accuracy check on 30 hand-labelled complaints (English / Kannada / Hindi, 7 safety hazards) | `scripts/eval.js`, `data/labelled-complaints.json` → `data/accuracy.json`, shown in Dashboard → Integrations |
| A room the regex can read ("C-204") now overrides the LLM's free-form guess, so dedup keys stay consistent | `classify()` in `src/classify.js` |
| Category definitions added to the triage prompt (hostel was absorbing fans, AC units, benches) | `SYSTEM` in `src/classify.js` |
| One retry on LLM 503/429, temperature 0 | `chatJson()` in `src/ai.js` |
| SLA escalation runs by itself every 5 min | `listen` callback in `src/server.js` |

Accuracy before → after the two classify fixes (Gemini): category 73% → **100%**, room 67% → **100%**, safety 97%, hazards missed 0 of 7. Keywords alone: 80% / 97% / 87%, 4 of 7 hazards missed.

**Later phase:** WhatsApp to any number needs a paid Twilio account, a Meta-approved WhatsApp sender and approved message templates. In code, only `TWILIO_WHATSAPP_FROM` changes.

## Phase G: Accounts, voice agent, dashboard v3 (26–27 Nov)

| What | Where |
|---|---|
| ☰ menu replaces the nav links: Community portal / Admin portal when signed out; dashboard, report, Wi-Fi, profile, sign out when signed in | `web/src/app/Nav.jsx` |
| Google sign-in (ID token verified with Google, client ID + verified email checked); new users choose Student (USN) or Faculty | `googleSignIn()` in `src/auth.js`, `POST /api/auth/google`, `web/src/app/Login.jsx` (`GOOGLE_CLIENT_ID`) |
| Faculty role (no USN; reports filed under their email), `reporterId()` used for my tickets, rating and reports | `src/auth.js`, `src/server.js` |
| My profile: edit name, change/add password | `updateProfile()`, `POST /api/me/profile`, `web/src/app/Profile.jsx` |
| Student / faculty dashboard with KPI tiles, donut and progress cards | `web/src/app/Me.jsx` |
| ElevenLabs agent → CampusOS MCP over the tunnel; voice bubble in the app | `web/src/app/VoiceAgent.jsx` (`ELEVENLABS_AGENT_ID`) |
| Admin console redesign: greeting header, pill tabs, KPI tiles with gauges and a stacked urgency bar, Needs attention, workload-by-team stacked bars, gradient daily columns. Removed the briefing sentence, "students happy", the live feed and the Integrations tab | `web/src/app/Overview.jsx`, `Charts.jsx` (`Gauge`, `StackBar`, `StackedBars`, `Donut`, `CountUp`, `Sparkline`), `app.css` |
| Tickets sorted by urgency (default), newest, oldest, deadline; shared `byEmergency` | `web/src/lib/api.jsx`, `Admin.jsx` |
| Voice input falls back to the browser if ElevenLabs fails | `web/src/app/Report.jsx`, `POST /api/transcribe` |

**Next:** the escalation ladder and the known loopholes, both in [`STATUS.md`](STATUS.md#escalation-ladder-planned).
