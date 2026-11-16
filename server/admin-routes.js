import { Router } from "express";
import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { requireAdmin, handleLogin, handleLogout } from "./lib/auth.js";
import { listConversations, getSession, appendMessage, setPaused } from "./lib/conversations.js";
import { getUsage, setCaps } from "./lib/usage.js";

const BUSINESS_INFO_PATH = fileURLToPath(new URL("./business-info.md", import.meta.url));

export const router = Router();

router.post("/login", handleLogin);
router.post("/logout", handleLogout);

router.get("/business-info", requireAdmin, (_req, res) => {
  res.json({ content: readFileSync(BUSINESS_INFO_PATH, "utf-8") });
});

router.put("/business-info", requireAdmin, (req, res) => {
  const { content } = req.body || {};
  if (typeof content !== "string" || content.length === 0) {
    return res.status(400).json({ error: "content is required" });
  }
  if (content.length > 50_000) {
    return res.status(400).json({ error: "content is too long" });
  }
  writeFileSync(BUSINESS_INFO_PATH, content, "utf-8");
  res.json({ ok: true });
});

router.get("/conversations", requireAdmin, (_req, res) => {
  res.json({ conversations: listConversations() });
});

router.get("/conversations/:sessionId", requireAdmin, (req, res) => {
  const session = getSession(req.params.sessionId);
  if (!session) return res.status(404).json({ error: "Not found" });
  res.json(session);
});

router.post("/conversations/:sessionId/reply", requireAdmin, (req, res) => {
  const { text } = req.body || {};
  if (typeof text !== "string" || text.trim().length === 0) {
    return res.status(400).json({ error: "text is required" });
  }
  if (text.length > 4000) {
    return res.status(400).json({ error: "text is too long" });
  }
  setPaused(req.params.sessionId, true); // replying takes the conversation over
  appendMessage({ sessionId: req.params.sessionId, from: "admin", text: text.trim() });
  res.json(getSession(req.params.sessionId));
});

router.put("/conversations/:sessionId/pause", requireAdmin, (req, res) => {
  const { paused } = req.body || {};
  if (typeof paused !== "boolean") {
    return res.status(400).json({ error: "paused must be a boolean" });
  }
  res.json(setPaused(req.params.sessionId, paused));
});

router.get("/usage", requireAdmin, (_req, res) => {
  res.json(getUsage());
});

router.put("/usage/caps", requireAdmin, (req, res) => {
  const { dailyMessageCap, monthlyTokenCap } = req.body || {};

  const normalize = (v) => (v === null || v === "" || v === undefined ? null : Number(v));
  const daily = normalize(dailyMessageCap);
  const monthly = normalize(monthlyTokenCap);

  if ((daily !== null && (!Number.isFinite(daily) || daily < 0)) ||
      (monthly !== null && (!Number.isFinite(monthly) || monthly < 0))) {
    return res.status(400).json({ error: "Caps must be non-negative numbers or empty" });
  }

  const usage = setCaps({ dailyMessageCap: daily, monthlyTokenCap: monthly });
  res.json(usage);
});
