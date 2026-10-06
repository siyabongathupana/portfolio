// shared.js – Supabase edition (COMPLETE — nothing omitted)

// ═══════════════════════════════════════════════════════════
//  LOADING OVERLAY
// ═══════════════════════════════════════════════════════════
window.showLoading = function (msg = 'Processing...') {
  let loader = document.getElementById('globalLoader');
  if (!loader) {
    loader = document.createElement('div');
    loader.id = 'globalLoader';
    loader.innerHTML = `
      <div class="loader-overlay">
        <div class="loader-spinner"></div>
        <p class="loader-text">${msg}</p>
      </div>`;
    document.body.appendChild(loader);
  } else {
    loader.querySelector('.loader-text').textContent = msg;
    loader.style.display = 'flex';
  }
};
window.hideLoading = function () {
  const loader = document.getElementById('globalLoader');
  if (loader) loader.style.display = 'none';
};

window.escapeHtml = function (str) {
  if (!str) return '';
  return String(str).replace(/[&<>]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;'})[m] || m);
};

// ═══════════════════════════════════════════════════════════
//  EXCEL ACCESS CONTROL
// ═══════════════════════════════════════════════════════════
window.canDownloadExcel = function () {
  try {
    const isAdmin = window.SessionManager?.isAdmin?.() === true;
    const publicAllowed = window.APP_CONFIG?.excelReportEnabled === true;
    return isAdmin || publicAllowed;
  } catch (e) { return false; }
};

// ═══════════════════════════════════════════════════════════
//  SESSION MANAGER
// ═══════════════════════════════════════════════════════════
window.SessionManager = (() => {
  return {
    getCurrentUser: () => {
      const u = window.__currentAuthUser || null;
      if (!u) return null;
      return {
        id: u.id,
        username: u.email,
        email: u.email,
        fullName: u.user_metadata?.full_name || u.email.split('@')[0]
      };
    },
    getCurrentUserId: () => window.__currentAuthUser?.id || null,
    isAdmin: () => {
      const u = window.__currentAuthUser;
      if (!u) return false;
      const admins = window.APP_CONFIG?.adminUsers || [];
      return admins.includes(u.email);
    },
    logout: async () => {
      try { await window.supabase.auth.signOut(); } catch (e) {}
      window.__currentAuthUser = null;
    }
  };
})();

// ═══════════════════════════════════════════════════════════
//  LOGGER
// ═══════════════════════════════════════════════════════════
window.Logger = {
  async log(action, details, level = 'INFO') {
    const user = window.SessionManager.getCurrentUser();
    if (!user) return;
    try {
      await window.supabase.from('activity_logs').insert({
        user_id: user.id,
        action,
        details,
        page: window.location.pathname,
        user_agent: navigator.userAgent
      });
    } catch (e) { console.warn('Log failed:', e); }
  },
  async logActivity(module, action, details, metadata = {}) {
    const extra = Object.keys(metadata).length ? ' ' + JSON.stringify(metadata) : '';
    await this.log(`${module}_${action}`, `${module}: ${action} - ${details}${extra}`);
  },
  async getLogsForUser(targetUserId) {
    const { data, error } = await window.supabase
      .from('activity_logs')
      .select('*')
      .eq('user_id', targetUserId)
      .order('created_at', { ascending: false })
      .limit(500);
    if (error) return 'Unable to retrieve logs.';
    if (!data?.length) return 'No logs found for this user.';
    return data.map(l => `[${l.created_at}] [${l.action}] ${l.details || ''}`).join('\n');
  },
  async getAllUserLogs() {
    const { data, error } = await window.supabase
      .from('activity_logs')
      .select('*, profiles:user_id(email)')
      .order('created_at', { ascending: false })
      .limit(2000);
    if (error || !data) return {};
    const grouped = {};
    for (const row of data) {
      const email = row.profiles?.email || row.user_id;
      (grouped[email] = grouped[email] || []).push(
        `[${row.created_at}] [${row.action}] ${row.details || ''}`
      );
    }
    const out = {};
    for (const [email, lines] of Object.entries(grouped)) out[email] = lines.join('\n');
    return out;
  }
};

// ═══════════════════════════════════════════════════════════
//  FOOTER
// ═══════════════════════════════════════════════════════════
window.updateUserFooter = function () {
  const el = document.getElementById('userFooterStatus');
  if (!el) return;
  const render = () => {
    const user = window.SessionManager.getCurrentUser();
    if (user) {
      el.innerHTML = `Logged in as: <strong>${window.escapeHtml(user.email)}</strong>
        | <a href="admin.html" style="color:#2fc7ff;">Dashboard</a>
        | <a href="#" id="logoutFromFooter" style="color:#ff6b6b;">Logout</a>`;
      const btn = document.getElementById('logoutFromFooter');
      if (btn) btn.addEventListener('click', async (e) => {
        e.preventDefault();
        await window.Logger.log('logout', 'User logged out');
        await window.SessionManager.logout();
        location.href = 'index.html';
      });
    } else {
      el.innerHTML = `Visitor – viewing portfolio of <strong>${window.APP_CONFIG.publicProfileEmail}</strong>
        | <a href="login.html" style="color:#2fc7ff;">Login</a>`;
    }
  };
  if (window.__currentAuthUser !== undefined) render();
  else window.authReady.then(render);
};

// ═══════════════════════════════════════════════════════════
//  IMAGE COMPRESSION
// ═══════════════════════════════════════════════════════════
window.compressImage = function (file, maxW = 1600, maxH = 1600, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        const ratio = Math.min(maxW / width, maxH / height);
        if (ratio < 1) { width = Math.round(width * ratio); height = Math.round(height * ratio); }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

// ═══════════════════════════════════════════════════════════
//  IMAGE UPLOAD / DELETE
// ═══════════════════════════════════════════════════════════
window.uploadImage = async function (file, bucket = 'project-images') {
  const user = window.SessionManager.getCurrentUser();
  if (!user) throw new Error('Not logged in');
  const dataUrl = await window.compressImage(file, 1600, 1600, 0.85);
  const blob = await (await fetch(dataUrl)).blob();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `${user.id}/${Date.now()}_${safeName}`;
  const { data, error } = await window.supabase.storage
    .from(bucket).upload(path, blob, { contentType: 'image/jpeg', upsert: false });
  if (error) throw error;
  const { data: signed, error: signErr } = await window.supabase.storage
    .from(bucket).createSignedUrl(data.path, 60 * 60 * 24 * 365);
  if (signErr) throw signErr;
  await window.Logger.logActivity('image', 'upload', `Uploaded ${path}`);
  return signed.signedUrl;
};
window.uploadImageToGitHub = window.uploadImage;

window.deleteImage = async function (imageUrl, bucket) {
  if (!imageUrl) return;
  try {
    let resolvedBucket = bucket;
    let path = null;
    const m = imageUrl.match(/\/storage\/v1\/object\/(?:sign|public)\/([^/]+)\/([^?]+)/);
    if (m) {
      resolvedBucket = resolvedBucket || m[1];
      path = decodeURIComponent(m[2]);
    }
    if (!resolvedBucket || !path) { console.warn('Cannot derive path from URL:', imageUrl); return; }
    const { error } = await window.supabase.storage.from(resolvedBucket).remove([path]);
    if (error) throw error;
    await window.Logger.logActivity('image', 'delete', `Deleted ${resolvedBucket}/${path}`);
  } catch (e) { console.warn('Could not delete image:', e); }
};
window.deleteImageFromGitHub = window.deleteImage;

// ═══════════════════════════════════════════════════════════
//  ACCOUNT MANAGER (Supabase-backed)
// ═══════════════════════════════════════════════════════════
window.AccountManager = {
  async isEmailVerified(email) {
    const { data, error } = await window.supabase
      .from('profiles')
      .select('email_confirmed_at')
      .eq('email', email)
      .maybeSingle();
    if (error || !data) return false;
    return !!data.email_confirmed_at;
  },

  async listUsers() {
    const { data, error } = await window.supabase
      .from('profiles')
      .select('id, email, full_name, role, permissions, banned, created_at')
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return data || [];
  },

  async getBlockedUsers() {
    const { data, error } = await window.supabase
      .from('profiles')
      .select('email')
      .eq('banned', true);
    if (error) return [];
    return (data || []).map(r => r.email);
  },

  async toggleBlock(email, block) {
    const { error } = await window.supabase
      .from('profiles')
      .update({ banned: !!block })
      .eq('email', email);
    if (error) throw new Error(error.message);
    await window.Logger.logActivity('admin', 'toggle_block',
      `${block ? 'Blocked' : 'Unblocked'} ${email}`);
    return true;
  },

  async register(email, password, fullName = '') {
    const { data, error } = await window.supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName || email.split('@')[0] },
        emailRedirectTo: location.origin + location.pathname.replace(/[^/]*$/, 'admin.html')
      }
    });
    if (error) throw new Error(error.message);
    await window.Logger.logActivity('admin', 'user_create', `Created ${email}`);
    return data.user;
  },

  async login(email, password) {
    const { data, error } = await window.supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
    return data.user;
  },

  async deleteUser(email) {
    try {
      const { data, error } = await window.supabase.functions.invoke('admin-delete-user', {
        body: { email }
      });
      if (!error && data?.ok) {
        await window.Logger.logActivity('admin', 'delete_user', `Deleted ${email}`);
        return true;
      }
    } catch (e) { /* fall through to soft delete */ }

    const { error } = await window.supabase
      .from('profiles')
      .update({ banned: true, deleted: true })
      .eq('email', email);
    if (error) throw new Error(error.message);
    await window.Logger.logActivity('admin', 'user_soft_delete', `Soft-deleted ${email}`);
    return true;
  },

  async getUserStats(email) {
    const { data: profile } = await window.supabase
      .from('profiles').select('id').eq('email', email).maybeSingle();
    if (!profile) return { projects: 0, certificates: 0, timesheetEntries: 0 };

    const [pRes, cRes, tRes] = await Promise.all([
      window.supabase.from('projects').select('id', { count: 'exact', head: true }).eq('user_id', profile.id),
      window.supabase.from('certificates').select('id', { count: 'exact', head: true }).eq('user_id', profile.id),
      window.supabase.from('timesheet_entries').select('id', { count: 'exact', head: true }).eq('user_id', profile.id)
    ]);

    return {
      projects: pRes.count || 0,
      certificates: cRes.count || 0,
      timesheetEntries: tRes.count || 0
    };
  },

  async resetUserPassword(email) {
    const { error } = await window.supabase.auth.resetPasswordForEmail(email, {
      redirectTo: location.origin + location.pathname.replace(/[^/]*$/, 'set-password.html')
    });
    if (error) throw new Error(error.message);
    await window.Logger.logActivity('admin', 'reset_password', `Reset email sent to ${email}`);
    return true;
  }
};

