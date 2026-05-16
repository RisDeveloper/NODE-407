/* ============================================
   ADMIN PANEL - JAVASCRIPT
   ============================================ */

let adminUser = null;
let allUsers  = [];
let msgChart  = null;

document.addEventListener('DOMContentLoaded', async () => {
  adminUser = await checkSession(false, true);
  if (!adminUser) return;

  document.getElementById('admin-username').textContent = adminUser.full_name;
  document.querySelectorAll('[data-admin-avatar]').forEach(el => {
    if (adminUser.avatar) {
      el.outerHTML = `<img src="${adminUser.avatar}" alt="${adminUser.full_name}" class="avatar avatar-sm" data-admin-avatar>`;
    } else {
      el.textContent = getInitials(adminUser.full_name);
    }
  });

  setupNavigation();
  loadDashboard();
});

// ============================================
// NAVIGATION
// ============================================
function setupNavigation() {
  document.querySelectorAll('.admin-nav-item, .mobile-nav-item').forEach(item => {
    item.addEventListener('click', () => {
      const page = item.dataset.page;
      if (!page) return;
      navigateTo(page);
    });
  });
}

function navigateTo(page) {
  document.querySelectorAll('.admin-nav-item, .mobile-nav-item').forEach(i => {
    i.classList.toggle('active', i.dataset.page === page);
  });
  document.querySelectorAll('.admin-page').forEach(p => {
    p.classList.toggle('active', p.id === 'page-' + page);
  });
  document.getElementById('page-title').textContent = {
    dashboard: 'Dashboard',
    users: 'Manajemen User',
    ai_settings: 'Pengaturan AI',
    global_settings: 'Pengaturan Global',
    audit_log: 'Audit Log'
  }[page] || 'Admin Panel';

  switch(page) {
    case 'dashboard':    loadDashboard(); break;
    case 'users':        loadUsers(); break;
    case 'ai_settings':  loadAISettings(); break;
    case 'global_settings': loadGlobalSettings(); break;
    case 'audit_log':    loadAuditLog(); break;
  }
}

// ============================================
// DASHBOARD
// ============================================
async function loadDashboard() {
  const res = await apiCall('admin.php', { action: 'get_dashboard' }, 'GET');
  if (!res.success) return;
  const s = res.stats;

  setEl('stat-total-users',  s.total_users);
  setEl('stat-active-users', s.active_users);
  setEl('stat-total-chats',  s.total_chats);
  setEl('stat-total-msgs',   s.total_msgs);
  setEl('stat-today-msgs',   s.today_msgs);
  setEl('stat-today-users',  s.today_users);

  // Chart
  renderMsgChart(res.chart_data);

  // Top users
  const topTbody = document.getElementById('top-users-tbody');
  if (topTbody) {
    topTbody.innerHTML = res.top_users.map(u => `
      <tr>
        <td>
          <div class="flex items-center gap-2">
            <div class="avatar avatar-sm">${getInitials(u.full_name)}</div>
            <div><div class="fw-600">${escAdm(u.full_name)}</div><div class="text-muted text-sm">@${escAdm(u.username)}</div></div>
          </div>
        </td>
        <td>${u.messages_used} / ${u.message_limit}</td>
        <td><span class="badge badge-${u.status === 'active' ? 'success' : 'danger'}">${u.status}</span></td>
      </tr>
    `).join('');
  }

  // Model usage
  const modelDiv = document.getElementById('model-usage-list');
  if (modelDiv) {
    modelDiv.innerHTML = res.model_usage.map(m => {
      const total = res.model_usage.reduce((a,b) => a + parseInt(b.count), 0);
      const pct = total ? Math.round((m.count / total) * 100) : 0;
      return `
        <div style="margin-bottom:12px">
          <div class="flex items-center gap-2" style="justify-content:space-between;margin-bottom:5px">
            <span class="fw-600 text-sm">${m.model_key}</span>
            <span class="text-muted text-sm">${m.count} (${pct}%)</span>
          </div>
          <div style="height:8px;background:var(--border);border-radius:99px;overflow:hidden">
            <div style="height:100%;width:${pct}%;background:var(--primary);border-radius:99px;transition:width .5s ease"></div>
          </div>
        </div>
      `;
    }).join('') || '<p class="text-muted text-sm">Belum ada data.</p>';
  }
}

