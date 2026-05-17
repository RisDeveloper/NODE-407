/* ============================================
   CHAT PAGE - MAIN LOGIC
   ============================================ */

let currentUser    = null;
let currentSession = null;
let currentModel   = 'llama-3.1-8b-instant';
let allSessions    = [];
let isLoading      = false;

document.addEventListener('DOMContentLoaded', async () => {
  currentUser = await checkSession();
  if (!currentUser) return;

  initUserProfile();
  await loadModels();
  await loadSessions();
  setupEventListeners();
  setupTextareaResize();
  updateUsageBar();
});

// ============================================
// INIT USER PROFILE IN SIDEBAR
// ============================================
function initUserProfile() {
  const initials = getInitials(currentUser.full_name);
  document.querySelectorAll('[data-user-avatar]').forEach(el => {
    if (currentUser.avatar) {
      el.outerHTML = `<img src="${currentUser.avatar}" alt="${currentUser.full_name}" class="avatar avatar-sm" data-user-avatar>`;
    } else {
      el.textContent = initials;
    }
  });
  document.querySelectorAll('[data-user-name]').forEach(el => {
    el.textContent = currentUser.full_name;
  });
  document.querySelectorAll('[data-user-email]').forEach(el => {
    el.textContent = currentUser.email;
  });
  updateUsageBar();
}

function updateUsageBar() {
  const used  = currentUser.messages_used || 0;
  const limit = currentUser.message_limit || 100;
  const pct   = Math.min((used / limit) * 100, 100);
  const fill  = document.getElementById('usage-fill');
  const label = document.getElementById('usage-label');
  if (fill) {
    fill.style.width = pct + '%';
    fill.className = 'usage-fill' + (pct >= 90 ? ' danger' : pct >= 70 ? ' warn' : '');
  }
  if (label) label.textContent = `${used}/${limit}`;
}

// ============================================
// LOAD MODELS
// ============================================
async function loadModels() {
  const res = await apiCall('chat.php', { action: 'get_models' }, 'GET');
  if (!res.success) return;
  const sel = document.getElementById('model-select');
  if (!sel) return;
  sel.innerHTML = '';
  res.models.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m.model_key;
    opt.textContent = m.model_name;
    if (m.model_key === currentModel) opt.selected = true;
    sel.appendChild(opt);
  });
  sel.addEventListener('change', () => { currentModel = sel.value; });
}

// ============================================
// LOAD SESSIONS
// ============================================
async function loadSessions(filter = '') {
  const res = await apiCall('chat.php', { action: 'get_sessions' }, 'GET');
  if (!res.success) return;
  allSessions = res.sessions || [];
  renderSessions(filter);
}

function renderSessions(filter = '') {
  const list = document.getElementById('sessions-list');
  if (!list) return;
  const filtered = filter
    ? allSessions.filter(s => s.title.toLowerCase().includes(filter.toLowerCase()))
    : allSessions;

  if (!filtered.length) {
    list.innerHTML = `<div style="text-align:center;color:var(--text-muted);font-size:.82rem;padding:20px">Belum ada riwayat chat</div>`;
    return;
  }

  // Group by date
  const groups = {};
  filtered.forEach(s => {
    const label = formatDate(s.updated_at);
    if (!groups[label]) groups[label] = [];
    groups[label].push(s);
  });

  list.innerHTML = Object.entries(groups).map(([label, sessions]) => `
    <div class="sessions-group-label">${label}</div>
    ${sessions.map(s => `
      <div class="session-item ${s.id == currentSession?.id ? 'active' : ''}" data-id="${s.id}" onclick="openSession(${s.id})">
        <div class="session-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        </div>
        <div class="session-info">
          <div class="session-title">${escapeHtml(s.title)}</div>
          <div class="session-date">${s.msg_count || 0} pesan</div>
        </div>
        <div class="session-actions">
          <button class="session-action-btn" onclick="event.stopPropagation(); renameSession(${s.id}, '${escapeHtml(s.title)}')" title="Rename">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="session-action-btn" onclick="event.stopPropagation(); confirmDelete(${s.id})" title="Hapus">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
          </button>
        </div>
      </div>
    `).join('')}
  `).join('');
}

function escapeHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// ============================================
// OPEN SESSION
// ============================================
async function openSession(sessionId) {
  const res = await apiCall('chat.php', { action: 'get_messages', session_id: sessionId }, 'GET');
  if (!res.success) { showToast(res.message, 'error'); return; }
  currentSession = res.session;
  currentModel   = res.session.model_key || currentModel;

  // Update model selector
  const sel = document.getElementById('model-select');
  if (sel) sel.value = currentModel;

  // Update title
  document.getElementById('chat-title').textContent = res.session.title;
  document.title = res.session.title + ' | NODE-407';

  // Render messages
  const msgs = document.getElementById('messages-container');
  const empty = document.getElementById('chat-empty');
  msgs.innerHTML = '';

  if (!res.messages.length) {
    if (empty) empty.style.display = 'flex';
    return;
  }
  if (empty) empty.style.display = 'none';

  res.messages.forEach(m => appendMessage(m.role, m.content, m.created_at, false));
  scrollToBottom();

  // Highlight active session
  renderSessions();
}

// ============================================
// NEW CHAT
// ============================================
async function newChat() {
  const res = await apiCall('chat.php', { action: 'new_session', model: currentModel });
  if (!res.success) { showToast(res.message, 'error'); return; }
  currentSession = { id: res.session_id, title: res.title, model_key: currentModel };

  document.getElementById('chat-title').textContent = 'Chat Baru';
  document.getElementById('messages-container').innerHTML = '';
  document.getElementById('chat-empty').style.display = 'flex';
  document.title = 'NODE-407';

  await loadSessions();
  // On mobile: close sidebar
  document.getElementById('chat-sidebar').classList.remove('open');
}

// ============================================
// SEND MESSAGE
// ============================================
async function sendMessage() {
  if (isLoading) return;
  const input = document.getElementById('chat-input');
  const content = input.value.trim();
  if (!content) return;

  isLoading = true;
  document.getElementById('send-btn').disabled = true;

  // Create session if not exists
  if (!currentSession) {
    const res = await apiCall('chat.php', { action: 'new_session', model: currentModel });
    if (!res.success) {
      isLoading = false;
      document.getElementById('send-btn').disabled = false;
      showToast(res.message, 'error');
      return;
    }
    currentSession = { id: res.session_id, title: 'Chat Baru', model_key: currentModel };
    await loadSessions();
  }

  input.value = '';
  input.style.height = 'auto';
  document.getElementById('chat-empty').style.display = 'none';

  appendMessage('user', content);

  // Langsung tampilkan kotak respons (gak nunggu first chunk)
  const msgEl = appendMessage('assistant', '', null, false);
  const contentDiv = msgEl.querySelector('.message-content');
  contentDiv.innerHTML = '<div class="stream-waiting"><span class="stream-dot"></span><span class="stream-dot"></span><span class="stream-dot"></span></div>';
  scrollToBottom();

  // Streaming fetch
  const fd = new FormData();
  fd.append('action', 'send_message_stream');
  fd.append('session_id', currentSession.id);
  fd.append('content', content);
  fd.append('model', currentModel);

  try {
    const response = await fetch('php/chat.php', { method: 'POST', body: fd });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    if (!response.body) throw new Error('Streaming tidak didukung browser.');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullText = '';
    let started = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        if (!line) continue;
        try {
          const data = JSON.parse(line);
          if (data.type === 'chunk') {
            if (!started) {
              started = true;
              contentDiv.innerHTML = '';
            }
            fullText += data.text;
            contentDiv.innerHTML = renderMarkdown(fullText) + '<span class="stream-cursor">|</span>';
            scrollToBottom();
          } else if (data.type === 'done') {
            contentDiv.innerHTML = renderMarkdown(fullText);
            currentUser.messages_used = data.used;
            currentUser.message_limit = data.limit;
            updateUsageBar();
            await loadSessions();
          } else if (data.type === 'error') {
            contentDiv.innerHTML = `<p class="text-error">Error: ${data.message}</p>`;
            showToast(data.message, 'error');
          }
        } catch (e) { /* skip parse errors */ }
      }
    }
  } catch (err) {
    contentDiv.innerHTML = `<p class="text-error">Gagal terhubung: ${err.message}</p>`;
    showToast('Gagal terhubung ke server: ' + err.message, 'error');
  }

  isLoading = false;
  document.getElementById('send-btn').disabled = false;
  scrollToBottom();
}

