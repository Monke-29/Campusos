// Backdated, already-resolved tickets so the demo dashboard has a month of history:
// graphs, SLA health, recurring problems and failure predictions all have something to show.
import fs from "node:fs";

const DEPTS = JSON.parse(fs.readFileSync(new URL("../data/departments.json", import.meta.url), "utf8"));
const DAY = 86400e3;

// [category, building, room, summary, daysAgo, hoursToFix, reports, rating 👍/👎]
const PAST = [
  ["projector", "Block C", "204", "Projector in C-204 shows no signal", 34, 20, 9, [7, 1]],
  ["projector", "Block C", "204", "C-204 projector lamp flickering", 23, 30, 11, [5, 3]],
  ["projector", "Block C", "204", "C-204 projector won't turn on", 12, 16, 8, [8, 0]],
  ["water", "Block H", "105", "Cooler leaking in H-105 corridor", 40, 50, 4, [2, 1]],
  ["water", "Block H", "105", "Water cooler not cooling, H-105", 26, 30, 3, [3, 0]],
  ["water", "Block H", "105", "H-105 cooler leaking again", 14, 44, 5, [1, 3]],
  ["wifi", "Block L", "201", "Wi-Fi down in L-201 reading hall", 29, 9, 14, [10, 2]],
  ["wifi", "Block L", "201", "Library Wi-Fi very slow", 15, 14, 9, [4, 4]],
  ["wifi", "Block A", "101", "No internet in A-101", 9, 6, 6, [5, 0]],
  ["electrical", "Block B", "112", "Fan not working in B-112 lab", 31, 10, 2, [2, 0]],
  ["electrical", "Block A", "102", "Two tube lights out in A-102", 20, 12, 3, [3, 0]],
  ["electrical", "Block D", "301", "Loose socket sparking in D-301", 18, 1.5, 2, [2, 0]],
  ["electrical", "Block C", "205", "Switchboard cover broken C-205", 7, 6, 1, [1, 0]],
  ["hostel", "Block H", "210", "Bathroom tap broken, H-210", 27, 60, 3, [1, 2]],
  ["hostel", "Block H", "210", "Bed frame broken in H-210", 11, 80, 1, [0, 1]],
  ["equipment", "Block B", "110", "Oscilloscope missing from B-110", 22, 96, 2, [1, 1]],
  ["equipment", "Block A", "101", "Broken benches in A-101", 16, 70, 4, [2, 1]],
  ["projector", "Block A", "102", "A-102 projector HDMI port loose", 19, 20, 5, [4, 0]],
  ["projector", "Block D", "301", "D-301 projector remote missing", 5, 22, 3, [2, 1]],
  ["wifi", "Block H", "105", "Hostel Wi-Fi drops at night", 3, 18, 7, [3, 2]],
];
const CHANNELS = ["web", "whatsapp", "voice", "web", "whatsapp", "web"];

export function seedHistory(db, now = Date.now()) {
  PAST.forEach(([category, building, room, summary, daysAgo, hoursToFix, reports, [up, down]], i) => {
    const dept = DEPTS[category];
    const safety = /spark/i.test(summary);
    const slaHours = safety ? 2 : dept.slaHours;
    const created = now - daysAgo * DAY + (i % 5) * 3600e3;
    const at = (ms) => new Date(ms).toISOString();
    const id = `T${String(901 + i).padStart(4, "0")}`;
    const reportIds = [];
    const channels = {};
    for (let k = 0; k < reports; k++) {
      const channel = CHANNELS[(i + k) % CHANNELS.length];
      channels[channel] = (channels[channel] || 0) + 1;
      const rid = `R${db.reports.length + 1}`;
      reportIds.push(rid);
      db.reports.push({ id: rid, ticketId: id, text: summary, studentId: `1MS22CS${String(200 + i * 9 + k).padStart(3, "0")}`, phone: null, channel, photoUrl: null, createdAt: at(created + k * Math.min(hoursToFix, 6) * 600e3) });
    }
    db.tickets.push({
      id, category, building, room, summary, urgency: safety ? "critical" : "high", is_safety_hazard: safety,
      department: dept.dept, deptEmail: dept.email, slaHours, status: "resolved", reportCount: reports, reportIds, channels,
      needsHumanReview: false, suspicious: false, confidence: 0.9, classifiedBy: "history",
      photos: [], proof: { fixed: true, confidence: 0.9, reason: "Verified", source: "history", at: at(created + hoursToFix * 3600e3) },
      pendingAction: null, createdAt: at(created), updatedAt: at(created + hoursToFix * 3600e3),
      dueBy: at(created + slaHours * 3600e3), resolvedAt: at(created + hoursToFix * 3600e3),
      ratings: { up, down }, embedding: null,
      timeline: [
        { at: at(created), type: "created", text: `Reported. Classified as ${category}` },
        { at: at(created + hoursToFix * 3600e3), type: "resolved", text: `Fixed. ${reports} reporter(s) notified` },
      ],
    });
  });
}
