# CampusOS: where things stand (27 Nov 2026)

One-page summary. Details live in [`PROTOTYPE_PHASES.md`](PROTOTYPE_PHASES.md) (build + setup) and [`NEXT_PHASE_PITCH.md`](NEXT_PHASE_PITCH.md) (decisions + roadmap).

> **Pushed to GitHub on branch `full-prototype`** (commit `7e2f953`, 27 Nov). `main` still holds the ideathon version (`c13ab47`) until it's merged.
> Rows marked *(superseded)* describe an earlier version; the 26–27 Nov sections below are current.

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
| **/admin** *(superseded)* | Overview (KPIs, Ask CampusOS, live feed, trend, heatmap, failure prediction, SLA health, time to fix, channel mix, ratings), Kanban board, ticket drawer, audit log, integrations status, demo controls |
| **Unique features** | People-affected priority (timetable per room), predict next failure from repeat history |
| **Dashboard redesign (25 Nov, evening)** *(superseded)* | Overview is now an editorial briefing: one-sentence headline + Ask command line + live wire; 01 dot wall (one dot per report, clustered by ticket), 02 daily columns (new vs merged), 03 failure forecast timeline, 04 campus map with pins, 05 team report card, 06 time to fix, 07 channel mix. Fixed mobile horizontal overflow |
| **Campus health + iso map + merge animation (25 Nov, night)** | Health score 0–100 per building (40% fixed on time, 30% 👍 share, 30% open load; safety/overdue count extra) + campus score, in `analytics().health` and a leaderboard panel. Isometric clay-campus map (roof tint + score per building, pins for open issues). Live merges: the new dot drops into its ticket cluster and the cluster flashes |
| **Phone as a sensor (25 Nov, late)** | `/wifi`: a phone runs a ~3 s speed + latency test against the server for the room it's in (optional repeat every 2 min). Dashboard panel 08: live Wi-Fi per room vs its usual speed, 12 h sparkline, "slow ~22:00" pattern spotting. When 3+ distinct phones measure a collapse within 15 min, CampusOS files the Wi-Fi ticket itself through the normal pipeline (merges with student reports, no duplicates); a single phone can never trigger it, 20 s rate limit per phone. MCP tool `wifi_status`. Code: `src/wifi.js`, `web/src/app/Wifi.jsx`, table `wifi_samples` |
| **Accounts / login portal (25 Nov, late)** | `/login`: sign in with email or USN, student signup (name, USN, college email, password), first-run setup creates the admin. `/me`: student portal (my reports, live status, rate the fix). Staff accounts (technician, dept head, admin) are added by an admin in the dashboard's **People** tab; no self-signup for staff. Roles: technicians start work + upload proof for their department; dept heads also close, escalate and approve AI requests for their department; admins everything (incl. close without proof, reset, demo). Only students who reported a ticket can rate it, once. scrypt passwords, HttpOnly SameSite=Lax session cookie, only token hashes stored, 8-failure sign-in throttle, "Reset" keeps accounts. Code: `src/auth.js`, `web/src/app/Login.jsx`, `Me.jsx`; tables `app_users`, `app_sessions` |
| **Design** | Smaller type, Commissioner sans + Zodiak only on accent words, warm dark palette, one ember accent |

### Live keys + accuracy (26 Nov)
Gemini classification + embeddings, Supabase, ElevenLabs, Twilio wired up and tested live. New `npm run eval` accuracy check; two `classify` fixes took Gemini from 73% → 100% category and 67% → 100% room. SLA escalation now runs automatically every 5 min. Details: `PROTOTYPE_PHASES.md` Phase F.

