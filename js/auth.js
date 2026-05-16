/* ============================================
   AUTH PAGE - LOGIN & REGISTER LOGIC
   ============================================ */

let pendingUserId = null;

document.addEventListener('DOMContentLoaded', async () => {
  const res = await apiCall('auth.php', { action: 'check' }, 'GET');
  if (res.logged_in) {
    window.location.href = res.user.role === 'admin' ? 'admin.html' : 'chat.php';
    return;
  }
  setupTabs();
  setupLoginForm();
  setupRegisterForm();
  setupGoogleLogin(res.google_configured);
  setupVerification();
});

// ============================================
// TABS
// ============================================
function setupTabs() {
  const tabs = document.querySelectorAll('.auth-tab');
  const loginForm    = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');
  const title   = document.getElementById('auth-title');
  const subtitle = document.getElementById('auth-subtitle');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const isLogin = tab.dataset.tab === 'login';
      loginForm.classList.toggle('hidden', !isLogin);
      registerForm.classList.toggle('hidden', isLogin);
      title.textContent    = isLogin ? 'Selamat Datang Kembali' : 'Buat Akun Baru';
      subtitle.textContent = isLogin ? 'Masuk ke akun NODE-407 Anda' : 'Daftar dan mulai menggunakan AI';
      document.querySelectorAll('.auth-alert').forEach(a => a.classList.add('hidden'));
    });
  });
}

// ============================================
// LOGIN FORM
// ============================================
function setupLoginForm() {
  const form   = document.getElementById('login-form');
  const btn    = document.getElementById('login-btn');
  const alert  = document.getElementById('login-alert');
  const pwdInput = document.getElementById('login-password');
  const eyeBtn   = document.getElementById('login-eye');

  eyeBtn?.addEventListener('click', () => togglePassword(pwdInput, eyeBtn));

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const email    = document.getElementById('login-email').value.trim();
    const password = pwdInput.value;
    if (!email || !password) {
      showAlert(alert, 'Email/No. HP dan password harus diisi.', 'error');
      return;
    }
    setLoading(btn, true, 'Masuk...');
    const res = await apiCall('auth.php', { action: 'login', email, password });
    setLoading(btn, false);
    if (res.success) {
      showAlert(alert, res.message, 'success');
      setTimeout(() => { window.location.href = res.redirect; }, 600);
    } else if (res.need_verification) {
      pendingUserId = res.user_id;
      openVerification(res.email, res.code);
    } else {
      showAlert(alert, res.message, 'error');
    }
  });
}

// ============================================
// REGISTER FORM
// ============================================
function setupRegisterForm() {
  const form    = document.getElementById('register-form');
  const btn     = document.getElementById('register-btn');
  const alert   = document.getElementById('register-alert');
  const pwdInput = document.getElementById('reg-password');
  const eyeBtn   = document.getElementById('reg-eye');
  const strengthBar = document.getElementById('strength-bar');

  eyeBtn?.addEventListener('click', () => togglePassword(pwdInput, eyeBtn));

  pwdInput?.addEventListener('input', () => {
    const val = pwdInput.value;
    const strength = getPasswordStrength(val);
    const colors = ['', '#ef4444', '#f97316', '#f59e0b', '#22c55e', '#16a34a'];
    strengthBar.style.width = (strength * 20) + '%';
    strengthBar.style.background = colors[strength] || '#e2e8f0';
  });

  const unInput = document.getElementById('reg-username');
  unInput?.addEventListener('input', () => {
    const val = unInput.value;
    const valid = /^[a-zA-Z0-9_]{3,20}$/.test(val);
    unInput.style.borderColor = val.length > 2 ? (valid ? '#22c55e' : '#ef4444') : '';
  });

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const data = {
      action:           'register',
      full_name:        document.getElementById('reg-fullname').value.trim(),
      username:         document.getElementById('reg-username').value.trim(),
      email:            document.getElementById('reg-email').value.trim(),
      phone:            document.getElementById('reg-phone').value.trim(),
      password:         pwdInput.value,
      confirm_password: document.getElementById('reg-confirm').value
    };
    if (!data.full_name || !data.username || !data.email || !data.password || !data.confirm_password) {
      showAlert(alert, 'Semua field harus diisi.', 'error');
      return;
    }
    setLoading(btn, true, 'Mendaftar...');
    const res = await apiCall('auth.php', data);
    setLoading(btn, false);
    if (res.success) {
      pendingUserId = res.user_id;
      openVerification(res.email, res.code);
    } else {
      showAlert(alert, res.message, 'error');
    }
  });
}

// ============================================
// GOOGLE LOGIN
// ============================================
function setupGoogleLogin(googleConfigured) {
  const btn = document.getElementById('google-login-btn');
  if (!btn) return;

  if (!googleConfigured) {
    btn.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg> Google (butuh konfigurasi)';
    btn.style.opacity = '0.5';
    btn.style.cursor = 'not-allowed';
  }

  btn.addEventListener('click', () => {
    if (!googleConfigured) {
      showAlert(document.getElementById('login-alert'), 'Google Login belum dikonfigurasi. Buka Admin Panel → Pengaturan Global → isi Google Client ID & Secret.', 'info');
      return;
    }
    window.location.href = 'php/auth.php?action=google_login';
  });
}

