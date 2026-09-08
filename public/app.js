(function () {
  const monthsEl = document.getElementById('months');
  const panelEl = document.getElementById('panel');

  let schedule = { recordMins: 30, gapMins: 10, days: [] };
  let byDate = new Map();
  let selected = null;
  let pending = null;
  let confirmed = null;
  let error = '';
  let saving = false;

  const today = todayKey();

  async function load() {
    try {
      const res = await fetch('/api/schedule');
      if (!res.ok) throw new Error('bad response');
      schedule = await res.json();
      byDate = new Map(schedule.days.map((d) => [d.date, d]));
      draw();
    } catch (e) {
      clear(panelEl);
      const card = el('div', 'card');
      card.append(el('p', 'err', "The schedule didn't load. Refresh the page to try again."));
      panelEl.append(card);
    }
  }

  function dayState(key) {
    const day = byDate.get(key);
    if (!day) {
      return { className: '', disabled: true, label: 'Not a recording day' };
    }
    const isPlano = day.location === 'Plano';
    const base = isPlano ? 'plano ' : '';
    if (selected === key) {
      return {
        className: `${base}sel`,
        tag: day.location,
        label: `${longDate(key)}, ${day.location}, selected`,
      };
    }
    if (key < today) {
      return { className: 'past', tag: day.location, disabled: true, label: `${longDate(key)}, past` };
    }
    if (day.open === 0) {
      return { className: 'full', tag: 'full', disabled: true, label: `${longDate(key)}, fully booked` };
    }
    return {
      className: `${base}open`,
      tag: day.location,
      label: `${longDate(key)}, ${day.location}, ${day.open} open times`,
    };
  }

  function pickDay(key) {
    selected = key;
    pending = null;
    confirmed = null;
    error = '';
    draw();
    if (window.innerWidth < 900) {
      setTimeout(() => panelEl.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
    }
  }

  async function book() {
    const first = document.getElementById('first').value;
    const last = document.getElementById('last').value;
    if (!first.trim() || !last.trim()) {
      error = 'Enter a first and last name.';
      draw();
      return;
    }
    saving = true;
    error = '';
    draw();
    try {
      const res = await fetch('/api/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: selected, time: pending, firstName: first, lastName: last }),
      });
      const body = await res.json();
      if (!res.ok) {
        error = body.error || "That didn't save. Try again.";
        saving = false;
        if (res.status === 409) {
          pending = null;
          await load();
          return;
        }
        draw();
        return;
      }
      confirmed = body;
      pending = null;
      selected = null;
      saving = false;
      await load();
    } catch (e) {
      error = "That didn't save. Check your connection and try again.";
      saving = false;
      draw();
    }
  }

  function drawPanel() {
    clear(panelEl);

    if (confirmed) {
      const box = el('div', 'confirm');
      box.append(el('h2', null, "You're booked"));
      box.append(
        el(
          'p',
          null,
          `${confirmed.firstName} ${confirmed.lastName} — ${longDate(confirmed.date)} at ` +
            `${fmt12(confirmed.time)}, ${officeName(confirmed.location)}.`
        )
      );
      box.append(
        el(
          'p',
          'note',
          "Come about 10 minutes early. We'll get you mic'd up and settled before recording starts."
        )
      );
      const again = el('button', 'btn small ghost', 'Book another time');
      again.addEventListener('click', () => {
        confirmed = null;
        draw();
      });
      box.append(again);
      panelEl.append(box);
      return;
    }

    const card = el('div', 'card');

    if (!selected) {
      card.append(
        el('p', 'empty', 'The highlighted dates are recording days. Choose one to see open times.')
      );
      panelEl.append(card);
      return;
    }

    const day = byDate.get(selected);
    card.append(el('h2', 'panel-date', longDate(selected)));
    card.append(
      el('p', 'panel-meta', `${officeName(day.location)} · ${schedule.recordMins} minutes on camera`)
    );

    const slotsEl = el('div', 'slots');
    day.slots.forEach((s) => {
      const btn = el('button', `slot${s.taken ? ' taken' : ''}${pending === s.time ? ' picked' : ''}`);
      btn.append(document.createTextNode(fmt12(s.time)));
      if (s.taken) btn.append(el('small', null, 'Taken'));
      btn.disabled = s.taken;
      btn.addEventListener('click', () => {
        pending = s.time;
        error = '';
        draw();
        const el0 = document.getElementById('first');
        if (el0) el0.focus();
      });
      slotsEl.append(btn);
    });
    card.append(slotsEl);

    if (pending) {
      const form = el('div', 'form');
      const heading = el('p', null, `${fmt12(pending)} — who's recording?`);
      heading.style.fontWeight = '600';
      heading.style.margin = '0 0 10px';
      form.append(heading);

      [
        { id: 'first', label: 'First name', auto: 'given-name' },
        { id: 'last', label: 'Last name', auto: 'family-name' },
      ].forEach(({ id, label, auto }) => {
        const field = el('div', 'field');
        const lab = el('label', null, label);
        lab.setAttribute('for', id);
        const input = el('input', 'input');
        input.id = id;
        input.autocomplete = auto;
        input.maxLength = 60;
        input.addEventListener('keydown', (ev) => {
          if (ev.key === 'Enter') book();
        });
        field.append(lab, input);
        form.append(field);
      });

      if (error) form.append(el('p', 'err', error));

      const actions = el('div');
      actions.style.display = 'flex';
      actions.style.gap = '8px';
      actions.style.marginTop = '10px';

      const submit = el('button', 'btn', saving ? 'Booking…' : 'Book this time');
      submit.disabled = saving;
      submit.addEventListener('click', book);

      const cancel = el('button', 'btn ghost', 'Cancel');
      cancel.addEventListener('click', () => {
        pending = null;
        error = '';
        draw();
      });

      actions.append(submit, cancel);
      form.append(actions);
      card.append(form);
    } else if (error) {
      card.append(el('p', 'err', error));
    }

    panelEl.append(card);
  }

  function draw() {
    renderMonths(monthsEl, dayState, pickDay);
    drawPanel();
  }

  draw();
  load();
})();
