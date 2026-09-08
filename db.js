'use strict';

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, 'data', 'clearsight.db');

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS recording_days (
    date      TEXT PRIMARY KEY,          -- YYYY-MM-DD
    start_at  TEXT NOT NULL,             -- HH:MM, 24h
    end_at    TEXT NOT NULL,             -- HH:MM, 24h
    location  TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS bookings (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    date        TEXT NOT NULL,
    time        TEXT NOT NULL,           -- HH:MM, 24h
    first_name  TEXT NOT NULL,
    last_name   TEXT NOT NULL,
    created_at  TEXT NOT NULL,
    UNIQUE (date, time)
  );

  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_bookings_date ON bookings (date);
`);

/* Defaults: 30 minutes of recording, 10 minute setup gap between patients. */
const setSetting = db.prepare(
  'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
);
const getSettingRow = db.prepare('SELECT value FROM settings WHERE key = ?');

function seedSetting(key, value) {
  if (!getSettingRow.get(key)) setSetting.run(key, String(value));
}
seedSetting('record_mins', 30);
seedSetting('gap_mins', 10);

function getSettings() {
  return {
    recordMins: Number(getSettingRow.get('record_mins')?.value ?? 30),
    gapMins: Number(getSettingRow.get('gap_mins')?.value ?? 10),
  };
}

function saveSettings({ recordMins, gapMins }) {
  if (Number.isFinite(recordMins)) setSetting.run('record_mins', String(recordMins));
  if (Number.isFinite(gapMins)) setSetting.run('gap_mins', String(gapMins));
  return getSettings();
}

/* ------------------------------ queries ------------------------------ */

const q = {
  allDays: db.prepare('SELECT date, start_at, end_at, location FROM recording_days ORDER BY date'),
  oneDay: db.prepare('SELECT date, start_at, end_at, location FROM recording_days WHERE date = ?'),
  upsertDay: db.prepare(`
    INSERT INTO recording_days (date, start_at, end_at, location)
    VALUES (@date, @start, @end, @location)
    ON CONFLICT(date) DO UPDATE SET
      start_at = excluded.start_at,
      end_at   = excluded.end_at,
      location = excluded.location
  `),
  deleteDay: db.prepare('DELETE FROM recording_days WHERE date = ?'),

  allBookings: db.prepare(`
    SELECT b.id, b.date, b.time, b.first_name, b.last_name, b.created_at, d.location
    FROM bookings b LEFT JOIN recording_days d ON d.date = b.date
    ORDER BY b.date, b.time
  `),
  bookingsForDate: db.prepare('SELECT id, time FROM bookings WHERE date = ?'),
  countForDate: db.prepare('SELECT COUNT(*) AS n FROM bookings WHERE date = ?'),
  insertBooking: db.prepare(`
    INSERT INTO bookings (date, time, first_name, last_name, created_at)
    VALUES (@date, @time, @firstName, @lastName, @createdAt)
  `),
  deleteBooking: db.prepare('DELETE FROM bookings WHERE id = ?'),
};

/* -------------------------- confirmed dates -------------------------- */
/* Loaded once, on an empty database. After that the admin page owns them. */

const SEED_DAYS = [
  { date: '2026-09-15', start: '09:00', end: '11:00', location: 'OKC' },
  { date: '2026-09-23', start: '14:00', end: '16:00', location: 'Plano' },
  { date: '2026-10-13', start: '09:00', end: '11:00', location: 'Plano' },
  { date: '2026-10-21', start: '14:00', end: '16:00', location: 'OKC' },
  { date: '2026-11-10', start: '09:00', end: '11:00', location: 'OKC' },
  { date: '2026-11-18', start: '14:00', end: '16:00', location: 'Plano' },
  { date: '2026-12-08', start: '09:00', end: '11:00', location: 'Plano' },
  { date: '2026-12-16', start: '14:00', end: '16:00', location: 'OKC' },
];

function seedDaysIfEmpty() {
  const existing = q.allDays.all();
  if (existing.length > 0) return existing.length;
  const insertMany = db.transaction((rows) => rows.forEach((r) => q.upsertDay.run(r)));
  insertMany(SEED_DAYS);
  return SEED_DAYS.length;
}

module.exports = { db, q, getSettings, saveSettings, seedDaysIfEmpty, SEED_DAYS, DB_PATH };
