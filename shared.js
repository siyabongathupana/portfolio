// shared.js – user-aware data management, GitHub‑stored accounts,
//            blocked users, email notifications (EmailJS),
//            auto‑logout, image protection, PDF generation,
//            public admin profile for visitors

/* ======================================================================
   DEFAULT DATA (fallback if admin profile cannot be fetched)
   ====================================================================== */
const defaultProjects = {
  batch: {
    id: "batch", title: "Batch Automation Upgrade", controllerType: "MD", cabinetCount: 3,
    projectType: "DCS", deltaVVersion: "v14.3",
    io: { AI:48, AO:24, DI:96, DO:48 },
    dates: { start:"2024-01-15", finish:"2024-06-30", ifat:"2024-05-10", cfat:"2024-06-20" },
    siteLocation: "Houston, TX",
    team: { lead: "John Smith", engineer: "Lucas Chen", technician: "Mike Ross" },
    description: "Complete redesign of batch sequence phases, integration with ERP, and OEE dashboard. Achieved 22% reduction in cycle time and 31% decrease in batch exceptions.",
    graphType: "bar",
    selectedImages: [
      { url: "https://picsum.photos/id/21/400/300", caption: "Main control cabinet" },
      { url: "https://picsum.photos/id/47/400/300", caption: "HMI batch overview" }
    ]
  },
  sis: {
    id: "sis", title: "SIS Logic Migration", controllerType: "SQ", cabinetCount: 2,
    projectType: "SIS", deltaVVersion: "v14.0",
    io: { AI:32, AO:16, DI:64, DO:32 },
    dates: { start:"2024-02-01", finish:"2024-07-15", ifat:"2024-06-01", cfat:"2024-07-05" },
    siteLocation: "Baton Rouge, LA",
    team: { lead: "Sarah Lee", engineer: "Lucas Chen", technician: "James Carter" },
    description: "Migrated legacy emergency shutdown system to DeltaV SIS, achieving 99.9% availability and reduced spurious trips by 34%.",
    graphType: "pie",
    selectedImages: [
      { url: "https://picsum.photos/id/19/400/300", caption: "SIS logic solver" },
      { url: "https://picsum.photos/id/39/400/300", caption: "Safety matrix" }
    ]
  },
  apc: {
    id: "apc", title: "Advanced Process Control", controllerType: "IQ", cabinetCount: 1,
    projectType: "DCS", deltaVVersion: "v14.2",
    io: { AI:24, AO:12, DI:32, DO:16 },
    dates: { start:"2024-03-10", finish:"2024-08-20", ifat:"2024-07-10", cfat:"2024-08-10" },
    siteLocation: "Corpus Christi, TX",
    team: { lead: "David Wu", engineer: "Lucas Chen", technician: "Anna Gomez" },
    description: "Model Predictive Control on crude distillation unit. Stabilized product specs, reduced temperature variance 47% and fuel gas consumption 12%.",
    graphType: "line",
    selectedImages: [
      { url: "https://picsum.photos/id/15/400/300", caption: "APC controller configuration" },
      { url: "https://picsum.photos/id/29/400/300", caption: "Trend analysis" }
    ]
  }
};

const defaultCertificates = [
  { id: "cert1", title: "Emerson DeltaV Advanced Training", issuer: "Emerson Educational Services", date: "2023-06", link: "https://drive.google.com/file/d/example1/preview", thumbnail: "https://picsum.photos/id/26/300/200" },
  { id: "cert2", title: "ISA Certified Automation Professional (CAP)", issuer: "ISA", date: "2022-10", link: "https://drive.google.com/file/d/example2/preview", thumbnail: "https://picsum.photos/id/28/300/200" },
  { id: "cert3", title: "IEC 61511 Functional Safety", issuer: "TÜV Rheinland", date: "2024-01", link: "https://drive.google.com/file/d/example3/preview", thumbnail: "https://picsum.photos/id/29/300/200" }
];

/* ======================================================================
   GLOBAL LOADING OVERLAY
   ====================================================================== */
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

/* ======================================================================
   SESSION MANAGER
   ====================================================================== */
