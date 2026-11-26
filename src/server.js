// CampusOS web backend on Node's built-in http module:
// JSON API + live updates (SSE) + Twilio WhatsApp webhook + MCP over HTTP + the built React app (dist/).
import "./env.js";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const { StreamableHTTPServerTransport } = await import("@modelcontextprotocol/sdk/server/streamableHttp.js");
const agent = await import("./agent.js");
const { reset, onChange, storeKind } = await import("./store.js");
const { llmKind } = await import("./ai.js");
const io = await import("./integrations.js");
const { createMcpServer } = await import("./mcp-tools.js");
const insights = await import("./insights.js");
const { seedHistory } = await import("./history.js");
const wifi = await import("./wifi.js");
const auth = await import("./auth.js");
const BLOB = (await import("node:crypto")).randomBytes(4 * 1024 * 1024); // speed-test payload, random so nothing can compress it
const { update, getDb } = await import("./store.js");

const PORT = Number(process.env.PORT) || 3000;
const DIST = fileURLToPath(new URL("../dist/", import.meta.url));
const DEMO = JSON.parse(fs.readFileSync(new URL("../data/demo-complaints.json", import.meta.url), "utf8"));
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif", ".ico": "image/x-icon", ".json": "application/json" };
const BIG = 8_000_000; // photo / voice uploads (base64 in JSON)

const fail = (status, message) => Object.assign(new Error(message), { status });
const send = (res, status, body) => {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
};

async function readBody(req, limit = 20_000) {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > limit) throw fail(413, "Body too large");
  }
  return raw;
}
const readJson = async (req, limit) => {
  const raw = await readBody(req, limit);
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    throw fail(400, "Invalid JSON");
  }
};
const str = (v, max) => String(v ?? "").trim().slice(0, max);
const image = (dataUrl) => {
  const img = io.parseDataUrl(dataUrl, ["image/"]);
  if (!img) throw fail(400, "photo must be an image data URL");
  return img;
};

// Who is calling: the signed-in user (session cookie), or an admin script using ADMIN_TOKEN.
const ROLE_LABEL = { technician: "technician", dept_head: "dept head", admin: "admin", student: "student", faculty: "faculty" };
async function whoIs(req) {
  if (req.user !== undefined) return req.user;
  const token = process.env.ADMIN_TOKEN;
  if (token && req.headers["x-admin-token"] === token) return (req.user = { id: "token", name: "admin script", role: "admin" });
  return (req.user = await auth.userFromToken(auth.readToken(req)));
}
async function requireStaff(req, ...roles) {
  const u = await whoIs(req);
  if (!u) throw fail(401, "Sign in to continue");
  if (!auth.STAFF.has(u.role) || (roles.length && !roles.includes(u.role))) throw fail(403, "Your account can't do that");
  return u;
}
const requireAdmin = (req) => requireStaff(req, "admin");
const actorOf = (u) => `${u.name} (${ROLE_LABEL[u.role]})`;
// Staff action on one ticket: department heads and technicians only on their own department's tickets.
async function staffOn(req, ticketId, action) {
  const u = await requireStaff(req);
  const t = await agent.getTicket(ticketId);
  if (!auth.canActOn(u, t, action)) throw fail(403, `Only ${t.department} (or an admin) can do that on ${t.id}`);
  return u;
}
const ip = (req) => req.socket.remoteAddress ?? "";
const signIn = (res, { token, user }) => (res.setHeader("Set-Cookie", auth.sessionCookie(token)), { user });

