const form = document.getElementById('signup-form');
const signupsList = document.getElementById('signups-list');
const formError = document.getElementById('form-error');

const counts = {
  meals:   document.getElementById('count-meals'),
  sides:   document.getElementById('count-sides'),
  drinks:  document.getElementById('count-drinks'),
  cleanup: document.getElementById('count-cleanup'),
};

// Toggle detail fields when checkboxes change
[
  ['bringing_meal',  'meal-detail'],
  ['bringing_sides', 'sides-detail'],
  ['bringing_drink', 'drink-detail'],
].forEach(([checkId, detailId]) => {
  const checkbox = document.getElementById(checkId);
  const detail   = document.getElementById(detailId);
  checkbox.addEventListener('change', () => {
    detail.classList.toggle('visible', checkbox.checked);
    if (!checkbox.checked) detail.querySelector('input').value = '';
  });
});

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function buildEntry(signup) {
  const div = document.createElement('div');
  div.className = 'signup-entry';
  div.dataset.id = signup.id;

  const tags = [];
  if (signup.bringing_meal) {
    const desc = signup.meal_description ? ` — ${signup.meal_description}` : '';
    tags.push(`<span class="contrib-tag">🍽 Meal${desc}</span>`);
  }
  if (signup.bringing_sides) {
    const desc = signup.sides_description ? ` — ${signup.sides_description}` : '';
    tags.push(`<span class="contrib-tag">🌿 Sides${desc}</span>`);
  }
  if (signup.bringing_drink) {
    const desc = signup.drink_description ? ` — ${signup.drink_description}` : '';
    tags.push(`<span class="contrib-tag">🍷 Drink${desc}</span>`);
  }
  if (signup.cleaning_up) {
    tags.push(`<span class="contrib-tag cleanup">✨ Clean-Up</span>`);
  }
  if (!tags.length) {
    tags.push(`<span class="contrib-tag no-contrib">Attending</span>`);
  }

  div.innerHTML = `
    <div style="flex:1; min-width:0;">
      <div class="signup-name">${escHtml(signup.name)}</div>
      <div class="signup-contributions">${tags.join('')}</div>
    </div>
    <div style="display:flex; align-items:center; gap:0.5rem; flex-shrink:0;">
      <span class="signup-date">${formatDate(signup.created_at)}</span>
      <button class="btn-remove" title="Remove" data-id="${signup.id}">&#10005;</button>
    </div>
  `;
  return div;
}

function escHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function renderSignups(signups) {
  signupsList.innerHTML = '';
  if (!signups.length) {
    signupsList.innerHTML = '<div class="empty-state">No sign-ups yet. Be the first!</div>';
  } else {
    signups.forEach(s => signupsList.appendChild(buildEntry(s)));
  }
  counts.meals.textContent   = signups.filter(s => s.bringing_meal).length;
  counts.sides.textContent   = signups.filter(s => s.bringing_sides).length;
  counts.drinks.textContent  = signups.filter(s => s.bringing_drink).length;
  counts.cleanup.textContent = signups.filter(s => s.cleaning_up).length;
}

async function loadSignups() {
  try {
    const res = await fetch('/api/signups');
    const data = await res.json();
    renderSignups(data);
  } catch {
    signupsList.innerHTML = '<div class="empty-state">Could not load sign-ups.</div>';
  }
}

signupsList.addEventListener('click', async (e) => {
  const btn = e.target.closest('.btn-remove');
  if (!btn) return;
  const id = btn.dataset.id;
  await fetch(`/api/signups/${id}`, { method: 'DELETE' });
  loadSignups();
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  formError.style.display = 'none';

  const body = {
    name:              document.getElementById('name').value.trim(),
    bringing_meal:     document.getElementById('bringing_meal').checked,
    meal_description:  document.getElementById('meal_description').value.trim(),
    bringing_sides:    document.getElementById('bringing_sides').checked,
    sides_description: document.getElementById('sides_description').value.trim(),
    bringing_drink:    document.getElementById('bringing_drink').checked,
    drink_description: document.getElementById('drink_description').value.trim(),
    cleaning_up:       document.getElementById('cleaning_up').checked,
  };

  if (!body.name) {
    formError.textContent = 'Please enter your name.';
    formError.style.display = 'block';
    return;
  }

  try {
    const res = await fetch('/api/signups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.json();
      formError.textContent = err.error || 'Something went wrong.';
      formError.style.display = 'block';
      return;
    }

    form.reset();
    // Hide all detail fields after reset
    document.querySelectorAll('.detail-field').forEach(d => d.classList.remove('visible'));
    loadSignups();
  } catch {
    formError.textContent = 'Could not connect to server.';
    formError.style.display = 'block';
  }
});

loadSignups();
