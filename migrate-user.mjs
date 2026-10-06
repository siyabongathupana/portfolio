import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs/promises';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY;

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

// ── 1. List existing user emails from your GitHub data folder ──
// If you already have the folder locally, just read it:
const usersDir = './data/users';
const dirs = await fs.readdir(usersDir);
const emails = dirs
  .map(d => decodeURIComponent(d))
  .filter(e => e.includes('@'));

console.log(`Found ${emails.length} existing users`);

// ── 2. Create Supabase auth users ──
for (const email of emails) {
  try {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { migrated_from: 'github_files' }
    });

    if (error) {
      console.error(`✗ ${email}:`, error.message);
      continue;
    }

    // Record the mapping
    await admin.from('migration_map').insert({
      old_email: email,
      new_user_id: data.user.id,
      status: 'created'
    });

    console.log(`✓ Created ${email} → ${data.user.id}`);
  } catch (err) {
    console.error(`✗ ${email}:`, err.message);
  }
}

// ── 3. Send password-setup emails ──
for (const email of emails) {
  try {
    const { error } = await admin.auth.resetPasswordForEmail(email, {
      redirectTo: 'https://siyabongathupana.github.io/portfolio/set-password.html'
    });
    if (error) console.error(`✗ Reset email ${email}:`, error.message);
    else console.log(`→ Password email sent to ${email}`);
  } catch (err) {
    console.error(err);
  }
}

console.log('Done.');
