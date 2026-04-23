'use strict';

// ── State ─────────────────────────────────────────────────────────────────────
let token = sessionStorage.getItem('lh_token');
let currentUser = null;
let usersPage = 1;
let usersFilter = 'active';
const PAGE_SIZE = 20;

// ── API ───────────────────────────────────────────────────────────────────────
async function api(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || 'Request failed'), { status: res.status, data });
  return data;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function $(id)  { return document.getElementById(id); }
function show(id) { $(id).classList.remove('hidden'); }
function hide(id) { $(id).classList.add('hidden'); }

function showAlert(containerId, message, type = 'error') {
  const el = $(containerId);
  el.textContent = message;
  el.className = `alert alert-${type}`;
  show(containerId);
  if (type !== 'error') setTimeout(() => hide(containerId), 4000);
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function fmtUptime(secs) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function escHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// ── Auth ──────────────────────────────────────────────────────────────────────
async function login(email, password) {
  const data = await api('POST', '/api/auth/login', { email, password });
  if (data.user.role !== 'admin') throw new Error('This account does not have admin access.');
  token = data.token;
  currentUser = data.user;
  sessionStorage.setItem('lh_token', token);
}

function logout() {
  token = null;
  currentUser = null;
  sessionStorage.removeItem('lh_token');
  showLoginScreen();
}

// ── Screens ───────────────────────────────────────────────────────────────────
function showLoginScreen() {
  hide('app-shell');
  show('login-screen');
}

function showAppShell() {
  hide('login-screen');
  show('app-shell');
  $('sidebar-user-email').textContent = currentUser?.email || '';
  navigateTo('dashboard');
}

// ── Navigation ────────────────────────────────────────────────────────────────
function navigateTo(section) {
  document.querySelectorAll('.section').forEach(el => el.classList.add('hidden'));
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  show(`section-${section}`);
  document.querySelector(`[data-section="${section}"]`)?.classList.add('active');
  if (section === 'dashboard') loadStatus();
  if (section === 'email')     loadEmailConfig();
  if (section === 'users')     loadUsers(1, usersFilter);
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
async function loadStatus() {
  try {
    const s = await api('GET', '/api/admin/system/status');

    $('db-status').textContent = s.database.status;
    const dbDot = $('db-dot');
    dbDot.className = 'status-dot ' + (s.database.state === 1 ? 'green' : 'red');

    const emailConfigured = s.email.configured;
    $('email-status').textContent = emailConfigured
      ? `${s.email.provider} · ${s.email.user}`
      : 'Not configured';
    $('email-dot').className = 'status-dot ' + (emailConfigured ? 'green' : 'yellow');

    $('user-count').textContent = s.users.total;
    $('server-uptime').textContent = fmtUptime(s.server.uptime);

    const pending = s.users.pending || 0;
    $('pending-count').textContent = pending;
    updatePendingBadge(pending);
  } catch (err) {
    console.error('Status load failed', err);
  }
}

function updatePendingBadge(count) {
  const badge = $('nav-pending-badge');
  const tabBadge = $('pending-badge');
  if (count > 0) {
    badge.textContent = count;
    badge.classList.remove('hidden');
    if (tabBadge) { tabBadge.textContent = count; tabBadge.classList.remove('hidden'); }
  } else {
    badge.classList.add('hidden');
    if (tabBadge) tabBadge.classList.add('hidden');
  }
}

// ── Email Config ──────────────────────────────────────────────────────────────
async function loadEmailConfig() {
  hide('email-alert');
  try {
    const cfg = await api('GET', '/api/admin/config/email');
    const prov = cfg.provider || 'gmail-smtp';
    $('email-provider').value = prov;
    $('email-user').value = cfg.user || '';
    toggleProviderFields(prov);
  } catch (err) {
    showAlert('email-alert', 'Failed to load email config: ' + err.message);
  }
}

function toggleProviderFields(provider) {
  if (provider === 'gmail-oauth2') {
    show('oauth2-fields');
    hide('smtp-fields');
  } else {
    hide('oauth2-fields');
    show('smtp-fields');
  }
}

async function saveEmailConfig(e) {
  e.preventDefault();
  hide('email-alert');
  const provider = $('email-provider').value;
  const body = {
    provider,
    user: $('email-user').value,
    password:      $('email-password')?.value     || undefined,
    clientId:      $('email-clientId')?.value     || undefined,
    clientSecret:  $('email-clientSecret')?.value || undefined,
    refreshToken:  $('email-refreshToken')?.value || undefined,
  };
  try {
    await api('PUT', '/api/admin/config/email', body);
    showAlert('email-alert', 'Email configuration saved successfully.', 'success');
  } catch (err) {
    showAlert('email-alert', err.data?.errors?.[0]?.msg || err.message);
  }
}

async function sendTestEmail() {
  hide('email-alert');
  try {
    const res = await api('POST', '/api/admin/config/email/test');
    showAlert('email-alert', res.message, 'success');
  } catch (err) {
    showAlert('email-alert', 'Test failed: ' + err.message);
  }
}

// ── Users ─────────────────────────────────────────────────────────────────────
async function loadUsers(page, filter) {
  usersPage = page;
  usersFilter = filter !== undefined ? filter : usersFilter;
  hide('users-alert');

  const filterLabels = { active: 'Active Users', pending: 'Pending Applications', invited: 'Invited Users', '': 'All Users' };
  $('users-tab-label').textContent = filterLabels[usersFilter] || 'Users';

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === usersFilter);
  });

  try {
    const qs = usersFilter ? `status=${usersFilter}&` : '';
    const data = await api('GET', `/api/admin/users?${qs}page=${page}&limit=${PAGE_SIZE}`);
    renderUsers(data.users);
    $('users-total').textContent = data.total;
    $('users-total').className = 'badge badge-gray';
    $('page-info').textContent = `Page ${data.page} of ${data.pages}`;
    $('prev-page-btn').disabled = page <= 1;
    $('next-page-btn').disabled = page >= data.pages;

    if (usersFilter === 'pending') updatePendingBadge(data.total);
  } catch (err) {
    showAlert('users-alert', 'Failed to load users: ' + err.message);
  }
}

