// The CampusOS MCP tool set. Used by the stdio server (src/mcp-server.js) and the HTTP endpoint (/mcp).
// Controlled by design: agents can report, read and request; escalate/resolve need a human's approval.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { handleReport, listTickets, getTicket, stats, checkOverdue, requestAction } from "./agent.js";
import { wifiMap, parseRoom } from "./wifi.js";

const json = (obj) => ({ content: [{ type: "text", text: JSON.stringify(obj, null, 2) }] });
const safe = (fn) => async (args) => {
  try {
    return json(await fn(args ?? {}));
  } catch (err) {
    return { ...json({ error: err.message }), isError: true };
  }
};

export function createMcpServer(actor = "mcp-agent") {
  const server = new McpServer({ name: "campusos", version: "0.2.0" });

  server.tool(
    "report_issue",
    "File a campus complaint. CampusOS classifies it (issue, location, urgency, safety), merges it into an existing open ticket if it's a duplicate, and assigns the right department with an SLA.",
    {
      text: z.string().min(3).max(500).describe("Complaint text, e.g. 'Projector in C-204 not working'. Any language."),
      studentId: z.string().max(40).optional().describe("Student USN or ID"),
      channel: z.enum(["voice", "whatsapp", "web", "agent"]).optional().describe("Where the complaint came from"),
    },
    safe(({ text, studentId, channel }) => handleReport({ text, studentId, channel: channel ?? "agent", actor }))
  );

  server.tool(
    "list_tickets",
    "List campus tickets. Safety hazards first, then most-reported.",
    { status: z.enum(["open", "escalated", "resolved", "all"]).optional() },
    safe(async ({ status }) =>
      (await listTickets(status ?? "all")).map(({ timeline, reportIds, ...t }) => t)
    )
  );

  server.tool(
    "get_ticket",
    "Get one ticket with its timeline and reports, e.g. to tell a student the status of their complaint.",
    { ticketId: z.string().describe("e.g. T1001") },
    safe(({ ticketId }) => getTicket(ticketId))
  );

  server.tool(
    "wifi_status",
    "Live Wi-Fi per room, measured by students' phones (median Mbps in the last 30 min vs the room's usual speed). Use it to answer 'where is Wi-Fi bad right now?' or to back up a Wi-Fi complaint with data. Read-only.",
    { room: z.string().max(12).optional().describe("e.g. 'L-201'; omit for every room") },
    safe(async ({ room }) => {
      const m = await wifiMap();
      const rooms = room ? m.rooms.filter((r) => r.room === parseRoom(room)) : m.rooms;
      return { phonesToday: m.phonesToday, rooms: rooms.map(({ spark, ...r }) => r) };
    })
  );

  server.tool("ticket_stats", "Counts: open, escalated, resolved, safety hazards, duplicates merged.", {}, safe(() => stats()));

  server.tool(
    "check_overdue",
    "Escalate every open ticket that is past its SLA deadline (the same job the scheduler runs).",
    {},
    safe(() => checkOverdue(Date.now(), actor))
  );

  server.tool(
    "request_escalation",
    "Ask an admin to escalate a ticket to the HoD. Does NOT escalate by itself: an admin approves it on the dashboard.",
    { ticketId: z.string(), reason: z.string().max(200) },
    safe(({ ticketId, reason }) => requestAction(ticketId, "escalate", reason, actor))
  );

  server.tool(
    "request_resolution",
    "Ask an admin to close a ticket as fixed. Does NOT close it by itself: an admin approves it (ideally after a proof-of-fix photo).",
    { ticketId: z.string(), note: z.string().max(200).optional() },
    safe(({ ticketId, note }) => requestAction(ticketId, "resolve", note ?? "", actor))
  );

  return server;
}
