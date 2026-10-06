// auth.js — Supabase edition
// Permissions live in profiles.permissions (text[]).
// Admin role is defined by APP_CONFIG.adminUsers OR profiles.role='admin'.

window.Auth = (() => {
  const ALL_KNOWN = ['studies', 'timesheet', 'analytics', 'projects', 'certificates'];

  function getUser() { return window.__currentAuthUser || null; }
  function isAdminEmail(email) {
    return (window.APP_CONFIG.adminUsers || []).includes(email);
  }
  function requireAdmin() {
    const u = getUser();
    if (!u) throw new Error('Not logged in');
    if (!isAdminEmail(u.email)) throw new Error('Admin privileges required');
    return u;
  }

  function normalizePermissions(stored) {
    if (!Array.isArray(stored)) return [];
    if (stored.includes('all')) return [...ALL_KNOWN];
    return stored.filter(p => ALL_KNOWN.includes(p));
  }

  // ═══════════════════════════════════════════════════════
  //  PERMISSIONS
  // ═══════════════════════════════════════════════════════
  async function getPermissionsForUser(email) {
    if (isAdminEmail(email)) return [...ALL_KNOWN];
    if (window.APP_CONFIG.publicProfileEmail === email) return [...ALL_KNOWN];
    const { data, error } = await window.supabase
      .from('profiles').select('permissions').eq('email', email).maybeSingle();
    if (error || !data) return [...ALL_KNOWN];
    if (!Array.isArray(data.permissions) || !data.permissions.length) return [...ALL_KNOWN];
    return normalizePermissions(data.permissions);
  }

  async function setUserPermission(email, permission, enabled) {
    requireAdmin();
    if (!ALL_KNOWN.includes(permission)) throw new Error('Unknown permission: ' + permission);

    const { data: existing, error: readErr } = await window.supabase
      .from('profiles').select('permissions').eq('email', email).maybeSingle();
    if (readErr) throw readErr;

    const current = normalizePermissions(existing?.permissions || []);
    const isLegacy = !existing || !Array.isArray(existing.permissions) || !existing.permissions.length;
    const base = isLegacy ? [...ALL_KNOWN] : current;

    let next;
    if (enabled) next = base.includes(permission) ? base : [...base, permission];
    else next = base.filter(p => p !== permission);

    const { error } = await window.supabase
      .from('profiles').update({ permissions: [...new Set(next)] }).eq('email', email);
    if (error) throw error;

    await logActivity('admin', 'permission_change',
      `${enabled ? 'Granted' : 'Revoked'} "${permission}" for ${email}`);
    return next;
  }

  async function setAllPermissions(email, permissionsArray) {
    requireAdmin();
    const sanitized = [...new Set((permissionsArray || []).filter(p => ALL_KNOWN.includes(p)))];
    const { error } = await window.supabase
      .from('profiles').update({ permissions: sanitized }).eq('email', email);
    if (error) throw error;
    await logActivity('admin', 'permission_change',
      `Set permissions for ${email}: [${sanitized.join(', ')}]`);
    return sanitized;
  }

  // ═══════════════════════════════════════════════════════
  //  PAGE ACCESS GUARD
  // ═══════════════════════════════════════════════════════
  function showDenied(message) {
    document.body.innerHTML = `
      <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#eef3fc;padding:20px;font-family:'Inter',sans-serif;">
        <div style="background:white;border-radius:24px;padding:40px;max-width:520px;text-align:center;box-shadow:0 10px 30px rgba(0,0,0,0.08);">
          <div style="font-size:4rem;color:#dc3545;margin-bottom:16px;">🔒</div>
          <h2 style="color:#dc3545;font-weight:700;margin-bottom:12px;">Access Restricted</h2>
          <p style="color:#5a7d9a;font-size:0.95rem;line-height:1.5;">${message}</p>
          <a href="index.html" style="display:inline-block;margin-top:20px;background:#2fc7ff;color:#0b2b3b;border-radius:40px;padding:10px 28px;text-decoration:none;font-weight:600;">Go Home</a>
          <button onclick="window.Auth.clearSession();location.href='login.html';" style="display:inline-block;margin-top:20px;margin-left:8px;background:transparent;border:1px solid #e2e8f0;color:#5a7d9a;border-radius:40px;padding:10px 24px;font-weight:500;cursor:pointer;">Switch Account</button>
        </div>
      </div>
    `;
    document.body.style.visibility = 'visible';
  }

  async function checkPageAccess(required) {
    const u = getUser();
    if (!u) {
      const back = encodeURIComponent(location.pathname + location.search);
      window.location.href = `login.html?redirect=${back}`;
      return false;
    }
    if (required === 'admin') {
      if (isAdminEmail(u.email)) return true;
      showDenied('This page is restricted to administrators only.');
      return false;
    }
    if (required === 'authenticated') return true;
    const perms = await getPermissionsForUser(u.email);
    if (perms.includes(required)) return true;
    showDenied(`You don't have permission to view the <strong>${required}</strong> section. Ask your administrator to grant access.`);
    return false;
  }

  // ═══════════════════════════════════════════════════════
  //  NAV VISIBILITY
  // ═══════════════════════════════════════════════════════
  function isCurrentUserAdmin() {
    const u = getUser();
    return !!(u && isAdminEmail(u.email));
  }

  function applyNavVisibility() {
    const admin = isCurrentUserAdmin();
    const loggedIn = !!getUser();
    document.querySelectorAll('[data-admin-only]').forEach(el => { el.style.display = admin ? '' : 'none'; });
    document.querySelectorAll('[data-auth-only]').forEach(el => { el.style.display = loggedIn ? '' : 'none'; });
    document.querySelectorAll('[data-guest-only]').forEach(el => { el.style.display = loggedIn ? 'none' : ''; });
    document.body.classList.toggle('is-admin', !!admin);
    document.body.classList.toggle('is-logged-in', loggedIn);
  }

  async function applyNavPermissions() {
    const u = getUser();
    if (!u) return;
    let perms;
    try { perms = await getPermissionsForUser(u.email); } catch { perms = []; }
    document.querySelectorAll('[data-requires-link]').forEach(el => {
      const needed = el.getAttribute('data-requires-link');
      el.style.display = perms.includes(needed) ? '' : 'none';
    });
  }

  // ═══════════════════════════════════════════════════════
  //  LOG (delegates to shared.js Logger)
  // ═══════════════════════════════════════════════════════
  async function logActivity(module, action, details) {
    if (window.Logger?.logActivity) return window.Logger.logActivity(module, action, details);
  }

  // ═══════════════════════════════════════════════════════
  //  ADMIN: USER MANAGEMENT
  // ═══════════════════════════════════════════════════════
  async function createUser({ email, name, password, role = 'user', permissions = [] }) {
    requireAdmin();
    email = (email || '').trim().toLowerCase();
    if (!email.includes('@')) throw new Error('Invalid email address');
    if (!password || password.length < 6) throw new Error('Password must be at least 6 characters');

    const { data, error } = await window.supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: name || email.split('@')[0] },
        emailRedirectTo: location.origin + location.pathname.replace(/[^/]*$/, 'login.html')
      }
    });
    if (error) throw new Error(error.message);

    // The trigger creates the profiles row. Patch role/permissions.
    const sanitized = [...new Set((permissions || []).filter(p => ALL_KNOWN.includes(p)))];
    if (role !== 'user' || sanitized.length || name) {
      await window.supabase.from('profiles').update({
        role,
        permissions: sanitized,
        full_name: name || email.split('@')[0]
      }).eq('email', email);
    }

    await logActivity('admin', 'user_create', `Created ${email} (${role})`);
    return data.user;
  }

  async function resetUserPassword(email) {
    requireAdmin();
    return window.AccountManager.resetUserPassword(email);
  }

  async function deleteUserAccount(email) {
    requireAdmin();
    return window.AccountManager.deleteUser(email);
  }

  async function listUsers() {
    requireAdmin();
    const profiles = await window.AccountManager.listUsers();
    const users = [];
    for (const p of profiles) {
      const isAdmin = isAdminEmail(p.email);
      const effective = isAdmin ? [...ALL_KNOWN] : normalizePermissions(p.permissions);
      const stats = await window.AccountManager.getUserStats(p.email);
      users.push({
        email: p.email,
        name: p.full_name || '',
        role: p.role || (isAdmin ? 'admin' : 'user'),
        createdAt: p.created_at,
        hasAccount: true,
        isAdmin,
        isLegacy: !Array.isArray(p.permissions) || !p.permissions.length,
        permissions: effective,
        projects: stats.projects,
        certificates: stats.certificates,
        timesheetEntries: stats.timesheetEntries
      });
    }
    users.sort((a, b) => a.email.localeCompare(b.email));
    return users;
  }

  async function getUserActivity(targetEmail, limit = 200) {
    requireAdmin();
    const { data: profile } = await window.supabase
      .from('profiles').select('id').eq('email', targetEmail).maybeSingle();
    if (!profile) return [];
    const { data, error } = await window.supabase
      .from('activity_logs').select('*').eq('user_id', profile.id)
      .order('created_at', { ascending: false }).limit(limit);
    if (error) return [];
    return (data || []).map(l => ({
      timestamp: l.created_at, action: l.action, details: l.details,
      module: (l.action || '').split('_')[0]
    }));
  }

  async function changeOwnPassword(newPassword) {
    if (!newPassword || newPassword.length < 6) throw new Error('New password must be at least 6 characters');
    const { error } = await window.supabase.auth.updateUser({ password: newPassword });
    if (error) throw new Error(error.message);
    await logActivity('account', 'password_change', 'Password changed');
    return true;
  }

  function clearSession() {
    try { window.SessionManager.logout(); } catch {}
  }

  // ═══════════════════════════════════════════════════════
  //  AUTO-RUN
  // ═══════════════════════════════════════════════════════
  function autoRun() {
    Promise.resolve(window.authReady).then(async () => {
      applyNavVisibility();
      try { await applyNavPermissions(); } catch {}
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', autoRun);
  else autoRun();

  return {
    createUser, resetUserPassword, deleteUserAccount, listUsers,
    getUserActivity, setUserPermission, setAllPermissions,
    changeOwnPassword,
    getPermissionsForUser, checkPageAccess, getEffectivePermissions: normalizePermissions,
    ALL_KNOWN,
    logActivity,
    applyNavVisibility, applyNavPermissions, isCurrentUserAdmin,
    clearSession
  };
})();
