'use strict';

// ── Config & State ────────────────────────────────────────────────────────────
const API_URL = window.CONFIG.apiUrl;
const TOKEN_KEY = 'lh_token';

let token = localStorage.getItem(TOKEN_KEY);
let currentUser = null;
let inviteTokenFromUrl = null;

const state = {
  tasks:          { page: 1, status: '', priority: '' },
  calendar:       { page: 1 },
  calendarEvents: [],
  contacts:       { page: 1, search: '' },
  budget:         { page: 1, period: '' },
  shopping:       { currentListId: null, currentListName: null },
};
let calView = 'list';
const PAGE_SIZE = 20;
const CHART_COLORS = ['#58a6ff','#f0883e','#3fb950','#d2a8ff','#ff7b72','#79c0ff','#56d364','#e3b341'];

// ── API ───────────────────────────────────────────────────────────────────────
async function api(method, path, body) {
  const opts = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(API_URL + path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || 'Request failed'), { status: res.status, data });
  return data;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
// escHtml, formatDate, formatDateTime, formatCurrency, toDateInputValue,
// toDatetimeLocalValue, currentMonthValue, periodToRange are defined in utils.js

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

// ── Auth ──────────────────────────────────────────────────────────────────────
async function login(email, password) {
  const data = await api('POST', '/api/auth/login', { email: email.trim(), password });
  token = data.token;
  currentUser = data.user;
  localStorage.setItem(TOKEN_KEY, token);
}

function logout() {
  api('POST', '/api/auth/logout').catch(() => {});
  token = null;
  currentUser = null;
  localStorage.removeItem(TOKEN_KEY);
  showAuthScreen('login');
}

async function exportSection(section, format = 'csv') {
  try {
    const resp = await fetch(`${API_URL}/api/${section}/export?format=${format}`, {
      headers: { 'Authorization': `Bearer ${localStorage.getItem(TOKEN_KEY)}` }
    });
    if (!resp.ok) { showAlert('app-alert', 'Export failed', 'error'); return; }
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${section.replace('/', '-')}.${format}`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    showAlert('app-alert', err.message, 'error');
  }
}

// ── Screens ───────────────────────────────────────────────────────────────────
function showAuthScreen(view) {
  show('auth-screen');
  hide('app-shell');
  ['view-login', 'view-apply', 'view-accept-invite'].forEach(id => hide(id));
  show(`view-${view}`);
}

function showAppShell() {
  hide('auth-screen');
  show('app-shell');
  $('sidebar-user-name').textContent = currentUser?.name || currentUser?.email || '';
  navigateTo('dashboard');
}

// ── Navigation ────────────────────────────────────────────────────────────────
function navigateTo(section) {
  document.querySelectorAll('.section').forEach(el => el.classList.add('hidden'));
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  show(`section-${section}`);
  document.querySelector(`[data-section="${section}"]`)?.classList.add('active');

  switch (section) {
    case 'dashboard': loadDashboard(); break;
    case 'tasks':     loadTasks(); break;
    case 'calendar':  loadCalendar(); break;
    case 'contacts':  loadContacts(); break;
    case 'budget':    loadBudget(); break;
    case 'shopping':  loadShoppingLists(); break;
    case 'profile':   loadProfile(); break;
  }
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────
async function bootstrap() {
  // Check for invite token in URL
  const params = new URLSearchParams(window.location.search);
  const urlToken = params.get('token');
  if (urlToken) {
    inviteTokenFromUrl = urlToken;
    await loadAcceptInvite(urlToken);
    return;
  }

  if (token) {
    try {
      currentUser = await api('GET', '/api/users/me');
      showAppShell();
      return;
    } catch {
      token = null;
      localStorage.removeItem(TOKEN_KEY);
    }
  }
  showAuthScreen('login');
}

// ── Accept Invite ─────────────────────────────────────────────────────────────
async function loadAcceptInvite(tok) {
  showAuthScreen('accept-invite');
  hide('invite-alert');
  hide('invite-meta');
  $('invite-btn').disabled = true;
  try {
    const data = await api('GET', `/api/auth/verify-invite?token=${encodeURIComponent(tok)}`);
    $('invite-name').textContent = data.name;
    $('invite-email-display').textContent = data.email;
    show('invite-meta');
    $('invite-btn').disabled = false;
  } catch (err) {
    showAlert('invite-alert', 'This invitation link is invalid or has expired. Please contact an administrator.');
  }
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
async function loadDashboard() {
  try {
    const [y, m] = [new Date().getFullYear(), new Date().getMonth() + 1];
    const from = `${y}-${String(m).padStart(2, '0')}-01`;
    const to   = `${y}-${String(m).padStart(2, '0')}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;

    const [taskRes, calRes, budgetRes] = await Promise.allSettled([
      api('GET', '/api/tasks?status=todo&limit=5'),
      api('GET', '/api/calendar/upcoming?limit=5'),
      api('GET', `/api/budget/summary?from=${from}&to=${to}`),
    ]);

    const taskData  = taskRes.status   === 'fulfilled' ? taskRes.value  : { tasks: [], total: 0 };
    const events    = calRes.status    === 'fulfilled' ? calRes.value   : [];
    const budgetData = budgetRes.status === 'fulfilled' ? budgetRes.value : {};
    const income   = budgetData.income?.total  ?? 0;
    const expenses = budgetData.expense?.total ?? 0;
    const balance  = budgetData.balance ?? 0;

    $('dash-stats').innerHTML = `
      <div class="stat-card">
        <div class="stat-label">Todo Tasks</div>
        <div class="stat-value">${taskData.total ?? taskData.tasks?.length ?? 0}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Upcoming Events</div>
        <div class="stat-value">${Array.isArray(events) ? events.length : 0}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Month Income</div>
        <div class="stat-value" style="color:var(--success)">${formatCurrency(income)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Month Expenses</div>
        <div class="stat-value" style="color:#ff7b72">${formatCurrency(expenses)}</div>
      </div>
    `;

    const evEl = $('dash-events');
    evEl.innerHTML = '';
    const evArr = Array.isArray(events) ? events : [];
    if (evArr.length) {
      evArr.forEach(e => {
        const li = document.createElement('li');
        li.innerHTML = `<span class="item-title">${escHtml(e.title)}</span><span class="item-meta">${formatDateTime(e.start)}</span>`;
        evEl.appendChild(li);
      });
    } else {
      evEl.innerHTML = '<li style="padding:.75rem 1.25rem;color:var(--text-muted)">No upcoming events</li>';
    }

    const tkEl = $('dash-tasks');
    tkEl.innerHTML = '';
    if (taskData.tasks?.length) {
      taskData.tasks.forEach(t => {
        const li = document.createElement('li');
        li.innerHTML = `<span class="item-title">${escHtml(t.title)}</span><span class="item-meta">${t.priority}</span>`;
        tkEl.appendChild(li);
      });
    } else {
      tkEl.innerHTML = '<li style="padding:.75rem 1.25rem;color:var(--text-muted)">No open tasks</li>';
    }
  } catch (err) {
    console.error('Dashboard load failed', err);
  }
}

