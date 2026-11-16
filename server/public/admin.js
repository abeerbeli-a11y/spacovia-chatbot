const loginView = document.getElementById("login-view");
const appView = document.getElementById("app-view");
const loginPassword = document.getElementById("login-password");
const loginBtn = document.getElementById("login-btn");
const loginError = document.getElementById("login-error");
const logoutBtn = document.getElementById("logout-btn");

async function api(path, options = {}) {
  const res = await fetch(`/admin/api${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  if (res.status === 401) {
    showLogin();
    throw new Error("Not authenticated");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Request failed");
  }
  return res.json();
}

function showLogin() {
  loginView.style.display = "block";
  appView.style.display = "none";
}

function showApp() {
  loginView.style.display = "none";
  appView.style.display = "block";
  loadKnowledge();
  loadConversations();
  loadUsage();
}

loginBtn.addEventListener("click", async () => {
  loginError.textContent = "";
  loginBtn.disabled = true;
  try {
    await fetch("/admin/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: loginPassword.value }),
    }).then(async (res) => {
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Login failed");
      }
    });
    loginPassword.value = "";
    showApp();
  } catch (err) {
    loginError.textContent = err.message;
  } finally {
    loginBtn.disabled = false;
  }
});

loginPassword.addEventListener("keydown", (e) => {
  if (e.key === "Enter") loginBtn.click();
});

logoutBtn.addEventListener("click", async () => {
  await fetch("/admin/api/logout", { method: "POST" });
  showLogin();
});

// Tabs
document.querySelectorAll("nav.tabs button").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("nav.tabs button").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(`panel-${btn.dataset.tab}`).classList.add("active");

    stopListPoll();
    stopThreadPoll();
    if (btn.dataset.tab === "conversations") {
      if (currentSessionId) {
        refreshThread();
        threadPollTimer = setInterval(refreshThread, THREAD_POLL_MS);
      } else {
        loadConversations();
        startListPolling();
      }
    }
  });
});

// Knowledge tab
async function loadKnowledge() {
  try {
    const { content } = await api("/business-info");
    document.getElementById("knowledge-text").value = content;
  } catch {
    // showLogin already handled for 401
  }
}

document.getElementById("knowledge-save").addEventListener("click", async () => {
  const status = document.getElementById("knowledge-status");
  status.textContent = "Saving...";
  try {
    await api("/business-info", {
      method: "PUT",
      body: JSON.stringify({ content: document.getElementById("knowledge-text").value }),
    });
    status.textContent = "Saved.";
    setTimeout(() => (status.textContent = ""), 2500);
  } catch (err) {
    status.textContent = `Error: ${err.message}`;
  }
});

// Conversations tab (inbox)
const LIST_POLL_MS = 10000;
const THREAD_POLL_MS = 4000;
let listPollTimer = null;
let threadPollTimer = null;
let currentSessionId = null;

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

function labelFor(from) {
  return from === "visitor" ? "Visitor" : from === "admin" ? "You" : "Bot";
}

function stopListPoll() {
  clearInterval(listPollTimer);
  listPollTimer = null;
}

function stopThreadPoll() {
  clearInterval(threadPollTimer);
  threadPollTimer = null;
}

function startListPolling() {
  stopListPoll();
  listPollTimer = setInterval(loadConversations, LIST_POLL_MS);
}

async function loadConversations() {
  const list = document.getElementById("conversations-list");
  try {
    const { conversations } = await api("/conversations");
    if (conversations.length === 0) {
      list.innerHTML = '<p class="hint">No conversations yet.</p>';
      return;
    }
    list.innerHTML = conversations.map(renderInboxItem).join("");
    list.querySelectorAll("[data-session-id]").forEach((el) => {
      el.addEventListener("click", () => openThread(el.dataset.sessionId));
    });
  } catch {
    // showLogin already handled for 401
  }
}

function renderInboxItem(session) {
  const when = new Date(session.lastMessageAt || session.startedAt).toLocaleString();
  const last = session.messages[session.messages.length - 1];
  const preview = last
    ? `<span class="from">${labelFor(last.from)}:</span> ${escapeHtml(last.text)}`
    : "";
  const badge = session.paused ? '<span class="badge-paused">You’re replying</span>' : "";
  return `
    <div class="inbox-item" data-session-id="${escapeHtml(session.sessionId)}">
      <div class="preview">${badge}${preview}</div>
      <div class="meta">${when}</div>
    </div>`;
}

async function openThread(sessionId) {
  currentSessionId = sessionId;
  document.getElementById("inbox-list-view").style.display = "none";
  document.getElementById("inbox-thread-view").style.display = "block";
  document.getElementById("thread-status").textContent = "";
  stopListPoll();
  await refreshThread();
  stopThreadPoll();
  threadPollTimer = setInterval(refreshThread, THREAD_POLL_MS);
}

async function refreshThread() {
  if (!currentSessionId) return;
  try {
    const session = await api(`/conversations/${encodeURIComponent(currentSessionId)}`);
    renderThread(session);
  } catch {
    // 401 already redirected to login; transient errors just skip this tick
  }
}

function renderThread(session) {
  const messagesEl = document.getElementById("thread-messages");
  const wasAtBottom = messagesEl.scrollTop + messagesEl.clientHeight >= messagesEl.scrollHeight - 10;
  messagesEl.innerHTML = session.messages
    .map(
      (m) => `
        <div class="thread-msg ${m.from}">
          <span class="who">${labelFor(m.from)} · ${new Date(m.at).toLocaleTimeString()}</span>${escapeHtml(m.text)}
        </div>`
    )
    .join("");
  if (wasAtBottom) messagesEl.scrollTop = messagesEl.scrollHeight;

  const toggle = document.getElementById("thread-pause-toggle");
  toggle.textContent = session.paused ? "Let the bot answer again" : "Take over from the bot";
  toggle.classList.toggle("is-live", session.paused);
}

document.getElementById("thread-back").addEventListener("click", () => {
  stopThreadPoll();
  currentSessionId = null;
  document.getElementById("inbox-thread-view").style.display = "none";
  document.getElementById("inbox-list-view").style.display = "block";
  loadConversations();
  startListPolling();
});

document.getElementById("thread-pause-toggle").addEventListener("click", async () => {
  if (!currentSessionId) return;
  const isLive = document.getElementById("thread-pause-toggle").classList.contains("is-live");
  try {
    const session = await api(`/conversations/${encodeURIComponent(currentSessionId)}/pause`, {
      method: "PUT",
      body: JSON.stringify({ paused: !isLive }),
    });
    renderThread(session);
  } catch (err) {
    document.getElementById("thread-status").textContent = `Error: ${err.message}`;
  }
});

document.getElementById("thread-reply-send").addEventListener("click", async () => {
  const textarea = document.getElementById("thread-reply-text");
  const text = textarea.value.trim();
  if (!text || !currentSessionId) return;
  const status = document.getElementById("thread-status");
  const sendBtn = document.getElementById("thread-reply-send");
  sendBtn.disabled = true;
  try {
    const session = await api(`/conversations/${encodeURIComponent(currentSessionId)}/reply`, {
      method: "POST",
      body: JSON.stringify({ text }),
    });
    textarea.value = "";
    renderThread(session);
    status.textContent = "";
  } catch (err) {
    status.textContent = `Error: ${err.message}`;
  } finally {
    sendBtn.disabled = false;
  }
});

document.getElementById("thread-reply-text").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    document.getElementById("thread-reply-send").click();
  }
});

// Usage tab
async function loadUsage() {
  try {
    const usage = await api("/usage");
    document.getElementById("usage-day-messages").textContent = usage.dayMessageCount;
    document.getElementById("usage-month-tokens").textContent =
      usage.monthInputTokens + usage.monthOutputTokens;
    document.getElementById("cap-daily").value = usage.dailyMessageCap ?? "";
    document.getElementById("cap-monthly").value = usage.monthlyTokenCap ?? "";
  } catch {
    // showLogin already handled for 401
  }
}

document.getElementById("usage-save").addEventListener("click", async () => {
  const status = document.getElementById("usage-status");
  status.textContent = "Saving...";
  try {
    const dailyVal = document.getElementById("cap-daily").value;
    const monthlyVal = document.getElementById("cap-monthly").value;
    await api("/usage/caps", {
      method: "PUT",
      body: JSON.stringify({
        dailyMessageCap: dailyVal === "" ? null : Number(dailyVal),
        monthlyTokenCap: monthlyVal === "" ? null : Number(monthlyVal),
      }),
    });
    status.textContent = "Saved.";
    setTimeout(() => (status.textContent = ""), 2500);
  } catch (err) {
    status.textContent = `Error: ${err.message}`;
  }
});

// On load, try to fetch something protected to see if we're already logged in.
api("/usage")
  .then(() => showApp())
  .catch(() => showLogin());