window.SessionManager = (() => {
  let current = null;
  return {
    getCurrentUser: () => {
      if (current) return current;
      const stored = sessionStorage.getItem('deltaVUser');
      if (stored) {
        try { current = JSON.parse(stored); } catch(e) {}
      }
      return current;
    },
    setCurrentUser: (username, pat) => {
      current = { username, pat };
      sessionStorage.setItem('deltaVUser', JSON.stringify(current));
    },
    logout: () => {
      current = null;
      sessionStorage.removeItem('deltaVUser');
    }
  };
})();

/* ======================================================================
   ACCOUNT MANAGEMENT (GitHub‑based, email confirmations)
   ====================================================================== */
window.AccountManager = {
  // EmailJS loader
  async _ensureEmailJS() {
    if (typeof emailjs === 'undefined') {
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/@emailjs/browser@3/dist/email.min.js';
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
      });
      emailjs.init(window.APP_CONFIG.emailjs.publicKey);
    }
  },

  // Send an email with given template ID and parameters
  async _sendEmail(templateID, params) {
    await this._ensureEmailJS();
    return emailjs.send(window.APP_CONFIG.emailjs.serviceID, templateID, params);
  },

  // Notify admin about a new user
  async _notifyAdminNewUser(userEmail) {
    const cfg = window.APP_CONFIG.emailjs;
    if (!cfg || !cfg.publicKey || !cfg.adminTemplateID) return;
    try {
      await this._sendEmail(cfg.adminTemplateID, {
        to_email: cfg.adminEmail,
        subject: `New user registered: ${userEmail}`,
        message: `A new user with email ${userEmail} has created an account on DeltaV Portfolio.`
      });
    } catch (e) {
      console.warn('Admin notification email failed:', e);
    }
  },

  // Send confirmation email to the user
  async _notifyUserConfirmation(userEmail) {
    const cfg = window.APP_CONFIG.emailjs;
    if (!cfg || !cfg.publicKey || !cfg.userTemplateID) return;
    try {
      await this._sendEmail(cfg.userTemplateID, {
        to_email: userEmail,
        subject: 'Welcome to DeltaV Portfolio',
        message: `Your account (${userEmail}) has been successfully created. You can now log in and start managing your projects and certificates.`
      });
    } catch (e) {
      console.warn('User confirmation email failed:', e);
    }
  },

  // ---------- Core account methods ----------
  async fetchAccount(username) {
    const { owner, repo, branch, dataPath } = window.REPO_CONFIG;
    const encUser = encodeURIComponent(username);
    const url = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${dataPath}/users/${encUser}/account.json`;
    try {
      const resp = await fetch(url);
      if (!resp.ok) return null;
      return await resp.json();
    } catch { return null; }
  },

  async register(username, passphrase, pat) {
    const payload = JSON.stringify({ test: 'VALID', token: pat });
    const encrypted = await window.CryptoUtil.encrypt(payload, passphrase);
    const { owner, repo, branch, dataPath } = window.REPO_CONFIG;
    const encUser = encodeURIComponent(username);
    const path = `${dataPath}/users/${encUser}/account.json`;

    const existing = await GitHubAPI.getFileContent(owner, repo, path, branch, pat).catch(() => null);
    if (existing) throw new Error('An account with this email already exists on GitHub.');

    await GitHubAPI.updateFile(owner, repo, path, encrypted, `Register user ${username}`, branch, pat);

    // Send emails (non‑blocking)
    this._notifyAdminNewUser(username);
    this._notifyUserConfirmation(username);

    return true;
  },

  async login(username, passphrase) {
    // Check if user is blocked
    const blocked = await this.getBlockedUsers();
    if (blocked.includes(username)) throw new Error('Your account has been blocked. Contact the administrator.');

    const blob = await this.fetchAccount(username);
    if (!blob) throw new Error('User not found');
    const decrypted = await window.CryptoUtil.decrypt(blob, passphrase);
    const data = JSON.parse(decrypted);
    if (data.test !== 'VALID') throw new Error('Corrupted account');
    return data.token;
  },

  // ---------- Blocking ----------
  async getBlockedUsers() {
    const { owner, repo, branch, dataPath } = window.REPO_CONFIG;
    const url = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${dataPath}/blocked_users.json`;
    try {
      const resp = await fetch(url);
      if (!resp.ok) return [];
      return await resp.json();
    } catch { return []; }
  },

  async toggleBlock(username, block, adminToken) {
    const blocked = await this.getBlockedUsers();
    if (block) {
      if (!blocked.includes(username)) blocked.push(username);
    } else {
      const idx = blocked.indexOf(username);
      if (idx !== -1) blocked.splice(idx, 1);
    }

    const { owner, repo, branch, dataPath } = window.REPO_CONFIG;
    const path = `${dataPath}/blocked_users.json`;

    // Always fetch the latest SHA before updating
    let sha = null;
    const existing = await GitHubAPI.getFileContent(owner, repo, path, branch, adminToken).catch(() => null);
    if (existing) sha = existing.sha;

    await GitHubAPI.updateFile(owner, repo, path, blocked, `Update blocked users`, branch, adminToken, sha);
    return true;
  },

  // ---------- Admin user list ----------
  async listUsers(adminToken) {
    const { owner, repo, branch, dataPath } = window.REPO_CONFIG;
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${dataPath}/users?ref=${branch}`;
    const resp = await fetch(url, {
      headers: { 'Authorization': `token ${adminToken}`, 'Accept': 'application/vnd.github.v3+json' }
    });
    if (!resp.ok) throw new Error('Cannot list users');
    const items = await resp.json();
    return items.filter(i => i.type === 'dir').map(i => i.name);
  },

  async deleteUser(username, adminToken) {
    const { owner, repo, branch, dataPath } = window.REPO_CONFIG;
    const encUser = encodeURIComponent(username);
    const dirPath = `${dataPath}/users/${encUser}`;
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${dirPath}?ref=${branch}`;
    const resp = await fetch(url, {
      headers: { 'Authorization': `token ${adminToken}`, 'Accept': 'application/vnd.github.v3+json' }
    });
    if (!resp.ok) throw new Error('User folder not found');
    const items = await resp.json();
    for (const item of items) {
      await GitHubAPI.deleteFile(owner, repo, item.path, branch, adminToken, item.sha);
    }
    return true;
  },

  // ---------- Stats for admin ----------
  async getUserStats(username, adminToken) {
    const { owner, repo, branch, dataPath } = window.REPO_CONFIG;
    const encUser = encodeURIComponent(username);
    const base = `${dataPath}/users/${encUser}`;
    let projectCount = 0, certCount = 0;

    try {
      const projFile = await GitHubAPI.getFileContent(owner, repo, `${base}/projects.json`, branch, adminToken);
      if (projFile && projFile.content) {
        const data = JSON.parse(projFile.content);
        projectCount = Object.keys(data).length;
      }
    } catch (e) {}

    try {
      const certFile = await GitHubAPI.getFileContent(owner, repo, `${base}/certificates.json`, branch, adminToken);
      if (certFile && certFile.content) {
        const data = JSON.parse(certFile.content);
        certCount = data.length;
      }
    } catch (e) {}

    return { projects: projectCount, certificates: certCount };
  }
};

