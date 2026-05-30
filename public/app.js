// ── State ──
let allEvents      = [];
let currentEvent   = null;
let currentSignups = [];
let adminPassword  = sessionStorage.getItem('adminPassword') || null;

// ── Init ──
async function init() {
  setupModalClose();
  setupToggleFields();
  setupFormListeners();
  setupEditModalListeners();
  setupAdminListeners();
  updateAdminUI();
  await loadEvents();
}

// ── Events ──
async function loadEvents() {
  try {
    const res = await fetch('/api/events');
    allEvents = await res.json();
    renderEventTabs();
    if (allEvents.length && !currentEvent) {
      await selectEvent(allEvents[0].id);
    } else if (!allEvents.length) {
      renderSignups();
      renderProgress();
    }
  } catch (e) {
    console.error('Could not load events', e);
  }
}

function renderEventTabs() {
  const container = document.getElementById('event-tabs');
  container.innerHTML = '';
  allEvents.forEach(ev => {
    const btn = document.createElement('button');
    btn.className = 'event-tab' + (currentEvent?.id === ev.id ? ' active' : '');
    btn.textContent = ev.name + (ev.event_date ? ' — ' + fmtShortDate(ev.event_date) : '');
    btn.addEventListener('click', () => selectEvent(ev.id));
    container.appendChild(btn);
  });
}

async function selectEvent(id) {
  currentEvent = allEvents.find(e => e.id === id) || null;
  renderEventTabs();
  await loadSignups();
}

// ── Signups ──
async function loadSignups() {
  if (!currentEvent) { currentSignups = []; renderSignups(); renderProgress(); return; }
  try {
    const res = await fetch(`/api/events/${currentEvent.id}/signups`);
    currentSignups = await res.json();
    renderSignups();
    renderProgress();
  } catch (e) {
    console.error('Could not load signups', e);
  }
}

function renderProgress() {
  const ev = currentEvent || {};
  const meals   = currentSignups.filter(s => s.bringing_meal).length;
  const sides   = currentSignups.filter(s => s.bringing_sides).length;
  const desserts = currentSignups.filter(s => s.bringing_dessert).length;
  const drinks  = currentSignups.filter(s => s.bringing_drink).length;
  const cleanup = currentSignups.filter(s => s.cleaning_up).length;
  setBar('meals',   meals,   ev.meal_target);
  setBar('sides',    sides,    ev.sides_target);
  setBar('desserts', desserts, ev.dessert_target);
  setBar('drinks',   drinks,   ev.drink_target);
  setBar('cleanup', cleanup, ev.cleanup_target);
}

function setBar(key, count, target) {
  const bar  = document.getElementById(`bar-${key}`);
  const frac = document.getElementById(`frac-${key}`);
  if (!bar || !frac) return;
  if (!target) {
    frac.textContent = `${count} signed up`;
    frac.className = 'progress-count';
    bar.style.width = count > 0 ? '100%' : '0%';
    bar.className = 'progress-fill met';
    return;
  }
  const pct = Math.min((count / target) * 100, 100);
  const met  = count >= target;
  bar.style.width = pct + '%';
  bar.className = 'progress-fill ' + (met ? 'met' : 'filling');
  frac.textContent = `${count} / ${target}`;
  frac.className = 'progress-count' + (met ? ' met' : '');
}

function renderSignups() {
  const list = document.getElementById('signups-list');
  list.innerHTML = '';
  if (!currentSignups.length) {
    list.innerHTML = '<div class="empty-state">No sign-ups yet. Be the first!</div>';
    return;
  }
  currentSignups.forEach(s => list.appendChild(buildEntry(s)));
}

function buildEntry(signup) {
  const div = document.createElement('div');
  div.className = 'signup-entry';
  div.dataset.id = signup.id;

  const tags = [];
  if (signup.bringing_meal)    tags.push(`<span class="contrib-tag meal">&#127859; ${escHtml(signup.meal_description    || 'Main dish')}</span>`);
  if (signup.bringing_sides)   tags.push(`<span class="contrib-tag sides">&#127793; ${escHtml(signup.sides_description  || 'Sides')}</span>`);
  if (signup.bringing_dessert) tags.push(`<span class="contrib-tag dessert">&#127856; ${escHtml(signup.dessert_description || 'Dessert')}</span>`);
  if (signup.bringing_drink)   tags.push(`<span class="contrib-tag drink">&#127863; ${escHtml(signup.drink_description   || 'Drink')}</span>`);
  if (signup.cleaning_up)    tags.push(`<span class="contrib-tag cleanup">&#10024; Clean-Up</span>`);
  if (!tags.length)          tags.push(`<span class="contrib-tag attending">Attending</span>`);

  const delBtn = adminPassword
    ? `<button class="btn-icon btn-remove" data-del="${signup.id}" title="Delete">&#10005;</button>`
    : '';

  div.innerHTML = `
    <div class="entry-info">
      <div class="signup-name">${escHtml(signup.name)}</div>
      <div class="signup-contributions">${tags.join('')}</div>
    </div>
    <div class="entry-actions">
      <span class="signup-date">${fmtShortDate(signup.created_at)}</span>
      <button class="btn-icon btn-edit" data-edit="${signup.id}" title="Edit">&#9998;</button>
      ${delBtn}
    </div>
  `;
  return div;
}