### Accounts, portals, voice agent, dashboard v3 (26–27 Nov)
| Area | What's built |
|---|---|
| **Menu + portals** | Top bar is just the logo and a ☰ menu. Signed out: **Community portal** (students, faculty, campus staff), **Admin portal** (admin, dept heads, technicians), report without an account. Signed in: dashboard, report, Wi-Fi check, **My profile**, sign out. Landing nav links (How it works, MCP, Wi-Fi, Report) removed |
| **Accounts** | **Google sign-in** for the community portal (Google Identity Services; the server verifies the ID token with Google and checks our client ID and a verified email; new users pick Student + USN or Faculty). New **faculty** role: no USN, reports filed under their email. The admin portal has no signup and no Google |
| **My profile** (`/profile`) | Edit name; email, USN, department and role shown read-only; change password (needs the current one); Google-only accounts can add a password |
| **Student / faculty dashboard** (`/me`) | KPI tiles, donut of your reports, one card per ticket with a Reported → Being fixed → Fixed progress bar, rate the fix |
| **Voice agent** | ElevenLabs agent "CampusOS Helpdesk" calls the CampusOS MCP server over the public tunnel (Streamable HTTP, bearer `MCP_TOKEN`), verified end to end (a voice report merged into T1001). Floating "Talk to CampusOS" bubble on /report, /me and status pages (`ELEVENLABS_AGENT_ID`); passes the signed-in user's USN as `{{usn}}` |
| **Admin console** (Overview) | Greeting header with a Live badge, pill tabs (Tickets shows an open count). Five KPI tiles: open now (stacked urgency bar), duplicates merged (gauge), average time to fix (trend + fastest/slowest), fixed on time (gauge), AI triage accuracy (gauge). **Needs attention** (6 most urgent tickets) beside the campus map, Ask CampusOS, donuts (status, issue) + **Workload by team** stacked bars, merge dot wall, reports per day (gradient stacked columns), failure forecast, team report card, building health, time to fix, report channels, Wi-Fi. Removed: briefing sentence, "students happy", live activity feed, Integrations tab |
| **Tickets tab** | Sort: Most urgent (default: open → safety → overdue → urgency → students affected → reports), Newest, Oldest, Deadline. Overdue and critical tags |
| **Robustness** | Voice input falls back to the browser recogniser if ElevenLabs fails; one retry on Gemini 503/429; MCP requests logged (method + whether the token matched) |

### Verified
- `npm test`: **all checks pass** (re-run 27 Nov; now also covers faculty signup, reporter IDs and profile edits)
- End-to-end HTTP + headless browser click-through, no console errors
- **Live keys (26 Nov):** Supabase (DB + photos), Gemini `gemini-flash-lite-latest` (classification) + `gemini-embedding-001` (dedup), ElevenLabs (default voice; library voices need a paid plan), Twilio trial (WhatsApp sandbox). SMTP + Bedrock not set (fall back to logs / Gemini)
- **Accuracy (`npm run eval`, 30 hand-labelled complaints in `data/labelled-complaints.json`):** Gemini category 100%, room 100%, safety 97%, 0 hazards missed. Keywords alone: 80% / 97% / 87%. Shown in the AI triage accuracy tile
- **Auto-escalation:** server checks SLAs every 5 min (no button needed)
- **Live in Chrome (27 Nov):** admin console, portals menu, profile page, Google sign-in (tested by you), ElevenLabs voice agent → MCP → ticket merge. No console errors

## Not done

| Item | Status |
|---|---|
| Merge `full-prototype` into `main` | Waiting for your go-ahead |
| **Escalation ladder** (see below) | Designed, not built |
| WhatsApp to any number (not just sandbox joiners) | Later phase: paid Twilio + Meta-approved WhatsApp sender + message templates; only `TWILIO_WHATSAPP_FROM` changes |
| Twilio sandbox webhook + first real WhatsApp message | Paste `$PUBLIC_URL/api/whatsapp` (POST) in Sandbox settings, send the join code from each phone |
| Room QR stickers, voice call when fixed, technician day plan | Proposed, not picked |
| Real campus photos for before/after | Using CSS illustrations |
| PowerPoint share link | Still outstanding from submission |

### Escalation ladder (planned)

Likely judge question: *"What if the HoD ignores an escalated ticket?"*

