// Core CampusOS pipeline: classify -> find duplicate -> merge or create -> assign -> notify,
// plus escalation, proof-of-fix, approvals and the audit log. Shared by the web API and the MCP server.
import fs from "node:fs";
import { update, getDb } from "./store.js";
import { classify, verifyFixPhotos } from "./classify.js";
import { embed, cosine } from "./ai.js";
import { saveImage, loadImage, sendEmail, sendWhatsApp } from "./integrations.js";

const DEPTS = JSON.parse(fs.readFileSync(new URL("../data/departments.json", import.meta.url), "utf8"));
const TIMETABLE = JSON.parse(fs.readFileSync(new URL("../data/timetable.json", import.meta.url), "utf8"));
const ACTIVE = new Set(["open", "in_progress"]);
const RANK = { low: 0, medium: 1, high: 2, critical: 3 };
const rank = (u) => RANK[u] ?? 1;
const norm = (s) => String(s ?? "").toLowerCase().replace(/block|room|\s|-/g, "");
const SAME_ISSUE = Number(process.env.DEDUP_THRESHOLD) || 0.86;
const fail = (status, message) => Object.assign(new Error(message), { status });

// Same open issue = same category + building + room, or (with embeddings) a near-identical
// description in the same category where the location doesn't contradict.
export function findSimilar(db, c, embedding) {
  const open = db.tickets.filter((t) => t.status !== "resolved" && t.category === c.category);
  const exact = open.find(
    (t) => norm(t.building) === norm(c.building) && norm(t.room) === norm(c.room) && norm(c.room) !== "unknown"
  );
  if (exact || !embedding) return exact;
  const compatible = (a, b) => norm(a) === "unknown" || norm(b) === "unknown" || norm(a) === norm(b);
  let best = null, bestScore = SAME_ISSUE;
  for (const t of open) {
    const score = cosine(embedding, t.embedding);
    if (score >= bestScore && compatible(t.room, c.room) && compatible(t.building, c.building)) (best = t), (bestScore = score);
  }
  return best;
}

const stamp = (ticket, type, text) => ticket.timeline.push({ at: new Date().toISOString(), type, text });
function audit(db, actor, action, ticketId, detail = {}) {
  db.audit.push({ id: `A${db.audit.length + 1}`, at: new Date().toISOString(), actor, action, ticketId, detail });
  if (db.audit.length > 1000) db.audit.splice(0, db.audit.length - 1000);
}
// Sends happen after the write is saved, so a slow SMTP server never blocks the queue.
const dispatch = (jobs) => jobs.length && Promise.allSettled(jobs.map((j) => j())).catch(() => {});

// People affected today, from the room's timetable ("C-204" → 6 lectures, 240 students).
export function impactOf(t) {
  const key = `${String(t.building).replace(/^Block\s*/i, "")}-${t.room}`.toUpperCase();
  return TIMETABLE[key] ?? null;
}

// Strip internals (embeddings, phone numbers) before anything leaves the server.
export const publicTicket = ({ embedding, ratedBy, ...t }) => ({ ...t, impact: impactOf(t) });
const nextId = (db) => `T${Math.max(1000, ...db.tickets.map((t) => Number(t.id.slice(1)) || 0)) + 1}`;

