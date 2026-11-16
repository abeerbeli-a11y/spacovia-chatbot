import "dotenv/config";
import express from "express";
import cors from "cors";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";
import Anthropic from "@anthropic-ai/sdk";
import { router as adminRouter } from "./admin-routes.js";
import { checkCaps, recordUsage } from "./lib/usage.js";
import { appendMessage, isPaused, getMessagesAfter } from "./lib/conversations.js";

const app = express();
const port = process.env.PORT || 3001;
const allowedOrigin = process.env.ALLOWED_ORIGIN;

app.use(express.json());
app.use(
  cors({
    origin: allowedOrigin || true,
    credentials: true,
  })
);

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const BUSINESS_INFO_PATH = fileURLToPath(new URL("./business-info.md", import.meta.url));

function buildSystemPrompt() {
  const businessInfo = readFileSync(BUSINESS_INFO_PATH, "utf-8");
  return `You are a helpful customer-facing chatbot for a business. Answer questions using ONLY the business information below. If you don't know the answer, say so and suggest the visitor contact the business directly instead of guessing. Keep answers short and friendly.

--- BUSINESS INFO ---
${businessInfo}
--- END BUSINESS INFO ---`;
}

const MAX_HISTORY_MESSAGES = 20;

app.post("/chat", async (req, res) => {
  const { messages, sessionId: incomingSessionId } = req.body;
  const sessionId = incomingSessionId || randomUUID();

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "messages array is required" });
  }

  const lastUserMessage = String(messages[messages.length - 1]?.content ?? "").slice(0, 4000);
  const visitorMessage = appendMessage({ sessionId, from: "visitor", text: lastUserMessage });

  if (isPaused(sessionId)) {
    // A human has taken this conversation over — don't let the bot answer.
    // The widget will pick up the human's reply by polling.
    return res.json({ sessionId, paused: true, lastSeq: visitorMessage.seq });
  }

  const capCheck = checkCaps();
  if (!capCheck.allowed) {
    const message = appendMessage({
      sessionId,
      from: "bot",
      text: "This chatbot has reached its usage limit for now. Please contact us directly and we'll help you out.",
    });
    return res.json({ sessionId, reply: message.text, lastSeq: message.seq });
  }

  const trimmedHistory = messages.slice(-MAX_HISTORY_MESSAGES).map((m) => ({
    role: m.role === "assistant" ? "assistant" : "user",
    content: String(m.content ?? "").slice(0, 4000),
  }));

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-5-5",
      max_tokens: 500,
      system: buildSystemPrompt(),
      messages: trimmedHistory,
    });

    const reply = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n");

    recordUsage({
      inputTokens: response.usage?.input_tokens || 0,
      outputTokens: response.usage?.output_tokens || 0,
    });

    const message = appendMessage({ sessionId, from: "bot", text: reply });

    res.json({ sessionId, reply, lastSeq: message.seq });
  } catch (err) {
    console.error("Anthropic API error:", err);
    res.status(500).json({ error: "Something went wrong talking to the chatbot." });
  }
});

app.get("/chat/:sessionId/messages", (req, res) => {
  const after = Number(req.query.after) || 0;
  res.json(getMessagesAfter(req.params.sessionId, after));
});

app.use("/admin/api", adminRouter);
app.use("/admin", express.static(fileURLToPath(new URL("./public", import.meta.url))));
app.use("/widget", express.static(fileURLToPath(new URL("../widget", import.meta.url))));

app.get("/health", (_req, res) => res.json({ ok: true }));

app.listen(port, () => {
  console.log(`Chatbot server running on http://localhost:${port}`);
});
