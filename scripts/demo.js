// Demo for the video: 15 students report the same projector -> CampusOS makes ONE ticket.
import fs from "node:fs";
import "../src/env.js";
import { handleReport, checkOverdue, resolveTicket } from "../src/agent.js";
import { reset, getDb } from "../src/store.js";

reset();

// 15 projector complaints + Wi-Fi, cooler, sparks (shared with the web UI's "Load demo" button)
const complaints = JSON.parse(fs.readFileSync(new URL("../data/demo-complaints.json", import.meta.url), "utf8"));

for (const text of complaints) {
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
