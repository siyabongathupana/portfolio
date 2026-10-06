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

  const { data: mapRow } = await admin
    .from('migration_map')
    .select('new_user_id')
    .eq('old_email', email)
    .single();
  if (!mapRow) continue;

  const raw = await fs.readFile(`${usersDir}/${dir}/projects.json`, 'utf8')
    .catch(() => null);
  if (!raw) continue;

  const projectsObj = JSON.parse(raw);
  const rows = Object.entries(projectsObj).map(([id, p]) => ({
    user_id: mapRow.new_user_id,
    title: p.title || 'Untitled',
    short_desc: p.shortDesc || null,
    description: p.description || null,
    client: p.client || null,
    industry: p.industry || null,
    status: p.status || 'Ongoing',
    duration: p.duration || null,
    user_role: p.userRole || null,
    team_members: p.teamMembers || null,
    project_category: p.projectCategory || null,
    controller_type: p.controllerType || null,
    deltaV_version: p.deltaVVersion || null,
    project_type: p.projectType || null,
    cabinet_count: p.cabinetCount || 0,
    io_ai: p.io?.AI || 0,
    io_ao: p.io?.AO || 0,
    io_di: p.io?.DI || 0,
    io_do: p.io?.DO || 0,
    dates: p.dates || null,
    team: p.team || null,
    technical: p.technical || null,
    work_breakdown: p.workBreakdown || null,
    selected_images: p.selectedImages || []
  }));

  if (rows.length === 0) continue;

  const { error } = await admin.from('projects').insert(rows);
  if (error) console.error(`✗ ${email}:`, error.message);
  else console.log(`✓ ${email}: ${rows.length} projects migrated`);
}