export async function handleReport({ text, studentId = "anon", photo = null, photoUrl = null, channel = "web", phone = null, actor = "student" }) {
  if (photo && !photoUrl) photoUrl = await saveImage(photo);
  const c = await classify(text, photo ? [{ mime: photo.mime, base64: photo.base64 }] : []);
  const embedding = await embed(`${c.category}: ${c.summary} @ ${c.building} ${c.room}`);
  const outbox = [];

  const result = await update((db) => {
    const now = new Date().toISOString();
    const report = { id: `R${db.reports.length + 1}`, text, studentId, phone, channel, photoUrl, createdAt: now };
    let ticket = findSimilar(db, c, embedding);
    const merged = Boolean(ticket);

    if (ticket) {
      ticket.reportCount += 1;
      ticket.reportIds.push(report.id);
      ticket.channels[channel] = (ticket.channels[channel] || 0) + 1;
      if (rank(c.urgency) > rank(ticket.urgency)) ticket.urgency = c.urgency;
      if (c.is_safety_hazard && !ticket.is_safety_hazard) {
        ticket.is_safety_hazard = true;
        ticket.dueBy = new Date(Math.min(Date.parse(ticket.dueBy), Date.now() + 2 * 3600e3)).toISOString();
      }
      if (c.suspicious) ticket.needsHumanReview = true;
      if (photoUrl) ticket.photos.push(photoUrl);
      ticket.updatedAt = now;
      stamp(ticket, "merged", `Report #${ticket.reportCount} merged (${channel})`);
      audit(db, actor, "merge_report", ticket.id, { reportId: report.id, reportCount: ticket.reportCount });
    } else {
      const dept = DEPTS[c.category] ?? DEPTS.other;
      const slaHours = c.is_safety_hazard ? 2 : dept.slaHours; // safety fast lane
      ticket = {
        id: nextId(db),
        category: c.category, building: c.building, room: c.room, summary: c.summary,
        urgency: c.urgency, is_safety_hazard: Boolean(c.is_safety_hazard),
        department: dept.dept, deptEmail: dept.email, slaHours,
        status: "open", reportCount: 1, reportIds: [report.id], channels: { [channel]: 1 },
        needsHumanReview: (c.confidence ?? 1) < 0.5 || Boolean(c.suspicious), // low confidence -> human triage queue
        suspicious: Boolean(c.suspicious),
        confidence: c.confidence, classifiedBy: c.source,
        photos: photoUrl ? [photoUrl] : [], proof: null, pendingAction: null, ratings: { up: 0, down: 0 },
        createdAt: now, updatedAt: now,
        dueBy: new Date(Date.now() + slaHours * 3600e3).toISOString(),
        embedding,
        timeline: [],
      };
      stamp(ticket, "created", `Reported via ${channel}. Classified as ${c.category}, ${c.urgency}${c.is_safety_hazard ? ", safety hazard" : ""}`);
      stamp(ticket, "assigned", `Assigned to ${dept.dept}, SLA ${slaHours}h`);
      db.tickets.push(ticket);
      audit(db, actor, "create_ticket", ticket.id, { category: c.category, urgency: c.urgency, source: c.source });
      outbox.push(() =>
        sendEmail(dept.email, `[CampusOS] ${ticket.id} ${c.category} @ ${c.building} ${c.room}${ticket.is_safety_hazard ? " SAFETY" : ""}`,
          `${c.summary}\nUrgency: ${c.urgency}\nDue by: ${new Date(ticket.dueBy).toLocaleString("en-IN")}`)
      );
    }

    report.ticketId = ticket.id;
    db.reports.push(report);
    return { merged, ticket: publicTicket(ticket), classification: c };
  });
  dispatch(outbox);
  return result;
}

// Safety first, then the most people affected today, then the most reports.
const order = (a, b) =>
  (a.status === "resolved") - (b.status === "resolved") ||
  b.is_safety_hazard - a.is_safety_hazard ||
  (impactOf(b)?.students ?? 0) - (impactOf(a)?.students ?? 0) ||
  b.reportCount - a.reportCount;

export async function listTickets(status = "all") {
  const { tickets } = await getDb();
  const list = status === "all" ? tickets : status === "open" ? tickets.filter((t) => ACTIVE.has(t.status)) : tickets.filter((t) => t.status === status);
  return list.sort(order).map(publicTicket);
}

export async function getTicket(id) {
  const db = await getDb();
  const t = db.tickets.find((x) => x.id === id);
  if (!t) throw fail(404, `No ticket ${id}`);
  const reports = db.reports
    .filter((r) => r.ticketId === id)
    .map(({ phone, studentId, ...r }) => ({ ...r, studentId: String(studentId).replace(/(?<=^.{3}).+/, "•••") }));
  return { ...publicTicket(t), reports };
}

// A signed-in student's own tickets (every ticket they reported into).
export async function myTickets(usn) {
  const { tickets, reports } = await getDb();
  const ids = new Set(reports.filter((r) => r.studentId === usn).map((r) => r.ticketId));
  return tickets.filter((t) => ids.has(t.id)).sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .map(({ embedding, ratedBy, ...t }) => ({ ...t, impact: impactOf(t), rated: ratedBy?.includes(usn) ?? false }));
}

