import { Router } from "express";
import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import Anthropic from "@anthropic-ai/sdk";
import { requireAdmin, handleLogin, handleLogout } from "./lib/auth.js";
import { listConversations, getSession, appendMessage, setPaused } from "./lib/conversations.js";
import { getUsage, setCaps, recordUsage, checkCaps } from "./lib/usage.js";

const BUSINESS_INFO_PATH = fileURLToPath(new URL("./business-info.md", import.meta.url));
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const DOCUMENT_MARKER = "===DOCUMENT===";

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

router.post("/business-info/ai-edit", requireAdmin, async (req, res) => {
  const { instruction } = req.body || {};
  if (typeof instruction !== "string" || instruction.trim().length === 0) {
    return res.status(400).json({ error: "instruction is required" });
  }
  if (instruction.length > 2000) {
    return res.status(400).json({ error: "instruction is too long" });
  }

  const capCheck = checkCaps();
  if (!capCheck.allowed) {
    return res.status(429).json({ error: `Usage limit reached (${capCheck.reason}). Raise it in Usage & limits first.` });
  }

  const currentContent = readFileSync(BUSINESS_INFO_PATH, "utf-8");

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-5-5",
      max_tokens: 4000,
      system:
        "You maintain the knowledge-base document for a business's customer-support chatbot. " +
        "You'll be given the CURRENT document and an INSTRUCTION describing a change or addition " +
        "to make. Apply the instruction directly to the document: keep its existing structure, " +
        "headings and tone, and don't invent facts beyond what the instruction and current " +
        "document already say. Respond with exactly this format and nothing else:\n" +
        "SUMMARY: <one short sentence describing what you changed>\n" +
        DOCUMENT_MARKER +
        "\n<the full updated document>",
      messages: [
        {
          role: "user",
          content: `CURRENT DOCUMENT:\n${currentContent}\n\nINSTRUCTION: ${instruction.trim()}`,
        },
      ],
    });

    const text = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n");

    recordUsage({
      inputTokens: response.usage?.input_tokens || 0,
      outputTokens: response.usage?.output_tokens || 0,
    });

    const markerIndex = text.indexOf(DOCUMENT_MARKER);
    if (markerIndex === -1) {
      return res.status(502).json({ error: "The AI didn't return an updated document. Try rephrasing." });
    }

    const summary = text.slice(0, markerIndex).replace(/^SUMMARY:\s*/i, "").trim();
    const content = text.slice(markerIndex + DOCUMENT_MARKER.length).replace(/^\n/, "");

    res.json({ summary, content });
  } catch (err) {
    console.error("AI knowledge edit error:", err);
    res.status(500).json({ error: "Something went wrong asking the AI to make that change." });
  }
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