// ── Main Form ──
function setupFormListeners() {
  [['bringing_meal', 'meal-detail'], ['bringing_sides', 'sides-detail'], ['bringing_dessert', 'dessert-detail'], ['bringing_drink', 'drink-detail']].forEach(
    ([cbId, detailId]) => wireToggle(cbId, detailId)
  );

  document.getElementById('signup-form').addEventListener('submit', async e => {
    e.preventDefault();
    if (!currentEvent) return;
    const errEl = document.getElementById('form-error');
    errEl.style.display = 'none';

    const body = {
      name:              document.getElementById('name').value.trim(),
      bringing_meal:     document.getElementById('bringing_meal').checked,
      meal_description:  document.getElementById('meal_description').value.trim(),
      bringing_sides:      document.getElementById('bringing_sides').checked,
      sides_description:   document.getElementById('sides_description').value.trim(),
      bringing_dessert:    document.getElementById('bringing_dessert').checked,
      dessert_description: document.getElementById('dessert_description').value.trim(),
      bringing_drink:      document.getElementById('bringing_drink').checked,
      drink_description: document.getElementById('drink_description').value.trim(),
      cleaning_up:       document.getElementById('cleaning_up').checked,
    };

    const res = await fetch(`/api/events/${currentEvent.id}/signups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const data = await res.json();
      errEl.textContent = data.error;
      errEl.style.display = 'block';
      return;
    }

    document.getElementById('signup-form').reset();
    document.querySelectorAll('#signup-form .detail-field').forEach(d => d.classList.remove('visible'));
    await loadSignups();
  });

  // Delegated click for edit / delete on the list
  document.getElementById('signups-list').addEventListener('click', async e => {
    const editBtn = e.target.closest('[data-edit]');
    const delBtn  = e.target.closest('[data-del]');
    if (editBtn) openEditModal(parseInt(editBtn.dataset.edit));
    if (delBtn  && adminPassword) await deleteSignup(parseInt(delBtn.dataset.del));
  });
}

// ── Edit Modal ──
function setupEditModalListeners() {
  [['edit-bringing-meal', 'edit-meal-detail'], ['edit-bringing-sides', 'edit-sides-detail'], ['edit-bringing-dessert', 'edit-dessert-detail'], ['edit-bringing-drink', 'edit-drink-detail']].forEach(
    ([cbId, detailId]) => wireToggle(cbId, detailId)
  );

  document.getElementById('edit-form').addEventListener('submit', async e => {
    e.preventDefault();
    const id  = document.getElementById('edit-id').value;
    const errEl = document.getElementById('edit-error');
    errEl.style.display = 'none';

    const body = {
      name:              document.getElementById('edit-name').value.trim(),
      bringing_meal:     document.getElementById('edit-bringing-meal').checked,
      meal_description:  document.getElementById('edit-meal-desc').value.trim(),
      bringing_sides:      document.getElementById('edit-bringing-sides').checked,
      sides_description:   document.getElementById('edit-sides-desc').value.trim(),
      bringing_dessert:    document.getElementById('edit-bringing-dessert').checked,
      dessert_description: document.getElementById('edit-dessert-desc').value.trim(),
      bringing_drink:      document.getElementById('edit-bringing-drink').checked,
      drink_description: document.getElementById('edit-drink-desc').value.trim(),
      cleaning_up:       document.getElementById('edit-cleaning-up').checked,
    };

    const res = await fetch(`/api/signups/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const data = await res.json();
      errEl.textContent = data.error;
      errEl.style.display = 'block';
      return;
    }

    closeModal('modal-edit');
    await loadSignups();
  });
}