// ── Tasks ─────────────────────────────────────────────────────────────────────
async function loadTasks(page) {
  if (page !== undefined) state.tasks.page = page;
  hide('tasks-alert');
  const { page: p, status, priority } = state.tasks;
  let qs = `page=${p}&limit=${PAGE_SIZE}`;
  if (status)   qs += `&status=${encodeURIComponent(status)}`;
  if (priority) qs += `&priority=${encodeURIComponent(priority)}`;
  try {
    const data = await api('GET', `/api/tasks?${qs}`);
    const tbody = $('tasks-tbody');
    tbody.innerHTML = '';
    data.tasks.forEach(t => {
      const priBadge = { low: 'badge-gray', medium: 'badge-blue', high: 'badge-red' }[t.priority] || 'badge-gray';
      const staBadge = { todo: 'badge-gray', 'in-progress': 'badge-yellow', done: 'badge-green' }[t.status] || 'badge-gray';
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${escHtml(t.title)}</td>
        <td><span class="badge ${priBadge}">${t.priority}</span></td>
        <td><span class="badge ${staBadge}">${t.status}</span></td>
        <td>${t.dueDate ? formatDate(t.dueDate) : '—'}</td>
        <td>
          <button class="btn btn-ghost btn-sm" onclick="openTaskModal('${t._id}')">Edit</button>
          <button class="btn btn-ghost btn-sm" onclick="deleteTask('${t._id}')">Delete</button>
        </td>`;
      tbody.appendChild(tr);
    });
    $('tasks-page-info').textContent = `Page ${data.page} of ${data.pages || 1}`;
    $('tasks-prev-btn').disabled = p <= 1;
    $('tasks-next-btn').disabled = p >= (data.pages || 1);
  } catch (err) {
    showAlert('tasks-alert', 'Failed to load tasks: ' + err.message);
  }
}

function openTaskModal(id) {
  hide('task-modal-alert');
  $('task-modal-form').dataset.id = id || '';
  $('task-modal-title').textContent = id ? 'Edit Task' : 'New Task';
  if (id) {
    api('GET', `/api/tasks/${id}`).then(t => {
      $('tm-title').value = t.title;
      $('tm-description').value = t.description || '';
      $('tm-status').value = t.status;
      $('tm-priority').value = t.priority;
      $('tm-dueDate').value = toDateInputValue(t.dueDate);
      $('tm-tags').value = (t.tags || []).join(', ');
    }).catch(err => showAlert('task-modal-alert', err.message));
  } else {
    $('tm-title').value = '';
    $('tm-description').value = '';
    $('tm-status').value = 'todo';
    $('tm-priority').value = 'medium';
    $('tm-dueDate').value = '';
    $('tm-tags').value = '';
  }
  show('task-modal');
}

function closeTaskModal() { hide('task-modal'); }

async function submitTaskModal(e) {
  e.preventDefault();
  hide('task-modal-alert');
  const id = $('task-modal-form').dataset.id;
  const body = {
    title:       $('tm-title').value,
    description: $('tm-description').value || undefined,
    status:      $('tm-status').value,
    priority:    $('tm-priority').value,
    dueDate:     $('tm-dueDate').value || undefined,
    tags:        $('tm-tags').value ? $('tm-tags').value.split(',').map(t => t.trim()).filter(Boolean) : [],
  };
  try {
    if (id) await api('PATCH', `/api/tasks/${id}`, body);
    else    await api('POST', '/api/tasks', body);
    closeTaskModal();
    loadTasks();
  } catch (err) {
    showAlert('task-modal-alert', err.data?.errors?.[0]?.msg || err.message);
  }
}

async function deleteTask(id) {
  if (!confirm('Delete this task?')) return;
  try {
    await api('DELETE', `/api/tasks/${id}`);
    loadTasks();
  } catch (err) {
    showAlert('tasks-alert', err.message);
  }
}

// ── Calendar ──────────────────────────────────────────────────────────────────
async function loadCalendar(page) {
  if (page !== undefined) state.calendar.page = page;
  hide('calendar-alert');
  const p = state.calendar.page;
  try {
    const data = await api('GET', `/api/calendar?page=${p}&limit=${PAGE_SIZE}`);
    state.calendarEvents = data.events || [];
    const tbody = $('calendar-tbody');
    tbody.innerHTML = '';
    data.events.forEach(e => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${escHtml(e.title)}</td>
        <td>${formatDateTime(e.start)}</td>
        <td>${e.end ? formatDateTime(e.end) : '—'}</td>
        <td>${e.reminderMinutes != null ? `${e.reminderMinutes}m` : '—'}</td>
        <td>
          <button class="btn btn-ghost btn-sm" onclick="openEventModal('${e._id}')">Edit</button>
          <button class="btn btn-ghost btn-sm" onclick="deleteEvent('${e._id}')">Delete</button>
        </td>`;
      tbody.appendChild(tr);
    });
    $('cal-page-info').textContent = `Page ${data.page} of ${data.pages || 1}`;
    $('cal-prev-btn').disabled = p <= 1;
    $('cal-next-btn').disabled = p >= (data.pages || 1);
    if (calView === 'grid') renderCalGrid();
  } catch (err) {
    showAlert('calendar-alert', 'Failed to load events: ' + err.message);
  }
}