const xml = (s) => s.replace(/[<>&'"]/g, (c) => `&#${c.charCodeAt(0)};`);

const routes = {
  // ---- accounts ----
  "GET /api/auth/me": async (req) => {
    const u = await whoIs(req);
    const { users = [] } = await getDb();
    const demo = process.env.DEMO_ACCOUNTS !== "off" && auth.DEMO_USERS.every((d) => users.some((x) => x.email === d.email && !x.disabled));
    return {
      user: u ? auth.publicUser(u) : null, setup: await auth.needsSetup(), departments: auth.DEPARTMENTS,
      collegeDomain: process.env.COLLEGE_EMAIL_DOMAIN ?? null, googleClientId: process.env.GOOGLE_CLIENT_ID || null,
      demoAccounts: demo ? auth.DEMO_USERS.map(({ name, email, role, department }) => ({ name, email, role, department, password: auth.DEMO_PASSWORD })) : null,
    };
  },
  "POST /api/auth/setup": async (req, url, res) => {
    const b = await readJson(req);
    await auth.setup({ name: str(b.name, 60), email: str(b.email, 254), password: String(b.password ?? "") });
    return signIn(res, await auth.login({ id: str(b.email, 254), password: String(b.password ?? "") }, ip(req)));
  },
  "POST /api/auth/signup": async (req, url, res) => {
    const b = await readJson(req);
    await auth.signupStudent({ name: str(b.name, 60), usn: str(b.usn, 16), email: str(b.email, 254), password: String(b.password ?? ""), role: str(b.role, 16) || "student" });
    return signIn(res, await auth.login({ id: str(b.email, 254), password: String(b.password ?? "") }, ip(req)));
  },
  "POST /api/auth/login": async (req, url, res) => {
    const b = await readJson(req);
    return signIn(res, await auth.login({ id: str(b.id, 254), password: String(b.password ?? "").slice(0, 200) }, ip(req)));
  },
  "POST /api/auth/google": async (req, url, res) => {
    const b = await readJson(req);
    const r = await auth.googleSignIn({ credential: str(b.credential, 4096), usn: str(b.usn, 16), role: str(b.role, 16) || "student" });
    return r.needUsn ? r : signIn(res, r);
  },
  "POST /api/me/profile": async (req) => {
    const b = await readJson(req);
    return { user: await auth.updateProfile(await whoIs(req), { name: b.name == null ? null : str(b.name, 60), currentPassword: String(b.currentPassword ?? "").slice(0, 200), newPassword: String(b.newPassword ?? "").slice(0, 200) }) };
  },
  "POST /api/auth/logout": async (req, url, res) => {
    await auth.logout(auth.readToken(req));
    res.setHeader("Set-Cookie", auth.sessionCookie("", { clear: true }));
    return { ok: true };
  },
  "GET /api/users": async (req) => auth.listUsers(await requireAdmin(req)),
  "POST /api/users": async (req) => {
    const by = await requireAdmin(req);
    const b = await readJson(req);
    return auth.createStaff({ name: str(b.name, 60), email: str(b.email, 254), role: str(b.role, 16), department: str(b.department, 60), password: String(b.password ?? "") }, by);
  },
  "POST /api/users/remove": async (req) => {
    const by = await requireAdmin(req);
    return auth.disableUser(str((await readJson(req)).id, 40), by);
  },
  "GET /api/my/tickets": async (req) => {
    const u = await whoIs(req);
    if (!auth.reporterId(u)) throw fail(401, "Sign in with your community account");
    return agent.myTickets(auth.reporterId(u));
  },

  "GET /api/config": async () => ({
    llm: llmKind() ?? "keywords", store: storeKind, ...io.status(),
    embeddings: Boolean(process.env.AWS_BEARER_TOKEN_BEDROCK || process.env.EMBEDDING_MODEL),
    adminLocked: Boolean(process.env.ADMIN_TOKEN), mcpLocked: Boolean(process.env.MCP_TOKEN),
    agentId: process.env.ELEVENLABS_AGENT_ID || null,
    accuracy: (() => { try { return JSON.parse(fs.readFileSync(new URL("../data/accuracy.json", import.meta.url), "utf8")); } catch { return null; } })(),
  }),
  "GET /api/tickets": async (req, url) => agent.listTickets(url.searchParams.get("status") || "all"),
  "GET /api/stats": async () => agent.stats(),
  "GET /api/analytics": async () => insights.analytics(),

  // Students rate a fix after it's closed
  "POST /api/rate": async (req) => {
    const u = await whoIs(req);
    if (!auth.reporterId(u)) throw fail(401, "Sign in with your community account to rate the fix");
    const { ticketId, vote } = await readJson(req);
    return agent.rateFix(str(ticketId, 20), vote, auth.reporterId(u));
  },

  // Phone as a sensor: speed-test payload, measurements in, live Wi-Fi map out.
  "GET /api/speed/blob": async (req, url, res) => {
    const kb = Math.max(16, Math.min(4096, Number(url.searchParams.get("kb")) || 256));
    res.writeHead(200, { "Content-Type": "application/octet-stream", "Content-Length": kb * 1024, "Cache-Control": "no-store" });
    res.end(BLOB.subarray(0, kb * 1024));
    return undefined;
  },
  "POST /api/speed": async (req) => {
    const b = await readJson(req);
    return wifi.recordSample({ room: str(b.room, 12), mbps: b.mbps, latency: b.latency, device: str(b.device, 40) });
  },
  "GET /api/wifi": async () => wifi.wifiMap(),
  "POST /api/wifi/simulate": async (req) => (await requireAdmin(req), wifi.simulateOutage(str((await readJson(req)).room, 12) || "A-101")),

  "POST /api/report": async (req) => {
    const body = await readJson(req, BIG);
    const text = str(body.text, 500);
    if (!text) throw fail(400, "Describe the problem");
    return agent.handleReport({
      text, studentId: auth.reporterId(await whoIs(req)) || str(body.studentId, 40) || "anon",
      photo: body.photo ? image(body.photo) : null,
      channel: ["web", "voice"].includes(body.channel) ? body.channel : "web",
    });
  },

  // Voice note → text (ElevenLabs Scribe). 501 tells the client to use the browser's speech recognition.
  "POST /api/transcribe": async (req) => {
    const audio = io.parseDataUrl((await readJson(req, BIG)).audio, ["audio/", "video/webm"]);
    if (!audio) throw fail(400, "audio must be an audio data URL");
    const out = await io.transcribe(audio).catch((err) => {
      console.error("[transcribe]", err.message);
      throw fail(502, "Voice service failed");
    });
    if (!out) throw fail(501, "ElevenLabs not configured");
    return out;
  },

  // Text → speech (ElevenLabs). 501 tells the client to use speechSynthesis.
  "POST /api/tts": async (req, url, res) => {
    const text = str((await readJson(req)).text, 400);
    if (!text) throw fail(400, "text is required");
    const mp3 = await io.speak(text);
    if (!mp3) throw fail(501, "ElevenLabs not configured");
    res.writeHead(200, { "Content-Type": "audio/mpeg" });
    res.end(mp3);
    return undefined;
  },

  // Twilio WhatsApp webhook: text and/or photo → ticket, reply with the ticket number.
  "POST /api/whatsapp": async (req, url, res) => {
    if (io.status().whatsapp !== "twilio") throw fail(503, "Twilio not configured");
    const params = Object.fromEntries(new URLSearchParams(await readBody(req, 50_000)));
    const publicUrl = `${(process.env.PUBLIC_URL || `http://localhost:${PORT}`).replace(/\/$/, "")}/api/whatsapp`;
    if (!io.validTwilioSignature(req.headers["x-twilio-signature"], publicUrl, params)) throw fail(403, "Bad Twilio signature");

    let photo = null;
    if (Number(params.NumMedia) > 0 && params.MediaContentType0?.startsWith("image/")) {
      const media = await io.fetchTwilioMedia(params.MediaUrl0);
      photo = { ...media, base64: media.buffer.toString("base64") };
    }
    const text = str(params.Body, 500) || (photo ? "Photo report (see image)" : "");
    let reply = "Send a short description of the problem (and a photo if you can), e.g. 'Projector in C-204 not working'.";
    if (text) {
      const { merged, ticket } = await agent.handleReport({
        text, photo, channel: "whatsapp", phone: params.From, studentId: str(params.From, 40), actor: "whatsapp",
      });
      reply = merged
        ? `Thanks! This is already ticket ${ticket.id} (${ticket.reportCount} reports). ${ticket.department} is on it. We'll message you when it's fixed.`
        : `Ticket ${ticket.id} created: ${ticket.category} at ${ticket.building} ${ticket.room}, ${ticket.urgency}${ticket.is_safety_hazard ? " (SAFETY, 2h)" : ""}. Assigned to ${ticket.department}.`;
    }
    res.writeHead(200, { "Content-Type": "text/xml" });
    res.end(`<?xml version="1.0" encoding="UTF-8"?><Response><Message>${xml(reply)}</Message></Response>`);
    return undefined;
  },

  // ---- admin ----
  "GET /api/audit": async (req) => (await requireStaff(req), agent.getAudit()),

  // hours > 0 simulates time passing, so overdue tickets can be shown without waiting
  "POST /api/check-overdue": async (req) => {
    const u = await requireStaff(req, "admin", "dept_head");
    const hours = Math.min(Math.max(Number((await readJson(req)).hours) || 0, 0), 1000);
    return agent.checkOverdue(Date.now() + hours * 3600e3, hours ? `${actorOf(u)}, simulated time` : actorOf(u));
  },
  "POST /api/ask": async (req) => (await requireStaff(req), insights.ask((await readJson(req)).question)),
  "POST /api/move": async (req) => {
    const { ticketId, status } = await readJson(req);
    const u = await staffOn(req, str(ticketId, 20), "move");
    return agent.moveTicket(str(ticketId, 20), status, actorOf(u));
  },
  "POST /api/escalate": async (req) => {
    const { ticketId, reason } = await readJson(req);
    const u = await staffOn(req, str(ticketId, 20), "escalate");
    return agent.escalateTicket(str(ticketId, 20), str(reason, 200) || "Manual escalation", actorOf(u));
  },
  "POST /api/verify-fix": async (req) => {
    const { ticketId, photo } = await readJson(req, BIG);
    const u = await staffOn(req, str(ticketId, 20), "verify");
    return agent.verifyFix(str(ticketId, 20), image(photo), actorOf(u));
  },
  "POST /api/resolve": async (req) => {
    const { ticketId, note, override } = await readJson(req);
    const u = await staffOn(req, str(ticketId, 20), "resolve");
    if (override === true && u.role !== "admin") throw fail(403, "Only an admin can close a ticket without a verified fix photo");
    return agent.resolveTicket(str(ticketId, 20), { note: str(note, 200), override: override === true, actor: actorOf(u) });
  },
  "POST /api/decide": async (req) => {
    const { ticketId, approve } = await readJson(req);
    const u = await staffOn(req, str(ticketId, 20), "decide");
    return agent.decideAction(str(ticketId, 20), approve === true, actorOf(u));
  },
  "POST /api/demo": async (req) => {
    await requireAdmin(req);
    await reset();
    await update(async (db) => (seedHistory(db), wifi.seedWifi(db), await auth.seedDemoUsers(db)));
    const channels = ["web", "whatsapp", "voice", "web", "whatsapp"];
    for (const [i, text] of DEMO.entries())
      await agent.handleReport({ text, studentId: `1MS22CS${String(100 + i * 7).padStart(3, "0")}`, channel: channels[i % channels.length], actor: "demo" });
    return { loaded: DEMO.length };
  },
  "POST /api/reset": async (req) => (await requireAdmin(req), await reset(), { ok: true }),
};

// Live dashboard: every store write pings connected clients.
function stream(req, res) {
  res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
  res.write("retry: 2000\n\n");
  const off = onChange(() => res.write("data: change\n\n"));
  const ping = setInterval(() => res.write(": ping\n\n"), 25_000);
  req.on("close", () => (off(), clearInterval(ping)));
}

// MCP over Streamable HTTP (stateless), for the ElevenLabs voice agent and other remote MCP clients.
async function mcp(req, res) {
  const token = process.env.MCP_TOKEN;
  console.error(`[mcp] ${req.method} auth=${!token ? "off" : req.headers.authorization === `Bearer ${token}` ? "ok" : req.headers.authorization ? "wrong" : "missing"} accept=${req.headers.accept} ua=${req.headers["user-agent"]}`);
  if (token && req.headers.authorization !== `Bearer ${token}`) return send(res, 401, { error: "Bearer token required" });
  if (req.method !== "POST") return send(res, 405, { error: "Use POST (stateless MCP)" });
  const server = createMcpServer("mcp-agent");
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on("close", () => (transport.close(), server.close()));
  await server.connect(transport);
  await transport.handleRequest(req, res, await readJson(req, 100_000));
}

function serveFile(res, file) {
  res.writeHead(200, {
    "Content-Type": TYPES[path.extname(file)] || "application/octet-stream",
    "Cache-Control": file.includes(`${path.sep}assets${path.sep}`) || file.includes(`${path.sep}fonts${path.sep}`) ? "public, max-age=31536000, immutable" : "no-cache",
  });
  fs.createReadStream(file).pipe(res);
}

function staticFiles(req, res, pathname) {
  const inside = (root, p) => {
    const file = path.join(root, decodeURIComponent(p));
    return file.startsWith(root) && fs.existsSync(file) && fs.statSync(file).isFile() ? file : null;
  };
  if (pathname.startsWith("/uploads/")) {
    const file = inside(io.uploadsDir, pathname.slice("/uploads/".length));
    return file ? serveFile(res, file) : send(res, 404, { error: "Not found" });
  }
  const file = inside(DIST, pathname.slice(1));
  if (file) return serveFile(res, file);
  const index = path.join(DIST, "index.html");
  if (fs.existsSync(index)) return serveFile(res, index); // SPA routes
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Frontend not built. Run `npm run build` (or `npm run dev` for the Vite dev server on :5173).");
}

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    try {
      if (url.pathname === "/mcp") return await mcp(req, res);
      if (url.pathname === "/api/stream") return stream(req, res);
      const ticket = /^\/api\/tickets\/(T\d+)$/.exec(url.pathname);
      if (req.method === "GET" && ticket) return send(res, 200, await agent.getTicket(ticket[1]));
      const route = routes[`${req.method} ${url.pathname}`];
      if (route) {
        const out = await route(req, url, res);
        if (out !== undefined) send(res, 200, out);
        return;
      }
      if (url.pathname.startsWith("/api/")) return send(res, 404, { error: "Not found" });
      if (req.method === "GET") return staticFiles(req, res, url.pathname);
      send(res, 405, { error: "Method not allowed" });
    } catch (err) {
      if (!err.status) console.error("[server]", err);
      if (!res.headersSent) send(res, err.status || 500, { error: err.status ? err.message : "Something went wrong" });
    }
  })
  .listen(PORT, async () => {
    console.error(`CampusOS: http://localhost:${PORT}  (MCP: POST /mcp)`);
    // Escalate tickets past their SLA without anyone pressing a button (EventBridge Scheduler does this in production).
    setInterval(() => agent.checkOverdue().catch((err) => console.error("[scheduler]", err.message)), 5 * 60e3);
    if (await auth.needsSetup()) console.log(`[setup] No admin yet: open ${process.env.PUBLIC_URL || `http://localhost:${PORT}`}/login to create one`);
  });
