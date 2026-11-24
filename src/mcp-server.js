// CampusOS as an MCP server: any MCP client (a desktop assistant, an ElevenLabs agent, ...) can call these tools.
import "./env.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { handleReport, listTickets, checkOverdue, resolveTicket } from "./agent.js";

const server = new McpServer({ name: "campusos", version: "0.1.0" });
const json = (obj) => ({ content: [{ type: "text", text: JSON.stringify(obj, null, 2) }] });

server.tool(
  "report_issue",
  "File a campus complaint. CampusOS classifies it (issue, location, urgency), merges it into an existing open ticket if it's a duplicate, and assigns the right department.",
  {
    text: z.string().describe("Complaint text, e.g. 'Projector in C-204 not working'"),
    studentId: z.string().optional().describe("Student USN or ID"),
  },
  async ({ text, studentId }) => json(await handleReport({ text, studentId }))
);

server.tool(
  "list_tickets",
  "List campus tickets, most-reported first.",
  { status: z.enum(["open", "escalated", "resolved", "all"]).optional() },
  async ({ status }) => json(listTickets(status ?? "all"))
);

server.tool(
  "check_overdue",
  "Escalate every open ticket that is past its SLA deadline.",
  async () => json(checkOverdue())
);

server.tool(
  "resolve_ticket",
  "Mark a ticket as fixed and notify everyone who reported it. In production this needs admin approval.",
  { ticketId: z.string(), note: z.string().optional() },
  async ({ ticketId, note }) => json(resolveTicket(ticketId, note))
);

await server.connect(new StdioServerTransport());
console.error("CampusOS MCP server running (stdio)");