function renderUsers(users) {
  const tbody = $('users-tbody');
  tbody.innerHTML = '';
  users.forEach(u => {
    const isSelf = currentUser && u._id === currentUser._id;
    const isPending = u.status === 'pending';
    const statusBadge = {
      active: 'badge-green', inactive: 'badge-red', pending: 'badge-yellow', invited: 'badge-blue'
    };
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escHtml(u.name)}</td>
      <td>${escHtml(u.email)}</td>
      <td><span class="badge ${u.role === 'admin' ? 'badge-blue' : 'badge-gray'}">${u.role}</span></td>
      <td><span class="badge ${statusBadge[u.status] || 'badge-gray'}">${u.status}</span></td>
      <td>${formatDate(u.createdAt)}</td>
      <td>
        ${isSelf ? '<span style="color:var(--text-subtle);font-size:.78rem">You</span>' :
          isPending ? `
            <button class="btn btn-primary btn-sm" onclick="approveUser('${u._id}')">Approve</button>
            <button class="btn btn-ghost btn-sm" style="color:var(--danger)" onclick="rejectUser('${u._id}', '${escHtml(u.name)}')">Reject</button>
          ` : `
            <button class="btn btn-ghost btn-sm" onclick="toggleActive('${u._id}', ${u.status !== 'inactive'})">
              ${u.status === 'inactive' ? 'Activate' : 'Deactivate'}
            </button>
            <button class="btn btn-ghost btn-sm" onclick="toggleRole('${u._id}', '${u.role === 'admin' ? 'user' : 'admin'}')">
              → ${u.role === 'admin' ? 'User' : 'Admin'}
            </button>
          `}
      </td>
    `;
    tbody.appendChild(tr);
  });
}

async function toggleActive(id, deactivate) {
  try {
    await api('PATCH', `/api/admin/users/${id}`, { isActive: !deactivate });
    loadUsers(usersPage);
  } catch (err) {
    showAlert('users-alert', err.message);
  }
}

async function toggleRole(id, role) {
  try {
    await api('PATCH', `/api/admin/users/${id}`, { role });
    loadUsers(usersPage);
  } catch (err) {
    showAlert('users-alert', err.message);
  }
}

async function approveUser(id) {
  try {
    await api('PATCH', `/api/admin/users/${id}/approve`);
    showAlert('users-alert', 'User approved — invitation email sent.', 'success');
    loadUsers(usersPage);
    loadStatus();
  } catch (err) {
    showAlert('users-alert', err.message);
  }
}

async function rejectUser(id, name) {
  if (!confirm(`Reject application from "${name}"? This cannot be undone.`)) return;
  try {
    await api('PATCH', `/api/admin/users/${id}/reject`);
    showAlert('users-alert', 'Application rejected.', 'success');
    loadUsers(usersPage);
    loadStatus();
  } catch (err) {
    showAlert('users-alert', err.message);
  }
}

// ── Create User Modal ─────────────────────────────────────────────────────────
function openCreateUserModal() {
  $('cu-name').value = '';
  $('cu-email').value = '';
  $('cu-role').value = 'user';
  hide('create-user-alert');
  show('create-user-modal');
  $('cu-name').focus();
}

function closeCreateUserModal() {
  hide('create-user-modal');
}

async function submitCreateUser(e) {
  e.preventDefault();
  hide('create-user-alert');
  try {
    await api('POST', '/api/admin/users', {
      name: $('cu-name').value,
      email: $('cu-email').value,
      role: $('cu-role').value,
    });
    showAlert('create-user-alert', 'User created — invitation email sent!', 'success');
    setTimeout(() => {
      closeCreateUserModal();
      loadUsers(1, 'invited');
    }, 1500);
  } catch (err) {
    showAlert('create-user-alert', err.data?.errors?.[0]?.msg || err.message);
  }
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────
async function bootstrap() {
  if (token) {
    try {
      currentUser = (await api('GET', '/api/users/me'));
      if (currentUser.role !== 'admin') throw new Error('not admin');
      showAppShell();
      return;
    } catch {
      token = null;
      sessionStorage.removeItem('lh_token');
    }
  }
  showLoginScreen();
}

// ── Event Listeners ───────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  bootstrap();

  // Login
  $('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('login-btn');
    btn.disabled = true;
    btn.textContent = 'Signing in…';
    hide('login-error');
    try {
      await login($('login-email').value, $('login-password').value);
      showAppShell();
    } catch (err) {
      showAlert('login-error', err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Sign in';
    }
  });

  // Navigation
  document.querySelectorAll('.nav-item').forEach(el => {
    el.addEventListener('click', (e) => { e.preventDefault(); navigateTo(el.dataset.section); });
  });

  // Logout
  $('logout-btn').addEventListener('click', logout);

  // Dashboard refresh
  $('refresh-status-btn').addEventListener('click', loadStatus);

  // Email config
  $('email-provider').addEventListener('change', (e) => toggleProviderFields(e.target.value));
  $('email-form').addEventListener('submit', saveEmailConfig);
  $('test-email-btn').addEventListener('click', sendTestEmail);

  // Users filter tabs
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => loadUsers(1, btn.dataset.filter));
  });

  // Users pagination
  $('prev-page-btn').addEventListener('click', () => loadUsers(usersPage - 1));
  $('next-page-btn').addEventListener('click', () => loadUsers(usersPage + 1));

  // Create User modal
  $('create-user-btn').addEventListener('click', openCreateUserModal);
  $('create-user-close').addEventListener('click', closeCreateUserModal);
  $('create-user-cancel').addEventListener('click', closeCreateUserModal);
  $('create-user-form').addEventListener('submit', submitCreateUser);
  $('create-user-modal').addEventListener('click', (e) => {
    if (e.target === $('create-user-modal')) closeCreateUserModal();
  });
});
