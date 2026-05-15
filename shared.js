// shared.js – Full version with retry logic for GitHub updates

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

// ---------- GITHUB IMAGE UPLOAD HELPERS ----------
window.uploadImageToGitHub = async function(file, user, folder = 'images') {
  const compressedDataUrl = await window.compressImage(file, 1600, 1600, 0.85);
  const blob = await (await fetch(compressedDataUrl)).blob();
  const fileName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const path = `${window.REPO_CONFIG.dataPath}/users/${encodeURIComponent(user.username)}/${folder}/${fileName}`;
  const content = await new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.readAsDataURL(blob);
  });
  const url = `https://api.github.com/repos/${window.REPO_CONFIG.owner}/${window.REPO_CONFIG.repo}/contents/${path}`;
  const body = {
    message: `Upload image ${fileName}`,
    content: content,
    branch: window.REPO_CONFIG.branch
  };
  const resp = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `token ${user.pat}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  if (!resp.ok) throw new Error('Image upload failed');
  const data = await resp.json();
  return data.content.download_url;
};

window.deleteImageFromGitHub = async function(imageUrl, user) {
  const parts = imageUrl.split('/');
  const path = parts.slice(parts.indexOf('data')).join('/');
  const url = `https://api.github.com/repos/${window.REPO_CONFIG.owner}/${window.REPO_CONFIG.repo}/contents/${path}`;
  const getResp = await fetch(url, {
    headers: { Authorization: `token ${user.pat}` }
  });
  if (!getResp.ok) return;
  const fileData = await getResp.json();
  const deleteResp = await fetch(url, {
    method: 'DELETE',
    headers: { Authorization: `token ${user.pat}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: 'Delete image',
      sha: fileData.sha,
      branch: window.REPO_CONFIG.branch
    })
  });
  if (!deleteResp.ok) throw new Error('Failed to delete image');
};

window.compressImage = function(file, maxW = 1600, maxH = 1600, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        const ratio = Math.min(maxW / width, maxH / height);
        if (ratio < 1) {
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

// ---------- ACCOUNT MANAGER ----------
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
      if (projectCount === 0 && username === window.APP_CONFIG.publicProfileEmail) {
        const publicUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${base}/projects.json`;
        const resp = await fetch(publicUrl);
        if (resp.ok) {
          const data = await resp.json();
          projectCount = Object.keys(data).length;
        }
      }
    } catch (e) { console.warn('Failed to load projects stats', e); }
    
    try {
      const certFile = await GitHubAPI.getFileContent(owner, repo, `${base}/certificates.json`, branch, adminToken);
      if (certFile && certFile.content) {
        const data = JSON.parse(certFile.content);
        certCount = data.length;
      }
      if (certCount === 0 && username === window.APP_CONFIG.publicProfileEmail) {
        const publicUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${base}/certificates.json`;
        const resp = await fetch(publicUrl);
        if (resp.ok) {
          const data = await resp.json();
          certCount = data.length;
        }
      }
    } catch (e) { console.warn('Failed to load certificates stats', e); }
    
    return { projects: projectCount, certificates: certCount };
  }
};

// ---------- PORTFOLIO DATA (with retry logic for GitHub updates) ----------
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

  async function fetchPublicData(email, type) {
    const { owner, repo, branch, dataPath } = window.REPO_CONFIG;
    const encUser = encodeURIComponent(email);
    const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${dataPath}/users/${encUser}/${type}.json`;
    try {
      const resp = await fetch(rawUrl);
      if (resp.ok) {
        const data = await resp.json();
        if (type === 'projects') return data;
        if (type === 'certificates') return data;
      }
    } catch (e) {}
    return type === 'projects' ? {} : [];
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
          if (user.username === window.APP_CONFIG.publicProfileEmail) {
            const publicData = await fetchPublicData(user.username, 'projects');
            if (Object.keys(publicData).length > 0) {
              localStorage.setItem(PROJECTS_KEY, JSON.stringify(publicData));
              return publicData;
            }
          }
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
      return await fetchPublicData(publicEmail, 'projects');
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
          localStorage.setItem(CERTS_KEY, JSON.stringify(data));
          return data;
        } else {
          if (user.username === window.APP_CONFIG.publicProfileEmail) {
            const publicCerts = await fetchPublicData(user.username, 'certificates');
            if (publicCerts.length > 0) {
              localStorage.setItem(CERTS_KEY, JSON.stringify(publicCerts));
              return publicCerts;
            }
          }
          const empty = [];
          localStorage.setItem(CERTS_KEY, JSON.stringify(empty));
          return empty;
        }
      } catch (e) {
        if (e.message === 'Blocked') throw e;
        console.warn('Could not fetch certificates from GitHub, using local cache');
        return JSON.parse(localStorage.getItem(CERTS_KEY) || '[]');
      }
    }
    if (!user && window.APP_CONFIG.publicProfileEmail) {
      return await fetchPublicData(window.APP_CONFIG.publicProfileEmail, 'certificates');
    }
    return JSON.parse(localStorage.getItem(CERTS_KEY) || '[]');
  }

  // Helper function to update file with retry logic
  async function updateFileWithRetry(owner, repo, path, data, commitMsg, branch, token, maxRetries = 3) {
    let lastError = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Always fetch the latest SHA before each attempt
        const existing = await GitHubAPI.getFileContent(owner, repo, path, branch, token).catch(() => null);
        const sha = existing ? existing.sha : null;
        
        await GitHubAPI.updateFile(owner, repo, path, data, commitMsg, branch, token, sha);
        return; // Success
      } catch (err) {
        lastError = err;
        console.warn(`Update attempt ${attempt} failed: ${err.message}`);
        
        if (attempt < maxRetries) {
          // Wait before retry (exponential backoff)
          const delay = Math.pow(2, attempt) * 500;
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    throw lastError;
  }

  async function saveProjects(data, forceEmpty = false) {
    const prev = localStorage.getItem(PROJECTS_KEY);
    if (prev && !forceEmpty) {
      const previous = JSON.parse(prev);
      if (Object.keys(previous).length > 0 && Object.keys(data).length === 0) {
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
    
    try {
      await updateFileWithRetry(owner, repo, path, data, 'Update projects', branch, user.pat);
    } catch (err) {
      if (prev) localStorage.setItem(PROJECTS_KEY, prev);
      else localStorage.removeItem(PROJECTS_KEY);
      throw new Error('GitHub write failed: ' + err.message);
    }
  }

  async function saveCertificates(data, forceEmpty = false) {
    const prev = localStorage.getItem(CERTS_KEY);
    if (prev && !forceEmpty) {
      const previous = JSON.parse(prev);
      if (previous.length > 0 && data.length === 0) {
        throw new Error('Cannot delete all certificates this way. Use "Delete All" button.');
      }
    }
    localStorage.setItem(CERTS_KEY, JSON.stringify(data));
    const user = window.SessionManager.getCurrentUser();
    if (!user || !user.pat) return;
    await verifyNotBlocked();
    const { owner, repo, branch, dataPath } = window.REPO_CONFIG;
    const encUser = encodeURIComponent(user.username);
    const path = `${dataPath}/users/${encUser}/certificates.json`;
    
    try {
      await updateFileWithRetry(owner, repo, path, data, 'Update certificates', branch, user.pat);
    } catch (err) {
      if (prev) localStorage.setItem(CERTS_KEY, prev);
      else localStorage.removeItem(CERTS_KEY);
      throw new Error('GitHub write failed: ' + err.message);
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

  async function downloadBackup() {
    const user = window.SessionManager.getCurrentUser();
    if (!user || !window.APP_CONFIG.adminUsers.includes(user.username)) {
      throw new Error('Only admin can download backups.');
    }
    const { owner, repo, branch, dataPath } = window.REPO_CONFIG;
    const encUser = encodeURIComponent(user.username);
    const projectsPath = `${dataPath}/users/${encUser}/projects.json`;
    const certsPath = `${dataPath}/users/${encUser}/certificates.json`;
    const [projectsFile, certsFile] = await Promise.all([
      GitHubAPI.getFileContent(owner, repo, projectsPath, branch, user.pat).catch(() => null),
      GitHubAPI.getFileContent(owner, repo, certsPath, branch, user.pat).catch(() => null)
    ]);
    const projects = projectsFile ? JSON.parse(projectsFile.content) : {};
    const certs = certsFile ? JSON.parse(certsFile.content) : [];
    const zip = new JSZip();
    zip.file("projects.json", JSON.stringify(projects, null, 2));
    zip.file("certificates.json", JSON.stringify(certs, null, 2));
    const blob = await zip.generateAsync({ type: "blob" });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `deltaV_backup_${new Date().toISOString().slice(0,19)}.zip`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function restoreBackup(file) {
    const user = window.SessionManager.getCurrentUser();
    if (!user || !window.APP_CONFIG.adminUsers.includes(user.username)) {
      throw new Error('Only admin can restore backups.');
    }

    const fileName = file.name;
    const isTarGz = fileName.endsWith('.tar.gz') || fileName.endsWith('.tgz');
    if (isTarGz) {
      throw new Error(
        'Cannot restore .tar.gz backups in the app.\n' +
        'Please manually extract the archive and upload the individual ' +
        'projects.json and certificates.json files, or use the "Download Backup" button ' +
        'to create a compatible ZIP backup.'
      );
    }

    const zip = await JSZip.loadAsync(file);
    const projectsFile = zip.file("projects.json");
    const certsFile = zip.file("certificates.json");
    if (!projectsFile || !certsFile) {
      throw new Error('Invalid backup: missing projects.json or certificates.json');
    }
    const projectsText = await projectsFile.async("string");
    const certsText = await certsFile.async("string");
    const projects = JSON.parse(projectsText);
    const certs = JSON.parse(certsText);
    if (typeof projects !== 'object') throw new Error('Invalid projects data');
    if (!Array.isArray(certs)) throw new Error('Invalid certificates data');
    
    await saveProjects(projects, true);
    await saveCertificates(certs, true);
    return { projects, certs };
  }

  return { loadProjects, saveProjects, loadCertificates, saveCertificates, exportData, downloadBackup, restoreBackup };
})();

// ---------- LAZY LOAD & PROTECT ----------
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
    chart = new Chart(ctx, {
      type: 'pie',
      data: { labels: ['AI','AO','DI','DO'], datasets: [{ data: [io.AI, io.AO, io.DI, io.DO], backgroundColor: chartColors }] },
      options: { responsive: false }
    });
  } else if (proj.graphType === 'line') {
    chart = new Chart(ctx, {
      type: 'line',
      data: { labels: ['AI','AO','DI','DO'], datasets: [{ label: 'I/O Count', data: [io.AI, io.AO, io.DI, io.DO], borderColor: primaryColor, fill: true }] },
      options: { responsive: false }
    });
  } else {
    chart = new Chart(ctx, {
      type: 'bar',
      data: { labels: ['AI','AO','DI','DO'], datasets: [{ label: 'I/O Count', data: [io.AI, io.AO, io.DI, io.DO], backgroundColor: primaryColor }] },
      options: { responsive: false }
    });
  }
  await new Promise(r => setTimeout(r, 200));
  const chartBase64 = chartCanvas.toDataURL('image/png');
  chart.destroy();

  let imagesHtml = '';
  if (proj.selectedImages && proj.selectedImages.length) {
    imagesHtml = `<div style="display: flex; flex-wrap: wrap; gap:10px; margin-top:10px;">`;
    proj.selectedImages.forEach(img => {
      imagesHtml += `
        <div style="flex:0 0 calc(50% - 5px); text-align:center; background:#f8f9fa; border-radius:8px; padding:5px;">
          <img src="${img.url}" style="width:100%; max-height:150px; object-fit:cover; border-radius:8px;" loading="lazy" />
          <div style="font-size:10px; color:#555; margin-top:4px;">${img.caption || ''}</div>
        </div>`;
    });
    imagesHtml += `</div>`;
  } else { imagesHtml = '<p>No images selected.</p>'; }

  const controllerDisplay = proj.controllerTypes ? proj.controllerTypes.join(', ') : (proj.controllerType || 'N/A');
  const ifatText = proj.dates?.ifatStart ? `${proj.dates.ifatStart} to ${proj.dates.ifatEnd || ''}` : (proj.dates?.ifat || 'N/A');
  const cfatText = proj.dates?.cfatStart ? `${proj.dates.cfatStart} to ${proj.dates.cfatEnd || ''}` : (proj.dates?.cfat || 'N/A');
  
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
          <tr><td><strong>Controllers:</strong></td><td>${controllerDisplay}Zo81
          <tr><td><strong>Cabinets:</strong></td><td>${proj.cabinetCount}</td></tr>
          ${proj.deltaVVersion ? `<tr><td><strong>DeltaV Version:</strong>${dataV}/${proj.deltaVVersion}专业专业` : ''}
          <tr><td><strong>Start Date:</strong>${dataV}/${proj.dates?.start || 'N/A'}专业专业
          <tr><td><strong>Finish Date:</strong>${dataV}/${proj.dates?.finish || 'N/A'}专业专业
          <tr><td><strong>IFAT:</strong>${dataV}/${ifatText}专业专业
          <tr><td><strong>CFAT:</strong>${dataV}/${cfatText}专业专业
        </table>
      </div>
      <div style="background:${bgColor}; padding:20px; border-radius:16px; margin-bottom:20px;">
        <h3>Description</h3><p>${proj.description}</p>
      </div>
      <div style="background:${bgColor}; padding:20px; border-radius:16px; margin-bottom:20px;">
        <h3>I/O Configuration</h3>
        <table style="width:100%; text-align:center; border-collapse:collapse;">
          <tr style="background:${primaryColor}; color:white;"><th>AI</th><th>AO</th><th>DI</th><th>DO</th></tr>
          <tr><td>${io.AI}${dataV}/${io.AO}${dataV}/${io.DI}${dataV}/${io.DO}专业专业
        </table>
      </div>
      <div style="background:${bgColor}; padding:20px; border-radius:16px; margin-bottom:20px; text-align:center;">
        <h3>I/O Distribution (${proj.graphType})</h3>
        <img src="${chartBase64}" style="max-width:100%; margin-top:10px;" />
      </div>
      <div style="background:${bgColor}; padding:20px; border-radius:16px; margin-bottom:20px;">
        <h3>Team Members</h3>
        <p><strong>Lead Engineer:</strong> ${proj.team?.lead || ''}<br>
        <strong>Project Engineer:</strong> ${proj.team?.engineer || ''}<br>
        <strong>Technician:</strong> ${proj.team?.technician || ''}</p>
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
