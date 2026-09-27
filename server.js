// RMS Chat — a tiny Express server that serves the chat UI and proxies requests
// to your RMS AI (rxai) API. The API key lives here (server-side) and is NEVER
// sent to the browser. See docs/HOW_IT_WORKS.md.

require('dotenv').config();
const express = require('express');
const path = require('path');

const PORT = process.env.PORT || 7468;
const RXAI_URL = 'https://ai.rmsstudios.site';   // fixed RMS AI host
const RXAI_API_KEY = process.env.RXAI_API_KEY || '';
const RXAI_MODEL = process.env.RXAI_MODEL || '';
const ASSISTANT_NAME = process.env.ASSISTANT_NAME || 'RMS AI';

const configured = !!RXAI_API_KEY;
if (!configured) {
    console.warn('\n[!] RXAI_API_KEY not set. Copy .env.example to .env and add your key.');
    console.warn('    How to get a free key: docs/GET_API_KEY.md\n');
}

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Small helper: call the rxai API with the secret key attached.
async function rxai(pathname, { method = 'GET', body } = {}) {
    const res = await fetch(`${RXAI_URL}${pathname}`, {
        method,
        headers: { 'Content-Type': 'application/json', 'x-secret-key': RXAI_API_KEY },
        body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { error: 'bad_response', message: text.slice(0, 300) }; }
    return { ok: res.ok, status: res.status, data };
}

// Tell the front-end its display name + whether the server is configured.
app.get('/api/config', (_req, res) => {
    res.json({ assistantName: ASSISTANT_NAME, configured });
});

// Optional model list for the picker (defensive — the UI hides it if empty).
app.get('/api/models', async (_req, res) => {
    if (!configured) return res.json([]);
    try {
        const { ok, status, data } = await rxai('/models');
        if (!ok) return res.status(status).json({ error: 'models_error' });
        res.json(data);
    } catch { res.json([]); }
});

// The chat proxy. Browser -> here -> rxai /chat (with the secret key).
app.post('/api/chat', async (req, res) => {
    if (!configured) {
        return res.status(500).json({
            error: 'server_not_configured',
            message: 'This site has no API key yet. Set RXAI_URL and RXAI_API_KEY in .env (see docs/GET_API_KEY.md).',
        });
    }
    const { message, sessionId, userId, model } = req.body || {};
    if (!message || !String(message).trim()) {
        return res.status(400).json({ error: 'empty_message', message: 'Message is empty.' });
    }

    const body = {
        userId: userId || 'web-user',
        message: String(message),
        assistantName: ASSISTANT_NAME,
    };
    if (sessionId) body.sessionId = sessionId;
    const chosen = model || RXAI_MODEL;
    if (chosen) body.model = chosen;

    try {
        const { ok, status, data } = await rxai('/chat', { method: 'POST', body });
        if (!ok) {
            return res.status(status).json({
                error: data.error || 'upstream_error',
                message: data.message || `Upstream error (${status}).`,
                resetIn: data.resetIn,
            });
        }
        res.json({ reply: data.reply, sessionId: data.sessionId, model: data.model, usage: data.usage });
    } catch (e) {
        res.status(502).json({
            error: 'upstream_unreachable',
            message: `Couldn't reach RMS AI at ${RXAI_URL || '(unset)'}. Is it running and is RXAI_URL correct? (${e.message})`,
        });
    }
});

app.listen(PORT, () => {
    console.log(`\n  RMS Chat  →  http://localhost:${PORT}`);
    console.log(`  Backend   →  ${RXAI_URL || '(RXAI_URL not set)'}`);
    console.log(`  Configured:  ${configured ? 'yes' : 'NO — see docs/GET_API_KEY.md'}\n`);
});
