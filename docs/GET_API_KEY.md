# Getting an RMS AI (rxai) API key — free

RMS Chat talks to your **rxai** server. To do that it needs two things in `.env`:

- `RXAI_API_KEY` — a key you mint from the rxai dashboard (**free**)

## Steps

1. **Open your rxai site** in a browser — the same address you'll put in `RXAI_URL`.
2. **Sign in.** rxai supports Google and GitHub login. Go to `/login` if you're not redirected.
3. **Open the Dashboard** (`/dashboard`). This is where your account and keys live.
4. **Create an API key.** Use the "API keys" section to make a new key (optionally give it a label like `rms-chat`). Copy it — it's shown once.
5. **Paste it into `.env`:**
   ```env
   RXAI_API_KEY=paste-your-key-here
   ```
6. `npm start` and open http://localhost:7468.

## Test your key without the UI

```bash
curl -X POST "$RXAI_URL/chat" \
  -H "Content-Type: application/json" \
  -H "x-secret-key: YOUR_KEY" \
  -d '{"userId":"test","message":"hello"}'
```

A JSON reply with a `reply` field means the key works.

## Notes
- The key is **account-scoped**: usage and rate limits are shared across all keys on your account.
- Keep the key private. In RMS Chat it lives only in `.env` on the server, never in the browser.
- You can disable or delete a key any time from the dashboard
