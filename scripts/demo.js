// Demo for the video: 15 students report the same projector -> CampusOS makes ONE ticket.
import "../src/env.js";
import { handleReport, checkOverdue, resolveTicket } from "../src/agent.js";
import { reset, getDb } from "../src/store.js";

reset();

const projector = [
  "Projector in C-204 not working",
  "C-204 projector shows no display",
  "projector dead again in C 204",
  "No display on the C204 projector, class can't start",
  "Room C-204 projector keeps switching off",
  "C-204: HDMI not detected on projector",
  "projector in c-204 broken since morning",
  "C-204 screen is blank, projector issue",
  "Projector not turning on in C-204",
  "Lecture delayed, C-204 projector not working",
  "C 204 projector flickering then off",
  "Please fix projector C-204",
  "C-204 projector no signal",
  "Projector remote and projector both not working C-204",
  "C204 projector problem again!!",
];
const others = [
  "Wi-Fi not working in L-201 library reading hall",
  "Water cooler leaking near H-105 hostel corridor",
  "Sparks coming from the switchboard in B-110!",
];

for (const text of [...projector, ...others]) {
  const { merged, ticket } = await handleReport({ text });
  console.log(`${merged ? "MERGED " : "NEW    "} ${ticket.id}  x${String(ticket.reportCount).padEnd(2)}  "${text}"`);
}

console.log("\n=== Tickets (15 complaints about one projector became ONE ticket) ===");
console.table(getDb().tickets.map((t) => ({
  ticket: t.id, issue: t.category, where: `${t.building} ${t.room}`, reports: t.reportCount,
  department: t.department, urgency: t.urgency, safety: t.is_safety_hazard ? "YES" : "",
})));

// Simulate time passing: 30 hours later, overdue tickets escalate automatically
console.log("\n=== 30 hours later ===");
console.log(checkOverdue(Date.now() + 30 * 3600e3));

// Fix the projector and close the loop with all 15 students
console.log("\n=== Technician fixes the projector ===");
const { ticket } = resolveTicket("T1001", "Replaced HDMI cable and lamp");
console.log(`${ticket.id} -> ${ticket.status}; ${ticket.reportCount} students notified`);