function openEditModal(id) {
  const s = currentSignups.find(s => s.id === id);
  if (!s) return;

  document.getElementById('edit-id').value              = s.id;
  document.getElementById('edit-name').value            = s.name;
  document.getElementById('edit-bringing-meal').checked = !!s.bringing_meal;
  document.getElementById('edit-meal-desc').value       = s.meal_description  || '';
  document.getElementById('edit-bringing-sides').checked   = !!s.bringing_sides;
  document.getElementById('edit-sides-desc').value         = s.sides_description   || '';
  document.getElementById('edit-bringing-dessert').checked = !!s.bringing_dessert;
  document.getElementById('edit-dessert-desc').value       = s.dessert_description || '';
  document.getElementById('edit-bringing-drink').checked   = !!s.bringing_drink;
  document.getElementById('edit-drink-desc').value      = s.drink_description || '';
  document.getElementById('edit-cleaning-up').checked   = !!s.cleaning_up;

  document.getElementById('edit-meal-detail').classList.toggle('visible', !!s.bringing_meal);
  document.getElementById('edit-sides-detail').classList.toggle('visible', !!s.bringing_sides);
  document.getElementById('edit-dessert-detail').classList.toggle('visible', !!s.bringing_dessert);
  document.getElementById('edit-drink-detail').classList.toggle('visible', !!s.bringing_drink);
  document.getElementById('edit-error').style.display = 'none';

  openModal('modal-edit');
}

async function deleteSignup(id) {
  const res = await fetch(`/api/signups/${id}`, {
    method: 'DELETE',
    headers: { 'X-Admin-Password': adminPassword },
  });
  if (res.ok) await loadSignups();
  else { const d = await res.json(); alert(d.error); }
}

// ── Admin ──
function setupAdminListeners() {
  document.getElementById('btn-admin').addEventListener('click', async () => {
    if (adminPassword) {
      renderAdminEventsList();
      openModal('modal-admin-panel');
    } else {
      document.getElementById('admin-pw').value = '';
      document.getElementById('admin-login-error').style.display = 'none';
      openModal('modal-admin-login');
    }
  });

  document.getElementById('btn-admin-submit').addEventListener('click', async () => {
    const pw    = document.getElementById('admin-pw').value;
    const errEl = document.getElementById('admin-login-error');
    errEl.style.display = 'none';

    const res = await fetch('/api/admin/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pw }),
    });

    if (!res.ok) {
      errEl.textContent = 'Incorrect password.';
      errEl.style.display = 'block';
      return;
    }

    adminPassword = pw;
    sessionStorage.setItem('adminPassword', pw);
    closeModal('modal-admin-login');
    updateAdminUI();
    renderSignups();
    renderAdminEventsList();
    openModal('modal-admin-panel');
  });

  document.getElementById('admin-pw').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('btn-admin-submit').click();
  });

  document.getElementById('btn-logout').addEventListener('click', () => {
    adminPassword = null;
    sessionStorage.removeItem('adminPassword');
    closeModal('modal-admin-panel');
    updateAdminUI();
    renderSignups();
  });

  // Event create / edit form
  document.getElementById('event-form').addEventListener('submit', async e => {
    e.preventDefault();
    const evId    = document.getElementById('ev-id').value;
    const isEdit  = !!evId;
    const errEl   = document.getElementById('ev-form-error');
    errEl.style.display = 'none';

    const body = {
      name:           document.getElementById('ev-name').value.trim(),
      event_date:     document.getElementById('ev-date').value  || null,
      meal_target:    parseInt(document.getElementById('ev-meal').value)     || 0,
      sides_target:   parseInt(document.getElementById('ev-sides').value)    || 0,
      dessert_target: parseInt(document.getElementById('ev-desserts').value) || 0,
      drink_target:   parseInt(document.getElementById('ev-drinks').value)   || 0,
      cleanup_target: parseInt(document.getElementById('ev-cleanup').value)  || 0,
    };

    const res = await fetch(isEdit ? `/api/events/${evId}` : '/api/events', {
      method: isEdit ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Admin-Password': adminPassword },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const data = await res.json();
      errEl.textContent = data.error;
      errEl.style.display = 'block';
      return;
    }

    const saved = await res.json();
    resetEventForm();
    await loadEvents();

    if (isEdit) {
      if (currentEvent?.id === saved.id) {
        currentEvent = allEvents.find(e => e.id === saved.id);
        renderProgress();
      }
    } else {
      await selectEvent(saved.id);
    }
    renderAdminEventsList();
  });

  document.getElementById('btn-ev-cancel').addEventListener('click', resetEventForm);

  // Delegated clicks inside admin events list
  document.getElementById('admin-events-list').addEventListener('click', async e => {
    const editBtn = e.target.closest('[data-edit-ev]');
    const delBtn  = e.target.closest('[data-del-ev]');

    if (editBtn) {
      const ev = allEvents.find(x => x.id === parseInt(editBtn.dataset.editEv));
      if (!ev) return;
      document.getElementById('ev-id').value     = ev.id;
      document.getElementById('ev-name').value   = ev.name;
      document.getElementById('ev-date').value   = ev.event_date || '';
      document.getElementById('ev-meal').value   = ev.meal_target;
      document.getElementById('ev-sides').value    = ev.sides_target;
      document.getElementById('ev-desserts').value = ev.dessert_target;
      document.getElementById('ev-drinks').value   = ev.drink_target;
      document.getElementById('ev-cleanup').value = ev.cleanup_target;
      document.getElementById('ev-form-title').textContent = 'Edit Event';
      document.getElementById('btn-ev-cancel').style.display = 'inline-block';
      document.getElementById('ev-name').focus();
      document.getElementById('modal-admin-panel').scrollTop = 0;
    }

    if (delBtn) {
      const evId = parseInt(delBtn.dataset.delEv);
      const res = await fetch(`/api/events/${evId}`, {
        method: 'DELETE',
        headers: { 'X-Admin-Password': adminPassword },
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error);
      } else {
        if (currentEvent?.id === evId) currentEvent = null;
        await loadEvents();
        if (!currentEvent && allEvents.length) await selectEvent(allEvents[0].id);
        renderAdminEventsList();
      }
    }
  });

  // Print
  document.getElementById('btn-print').addEventListener('click', printView);
}

