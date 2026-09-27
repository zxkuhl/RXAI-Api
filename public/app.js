// RMS Chat — front-end logic. Talks only to THIS site's /api/* endpoints;
// the API key stays on the server. See docs/HOW_IT_WORKS.md.

const $ = (s) => document.querySelector(s);
const messagesEl = $('#messages');
const emptyEl = $('#empty');
const inputEl = $('#input');
const formEl = $('#composer');
const sendBtn = $('#send');
const modelSelect = $('#modelSelect');

const LS = { uid: 'rmschat_uid', sid: 'rmschat_sid', msgs: 'rmschat_msgs' };

function uid() {
  let v = localStorage.getItem(LS.uid);
  if (!v) { v = 'u-' + Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem(LS.uid, v); }
  return v;
}

let sessionId = localStorage.getItem(LS.sid) || null;
let history = [];
try { history = JSON.parse(localStorage.getItem(LS.msgs) || '[]'); } catch { history = []; }
let busy = false;

function saveHistory() { try { localStorage.setItem(LS.msgs, JSON.stringify(history.slice(-100))); } catch {} }

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function mdToHtml(md) {
  try { return DOMPurify.sanitize(marked.parse(md || '', { breaks: true })); }
  catch { return escapeHtml(md || '').replace(/\n/g, '<br>'); }
}

function render() {
  messagesEl.innerHTML = '';
  emptyEl.style.display = history.length ? 'none' : 'flex';
  for (const m of history) {
    const row = document.createElement('div');
    row.className = 'msg ' + (m.role === 'user' ? 'user' : 'assistant');
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.innerHTML = m.role === 'user'
      ? escapeHtml(m.content).replace(/\n/g, '<br>')
      : mdToHtml(m.content);
    row.appendChild(bubble);
    messagesEl.appendChild(row);
  }
  scrollBottom();
}

function scrollBottom() {
  const chat = $('#chat');
  requestAnimationFrame(() => { chat.scrollTop = chat.scrollHeight; });
}

function addTyping() {
  const row = document.createElement('div');
  row.className = 'msg assistant';
  row.id = 'typing';
  row.innerHTML = '<div class="bubble typing"><span></span><span></span><span></span></div>';
  messagesEl.appendChild(row);
  scrollBottom();
}
function removeTyping() { const t = $('#typing'); if (t) t.remove(); }

async function send(text) {
  if (busy) return;
  busy = true; sendBtn.disabled = true;
  history.push({ role: 'user', content: text }); saveHistory(); render();
  addTyping();

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, sessionId, userId: uid(), model: currentModel() }),
    });
    const data = await res.json().catch(() => ({}));
    removeTyping();

    if (!res.ok) {
      const extra = data.resetIn ? ` (try again in ${data.resetIn})` : '';
      history.push({ role: 'assistant', content: `⚠️ ${data.message || data.error || ('Error ' + res.status)}${extra}` });
    } else {
      if (data.sessionId) { sessionId = data.sessionId; localStorage.setItem(LS.sid, sessionId); }
      history.push({ role: 'assistant', content: data.reply || '_(no reply)_' });
    }
    saveHistory(); render();
  } catch (e) {
    removeTyping();
    history.push({ role: 'assistant', content: `⚠️ Network error: ${e.message}` });
    saveHistory(); render();
  } finally {
    busy = false; sendBtn.disabled = false; inputEl.focus();
  }
}

// ── input handling ──────────────────────────────────────
formEl.addEventListener('submit', (e) => {
  e.preventDefault();
  const t = inputEl.value.trim();
  if (!t) return;
  inputEl.value = ''; autosize();
  send(t);
});
inputEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); formEl.requestSubmit(); }
});
inputEl.addEventListener('input', autosize);
function autosize() { inputEl.style.height = 'auto'; inputEl.style.height = Math.min(inputEl.scrollHeight, 200) + 'px'; }

$('#newChat').addEventListener('click', () => {
  sessionId = null; history = [];
  localStorage.removeItem(LS.sid); localStorage.removeItem(LS.msgs);
  render(); inputEl.focus();
});

// ── model picker (defensive; hidden unless the API returns a list) ──
function currentModel() { return (modelSelect && !modelSelect.hidden) ? modelSelect.value : undefined; }
async function initModels() {
  try {
    const r = await fetch('/api/models'); if (!r.ok) return;
    const list = await r.json();
    const arr = Array.isArray(list) ? list : (list.models || list.data || []);
    if (!Array.isArray(arr) || !arr.length) return;
    for (const it of arr) {
      const id = typeof it === 'string' ? it : (it.id || it.name || it.model);
      const label = typeof it === 'string' ? it : (it.name || it.id || it.model);
      if (!id) continue;
      const o = document.createElement('option'); o.value = id; o.textContent = label;
      modelSelect.appendChild(o);
    }
    if (modelSelect.options.length) modelSelect.hidden = false;
  } catch {}
}

async function initConfig() {
  try {
    const c = await (await fetch('/api/config')).json();
    if (c.assistantName) {
      $('#brandName').textContent = c.assistantName;
      document.title = c.assistantName;
      $('#footNote').textContent = `${c.assistantName} can make mistakes. Check important info.`;
      inputEl.placeholder = `Message ${c.assistantName}…`;
    }
    if (!c.configured) {
      history.push({ role: 'assistant', content: '⚙️ This site has no API key yet. Add `RXAI_URL` and `RXAI_API_KEY` to `.env` — see **docs/GET_API_KEY.md**.' });
      saveHistory();
    }
  } catch {}
  render();
}

initConfig();
initModels();
render();
autosize();
