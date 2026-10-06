import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs/promises';

const admin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const usersDir = './data/users';
const dirs = await fs.readdir(usersDir);

for (const dir of dirs) {
  const email = decodeURIComponent(dir);
  if (!email.includes('@')) continue;

  // Find this user's new UUID
  const { data: mapRow } = await admin
    .from('migration_map')
    .select('new_user_id')
    .eq('old_email', email)
    .single();

  if (!mapRow) {
    console.warn(`↷ Skipping ${email} — not in migration_map`);
    continue;
  }

  // Read the JSON file
  const raw = await fs.readFile(`${usersDir}/${dir}/timesheet.json`, 'utf8')
    .catch(() => null);
  if (!raw) {
    console.log(`↷ ${email}: no timesheet.json, skipping`);
    continue;
  }

  const entries = JSON.parse(raw);
  if (!Array.isArray(entries) || entries.length === 0) {
    console.log(`↷ ${email}: 0 entries`);
    continue;
  }

  // Map to Supabase row shape
  const rows = entries.map(e => ({
    user_id: mapRow.new_user_id,
    date: e.date,
    start_time: e.start || null,
    end_time: e.end || null,
    hours: parseFloat(e.hours) || 0,
    project: e.project || 'Unspecified',
    category: e.category || 'Other',
    billable: e.billable === 'yes',
    notes: e.notes || null
  }));

  const { error } = await admin.from('timesheet_entries').insert(rows);

  if (error) {
    console.error(`✗ ${email}:`, error.message);
    await admin.from('migration_map')
      .update({ status: 'failed' })
      .eq('old_email', email);
  } else {
    await admin.from('migration_map')
      .update({ status: 'migrated' })
      .eq('old_email', email);
    console.log(`✓ ${email}: ${rows.length} entries migrated`);
  }
}

console.log('Done.');