function updateAdminUI() {
  const btn = document.getElementById('btn-admin');
  if (adminPassword) {
    btn.textContent = '&#9965; Admin ✓';
    btn.classList.add('admin-active');
  } else {
    btn.innerHTML = '&#9965; Admin';
    btn.classList.remove('admin-active');
  }
}

function renderAdminEventsList() {
  const container = document.getElementById('admin-events-list');
  if (!allEvents.length) {
    container.innerHTML = '<p style="color:#999;font-style:italic;font-size:0.9rem;">No events yet.</p>';
    return;
  }
  container.innerHTML = allEvents.map(ev => `
    <div class="admin-event-row">
      <div class="admin-event-info">
        <strong>${escHtml(ev.name)}</strong>
        <span class="admin-event-meta">
          ${ev.event_date ? fmtShortDate(ev.event_date) + ' &nbsp;|&nbsp; ' : ''}
          Goals: ${ev.meal_target} meals / ${ev.sides_target} sides / ${ev.dessert_target} desserts / ${ev.drink_target} drinks / ${ev.cleanup_target} clean-up
        </span>
      </div>
      <div class="admin-event-btns">
        <button class="btn-sm" data-edit-ev="${ev.id}">Edit</button>
        <button class="btn-sm btn-danger" data-del-ev="${ev.id}">Delete</button>
      </div>
    </div>
  `).join('');
}

function resetEventForm() {
  document.getElementById('ev-id').value      = '';
  document.getElementById('ev-name').value    = '';
  document.getElementById('ev-date').value    = '';
  document.getElementById('ev-meal').value    = '0';
  document.getElementById('ev-sides').value    = '0';
  document.getElementById('ev-desserts').value = '0';
  document.getElementById('ev-drinks').value   = '0';
  document.getElementById('ev-cleanup').value = '0';
  document.getElementById('ev-form-title').textContent  = 'Create New Event';
  document.getElementById('btn-ev-cancel').style.display = 'none';
  document.getElementById('ev-form-error').style.display = 'none';
}

