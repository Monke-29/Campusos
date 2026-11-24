// CampusOS web backend: a small JSON API + the web UI, on Node's built-in http module.
// Same agent logic as the MCP server (src/agent.js). Hack day: move to Express/Lambda + Supabase.
import "./env.js";
import http from "node:http";
import fs from "node:fs";
import { handleReport, listTickets, checkOverdue, resolveTicket } from "./agent.js";
import { reset } from "./store.js";

const PORT = Number(process.env.PORT) || 3000;
const PAGE = new URL("../public/index.html", import.meta.url);
const DEMO = JSON.parse(fs.readFileSync(new URL("../data/demo-complaints.json", import.meta.url), "utf8"));

const fail = (status, message) => Object.assign(new Error(message), { status });

const send = (res, status, body) => {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
};

async function readJson(req) {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 10_000) throw new Error("Body too large");
  }
  return raw ? JSON.parse(raw) : {};
}

const routes = {
  "GET /api/tickets": async (req, url) => listTickets(url.searchParams.get("status") || "all"),

  "POST /api/report": async (req) => {
    const { text, studentId } = await readJson(req);
    if (typeof text !== "string" || !text.trim()) throw fail(400, "Complaint text is required");
    return handleReport({ text: text.trim().slice(0, 500), studentId: String(studentId || "anon").slice(0, 40) });
  },

  // hours > 0 simulates time passing, so overdue tickets can be shown without waiting
  "POST /api/check-overdue": async (req) => {
    const hours = Math.min(Math.max(Number((await readJson(req)).hours) || 0, 0), 1000);
    return checkOverdue(Date.now() + hours * 3600e3);
  },

  "POST /api/resolve": async (req) => {
    const { ticketId, note } = await readJson(req);
    const out = resolveTicket(String(ticketId), String(note || "").slice(0, 200));
    if (out.error) throw fail(404, out.error);
    return out;
  },

  "POST /api/demo": async () => {
    reset();
    for (const text of DEMO) await handleReport({ text, studentId: "demo" });
    return { loaded: DEMO.length };
  },

  "POST /api/reset": async () => (reset(), { ok: true }),
};

http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (req.method === "GET" && url.pathname === "/") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    return fs.createReadStream(PAGE).pipe(res);
  }
  const route = routes[`${req.method} ${url.pathname}`];
  if (!route) return send(res, 404, { error: "Not found" });
  try {
    send(res, 200, await route(req, url));
  } catch (err) {
    send(res, err.status || 400, { error: err.message });
  }
}).listen(PORT, () => console.error(`CampusOS web app: http://localhost:${PORT}`));