/* ======================================================================
   PORTFOLIO DATA (public admin profile, auto‑logout on block)
   ====================================================================== */
window.portfolioData = (() => {
  const PROJECTS_KEY = 'deltaVProjects';
  const CERTS_KEY = 'deltaVCertificates';

  // Helper: check if current user is blocked, if so log out
  async function verifyNotBlocked() {
    const user = SessionManager.getCurrentUser();
    if (!user) return;
    const blocked = await AccountManager.getBlockedUsers();
    if (blocked.includes(user.username)) {
      SessionManager.logout();
      window.location.href = 'login.html?blocked=1';
      throw new Error('Blocked');
    }
  }

  async function loadProjects() {
    const user = SessionManager.getCurrentUser();
    if (user && user.pat) {
      await verifyNotBlocked();
      try {
        const { owner, repo, branch, dataPath } = window.REPO_CONFIG;
        const encUser = encodeURIComponent(user.username);
        const path = `${dataPath}/users/${encUser}/projects.json`;
        const file = await GitHubAPI.getFileContent(owner, repo, path, branch, user.pat);
        if (file && file.content) {
          const data = JSON.parse(file.content);
          localStorage.setItem(PROJECTS_KEY, JSON.stringify(data));
          return data;
        } else {
          localStorage.removeItem(PROJECTS_KEY);
          return {};
        }
      } catch (e) {
        if (e.message === 'Blocked') throw e;
      }
    } else {
      // No login: show public admin profile (set in config)
      const publicEmail = window.APP_CONFIG.publicProfileEmail;
      if (publicEmail) {
        try {
          const { owner, repo, branch, dataPath } = window.REPO_CONFIG;
          const encUser = encodeURIComponent(publicEmail);
          const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${dataPath}/users/${encUser}/projects.json`;
          const resp = await fetch(rawUrl);
          if (resp.ok) {
            const data = await resp.json();
            localStorage.setItem(PROJECTS_KEY, JSON.stringify(data));
            return data;
          }
        } catch (e) { console.warn('Could not fetch public projects, using defaults'); }
      }
    }
    // Fallback
    const stored = localStorage.getItem(PROJECTS_KEY);
    if (stored) return JSON.parse(stored);
    return defaultProjects;
  }

  async function loadCertificates() {
    const user = SessionManager.getCurrentUser();
    if (user && user.pat) {
      await verifyNotBlocked();
      try {
        const { owner, repo, branch, dataPath } = window.REPO_CONFIG;
        const encUser = encodeURIComponent(user.username);
        const path = `${dataPath}/users/${encUser}/certificates.json`;
        const file = await GitHubAPI.getFileContent(owner, repo, path, branch, user.pat);
        if (file && file.content) {
          const data = JSON.parse(file.content);
          localStorage.setItem(CERTS_KEY, JSON.stringify(data));
          return data;
        } else {
          localStorage.removeItem(CERTS_KEY);
          return [];
        }
      } catch (e) {
        if (e.message === 'Blocked') throw e;
      }
    } else {
      const publicEmail = window.APP_CONFIG.publicProfileEmail;
      if (publicEmail) {
        try {
          const { owner, repo, branch, dataPath } = window.REPO_CONFIG;
          const encUser = encodeURIComponent(publicEmail);
          const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${dataPath}/users/${encUser}/certificates.json`;
          const resp = await fetch(rawUrl);
          if (resp.ok) {
            const data = await resp.json();
            localStorage.setItem(CERTS_KEY, JSON.stringify(data));
            return data;
          }
        } catch (e) { console.warn('Could not fetch public certificates, using defaults'); }
      }
    }
    const stored = localStorage.getItem(CERTS_KEY);
    if (stored) return JSON.parse(stored);
    return defaultCertificates;
  }

  async function saveProjects(data) {
    localStorage.setItem(PROJECTS_KEY, JSON.stringify(data));
    const user = SessionManager.getCurrentUser();
    if (user && user.pat) {
      await verifyNotBlocked();
      const { owner, repo, branch, dataPath } = window.REPO_CONFIG;
      const encUser = encodeURIComponent(user.username);
      const path = `${dataPath}/users/${encUser}/projects.json`;
      let sha = null;
      try {
        const existing = await GitHubAPI.getFileContent(owner, repo, path, branch, user.pat).catch(() => null);
        if (existing) sha = existing.sha;
        await GitHubAPI.updateFile(owner, repo, path, data, 'Update projects', branch, user.pat, sha);
      } catch (err) {
        console.error('GitHub sync failed:', err);
        throw err;
      }
    }
  }

  async function saveCertificates(data) {
    localStorage.setItem(CERTS_KEY, JSON.stringify(data));
    const user = SessionManager.getCurrentUser();
    if (user && user.pat) {
      await verifyNotBlocked();
      const { owner, repo, branch, dataPath } = window.REPO_CONFIG;
      const encUser = encodeURIComponent(user.username);
      const path = `${dataPath}/users/${encUser}/certificates.json`;
      let sha = null;
      try {
        const existing = await GitHubAPI.getFileContent(owner, repo, path, branch, user.pat).catch(() => null);
        if (existing) sha = existing.sha;
        await GitHubAPI.updateFile(owner, repo, path, data, 'Update certificates', branch, user.pat, sha);
      } catch (err) {
        console.error('GitHub sync failed:', err);
        throw err;
      }
    }
  }

  function exportData() {
    Promise.all([loadProjects(), loadCertificates()]).then(([projects, certs]) => {
      const zip = new JSZip();
      zip.file("projects.json", JSON.stringify(projects, null, 2));
      zip.file("certificates.json", JSON.stringify(certs, null, 2));
      zip.generateAsync({ type: "blob" }).then(blob => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `deltaV_data_${SessionManager.getCurrentUser()?.username || 'default'}.zip`;
        a.click();
      });
    });
  }

  return { loadProjects, saveProjects, loadCertificates, saveCertificates, exportData };
})();

