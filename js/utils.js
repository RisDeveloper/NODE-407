/* ============================================
   NODE-407 - UTILITIES & COMMON FUNCTIONS
   ============================================ */

const API_BASE = 'php/';

// ============================================
// API HELPER
// ============================================
async function apiCall(endpoint, data = {}, method = 'POST') {
  try {
    const opts = {
      method,
      headers: { 'X-Requested-With': 'XMLHttpRequest' }
    };
    if (method === 'POST') {
      const fd = new FormData();
      Object.entries(data).forEach(([k, v]) => fd.append(k, v));
      opts.body = fd;
    }
    const url = method === 'GET'
      ? API_BASE + endpoint + '?' + new URLSearchParams(data)
      : API_BASE + endpoint;
    const res = await fetch(url, opts);
    return await res.json();
  } catch (e) {
    console.error('API Error:', e);
    return { success: false, message: 'Koneksi gagal. Pastikan server berjalan.' };
  }
}

// ============================================
// TOAST NOTIFICATIONS
// ============================================
function showToast(message, type = 'info', duration = 3500) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const icons = {
    success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="16" height="16"><polyline points="20 6 9 17 4 12"/></svg>',
    error:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="16" height="16"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
    info:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="16" height="16"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>'
  };
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = (icons[type] || '') + `<span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = 'fadeOut .3s ease forwards';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ============================================
// MODAL HELPER
// ============================================
function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('active');
}
function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('active');
}
// Close modal on overlay click
document.addEventListener('click', e => {
  if (e.target.classList.contains('modal-overlay')) {
    e.target.classList.remove('active');
  }
});

// ============================================
// AVATAR INITIALS
// ============================================
function getInitials(name) {
  if (!name) return '?';
  return name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
}

// ============================================
// FORMAT DATE/TIME
// ============================================
function formatTime(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}
function formatDate(dateStr) {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = Math.floor((now - d) / 86400000);
  if (diff === 0) return 'Hari ini';
  if (diff === 1) return 'Kemarin';
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
}
function formatDateTime(dateStr) {
  return new Date(dateStr).toLocaleString('id-ID', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

// ============================================
// MARKDOWN → HTML (simple)
// ============================================
function renderMarkdown(text) {
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    // Code blocks
    .replace(/```(\w+)?\n?([\s\S]*?)```/g, (_, lang, code) =>
      `<pre><code class="language-${lang || 'text'}">${code.trim()}</code></pre>`)
    // Inline code
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Headers
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    // Lists
    .replace(/^[-*] (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>')
    // Line breaks
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>');
}

// ============================================
// CHECK SESSION
// ============================================
async function checkSession(redirectIfLoggedIn = false, requireAdmin = false) {
  const res = await apiCall('auth.php', { action: 'check' }, 'GET');
  if (!res.success) return null;
  if (redirectIfLoggedIn && res.logged_in) {
    window.location.href = res.user.role === 'admin' ? 'admin.html' : 'chat.php';
    return res.user;
  }
  if (!res.logged_in) {
    window.location.href = 'index.html';
    return null;
  }
  if (requireAdmin && res.user.role !== 'admin') {
    window.location.href = 'chat.php';
    return null;
  }
  return res.user;
}

// ============================================
// LOGOUT
// ============================================
async function logout() {
  await apiCall('auth.php', { action: 'logout' });
  window.location.href = 'index.html';
}

// Confirm dialog
function confirmAction(message, callback) {
  if (confirm(message)) callback();
}

// Add fadeOut keyframe if missing
const style = document.createElement('style');
style.textContent = `@keyframes fadeOut { to { opacity: 0; transform: translateX(100%); } }`;
document.head.appendChild(style);
