# ClearSight testimonial recording scheduler

A small booking site for patient testimonial sessions. Patients open a link, pick a
recording day, choose a time, and enter a first and last name. Staff sign in at `/admin`
to manage the dates and see who is coming in.

Nothing else is collected. No phone, no email, no medical information.

---

## What's in the box

| Path | What it is |
| --- | --- |
| `server.js` | Express server: booking API, admin API, session handling |
| `db.js` | SQLite schema, queries, and the eight confirmed recording days |
| `seed.js` | Generates your admin password hash and session secret |
| `public/index.html` + `app.js` | The patient booking page |
| `public/admin.html` + `admin.js` | The staff page |
| `public/calendar.js` | Calendar rendering shared by both pages |
| `public/styles.css` | All styling |
| `public/img/logo.png` | The ClearSight lockup, transparent background |
| `public/img/icon.png` | The eye mark as a square favicon |

### Brand

The background was keyed out of the supplied logo, including the counters inside the
letters and the gaps in the eye swirl, so it sits cleanly on any color. The page palette is
sampled from the artwork: navy `#034A75` for buttons and text, pale blue `#C3DFEA` for
Oklahoma City dates. Plano dates use a warm `#B9761F` so the two locations stay
distinguishable at a glance — color isn't the only cue, since each date is also labelled.

A full-resolution copy of the transparent logo (810 × 168) is included alongside this
project if you need it for other materials.

No build step and no front-end framework. It's plain HTML, CSS, and JavaScript served by
Node, which keeps it cheap to host and easy for any developer to pick up later.

---

## Running it locally

```bash
npm install
node seed.js --password "pick-a-strong-password"   # prints two lines
```

Create a file named `.env` in the project root and paste both lines into it:

```
ADMIN_PASSWORD_HASH=$2a$12$...
SESSION_SECRET=8b2323...
```

Then:

```bash
npm start
```

- Patient page: <http://localhost:3000>
- Staff page: <http://localhost:3000/admin>

The password itself is never stored — only its hash. Keep the real password in a password
manager. If you lose it, run `seed.js` again with a new one and replace the hash.

The database file is created automatically at `data/clearsight.db` on first run, and the
eight recording days are loaded then. After that, the admin page owns the schedule and the
seed never runs again.

---

## Putting it online

It needs a Node host with a persistent disk, because the database is a file.

**Render / Railway / Fly.io** — connect the repo, set the start command to `npm start`, add
`ADMIN_PASSWORD_HASH`, `SESSION_SECRET`, and `NODE_ENV=production` as environment
variables, and attach a persistent volume mounted somewhere like `/data`. Then set
`DATABASE_PATH=/data/clearsight.db` so the bookings survive redeploys. Without a volume,
every deploy wipes the schedule.

**Your own server** — clone it, `npm install --omit=dev`, run it under `pm2` or a systemd
unit, and put nginx or Caddy in front for HTTPS.

**Docker** — a `Dockerfile` is included. Mount a volume at `/data` and set
`DATABASE_PATH=/data/clearsight.db`.

Once it's up, point a subdomain at it — something like `stories.clearsight.com` — and that's
the link you give patients.

`NODE_ENV=production` matters: it's what makes the admin session cookie HTTPS-only.

---

## Day-to-day use

Sign in at `/admin`. From there you can:

- **Add a recording day** — click any date on the calendar. It's created at 9:00–11:00 in
  OKC by default; change the hours and location in the panel on the right.
- **Change hours or location** — pick a day, adjust the fields. Saves immediately.
- **Remove a day** — pick it, then "Remove this recording day". Blocked if anyone is booked
  that day, so you can't wipe out patients by accident.
- **Change the timing** — the "Recording" and "Setup gap" fields in the dark bar apply to
  every day. They're set to 30 and 10.
- **Remove a booking** — "Remove" next to the name. That time reopens for someone else.
- **Download the list** — "Download list" gives you a CSV of every booking.

### About the slot math

Slots start every 40 minutes: 30 minutes of recording plus a 10-minute setup gap. A slot
only appears if the full 30 minutes fits before your end time.

That means a two-hour window gives you **three** patients, not four:

| Window | Slots |
| --- | --- |
| 9:00–11:00 | 9:00, 9:40, 10:20 |
| 9:00–11:30 | 9:00, 9:40, 10:20, 11:00 |
| 2:00–4:00 | 2:00, 2:40, 3:20 |
| 2:00–4:30 | 2:00, 2:40, 3:20, 4:00 |

If you want four per session, extend each day's end time by 30 minutes in the admin panel.

### Loaded dates

| Date | Location | Hours |
| --- | --- | --- |
| Tue, Sep 15 | OKC | 9:00–11:00 AM |
| Wed, Sep 23 | Plano | 2:00–4:00 PM |
| Tue, Oct 13 | Plano | 9:00–11:00 AM |
| Wed, Oct 21 | OKC | 2:00–4:00 PM |
| Tue, Nov 10 | OKC | 9:00–11:00 AM |
| Wed, Nov 18 | Plano | 2:00–4:00 PM |
| Tue, Dec 8 | Plano | 9:00–11:00 AM |
| Wed, Dec 16 | OKC | 2:00–4:00 PM |

The calendar shows September through December 2026. To run a different stretch, edit the
`MONTHS` list at the top of `public/calendar.js`.

---

## What's protected, and what isn't

Built in:

- Admin password is bcrypt-hashed; the plain text is never stored or logged.
- Sessions are HMAC-signed, httpOnly cookies that expire after 8 hours, and HTTPS-only in
  production.
- Sign-in is rate limited to 8 tries per 15 minutes; booking to 12 per 10 minutes.
- The public API returns only whether a slot is taken. Names are never sent to the patient
  page — they exist only behind the admin login.
- A database constraint makes double-booking impossible even if two people click at once.
- Security headers via Helmet, including a content security policy.
- Both pages carry `noindex`, so search engines skip them.

Worth deciding on before launch:

- **Backups.** The database is one file. Copy it somewhere on a schedule, or use a host that
  snapshots volumes.
- **HTTPS.** Non-negotiable. Every host above provides it; a self-managed server needs Caddy
  or certbot.
- **Who has the password.** There's one admin account, not per-person logins. If someone
  leaves, generate a new hash.
- **A media release.** You're recording patients for marketing use, so you'll want a signed
  release. Right now that's a paper step at the office. If you'd rather collect it here, it
  can be added as a checkbox with the release text and a stored timestamp.
- **HIPAA.** A first and last name tied to a ClearSight recording session still identifies
  someone as your patient. Name-and-time only is a much smaller footprint than a full intake
  form, but have whoever handles your compliance look at the setup before it goes live, and
  keep the host under a BAA if that's how your practice operates.
