'use strict';

require('dotenv').config();

const path = require('path');
const crypto = require('crypto');
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');

const { q, getSettings, saveSettings, seedDaysIfEmpty, DB_PATH } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const LOCATIONS = ['OKC', 'Plano'];

/* --------------------------- required config -------------------------- */

const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH;
const SESSION_SECRET = process.env.SESSION_SECRET;

if (!ADMIN_PASSWORD_HASH || !SESSION_SECRET) {
  console.error(
    '\nMissing configuration.\n' +
      'Set ADMIN_PASSWORD_HASH and SESSION_SECRET before starting.\n' +
      'Run `node seed.js --password "your-password"` to generate both.\n'
  );
  process.exit(1);
}

/* ------------------------------ middleware ---------------------------- */

app.set('trust proxy', 1);
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
  })
);
app.use(express.json({ limit: '10kb' }));
app.use(cookieParser());

/* ------------------------------- sessions ----------------------------- */
/* Signed, httpOnly cookie. No server-side store needed for a single admin. */

const SESSION_HOURS = 8;

function makeToken() {
  const expires = Date.now() + SESSION_HOURS * 60 * 60 * 1000;
  const payload = `admin.${expires}`;
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

function validToken(token) {
  if (!token || typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  const [role, expires, sig] = parts;
  const expected = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(`${role}.${expires}`)
    .digest('hex');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  return Number(expires) > Date.now();
}

function requireAdmin(req, res, next) {
  if (validToken(req.cookies.cs_admin)) return next();
  return res.status(401).json({ error: 'Sign in to continue.' });
}

const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  maxAge: SESSION_HOURS * 60 * 60 * 1000,
  path: '/',
};

/* ------------------------------ slot math ----------------------------- */

const pad = (n) => String(n).padStart(2, '0');
const toMin = (hhmm) => {
  const [h, m] = String(hhmm).split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};
const toHHMM = (mins) => `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`;

function slotsForDay(day, settings) {
  const step = settings.recordMins + settings.gapMins;
  const start = toMin(day.start_at);
  const end = toMin(day.end_at);
  const out = [];
  for (let t = start; t + settings.recordMins <= end; t += step) out.push(toHHMM(t));
  return out;
}

const isDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const isTime = (v) => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);

function cleanName(v) {
  if (typeof v !== 'string') return '';
  return v.replace(/\s+/g, ' ').trim().slice(0, 60);
}

/* --------------------------- public endpoints ------------------------- */

app.get('/api/schedule', (req, res) => {
  const settings = getSettings();
  const days = q.allDays.all().map((d) => {
    const taken = new Set(q.bookingsForDate.all(d.date).map((b) => b.time));
    const slots = slotsForDay(d, settings).map((t) => ({ time: t, taken: taken.has(t) }));
    return {
      date: d.date,
      start: d.start_at,
      end: d.end_at,
      location: d.location,
      slots,
      open: slots.filter((s) => !s.taken).length,
    };
  });
  res.json({ ...settings, locations: LOCATIONS, days });
});

const bookLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 12,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many booking attempts. Wait a few minutes and try again.' },
});

app.post('/api/book', bookLimiter, (req, res) => {
  const { date, time } = req.body || {};
  const firstName = cleanName(req.body?.firstName);
  const lastName = cleanName(req.body?.lastName);

  if (!isDate(date) || !isTime(time)) {
    return res.status(400).json({ error: 'Pick a date and time from the calendar.' });
  }
  if (!firstName || !lastName) {
    return res.status(400).json({ error: 'Enter a first and last name.' });
  }

  const day = q.oneDay.get(date);
  if (!day) return res.status(400).json({ error: "That day isn't a recording day." });

  const settings = getSettings();
  if (!slotsForDay(day, settings).includes(time)) {
    return res.status(400).json({ error: "That time isn't on the schedule." });
  }

  try {
    const info = q.insertBooking.run({
      date,
      time,
      firstName,
      lastName,
      createdAt: new Date().toISOString(),
    });
    return res.status(201).json({
      id: info.lastInsertRowid,
      date,
      time,
      location: day.location,
      firstName,
      lastName,
    });
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) {
      return res.status(409).json({ error: 'Someone just took that time. Choose another one.' });
    }
    console.error(err);
    return res.status(500).json({ error: "That didn't save. Try again." });
  }
});

/* ---------------------------- admin endpoints ------------------------- */

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many sign-in attempts. Wait 15 minutes.' },
});