// ═══════════════════════════════════════════════════════════
//  PORTFOLIO DATA
// ═══════════════════════════════════════════════════════════
window.portfolioData = (() => {

  async function loadProjects() {
    const user = window.SessionManager.getCurrentUser();
    if (!user) return {};
    const { data, error } = await window.supabase
      .from('projects').select('*').eq('user_id', user.id)
      .order('updated_at', { ascending: false });
    if (error) throw error;
    const out = {};
    for (const p of data || []) {
      out[p.id] = {
        id: p.id,
        title: p.title, shortDesc: p.short_desc, description: p.description,
        client: p.client, industry: p.industry, status: p.status,
        duration: p.duration, userRole: p.user_role, teamMembers: p.team_members,
        projectCategory: p.project_category, controllerType: p.controller_type,
        deltaVVersion: p.delta_v_version || p.deltaV_version,
        projectType: p.project_type, cabinetCount: p.cabinet_count,
        io: { AI: p.io_ai, AO: p.io_ao, DI: p.io_di, DO: p.io_do },
        dates: p.dates || {}, team: p.team || {},
        technical: p.technical || {}, workBreakdown: p.work_breakdown || {},
        selectedImages: p.selected_images || [],
        isPublic: p.is_public,
        updatedAt: new Date(p.updated_at).getTime()
      };
    }
    return out;
  }

  async function saveProjects(projects) {
    const user = window.SessionManager.getCurrentUser();
    if (!user) throw new Error('Not logged in');
    const { data: existing, error: exErr } = await window.supabase
      .from('projects').select('id').eq('user_id', user.id);
    if (exErr) throw exErr;
    const existingIds = new Set((existing || []).map(r => r.id));

    for (const [id, p] of Object.entries(projects)) {
      const row = {
        id, user_id: user.id,
        title: p.title || 'Untitled', short_desc: p.shortDesc || null,
        description: p.description || null, client: p.client || null,
        industry: p.industry || null, status: p.status || 'Ongoing',
        duration: p.duration || null, user_role: p.userRole || null,
        team_members: p.teamMembers || null,
        project_category: p.projectCategory || null,
        controller_type: p.controllerType || null,
        deltaV_version: p.deltaVVersion || null,
        project_type: p.projectType || null,
        cabinet_count: p.cabinetCount || 0,
        io_ai: p.io?.AI || 0, io_ao: p.io?.AO || 0,
        io_di: p.io?.DI || 0, io_do: p.io?.DO || 0,
        dates: p.dates || null, team: p.team || null,
        technical: p.technical || null, work_breakdown: p.workBreakdown || null,
        selected_images: p.selectedImages || [],
        is_public: p.isPublic !== undefined ? p.isPublic : true
      };
      const { error } = await window.supabase.from('projects').upsert(row);
      if (error) throw error;
      existingIds.delete(id);
    }
    for (const goneId of existingIds) {
      await window.supabase.from('projects').delete().eq('id', goneId);
    }
    await window.Logger.logActivity('project', 'save', `Saved ${Object.keys(projects).length} projects`);
  }

  async function loadProjectsForView() {
    const user = window.SessionManager.getCurrentUser();
    if (user) return loadProjects();
    const { data, error } = await window.supabase
      .from('projects').select('*').eq('is_public', true)
      .order('updated_at', { ascending: false });
    if (error) return {};
    const out = {};
    for (const p of data || []) {
      out[p.id] = {
        id: p.id,
        title: p.title, shortDesc: p.short_desc, description: p.description,
        client: p.client, industry: p.industry, status: p.status,
        duration: p.duration, userRole: p.user_role, teamMembers: p.team_members,
        projectCategory: p.project_category, controllerType: p.controller_type,
        deltaVVersion: p.delta_v_version, projectType: p.project_type,
        cabinetCount: p.cabinet_count,
        io: { AI: p.io_ai, AO: p.io_ao, DI: p.io_di, DO: p.io_do },
        dates: p.dates || {}, team: p.team || {},
        technical: p.technical || {}, workBreakdown: p.work_breakdown || {},
        selectedImages: p.selected_images || [],
        isPublic: p.is_public,
        updatedAt: new Date(p.updated_at).getTime()
      };
    }
    return out;
  }

  async function loadCertificates() {
    const user = window.SessionManager.getCurrentUser();
    if (!user) return [];
    const { data, error } = await window.supabase
      .from('certificates').select('*').eq('user_id', user.id)
      .order('date', { ascending: false });
    if (error) throw error;
    return (data || []).map(c => ({
      id: c.id, title: c.title, issuer: c.issuer, date: c.date,
      link: c.link, thumbnail: c.thumbnail,
      updatedAt: new Date(c.updated_at).getTime()
    }));
  }

  async function saveCertificates(certs) {
    const user = window.SessionManager.getCurrentUser();
    if (!user) throw new Error('Not logged in');
    const { data: existing, error: exErr } = await window.supabase
      .from('certificates').select('id').eq('user_id', user.id);
    if (exErr) throw exErr;
    const existingIds = new Set((existing || []).map(r => r.id));
    for (const cert of certs) {
      const row = {
        id: cert.id || crypto.randomUUID(),
        user_id: user.id,
        title: cert.title || 'Certificate',
        issuer: cert.issuer || null, date: cert.date || null,
        link: cert.link || null, thumbnail: cert.thumbnail || null,
        is_public: cert.isPublic !== undefined ? cert.isPublic : true
      };
      const { error } = await window.supabase.from('certificates').upsert(row);
      if (error) throw error;
      existingIds.delete(row.id);
    }
    for (const goneId of existingIds) {
      await window.supabase.from('certificates').delete().eq('id', goneId);
    }
    await window.Logger.logActivity('certificate', 'save', `Saved ${certs.length} certificates`);
  }

  async function loadCertificatesForView() {
    const user = window.SessionManager.getCurrentUser();
    if (user) return loadCertificates();
    const { data, error } = await window.supabase
      .from('certificates').select('*').eq('is_public', true)
      .order('date', { ascending: false });
    if (error) return [];
    return (data || []).map(c => ({
      id: c.id, title: c.title, issuer: c.issuer, date: c.date,
      link: c.link, thumbnail: c.thumbnail
    }));
  }

  async function blockProject(projectId, block = true) {
    const { error } = await window.supabase
      .from('projects').update({ is_public: !block }).eq('id', projectId);
    if (error) throw error;
    await window.Logger.logActivity('project', 'block',
      `${block ? 'Blocked' : 'Unblocked'} ${projectId}`);
    return true;
  }

  function exportData() {
    Promise.all([loadProjects(), loadCertificates()]).then(([projects, certs]) => {
      const zip = new JSZip();
      zip.file('projects.json', JSON.stringify(projects, null, 2));
      zip.file('certificates.json', JSON.stringify(certs, null, 2));
      zip.generateAsync({ type: 'blob' }).then(blob => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `portfolio_data_${window.SessionManager.getCurrentUser()?.email || 'default'}.zip`;
        a.click();
      });
    });
  }

  return {
    loadProjects, saveProjects, loadCertificates, saveCertificates,
    loadProjectsForView, loadCertificatesForView,
    exportData, blockProject
  };
})();

