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

// Conversations tab
async function loadConversations() {
  const list = document.getElementById("conversations-list");
  try {
    const { conversations } = await api("/conversations");
    if (conversations.length === 0) {
      list.innerHTML = '<p class="hint">No conversations yet.</p>';
      return;
    }
    list.innerHTML = conversations
      .map((session) => {
        const when = new Date(session.lastMessageAt || session.startedAt).toLocaleString();
        const exchanges = session.exchanges
          .map(
            (ex) => `
              <div class="exchange">
                <div class="q">${escapeHtml(ex.question)}</div>
                <div class="a">${escapeHtml(ex.answer)}</div>
              </div>`
          )
          .join("");
        return `
          <details class="session">
            <summary>${when} · ${session.exchanges.length} message(s)</summary>
            ${exchanges}
          </details>`;
      })
      .join("");
  } catch {
    // showLogin already handled for 401
  }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

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