function setCalView(v) {
  calView = v;
  $('cal-view-list').classList.toggle('active', v === 'list');
  $('cal-view-grid').classList.toggle('active', v === 'grid');
  $('cal-table-container').classList.toggle('hidden', v === 'grid');
  $('cal-grid').classList.toggle('hidden', v === 'list');
  if (v === 'grid') renderCalGrid();
}

function renderCalGrid() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const firstDay = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const eventsByDay = {};
  (state.calendarEvents || []).forEach(ev => {
    const d = new Date(ev.start).getDate();
    if (!eventsByDay[d]) eventsByDay[d] = [];
    eventsByDay[d].push(ev);
  });
  const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  let html = '<div class="cal-grid-header">' +
    DAY_NAMES.map(d => `<div>${d}</div>`).join('') + '</div>';
  html += '<div class="cal-grid-body">';
  for (let i = 0; i < firstDay; i++) html += '<div class="cal-cell cal-empty"></div>';
  const today = now.getDate();
  for (let d = 1; d <= daysInMonth; d++) {
    const isToday = d === today;
    const evs = eventsByDay[d] || [];
    html += `<div class="cal-cell${isToday ? ' cal-today' : ''}">
      <span class="cal-day-num">${d}</span>
      ${evs.map(ev => `<div class="cal-event-chip" onclick="openEventModal('${ev._id}')">${escHtml(ev.title)}</div>`).join('')}
    </div>`;
  }
  html += '</div>';
  $('cal-grid').innerHTML = html;
}

function openEventModal(id) {
  $('event-modal-title').textContent = id ? 'Edit Event' : 'New Event';
  $('em-recurrence').value = 'none';
  $('em-recurrenceEnd').value = '';
  toggleRecurrenceEnd();
  if (id) {
    api('GET', `/api/calendar/${id}`).then(e => {
      $('em-title').value = e.title;
      $('em-description').value = e.description || '';
      $('em-start').value = toDatetimeLocalValue(e.start);
      $('em-end').value = toDatetimeLocalValue(e.end);
      $('em-reminder').value = e.reminderMinutes ?? 15;
      $('em-recurrence').value = e.recurrence || 'none';
      toggleRecurrenceEnd();
    }).catch(err => showAlert('event-modal-alert', err.message));
  } else {
    $('em-title').value = '';
    $('em-description').value = '';
    $('em-start').value = '';
    $('em-end').value = '';
    $('em-reminder').value = '15';
  }
  show('event-modal');
}

function toggleRecurrenceEnd() {
  const v = $('em-recurrence').value;
  $('em-recurrence-end-group').classList.toggle('hidden', v === 'none');
}

function closeEventModal() { hide('event-modal'); }

async function submitEventModal(e) {
  e.preventDefault();
  hide('event-modal-alert');
  const id = $('event-modal-form').dataset.id;
  const body = {
    title:           $('em-title').value,
    description:     $('em-description').value || undefined,
    start:           $('em-start').value,
    end:             $('em-end').value || undefined,
    reminderMinutes: parseInt($('em-reminder').value) || 0,
    recurrence:      $('em-recurrence').value || 'none',
    recurrenceEnd:   $('em-recurrenceEnd').value || undefined,
  };
  try {
    if (id) await api('PATCH', `/api/calendar/${id}`, body);
    else    await api('POST', '/api/calendar', body);
    closeEventModal();
    loadCalendar();
  } catch (err) {
    showAlert('event-modal-alert', err.data?.errors?.[0]?.msg || err.message);
  }
}

