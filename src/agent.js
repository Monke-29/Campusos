// Core CampusOS pipeline: classify -> find duplicate -> merge or create -> assign -> notify.
import fs from "node:fs";
import { update, getDb } from "./store.js";
import { classify } from "./classify.js";

const DEPTS = JSON.parse(fs.readFileSync(new URL("../data/departments.json", import.meta.url), "utf8"));
const RANK = { low: 0, medium: 1, high: 2, critical: 3 };
const rank = (u) => RANK[u] ?? 1;
const norm = (s) => String(s ?? "").toLowerCase().replace(/block|room|\s|-/g, "");

// Same open issue = same category + same building + same room.
// Hack day: replace with embeddings (pgvector) + LLM "same issue?" check.
export function findSimilar(db, c) {
  return db.tickets.find(
    (t) => t.status !== "resolved" && t.category === c.category &&
      norm(t.building) === norm(c.building) && norm(t.room) === norm(c.room) &&
      norm(c.room) !== "unknown"
  );
}

// Tonight: log only. Hack day: Gmail / AWS SES / WhatsApp via MCP. (stderr so MCP stdio stays clean)
function notify(ticket, merged) {
  const msg = merged
    ? `update: now ${ticket.reportCount} reports`
    : `NEW ticket, due by ${new Date(ticket.dueBy).toLocaleString()}`;
  console.error(`[notify] -> ${ticket.department} <${ticket.deptEmail}> | ${ticket.id} ${ticket.category} @ ${ticket.building} ${ticket.room} | ${msg}`);
}

export async function handleReport({ text, studentId = "anon", photoUrl = null }) {
  const c = await classify(text);
  return update((db) => {
    const now = new Date().toISOString();
    const report = { id: `R${db.reports.length + 1}`, text, studentId, photoUrl, createdAt: now };
    let ticket = findSimilar(db, c);
    const merged = Boolean(ticket);

    if (ticket) {
      ticket.reportCount += 1;
      ticket.reportIds.push(report.id);
      if (rank(c.urgency) > rank(ticket.urgency)) ticket.urgency = c.urgency;
      if (c.is_safety_hazard) ticket.is_safety_hazard = true;
      ticket.updatedAt = now;
    } else {
      const dept = DEPTS[c.category] ?? DEPTS.other;
      const slaHours = c.is_safety_hazard ? 2 : dept.slaHours; // safety fast lane
      ticket = {
        id: `T${1001 + db.tickets.length}`,
        category: c.category, building: c.building, room: c.room, summary: c.summary,
        urgency: c.urgency, is_safety_hazard: Boolean(c.is_safety_hazard),
        department: dept.dept, deptEmail: dept.email,
        status: "open", reportCount: 1, reportIds: [report.id],
        needsHumanReview: (c.confidence ?? 1) < 0.5, // low confidence -> human triage queue
        createdAt: now, updatedAt: now,
        dueBy: new Date(Date.now() + slaHours * 3600e3).toISOString(),
      };
      db.tickets.push(ticket);
    }

    report.ticketId = ticket.id;
    db.reports.push(report);
    notify(ticket, merged);
    return { merged, ticket, classification: c };
  });
}

export function listTickets(status = "all") {
  const { tickets } = getDb();
  const list = status === "all" ? tickets : tickets.filter((t) => t.status === status);
  // Safety fast lane first, then most-reported
  return list.sort((a, b) => b.is_safety_hazard - a.is_safety_hazard || b.reportCount - a.reportCount);
}

// Hack day: AWS EventBridge Scheduler calls this automatically.
export function checkOverdue(now = Date.now()) {
  return update((db) => {
    const escalated = [];
    for (const t of db.tickets) {
      if (t.status === "open" && new Date(t.dueBy).getTime() < now) {
        t.status = "escalated";
        t.escalatedTo = "HoD / Facility Head";
        escalated.push(t.id);
        console.error(`[escalate] ${t.id} overdue -> ${t.escalatedTo}`);
      }
    }
    return { escalated };
  });
}

// Hack day: require an "after" photo + vision-AI check (proof-of-fix) before closing.
export function resolveTicket(ticketId, note = "") {
  return update((db) => {
    const t = db.tickets.find((x) => x.id === ticketId);
    if (!t) return { error: `No ticket ${ticketId}` };
    t.status = "resolved";
    t.resolutionNote = note;
    t.resolvedAt = new Date().toISOString();
    console.error(`[notify] -> ${t.reportCount} student(s): ${t.id} fixed. ${note}`);
    return { ticket: t };
  });
}