// ============================================
// VERIFICATION MODAL
// ============================================
function setupVerification() {
  const inputs = document.querySelectorAll('.verify-digit');
  const verifyBtn = document.getElementById('verify-btn');
  const verifyAlert = document.getElementById('verify-alert');

  inputs.forEach((input, idx) => {
    input.addEventListener('input', () => {
      input.value = input.value.replace(/[^0-9]/g, '').slice(0, 1);
      if (input.value && idx < inputs.length - 1) {
        inputs[idx + 1].focus();
      }
      updateVerifyBtn();
    });
    input.addEventListener('keydown', e => {
      if (e.key === 'Backspace' && !input.value && idx > 0) {
        inputs[idx - 1].focus();
      }
      if (e.key === 'Enter') {
        document.getElementById('verify-btn').click();
      }
    });
  });

  document.getElementById('verify-btn').addEventListener('click', async () => {
    const code = Array.from(inputs).map(i => i.value).join('');
    if (code.length !== 6) return;

    verifyBtn.disabled = true;
    verifyBtn.innerHTML = '<div class="spinner" style="width:16px;height:16px;border-width:2px;border-color:rgba(255,255,255,.3);border-top-color:#fff"></div> Verifikasi...';

    const res = await apiCall('auth.php', {
      action: 'verify_code',
      user_id: pendingUserId,
      code,
      type: 'email'
    });

    verifyBtn.disabled = false;
    verifyBtn.innerHTML = 'Verifikasi';

    if (res.success) {
      showAlert(verifyAlert, 'Verifikasi berhasil! Mengalihkan...', 'success');
      setTimeout(() => {
        window.location.href = res.redirect || 'chat.php';
      }, 800);
    } else {
      showAlert(verifyAlert, res.message, 'error');
      inputs.forEach(i => { i.value = ''; });
      inputs[0].focus();
    }
  });

  document.getElementById('resend-verify-btn').addEventListener('click', async () => {
    if (!pendingUserId) return;
    const res = await apiCall('auth.php', {
      action: 'send_verification',
      type: 'email'
    });
    if (res.success) {
      showAlert(verifyAlert, res.message + (res.code ? ` Kode: ${res.code}` : ''), 'success');
    } else {
      showAlert(verifyAlert, res.message, 'error');
    }
  });
}

function openVerification(email, code) {
  document.getElementById('verify-destination').textContent = email || 'email Anda';
  document.getElementById('verify-modal').classList.add('active');
  document.querySelectorAll('.verify-digit').forEach(i => { i.value = ''; });
  document.querySelector('.verify-digit').focus();
  updateVerifyBtn();

  // For development: auto-fill code if returned
  if (code) {
    const inputs = document.querySelectorAll('.verify-digit');
    code.split('').forEach((c, i) => {
      if (inputs[i]) inputs[i].value = c;
    });
    updateVerifyBtn();
    // Auto submit after short delay
    setTimeout(() => document.getElementById('verify-btn').click(), 500);
  }
}

function updateVerifyBtn() {
  const inputs = document.querySelectorAll('.verify-digit');
  const code = Array.from(inputs).map(i => i.value).join('');
  document.getElementById('verify-btn').disabled = code.length !== 6;
}

// ============================================
// HELPERS
// ============================================
function showAlert(el, msg, type) {
  const bg = type === 'error' ? '#fee2e2' : type === 'success' ? '#dcfce7' : '#fef2f2';
  const color = type === 'error' ? '#b91c1c' : type === 'success' ? '#15803d' : '#CC0000';
  el.className = `auth-alert alert hidden`;
  el.style.background = bg;
  el.style.color = color;
  el.textContent = msg;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 6000);
}

function setLoading(btn, loading, label) {
  btn.disabled = loading;
  if (loading && label) {
    btn.innerHTML = '<div class="spinner" style="width:16px;height:16px;border-width:2px;border-color:rgba(255,255,255,.3);border-top-color:#fff"></div> ' + label;
  } else if (!loading) {
    btn.innerHTML = label || '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg> Masuk';
  }
}

function togglePassword(input, btn) {
  const isText = input.type === 'text';
  input.type = isText ? 'password' : 'text';
  btn.innerHTML = isText
    ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="17" height="17"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>'
    : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="17" height="17"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
}

function getPasswordStrength(pwd) {
  let s = 0;
  if (pwd.length >= 6) s++;
  if (pwd.length >= 10) s++;
  if (/[A-Z]/.test(pwd)) s++;
  if (/[0-9]/.test(pwd)) s++;
  if (/[^A-Za-z0-9]/.test(pwd)) s++;
  return s;
}