// ═══════════════════════════════════════════════════════════
//  IMAGE PROTECTION
// ═══════════════════════════════════════════════════════════
window.lazyLoadImages = function () {
  if (!('IntersectionObserver' in window)) {
    document.querySelectorAll('img[data-src]').forEach(img => {
      img.src = img.dataset.src; img.removeAttribute('data-src');
    });
    return;
  }
  const obs = new IntersectionObserver((entries, observer) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const img = entry.target;
        if (img.dataset.src) { img.src = img.dataset.src; img.removeAttribute('data-src'); }
        observer.unobserve(img);
      }
    });
  });
  document.querySelectorAll('img[data-src]').forEach(img => obs.observe(img));
};

window.protectImages = function () {
  const selectors = '.project-img, .modal-carousel-img, .gallery-img, .cert-card img, .about-img';
  document.querySelectorAll(selectors).forEach(img => {
    img.setAttribute('draggable', 'false');
    img.setAttribute('ondragstart', 'return false;');
    img.style.webkitUserDrag = 'none';
    img.style.webkitTouchCallout = 'none';
    img.style.webkitUserSelect = 'none';
    img.style.userSelect = 'none';
    if (!img.dataset.protected) {
      img.dataset.protected = '1';
      img.addEventListener('contextmenu', e => e.preventDefault());
      img.addEventListener('dragstart', e => e.preventDefault());
      img.addEventListener('selectstart', e => e.preventDefault());
      img.addEventListener('touchstart', e => {
        img._longPressTimer = setTimeout(() => { try { e.preventDefault(); } catch (_) {} }, 500);
      }, { passive: true });
      img.addEventListener('touchend', () => { clearTimeout(img._longPressTimer); });
      img.addEventListener('touchmove', () => { clearTimeout(img._longPressTimer); });
    }
  });
};
window.protectGallery = window.protectImages;

