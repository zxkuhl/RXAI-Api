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
    if (data.usage) renderUsage(data.usage);
    saveHistory(); render();
    refreshConvos();
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

function startNew() {
  sessionId = null; history = [];
  localStorage.removeItem(LS.sid); localStorage.removeItem(LS.msgs);
  render(); inputEl.focus(); refreshConvos();
}
$('#newChat').addEventListener('click', startNew);

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
      history.push({ role: 'assistant', content: '⚙️ This site has no API key yet. Add your `RXAI_API_KEY` to `.env` — see **docs/GET_API_KEY.md**.' });
      saveHistory();
    }
  } catch {}
  render();
}

// ── usage / rate-limit display ──────────────────────────
function fmtNum(n) {
  n = Number(n) || 0;
  if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  return String(n);
}
function renderUsage(u) {
  const el = $('#usage'); if (!el || !u) return;
  const parts = [];
  if (u.requestsLimit) parts.push(`Requests ${u.requestsUsed ?? 0}/${u.requestsLimit}`);
  if (u.tokensLimit) parts.push(`Tokens ${fmtNum(u.tokensUsed)}/${fmtNum(u.tokensLimit)}`);
  if (u.resetInStr) parts.push(`resets in ${u.resetInStr}`);
  el.textContent = parts.join('  ·  ');
  el.hidden = parts.length === 0;
}

// ── conversations sidebar (lists this browser's rxai sessions) ──
const sidebar = $('#sidebar'), scrim = $('#scrim'), convList = $('#convList');
function openSidebar() { sidebar.classList.add('open'); scrim.classList.add('open'); refreshConvos(); }
function closeSidebar() { sidebar.classList.remove('open'); scrim.classList.remove('open'); }
$('#chatsBtn').addEventListener('click', () => sidebar.classList.contains('open') ? closeSidebar() : openSidebar());
scrim.addEventListener('click', closeSidebar);
$('#sidebarNew').addEventListener('click', () => { startNew(); closeSidebar(); });

function relTime(ms) {
  const d = Date.now() - (Number(ms) || Date.now());
  if (d < 60000) return 'just now';
  if (d < 3600000) return Math.floor(d / 60000) + 'm ago';
  if (d < 86400000) return Math.floor(d / 3600000) + 'h ago';
  return Math.floor(d / 86400000) + 'd ago';
}

async function refreshConvos() {
  if (!convList) return;
  try {
    const r = await fetch('/api/sessions?userId=' + encodeURIComponent(uid()));
    const data = await r.json().catch(() => ({}));
    const list = data.sessions || [];
    convList.innerHTML = '';
    if (!list.length) {
      convList.innerHTML = '<div class="conv-empty">No conversations yet. Send a message to start one.</div>';
      return;
    }
    for (const s of list) {
      const row = document.createElement('div');
      row.className = 'conv' + (s.id === sessionId ? ' active' : '');
      const meta = document.createElement('div'); meta.className = 'meta';
      const title = document.createElement('div'); title.className = 'title';
      title.textContent = (s.title && s.title.trim()) || ('Chat (' + (s.messages || 0) + ' msgs)');
      const sub = document.createElement('div'); sub.className = 'sub';
      sub.textContent = (s.messages || 0) + ' msgs · ' + relTime(s.updatedAt);
      meta.appendChild(title); meta.appendChild(sub);
      const del = document.createElement('button'); del.className = 'del'; del.title = 'Delete'; del.textContent = '×';
      meta.addEventListener('click', () => loadConvo(s.id));
      del.addEventListener('click', (e) => { e.stopPropagation(); deleteConvo(s.id, del); });
      row.appendChild(meta); row.appendChild(del);
      convList.appendChild(row);
    }
  } catch { /* leave the list as-is on error */ }
}

async function loadConvo(id) {
  try {
    const r = await fetch('/api/session/' + encodeURIComponent(id));
    const data = await r.json().catch(() => ({}));
    const msgs = (data.session && data.session.messages) || [];
    history = msgs
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({ role: m.role, content: String(m.content || '') }));
    sessionId = id; localStorage.setItem(LS.sid, id);
    saveHistory(); render(); closeSidebar(); refreshConvos();
  } catch {}
}

async function deleteConvo(id, btn) {
  if (btn) btn.textContent = '…';
  try {
    const r = await fetch('/api/session/' + encodeURIComponent(id), { method: 'DELETE' });
    const data = await r.json().catch(() => ({}));
    if (data.ok) {
      if (id === sessionId) startNew();
      refreshConvos();
    } else if (btn) { btn.textContent = '×'; }
  } catch { if (btn) btn.textContent = '×'; }
}

initConfig();
initModels();
render();
autosize();
refreshConvos();