async function deleteEvent(id) {
  if (!confirm('Delete this event?')) return;
  try {
    const event = await api('GET', `/api/calendar/${id}`);
    let url = `/api/calendar/${id}`;
    if (event.recurrenceGroupId) {
      const deleteAll = confirm('Delete all events in this recurring series?');
      if (deleteAll) url += '?all=true';
    }
    await api('DELETE', url);
    loadCalendar();
  } catch (err) {
    showAlert('calendar-alert', err.message);
  }
}

// ── Contacts ──────────────────────────────────────────────────────────────────
async function loadContacts(page) {
  if (page !== undefined) state.contacts.page = page;
  hide('contacts-alert');
  const { page: p, search } = state.contacts;
  let qs = `page=${p}&limit=${PAGE_SIZE}`;
  if (search) qs += `&search=${encodeURIComponent(search)}`;
  try {
    const data = await api('GET', `/api/contacts?${qs}`);
    const tbody = $('contacts-tbody');
    tbody.innerHTML = '';
    data.contacts.forEach(c => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>
          ${escHtml([c.firstName, c.lastName].filter(Boolean).join(' '))}
          ${c.favorite ? ' <span style="color:var(--warning)">★</span>' : ''}
        </td>
        <td>${escHtml(c.email || '—')}</td>
        <td>${escHtml(c.phone || '—')}</td>
        <td>${(c.tags || []).map(t => `<span class="badge badge-gray">${escHtml(t)}</span>`).join(' ')}</td>
        <td>
          <button class="btn btn-ghost btn-sm" onclick="openContactModal('${c._id}')">Edit</button>
          <button class="btn btn-ghost btn-sm" onclick="toggleFavorite('${c._id}')">${c.favorite ? '★' : '☆'}</button>
          <button class="btn btn-ghost btn-sm" onclick="deleteContact('${c._id}')">Delete</button>
        </td>`;
      tbody.appendChild(tr);
    });
    $('contacts-page-info').textContent = `Page ${data.page} of ${data.pages || 1}`;
    $('contacts-prev-btn').disabled = p <= 1;
    $('contacts-next-btn').disabled = p >= (data.pages || 1);
  } catch (err) {
    showAlert('contacts-alert', 'Failed to load contacts: ' + err.message);
  }
}

function openContactModal(id) {
  hide('contact-modal-alert');
  $('contact-modal-form').dataset.id = id || '';
  $('contact-modal-title').textContent = id ? 'Edit Contact' : 'New Contact';
  if (id) {
    api('GET', `/api/contacts/${id}`).then(c => {
      $('cm-firstname').value = c.firstName || '';
      $('cm-lastname').value  = c.lastName  || '';
      $('cm-email').value = c.email || '';
      $('cm-phone').value = c.phone || '';
      $('cm-tags').value = (c.tags || []).join(', ');
      $('cm-notes').value = c.notes || '';
    }).catch(err => showAlert('contact-modal-alert', err.message));
  } else {
    $('cm-firstname').value = '';
    $('cm-lastname').value  = '';
    $('cm-email').value = '';
    $('cm-phone').value = '';
    $('cm-tags').value = '';
    $('cm-notes').value = '';
  }
  show('contact-modal');
}

function closeContactModal() { hide('contact-modal'); }

async function submitContactModal(e) {
  e.preventDefault();
  hide('contact-modal-alert');
  const id = $('contact-modal-form').dataset.id;
  const body = {
    firstName: $('cm-firstname').value,
    lastName:  $('cm-lastname').value || undefined,
    email: $('cm-email').value || undefined,
    phone: $('cm-phone').value || undefined,
    tags:  $('cm-tags').value ? $('cm-tags').value.split(',').map(t => t.trim()).filter(Boolean) : [],
    notes: $('cm-notes').value || undefined,
  };
  try {
    if (id) await api('PATCH', `/api/contacts/${id}`, body);
    else    await api('POST', '/api/contacts', body);
    closeContactModal();
    loadContacts();
  } catch (err) {
    showAlert('contact-modal-alert', err.data?.errors?.[0]?.msg || err.message);
  }
}

async function toggleFavorite(id) {
  try {
    await api('PATCH', `/api/contacts/${id}/favorite`);
    loadContacts();
  } catch (err) {
    showAlert('contacts-alert', err.message);
  }
}

async function deleteContact(id) {
  if (!confirm('Delete this contact?')) return;
  try {
    await api('DELETE', `/api/contacts/${id}`);
    loadContacts();
  } catch (err) {
    showAlert('contacts-alert', err.message);
  }
}

// ── Budget ────────────────────────────────────────────────────────────────────
let budgetCategories = [];

async function loadBudget(page) {
  if (page !== undefined) state.budget.page = page;
  hide('budget-alert');
  if (!state.budget.period) {
    state.budget.period = currentMonthValue();
    $('budget-month').value = state.budget.period;
  }
  const [start, end] = periodToRange(state.budget.period);
  const p = state.budget.page;

  try {
    const [txnRes, summaryRes, catRes] = await Promise.all([
      api('GET', `/api/budget/transactions?page=${p}&limit=${PAGE_SIZE}&from=${start}&to=${end}`),
      api('GET', `/api/budget/summary?from=${start}&to=${end}`),
      api('GET', '/api/budget/categories'),
    ]);

    budgetCategories = catRes.categories || catRes || [];

    const income   = summaryRes.income?.total  ?? 0;
    const expenses = summaryRes.expense?.total ?? 0;
    const balance  = summaryRes.balance ?? 0;
    $('budget-summary-cards').innerHTML = `
      <div class="budget-card"><div class="budget-card-label">Income</div><div class="budget-card-value income">${formatCurrency(income)}</div></div>
      <div class="budget-card"><div class="budget-card-label">Expenses</div><div class="budget-card-value expense">${formatCurrency(expenses)}</div></div>
      <div class="budget-card"><div class="budget-card-label">Balance</div><div class="budget-card-value ${balance >= 0 ? 'balance-pos' : 'balance-neg'}">${formatCurrency(balance)}</div></div>
    `;

    const tbody = $('budget-tbody');
    tbody.innerHTML = '';
    const txns = txnRes.transactions || txnRes.data || [];
    txns.forEach(t => {
      const catName = budgetCategories.find(c => c._id === (t.categoryId?._id || t.categoryId))?.name || '—';
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${formatDate(t.date)}</td>
        <td>${escHtml(t.description || '—')}</td>
        <td>${escHtml(catName)}</td>
        <td><span class="badge ${t.type === 'income' ? 'badge-green' : 'badge-red'}">${t.type}</span></td>
        <td>${formatCurrency(t.amount)}</td>
        <td>
          <button class="btn btn-ghost btn-sm" onclick="openTxnModal('${t._id}')">Edit</button>
          <button class="btn btn-ghost btn-sm" onclick="deleteTxn('${t._id}')">Delete</button>
        </td>`;
      tbody.appendChild(tr);
    });

    const pages = txnRes.total ? Math.ceil(txnRes.total / (txnRes.limit || PAGE_SIZE)) : 1;
    $('budget-page-info').textContent = `Page ${txnRes.page || p} of ${pages}`;
    $('budget-prev-btn').disabled = p <= 1;
    $('budget-next-btn').disabled = p >= pages;

    if (window._categoryChart) window._categoryChart.destroy();
    if (window._incomeChart)   window._incomeChart.destroy();
    const byCategory = summaryRes.byCategory || [];
    if (window.Chart && document.getElementById('chart-by-category')) {
      window._categoryChart = new Chart(document.getElementById('chart-by-category'), {
        type: 'doughnut',
        data: {
          labels: byCategory.map(c => c.categoryName || c._id || 'Uncategorized'),
          datasets: [{ data: byCategory.map(c => Math.abs(c.total)), backgroundColor: CHART_COLORS }],
        },
        options: { plugins: { legend: { position: 'right' } } },
      });
      window._incomeChart = new Chart(document.getElementById('chart-income-expense'), {
        type: 'bar',
        data: {
          labels: ['Income', 'Expenses'],
          datasets: [{ data: [income, Math.abs(expenses)], backgroundColor: ['#2ea043', '#f85149'] }],
        },
        options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } },
      });
    }
  } catch (err) {
    showAlert('budget-alert', 'Failed to load budget: ' + err.message);
  }
}



