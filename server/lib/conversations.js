import { fileURLToPath } from "url";
import { readJson, writeJson } from "./storage.js";

const CONVERSATIONS_PATH = fileURLToPath(new URL("../data/conversations.json", import.meta.url));
const MAX_SESSIONS = 500;
const MAX_MESSAGES_PER_SESSION = 500;

// Normalizes older stored shapes (question/answer exchange pairs) into the
// current flat, sequenced message list, so existing data isn't lost.
function normalize(session) {
  if (session.messages) return session;
  const messages = [];
  let seq = 0;
  for (const ex of session.exchanges || []) {
    messages.push({ seq: ++seq, at: ex.at, from: "visitor", text: ex.question });
    messages.push({ seq: ++seq, at: ex.at, from: "bot", text: ex.answer });
  }
  return { ...session, messages, paused: false, exchanges: undefined };
}

function load() {
  const raw = readJson(CONVERSATIONS_PATH, []);
  return raw.map(normalize);
}

function save(conversations) {
  while (conversations.length > MAX_SESSIONS) conversations.shift();
  writeJson(CONVERSATIONS_PATH, conversations);
}

function getOrCreate(conversations, sessionId) {
  let session = conversations.find((s) => s.sessionId === sessionId);
  if (!session) {
    session = { sessionId, startedAt: new Date().toISOString(), paused: false, messages: [] };
    conversations.push(session);
  }
  return session;
}

function nextSeq(session) {
  const last = session.messages[session.messages.length - 1];
  return (last?.seq || 0) + 1;
}

export function appendMessage({ sessionId, from, text }) {
  const conversations = load();
  const session = getOrCreate(conversations, sessionId);
  const message = { seq: nextSeq(session), at: new Date().toISOString(), from, text };
  session.messages.push(message);
  while (session.messages.length > MAX_MESSAGES_PER_SESSION) session.messages.shift();
  session.lastMessageAt = message.at;
  save(conversations);
  return message;
}

export function isPaused(sessionId) {
  const session = load().find((s) => s.sessionId === sessionId);
  return !!session?.paused;
}

export function setPaused(sessionId, paused) {
  const conversations = load();
  const session = getOrCreate(conversations, sessionId);
  session.paused = paused;
  save(conversations);
  return session;
}

export function getSession(sessionId) {
  return load().find((s) => s.sessionId === sessionId) || null;
}

export function getMessagesAfter(sessionId, afterSeq) {
  const session = getSession(sessionId);
  if (!session) return { paused: false, messages: [] };
  return {
    paused: !!session.paused,
    messages: session.messages.filter((m) => m.seq > afterSeq),
  };
}

export function listConversations() {
  return [...load()].sort(
    (a, b) => new Date(b.lastMessageAt || b.startedAt) - new Date(a.lastMessageAt || a.startedAt)
  );
}
