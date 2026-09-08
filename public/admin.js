(function () {
  const root = document.getElementById('root');

  let signedIn = false;
  let schedule = { recordMins: 30, gapMins: 10, locations: ['OKC', 'Plano'], days: [] };
  let byDate = new Map();
  let selected = null;
  let error = '';
  let loginError = '';

  async function api(url, options) {
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
    let body = null;
    try {
      body = await res.json();
    } catch (e) {
      body = {};
    }
    if (res.status === 401) {
      signedIn = false;
      draw();
      throw new Error('signed out');
    }
    if (!res.ok) throw new Error(body.error || 'Something went wrong.');
    return body;
  }

  async function loadSchedule() {
    schedule = await api('/api/admin/schedule');
    byDate = new Map(schedule.days.map((d) => [d.date, d]));
  }

  async function boot() {
    try {
      const s = await fetch('/api/admin/session').then((r) => r.json());
      signedIn = !!s.signedIn;
      if (signedIn) await loadSchedule();
    } catch (e) {
      signedIn = false;
    }
    draw();
  }

  /* ------------------------------ actions ----------------------------- */

  async function signIn(password) {
    try {
      await api('/api/admin/login', { method: 'POST', body: JSON.stringify({ password }) });
      signedIn = true;
      loginError = '';
      await loadSchedule();
    } catch (e) {
      loginError = e.message;
    }
    draw();
  }

  async function signOut() {
    await fetch('/api/admin/logout', { method: 'POST' });
    signedIn = false;
    selected = null;
    draw();
  }

  async function run(fn) {
    try {
      error = '';
      await fn();
      await loadSchedule();
    } catch (e) {
      if (e.message !== 'signed out') error = e.message;
    }
    draw();
  }

  const addDay = (date) =>
    run(() =>
      api(`/api/admin/days/${date}`, {
        method: 'PUT',
        body: JSON.stringify({ start: '09:00', end: '11:00', location: 'OKC' }),
      })
    );

  const updateDay = (date, patch) => {
    const day = byDate.get(date);
    return run(() =>
      api(`/api/admin/days/${date}`, {
        method: 'PUT',
        body: JSON.stringify({
          start: day.start,
          end: day.end,
          location: day.location,
          ...patch,
        }),
      })
    );
  };

  const removeDay = (date) =>
    run(async () => {
      await api(`/api/admin/days/${date}`, { method: 'DELETE' });
      if (selected === date) selected = null;
    });

  const removeBooking = (id) => run(() => api(`/api/admin/bookings/${id}`, { method: 'DELETE' }));

  const saveTiming = (recordMins, gapMins) =>
    run(() =>
      api('/api/admin/settings', {
        method: 'PUT',
        body: JSON.stringify({ recordMins, gapMins }),
      })
    );

  /* ------------------------------ drawing ----------------------------- */

  function drawLogin() {
    clear(root);
    const card = el('div', 'card gate');
    const mark = el('img', 'logo centered');
    mark.src = '/img/logo.png';
    mark.alt = 'ClearSight LASIK & Lens';
    card.append(mark);
    card.append(el('h1', null, 'Staff sign in'));
    card.append(el('p', 'note', 'This page shows who is booked for each recording session.'));

    const field = el('div', 'field');
    field.style.marginTop = '14px';
    const lab = el('label', null, 'Password');
    lab.setAttribute('for', 'pw');
    const input = el('input', 'input');
    input.id = 'pw';
    input.type = 'password';
    input.autocomplete = 'current-password';
    input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') signIn(input.value);
    });
    field.append(lab, input);
    card.append(field);

    if (loginError) card.append(el('p', 'err', loginError));

    const btn = el('button', 'btn', 'Sign in');
    btn.style.marginTop = '8px';
    btn.addEventListener('click', () => signIn(input.value));
    card.append(btn);

    root.append(card);
    input.focus();
  }

  function dayState(key) {
    const day = byDate.get(key);
    if (!day) return { className: 'pick', label: `${key}, not a recording day` };
    const isPlano = day.location === 'Plano';
    const base = isPlano ? 'plano ' : '';
    const booked = day.slots.filter((s) => s.taken).length;
    if (selected === key) return { className: `${base}sel`, tag: day.location };
    return {
      className: `${base}open`,
      tag: day.location,
      label: `${longDate(key)}, ${day.location}, ${booked} booked`,
    };
  }

  function togglePick(key) {
    if (!byDate.has(key)) {
      selected = key;
      addDay(key);
      return;
    }
    selected = selected === key ? null : key;
    draw();
  }

  function drawBar() {
    const bar = el('div', 'bar');
    bar.append(el('h2', null, 'Recording schedule'));

    const totalSlots = schedule.days.reduce((n, d) => n + d.slots.length, 0);
    const booked = schedule.days.reduce((n, d) => n + d.slots.filter((s) => s.taken).length, 0);
    const stat = el('div', 'stat');
    stat.innerHTML = '';
    stat.append(
      document.createTextNode('Click a date to add a recording day. '),
      Object.assign(el('b', null, String(schedule.days.length)), {}),
      document.createTextNode(' days · '),
      el('b', null, String(booked)),
      document.createTextNode(' of '),
      el('b', null, String(totalSlots)),
      document.createTextNode(' slots booked')
    );
    bar.append(stat);

    const right = el('div', 'spacer');
    right.style.display = 'flex';
    right.style.gap = '10px';
    right.style.alignItems = 'flex-end';
    right.style.flexWrap = 'wrap';

    const mk = (id, label, value, min, max) => {
      const box = el('div');
      const lab = el('label', null, label);
      lab.setAttribute('for', id);
      const input = el('input', 'input');
      input.id = id;
      input.type = 'number';
      input.value = String(value);
      input.min = String(min);
      input.max = String(max);
      input.step = '5';
      input.style.width = '76px';
      box.append(lab, input);
      right.append(box);
      return input;
    };

    const rec = mk('rec', 'Recording (min)', schedule.recordMins, 5, 180);
    const gap = mk('gap', 'Setup gap (min)', schedule.gapMins, 0, 120);

    const apply = el('button', 'btn small ghost', 'Save timing');
    apply.addEventListener('click', () => saveTiming(Number(rec.value), Number(gap.value)));

    const exportBtn = el('button', 'btn small ghost', 'Download list');
    exportBtn.addEventListener('click', () => {
      window.location.href = '/api/admin/export.csv';
    });

    const out = el('button', 'btn small ghost', 'Sign out');
    out.addEventListener('click', signOut);

    right.append(apply, exportBtn, out);
    bar.append(right);
    return bar;
  }

  function drawPanel() {
    const panel = el('div', 'panel');

    if (!selected || !byDate.has(selected)) {
      const card = el('div', 'card');
      card.append(el('p', 'empty', 'Pick a date to set its hours and see who is booked.'));
      panel.append(card);
      return panel;
    }

    const day = byDate.get(selected);
    const card = el('div', 'card');
    card.append(el('h2', 'panel-date', longDate(selected)));
    card.append(
      el('p', 'panel-meta', `${day.slots.length} slots · ${day.slots.filter((s) => s.taken).length} booked`)
    );

    const controls = el('div');
    controls.style.display = 'flex';
    controls.style.gap = '10px';
    controls.style.flexWrap = 'wrap';
    controls.style.marginBottom = '14px';

    const timeField = (id, label, value, onChange) => {
      const box = el('div');
      const lab = el('label', 'note', label);
      lab.setAttribute('for', id);
      const input = el('input', 'input');
      input.id = id;
      input.type = 'time';
      input.value = value;
      input.style.width = 'auto';
      input.addEventListener('change', () => onChange(input.value));
      box.append(lab, input);
      return box;
    };

    controls.append(
      timeField('start', 'Start', day.start, (v) => updateDay(selected, { start: v })),
      timeField('end', 'End', day.end, (v) => updateDay(selected, { end: v }))
    );

    const locBox = el('div');
    const locLab = el('label', 'note', 'Location');
    locLab.setAttribute('for', 'loc');
    const locSel = el('select', 'input');
    locSel.id = 'loc';
    locSel.style.width = 'auto';
    schedule.locations.forEach((l) => {
      const opt = el('option', null, l);
      opt.value = l;
      if (l === day.location) opt.selected = true;
      locSel.append(opt);
    });
    locSel.addEventListener('change', () => updateDay(selected, { location: locSel.value }));
    locBox.append(locLab, locSel);
    controls.append(locBox);

    card.append(controls);

    const slots = el('div', 'slots');
    day.slots.forEach((s) => {
      const btn = el('button', `slot${s.taken ? ' taken' : ''}`);
      btn.append(document.createTextNode(fmt12(s.time)));
      btn.append(el('small', null, s.taken ? s.name : 'Open'));
      btn.disabled = true;
      slots.append(btn);
    });
    card.append(slots);

    if (error) card.append(el('p', 'err', error));

    const roster = el('div', 'roster');
    const heading = el('p', null, 'Booked this day');
    heading.style.fontWeight = '600';
    heading.style.fontSize = '0.9rem';
    heading.style.margin = '0 0 6px';
    roster.append(heading);

    const taken = day.slots.filter((s) => s.taken);
    if (taken.length === 0) {
      roster.append(el('p', 'empty', 'Nobody yet.'));
    } else {
      taken.forEach((s) => {
        const row = el('div', 'row');
        row.append(el('div', null, `${fmt12(s.time)} — ${s.name}`));
        const rm = el('button', 'linkbtn', 'Remove');
        rm.addEventListener('click', () => removeBooking(s.bookingId));
        row.append(rm);
        roster.append(row);
      });
    }
    card.append(roster);

    const del = el('button', 'btn small ghost', 'Remove this recording day');
    del.style.marginTop = '14px';
    del.addEventListener('click', () => removeDay(selected));
    card.append(del);

    panel.append(card);
    return panel;
  }

  function draw() {
    if (!signedIn) return drawLogin();

    clear(root);
    root.append(drawBar());

    const grid = el('div', 'grid');
    const left = el('div');
    const months = el('div', 'months');
    left.append(months);

    const legend = el('div', 'legend');
    legend.append(
      keyItem('var(--brand-wash)', 'Oklahoma City'),
      keyItem('var(--amber-wash)', 'Plano')
    );
    left.append(legend);

    grid.append(left, drawPanel());
    root.append(grid);

    renderMonths(months, dayState, togglePick);
  }

  function keyItem(color, label) {
    const span = el('span', 'key');
    const sw = el('i', 'swatch');
    sw.style.background = color;
    span.append(sw, document.createTextNode(' ' + label));
    return span;
  }

  boot();
})();
