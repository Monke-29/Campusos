// Demo for the video: 15 students report the same projector -> CampusOS makes ONE ticket.
import fs from "node:fs";
import "../src/env.js";

const { handleReport, checkOverdue, resolveTicket, listTickets } = await import("../src/agent.js");
const { reset } = await import("../src/store.js");

await reset();

// 15 projector complaints + Wi-Fi, cooler, sparks, a prompt-injection attempt (shared with the web app's "Load demo")
const complaints = JSON.parse(fs.readFileSync(new URL("../data/demo-complaints.json", import.meta.url), "utf8"));

for (const text of complaints) {
  const { merged, ticket } = await handleReport({ text, actor: "demo" });
  console.log(`${merged ? "MERGED " : "NEW    "} ${ticket.id}  x${String(ticket.reportCount).padEnd(2)}  "${text}"`);
}

console.log("\n=== Tickets (15 complaints about one projector became ONE ticket) ===");
console.table((await listTickets()).map((t) => ({
  ticket: t.id, issue: t.category, where: `${t.building} ${t.room}`, reports: t.reportCount,
  department: t.department, urgency: t.urgency, safety: t.is_safety_hazard ? "YES" : "", review: t.needsHumanReview ? "HUMAN" : "",
})));

// Simulate time passing: 30 hours later, overdue tickets escalate automatically
console.log("\n=== 30 hours later ===");
console.log(await checkOverdue(Date.now() + 30 * 3600e3));

// Fix the projector and close the loop with all 15 students (admin override: no after-photo in the terminal demo)
console.log("\n=== Technician fixes the projector ===");
const { ticket, notified } = await resolveTicket("T1001", { note: "Replaced HDMI cable and lamp", override: true });
console.log(`${ticket.id} -> ${ticket.status}; ${notified} students notified`);
