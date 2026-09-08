# Putting the scheduler online (about 15 minutes, no code)

## Your staff password

    willow-orchard-meadow-83

Put it in your password manager now. Below is its scrambled version (the "hash").
This is the ONE value you'll paste into Render. The password itself is never stored anywhere.

    $2a$12$SgI6cZWtFPzgwm/3BkLVTOVFN7YKJWa3LZdoRZavG1ks47bW8CYP.

---

## Step 1 — GitHub account (2 min)

1. Go to https://github.com/signup and create a free account with jairezee@gmail.com.
2. Verify the email code, then sign in.

## Step 2 — Put the code on GitHub (3 min)

1. Go to https://github.com/new
2. Repository name: `clearsight-scheduler`. Choose **Private**. Click **Create repository**.
3. On the next page click **uploading an existing file**.
4. In Finder, open this folder (`clearsight 4`), select **everything inside it**
   (Cmd-A), and drag it all onto the GitHub page. Folders like `public` come along.
5. Click **Commit changes**. Wait for the file list to appear.

## Step 3 — Render (5 min)

1. Go to https://dashboard.render.com/register and click **GitHub** to sign up
   with the account from Step 1. Authorize Render when GitHub asks.
2. Click **New +** → **Blueprint**.
3. Connect the `clearsight-scheduler` repo (you may need to click
   "Configure account" and give Render access to it).
4. Render reads `render.yaml` and shows one service. It asks for exactly one
   value, **ADMIN_PASSWORD_HASH** — paste the long hash from the top of this file.
5. Click **Apply** / **Deploy Blueprint**. Add a card when asked: this is the
   $7/month Starter plan plus a 1 GB disk (~$0.25/month). Do **not** switch to
   Free — free instances can't keep a disk, and every restart would wipe the bookings.
6. Wait for the deploy to show **Live** (3–5 minutes the first time).

## Step 4 — Your link

The address is shown at the top of the service page, something like
`https://clearsight-scheduler.onrender.com`.

- Patients: that address.
- Staff: that address + `/admin`, with the password above.

Send me the address and I'll check it end to end.
