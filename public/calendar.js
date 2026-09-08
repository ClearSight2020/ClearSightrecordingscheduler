/* Shared helpers for both the booking page and the admin page. */

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/* The season this page covers. Change these to run a different stretch. */
const MONTHS = [
  { y: 2026, m: 8 },
  { y: 2026, m: 9 },
  { y: 2026, m: 10 },
  { y: 2026, m: 11 },
];

const pad = (n) => String(n).padStart(2, '0');
const dateKey = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;

function fmt12(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h >= 12 ? 'pm' : 'am';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${pad(m)} ${suffix}`;
}

function longDate(key) {
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return `${DOW[dt.getDay()]}, ${MONTH_NAMES[m - 1]} ${d}`;
}

function todayKey() {
  const n = new Date();
  return dateKey(n.getFullYear(), n.getMonth(), n.getDate());
}

function officeName(loc) {
  return loc === 'Plano' ? 'Plano office' : 'Oklahoma City office';
}

function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/*
 * Renders four month cards into `mount`.
 * getState(key) returns { day, className, tag, disabled } for each date.
 */
function renderMonths(mount, getState, onPick) {
  clear(mount);
  MONTHS.forEach(({ y, m }) => {
    const card = el('div', 'card');
    card.append(el('h2', 'month-name', `${MONTH_NAMES[m]} ${y}`));

    const dowRow = el('div', 'dow');
    DOW.forEach((d) => dowRow.append(el('span', null, d)));
    card.append(dowRow);

    const gridEl = el('div', 'days');
    const firstDow = new Date(y, m, 1).getDay();
    const count = new Date(y, m + 1, 0).getDate();

    for (let i = 0; i < firstDow; i++) {
      const blank = el('button', 'day blank');
      blank.tabIndex = -1;
      blank.setAttribute('aria-hidden', 'true');
      gridEl.append(blank);
    }

    for (let d = 1; d <= count; d++) {
      const key = dateKey(y, m, d);
      const state = getState(key) || {};
      const btn = el('button', `day ${state.className || ''}`.trim());
      btn.append(el('span', null, String(d)));
      if (state.tag) btn.append(el('span', 'tag', state.tag));
      btn.disabled = !!state.disabled;
      btn.setAttribute('aria-label', state.label || `${MONTH_NAMES[m]} ${d}`);
      if (!state.disabled) btn.addEventListener('click', () => onPick(key));
      gridEl.append(btn);
    }

    card.append(gridEl);
    mount.append(card);
  });
}
