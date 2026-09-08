#!/usr/bin/env node
'use strict';

/*
 * Generates the two secrets the server needs.
 *
 *   node seed.js --password "choose-a-strong-password"
 *
 * Copy the output into your .env file (or your host's environment settings).
 * The plain password is never stored anywhere — only the hash is.
 */

const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const args = process.argv.slice(2);
const i = args.indexOf('--password');
const password = i !== -1 ? args[i + 1] : null;

if (!password) {
  console.error('\nUsage: node seed.js --password "your-password"\n');
  process.exit(1);
}

if (password.length < 12) {
  console.error('\nUse at least 12 characters. This is the only lock on your patient list.\n');
  process.exit(1);
}

const hash = bcrypt.hashSync(password, 12);
const secret = crypto.randomBytes(32).toString('hex');

console.log('\nAdd these to your .env file:\n');
console.log(`ADMIN_PASSWORD_HASH=${hash}`);
console.log(`SESSION_SECRET=${secret}`);
console.log('\nKeep the password itself in your password manager, not in a file.\n');
