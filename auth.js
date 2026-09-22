// auth.js — Admin-managed accounts + per-page permission checks + nav visibility
// Purely additive. Never touches existing login flow.

window.Auth = (() => {
  const ALL_KNOWN = ['studies', 'timesheet', 'analytics', 'projects', 'certificates'];

  function getUser() { return window.SessionManager?.getCurrentUser(); }
  function isAdminEmail(email) {
    return (window.APP_CONFIG.adminUsers || []).includes(email);
  }
  function requireAdmin() {
    const u = getUser();
    if (!u) throw new Error('Not logged in');
    if (!isAdminEmail(u.username)) throw new Error('Admin privileges required');
    return u;
  }

  function b64encode(obj) {
    return btoa(unescape(encodeURIComponent(JSON.stringify(obj, null, 2))));
  }

  // ── GitHub helpers ──
  async function readFileRaw(path, patOverride) {
    const u = getUser();
    const token = patOverride || u?.pat;
    if (!token) throw new Error('No token available');
    const { owner, repo, branch } = window.REPO_CONFIG;
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`;
    const resp = await fetch(url, {
      headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json' }
    });
    if (resp.status === 404) return null;
    if (!resp.ok) throw new Error(`Read ${path} failed: ${resp.status}`);
    const data = await resp.json();
    return { sha: data.sha, raw: atob(data.content.replace(/\n/g, '')) };
  }

  async function readJson(path, patOverride) {
    const f = await readFileRaw(path, patOverride);
    if (!f) return null;
    try { return { sha: f.sha, data: JSON.parse(f.raw) }; }
    catch { return { sha: f.sha, data: null }; }
  }

  async function writeJson(path, data, message, sha = null) {
    const u = getUser();
    const { owner, repo, branch } = window.REPO_CONFIG;
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
    const body = { message, content: b64encode(data), branch };
    if (sha) body.sha = sha;
    const resp = await fetch(url, {
      method: 'PUT',
      headers: { Authorization: `token ${u.pat}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!resp.ok) {
      const e = await resp.json().catch(() => ({}));
      throw new Error(e.message || `Write ${path} failed: ${resp.status}`);
    }
    return resp.json();
  }

  async function deleteFile(path, sha, message) {
    const u = getUser();
    const { owner, repo, branch } = window.REPO_CONFIG;
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
    const resp = await fetch(url, {
      method: 'DELETE',
      headers: { Authorization: `token ${u.pat}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, sha, branch })
    });
    if (!resp.ok) {
      const e = await resp.json().catch(() => ({}));
      throw new Error(e.message || 'Delete failed');
    }
    return resp.json();
  }

  // ═══════════════════════════════════════════════════════
  //  PERMISSIONS
  // ═══════════════════════════════════════════════════════
  function getEffectivePermissions(stored) {
    if (!Array.isArray(stored)) return [];
    if (stored.includes('all')) return [...ALL_KNOWN];
    return stored.filter(p => ALL_KNOWN.includes(p));
  }

  async function getPermissionsForUser(email, patOverride) {
    if (isAdminEmail(email)) return [...ALL_KNOWN];
    if (window.APP_CONFIG.publicProfileEmail === email) return [...ALL_KNOWN];
    const encUser = encodeURIComponent(email);
    const path = `${window.REPO_CONFIG.dataPath}/users/${encUser}/user_meta.json`;
    try {
      const file = await readJson(path, patOverride);
      // Legacy user (no meta file, or meta with no permissions field) → full access
      if (!file || !file.data || !Array.isArray(file.data.permissions)) {
        return [...ALL_KNOWN];
      }
      return getEffectivePermissions(file.data.permissions);
    } catch (e) {
      return [...ALL_KNOWN];
    }
  }

  async function setUserPermission(email, permission, enabled) {
    requireAdmin();
    if (!ALL_KNOWN.includes(permission)) throw new Error('Unknown permission: ' + permission);
    const encUser = encodeURIComponent(email);
    const path = `${window.REPO_CONFIG.dataPath}/users/${encUser}/user_meta.json`;
    const existing = await readJson(path);
    const wasLegacy = !existing?.data || !Array.isArray(existing.data.permissions);
    const data = existing?.data || { email };
    // If legacy (no permissions field), start from full set so toggle makes sense
    const current = wasLegacy ? [...ALL_KNOWN] : getEffectivePermissions(data.permissions);
    let next;
    if (enabled) {
      next = current.includes(permission) ? current : [...current, permission];
    } else {
      next = current.filter(p => p !== permission);
    }
    data.permissions = [...new Set(next)];
    data.email = email;
    data.updatedAt = Date.now();
    await writeJson(path, data, `Update permissions for ${email}`, existing?.sha);
    await logActivity('admin', 'permission_change',
      `${enabled ? 'Granted' : 'Revoked'} "${permission}" for ${email}`);
    return data.permissions;
  }

  async function setAllPermissions(email, permissionsArray) {
    requireAdmin();
    const encUser = encodeURIComponent(email);
    const path = `${window.REPO_CONFIG.dataPath}/users/${encUser}/user_meta.json`;
    const existing = await readJson(path);
    const data = existing?.data || { email };
    data.permissions = [...new Set((permissionsArray || []).filter(p => ALL_KNOWN.includes(p)))];
    data.email = email;
    data.updatedAt = Date.now();
    await writeJson(path, data, `Set permissions for ${email}`, existing?.sha);
    await logActivity('admin', 'permission_change',
      `Set permissions for ${email}: [${data.permissions.join(', ')}]`);
    return data.permissions;
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
      if (isAdminEmail(u.username)) return true;
      showDenied('This page is restricted to administrators only.');
      return false;
    }
    if (required === 'authenticated') return true;
    const perms = await getPermissionsForUser(u.username);
    if (perms.includes(required)) return true;
    showDenied(
      `You don't have permission to view the <strong>${required}</strong> section. ` +
      `Ask your administrator to grant access.`
    );
    return false;
  }

  // ═══════════════════════════════════════════════════════
  //  NAV VISIBILITY
  // ═══════════════════════════════════════════════════════
  function isCurrentUserAdmin() {
    const u = getUser();
    return !!(u && isAdminEmail(u.username));
  }

  function applyNavVisibility() {
    const admin = isCurrentUserAdmin();
    const loggedIn = !!getUser();

    document.querySelectorAll('[data-admin-only]').forEach(el => {
      el.style.display = admin ? '' : 'none';
    });
    document.querySelectorAll('[data-auth-only]').forEach(el => {
      el.style.display = loggedIn ? '' : 'none';
    });
    document.querySelectorAll('[data-guest-only]').forEach(el => {
      el.style.display = loggedIn ? 'none' : '';
    });

    document.body.classList.toggle('is-admin', !!admin);
    document.body.classList.toggle('is-logged-in', loggedIn);
  }

  async function applyNavPermissions() {
    const u = getUser();
    if (!u) return;
    let perms;
    try { perms = await getPermissionsForUser(u.username); }
    catch { perms = []; }
    document.querySelectorAll('[data-requires-link]').forEach(el => {
      const needed = el.getAttribute('data-requires-link');
      el.style.display = perms.includes(needed) ? '' : 'none';
    });
  }

  // ═══════════════════════════════════════════════════════
  //  ACTIVITY LOGGING (fixed — no more clobbering the log file)
  // ═══════════════════════════════════════════════════════
  async function logActivity(module, action, details) {
    try {
      const u = getUser();
      if (!u || !u.pat) return;
      const entry = JSON.stringify({
        timestamp: new Date().toISOString(),
        module, action, details,
        user: u.username || 'anonymous',
        page: window.location.pathname
      }) + '\n';

      const encUser = encodeURIComponent(u.username);
      const path = `${window.REPO_CONFIG.dataPath}/users/${encUser}/logs/activity.ndjson`;
      const url = `https://api.github.com/repos/${window.REPO_CONFIG.owner}/${window.REPO_CONFIG.repo}/contents/${path}`;

      // Read current file (may not exist)
      let sha = null, existing = '';
      const f = await readFileRaw(path).catch(() => null);
      if (f) { sha = f.sha; existing = f.raw; }

      const putBody = {
        message: `Log: ${action}`,
        content: btoa(unescape(encodeURIComponent(entry + existing))),
        branch: window.REPO_CONFIG.branch
      };
      if (sha) putBody.sha = sha;

      let resp = await fetch(url, {
        method: 'PUT',
        headers: { Authorization: `token ${u.pat}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(putBody)
      });

      // Retry once on 409 (sha conflict)
      if (resp.status === 409) {
        const retry = await readFileRaw(path).catch(() => null);
        const retryBody = {
          message: `Log: ${action}`,
          content: btoa(unescape(encodeURIComponent(entry + (retry?.raw || '')))),
          branch: window.REPO_CONFIG.branch
        };
        if (retry) retryBody.sha = retry.sha;
        await fetch(url, {
          method: 'PUT',
          headers: { Authorization: `token ${u.pat}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(retryBody)
        });
      }
    } catch (e) {
      console.warn('Log failed:', e);
    }
  }

  // ═══════════════════════════════════════════════════════
  //  ADMIN: USER MANAGEMENT
  // ═══════════════════════════════════════════════════════
  async function createUser({ email, name, password, pat, role = 'user', permissions = [] }) {
    requireAdmin();
    email = (email || '').trim().toLowerCase();
    if (!email.includes('@')) throw new Error('Invalid email address');
    if (!password || password.length < 6) throw new Error('Password must be at least 6 characters');
    if (!pat || (!pat.startsWith('ghp_') && !pat.startsWith('github_pat_'))) {
      throw new Error('A valid GitHub PAT is required (ghp_… or github_pat_…)');
    }

    const encUser = encodeURIComponent(email);
    const base = `${window.REPO_CONFIG.dataPath}/users/${encUser}`;
    const accountPath  = `${base}/account.json`;

    const existing = await readFileRaw(accountPath);
    if (existing) throw new Error('An account with this email already exists. Use "Reset Password" instead.');

    const encrypted = await window.CryptoUtil.encrypt(
      JSON.stringify({ test: 'VALID', token: pat }),
      password
    );
    await writeJson(accountPath, encrypted, `Create account for ${email}`);

    await writeJson(`${base}/verified.json`,
      { verified: true, createdAt: Date.now() },
      `Mark ${email} as verified`);

    const sanitizedPerms = [...new Set((permissions || []).filter(p => ALL_KNOWN.includes(p)))];

    await writeJson(`${base}/user_meta.json`, {
      email,
      name: name || email.split('@')[0],
      role,
      permissions: sanitizedPerms,
      createdBy: getUser().username,
      createdAt: Date.now()
    }, `Metadata for ${email}`);

    // Initialize empty data files so the user starts clean
    await initializeUserFolder(email, pat);

    // Add to global verified list
    try {
      const listPath = `${window.REPO_CONFIG.dataPath}/verified_users.json`;
      const existingList = await readJson(listPath);
      const list = existingList?.data || { verified: [] };
      if (!Array.isArray(list.verified)) list.verified = [];
      if (!list.verified.includes(email)) list.verified.push(email);
      await writeJson(listPath, list, `Add ${email} to verified list`, existingList?.sha);
    } catch (e) { console.warn('Verified list update skipped:', e); }

    await logActivity('admin', 'user_create', `Created ${email} (${role})`);
    return true;
  }

  async function initializeUserFolder(email, userPat) {
    const { owner, repo, branch, dataPath } = window.REPO_CONFIG;
    const token = userPat || getUser().pat;
    const base = `${dataPath}/users/${encodeURIComponent(email)}`;
    const files = {
      'projects.json': {},
      'certificates.json': [],
      'timesheet.json': [],
      'studies.json': { years: [] },   // ← EMPTY, not the admin's template
      'user_meta.json': { email, permissions: [], createdAt: Date.now() }
    };
    for (const [name, content] of Object.entries(files)) {
      const path = `${base}/${name}`;
      // Skip user_meta.json — createUser just wrote it with real permissions
      if (name === 'user_meta.json') continue;
      const check = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`,
        { headers: { Authorization: `token ${token}` } }
      );
      if (check.ok) continue; // Don't overwrite
      await fetch(
        `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
        {
          method: 'PUT',
          headers: { Authorization: `token ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: `Initialize ${name} for ${email}`,
            content: btoa(unescape(encodeURIComponent(JSON.stringify(content, null, 2)))),
            branch
          })
        }
      );
    }
  }

  async function resetUserPassword(email, newPassword, newPat) {
    requireAdmin();
    email = (email || '').trim().toLowerCase();
    if (!newPassword || newPassword.length < 6) throw new Error('Password must be at least 6 characters');
    if (!newPat || (!newPat.startsWith('ghp_') && !newPat.startsWith('github_pat_'))) {
      throw new Error('A valid GitHub PAT is required');
    }
    const encUser = encodeURIComponent(email);
    const accountPath = `${window.REPO_CONFIG.dataPath}/users/${encUser}/account.json`;
    const existing = await readFileRaw(accountPath);
    if (!existing) throw new Error('User does not exist');
    const encrypted = await window.CryptoUtil.encrypt(
      JSON.stringify({ test: 'VALID', token: newPat }),
      newPassword
    );
    await writeJson(accountPath, encrypted, `Reset password for ${email}`, existing.sha);
    await logActivity('admin', 'user_reset_password', `Reset password for ${email}`);
    return true;
  }

  async function deleteUserAccount(email) {
    requireAdmin();
    email = (email || '').trim().toLowerCase();
    const encUser = encodeURIComponent(email);
    const accountPath = `${window.REPO_CONFIG.dataPath}/users/${encUser}/account.json`;
    const existing = await readFileRaw(accountPath);
    if (!existing) throw new Error('User does not exist');
    await deleteFile(accountPath, existing.sha, `Delete account for ${email}`);
    await logActivity('admin', 'user_delete', `Deleted account ${email}`);
    return true;
  }

  async function listUsers() {
    requireAdmin();
    const u = getUser();
    const { owner, repo, branch, dataPath } = window.REPO_CONFIG;
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${dataPath}/users?ref=${branch}`;
    const resp = await fetch(url, {
      headers: { Authorization: `token ${u.pat}`, Accept: 'application/vnd.github.v3+json' }
    });
    if (!resp.ok) throw new Error(`List users failed: ${resp.status}`);
    const items = await resp.json();

    let folders;
    try {
      folders = items.filter(i => i.type === 'dir')
        .map(i => { try { return decodeURIComponent(i.name); } catch { return i.name; } });
    } catch (e) {
      folders = items.filter(i => i.type === 'dir').map(i => i.name);
    }

    const users = [];
    for (const email of folders) {
      try {
        const encUser = encodeURIComponent(email);
        const base = `${dataPath}/users/${encUser}`;
        const account = await readFileRaw(`${base}/account.json`).catch(() => null);
        const meta    = await readJson(`${base}/user_meta.json`).catch(() => null);

        let projects = 0, certificates = 0, timesheetEntries = 0;
        try { const p = await readJson(`${base}/projects.json`); if (p?.data && typeof p.data === 'object') projects = Object.keys(p.data).length; } catch {}
        try { const c = await readJson(`${base}/certificates.json`); if (Array.isArray(c?.data)) certificates = c.data.length; } catch {}
        try { const t = await readJson(`${base}/timesheet.json`); if (Array.isArray(t?.data)) timesheetEntries = t.data.length; } catch {}

        const isAdmin = isAdminEmail(email);
        const isLegacy = !meta?.data || !Array.isArray(meta.data.permissions);
        const effective = (isAdmin || isLegacy) ? [...ALL_KNOWN] : getEffectivePermissions(meta.data.permissions);

        users.push({
          email,
          name: meta?.data?.name || '',
          role: meta?.data?.role || (isAdmin ? 'admin' : 'user'),
          createdAt: meta?.data?.createdAt || null,
          hasAccount: !!account,
          isAdmin,
          isLegacy,
          permissions: effective,
          projects, certificates, timesheetEntries
        });
      } catch (userErr) {
        // Never let one bad user folder break the whole list
        console.warn('Failed to load user folder', email, userErr);
        users.push({
          email,
          name: '',
          role: isAdminEmail(email) ? 'admin' : 'user',
          createdAt: null,
          hasAccount: false,
          isAdmin: isAdminEmail(email),
          isLegacy: true,
          permissions: [...ALL_KNOWN],
          projects: 0, certificates: 0, timesheetEntries: 0,
          error: userErr.message
        });
      }
    }
    users.sort((a, b) => a.email.localeCompare(b.email));
    return users;
  }

  async function getUserActivity(targetEmail, limit = 200) {
    requireAdmin();
    const encUser = encodeURIComponent(targetEmail);
    const logPath = `${window.REPO_CONFIG.dataPath}/users/${encUser}/logs/activity.ndjson`;
    const f = await readFileRaw(logPath).catch(() => null);
    if (!f) return [];
    return f.raw.trim().split('\n').filter(Boolean)
      .map(l => { try { return JSON.parse(l); } catch { return null; } })
      .filter(Boolean)
      .slice(0, limit);
  }

  async function changeOwnPassword(oldPassword, newPassword) {
    const u = getUser();
    if (!u) throw new Error('Not logged in');
    if (!newPassword || newPassword.length < 6) throw new Error('New password must be at least 6 characters');
    const encUser = encodeURIComponent(u.username);
    const accountPath = `${window.REPO_CONFIG.dataPath}/users/${encUser}/account.json`;
    const existing = await readFileRaw(accountPath);
    if (!existing) throw new Error('Your account file was not found');
    let accountData;
    try {
      const decrypted = await window.CryptoUtil.decrypt(JSON.parse(existing.raw), oldPassword);
      accountData = JSON.parse(decrypted);
      if (accountData.test !== 'VALID') throw new Error('bad');
    } catch {
      throw new Error('Current password is incorrect');
    }
    const reEncrypted = await window.CryptoUtil.encrypt(JSON.stringify(accountData), newPassword);
    await writeJson(accountPath, reEncrypted, `Change password for ${u.username}`, existing.sha);
    await logActivity('account', 'password_change', `Password changed`);
    return true;
  }

  function clearSession() {
    try { window.SessionManager.logout(); } catch {}
  }

  // ═══════════════════════════════════════════════════════
  //  AUTO-RUN: apply nav visibility on page load
  // ═══════════════════════════════════════════════════════
  function autoRun() {
    setTimeout(async () => {
      applyNavVisibility();
      try { await applyNavPermissions(); } catch {}
    }, 0);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoRun);
  } else {
    autoRun();
  }

  return {
    // Admin
    createUser, resetUserPassword, deleteUserAccount, listUsers,
    getUserActivity, setUserPermission, setAllPermissions,
    // Users
    changeOwnPassword,
    // Permissions
    getPermissionsForUser, checkPageAccess, getEffectivePermissions,
    ALL_KNOWN,
    // Utilities
    logActivity,
    // Nav
    applyNavVisibility, applyNavPermissions, isCurrentUserAdmin,
    // Session
    clearSession
  };
})();