export async function getAudit(limit = 200) {
  const { audit } = await getDb();
  return audit.slice(-limit).reverse();
}

export async function stats() {
  const { tickets, reports } = await getDb();
  const by = (k) => tickets.filter((t) => t.status === k).length;
  return {
    tickets: tickets.length, reports: reports.length,
    duplicatesMerged: reports.length - tickets.length,
    open: by("open") + by("in_progress"), escalated: by("escalated"), resolved: by("resolved"),
    safety: tickets.filter((t) => t.is_safety_hazard && t.status !== "resolved").length,
    review: tickets.filter((t) => t.needsHumanReview && t.status !== "resolved").length,
  };
}

function escalate(db, t, reason, actor, outbox) {
  t.status = "escalated";
  t.escalatedTo = "HoD / Facility Head";
  t.escalatedAt = new Date().toISOString();
  t.pendingAction = null;
  stamp(t, "escalated", `Escalated to ${t.escalatedTo}: ${reason}`);
  audit(db, actor, "escalate_ticket", t.id, { reason });
  outbox.push(() =>
    sendEmail(process.env.ESCALATION_EMAIL || "hod@college.edu", `[CampusOS] ESCALATED ${t.id} ${t.category} @ ${t.building} ${t.room}`,
      `${t.summary}\n${t.reportCount} reports. ${reason}. Department: ${t.department}`)
  );
}

// AWS EventBridge Scheduler (or the admin's "simulate time" button) calls this.
export async function checkOverdue(now = Date.now(), actor = "scheduler") {
  const outbox = [];
  const out = await update((db) => {
    const escalated = [];
    for (const t of db.tickets) {
      if (ACTIVE.has(t.status) && Date.parse(t.dueBy) < now) {
        escalate(db, t, "SLA deadline passed", actor, outbox);
        escalated.push(t.id);
      }
    }
    return { escalated };
  });
  dispatch(outbox);
  return out;
}

export async function escalateTicket(id, reason = "Manual escalation", actor = "admin") {
  const outbox = [];
  const out = await update((db) => {
    const t = db.tickets.find((x) => x.id === id);
    if (!t) throw fail(404, `No ticket ${id}`);
    if (!ACTIVE.has(t.status)) throw fail(409, `${id} is already ${t.status}`);
    escalate(db, t, reason, actor, outbox);
    return { ticket: publicTicket(t) };
  });
  dispatch(outbox);
  return out;
}

// Proof-of-fix: the technician's "after" photo is compared with the reported one by the vision model.
export async function verifyFix(id, photo, actor = "technician") {
  const photoUrl = await saveImage(photo);
  const { tickets } = await getDb();
  const t = tickets.find((x) => x.id === id);
  if (!t) throw fail(404, `No ticket ${id}`);
  const before = await loadImage(t.photos[0]);
  const verdict = await verifyFixPhotos(t.summary, [before, { mime: photo.mime, base64: photo.base64 }].filter(Boolean));
  return update((db) => {
    const t = db.tickets.find((x) => x.id === id);
    t.proof = { photoUrl, at: new Date().toISOString(), ...(verdict ?? { fixed: null, confidence: null, reason: "No vision model configured: needs a human check" }), source: verdict ? "vision-llm" : "manual" };
    stamp(t, "proof", verdict ? `After-photo checked by AI: ${verdict.fixed ? "fixed" : "not fixed"} (${Math.round(verdict.confidence * 100)}%)` : "After-photo uploaded");
    audit(db, actor, "verify_fix", id, { fixed: t.proof.fixed, confidence: t.proof.confidence });
    return { ticket: publicTicket(t) };
  });
}

