(function () {
  const currentScript = document.currentScript;
  const apiUrl = currentScript?.dataset?.apiUrl || "http://localhost:3001/chat";
  const title = currentScript?.dataset?.title || "Ask Spacovia";
  const greeting =
    currentScript?.dataset?.greeting ||
    "Hi! Ask me anything about Spacovia — pricing, features, how it works.";

  if (currentScript?.src) {
    const cssUrl = currentScript.src.replace(/chat-widget\.js(\?.*)?$/, "chat-widget.css");
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = cssUrl;
    document.head.appendChild(link);
  }

  const history = [];
  let sessionId = null;
  let lastSeq = 0;
  let pollTimer = null;
  let pausedHintShown = false;
  const POLL_MS = 4000;
  try {
    sessionId = localStorage.getItem("spacovia_session_id") || null;
  } catch {
    // localStorage unavailable (private browsing, blocked cookies) — fine, just won't persist.
  }

  function el(tag, props = {}, children = []) {
    const node = document.createElement(tag);
    Object.entries(props).forEach(([key, value]) => {
      if (key === "class") node.className = value;
      else if (key === "text") node.textContent = value;
      else node.setAttribute(key, value);
    });
    children.forEach((child) => node.appendChild(child));
    return node;
  }

  const root = el("div", { id: "spacovia-chat-root" });

  const bubble = el("button", { id: "spacovia-chat-bubble", text: "💬" });

  const header = el("div", { id: "spacovia-chat-header" }, [
    el("span", { text: title }),
    el("button", { id: "spacovia-chat-close", text: "✕" }),
  ]);

  const messagesEl = el("div", { id: "spacovia-chat-messages" });

  const input = el("textarea", {
    id: "spacovia-chat-input",
    rows: "1",
    placeholder: "Type a question...",
  });
  const sendBtn = el("button", { id: "spacovia-chat-send", text: "Send" });
  const form = el("div", { id: "spacovia-chat-form" }, [input, sendBtn]);

  const panel = el("div", { id: "spacovia-chat-panel" }, [header, messagesEl, form]);

  root.appendChild(panel);
  root.appendChild(bubble);
  document.body.appendChild(root);

  function addMessage(role, text) {
    const msg = el("div", { class: `spacovia-msg ${role}`, text });
    messagesEl.appendChild(msg);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return msg;
  }

  function setOpen(open) {
    panel.classList.toggle("open", open);
    if (open && messagesEl.children.length === 0) {
      addMessage("assistant", greeting);
    }
    if (open) startPolling();
    else stopPolling();
  }

  function startPolling() {
    stopPolling();
    if (!sessionId) return;
    poll();
    pollTimer = setInterval(poll, POLL_MS);
  }

  function stopPolling() {
    clearInterval(pollTimer);
    pollTimer = null;
  }

  async function poll() {
    if (!sessionId) return;
    try {
      const res = await fetch(`${apiUrl}/${encodeURIComponent(sessionId)}/messages?after=${lastSeq}`);
      if (!res.ok) return;
      const data = await res.json();
      (data.messages || []).forEach((m) => {
        if (m.seq <= lastSeq) return;
        lastSeq = m.seq;
        if (m.from === "admin" || m.from === "bot") {
          addMessage("assistant", m.text);
          history.push({ role: "assistant", content: m.text });
        }
      });
    } catch {
      // network hiccup — next interval tick will retry
    }
  }

  bubble.addEventListener("click", () => setOpen(!panel.classList.contains("open")));
  header.querySelector("#spacovia-chat-close").addEventListener("click", () => setOpen(false));

  async function sendMessage() {
    const text = input.value.trim();
    if (!text) return;

    input.value = "";
    sendBtn.disabled = true;
    addMessage("user", text);
    history.push({ role: "user", content: text });

    const typingEl = addMessage("assistant typing", "...");

    try {
      const res = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history, sessionId }),
      });

      if (!res.ok) throw new Error("Request failed");

      const data = await res.json();
      const isNewSession = data.sessionId && data.sessionId !== sessionId;
      if (isNewSession) {
        sessionId = data.sessionId;
        try {
          localStorage.setItem("spacovia_session_id", sessionId);
        } catch {
          // ignore
        }
      }
      if (typeof data.lastSeq === "number" && data.lastSeq > lastSeq) lastSeq = data.lastSeq;

      typingEl.remove();
      if (data.reply) {
        addMessage("assistant", data.reply);
        history.push({ role: "assistant", content: data.reply });
      } else if (data.paused && !pausedHintShown) {
        pausedHintShown = true;
        addMessage("assistant", "Thanks — someone from our team will reply here shortly.");
      }
      // A human may already be handling this conversation (paused) or may
      // reply any time after this — keep polling for their messages.
      if (isNewSession || !pollTimer) startPolling();
    } catch (err) {
      typingEl.remove();
      addMessage("assistant", "Sorry, something went wrong. Please try again in a moment.");
    } finally {
      sendBtn.disabled = false;
    }
  }

  sendBtn.addEventListener("click", sendMessage);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
})();