// ── Print ──
function printView() {
  if (!currentEvent) return;
  const ev  = currentEvent;
  const sgs = currentSignups;

  const meals    = sgs.filter(s => s.bringing_meal);
  const sides    = sgs.filter(s => s.bringing_sides);
  const desserts = sgs.filter(s => s.bringing_dessert);
  const drinks   = sgs.filter(s => s.bringing_drink);
  const cleanup  = sgs.filter(s => s.cleaning_up);

  const html = `<!DOCTYPE html><html><head>
<meta charset="UTF-8">
<title>Sign-Up Sheet — ${escHtml(ev.name)}</title>
<style>
  body { font-family: Georgia, serif; max-width: 700px; margin: 40px auto; color: #1a0f05; }
  h1 { color: #6b1a1a; font-size: 1.8rem; margin-bottom: 0.2rem; }
  .meta { color: #888; font-style: italic; margin-bottom: 1.5rem; font-size: 0.95rem; }
  .progress { display: flex; gap: 2.5rem; margin-bottom: 2rem; flex-wrap: wrap; border: 1px solid #eee; padding: 1rem 1.5rem; border-radius: 4px; background: #fafaf7; }
  .prog-item { text-align: center; }
  .prog-num { font-size: 2rem; font-weight: bold; color: #6b1a1a; line-height: 1; }
  .prog-lbl { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.06em; color: #999; margin-top: 0.2rem; }
  .prog-tgt { font-size: 0.8rem; color: #bbb; }
  h2 { color: #6b1a1a; border-bottom: 1px solid #ddd; padding-bottom: 0.3rem; margin-top: 1.75rem; font-size: 1.1rem; }
  table { width: 100%; border-collapse: collapse; margin-top: 0.5rem; }
  th { text-align: left; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.06em; color: #aaa; padding: 0.35rem 0.5rem; border-bottom: 2px solid #eee; }
  td { padding: 0.45rem 0.5rem; border-bottom: 1px solid #f0ede5; font-size: 0.95rem; }
  tr:last-child td { border-bottom: none; }
  .none { color: #bbb; font-style: italic; font-size: 0.9rem; margin-top: 0.4rem; }
  footer { margin-top: 3rem; text-align: center; color: #ccc; font-style: italic; font-size: 0.88rem; }
</style>
</head><body>
<h1>&#9768; ${escHtml(ev.name)}</h1>
<p class="meta">${ev.event_date ? 'Date: ' + fmtShortDate(ev.event_date) + ' &nbsp;&bull;&nbsp; ' : ''}Total sign-ups: ${sgs.length}</p>
<div class="progress">
  ${printProgItem(meals.length, ev.meal_target, 'Main Dishes')}
  ${printProgItem(sides.length, ev.sides_target, 'Sides')}
  ${printProgItem(desserts.length, ev.dessert_target, 'Desserts')}
  ${printProgItem(drinks.length, ev.drink_target, 'Beverages')}
  ${printProgItem(cleanup.length, ev.cleanup_target, 'Clean-Up')}
</div>
${printTable('&#127859; Main Dishes', meals, 'meal_description')}
${printTable('&#127793; Sides / Salads', sides, 'sides_description')}
${printTable('&#127856; Desserts', desserts, 'dessert_description')}
${printTable('&#127863; Beverages', drinks, 'drink_description')}
${printTable('&#10024; Clean-Up Volunteers', cleanup, null)}
<footer>&#9768; Glory to God for all things &#9768;</footer>
</body></html>`;

  const win = window.open('', '_blank');
  win.document.write(html);
  win.document.close();
  win.print();
}

function printProgItem(count, target, label) {
  return `<div class="prog-item">
    <div class="prog-num">${count}</div>
    <div class="prog-lbl">${label}</div>
    ${target ? `<div class="prog-tgt">of ${target}</div>` : ''}
  </div>`;
}

function printTable(title, items, descField) {
  if (!items.length) return `<h2>${title}</h2><p class="none">None signed up yet.</p>`;
  const rows = items.map(s => `
    <tr>
      <td>${escHtml(s.name)}</td>
      <td>${descField && s[descField] ? escHtml(s[descField]) : '<span style="color:#bbb">—</span>'}</td>
    </tr>`).join('');
  return `<h2>${title}</h2>
<table><thead><tr><th>Name</th><th>${descField ? 'What they\'re bringing' : ''}</th></tr></thead>
<tbody>${rows}</tbody></table>`;
}

// ── Modal Helpers ──
function openModal(id)  { document.getElementById(id).style.display = 'flex'; }
function closeModal(id) { document.getElementById(id).style.display = 'none'; }

function setupModalClose() {
  document.querySelectorAll('[data-close]').forEach(btn => {
    btn.addEventListener('click', () => closeModal(btn.dataset.close));
  });
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => {
      if (e.target === overlay) closeModal(overlay.id);
    });
  });
}

// ── Toggle Field Helper ──
function wireToggle(cbId, detailId) {
  document.getElementById(cbId).addEventListener('change', function () {
    document.getElementById(detailId).classList.toggle('visible', this.checked);
    if (!this.checked) document.getElementById(detailId).querySelector('input').value = '';
  });
}

function setupToggleFields() {
  // wired individually in setupFormListeners and setupEditModalListeners
}

// ── Utilities ──
function escHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function fmtShortDate(str) {
  if (!str) return '';
  const parts = String(str).split(/[ T]/)[0].split('-');
  if (parts.length < 3) return str;
  const d = new Date(+parts[0], +parts[1] - 1, +parts[2]);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

init();