function renderMsgChart(data) {
  const canvas = document.getElementById('msgChart');
  if (!canvas || !window.Chart || !data || !data.length) return;
  const labels = data.map(d => d.date);
  const values = data.map(d => parseInt(d.count));
  if (msgChart) msgChart.destroy();
  msgChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Pesan',
        data: values,
        borderColor: '#CC0000',
        backgroundColor: 'rgba(204,0,0,0.08)',
        pointBackgroundColor: '#CC0000',
        pointRadius: 4
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,.05)' } },
        x: { grid: { display: false } }
      }
    }
  });
}

// ============================================
// USERS
// ============================================
async function loadUsers(search = '', status = '') {
  const res = await apiCall('admin.php', { action: 'get_users', search, status }, 'GET');
  if (!res.success) return;
  allUsers = res.users;
  renderUsersTable(allUsers);
}

function renderUsersTable(users) {
  const tbody = document.getElementById('users-tbody');
  if (!tbody) return;
  if (!users.length) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:24px">Tidak ada user ditemukan.</td></tr>';
    return;
  }
  tbody.innerHTML = users.map(u => `
    <tr>
      <td>
        <div class="flex items-center gap-2">
          <div class="avatar avatar-sm">${getInitials(u.full_name)}</div>
          <div>
            <div class="fw-600">${escAdm(u.full_name)}</div>
            <div class="text-muted text-sm">@${escAdm(u.username)}</div>
          </div>
        </div>
      </td>
      <td>${escAdm(u.email)}</td>
      <td><span class="badge badge-${u.status === 'active' ? 'success' : 'danger'}">${u.status}</span></td>
      <td>
        <div style="display:flex;align-items:center;gap:6px">
          <span class="fw-600">${u.messages_used}</span>
          <span class="text-muted">/ ${u.message_limit}</span>
        </div>
      </td>
      <td>${u.total_sessions || 0}</td>
      <td class="hide-mobile">${formatDateTime(u.created_at)}</td>
      <td>
        <div class="flex items-center gap-2">
          <button class="btn btn-outline btn-sm" onclick="openUserDetail(${u.id})">Detail</button>
          <button class="btn btn-primary btn-sm" onclick="openEditUser(${u.id})">Edit</button>
          <button class="btn btn-danger btn-sm" onclick="deleteUser(${u.id})">Hapus</button>
        </div>
      </td>
    </tr>
  `).join('');
}