**Today** escalation is one level. Past the deadline, the ticket becomes Escalated and one email goes to `ESCALATION_EMAIL`. Escalated tickets are never checked again (`checkOverdue` only looks at open and in-progress tickets). The ticket stays visible (red in Needs attention, late on the team report card, lower building health, "Escalated" on every reporter's dashboard, in the audit log), but nothing pushes it further.

**Planned**, on the same 5-minute scheduler:

| Time since escalation, with no action | What happens |
|---|---|
| 24 h | Reminder email to the HoD; ticket marked "HoD reminded" |
| 48 h | Level 2: escalate to the Principal / Dean (new `ESCALATION_EMAIL_2`), red "no response" badge on the dashboard |
| Every level | Everyone who reported it is notified ("escalated to the Principal") |
| Any HoD action (start work, reassign, comment, close) | Stops the timer |

"Simulate +30h", pressed twice, would demo the whole chain. Code: `escalate()` and `checkOverdue()` in `src/agent.js`.

**What to say until it's built:** "Today, escalation is one level: deadline missed, the HoD gets an email, and the ticket stays red on every dashboard and on the team's report card, so it's visible, not buried. Next on our roadmap is an escalation ladder: if the HoD doesn't respond in 24 hours they're reminded, and after 48 hours it goes to the Principal automatically."

## Known loopholes

Things a judge or a real campus could break, most serious first.

| # | Loophole | Why it matters | Fix |
|---|---|---|---|
| 1 | **Escalation emails are only logged** (no SMTP set) | The HoD never actually receives anything; "escalated to HoD" is only true on screen | Set `SMTP_*` (a Gmail app password works), or say "logged in the demo" |
| 2 | **Escalation stops at one level** | An ignored HoD means the ticket just sits there | The escalation ladder above |
| 3 | **Anyone can report as any USN** | `/api/report` accepts `studentId` from the request when not signed in, and the voice agent passes `{{usn}}` from the browser, so someone can file reports into another student's dashboard | Only trust the USN from the session; anonymous reports stay "anon" |
| 4 | **No rate limit on reports** | The public report form and MCP `report_issue` can be spammed (Wi-Fi samples are limited, reports aren't) | Per-IP / per-account limit, e.g. 5 reports per 10 minutes |
| 5 | **Anyone can sign up** | `COLLEGE_EMAIL_DOMAIN` isn't set, so any email or Google account can create a student or faculty account; faculty aren't verified at all | Set `COLLEGE_EMAIL_DOMAIN`; admin approval for faculty |
| 6 | **Demo accounts are public** | The login page lists the demo accounts and their password | `DEMO_ACCOUNTS=off` before any public demo |
| 7 | **The voice agent is public** | Its authentication is off so the bubble works; anyone on the page can use up ElevenLabs minutes (the free plan has very few) | ElevenLabs auth with signed URLs from the server, or allow only the demo domain |
| 8 | **The accuracy number is optimistic** | We wrote the 30 labels and tuned the prompt on the same 30, so 100% is not a held-out score | Collect 50–100 real complaints from classmates and report the honest number |
| 9 | **Graphs run on seeded history** | "Load demo" adds a month of made-up tickets; judges may ask | Say so, or run a small real pilot (one hostel block, 3 days) |
| 10 | **The tunnel URL changes on every restart** | `PUBLIC_URL`, the Twilio webhook, the Google sign-in origin and the ElevenLabs MCP URL all break together | Keep the tunnel running on demo day, or use a named Cloudflare tunnel / real host |
| 11 | **Free tiers can fail live** | Gemini returned 503 "high demand" several times; ElevenLabs free minutes are few; WhatsApp sandbox joins expire after 72 h | The keyword fallback already covers triage; record a backup demo video |
| 12 | **USN can't be changed** | My profile says "ask the admin", but there is no admin screen for it | Add USN editing to the People tab (and move that student's reports) |
| 13 | **Sign-in throttle is in memory** | A server restart resets it; it doesn't work across several servers | Fine for one server; move it to the store if scaled |
| 14 | **Whole-database saves** | Every change rewrites the whole store (JSON file or all Supabase rows); fine for a demo, slow at campus scale | Per-row writes |
| 15 | **New dashboard not checked on phones** | Tested on a laptop screen only | A quick pass at 375 px width |

## Run it

```bash
npm install && npm run build && npm start   # http://localhost:3000
npm test
npm run eval                                 # accuracy on 30 labelled complaints
cloudflared tunnel --url http://localhost:3000   # public https URL → PUBLIC_URL + Twilio webhook (changes every restart)
```