function openTxnModal(id) {
  hide('txn-modal-alert');
  $('txn-modal-form').dataset.id = id || '';
  $('txn-modal-title').textContent = id ? 'Edit Transaction' : 'New Transaction';

  const catSel = $('txm-category');
  catSel.innerHTML = '<option value="">No category</option>';
  budgetCategories.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c._id;
    opt.textContent = c.name;
    catSel.appendChild(opt);
  });

  if (id) {
    api('GET', `/api/budget/transactions/${id}`).then(t => {
      $('txm-type').value = t.type;
      $('txm-amount').value = t.amount;
      $('txm-description').value = t.description || '';
      $('txm-category').value = t.categoryId?._id || t.categoryId || '';
      $('txm-date').value = toDateInputValue(t.date);
    }).catch(err => showAlert('txn-modal-alert', err.message));
  } else {
    $('txm-type').value = 'expense';
    $('txm-amount').value = '';
    $('txm-description').value = '';
    $('txm-category').value = '';
    $('txm-date').value = toDateInputValue(new Date().toISOString());
  }
  show('txn-modal');
}

function closeTxnModal() { hide('txn-modal'); }

async function submitTxnModal(e) {
  e.preventDefault();
  hide('txn-modal-alert');
  const id = $('txn-modal-form').dataset.id;
  const body = {
    type:        $('txm-type').value,
    amount:      parseFloat($('txm-amount').value),
    description: $('txm-description').value || undefined,
    categoryId:  $('txm-category').value || undefined,
    date:        $('txm-date').value,
  };
  try {
    if (id) await api('PATCH', `/api/budget/transactions/${id}`, body);
    else    await api('POST', '/api/budget/transactions', body);
    closeTxnModal();
    loadBudget();
  } catch (err) {
    showAlert('txn-modal-alert', err.data?.errors?.[0]?.msg || err.message);
  }
}

async function deleteTxn(id) {
  if (!confirm('Delete this transaction?')) return;
  try {
    await api('DELETE', `/api/budget/transactions/${id}`);
    loadBudget();
  } catch (err) {
    showAlert('budget-alert', err.message);
  }
}

// ── Category Manager ──────────────────────────────────────────────────────────
async function openCatModal() {
  hide('cat-modal-alert');
  $('cat-name-input').value = '';
  show('cat-modal');
  await renderCatList();
}