/* ======================================================================
   IMAGE PROTECTION
   ====================================================================== */
window.protectImages = function () {
  document.querySelectorAll('.project-img, .modal-carousel-img').forEach(img => {
    img.setAttribute('draggable', 'false');
    img.addEventListener('contextmenu', e => e.preventDefault());
    img.addEventListener('dragstart', e => e.preventDefault());
  });
};

/* ======================================================================
   PDF GENERATION (themed, includes SIS & DCS light green)
   ====================================================================== */
window.generateProjectReport = async function(projectId) {
  const data = await window.portfolioData.loadProjects();
  const proj = data[projectId];
  if (!proj) { alert("Project not found!"); return; }

  let projectType = proj.projectType || 'Other';
  let primaryColor, bgColor;
  if (projectType === 'DCS') { primaryColor = '#2fc7ff'; bgColor = '#f9fbfd'; }
  else if (projectType === 'SIS') { primaryColor = '#ffc107'; bgColor = '#fffdf0'; }
  else if (projectType === 'SIS & DCS') { primaryColor = '#8bc34a'; bgColor = '#f1f8e9'; }
  else { primaryColor = '#6c757d'; bgColor = '#f8f9fa'; }

  const chartCanvas = document.createElement('canvas');
  chartCanvas.width = 500; chartCanvas.height = 250;
  const ctx = chartCanvas.getContext('2d');
  let chart;
  const chartColors = (projectType === 'DCS') ? ['#2fc7ff','#1d9fcf','#0f5c6b','#0a4b59'] :
                      (projectType === 'SIS') ? ['#ffc107','#ffb300','#ff8f00','#ff6f00'] :
                      (projectType === 'SIS & DCS') ? ['#8bc34a','#689f38','#558b2f','#33691e'] :
                      ['#adb5bd','#6c757d','#495057','#212529'];
  if (proj.graphType === 'pie') {
    chart = new Chart(ctx, {
      type: 'pie',
      data: { labels: ['AI','AO','DI','DO'], datasets: [{ data: [proj.io.AI, proj.io.AO, proj.io.DI, proj.io.DO], backgroundColor: chartColors }] },
      options: { responsive: false }
    });
  } else if (proj.graphType === 'line') {
    chart = new Chart(ctx, {
      type: 'line',
      data: { labels: ['AI','AO','DI','DO'], datasets: [{ label: 'I/O Count', data: [proj.io.AI, proj.io.AO, proj.io.DI, proj.io.DO], borderColor: primaryColor, fill: true }] },
      options: { responsive: false }
    });
  } else {
    chart = new Chart(ctx, {
      type: 'bar',
      data: { labels: ['AI','AO','DI','DO'], datasets: [{ label: 'I/O Count', data: [proj.io.AI, proj.io.AO, proj.io.DI, proj.io.DO], backgroundColor: primaryColor }] },
      options: { responsive: false }
    });
  }
  await new Promise(r => setTimeout(r, 200));
  const chartBase64 = chartCanvas.toDataURL('image/png');
  chart.destroy();

  let imagesHtml = '';
  if (proj.selectedImages.length) {
    imagesHtml = `<div style="display: flex; flex-wrap: wrap; gap:10px; margin-top:10px;">`;
    proj.selectedImages.forEach(img => {
      imagesHtml += `
        <div style="flex:0 0 calc(50% - 5px); text-align:center; background:#f8f9fa; border-radius:8px; padding:5px;">
          <img src="${img.url}" style="width:100%; max-height:150px; object-fit:cover; border-radius:8px;" />
          <div style="font-size:10px; color:#555; margin-top:4px;">${img.caption || ''}</div>
        </div>`;
    });
    imagesHtml += `</div>`;
  } else { imagesHtml = '<p>No images selected.</p>'; }

  const dateStr = new Date().toLocaleDateString();
  const reportHTML = `
    <div style="font-family:Inter, sans-serif; padding:20px; background:white; max-width:680px; margin:0 auto; color:#1e2a3e;">
      <div style="border-bottom:4px solid ${primaryColor}; padding-bottom:10px; margin-bottom:20px;">
        <h1 style="color:#0f4c5f; margin:0;">DeltaV Engineering Report</h1>
        <p style="color:#5a7d9a; margin:5px 0 0;">${proj.title} | Technical Summary</p>
        <span style="display:inline-block; background:${primaryColor}; color:white; padding:3px 12px; border-radius:20px; font-size:0.8rem; margin-top:8px;">
          ${projectType} ${proj.deltaVVersion ? '· DeltaV ' + proj.deltaVVersion : ''}
        </span>
      </div>
      <div style="background:${bgColor}; padding:20px; border-radius:16px; margin:20px 0;">
        <h3>Project Overview</h3>
        <table style="width:100%">
          <tr><td><strong>Title:</strong></td><td>${proj.title}</td></tr>
          <tr><td><strong>Location:</strong></td><td>${proj.siteLocation||'N/A'}</td></tr>
          <tr><td><strong>Controller:</strong></td><td>${proj.controllerType}</td></tr>
          <tr><td><strong>Cabinets:</strong></td><td>${proj.cabinetCount}</td></tr>
          ${proj.deltaVVersion ? `<tr><td><strong>DeltaV Version:</strong></td><td>${proj.deltaVVersion}</td></tr>` : ''}
        </table>
      </div>
      <div style="background:${bgColor}; padding:20px; border-radius:16px; margin-bottom:20px;">
        <h3>Description</h3><p>${proj.description}</p>
      </div>
      <div style="background:${bgColor}; padding:20px; border-radius:16px; margin-bottom:20px;">
        <h3>I/O Configuration</h3>
        <table style="width:100%; text-align:center; border-collapse:collapse;">
          <tr style="background:${primaryColor}; color:white;"><th>AI</th><th>AO</th><th>DI</th><th>DO</th></tr>
          <tr><td>${proj.io.AI}</td><td>${proj.io.AO}</td><td>${proj.io.DI}</td><td>${proj.io.DO}</td></tr>
        </table>
      </div>
      <div style="background:${bgColor}; padding:20px; border-radius:16px; margin-bottom:20px; text-align:center;">
        <h3>I/O Distribution (${proj.graphType})</h3>
        <img src="${chartBase64}" style="max-width:100%; margin-top:10px;" />
      </div>
      <div style="background:${bgColor}; padding:20px; border-radius:16px; margin-bottom:20px;">
        <h3>Team Members</h3>
        <p><strong>Lead Engineer:</strong> ${proj.team.lead}<br>
        <strong>Project Engineer:</strong> ${proj.team.engineer}<br>
        <strong>Technician:</strong> ${proj.team.technician}</p>
      </div>
      <div style="background:${bgColor}; padding:20px; border-radius:16px; margin-bottom:20px;">
        <h3>Project Images</h3>${imagesHtml}
      </div>
      <div style="margin-top:30px; font-size:10px; color:#999; text-align:center;">
        Generated ${dateStr} | DeltaV Portfolio
      </div>
    </div>
  `;

  let container = document.getElementById('reportTempContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'reportTempContainer';
    container.style.position = 'fixed'; container.style.top = '-9999px'; container.style.left = '-9999px'; container.style.width = '680px';
    document.body.appendChild(container);
  }
  container.innerHTML = reportHTML;

  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF('p', 'mm', 'a4');
  await pdf.html(container.firstElementChild, {
    callback: function (doc) { doc.save(`${proj.title.replace(/\s/g, '_')}_Report.pdf`); },
    x: 15, y: 15, width: 180, windowWidth: 680
  });
};
