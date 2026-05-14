// shared.js – Full version with robust stats and certificate loading

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
  return str.replace(/[&<>]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;'})[m] || m);
};

window.updateUserFooter = function () {
  const user = window.SessionManager.getCurrentUser();
  const el = document.getElementById('userFooterStatus');
  if (!el) return;
  if (user) {
    el.innerHTML = `Logged in as: <strong>${window.escapeHtml(user.username)}</strong>`;
  } else {
    el.innerHTML = `Visitor – viewing portfolio of <strong>${window.APP_CONFIG.publicProfileEmail}</strong>`;
  }
};

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

window.AccountManager = {
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
  async _sendEmail(templateID, params) {
    await this._ensureEmailJS();
    return emailjs.send(window.APP_CONFIG.emailjs.serviceID, templateID, params);
  },
  async _notifyAdminNewUser(userEmail) {
    const cfg = window.APP_CONFIG.emailjs;
    if (!cfg || !cfg.publicKey || !cfg.adminTemplateID) return;
    try {
      await this._sendEmail(cfg.adminTemplateID, {
        to_email: cfg.adminEmail,
        subject: `New user: ${userEmail}`,
        message: `New account created: ${userEmail}`
      });
    } catch (e) { console.warn('Admin email failed', e); }
  },
  async _notifyUserConfirmation(userEmail) {
    const cfg = window.APP_CONFIG.emailjs;
    if (!cfg || !cfg.publicKey || !cfg.userTemplateID) return;
    try {
      await this._sendEmail(cfg.userTemplateID, {
        to_email: userEmail,
        subject: 'Welcome to DeltaV Portfolio',
        message: `Your account (${userEmail}) has been created. You can now log in and manage your projects.`
      });
    } catch (e) { console.warn('User email failed', e); }
  },
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
    await GitHubAPI.updateFile(owner, repo, path, encrypted, `Register ${username}`, branch, pat);
    this._notifyAdminNewUser(username);
    this._notifyUserConfirmation(username);
    return true;
  },
  async login(username, passphrase) {
    const blocked = await this.getBlockedUsers();
    if (blocked.includes(username)) throw new Error('Your account has been blocked. Contact the administrator.');
    const blob = await this.fetchAccount(username);
    if (!blob) throw new Error('User not found');
    const decrypted = await window.CryptoUtil.decrypt(blob, passphrase);
    const data = JSON.parse(decrypted);
    if (data.test !== 'VALID') throw new Error('Corrupted account');
    return data.token;
  },
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
    let sha = null;
    const existing = await GitHubAPI.getFileContent(owner, repo, path, branch, adminToken).catch(() => null);
    if (existing) sha = existing.sha;
    await GitHubAPI.updateFile(owner, repo, path, blocked, 'Update blocked users', branch, adminToken, sha);
    return true;
  },
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
    } catch (e) { 
      console.warn(`Could not load projects for ${username}:`, e); 
    }
    try {
      const certFile = await GitHubAPI.getFileContent(owner, repo, `${base}/certificates.json`, branch, adminToken);
      if (certFile && certFile.content) {
        const data = JSON.parse(certFile.content);
        certCount = data.length;
      }
    } catch (e) { 
      console.warn(`Could not load certificates for ${username}:`, e); 
    }
    return { projects: projectCount, certificates: certCount };
  },
  async getUserDownloadStats(username, adminToken) {
    const { owner, repo, branch, dataPath } = window.REPO_CONFIG;
    const encUser = encodeURIComponent(username);
    const path = `${dataPath}/users/${encUser}/download_stats.json`;
    try {
      const file = await GitHubAPI.getFileContent(owner, repo, path, branch, adminToken);
      if (file && file.content) return JSON.parse(file.content);
    } catch (e) {}
    return { totalDownloads: 0, downloads: {} };
  },
  async logDownload(username, projectTitle, projectId, token) {
    const { owner, repo, branch, dataPath } = window.REPO_CONFIG;
    const encUser = encodeURIComponent(username);
    const path = `${dataPath}/users/${encUser}/download_stats.json`;
    let stats = { totalDownloads: 0, downloads: {} };
    let sha = null;
    try {
      const existing = await GitHubAPI.getFileContent(owner, repo, path, branch, token);
      if (existing && existing.content) {
        stats = JSON.parse(existing.content);
        sha = existing.sha;
      }
    } catch (e) {}
    stats.totalDownloads = (stats.totalDownloads || 0) + 1;
    if (!stats.downloads[projectId]) {
      stats.downloads[projectId] = { title: projectTitle, count: 0 };
    }
    stats.downloads[projectId].count++;
    await GitHubAPI.updateFile(owner, repo, path, stats, `Log download: ${projectTitle}`, branch, token, sha);
    return stats;
  }
};

