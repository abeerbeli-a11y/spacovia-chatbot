import { fileURLToPath } from "url";
import { readJson, writeJson } from "./storage.js";

const CONVERSATIONS_PATH = fileURLToPath(new URL("../data/conversations.json", import.meta.url));
const MAX_SESSIONS = 500;

export function logExchange({ sessionId, question, answer }) {
  const conversations = readJson(CONVERSATIONS_PATH, []);
  const now = new Date().toISOString();

  let session = conversations.find((s) => s.sessionId === sessionId);
  if (!session) {
    session = { sessionId, startedAt: now, exchanges: [] };
    conversations.push(session);
  }
  session.lastMessageAt = now;
  session.exchanges.push({ at: now, question, answer });

  // Keep storage bounded: drop oldest sessions beyond the cap.
  while (conversations.length > MAX_SESSIONS) conversations.shift();

  writeJson(CONVERSATIONS_PATH, conversations);
}

export function listConversations() {
  const conversations = readJson(CONVERSATIONS_PATH, []);
  return [...conversations].sort(
    (a, b) => new Date(b.lastMessageAt || b.startedAt) - new Date(a.lastMessageAt || a.startedAt)
  );
}
