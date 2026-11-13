import { fileURLToPath } from "url";
import { readJson, writeJson } from "./storage.js";

const USAGE_PATH = fileURLToPath(new URL("../data/usage.json", import.meta.url));

function today() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

function thisMonth() {
  return new Date().toISOString().slice(0, 7); // YYYY-MM
}

function defaults() {
  return {
    day: today(),
    dayMessageCount: 0,
    month: thisMonth(),
    monthInputTokens: 0,
    monthOutputTokens: 0,
    dailyMessageCap: null,
    monthlyTokenCap: null,
  };
}

function loadUsage() {
  const usage = readJson(USAGE_PATH, defaults());
  let changed = false;

  if (usage.day !== today()) {
    usage.day = today();
    usage.dayMessageCount = 0;
    changed = true;
  }
  if (usage.month !== thisMonth()) {
    usage.month = thisMonth();
    usage.monthInputTokens = 0;
    usage.monthOutputTokens = 0;
    changed = true;
  }
  if (changed) writeJson(USAGE_PATH, usage);
  return usage;
}

export function checkCaps() {
  const usage = loadUsage();
  if (usage.dailyMessageCap != null && usage.dayMessageCount >= usage.dailyMessageCap) {
    return { allowed: false, reason: "daily message cap reached" };
  }
  const monthTotal = usage.monthInputTokens + usage.monthOutputTokens;
  if (usage.monthlyTokenCap != null && monthTotal >= usage.monthlyTokenCap) {
    return { allowed: false, reason: "monthly token cap reached" };
  }
  return { allowed: true };
}

export function recordUsage({ inputTokens = 0, outputTokens = 0 }) {
  const usage = loadUsage();
  usage.dayMessageCount += 1;
  usage.monthInputTokens += inputTokens;
  usage.monthOutputTokens += outputTokens;
  writeJson(USAGE_PATH, usage);
}

export function getUsage() {
  return loadUsage();
}

export function setCaps({ dailyMessageCap, monthlyTokenCap }) {
  const usage = loadUsage();
  if (dailyMessageCap !== undefined) usage.dailyMessageCap = dailyMessageCap;
  if (monthlyTokenCap !== undefined) usage.monthlyTokenCap = monthlyTokenCap;
  writeJson(USAGE_PATH, usage);
  return usage;
}
