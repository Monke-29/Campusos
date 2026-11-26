# CampusOS: next phase pitch (for review)

> Status: **proposal only, nothing here is built yet.** Mark each item ✅ / ❌ / later and we'll build the ✅ ones.
> Written 25 Nov 2026, after feedback on the first full prototype.

---

## 1. Feedback being addressed

| Feedback | Plan |
|---|---|
| The 3D hero looks dull and doesn't match the theme | Replace the particle swarm with a 3D element that matches the warm editorial look (options in §4, you pick one) |
| Fonts too big, look generic | Smaller type scale, less serif everywhere, a more distinctive pairing (options in §4) |
| Dashboard needs more features and graphs | Feature menu in §3 |
| Two portals with separate logins | Brief in §2 (later phase) |

---

## 2. Two portals, two logins (later phase)

> **Update 26 Nov: built** (see `docs/STATUS.md`, "Accounts / login portal"), with one change from this brief: our own email/USN + password login (scrypt, HttpOnly session cookie) instead of Supabase OTP / Google SSO, and role checks in the server instead of row-level security. Still open from this brief: "me too" upvotes, the room picker map, masked USNs for staff.

Today there is one app: anyone can report, and `/admin` is the dashboard. The plan is to split it into two separate experiences.

### Student portal (`/student`)
- **Login:** USN + college email OTP (Supabase Auth magic link / OTP). No passwords to forget.
- **Home:** "My reports" with live status, deadline countdown and a "×N others reported this too" badge.
- **Report:** text / photo / voice (today's /report page, plus a room picker from a campus map).
- **Upvote "me too":** see open issues in your building and add yourself with one tap instead of writing a new complaint.
- **Notifications:** in-app + WhatsApp when the status changes; rate the fix (👍/👎) when it's closed.
- **Privacy:** students never see who else reported; staff see a masked USN.

### Admin portal (`/admin`)
- **Login:** staff email + password or Google Workspace SSO, with roles:

| Role | Can |
|---|---|
| **Technician** | See tickets for their team, upload after-photos, mark "fixed (pending check)" |
| **Department head** | Everything for their department, reassign, set priority |
| **Facility admin / HoD** | All departments, approve AI-agent requests, analytics, settings (departments, SLAs) |

- Every action stays in the audit log with the logged-in person's name, not just "admin".

### How we'd build it
- Supabase Auth (already in the stack) + a `profiles` table with `role` and `department`.
- Row-level security so a technician's queries only return their department's tickets.
- The server checks the Supabase session (JWT) on every admin route, replacing today's single `ADMIN_TOKEN`.
- MCP agents get their own service identity, so the audit log shows "voice-agent" vs a named human.

---

## 3. Dashboard feature menu (pick what you want)

### Analytics (graphs)
| # | Feature | Why a judge cares |
|---|---|---|
| D1 | **Reports over time**: daily line chart, merged duplicates shaded | Shows dedup working at scale: "312 reports → 41 tickets" |
| D2 | **SLA health**: on-time vs overdue per department (bar) | Accountability: which team is slow |
| D3 | **Campus heatmap**: building map coloured by open issues | Instantly visual, great on a projector |
| D4 | **Mean time to fix** by category + trend | The number that proves CampusOS helps |
| D5 | **Recurring problems**: "C-204 projector: 4th time in 30 days" | Turns complaints into maintenance planning |
| D6 | **Channel mix**: web / WhatsApp / voice share | Proves the multi-channel story (and ElevenLabs usage) |

### Operations
| # | Feature | Why |
|---|---|---|
| O1 | **Kanban view** (Open → In progress → Fixed → Verified) with drag | How technicians actually work |
| O2 | **Ask CampusOS**: natural-language box ("what's overdue in Hostel B?") answered by the LLM over the MCP tools | Live MCP demo inside the product, strong Track 1 fit |
| O3 | **Technician assignment** + workload per person | Real ownership, not just "the department" |
| O4 | **Bulk actions** (merge two tickets by hand, split a wrong merge) | Human control over the AI |
| O5 | **Weekly AI summary** emailed to the HoD | "Less magic, more utility" |
| O6 | **Live activity feed** (ticker of incoming reports as they merge) | Looks alive during the demo |

### Trust & control (fits "controlled" MCP)
| # | Feature | Why |
|---|---|---|
| T1 | **Approval queue** page for everything AI agents asked to do | Shows control is built in |
| T2 | **Why this classification?**: AI reasoning + confidence per ticket | Transparency |
| T3 | **Accuracy panel**: classification and dedup accuracy on the 30 hand-labelled complaints | The "one number on screen" judges ask for |
| T4 | **Injection attempts log** | Security story in one glance |

---

## 4. Landing page redesign options

### 3D hero (pick one)
| Option | Idea | Fits the theme because |
|---|---|---|
| **H1. Paper tickets** | 15 printed paper complaint slips (real paper material, soft shadows, slight curl) flutter down, stack, and get stamped into one ticket "×15" | Warm, tactile, editorial: like a print object, not a tech demo |
| **H2. Liquid merge** | 15 glossy ember droplets drift, touch and melt into one blob (metaballs), with soft studio lighting | The dedup story told in one motion, very eye-pleasing |
| **H3. Clay campus** | A miniature matte clay campus block (warm studio light); issue pins pop up over rooms, then one glowing pin collects them | Product-render look (Apple / Linear style), shows "campus" literally |
| **H4. Drop 3D** | No WebGL; a big editorial typographic hero with scroll-driven layered cards | Fastest, cleanest, zero GPU risk on venue laptops |

### Typography (pick one)
| Option | Pairing | Feel |
|---|---|---|
| **F1** | Keep Zodiak but ~40% smaller, used only for one or two words per heading; body and UI in Commissioner | Same identity, calmer |
| **F2** | **Erode** (softer serif) + Commissioner | Warmer, less "magazine" |
| **F3** | All-sans: a characterful humanist sans display (e.g. **Supreme** / **Synonym** from Fontshare) + mono details | More product, less editorial |
| **F4** | You send a site whose type you love and I match its feel | Most reliable way to hit your taste |

---

## 5. If I were the judge: what would make me stop scrolling

1. **A live moment, not a slideshow:** a judge scans a QR code, sends a WhatsApp or Kannada voice note, and watches the dashboard merge it into the ×15 ticket in real time (O6 + the SSE board).
2. **An agent you can talk to:** "Ask CampusOS" (O2) calling the MCP tools in front of them, and hitting the approval wall when it tries to close a ticket.
3. **Proof-of-fix with a real photo** of a real campus projector, before and after.
4. **One honest number:** "94% classification accuracy on 30 labelled complaints, 0 false merges" (T3).
5. **A heatmap** of a real RIT building (D3), because it makes the problem feel local.

---

## 6. Decisions (25 Nov)

- **3D hero:** H3 Clay campus ✅
- **Typography:** F1 Zodiak, much smaller, serif on accent words only ✅
- **Dashboard now:** Graphs pack (D1, D2, D4, D6) ✅ · Campus heatmap + recurring problems (D3, D5) ✅ · Ask CampusOS (O2) ✅ · Kanban + live feed (O1, O6) ✅
- **Wow:** Rate the fix ✅ · more unique ideas requested (below)
- **Portals (§2):** later phase

## 7. More unique ideas (proposed)

| # | Idea | What it does |
|---|---|---|
| U1 | **Room QR stickers** | Every room door gets a QR code. Scan → report opens with the room already filled in. No typing "C-204" wrong |
| U2 | **People-affected priority** | Link rooms to the timetable: "this projector blocks 6 lectures / 240 students today" → ranks tickets by real impact, not just report count |
| U3 | **Predict the next failure** | From repeat history: "C-204 projector fails every ~11 days, next likely around 6 Dec" → schedule maintenance before it breaks |
| U4 | **Voice call when fixed** | ElevenLabs voice agent calls the student in Kannada/English: "Your projector issue in C-204 is fixed" |
| U5 | **Technician day plan** | Orders today's jobs by building and urgency into a walking route, on a mobile view |
| U6 | **Campus health score** | One public number per building/department (open issues, speed, satisfaction), for a leaderboard on the landing page |
- **Unique (§7):** U2 People-affected priority ✅ · U3 Predict the next failure ✅
- **Clay campus:** stylised generic campus ✅ · **Ask CampusOS without a key:** rule-based fallback ✅

## 8. Built (25 Nov)

| Item | Where |
|---|---|
| Clay campus hero (pins pop over Block C, merge into one ticket pin, room C-204 lights up) | `web/src/landing/Campus.jsx` |
| Smaller type, sans headings, Zodiak only on accent words | `web/src/styles.css`, `landing.css`, `app.css` |
| Dashboard **Overview** tab: KPIs, Ask CampusOS, live activity, reports-vs-tickets trend, campus heatmap, likely-to-break-next, SLA health, time to fix, channel mix, fix ratings | `web/src/app/Overview.jsx`, `Charts.jsx`, `src/insights.js` |
| **Board** tab: drag-and-drop Kanban (Open → In progress → Escalated → Fixed) | `web/src/app/Kanban.jsx`, `POST /api/move` |
| People-affected priority (timetable per room, ranks the queue) | `data/timetable.json`, `impactOf()` in `src/agent.js` |
| Failure prediction from repeat history | `analytics().recurring` in `src/insights.js` |
| Rate the fix (👍/👎 on the student status page, per-team satisfaction) | `Status.jsx`, `POST /api/rate` |
| A month of demo history so graphs and predictions have data | `src/history.js` (seeded by **Load demo**) |

Built later on 25–26 Nov: campus health score, phone-as-a-sensor Wi-Fi, logins and roles (§2), T3 accuracy panel (`npm run eval`, Dashboard → Integrations). Still not picked: U1, U4, U5, O3–O5, T1, T2, T4.
