# How RMS Chat works

RMS Chat is deliberately small: a static page + one Express server that forwards
chat requests to your rxai API. There's no database and no build step.

## The flow

```
┌──────────┐   POST /api/chat        ┌────────────┐   POST /chat            ┌──────────┐
│ Browser  │ ───────────────────────►│ server.js  │ ───────────────────────►│  rxai    │
│ (app.js) │   {message, sessionId,  │ (this app) │   x-secret-key: KEY     │  API     │
│          │    userId, model}       │            │   {userId, message, …}  │          │
│          │ ◄───────────────────────│            │◄────────────────────────│          │
└──────────┘   {reply, sessionId}    └────────────┘   {reply, sessionId, …} └──────────┘
```

The browser **never** sees `RXAI_API_KEY`. It only calls same-origin `/api/*`
routes; `server.js` attaches the key when it calls rxai.

## Endpoints (this server)

| Route             | Method | Purpose                                                        |
|-------------------|--------|----------------------------------------------------------------|
| `/`                  | GET    | Serves the chat page (`public/`)                               |
| `/api/config`        | GET    | `{ assistantName, configured }` for the UI                     |
| `/api/models`        | GET    | Proxies rxai `GET /models` (used for the optional model picker)|
| `/api/chat`          | POST   | Proxies rxai `POST /chat`, adding the `x-secret-key` header    |
| `/api/sessions`      | GET    | Proxies rxai `GET /sessions/:userId` — the caller's chat list  |
| `/api/session/:id`   | GET    | Proxies rxai `GET /session/:id` — one chat's full history      |
| `/api/session/:id`   | DELETE | Proxies rxai `DELETE /session/:id?remove=1` — delete a chat    |

Every `/api/*` route just attaches your `x-secret-key` and forwards to the matching rxai
endpoint — so this repo doubles as a worked example of calling each one directly.

### `/api/chat` request (browser → this server)
```json
{ "message": "hello", "sessionId": "abc123", "userId": "u-xyz", "model": "optional" }
```

### rxai `POST /chat` (this server → rxai)
```json
{ "userId": "u-xyz", "message": "hello", "sessionId": "abc123",
  "assistantName": "RMS AI", "model": "optional" }
```
Header: `x-secret-key: <RXAI_API_KEY>`

### rxai response
```json
{
  "sessionId": "abc123",
  "model": "…",
  "reply": "Hi! How can I help?",
  "usage": { "tokensUsed": 0, "tokensLimit": 0, "requestsUsed": 0, "requestsLimit": 0, "resetInStr": "" }
}
```
RMS Chat forwards `reply`, `sessionId`, `model`, and `usage` back to the browser.

## Sessions & memory
- On the first message rxai creates a `sessionId` and returns it. The browser stores
  it in `localStorage` (`rmschat_sid`) and sends it back on every message, so the
  conversation has continuity. rxai keeps the message history for that session.
- The visible transcript is also cached in `localStorage` (`rmschat_msgs`) so a page
  refresh keeps what you see. **New chat** clears both.
- `userId` is a random per-browser id (`rmschat_uid`) so rxai can scope memory to you.

## Error handling
`server.js` passes rxai's status codes straight through, so the UI can show the real
reason:
- `400 message_too_long` — message over rxai's limit
- `429 rate_limited` — with a `resetIn` hint
- `403 chat_restricted` — a moderator restricted that conversation
- `502 upstream_unreachable` — rxai is down or unreachable

## Files
| File               | Role                                               |
|--------------------|----------------------------------------------------|
| `server.js`        | Express server, static hosting, rxai proxy         |
| `public/index.html`| Page structure                                     |
| `public/style.css` | The white, Claude-like theme                       |
| `public/app.js`    | Chat state, rendering (Markdown via marked+DOMPurify), fetch calls |
| `.env`             | `PORT`, `RXAI_API_KEY`, `RXAI_MODEL`, `ASSISTANT_NAME` |

## Swapping the backend later
Everything rxai-specific is in **one function** (`rxai()` in `server.js`) and the
`/api/chat` handler. To point at a different API, change the URL, header, and the
request/response mapping there — the front end doesn't care.