function closeCatModal() { hide('cat-modal'); }

async function renderCatList() {
  try {
    const data = await api('GET', '/api/budget/categories');
    budgetCategories = data.categories || data || [];
    const ul = $('cat-list');
    ul.innerHTML = '';
    budgetCategories.forEach(c => {
      const li = document.createElement('li');
      li.innerHTML = `
        <span class="item-title">${escHtml(c.name)}</span>
        <button class="btn btn-ghost btn-sm" onclick="deleteCategory('${c._id}')">Delete</button>`;
      ul.appendChild(li);
    });
  } catch (err) {
    showAlert('cat-modal-alert', err.message);
  }
}

async function submitCatAdd(e) {
  e.preventDefault();
  hide('cat-modal-alert');
  const name = $('cat-name-input').value.trim();
  if (!name) return;
  try {
    await api('POST', '/api/budget/categories', { name });
    $('cat-name-input').value = '';
    await renderCatList();
    loadBudget();
  } catch (err) {
    showAlert('cat-modal-alert', err.message);
  }
}

async function deleteCategory(id) {
  if (!confirm('Delete this category?')) return;
  try {
    await api('DELETE', `/api/budget/categories/${id}`);
    await renderCatList();
    loadBudget();
  } catch (err) {
    showAlert('cat-modal-alert', err.message);
  }
}

// ── Shopping ──────────────────────────────────────────────────────────────────
async function loadShoppingLists() {
  hide('shopping-alert');
  show('shopping-lists-view');
  hide('shopping-items-view');
  state.shopping.currentListId = null;
  try {
    const data = await api('GET', '/api/shopping');
    const grid = $('shopping-lists-grid');
    grid.innerHTML = '';
    const lists = data.lists || data || [];
    if (!lists.length) {
      grid.innerHTML = '<p style="color:var(--text-muted)">No lists yet. Create one to get started.</p>';
      return;
    }
    lists.forEach(l => {
      const unchecked = (l.items || []).filter(i => !i.checked).length;
      const total = (l.items || []).length;
      const div = document.createElement('div');
      div.className = 'list-card';
      div.innerHTML = `
        <div class="list-card-name">${escHtml(l.name)}</div>
        <div class="list-card-meta">${unchecked} remaining · ${total} items</div>`;
      div.addEventListener('click', () => openShoppingList(l._id, l.name));
      grid.appendChild(div);
    });
  } catch (err) {
    showAlert('shopping-alert', 'Failed to load lists: ' + err.message);
  }
}

async function openShoppingList(listId, listName) {
  state.shopping.currentListId = listId;
  state.shopping.currentListName = listName;
  hide('shopping-lists-view');
  show('shopping-items-view');
  $('shopping-list-title').textContent = listName;
  $('new-item-input').value = '';
  await renderShoppingItems(listId);
}

async function renderShoppingItems(listId) {
  hide('shopping-items-alert');
  try {
    const data = await api('GET', `/api/shopping/${listId}`);
    const ul = $('shopping-items-ul');
    ul.innerHTML = '';
    const items = data.items || [];
    items.forEach(item => {
      const li = document.createElement('li');
      li.className = `check-item ${item.checked ? 'checked' : ''}`;
      li.innerHTML = `
        <input type="checkbox" ${item.checked ? 'checked' : ''} onchange="toggleItem('${listId}', '${item._id}')" />
        <span class="item-title">${escHtml(item.name)}</span>
        ${item.quantity > 1 ? `<span class="item-meta">×${item.quantity}</span>` : ''}
        <button class="btn btn-ghost btn-sm" onclick="deleteItem('${listId}', '${item._id}')">✕</button>`;
      ul.appendChild(li);
    });
  } catch (err) {
    showAlert('shopping-items-alert', 'Failed to load items: ' + err.message);
  }
}

async function toggleItem(listId, itemId) {
  try {
    await api('PATCH', `/api/shopping/${listId}/items/${itemId}/toggle`);
    await renderShoppingItems(listId);
  } catch (err) {
    showAlert('shopping-items-alert', err.message);
  }
}

async function addShoppingItem() {
  const name = $('new-item-input').value.trim();
  if (!name) return;
  const listId = state.shopping.currentListId;
  try {
    await api('POST', `/api/shopping/${listId}/items`, { name });
    $('new-item-input').value = '';
    await renderShoppingItems(listId);
  } catch (err) {
    showAlert('shopping-items-alert', err.message);
  }
}

async function deleteItem(listId, itemId) {
  try {
    await api('DELETE', `/api/shopping/${listId}/items/${itemId}`);
    await renderShoppingItems(listId);
  } catch (err) {
    showAlert('shopping-items-alert', err.message);
  }
}

function openListModal() {
  $('lm-name').value = '';
  hide('list-modal-alert');
  show('list-modal');
}

function closeListModal() { hide('list-modal'); }

async function submitListModal(e) {
  e.preventDefault();
  hide('list-modal-alert');
  try {
    const list = await api('POST', '/api/shopping', { name: $('lm-name').value });
    closeListModal();
    openShoppingList(list._id, list.name);
  } catch (err) {
    showAlert('list-modal-alert', err.message);
  }
}