// ═══════════════════════════════════════════════════════════
//  TOASTS
// ═══════════════════════════════════════════════════════════
function showToast(message, type = 'success') {
  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    container.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:1050;';
    document.body.appendChild(container);
  }
  const toastId = 'toast-' + Date.now();
  const bgColor = type === 'success' ? '#28a745'
                : type === 'error'   ? '#dc3545'
                : type === 'warning' ? '#ffc107'
                : '#17a2b8';
  container.insertAdjacentHTML('beforeend', `
    <div id="${toastId}" style="background:${bgColor};color:white;padding:12px 20px;border-radius:8px;margin-top:10px;min-width:200px;max-width:90%;box-shadow:0 2px 10px rgba(0,0,0,0.1);animation:fadeInOut 3s ease;font-size:14px;word-break:break-word;">${message}</div>
  `);
  setTimeout(() => {
    const t = document.getElementById(toastId);
    if (t) t.remove();
  }, 3000);
}
window.showToast = showToast;

// ═══════════════════════════════════════════════════════════
//  QR CODE HELPER
// ═══════════════════════════════════════════════════════════
async function generateQRCodeDataURL(text, size = 50) {
  return new Promise((resolve) => {
    if (typeof QRCode === 'undefined') { resolve(null); return; }
    const container = document.createElement('div');
    try {
      new QRCode(container, {
        text, width: size, height: size,
        colorDark: '#000000', colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.L
      });
      setTimeout(() => {
        const canvas = container.querySelector('canvas');
        resolve(canvas ? canvas.toDataURL('image/png') : null);
      }, 100);
    } catch (e) { resolve(null); }
  });
}