app.post('/api/admin/login', loginLimiter, async (req, res) => {
  const password = req.body?.password;
  if (typeof password !== 'string' || password.length > 200) {
    return res.status(400).json({ error: 'Enter your password.' });
  }
  const ok = await bcrypt.compare(password, ADMIN_PASSWORD_HASH);
  if (!ok) return res.status(401).json({ error: "That password doesn't match." });
  res.cookie('cs_admin', makeToken(), cookieOptions);
  res.json({ ok: true });
});

app.post('/api/admin/logout', (req, res) => {
  res.clearCookie('cs_admin', { ...cookieOptions, maxAge: undefined });
  res.json({ ok: true });
});

app.get('/api/admin/session', (req, res) => {
  res.json({ signedIn: validToken(req.cookies.cs_admin) });
});

app.get('/api/admin/schedule', requireAdmin, (req, res) => {
  const settings = getSettings();
  const bookings = q.allBookings.all();
  const byKey = new Map(bookings.map((b) => [`${b.date} ${b.time}`, b]));
  const days = q.allDays.all().map((d) => {
    const slots = slotsForDay(d, settings).map((t) => {
      const b = byKey.get(`${d.date} ${t}`);
      return b
        ? { time: t, taken: true, bookingId: b.id, name: `${b.first_name} ${b.last_name}` }
        : { time: t, taken: false };
    });
    return {
      date: d.date,
      start: d.start_at,
      end: d.end_at,
      location: d.location,
      slots,
      open: slots.filter((s) => !s.taken).length,
    };
  });
  res.json({ ...settings, locations: LOCATIONS, days });
});

app.put('/api/admin/days/:date', requireAdmin, (req, res) => {
  const { date } = req.params;
  const { start, end, location } = req.body || {};
  if (!isDate(date) || !isTime(start) || !isTime(end)) {
    return res.status(400).json({ error: 'Check the date and times.' });
  }
  if (toMin(end) <= toMin(start)) {
    return res.status(400).json({ error: 'The end time has to come after the start time.' });
  }
  if (!LOCATIONS.includes(location)) {
    return res.status(400).json({ error: 'Pick a location.' });
  }
  q.upsertDay.run({ date, start, end, location });
  res.json({ ok: true });
});

app.delete('/api/admin/days/:date', requireAdmin, (req, res) => {
  const { date } = req.params;
  if (!isDate(date)) return res.status(400).json({ error: 'Bad date.' });
  const { n } = q.countForDate.get(date);
  if (n > 0) {
    return res
      .status(409)
      .json({ error: `${n} patient${n === 1 ? ' is' : 's are'} booked that day. Remove them first.` });
  }
  q.deleteDay.run(date);
  res.json({ ok: true });
});

app.put('/api/admin/settings', requireAdmin, (req, res) => {
  const recordMins = Number(req.body?.recordMins);
  const gapMins = Number(req.body?.gapMins);
  if (!Number.isInteger(recordMins) || recordMins < 5 || recordMins > 180) {
    return res.status(400).json({ error: 'Recording length must be between 5 and 180 minutes.' });
  }
  if (!Number.isInteger(gapMins) || gapMins < 0 || gapMins > 120) {
    return res.status(400).json({ error: 'Setup gap must be between 0 and 120 minutes.' });
  }
  res.json(saveSettings({ recordMins, gapMins }));
});

app.delete('/api/admin/bookings/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Bad booking.' });
  q.deleteBooking.run(id);
  res.json({ ok: true });
});

app.get('/api/admin/export.csv', requireAdmin, (req, res) => {
  const rows = [['Date', 'Time', 'Location', 'First name', 'Last name', 'Booked on']];
  q.allBookings.all().forEach((b) => {
    rows.push([b.date, b.time, b.location || '', b.first_name, b.last_name, b.created_at]);
  });
  const csv = rows
    .map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\r\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="clearsight-recording-list.csv"');
  res.send(csv);
});

/* ------------------------------ static site --------------------------- */

app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

app.use((req, res) => res.status(404).sendFile(path.join(__dirname, 'public', 'index.html')));

/* -------------------------------- start ------------------------------- */

const seeded = seedDaysIfEmpty();
app.listen(PORT, () => {
  console.log(`ClearSight scheduler running on http://localhost:${PORT}`);
  console.log(`Database: ${DB_PATH}`);
  if (seeded) console.log(`Loaded ${seeded} recording days.`);
});