async function deleteCurrentList() {
  const listId = state.shopping.currentListId;
  const name = state.shopping.currentListName;
  if (!confirm(`Delete list "${name}" and all its items?`)) return;
  try {
    await api('DELETE', `/api/shopping/${listId}`);
    loadShoppingLists();
  } catch (err) {
    showAlert('shopping-items-alert', err.message);
  }
}

// ── Profile / Settings ────────────────────────────────────────────────────────
async function loadProfile() {
  hide('profile-alert');
  hide('telegram-alert');
  try {
    const user = await api('GET', '/api/users/me');
    currentUser = user;
    $('profile-name').value = user.name || '';
    $('sidebar-user-name').textContent = user.name || user.email || '';
    renderTelegramStatus(user.telegramChatId);
  } catch (err) {
    showAlert('profile-alert', 'Failed to load profile: ' + err.message);
  }
}

function renderTelegramStatus(chatId) {
  if (chatId) {
    show('tg-linked-view');
    hide('tg-unlinked-view');
  } else {
    hide('tg-linked-view');
    show('tg-unlinked-view');
  }
  hide('tg-code-box');
}

async function submitProfileName(e) {
  e.preventDefault();
  hide('profile-alert');
  try {
    const user = await api('PATCH', '/api/users/me', { name: $('profile-name').value });
    currentUser = user;
    $('sidebar-user-name').textContent = user.name || user.email || '';
    showAlert('profile-alert', 'Name updated successfully.', 'success');
  } catch (err) {
    showAlert('profile-alert', err.data?.errors?.[0]?.msg || err.message);
  }
}

async function submitProfileEmail(e) {
  e.preventDefault();
  hide('profile-alert');
  try {
    await api('PATCH', '/api/users/me/email', {
      email:           $('profile-new-email').value,
      currentPassword: $('profile-email-password').value,
    });
    showAlert('profile-alert', 'Email updated successfully.', 'success');
    $('profile-email-password').value = '';
    $('profile-new-email').value = '';
  } catch (err) {
    showAlert('profile-alert', err.message);
  }
}

async function submitProfilePassword(e) {
  e.preventDefault();
  hide('profile-alert');
  try {
    const data = await api('POST', '/api/users/me/password', {
      currentPassword: $('profile-current-password').value,
      newPassword:     $('profile-new-password').value,
    });
    if (data.token) {
      token = data.token;
      localStorage.setItem(TOKEN_KEY, token);
    }
    showAlert('profile-alert', 'Password changed successfully.', 'success');
    $('profile-current-password').value = '';
    $('profile-new-password').value = '';
  } catch (err) {
    showAlert('profile-alert', err.message);
  }
}

async function submitProfileDelete(e) {
  e.preventDefault();
  if (!confirm('Are you sure? This will permanently delete your account and all data.')) return;
  hide('profile-alert');
  try {
    await api('DELETE', '/api/users/me', { password: $('profile-delete-password').value });
    logout();
  } catch (err) {
    showAlert('profile-alert', err.message);
  }
}

async function linkTelegram() {
  hide('telegram-alert');
  try {
    const data = await api('POST', '/api/telegram/link-code');
    $('tg-code-text').textContent = `/link ${data.code}`;
    show('tg-code-box');
  } catch (err) {
    showAlert('telegram-alert', err.message);
  }
}

async function unlinkTelegram() {
  if (!confirm('Unlink your Telegram account?')) return;
  hide('telegram-alert');
  try {
    await api('DELETE', '/api/telegram/link');
    currentUser.telegramChatId = null;
    renderTelegramStatus(null);
    showAlert('telegram-alert', 'Telegram unlinked.', 'success');
  } catch (err) {
    showAlert('telegram-alert', err.message);
  }
}

