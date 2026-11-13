# Spacovia website chatbot

A small chat widget + backend that answers visitor questions about Spacovia, using Claude.

## Structure

- `server/` — Node.js backend. Calls the Anthropic API with business info as context.
- `widget/` — Embeddable chat widget (vanilla JS + CSS, no build step).

## Setup

1. **Get an API key** at [console.anthropic.com](https://console.anthropic.com) (Settings → API Keys).
2. In `server/`, copy `.env.example` to `.env` and fill in your key:
   ```bash
   cd server
   cp .env.example .env
   ```
   Then edit `.env` and set `ANTHROPIC_API_KEY=sk-ant-...`.

   Also set `ADMIN_PASSWORD` (whatever you want to log into `/admin` with) and generate `ADMIN_SESSION_SECRET`:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
3. Install dependencies and start the server:
   ```bash
   npm install
   npm start
   ```
   This runs on `http://localhost:3001` by default.
4. Open `http://localhost:3001/admin` (or `https://your-backend-host.com/admin` once deployed) and log in with `ADMIN_PASSWORD`.

## Admin dashboard (`/admin`)

Password-protected (no code or file editing needed):

- **Knowledge** — edit what the bot knows (same content as `server/business-info.md`). Saves instantly, no restart.
- **Conversations** — read what visitors have asked and how the bot answered.
- **Usage & limits** — see today's message count and this month's token usage, and set a daily message cap and/or monthly token cap. Once a cap is hit, the bot tells visitors it's temporarily unavailable instead of calling the API (so it can't run up an unexpected bill).

The admin session is a signed cookie, separate from the Anthropic API key — anyone with the admin password can read conversations and edit the bot's answers, but can't see or change the API key itself.

## Embedding the widget

Add this before `</body>` on the website, pointing `data-api-url` at your deployed backend:

```html
<script
  src="https://your-widget-host.com/chat-widget.js"
  data-api-url="https://your-backend-host.com/chat"
  data-title="Ask Spacovia"
></script>
```

For local testing, `widget/test.html` is a minimal host page already wired up this way — serve the `widget/` folder with any static file server (e.g. `npx serve widget`) and open it in a browser, with the backend running on port 3001. Set `ALLOWED_ORIGIN` in `.env` to match whatever origin serves the test page (e.g. `http://localhost:3000`).

## Deploying

- **Backend**: any Node host works (Render, Railway, Fly.io, a VPS). Set the `ANTHROPIC_API_KEY` and `ALLOWED_ORIGIN` (your website's domain) as environment variables there — don't commit `.env`.
- **Widget**: `chat-widget.js` and `chat-widget.css` are static files — host them anywhere (same site, a CDN, or a simple static host) and point the `<script>` tag at them.
