// External channels. Each one is live when its keys are in .env and falls back to a safe local behaviour otherwise.
//   uploads  → Supabase Storage | data/uploads (served at /uploads)
//   email    → any SMTP server (AWS SES SMTP, Gmail, ...) | console log
//   whatsapp → Twilio | console log
//   voice    → ElevenLabs Scribe (speech-to-text) + TTS | browser speech APIs on the client
import fs from "node:fs";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const env = process.env;
const UPLOADS = fileURLToPath(new URL("../data/uploads/", import.meta.url));
const EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };

export const status = () => ({
  storage: env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY ? "supabase" : "local",
  email: env.SMTP_HOST ? "smtp" : "log",
  whatsapp: env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_WHATSAPP_FROM ? "twilio" : "log",
  voice: env.ELEVENLABS_API_KEY ? "elevenlabs" : "browser",
});

// "data:image/png;base64,...." → { mime, base64, buffer }
export function parseDataUrl(dataUrl, allowed) {
  const m = /^data:([\w/+.-]+)(?:;[\w=-]+)*;base64,(.+)$/.exec(String(dataUrl || ""));
  if (!m) return null;
  const mime = m[1].toLowerCase();
  if (allowed && !allowed.some((a) => mime.startsWith(a))) return null;
  return { mime, base64: m[2], buffer: Buffer.from(m[2], "base64") };
}

export async function saveImage({ mime, buffer }) {
  const ext = EXT[mime];
  if (!ext) throw Object.assign(new Error("Only JPEG, PNG, WebP or GIF images"), { status: 400 });
  const name = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}.${ext}`;
  if (status().storage === "supabase") {
    const bucket = env.SUPABASE_BUCKET || "campusos";
    const base = env.SUPABASE_URL.replace(/\/$/, "");
    const res = await fetch(`${base}/storage/v1/object/${bucket}/${name}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`, "Content-Type": mime },
      body: buffer,
    });
    if (res.ok) return `${base}/storage/v1/object/public/${bucket}/${name}`;
    console.error("[upload] Supabase Storage failed, saving locally:", res.status);
  }
  fs.mkdirSync(UPLOADS, { recursive: true });
  fs.writeFileSync(UPLOADS + name, buffer);
  return `/uploads/${name}`;
}

// Reads a stored photo back as base64 for the vision model.
export async function loadImage(url) {
  if (!url) return null;
  try {
    if (url.startsWith("/uploads/")) {
      const name = url.slice("/uploads/".length).replace(/[^\w.-]/g, "");
      const ext = name.split(".").pop();
      const mime = Object.keys(EXT).find((k) => EXT[k] === ext) || "image/jpeg";
      return { mime, base64: fs.readFileSync(UPLOADS + name).toString("base64") };
    }
    const res = await fetch(url);
    if (!res.ok) return null;
    return { mime: res.headers.get("content-type") || "image/jpeg", base64: Buffer.from(await res.arrayBuffer()).toString("base64") };
  } catch {
    return null;
  }
}

export const uploadsDir = UPLOADS;

// ---------- email ----------
let transport;
export async function sendEmail(to, subject, text) {
  if (!env.SMTP_HOST) return console.error(`[email:log] → ${to} | ${subject}`), "log";
  try {
    if (!transport) {
      const nodemailer = (await import("nodemailer")).default;
      transport = nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: Number(env.SMTP_PORT) || 587,
        secure: Number(env.SMTP_PORT) === 465,
        auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
      });
    }
    await transport.sendMail({ from: env.MAIL_FROM || env.SMTP_USER, to, subject, text });
    return "smtp";
  } catch (err) {
    console.error("[email] failed:", err.message);
    return "failed";
  }
}

// ---------- WhatsApp (Twilio) ----------
const twilioAuth = () => "Basic " + Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString("base64");

export async function sendWhatsApp(to, body) {
  if (status().whatsapp !== "twilio") return console.error(`[whatsapp:log] → ${to} | ${body}`), "log";
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`, {
      method: "POST",
      headers: { Authorization: twilioAuth(), "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ From: env.TWILIO_WHATSAPP_FROM, To: to, Body: body }),
    });
    if (!res.ok) throw new Error(`Twilio ${res.status}`);
    return "twilio";
  } catch (err) {
    console.error("[whatsapp] failed:", err.message);
    return "failed";
  }
}

// Twilio signs every webhook: HMAC-SHA1(auth token, full URL + sorted params). Reject anything else.
export function validTwilioSignature(signature, url, params) {
  if (!env.TWILIO_AUTH_TOKEN) return false;
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join("");
  const expected = crypto.createHmac("sha1", env.TWILIO_AUTH_TOKEN).update(data).digest("base64");
  const a = Buffer.from(expected), b = Buffer.from(String(signature || ""));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function fetchTwilioMedia(url) {
  const res = await fetch(url, { headers: { Authorization: twilioAuth() }, redirect: "follow" });
  if (!res.ok) throw new Error(`Twilio media ${res.status}`);
  return { mime: (res.headers.get("content-type") || "").split(";")[0], buffer: Buffer.from(await res.arrayBuffer()) };
}

// ---------- voice (ElevenLabs) ----------
export async function transcribe({ mime, buffer }) {
  if (!env.ELEVENLABS_API_KEY) return null;
  const form = new FormData();
  form.append("model_id", env.ELEVENLABS_STT_MODEL || "scribe_v1");
  form.append("file", new Blob([buffer], { type: mime }), `voice.${mime.split("/")[1]?.split(";")[0] || "webm"}`);
  const res = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
    method: "POST",
    headers: { "xi-api-key": env.ELEVENLABS_API_KEY },
    body: form,
  });
  if (!res.ok) throw new Error(`ElevenLabs STT ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return { text: data.text, language: data.language_code };
}

export async function speak(text) {
  if (!env.ELEVENLABS_API_KEY) return null;
  const voice = env.ELEVENLABS_VOICE_ID || "JBFqnCBsd6RMkjVDRZzb";
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": env.ELEVENLABS_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ text, model_id: env.ELEVENLABS_TTS_MODEL || "eleven_multilingual_v2" }),
  });
  if (!res.ok) throw new Error(`ElevenLabs TTS ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}
