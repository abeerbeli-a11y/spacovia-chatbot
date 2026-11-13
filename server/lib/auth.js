import { createHmac, timingSafeEqual, randomBytes } from "crypto";

const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours
const COOKIE_NAME = "admin_session";

const sessionSecret = process.env.ADMIN_SESSION_SECRET || randomBytes(32).toString("hex");
if (!process.env.ADMIN_SESSION_SECRET) {
  console.warn(
    "ADMIN_SESSION_SECRET not set — using a random secret for this process only. " +
      "Admin sessions will not survive a restart. Set ADMIN_SESSION_SECRET in .env for production."
  );
}

function sign(value) {
  return createHmac("sha256", sessionSecret).update(value).digest("hex");
}

function makeToken() {
  const expires = Date.now() + SESSION_TTL_MS;
  const payload = `${expires}`;
  const signature = sign(payload);
  return `${payload}.${signature}`;
}

function verifyToken(token) {
  if (!token || typeof token !== "string" || !token.includes(".")) return false;
  const [payload, signature] = token.split(".");
  const expected = sign(payload);
  const sigBuf = Buffer.from(signature, "hex");
  const expectedBuf = Buffer.from(expected, "hex");
  if (sigBuf.length !== expectedBuf.length) return false;
  if (!timingSafeEqual(sigBuf, expectedBuf)) return false;
  return Number(payload) > Date.now();
}

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  header.split(";").forEach((part) => {
    const idx = part.indexOf("=");
    if (idx === -1) return;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  });
  return out;
}

// Simple in-memory rate limit for login attempts per IP.
const attempts = new Map();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;

function rateLimited(ip) {
  const now = Date.now();
  const record = attempts.get(ip);
  if (!record || now - record.windowStart > WINDOW_MS) {
    attempts.set(ip, { windowStart: now, count: 1 });
    return false;
  }
  record.count += 1;
  return record.count > MAX_ATTEMPTS;
}

export function requireAdmin(req, res, next) {
  const cookies = parseCookies(req.headers.cookie);
  if (verifyToken(cookies[COOKIE_NAME])) return next();
  res.status(401).json({ error: "Not authenticated" });
}

export function handleLogin(req, res) {
  const ip = req.ip;
  if (rateLimited(ip)) {
    return res.status(429).json({ error: "Too many attempts. Try again later." });
  }

  const { password } = req.body || {};
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminPassword) {
    return res.status(500).json({ error: "Admin password is not configured on the server." });
  }

  const providedBuf = Buffer.from(String(password || ""));
  const expectedBuf = Buffer.from(adminPassword);
  const matches =
    providedBuf.length === expectedBuf.length && timingSafeEqual(providedBuf, expectedBuf);

  if (!matches) {
    return res.status(401).json({ error: "Incorrect password" });
  }

  const token = makeToken();
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "strict",
    maxAge: SESSION_TTL_MS,
  });
  res.json({ ok: true });
}

export function handleLogout(_req, res) {
  res.clearCookie(COOKIE_NAME);
  res.json({ ok: true });
}
