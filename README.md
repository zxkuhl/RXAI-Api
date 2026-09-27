# RMS Chat

A tiny, self-hosted **chat website** that talks to your **RMS AI (rxai)** API.
Clean white UI, Markdown replies, conversation memory — served on **port 7468**.

- Front end: plain HTML/CSS/JS (no framework, no build step)
- Back end: a small Express server that proxies to rxai and **keeps your API key server-side**
- Config: a single `.env` file

```
 browser  ──►  this site (localhost:7468)  ──►  your rxai API
  UI            /api/chat  (adds x-secret-key)     POST /chat
```

## Quick start

```bash
cd rms-chat
npm install
copy .env.example .env      # Windows  (use: cp .env.example .env  on macOS/Linux)
```

Then open `.env` and fill in:

| Variable         | What it is                                             |
|------------------|--------------------------------------------------------|
| `PORT`           | Port to serve on (default `7468`)                      |
| `RXAI_URL`       | Your rxai base URL, no trailing slash                  |
| `RXAI_API_KEY`   | Your rxai key (**free** — see `docs/GET_API_KEY.md`)   |
| `RXAI_MODEL`     | *(optional)* force a model id                          |
| `ASSISTANT_NAME` | *(optional)* the name shown in the UI                  |

Start it:

```bash
npm start
```

Open **http://localhost:7468**. Done.

> Don't have a key yet? → **[docs/GET_API_KEY.md](docs/GET_API_KEY.md)**
> Curious how it works? → **[docs/HOW_IT_WORKS.md](docs/HOW_IT_WORKS.md)**

## Features
- White, minimal, Claude-like chat UI
- Markdown + code-block rendering (sanitized)
- Remembers your conversation (session id + transcript in `localStorage`)
- **New chat** button to start fresh
- Optional model picker (auto-appears if your rxai returns a model list)
- Graceful errors (rate limits, message too long, backend down)

## Project layout
```
rms-chat/
├─ server.js            # Express server + rxai proxy
├─ .env / .env.example  # configuration
├─ public/
│  ├─ index.html        # the page
│  ├─ style.css         # the white Claude-ish theme
│  └─ app.js            # chat logic
└─ docs/
   ├─ GET_API_KEY.md    # how to get a free rxai key
   └─ HOW_IT_WORKS.md   # architecture + request/response shapes
```

## Security note
Your `RXAI_API_KEY` is only ever used **inside `server.js`**. The browser talks to
`/api/chat` on this server; it never sees the key. Keep `.env` out of git (it already
is, via `.gitignore`).