// ── Profile Tabs ──────────────────────────────────────────────────────────────
function switchProfileTab(tabName) {
  document.querySelectorAll('#section-profile .tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });
  ['tab-account', 'tab-telegram'].forEach(id => hide(id));
  show(`tab-${tabName}`);
}

// ── Event Listeners ───────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  bootstrap();

  // Auth — Login
  $('go-apply').addEventListener('click', (e) => { e.preventDefault(); showAuthScreen('apply'); });
  $('go-login').addEventListener('click', (e) => { e.preventDefault(); showAuthScreen('login'); });

  $('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('login-btn');
    btn.disabled = true; btn.textContent = 'Signing in…';
    hide('login-alert');
    try {
      await login($('login-email').value, $('login-password').value);
      showAppShell();
    } catch (err) {
      showAlert('login-alert', err.message);
    } finally {
      btn.disabled = false; btn.textContent = 'Sign in';
    }
  });

  // Auth — Apply
  $('apply-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('apply-btn');
    btn.disabled = true; btn.textContent = 'Submitting…';
    hide('apply-alert');
    try {
      await api('POST', '/api/auth/apply', {
        firstName: $('apply-firstname').value,
        lastName:  $('apply-lastname').value || undefined,
        email:     $('apply-email').value,
      });
      showAlert('apply-alert', 'Application submitted! You will receive an email when your account is approved.', 'success');
      $('apply-form').reset();
    } catch (err) {
      showAlert('apply-alert', err.data?.errors?.[0]?.msg || err.message);
    } finally {
      btn.disabled = false; btn.textContent = 'Submit Application';
    }
  });

  // Auth — Accept Invite
  $('invite-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const password = $('invite-password').value;
    const confirm  = $('invite-confirm').value;
    if (password !== confirm) { showAlert('invite-alert', 'Passwords do not match.'); return; }
    const btn = $('invite-btn');
    btn.disabled = true; btn.textContent = 'Setting up…';
    hide('invite-alert');
    try {
      const data = await api('POST', '/api/auth/accept-invite', { token: inviteTokenFromUrl, password });
      token = data.token;
      currentUser = data.user;
      localStorage.setItem(TOKEN_KEY, token);
      history.replaceState({}, '', '/');
      showAppShell();
    } catch (err) {
      showAlert('invite-alert', err.message);
      btn.disabled = false; btn.textContent = 'Set Password & Sign In';
    }
  });

  // Navigation
  document.querySelectorAll('.nav-item').forEach(el => {
    el.addEventListener('click', (e) => { e.preventDefault(); navigateTo(el.dataset.section); });
  });

  $('logout-btn').addEventListener('click', logout);

  // Tasks
  $('task-create-btn').addEventListener('click', () => openTaskModal(null));
  $('task-modal-close').addEventListener('click', closeTaskModal);
  $('task-modal-cancel').addEventListener('click', closeTaskModal);
  $('task-modal-form').addEventListener('submit', submitTaskModal);
  $('task-modal').addEventListener('click', (e) => { if (e.target === $('task-modal')) closeTaskModal(); });
  $('task-filter-status').addEventListener('change', (e) => { state.tasks.status = e.target.value; loadTasks(1); });
  $('task-filter-priority').addEventListener('change', (e) => { state.tasks.priority = e.target.value; loadTasks(1); });
  $('tasks-prev-btn').addEventListener('click', () => loadTasks(state.tasks.page - 1));
  $('tasks-next-btn').addEventListener('click', () => loadTasks(state.tasks.page + 1));

  // Calendar
  $('event-create-btn').addEventListener('click', () => openEventModal(null));
  $('event-modal-close').addEventListener('click', closeEventModal);
  $('event-modal-cancel').addEventListener('click', closeEventModal);
  $('event-modal-form').addEventListener('submit', submitEventModal);
  $('event-modal').addEventListener('click', (e) => { if (e.target === $('event-modal')) closeEventModal(); });
  $('cal-prev-btn').addEventListener('click', () => loadCalendar(state.calendar.page - 1));
  $('cal-next-btn').addEventListener('click', () => loadCalendar(state.calendar.page + 1));

  // Contacts
  $('contact-create-btn').addEventListener('click', () => openContactModal(null));
  $('contact-modal-close').addEventListener('click', closeContactModal);
  $('contact-modal-cancel').addEventListener('click', closeContactModal);
  $('contact-modal-form').addEventListener('submit', submitContactModal);
  $('contact-modal').addEventListener('click', (e) => { if (e.target === $('contact-modal')) closeContactModal(); });
  $('contact-search').addEventListener('input', (e) => { state.contacts.search = e.target.value; loadContacts(1); });
  $('contacts-prev-btn').addEventListener('click', () => loadContacts(state.contacts.page - 1));
  $('contacts-next-btn').addEventListener('click', () => loadContacts(state.contacts.page + 1));

  // Budget
  $('txn-create-btn').addEventListener('click', () => openTxnModal(null));
  $('txn-modal-close').addEventListener('click', closeTxnModal);
  $('txn-modal-cancel').addEventListener('click', closeTxnModal);
  $('txn-modal-form').addEventListener('submit', submitTxnModal);
  $('txn-modal').addEventListener('click', (e) => { if (e.target === $('txn-modal')) closeTxnModal(); });
  $('budget-prev-btn').addEventListener('click', () => loadBudget(state.budget.page - 1));
  $('budget-next-btn').addEventListener('click', () => loadBudget(state.budget.page + 1));
  $('budget-apply-period').addEventListener('click', () => { state.budget.period = $('budget-month').value; loadBudget(1); });
  $('cat-manage-btn').addEventListener('click', openCatModal);
  $('cat-modal-close').addEventListener('click', closeCatModal);
  $('cat-modal').addEventListener('click', (e) => { if (e.target === $('cat-modal')) closeCatModal(); });
  $('cat-add-form').addEventListener('submit', submitCatAdd);

  // Shopping
  $('list-create-btn').addEventListener('click', openListModal);
  $('list-modal-close').addEventListener('click', closeListModal);
  $('list-modal-cancel').addEventListener('click', closeListModal);
  $('list-modal-form').addEventListener('submit', submitListModal);
  $('list-modal').addEventListener('click', (e) => { if (e.target === $('list-modal')) closeListModal(); });
  $('back-to-lists-btn').addEventListener('click', loadShoppingLists);
  $('add-item-btn').addEventListener('click', addShoppingItem);
  $('new-item-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addShoppingItem(); } });
  $('delete-list-btn').addEventListener('click', deleteCurrentList);

  // Profile
  $('profile-name-form').addEventListener('submit', submitProfileName);
  $('profile-email-form').addEventListener('submit', submitProfileEmail);
  $('profile-password-form').addEventListener('submit', submitProfilePassword);
  $('profile-delete-form').addEventListener('submit', submitProfileDelete);
  $('tg-link-btn').addEventListener('click', linkTelegram);
  $('tg-unlink-btn').addEventListener('click', unlinkTelegram);
  document.querySelectorAll('#section-profile .tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchProfileTab(btn.dataset.tab));
  });
});