// ============================================
// APPEND MESSAGE
// ============================================
function appendMessage(role, content, timestamp = null, doScroll = true) {
  const container = document.getElementById('messages-container');
  const time = timestamp ? formatTime(timestamp) : formatTime(new Date().toISOString());
  const modelName = role === 'assistant'
    ? (document.getElementById('model-select')?.options[document.getElementById('model-select')?.selectedIndex]?.text || 'AI')
    : '';

  const rendered = renderMarkdown(content);

  const el = document.createElement('div');
  el.className = `message ${role}`;
  el.innerHTML = `
    <div class="message-avatar">
      ${role === 'assistant'
        ? `<img src="img/logonode.png" alt="AI" class="avatar avatar-sm" style="object-fit:contain;background:#CC0000;padding:4px">`
        : currentUser.avatar
          ? `<img src="${currentUser.avatar}" alt="${currentUser.full_name}" class="avatar avatar-sm" style="object-fit:cover">`
          : `<div class="avatar avatar-sm">${getInitials(currentUser.full_name)}</div>`
      }
    </div>
    <div class="message-body">
      <div class="message-content"><p>${rendered}</p></div>
      <div class="message-meta">
        ${role === 'assistant' ? `<span>${modelName}</span> •` : ''}
        <span>${time}</span>
      </div>
    </div>
  `;
  container.appendChild(el);
  if (doScroll) scrollToBottom();
  return el;
}

// ============================================
// TYPING INDICATOR
// ============================================
function showTypingIndicator() {
  const container = document.getElementById('messages-container');
  const el = document.createElement('div');
  el.className = 'message assistant typing-indicator';
  el.id = 'typing-indicator';
  el.innerHTML = `
    <div class="message-avatar">
      <img src="img/logonode.png" alt="AI" class="avatar avatar-sm" style="object-fit:contain;background:#CC0000;padding:4px">
    </div>
    <div class="message-body">
      <div class="message-content">
        <div class="typing-loader"><span></span><span></span><span></span></div>
      </div>
    </div>
  `;
  container.appendChild(el);
  scrollToBottom();
}

function hideTypingIndicator() {
  document.getElementById('typing-indicator')?.remove();
}

// ============================================
// DELETE SESSION
// ============================================
function confirmDelete(sessionId) {
  confirmAction('Hapus sesi chat ini?', async () => {
    const res = await apiCall('chat.php', { action: 'delete_session', session_id: sessionId });
    if (res.success) {
      if (currentSession?.id == sessionId) {
        currentSession = null;
        document.getElementById('messages-container').innerHTML = '';
        document.getElementById('chat-empty').style.display = 'flex';
        document.getElementById('chat-title').textContent = 'NODE-407';
      }
      await loadSessions();
      showToast('Sesi dihapus.', 'success');
    } else {
      showToast(res.message, 'error');
    }
  });
}

// ============================================
// RENAME SESSION
// ============================================
function renameSession(sessionId, currentTitle) {
  const newTitle = prompt('Nama baru sesi:', currentTitle);
  if (!newTitle || newTitle.trim() === currentTitle) return;
  apiCall('chat.php', { action: 'rename_session', session_id: sessionId, title: newTitle.trim() })
    .then(res => {
      if (res.success) {
        loadSessions();
        if (currentSession?.id == sessionId) {
          document.getElementById('chat-title').textContent = newTitle.trim();
        }
      }
    });
}

// ============================================
// SUGGESTION CHIPS
// ============================================
function useSuggestion(text) {
  document.getElementById('chat-input').value = text;
  document.getElementById('chat-input').focus();
}

// ============================================
// SCROLL
// ============================================
function scrollToBottom() {
  const el = document.getElementById('messages-container');
  el.scrollTop = el.scrollHeight;
}

// ============================================
// TEXTAREA AUTO-RESIZE
// ============================================
function setupTextareaResize() {
  const ta = document.getElementById('chat-input');
  if (!ta) return;
  ta.addEventListener('input', () => {
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 180) + 'px';
  });
  ta.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
}

// ============================================
// EVENT LISTENERS
// ============================================
function setupEventListeners() {
  // Send button
  document.getElementById('send-btn')?.addEventListener('click', sendMessage);

  // New chat
  document.getElementById('new-chat-btn')?.addEventListener('click', newChat);

  // Search sessions
  document.getElementById('session-search')?.addEventListener('input', e => {
    renderSessions(e.target.value);
  });

  // Sidebar toggle (mobile)
  document.getElementById('sidebar-toggle')?.addEventListener('click', () => {
    document.getElementById('chat-sidebar').classList.toggle('open');
  });

  // Logout
  document.getElementById('logout-btn')?.addEventListener('click', logout);

  // Admin link
  const adminLink = document.getElementById('admin-link');
  if (adminLink) {
    if (currentUser.role === 'admin') {
      adminLink.style.display = 'flex';
      adminLink.addEventListener('click', () => { window.location.href = 'admin.html'; });
    } else {
      adminLink.style.display = 'none';
    }
  }
}