# CampusOS: where things stand (26 Nov 2026)

One-page summary. Details live in [`PROTOTYPE_PHASES.md`](PROTOTYPE_PHASES.md) (build + setup) and [`NEXT_PHASE_PITCH.md`](NEXT_PHASE_PITCH.md) (decisions + roadmap).

> ⚠️ **None of this is committed or pushed.** Last commit is the ideathon version (`c13ab47`). Everything below is local changes only.

## Done

### Ideathon submission (committed, 24 Nov)
- MCP server, triage, dedup, routing, escalation, terminal demo (`npm run demo`)
- Plain HTML report form + admin board
- Submission video uploaded to YouTube (unlisted), README with team name **CodeBrew**

### Full prototype (local, night of 24–25 Nov)
| Area | What's built |
|---|---|
| **Backend** | Supabase-or-JSON store, LLM text + photo classification (Bedrock / OpenAI-compatible, keyword fallback), embedding dedup, prompt-injection guard, proof-of-fix photo check, email, WhatsApp (Twilio), voice in/out (ElevenLabs), SSE live updates, audit log |
| **MCP** | Over stdio and HTTP. Tools: `report_issue`, `list_tickets`, `get_ticket`, `ticket_stats`, `check_overdue`, `request_escalation`, `request_resolution`. Agents can only *request* close/escalate; an admin approves |
| **Landing page** | React + three.js clay-campus hero (15 pins merge into one ticket over C-204), scroll story: manifesto, the loop, safety lane, channels, MCP terminal, before/after slider, numbers, CTA |
| **/report** | Text, photo, voice (English / Kannada / Hindi), shows merge result ("you're report ×16") |
| **/t/:id** | Student status page: stage tracker, timeline, photos, read-aloud, 👍/👎 rate the fix |
| **/admin** | Overview (KPIs, Ask CampusOS, live feed, trend, heatmap, failure prediction, SLA health, time to fix, channel mix, ratings), Kanban board, ticket drawer, audit log, integrations status, demo controls |
| **Unique features** | People-affected priority (timetable per room), predict next failure from repeat history |
| **Dashboard redesign (25 Nov, evening)** | Overview is now an editorial briefing: one-sentence headline + Ask command line + live wire; 01 dot wall (one dot per report, clustered by ticket), 02 daily columns (new vs merged), 03 failure forecast timeline, 04 campus map with pins, 05 team report card, 06 time to fix, 07 channel mix. Fixed mobile horizontal overflow |
| **Campus health + iso map + merge animation (25 Nov, night)** | Health score 0–100 per building (40% fixed on time, 30% 👍 share, 30% open load; safety/overdue count extra) + campus score, in `analytics().health` and a leaderboard panel. Isometric clay-campus map (roof tint + score per building, pins for open issues). Live merges: the new dot drops into its ticket cluster and the cluster flashes |
| **Phone as a sensor (25 Nov, late)** | `/wifi`: a phone runs a ~3 s speed + latency test against the server for the room it's in (optional repeat every 2 min). Dashboard panel 08: live Wi-Fi per room vs its usual speed, 12 h sparkline, "slow ~22:00" pattern spotting. When 3+ distinct phones measure a collapse within 15 min, CampusOS files the Wi-Fi ticket itself through the normal pipeline (merges with student reports, no duplicates); a single phone can never trigger it, 20 s rate limit per phone. MCP tool `wifi_status`. Code: `src/wifi.js`, `web/src/app/Wifi.jsx`, table `wifi_samples` |
| **Accounts / login portal (25 Nov, late)** | `/login`: sign in with email or USN, student signup (name, USN, college email, password), first-run setup creates the admin. `/me`: student portal (my reports, live status, rate the fix). Staff accounts (technician, dept head, admin) are added by an admin in the dashboard's **People** tab; no self-signup for staff. Roles: technicians start work + upload proof for their department; dept heads also close, escalate and approve AI requests for their department; admins everything (incl. close without proof, reset, demo). Only students who reported a ticket can rate it, once. scrypt passwords, HttpOnly SameSite=Lax session cookie, only token hashes stored, 8-failure sign-in throttle, "Reset" keeps accounts. Code: `src/auth.js`, `web/src/app/Login.jsx`, `Me.jsx`; tables `app_users`, `app_sessions` |
| **Design** | Smaller type, Commissioner sans + Zodiak only on accent words, warm dark palette, one ember accent |

### Live keys + accuracy (26 Nov)
Gemini classification + embeddings, Supabase, ElevenLabs, Twilio wired up and tested live. New `npm run eval` accuracy check; two `classify` fixes took Gemini from 73% → 100% category and 67% → 100% room. SLA escalation now runs automatically every 5 min. Details: `PROTOTYPE_PHASES.md` Phase F.

### Verified
- `npm test`: **all checks pass** (re-run 26 Nov)
- End-to-end HTTP + headless browser click-through, no console errors
- **Live keys (26 Nov):** Supabase (DB + photos), Gemini `gemini-flash-lite-latest` (classification) + `gemini-embedding-001` (dedup), ElevenLabs (default voice; library voices need a paid plan), Twilio trial (WhatsApp sandbox). SMTP + Bedrock not set (fall back to logs / Gemini)
- **Accuracy (`npm run eval`, 30 hand-labelled complaints in `data/labelled-complaints.json`):** Gemini category 100%, room 100%, safety 97%, 0 hazards missed. Keywords alone: 80% / 97% / 87%. Shown in Dashboard → Integrations
- **Auto-escalation:** server checks SLAs every 5 min (no button needed)

## Not done

| Item | Status |
|---|---|
| Commit + push the prototype | Pending your go-ahead |
| WhatsApp to any number (not just sandbox joiners) | Later phase: paid Twilio + Meta-approved WhatsApp sender + message templates; only `TWILIO_WHATSAPP_FROM` changes |
| Room QR stickers, voice call when fixed, technician day plan | Proposed, not picked |
| Real campus photos for before/after | Using CSS illustrations |
| PowerPoint share link | Still outstanding from submission |
| Twilio sandbox webhook + first real WhatsApp message | Paste `$PUBLIC_URL/api/whatsapp` (POST) in Sandbox settings, send the join code from each phone |
| Longer `MCP_TOKEN` (now 7 chars), `DEMO_ACCOUNTS=off` | Set before any public demo |
| SMTP email, Bedrock | Optional; email is logged, Gemini covers the LLM |

## Run it

```bash
npm install && npm run build && npm start   # http://localhost:3000
npm test
npm run eval                                 # accuracy on 30 labelled complaints
cloudflared tunnel --url http://localhost:3000   # public https URL → PUBLIC_URL + Twilio webhook (changes every restart)
```