// ═══════════════════════════════════════════════════════════
//  EXCEL PROJECT REPORT (FULL — nothing omitted)
// ═══════════════════════════════════════════════════════════
window.generateProjectReport = async function (projectId) {
  if (!window.canDownloadExcel()) {
    showToast('Excel reports are locked for now — they’ll be available soon.', 'info');
    return;
  }

  if (typeof ExcelJS === 'undefined') {
    await new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js';
      s.onload = res; s.onerror = () => rej(new Error('Failed to load ExcelJS'));
      document.head.appendChild(s);
    });
  }
  if (typeof saveAs === 'undefined') {
    await new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/FileSaver.js/2.0.5/FileSaver.min.js';
      s.onload = res; s.onerror = () => rej(new Error('Failed to load FileSaver'));
      document.head.appendChild(s);
    });
  }

  const data = await window.portfolioData.loadProjectsForView();
  const proj = data[projectId];
  if (!proj) { alert('Project not found!'); return; }
  if (proj.blocked === true && !window.SessionManager.isAdmin()) {
    alert('Access denied: This project is blocked.'); return;
  }

  const isDeltaV = proj.projectCategory === 'deltaV' || proj.controllerType;
  let selectedImages = proj.selectedImages || [];

  if (selectedImages.length > 0) {
    const imageOptions = selectedImages.map((img, idx) => `
      <div style="display:flex;align-items:center;margin-bottom:12px;padding:10px;border:1px solid #e2e8f0;border-radius:10px;background:#fff;gap:12px;">
        <input type="checkbox" class="xlsx-image-checkbox" data-idx="${idx}" checked style="width:18px;height:18px;cursor:pointer;">
        <img src="${img.url}" style="width:56px;height:56px;object-fit:cover;border-radius:8px;">
        <div style="flex:1;min-width:0;">
          <div style="font-weight:600;color:#1e2a3e;font-size:0.9rem;">Image ${idx + 1}</div>
          <div style="font-size:12px;color:#666;">${window.escapeHtml(img.caption || 'No caption')}</div>
        </div>
      </div>`).join('');

    const modalHtml = `
      <div id="xlsxImageModal" style="position:fixed;inset:0;background:rgba(0,0,0,0.65);z-index:10000;display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(4px);">
        <div style="background:#fff;border-radius:20px;max-width:560px;width:100%;max-height:85vh;overflow:auto;padding:26px;font-family:Inter,sans-serif;">
          <h3 style="margin-bottom:18px;color:#0b2b3b;">📊 Select Images for Excel Report</h3>
          <div id="xlsxImageList">${imageOptions}</div>
          <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:22px;flex-wrap:wrap;">
            <button id="xlsxSelectAll" style="padding:8px 16px;border:1px solid #cbd5e1;background:#f8fafc;border-radius:8px;cursor:pointer;">Select All</button>
            <button id="xlsxDeselectAll" style="padding:8px 16px;border:1px solid #cbd5e1;background:#f8fafc;border-radius:8px;cursor:pointer;">Deselect All</button>
            <button id="xlsxCancel" style="padding:8px 16px;border:1px solid #cbd5e1;background:#fff;border-radius:8px;cursor:pointer;">Cancel</button>
            <button id="xlsxConfirm" style="padding:8px 22px;background:#28a745;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:600;">Generate Excel</button>
          </div>
        </div>
      </div>`;
    document.body.insertAdjacentHTML('beforeend', modalHtml);

    const result = await new Promise((resolve) => {
      const modal = document.getElementById('xlsxImageModal');
      document.getElementById('xlsxSelectAll').onclick = () => modal.querySelectorAll('.xlsx-image-checkbox').forEach(cb => cb.checked = true);
      document.getElementById('xlsxDeselectAll').onclick = () => modal.querySelectorAll('.xlsx-image-checkbox').forEach(cb => cb.checked = false);
      document.getElementById('xlsxConfirm').onclick = () => {
        const sel = [];
        modal.querySelectorAll('.xlsx-image-checkbox:checked').forEach(cb => sel.push(selectedImages[parseInt(cb.dataset.idx)]));
        modal.remove(); resolve(sel);
      };
      document.getElementById('xlsxCancel').onclick = () => { modal.remove(); resolve(null); };
    });
    if (result === null) return;
    selectedImages = result;
  }

  window.showLoading('Generating Excel report...');

  try {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Your Portfolio';
    workbook.created = new Date();

    const NAVY = 'FF0B2B3B';
    const ACCENT = 'FF2FC7FF';
    const LIGHT = 'FFEEF3FC';
    const PURPLE = 'FFA29BFE';
    const BORDER = {
      top:    { style: 'thin', color: { argb: 'FFB0BEC5' } },
      bottom: { style: 'thin', color: { argb: 'FFB0BEC5' } },
      left:   { style: 'thin', color: { argb: 'FFB0BEC5' } },
      right:  { style: 'thin', color: { argb: 'FFB0BEC5' } }
    };

    function styleSectionHeader(cell, text) {
      cell.value = text;
      cell.font = { size: 12, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A4D5F' } };
      cell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
    }
    function styleLabel(cell, text) {
      cell.value = text;
      cell.font = { size: 10, bold: true, color: { argb: NAVY } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT } };
      cell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1, wrapText: true };
      cell.border = BORDER;
    }
    function styleValue(cell, text) {
      cell.value = (text != null && text !== '') ? text : '—';
      cell.font = { size: 10 };
      cell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1, wrapText: true };
      cell.border = BORDER;
    }
    async function embedImage(imageUrl) {
      const resp = await fetch(imageUrl);
      if (!resp.ok) throw new Error('fetch failed');
      return await resp.arrayBuffer();
    }
    function guessExt(url) {
      const u = (url || '').toLowerCase();
      if (u.includes('.png')) return 'png';
      if (u.includes('.gif')) return 'gif';
      return 'jpeg';
    }

    // ═══ SHEET 1 — OVERVIEW ═══
    const cover = workbook.addWorksheet('Overview', {
      pageSetup: { orientation: 'portrait', fitToPage: true, fitToWidth: 1, paperSize: 9,
        margins: { left: 0.5, right: 0.5, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 } }
    });
    cover.columns = [{ width: 4 }, { width: 24 }, { width: 32 }, { width: 32 }, { width: 24 }, { width: 4 }];

    cover.mergeCells('B2:E2');
    const titleCell = cover.getCell('B2');
    titleCell.value = 'ENGINEERING PROJECT REPORT';
    titleCell.font = { size: 22, bold: true, color: { argb: 'FFFFFFFF' } };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    cover.getRow(2).height = 48;

    cover.mergeCells('B3:E3');
    cover.getCell('B3').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ACCENT } };
    cover.getRow(3).height = 6;

    cover.mergeCells('B5:E6');
    const projTitleCell = cover.getCell('B5');
    projTitleCell.value = proj.title || 'Untitled Project';
    projTitleCell.font = { size: 18, bold: true, color: { argb: NAVY } };
    projTitleCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cover.getRow(5).height = 28; cover.getRow(6).height = 28;

    cover.mergeCells('B7:E7');
    const typeCell = cover.getCell('B7');
    typeCell.value = isDeltaV ? '◆  DELTAV PROJECT' : '◆  GENERAL ENGINEERING PROJECT';
    typeCell.font = { size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    typeCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isDeltaV ? ACCENT : PURPLE } };
    typeCell.alignment = { horizontal: 'center', vertical: 'middle' };
    cover.getRow(7).height = 24;

    let coverImageRow = 9;
    if (selectedImages.length > 0 && selectedImages[0].url) {
      try {
        const buf = await embedImage(selectedImages[0].url);
        const imgId = workbook.addImage({ buffer: buf, extension: guessExt(selectedImages[0].url) });
        cover.addImage(imgId, { tl: { col: 1, row: 8 }, ext: { width: 480, height: 300 }, editAs: 'oneCell' });
        for (let i = 9; i < 25; i++) cover.getRow(i).height = 18;
        coverImageRow = 25;
      } catch (e) { console.warn('Cover image embed failed:', e); coverImageRow = 10; }
    }

    let r = coverImageRow;
    cover.mergeCells(`B${r}:E${r}`);
    styleSectionHeader(cover.getCell(`B${r}`), '📋   PROJECT SNAPSHOT');
    cover.getRow(r).height = 24; r++;

    const infoPairs = [
      ['Client / Company', proj.client],
      ['Industry', proj.industry],
      ['Project Type', proj.projectType || (isDeltaV ? 'DCS' : 'General Engineering')],
      ['Status', proj.status],
      ['Duration', proj.duration],
      ['My Role', proj.userRole],
      ['Team', proj.teamMembers || (proj.team
        ? [proj.team.lead && 'Lead: ' + proj.team.lead,
           proj.team.engineer && 'Engineer: ' + proj.team.engineer,
           proj.team.technician && 'Tech: ' + proj.team.technician].filter(Boolean).join(' · ')
        : '')]
    ];
    if (isDeltaV && proj.dates) {
      infoPairs.push(['Start Date', proj.dates.start]);
      infoPairs.push(['Finish Date', proj.dates.finish]);
    }
    for (const [label, value] of infoPairs) {
      if (!value) continue;
      styleLabel(cover.getCell(`B${r}`), label);
      cover.mergeCells(`C${r}:E${r}`);
      styleValue(cover.getCell(`C${r}`), value);
      cover.getRow(r).height = 22; r++;
    }

    r += 2;
    cover.mergeCells(`B${r}:E${r}`);
    const footerCell = cover.getCell(`B${r}`);
    footerCell.value = `Generated: ${new Date().toLocaleString()}  ·  Your Portfolio System`;
    footerCell.font = { size: 9, italic: true, color: { argb: 'FF6B7D8F' } };
    footerCell.alignment = { horizontal: 'center' };

    // ═══ SHEET 2 — SUMMARY & METRICS ═══
    const summary = workbook.addWorksheet('Summary & Metrics', {
      pageSetup: { orientation: 'portrait', fitToPage: true, fitToWidth: 1, paperSize: 9 }
    });
    summary.columns = [{ width: 4 }, { width: 28 }, { width: 26 }, { width: 26 }, { width: 4 }];

    summary.mergeCells('B2:D2');
    const sumTitle = summary.getCell('B2');
    sumTitle.value = 'EXECUTIVE SUMMARY & KEY METRICS';
    sumTitle.font = { size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
    sumTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
    sumTitle.alignment = { horizontal: 'center', vertical: 'middle' };
    summary.getRow(2).height = 38;

    let sr = 4;
    summary.mergeCells(`B${sr}:D${sr}`);
    styleSectionHeader(summary.getCell(`B${sr}`), '📝   PROJECT DESCRIPTION');
    summary.getRow(sr).height = 24; sr++;

    const descText = proj.shortDesc || proj.description || 'No description provided.';
    summary.mergeCells(`B${sr}:D${sr}`);
    const descCell = summary.getCell(`B${sr}`);
    descCell.value = descText;
    descCell.font = { size: 10 };
    descCell.alignment = { horizontal: 'left', vertical: 'top', wrapText: true, indent: 1 };
    descCell.border = BORDER;
    summary.getRow(sr).height = Math.max(60, Math.ceil(descText.length / 110) * 14);
    sr += 2;

    summary.mergeCells(`B${sr}:D${sr}`);
    styleSectionHeader(summary.getCell(`B${sr}`), '📊   KEY METRICS');
    summary.getRow(sr).height = 24; sr++;

    const mh = summary.getRow(sr);
    mh.getCell(2).value = 'Metric';
    mh.getCell(2).font = { size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    mh.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
    mh.getCell(2).alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
    mh.getCell(2).border = BORDER;
    summary.mergeCells(`C${sr}:D${sr}`);
    mh.getCell(3).value = 'Value';
    mh.getCell(3).font = { size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    mh.getCell(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
    mh.getCell(3).alignment = { horizontal: 'center', vertical: 'middle' };
    mh.getCell(3).border = BORDER;
    summary.getRow(sr).height = 22; sr++;

    const metrics = [['Status', proj.status || 'N/A']];
    if (isDeltaV) {
      metrics.push(['Controller Type', proj.controllerType || 'N/A']);
      metrics.push(['DeltaV Version', proj.deltaVVersion || 'N/A']);
      metrics.push(['Cabinets', proj.cabinetCount || 0]);
      const io = proj.io || { AI: 0, AO: 0, DI: 0, DO: 0 };
      metrics.push(['Total I/O', (io.AI || 0) + (io.AO || 0) + (io.DI || 0) + (io.DO || 0)]);
    } else {
      metrics.push(['Duration', proj.duration || 'N/A']);
      metrics.push(['Role', proj.userRole || 'N/A']);
    }
    metrics.push(['Images', selectedImages.length]);

    for (const [label, value] of metrics) {
      styleLabel(summary.getCell(`B${sr}`), label);
      summary.mergeCells(`C${sr}:D${sr}`);
      styleValue(summary.getCell(`C${sr}`), String(value));
      summary.getRow(sr).height = 20; sr++;
    }
    sr++;

    summary.mergeCells(`B${sr}:D${sr}`);
    styleSectionHeader(summary.getCell(`B${sr}`), '🎯   MY RESPONSIBILITIES');
    summary.getRow(sr).height = 24; sr++;

    summary.mergeCells(`B${sr}:D${sr}`);
    const respCell = summary.getCell(`B${sr}`);
    respCell.value = proj.userRole
      ? `${proj.userRole}\n\n${proj.shortDesc || proj.description || ''}`
      : (proj.shortDesc || proj.description || 'See project description.');
    respCell.font = { size: 10 };
    respCell.alignment = { horizontal: 'left', vertical: 'top', wrapText: true, indent: 1 };
    respCell.border = BORDER;
    summary.getRow(sr).height = Math.max(60, Math.ceil((respCell.value || '').length / 100) * 14);

    // ═══ SHEET 3 — TECHNICAL DETAILS ═══
    const tech = workbook.addWorksheet('Technical Details', {
      pageSetup: { orientation: 'portrait', fitToPage: true, fitToWidth: 1, paperSize: 9 }
    });
    tech.columns = [{ width: 4 }, { width: 28 }, { width: 26 }, { width: 26 }, { width: 4 }];

    tech.mergeCells('B2:D2');
    const techTitle = tech.getCell('B2');
    techTitle.value = 'TECHNICAL DETAILS';
    techTitle.font = { size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
    techTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
    techTitle.alignment = { horizontal: 'center', vertical: 'middle' };
    tech.getRow(2).height = 38;

    let tr = 4;
    if (isDeltaV) {
      tech.mergeCells(`B${tr}:D${tr}`);
      styleSectionHeader(tech.getCell(`B${tr}`), '⚙️   DELTAV CONFIGURATION');
      tech.getRow(tr).height = 24; tr++;

      const dvItems = [
        ['Controller Type', proj.controllerType],
        ['DeltaV Version', proj.deltaVVersion],
        ['Project Type', proj.projectType],
        ['Cabinet Count', proj.cabinetCount]
      ];
      for (const [label, value] of dvItems) {
        if (value == null || value === '') continue;
        styleLabel(tech.getCell(`B${tr}`), label);
        tech.mergeCells(`C${tr}:D${tr}`);
        styleValue(tech.getCell(`C${tr}`), String(value));
        tech.getRow(tr).height = 20; tr++;
      }
      tr++;

      tech.mergeCells(`B${tr}:D${tr}`);
      styleSectionHeader(tech.getCell(`B${tr}`), '🔌   I/O SUMMARY');
      tech.getRow(tr).height = 24; tr++;

      const io = proj.io || { AI: 0, AO: 0, DI: 0, DO: 0 };
      const maxIO = Math.max(io.AI || 0, io.AO || 0, io.DI || 0, io.DO || 0, 1);

      ['Type', 'Count', 'Visual'].forEach((h, i) => {
        const cell = tech.getRow(tr).getCell(2 + i);
        cell.value = h;
        cell.font = { size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
        cell.alignment = { horizontal: i === 2 ? 'left' : 'center', vertical: 'middle', indent: i === 2 ? 1 : 0 };
        cell.border = BORDER;
      });
      tech.getRow(tr).height = 22; tr++;

      const ioRows = [
        ['AI (Analog Input)',  io.AI || 0],
        ['AO (Analog Output)', io.AO || 0],
        ['DI (Digital Input)', io.DI || 0],
        ['DO (Digital Output)',io.DO || 0]
      ];
      for (const [label, count] of ioRows) {
        styleLabel(tech.getCell(`B${tr}`), label);
        const cCell = tech.getCell(`C${tr}`);
        cCell.value = count;
        cCell.font = { size: 11, bold: true };
        cCell.alignment = { horizontal: 'center', vertical: 'middle' };
        cCell.border = BORDER;
        const barLen = Math.round((count / maxIO) * 30);
        const vCell = tech.getCell(`D${tr}`);
        vCell.value = barLen > 0 ? '█'.repeat(barLen) : '—';
        vCell.font = { size: 10, color: { argb: ACCENT } };
        vCell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
        vCell.border = BORDER;
        tech.getRow(tr).height = 20; tr++;
      }

      const totalIO = (io.AI || 0) + (io.AO || 0) + (io.DI || 0) + (io.DO || 0);
      tech.getCell(`B${tr}`).value = 'TOTAL I/O';
      tech.getCell(`B${tr}`).font = { size: 10, bold: true, color: { argb: NAVY } };
      tech.getCell(`B${tr}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ACCENT } };
      tech.getCell(`B${tr}`).alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
      tech.getCell(`B${tr}`).border = BORDER;
      tech.getCell(`C${tr}`).value = totalIO;
      tech.getCell(`C${tr}`).font = { size: 12, bold: true, color: { argb: NAVY } };
      tech.getCell(`C${tr}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ACCENT } };
      tech.getCell(`C${tr}`).alignment = { horizontal: 'center', vertical: 'middle' };
      tech.getCell(`C${tr}`).border = BORDER;
      tech.getCell(`D${tr}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ACCENT } };
      tech.getCell(`D${tr}`).border = BORDER;
      tech.getRow(tr).height = 24; tr += 2;

      if (proj.dates && (proj.dates.start || proj.dates.finish || proj.dates.ifat || proj.dates.cfat)) {
        tech.mergeCells(`B${tr}:D${tr}`);
        styleSectionHeader(tech.getCell(`B${tr}`), '📅   PROJECT DATES');
        tech.getRow(tr).height = 24; tr++;
        for (const [label, value] of [
          ['Start Date', proj.dates.start],
          ['Finish Date', proj.dates.finish],
          ['IFAT', proj.dates.ifat],
          ['CFAT', proj.dates.cfat]
        ]) {
          if (!value) continue;
          styleLabel(tech.getCell(`B${tr}`), label);
          tech.mergeCells(`C${tr}:D${tr}`);
          styleValue(tech.getCell(`C${tr}`), value);
          tech.getRow(tr).height = 20; tr++;
        }
        tr++;
      }

      if (proj.team && (proj.team.lead || proj.team.engineer || proj.team.technician)) {
        tech.mergeCells(`B${tr}:D${tr}`);
        styleSectionHeader(tech.getCell(`B${tr}`), '👥   PROJECT TEAM');
        tech.getRow(tr).height = 24; tr++;
        for (const [label, value] of [
          ['Lead Engineer', proj.team.lead],
          ['Project Engineer', proj.team.engineer],
          ['Technician', proj.team.technician]
        ]) {
          if (!value) continue;
          styleLabel(tech.getCell(`B${tr}`), label);
          tech.mergeCells(`C${tr}:D${tr}`);
          styleValue(tech.getCell(`C${tr}`), value);
          tech.getRow(tr).height = 20; tr++;
        }
      }
    } else if (proj.technical) {
      tech.mergeCells(`B${tr}:D${tr}`);
      styleSectionHeader(tech.getCell(`B${tr}`), '⚙️   TECHNICAL DETAILS');
      tech.getRow(tr).height = 24; tr++;
      for (const [label, value] of [
        ['Technologies', proj.technical.technologies],
        ['Hardware',     proj.technical.hardware],
        ['Software',     proj.technical.software],
        ['Protocols',    proj.technical.protocols],
        ['Languages',    proj.technical.languages]
      ]) {
        if (!value) continue;
        styleLabel(tech.getCell(`B${tr}`), label);
        tech.mergeCells(`C${tr}:D${tr}`);
        styleValue(tech.getCell(`C${tr}`), value);
        tech.getRow(tr).height = 22; tr++;
      }
    } else {
      tech.mergeCells(`B${tr}:D${tr}`);
      const empty = tech.getCell(`B${tr}`);
      empty.value = 'No technical details provided.';
      empty.font = { size: 10, italic: true, color: { argb: 'FF6B7D8F' } };
      empty.alignment = { horizontal: 'center', vertical: 'middle' };
      tech.getRow(tr).height = 40;
    }

    // ═══ SHEET 4 — WORK BREAKDOWN ═══
    const wbSheet = workbook.addWorksheet('Work Breakdown', {
      pageSetup: { orientation: 'portrait', fitToPage: true, fitToWidth: 1, paperSize: 9 }
    });
    wbSheet.columns = [{ width: 4 }, { width: 28 }, { width: 60 }, { width: 4 }];

    wbSheet.mergeCells('B2:C2');
    const wbTitle = wbSheet.getCell('B2');
    wbTitle.value = 'WORK BREAKDOWN & ANALYSIS';
    wbTitle.font = { size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
    wbTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
    wbTitle.alignment = { horizontal: 'center', vertical: 'middle' };
    wbSheet.getRow(2).height = 38;

    let wr = 4;
    const hasWB = proj.workBreakdown && Object.values(proj.workBreakdown).some(v => v && String(v).trim());
    if (hasWB) {
      const sections = [
        ['Work Breakdown Structure', proj.workBreakdown.workBreakdown],
        ['Problems Encountered',    proj.workBreakdown.problems],
        ['Root Causes',             proj.workBreakdown.rootCauses],
        ['Solutions Implemented',   proj.workBreakdown.solutions],
        ['Improvements Made',       proj.workBreakdown.improvements],
        ['Lessons Learned',         proj.workBreakdown.lessons],
        ['Risks Identified',        proj.workBreakdown.risks],
        ['Testing Procedure',       proj.workBreakdown.testing]
      ];
      for (const [label, content] of sections) {
        if (!content || !String(content).trim()) continue;
        const lCell = wbSheet.getCell(`B${wr}`);
        styleLabel(lCell, label);
        lCell.alignment = { horizontal: 'left', vertical: 'top', wrapText: true, indent: 1 };
        const cCell = wbSheet.getCell(`C${wr}`);
        cCell.value = String(content);
        cCell.font = { size: 10 };
        cCell.alignment = { horizontal: 'left', vertical: 'top', wrapText: true, indent: 1 };
        cCell.border = BORDER;
        const lines = String(content).split('\n').reduce((s, line) => s + Math.max(1, Math.ceil(line.length / 75)), 0);
        wbSheet.getRow(wr).height = Math.max(28, lines * 14);
        wr++;
      }
    } else {
      wbSheet.mergeCells(`B${wr}:C${wr}`);
      const empty = wbSheet.getCell(`B${wr}`);
      empty.value = 'No work breakdown information provided for this project.';
      empty.font = { size: 10, italic: true, color: { argb: 'FF6B7D8F' } };
      empty.alignment = { horizontal: 'center', vertical: 'middle' };
      wbSheet.getRow(wr).height = 40;
    }

    // ═══ SHEET 5 — GALLERY ═══
    if (selectedImages.length > 0) {
      const gallery = workbook.addWorksheet('Gallery', {
        pageSetup: { orientation: 'portrait', fitToPage: true, fitToWidth: 1, paperSize: 9 }
      });
      gallery.columns = [{ width: 4 }, { width: 6 }, { width: 22 }, { width: 44 }, { width: 4 }];

      gallery.mergeCells('B2:D2');
      const galTitle = gallery.getCell('B2');
      galTitle.value = 'PROJECT GALLERY';
      galTitle.font = { size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
      galTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
      galTitle.alignment = { horizontal: 'center', vertical: 'middle' };
      gallery.getRow(2).height = 38;

      const gh = gallery.getRow(4);
      ['#', 'Image', 'Caption'].forEach((h, i) => {
        const cell = gh.getCell(2 + i);
        cell.value = h;
        cell.font = { size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border = BORDER;
      });
      gh.height = 22;

      let gr = 5;
      for (let i = 0; i < selectedImages.length; i++) {
        const img = selectedImages[i];
        gallery.getCell(`B${gr}`).value = i + 1;
        gallery.getCell(`B${gr}`).alignment = { horizontal: 'center', vertical: 'middle' };
        gallery.getCell(`B${gr}`).font = { size: 10, bold: true };
        gallery.getCell(`B${gr}`).border = BORDER;

        let embedded = false;
        try {
          const buf = await embedImage(img.url);
          const imgId = workbook.addImage({ buffer: buf, extension: guessExt(img.url) });
          gallery.addImage(imgId, {
            tl: { col: 2, row: gr - 1 },
            ext: { width: 130, height: 90 },
            editAs: 'oneCell'
          });
          embedded = true;
        } catch (e) { console.warn('Gallery image embed failed:', e); }

        const imgCell = gallery.getCell(`C${gr}`);
        if (!embedded) {
          imgCell.value = img.url;
          imgCell.font = { size: 8, color: { argb: 'FF2FC7FF' } };
          imgCell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
        }
        imgCell.border = BORDER;

        const capCell = gallery.getCell(`D${gr}`);
        capCell.value = img.caption || '(No caption)';
        capCell.font = { size: 9 };
        capCell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
        capCell.border = BORDER;

        gallery.getRow(gr).height = 96;
        gr++;
      }
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const safeName = (proj.title || 'project').replace(/[^a-z0-9]/gi, '_').toLowerCase();
    saveAs(blob, `${safeName}_report_${new Date().toISOString().slice(0, 10)}.xlsx`);
    showToast('Excel report generated successfully!', 'success');
  } catch (err) {
    console.error('Excel generation failed:', err);
    alert('Excel generation failed: ' + err.message);
  } finally {
    window.hideLoading();
  }
};