async function openUserDetail(userId) {
  const res = await apiCall('admin.php', { action: 'get_user_detail', user_id: userId }, 'GET');
  if (!res.success) { showToast(res.message, 'error'); return; }
  const u = res.user;
  const detailEl = document.getElementById('user-detail-content');
  if (!detailEl) return;
  detailEl.innerHTML = `
    <div style="display:flex;align-items:center;gap:16px;margin-bottom:20px">
      ${u.avatar ? `<img src="${u.avatar}" alt="${escAdm(u.full_name)}" class="avatar avatar-lg" style="object-fit:cover;width:64px;height:64px;border-radius:50%">` : `<div class="avatar avatar-lg">${getInitials(u.full_name)}</div>`}
      <div>
        <div style="font-size:1.1rem;font-weight:800">${escAdm(u.full_name)}</div>
        <div class="text-muted">@${escAdm(u.username)}</div>
        <span class="badge badge-${u.status === 'active' ? 'success' : 'danger'}">${u.status}</span>
      </div>
    </div>
    <div class="user-detail-grid">
      <div class="card">
        <div class="card-title" style="margin-bottom:12px">Informasi Akun</div>
        <div class="detail-row"><span class="detail-label">Email</span><span class="detail-value">${escAdm(u.email)}</span></div>
        <div class="detail-row"><span class="detail-label">Role</span><span class="detail-value">${u.role}</span></div>
        <div class="detail-row"><span class="detail-label">Bergabung</span><span class="detail-value">${formatDateTime(u.created_at)}</span></div>
        <div class="detail-row"><span class="detail-label">Login Terakhir</span><span class="detail-value">${u.last_login ? formatDateTime(u.last_login) : '-'}</span></div>
      </div>
      <div class="card">
        <div class="card-title" style="margin-bottom:12px">Statistik Chat</div>
        <div class="detail-row"><span class="detail-label">Pesan Terkirim</span><span class="detail-value">${u.messages_used}</span></div>
        <div class="detail-row"><span class="detail-label">Limit Pesan</span><span class="detail-value">${u.message_limit}</span></div>
        <div class="detail-row"><span class="detail-label">Total Sesi</span><span class="detail-value">${res.sessions.length}</span></div>
        <div class="detail-row"><span class="detail-label">Total Pesan</span><span class="detail-value">${res.total_messages}</span></div>
      </div>
    </div>
    <div style="margin-top:20px">
      <div class="fw-600" style="margin-bottom:10px">Sesi Chat Terbaru</div>
      ${res.sessions.length ? `
        <div class="table-wrap">
          <table>
            <thead><tr><th>Judul</th><th>Model</th><th>Pesan</th><th>Terakhir Update</th></tr></thead>
            <tbody>
              ${res.sessions.map(s => `
                <tr>
                  <td>${escAdm(s.title)}</td>
                  <td><span class="badge badge-info">${s.model_key}</span></td>
                  <td>${s.msg_count}</td>
                  <td>${formatDateTime(s.updated_at)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      ` : '<p class="text-muted text-sm">Belum ada sesi chat.</p>'}
    </div>
    <div style="display:flex;gap:10px;margin-top:20px">
      <button class="btn btn-primary" onclick="openEditUser(${u.id}); closeModal('modal-user-detail')">Edit User</button>
      <button class="btn btn-outline" onclick="openSetLimit(${u.id}, ${u.message_limit})">Set Limit</button>
      <button class="btn btn-danger" onclick="deleteUser(${u.id}); closeModal('modal-user-detail')">Hapus User</button>
    </div>
  `;
  openModal('modal-user-detail');
}

function openEditUser(userId) {
  const user = allUsers.find(u => u.id == userId);
  if (!user) return;
  document.getElementById('edit-user-id').value = user.id;
  document.getElementById('edit-fullname').value = user.full_name;
  document.getElementById('edit-email').value = user.email;
  document.getElementById('edit-phone').value = user.phone || '';
  document.getElementById('edit-status').value = user.status;
  document.getElementById('edit-limit').value = user.message_limit;
  openModal('modal-edit-user');
}

async function saveEditUser() {
  const btn = document.getElementById('save-edit-btn');
  btn.disabled = true; btn.textContent = 'Menyimpan...';
  const res = await apiCall('admin.php', {
    action: 'update_user',
    user_id: document.getElementById('edit-user-id').value,
    full_name: document.getElementById('edit-fullname').value,
    phone: document.getElementById('edit-phone').value,
    status: document.getElementById('edit-status').value,
    message_limit: document.getElementById('edit-limit').value
  });
  btn.disabled = false; btn.textContent = 'Simpan';
  if (res.success) {
    showToast(res.message, 'success');
    closeModal('modal-edit-user');
    loadUsers();
  } else {
    showToast(res.message, 'error');
  }
}

function openSetLimit(userId, currentLimit) {
  document.getElementById('limit-user-id').value = userId;
  document.getElementById('limit-value').value = currentLimit;
  openModal('modal-set-limit');
}

async function saveLimit() {
  const res = await apiCall('admin.php', {
    action: 'set_user_limit',
    user_id: document.getElementById('limit-user-id').value,
    limit: document.getElementById('limit-value').value,
    reset_usage: document.getElementById('reset-usage').checked ? 1 : 0
  });
  if (res.success) {
    showToast(res.message, 'success');
    closeModal('modal-set-limit');
    loadUsers();
  } else {
    showToast(res.message, 'error');
  }
}

async function deleteUser(userId) {
  confirmAction('Hapus user ini? Semua data chat akan ikut terhapus.', async () => {
    const res = await apiCall('admin.php', { action: 'delete_user', user_id: userId });
    if (res.success) {
      showToast(res.message, 'success');
      loadUsers();
    } else {
      showToast(res.message, 'error');
    }
  });
}

// ============================================
// AI SETTINGS
// ============================================
async function loadAISettings() {
  const res = await apiCall('admin.php', { action: 'get_ai_settings' }, 'GET');
  if (!res.success) return;
  const container = document.getElementById('ai-models-container');
  if (!container) return;
  container.innerHTML = res.settings.map(s => `
      <div class="ai-model-card">
      <div class="ai-model-header">
        <div class="ai-model-info">
          <div class="ai-model-badge">${s.model_key.substring(0,4).toUpperCase()}</div>
          <div>
            <div class="fw-600">${escAdm(s.model_name)}</div>
            <div class="text-muted text-sm">${escAdm(s.model_description || '')}</div>
          </div>
        </div>
        <div class="toggle-wrap">
          <label class="toggle">
            <input type="checkbox" ${s.is_active === true || s.is_active === 't' ? 'checked' : ''} onchange="toggleModel('${s.model_key}', this.checked)">
            <span class="toggle-slider"></span>
          </label>
          <span class="text-sm">${s.is_active === true || s.is_active === 't' ? 'Aktif' : 'Nonaktif'}</span>
        </div>
      </div>
      <div class="ai-settings-grid">
        <div class="form-group">
          <label>Nama Model</label>
          <input type="text" class="form-control" id="model-name-${s.model_key}" value="${escAdm(s.model_name)}">
        </div>
        <div class="form-group">
          <label>API Key <span class="text-muted text-sm">(kosongkan jika tidak diubah)</span></label>
          <input type="password" class="form-control" id="api-key-${s.model_key}" placeholder="${s.api_key_masked || 'Masukkan API Key...'}">
        </div>
        <div class="form-group">
          <label>System Prompt</label>
          <textarea class="form-control" id="sys-prompt-${s.model_key}" rows="3">${escAdm(s.system_prompt)}</textarea>
        </div>
        <div class="form-group">
          <label>Max Tokens: <span id="max-tokens-val-${s.model_key}" class="text-sm fw-600" style="color:var(--primary)">${s.max_tokens}</span></label>
          <div class="range-group">
            <input type="range" min="256" max="8192" step="256" value="${s.max_tokens}"
              oninput="document.getElementById('max-tokens-val-${s.model_key}').textContent=this.value"
              id="max-tokens-${s.model_key}">
          </div>
        </div>
        <div class="form-group">
          <label>Temperature: <span id="temp-val-${s.model_key}" class="text-sm fw-600" style="color:var(--primary)">${s.temperature}</span></label>
          <div class="range-group">
            <input type="range" min="0" max="2" step="0.1" value="${s.temperature}"
              oninput="document.getElementById('temp-val-${s.model_key}').textContent=parseFloat(this.value).toFixed(1)"
              id="temp-${s.model_key}">
          </div>
        </div>
        <div class="form-group" style="align-self:end">
          <button class="btn btn-primary" onclick="saveAISetting('${s.model_key}', ${s.is_active})">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
            Simpan
          </button>
        </div>
      </div>
    </div>
  `).join('');
}

async function saveAISetting(modelKey, currentActive) {
  const res = await apiCall('admin.php', {
    action: 'update_ai_setting',
    model_key:    modelKey,
    model_name:   document.getElementById(`model-name-${modelKey}`)?.value || '',
    api_key:      document.getElementById(`api-key-${modelKey}`)?.value || '',
    system_prompt: document.getElementById(`sys-prompt-${modelKey}`)?.value || '',
    max_tokens:   document.getElementById(`max-tokens-${modelKey}`)?.value || 2048,
    temperature:  document.getElementById(`temp-${modelKey}`)?.value || 0.7,
    is_active:    currentActive ? 1 : 0
  });
  showToast(res.success ? res.message : res.message, res.success ? 'success' : 'error');
}

function toggleModel(modelKey, checked) {
  apiCall('admin.php', {
    action: 'update_ai_setting',
    model_key: modelKey,
    is_active: checked ? 1 : 0
  }).then(res => showToast(res.success ? 'Status model diperbarui.' : res.message, res.success ? 'success' : 'error'));
}

// ============================================
// GLOBAL SETTINGS
// ============================================
async function loadGlobalSettings() {
  const res = await apiCall('admin.php', { action: 'get_global_settings' }, 'GET');
  if (!res.success) return;
  const container = document.getElementById('global-settings-container');
  if (!container) return;
  container.innerHTML = res.settings.map(s => `
    <div class="card" style="margin-bottom:14px">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:20px">
        <div style="flex:1">
          <div class="fw-600" style="margin-bottom:2px">${escAdm(s.setting_key.replace(/_/g,' ').replace(/\b\w/g, c => c.toUpperCase()))}</div>
          <div class="text-muted text-sm">${escAdm(s.description || '')}</div>
        </div>
        <div style="flex:1">
          ${s.setting_type === 'boolean'
            ? `<div class="toggle-wrap">
                <label class="toggle">
                  <input type="checkbox" id="setting-${s.setting_key}" ${s.setting_value === true || s.setting_value === '1' || s.setting_value === 't' ? 'checked' : ''}>
                  <span class="toggle-slider"></span>
                </label>
              </div>`
            : `<input type="${s.setting_type === 'number' ? 'number' : 'text'}" class="form-control" id="setting-${s.setting_key}" value="${escAdm(s.setting_value || '')}">`
          }
        </div>
        <button class="btn btn-primary btn-sm" onclick="saveSetting('${s.setting_key}', '${s.setting_type}')">Simpan</button>
      </div>
    </div>
  `).join('');
}

async function saveSetting(key, type) {
  const el = document.getElementById(`setting-${key}`);
  const value = type === 'boolean' ? (el.checked ? '1' : '0') : el.value;
  const res = await apiCall('admin.php', { action: 'update_global_setting', setting_key: key, setting_value: value });
  showToast(res.success ? 'Pengaturan disimpan.' : res.message, res.success ? 'success' : 'error');
}

// ============================================
// AUDIT LOG
// ============================================
async function loadAuditLog() {
  const res = await apiCall('admin.php', { action: 'get_audit_log', limit: 100 }, 'GET');
  if (!res.success) return;
  const tbody = document.getElementById('audit-tbody');
  if (!tbody) return;
  tbody.innerHTML = res.logs.map(l => `
    <tr>
      <td>${formatDateTime(l.created_at)}</td>
      <td>${escAdm(l.username || 'System')}</td>
      <td><span class="badge badge-info">${escAdm(l.action)}</span></td>
      <td class="text-muted text-sm">${escAdm(l.details || '-')}</td>
      <td class="text-muted text-sm hide-mobile">${escAdm(l.ip_address || '-')}</td>
    </tr>
  `).join('') || '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:24px">Log kosong.</td></tr>';
}

// ============================================
// HELPERS
// ============================================
function setEl(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}
function escAdm(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