/* =====================================================
   PORTFOLIO DATA – WITH forceEmpty FLAG AND CACHE-BUSTING
   ===================================================== */
window.portfolioData = (() => {
  const PROJECTS_KEY = 'deltaVProjects';
  const CERTS_KEY = 'deltaVCertificates';

  async function verifyNotBlocked() {
    const user = window.SessionManager.getCurrentUser();
    if (!user) return;
    const blocked = await window.AccountManager.getBlockedUsers();
    if (blocked.includes(user.username)) {
      window.SessionManager.logout();
      window.location.href = 'login.html?blocked=1';
      throw new Error('Blocked');
    }
  }

  async function loadProjects() {
    const user = window.SessionManager.getCurrentUser();
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
          const empty = {};
          localStorage.setItem(PROJECTS_KEY, JSON.stringify(empty));
          return empty;
        }
      } catch (e) {
        if (e.message === 'Blocked') throw e;
        console.warn('Could not fetch projects from GitHub, using local cache');
        return JSON.parse(localStorage.getItem(PROJECTS_KEY) || '{}');
      }
    }
    const publicEmail = window.APP_CONFIG.publicProfileEmail;
    if (!user && publicEmail) {
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
      } catch (e) {}
    }
    return JSON.parse(localStorage.getItem(PROJECTS_KEY) || '{}');
  }

  async function loadCertificates() {
    const user = window.SessionManager.getCurrentUser();
    if (user && user.pat) {
      await verifyNotBlocked();
      try {
        const { owner, repo, branch, dataPath } = window.REPO_CONFIG;
        const encUser = encodeURIComponent(user.username);
        const path = `${dataPath}/users/${encUser}/certificates.json`;
        const file = await GitHubAPI.getFileContent(owner, repo, path, branch, user.pat);
        if (file && file.content) {
          const data = JSON.parse(file.content);
          if (Array.isArray(data)) {
            localStorage.setItem(CERTS_KEY, JSON.stringify(data));
            return data;
          }
        }
      } catch (e) {
        if (e.message === 'Blocked') throw e;
        console.warn('Could not fetch certificates from GitHub, using local cache');
      }
    }
    // Fallback to public profile or local cache
    if (!user && window.APP_CONFIG.publicProfileEmail) {
      try {
        const { owner, repo, branch, dataPath } = window.REPO_CONFIG;
        const encUser = encodeURIComponent(window.APP_CONFIG.publicProfileEmail);
        const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${dataPath}/users/${encUser}/certificates.json`;
        const resp = await fetch(rawUrl);
        if (resp.ok) {
          const data = await resp.json();
          if (Array.isArray(data)) {
            localStorage.setItem(CERTS_KEY, JSON.stringify(data));
            return data;
          }
        }
      } catch (e) {}
    }
    const cached = localStorage.getItem(CERTS_KEY);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed)) return parsed;
      } catch(e) {}
    }
    return [];
  }

  async function saveProjects(data, forceEmpty = false) {
    const prev = localStorage.getItem(PROJECTS_KEY);
    if (prev) {
      const previous = JSON.parse(prev);
      if (!forceEmpty && Object.keys(previous).length > 0 && Object.keys(data).length === 0) {
        throw new Error('Cannot delete all projects this way. Use "Delete All" button.');
      }
    }
    localStorage.setItem(PROJECTS_KEY, JSON.stringify(data));
    const user = window.SessionManager.getCurrentUser();
    if (!user || !user.pat) return;
    await verifyNotBlocked();
    const { owner, repo, branch, dataPath } = window.REPO_CONFIG;
    const encUser = encodeURIComponent(user.username);
    const path = `${dataPath}/users/${encUser}/projects.json`;
    let sha = null;
    try {
      const existing = await GitHubAPI.getFileContent(owner, repo, path, branch, user.pat);
      if (existing) sha = existing.sha;
      await GitHubAPI.updateFile(owner, repo, path, data, 'Update projects', branch, user.pat, sha);
    } catch (err) {
      if (prev) localStorage.setItem(PROJECTS_KEY, prev);
      throw new Error('GitHub write failed: ' + err.message);
    }
  }

  async function saveCertificates(localData, forceEmpty = false) {
    const user = window.SessionManager.getCurrentUser();
    if (!user || !user.pat) {
      localStorage.setItem(CERTS_KEY, JSON.stringify(localData));
      return;
    }
    await verifyNotBlocked();
    const { owner, repo, branch, dataPath } = window.REPO_CONFIG;
    const encUser = encodeURIComponent(user.username);
    const path = `${dataPath}/users/${encUser}/certificates.json`;

    let latestData = [];
    let sha = null;
    try {
      const existing = await GitHubAPI.getFileContent(owner, repo, path, branch, user.pat);
      if (existing && existing.content) {
        latestData = JSON.parse(existing.content);
        sha = existing.sha;
        if (!Array.isArray(latestData)) latestData = [];
      }
    } catch (e) {}

    if (!forceEmpty && localData.length === 0 && latestData.length > 0) {
      throw new Error('Cannot save empty certificates unless you click "Delete All".');
    }

    const finalCerts = localData;
    let retries = 3;
    while (retries > 0) {
      try {
        await GitHubAPI.updateFile(owner, repo, path, finalCerts, 'Update certificates', branch, user.pat, sha);
        localStorage.setItem(CERTS_KEY, JSON.stringify(finalCerts));
        return;
      } catch (err) {
        if (err.message.includes('sha') && retries > 1) {
          const fresh = await GitHubAPI.getFileContent(owner, repo, path, branch, user.pat);
          if (fresh && fresh.content) {
            latestData = JSON.parse(fresh.content);
            sha = fresh.sha;
          }
          retries--;
        } else {
          throw err;
        }
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
        a.download = `deltaV_data_${window.SessionManager.getCurrentUser()?.username || 'default'}.zip`;
        a.click();
      });
    });
  }

  return { loadProjects, saveProjects, loadCertificates, saveCertificates, exportData };
})();

window.lazyLoadImages = function() {
  if ('IntersectionObserver' in window) {
    const imgObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const img = entry.target;
          const src = img.dataset.src;
          if (src) {
            img.src = src;
            img.removeAttribute('data-src');
          }
          observer.unobserve(img);
        }
      });
    });
    document.querySelectorAll('img[data-src]').forEach(img => imgObserver.observe(img));
  } else {
    document.querySelectorAll('img[data-src]').forEach(img => {
      img.src = img.dataset.src;
      img.removeAttribute('data-src');
    });
  }
};

window.protectImages = function () {
  document.querySelectorAll('.project-img, .modal-carousel-img').forEach(img => {
    img.setAttribute('draggable', 'false');
    img.addEventListener('contextmenu', e => e.preventDefault());
    img.addEventListener('dragstart', e => e.preventDefault());
  });
};

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

  const io = proj.io || { AI: 0, AO: 0, DI: 0, DO: 0 };
  const chartCanvas = document.createElement('canvas');
  chartCanvas.width = 500; chartCanvas.height = 250;
  const ctx = chartCanvas.getContext('2d');
  let chart;
  const chartColors = (projectType === 'DCS') ? ['#2fc7ff','#1d9fcf','#0f5c6b','#0a4b59'] :
                      (projectType === 'SIS') ? ['#ffc107','#ffb300','#ff8f00','#ff6f00'] :
                      (projectType === 'SIS & DCS') ? ['#8bc34a','#689f38','#558b2f','#33691e'] :
                      ['#adb5bd','#6c757d','#495057','#212529'];
  if (proj.graphType === 'pie') {
    chart = new Chart(ctx, { type: 'pie', data: { labels: ['AI','AO','DI','DO'], datasets: [{ data: [io.AI, io.AO, io.DI, io.DO], backgroundColor: chartColors }] }, options: { responsive: false } });
  } else if (proj.graphType === 'line') {
    chart = new Chart(ctx, { type: 'line', data: { labels: ['AI','AO','DI','DO'], datasets: [{ label: 'I/O Count', data: [io.AI, io.AO, io.DI, io.DO], borderColor: primaryColor, fill: true }] }, options: { responsive: false } });
  } else {
    chart = new Chart(ctx, { type: 'bar', data: { labels: ['AI','AO','DI','DO'], datasets: [{ label: 'I/O Count', data: [io.AI, io.AO, io.DI, io.DO], backgroundColor: primaryColor }] }, options: { responsive: false } });
  }
  await new Promise(r => setTimeout(r, 200));
  const chartBase64 = chartCanvas.toDataURL('image/png');
  chart.destroy();

  let imagesHtml = '';
  if (proj.selectedImages && proj.selectedImages.length) {
    imagesHtml = `<div style="display: flex; flex-wrap: wrap; gap:10px; margin-top:10px;">`;
    proj.selectedImages.forEach(img => {
      imagesHtml += `<div style="flex:0 0 calc(50% - 5px); text-align:center; background:#f8f9fa; border-radius:8px; padding:5px;"><img src="${img.url}" style="width:100%; max-height:150px; object-fit:cover; border-radius:8px;" loading="lazy" /><div style="font-size:10px; color:#555; margin-top:4px;">${img.caption || ''}</div></div>`;
    });
    imagesHtml += `</div>`;
  } else { imagesHtml = '<p>No images selected.</p>'; }

  const controllerDisplay = proj.controllerTypes ? proj.controllerTypes.join(', ') : (proj.controllerType || 'N/A');
  const ifatText = proj.dates?.ifatStart ? `${proj.dates.ifatStart} to ${proj.dates.ifatEnd || ''}` : (proj.dates?.ifat || 'N/A');
  const cfatText = proj.dates?.cfatStart ? `${proj.dates.cfatStart} to ${proj.dates.cfatEnd || ''}` : (proj.dates?.cfat || 'N/A');
  const dateStr = new Date().toLocaleDateString();
  const reportHTML = `<div style="font-family:Inter, sans-serif; padding:20px; background:white; max-width:680px; margin:0 auto; color:#1e2a3e;"><div style="border-bottom:4px solid ${primaryColor}; padding-bottom:10px; margin-bottom:20px;"><h1 style="color:#0f4c5f; margin:0;">DeltaV Engineering Report</h1><p style="color:#5a7d9a; margin:5px 0 0;">${proj.title} | Technical Summary</p><span style="display:inline-block; background:${primaryColor}; color:white; padding:3px 12px; border-radius:20px; font-size:0.8rem; margin-top:8px;">${projectType} ${proj.deltaVVersion ? '· DeltaV ' + proj.deltaVVersion : ''}</span></div><div style="background:${bgColor}; padding:20px; border-radius:16px; margin:20px 0;"><h3>Project Overview</h3><table style="width:100%"><tr><td><strong>Title:</strong></td><td>${proj.title}</td></tr><tr><td><strong>Location:</strong></td><td>${proj.siteLocation||'N/A'}</td></tr><tr><td><strong>Controllers:</strong></td><td>${controllerDisplay}</td></tr><tr><td><strong>Cabinets:</strong></td><td>${proj.cabinetCount}</td></tr>${proj.deltaVVersion ? `<tr><td><strong>DeltaV Version:</strong></td><td>${proj.deltaVVersion}</td></tr>` : ''}<tr><td><strong>Start Date:</strong></td><td>${proj.dates?.start || 'N/A'}</td></tr><tr><td><strong>Finish Date:</strong></td><td>${proj.dates?.finish || 'N/A'}</td></tr><tr><td><strong>IFAT:</strong></td><td>${ifatText}</td></tr><tr><td><strong>CFAT:</strong></td><td>${cfatText}</td></tr></table></div><div style="background:${bgColor}; padding:20px; border-radius:16px; margin-bottom:20px;"><h3>Description</h3><p>${proj.description}</p></div><div style="background:${bgColor}; padding:20px; border-radius:16px; margin-bottom:20px;"><h3>I/O Configuration</h3><table style="width:100%; text-align:center; border-collapse:collapse;"><tr style="background:${primaryColor}; color:white;"><th>AI</th><th>AO</th><th>DI</th><th>DO</th></tr><tr><td>${io.AI}</td><td>${io.AO}</td><td>${io.DI}</td><td>${io.DO}</td></tr></table></div><div style="background:${bgColor}; padding:20px; border-radius:16px; margin-bottom:20px; text-align:center;"><h3>I/O Distribution (${proj.graphType})</h3><img src="${chartBase64}" style="max-width:100%; margin-top:10px;" /></div><div style="background:${bgColor}; padding:20px; border-radius:16px; margin-bottom:20px;"><h3>Team Members</h3><p><strong>Lead Engineer:</strong> ${proj.team?.lead || ''}<br><strong>Project Engineer:</strong> ${proj.team?.engineer || ''}<br><strong>Technician:</strong> ${proj.team?.technician || ''}</p></div><div style="background:${bgColor}; padding:20px; border-radius:16px; margin-bottom:20px;"><h3>Project Images</h3>${imagesHtml}</div><div style="margin-top:30px; font-size:10px; color:#999; text-align:center;">Generated ${dateStr} | DeltaV Portfolio</div></div>`;

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
  const currentUser = window.SessionManager.getCurrentUser();
  if (currentUser && currentUser.pat) {
    try {
      await window.AccountManager.logDownload(currentUser.username, proj.title, projectId, currentUser.pat);
    } catch(e) { console.warn('Failed to log download', e); }
  }
  await pdf.html(container.firstElementChild, {
    callback: function (doc) { doc.save(`${proj.title.replace(/\s/g, '_')}_Report.pdf`); },
    x: 15, y: 15, width: 180, windowWidth: 680
  });
};