// Closing needs a passing proof-of-fix, unless a human admin explicitly overrides.
export async function resolveTicket(id, { note = "", override = false, actor = "admin" } = {}) {
  const outbox = [];
  const out = await update((db) => {
    const t = db.tickets.find((x) => x.id === id);
    if (!t) throw fail(404, `No ticket ${id}`);
    if (t.status === "resolved") throw fail(409, `${id} is already resolved`);
    if (!override && t.proof?.fixed !== true) throw fail(409, "Upload an after-photo that passes the fix check, or override as admin");
    t.status = "resolved";
    t.resolutionNote = note;
    t.resolvedAt = new Date().toISOString();
    t.pendingAction = null;
    t.needsHumanReview = false;
    const reporters = db.reports.filter((r) => r.ticketId === id);
    stamp(t, "resolved", `Fixed${note ? `: ${note}` : ""}. ${reporters.length} reporter(s) notified`);
    audit(db, actor, "resolve_ticket", id, { note, override, notified: reporters.length });
    const msg = `CampusOS: your report about ${t.category} at ${t.building} ${t.room} (${t.id}) is fixed. ${note}`.trim();
    for (const r of reporters) if (r.phone) outbox.push(() => sendWhatsApp(r.phone, msg));
    console.error(`[notify] -> ${reporters.length} student(s): ${t.id} fixed. ${note}`);
    return { ticket: publicTicket(t), notified: reporters.length };
  });
  dispatch(outbox);
  return out;
}

// AI agents (MCP clients) can only *request* escalate/resolve; a human approves on the dashboard.
export async function requestAction(id, action, reason = "", actor = "mcp-agent") {
  return update((db) => {
    const t = db.tickets.find((x) => x.id === id);
    if (!t) throw fail(404, `No ticket ${id}`);
    t.pendingAction = { action, reason, requestedBy: actor, at: new Date().toISOString() };
    stamp(t, "approval", `${actor} requested ${action}. Waiting for admin approval`);
    audit(db, actor, `request_${action}`, id, { reason });
    return { ticket: publicTicket(t), status: "pending_approval" };
  });
}

export async function decideAction(id, approve, actor = "admin") {
  const { tickets } = await getDb();
  const p = tickets.find((x) => x.id === id)?.pendingAction;
  if (!p) throw fail(404, `No pending action on ${id}`);
  if (!approve) {
    return update((db) => {
      const t = db.tickets.find((x) => x.id === id);
      t.pendingAction = null;
      stamp(t, "approval", `Admin rejected ${p.action}`);
      audit(db, actor, `reject_${p.action}`, id, {});
      return { ticket: publicTicket(t) };
    });
  }
  return p.action === "escalate"
    ? escalateTicket(id, p.reason || `Requested by ${p.requestedBy}`, actor)
    : resolveTicket(id, { note: p.reason, override: true, actor });
}

// Kanban: move between Open and In progress. (Escalate / Resolve have their own checks.)
export async function moveTicket(id, status, actor = "admin") {
  if (!ACTIVE.has(status)) throw fail(400, "Use escalate or resolve for that column");
  return update((db) => {
    const t = db.tickets.find((x) => x.id === id);
    if (!t) throw fail(404, `No ticket ${id}`);
    if (!ACTIVE.has(t.status)) throw fail(409, `${id} is ${t.status}`);
    if (t.status === status) return { ticket: publicTicket(t) };
    t.status = status;
    t.updatedAt = new Date().toISOString();
    stamp(t, "progress", status === "in_progress" ? "Work started" : "Moved back to open");
    audit(db, actor, "move_ticket", id, { status });
    return { ticket: publicTicket(t) };
  });
}

// Students rate the fix once it's closed.
// ponytail: one vote per browser (client-side guard); key votes by logged-in student once portals exist.
// usn given (signed-in student): only someone who reported it can rate, once.
export async function rateFix(id, vote, usn = null) {
  if (!["up", "down"].includes(vote)) throw fail(400, "vote must be up or down");
  return update((db) => {
    const t = db.tickets.find((x) => x.id === id);
    if (!t) throw fail(404, `No ticket ${id}`);
    if (t.status !== "resolved") throw fail(409, "You can rate a fix once it's resolved");
    if (usn) {
      if (!db.reports.some((r) => r.ticketId === id && r.studentId === usn)) throw fail(403, "Only students who reported this can rate the fix");
      t.ratedBy ??= [];
      if (t.ratedBy.includes(usn)) throw fail(409, "You already rated this fix");
      t.ratedBy.push(usn);
    }
    t.ratings ??= { up: 0, down: 0 };
    t.ratings[vote] += 1;
    audit(db, "student", "rate_fix", id, { vote });
    return { ratings: t.ratings };
  });
}
