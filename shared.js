// shared.js – Complete version with fixed project deletion, enhanced logging, Excel report generation (no PDF, no dark mode)

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

window.SessionManager = (() => {
  let current = null;
  return {
    getCurrentUser: () => {
      if (current) return current;
      const stored = sessionStorage.getItem('portfolioUser');
      if (stored) {
        try { 
          current = JSON.parse(stored);
          if (current.timestamp && Date.now() - current.timestamp > 24 * 60 * 60 * 1000) {
            sessionStorage.removeItem('portfolioUser');
            current = null;
          }
        } catch(e) { current = null; }
      }
      return current;
    },
    setCurrentUser: (username, pat) => {
      current = { username, pat, timestamp: Date.now() };
      sessionStorage.setItem('portfolioUser', JSON.stringify(current));
      window.Logger.log('login', `User logged in as ${username}`, 'INFO');
    },
    logout: () => {
      current = null;
      sessionStorage.removeItem('portfolioUser');
    },
    isAdmin: () => {
      const user = window.SessionManager.getCurrentUser();
      return user && window.APP_CONFIG.adminUsers && window.APP_CONFIG.adminUsers.includes(user.username);
    }
  };
})();

// Enhanced Logger
window.Logger = {
  async _writeTextFile(path, content, commitMsg, branch, token, sha = null) {
    const { owner, repo } = window.REPO_CONFIG;
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
    const body = {
      message: commitMsg,
      content: btoa(unescape(encodeURIComponent(content))),
      branch: branch
    };
    if (sha) body.sha = sha;
    const resp = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: `token ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    if (!resp.ok) {
      const err = await resp.json();
      throw new Error(`Failed to write log: ${err.message}`);
    }
    return resp.json();
  },

  async log(action, details, level = 'INFO') {
    const user = window.SessionManager.getCurrentUser();
    if (!user) return;
    
    const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const logEntry = JSON.stringify({
      timestamp,
      level,
      action,
      details,
      user: user.username,
      userAgent: navigator.userAgent,
      page: window.location.pathname
    }) + '\n';
    
    const { owner, repo, branch, dataPath } = window.REPO_CONFIG;
    const encUser = encodeURIComponent(user.username);
    const logPath = `${dataPath}/users/${encUser}/logs/activity.ndjson`;
    
    let existingContent = '';
    let sha = null;
    try {
      const url = `https://api.github.com/repos/${owner}/${repo}/contents/${logPath}?ref=${branch}`;
      const resp = await fetch(url, { headers: { Authorization: `token ${user.pat}` } });
      if (resp.ok) {
        const data = await resp.json();
        sha = data.sha;
        existingContent = atob(data.content.replace(/\n/g, ''));
      }
    } catch (e) {}
    
    const newContent = logEntry + existingContent;
    try {
      await this._writeTextFile(logPath, newContent, `Log: ${action}`, branch, user.pat, sha);
    } catch (err) {
      console.error('Failed to write log:', err);
    }
  },
  
  async logActivity(module, action, details, metadata = {}) {
    const fullDetails = `${module}: ${action} - ${details} ${Object.keys(metadata).length ? JSON.stringify(metadata) : ''}`;
    await this.log(`${module}_${action}`, fullDetails);
  },
  
  async getLogsForUser(targetUsername, adminToken) {
    const { owner, repo, branch, dataPath } = window.REPO_CONFIG;
    const encUser = encodeURIComponent(targetUsername);
    const logPath = `${dataPath}/users/${encUser}/logs/activity.ndjson`;
    try {
      const url = `https://api.github.com/repos/${owner}/${repo}/contents/${logPath}?ref=${branch}`;
      const resp = await fetch(url, { headers: { Authorization: `token ${adminToken}` } });
      if (resp.ok) {
        const data = await resp.json();
        const content = atob(data.content.replace(/\n/g, ''));
        const entries = content.trim().split('\n').filter(l => l.trim()).map(l => {
          try {
            const obj = JSON.parse(l);
            return `[${obj.timestamp}] [${obj.level}] [${obj.action}] ${obj.details} (${obj.userAgent?.substring(0, 50)}...)`;
          } catch(e) { return l; }
        });
        return entries.join('\n');
      }
      return 'No logs found for this user.';
    } catch (e) {
      return 'Unable to retrieve logs.';
    }
  },
  
  async getAllUserLogs(adminToken) {
    const usernames = await window.AccountManager.listUsers(adminToken);
    const allLogs = {};
    for (const username of usernames) {
      allLogs[username] = await this.getLogsForUser(username, adminToken);
    }
    return allLogs;
  }
};

window.updateUserFooter = function () {
  const user = window.SessionManager.getCurrentUser();
  const el = document.getElementById('userFooterStatus');
  if (!el) return;
  if (user) {
    el.innerHTML = `Logged in as: <strong>${window.escapeHtml(user.username)}</strong> | <a href="admin.html" style="color:#2fc7ff;">Dashboard</a> | <a href="#" id="logoutFromFooter" style="color:#ff6b6b;">Logout</a>`;
    const logoutBtn = document.getElementById('logoutFromFooter');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', (e) => {
        e.preventDefault();
        window.Logger.log('logout', 'User logged out');
        window.SessionManager.logout();
        window.location.reload();
      });
    }
  } else {
    el.innerHTML = `Visitor – viewing portfolio of <strong>${window.APP_CONFIG.publicProfileEmail}</strong> | <a href="login.html" style="color:#2fc7ff;">Login</a>`;
  }
};

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
  await window.Logger.logActivity('image', 'upload', `Uploaded ${fileName} to ${folder}`, { size: blob.size });
  return data.content.download_url;
};

window.deleteImageFromGitHub = async function(imageUrl, user) {
  try {
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
    await window.Logger.logActivity('image', 'delete', `Deleted ${path}`);
  } catch (e) {
    console.warn('Could not delete image:', e);
  }
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
        subject: 'Welcome to Your Portfolio',
        message: `Your account (${userEmail}) has been created. You can now log in and manage your portfolio.`
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
  
  async isEmailVerified(email) {
    const { owner, repo, branch, dataPath } = window.REPO_CONFIG;
    const encUser = encodeURIComponent(email);
    const globalUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/data/verified_users.json`;
    try {
      const resp = await fetch(globalUrl);
      if (resp.ok) {
        const data = await resp.json();
        if (data.verified && data.verified.includes(email)) return true;
      }
    } catch (err) {}
    const userUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${dataPath}/users/${encUser}/verified.json`;
    try {
      const resp = await fetch(userUrl);
      if (resp.ok) {
        const data = await resp.json();
        if (data.verified === true) return true;
      }
    } catch (err) {}
    return false;
  },
  
  async register(username, passphrase, pat) {
    const payload = JSON.stringify({ test: 'VALID', token: pat });
    const encrypted = await window.CryptoUtil.encrypt(payload, passphrase);
    const { owner, repo, branch, dataPath } = window.REPO_CONFIG;
    const encUser = encodeURIComponent(username);
    const path = `${dataPath}/users/${encUser}/account.json`;
    const existing = await GitHubAPI.getFileContent(owner, repo, path, branch, pat).catch(() => null);
    if (existing && existing.sha) throw new Error('An account with this email already exists on GitHub.');
    await GitHubAPI.updateFile(owner, repo, path, encrypted, `Register ${username}`, branch, pat, existing?.sha);
    const verificationStatus = { verified: false, createdAt: Date.now() };
    const verificationPath = `${dataPath}/users/${encUser}/verified.json`;
    try {
      await GitHubAPI.updateFile(owner, repo, verificationPath, verificationStatus, `Create verification status for ${username}`, branch, pat);
    } catch (err) {}
    this._notifyAdminNewUser(username);
    this._notifyUserConfirmation(username);
    await window.Logger.logActivity('account', 'register', `New user registered: ${username}`, { email: username });
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
    await window.Logger.logActivity('account', 'login', `User logged in: ${username}`);
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
    if (block) { if (!blocked.includes(username)) blocked.push(username); }
    else { const idx = blocked.indexOf(username); if (idx !== -1) blocked.splice(idx, 1); }
    const { owner, repo, branch, dataPath } = window.REPO_CONFIG;
    const path = `${dataPath}/blocked_users.json`;
    let sha = null;
    const existing = await GitHubAPI.getFileContent(owner, repo, path, branch, adminToken).catch(() => null);
    if (existing && existing.sha) sha = existing.sha;
    await GitHubAPI.updateFile(owner, repo, path, blocked, 'Update blocked users', branch, adminToken, sha);
    await window.Logger.logActivity('admin', 'toggle_block', `${block ? 'Blocked' : 'Unblocked'} user ${username}`);
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
    await window.Logger.logActivity('admin', 'delete_user', `Deleted user ${username}`);
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
    } catch (e) {}
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
    } catch (e) {}
    return { projects: projectCount, certificates: certCount };
  }
};

window.portfolioData = (() => {
  const PROJECTS_KEY = 'portfolioProjects';
  const CERTS_KEY = 'portfolioCertificates';

  async function verifyNotBlocked() {
    const user = window.SessionManager.getCurrentUser();
    if (!user) return;
    const blocked = await window.AccountManager.getBlockedUsers();
    if (blocked.includes(user.username)) {
      window.SessionManager.logout();
      if (!window.location.pathname.includes('login.html')) window.location.href = 'login.html?blocked=1';
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

  async function loadProjectsForView() {
    const user = window.SessionManager.getCurrentUser();
    if (user && user.pat) {
      await verifyNotBlocked();
      try {
        const { owner, repo, branch, dataPath } = window.REPO_CONFIG;
        const encUser = encodeURIComponent(user.username);
        const path = `${dataPath}/users/${encUser}/projects.json`;
        const file = await GitHubAPI.getFileContent(owner, repo, path, branch, user.pat);
        if (file && file.content) {
          return JSON.parse(file.content);
        } else {
          if (user.username === window.APP_CONFIG.publicProfileEmail) {
            return await fetchPublicData(user.username, 'projects');
          }
          return {};
        }
      } catch (e) { return {}; }
    }
    const publicEmail = window.APP_CONFIG.publicProfileEmail;
    if (publicEmail) return await fetchPublicData(publicEmail, 'projects');
    return {};
  }

  async function loadCertificatesForView() {
    const user = window.SessionManager.getCurrentUser();
    if (user && user.pat) {
      await verifyNotBlocked();
      try {
        const { owner, repo, branch, dataPath } = window.REPO_CONFIG;
        const encUser = encodeURIComponent(user.username);
        const path = `${dataPath}/users/${encUser}/certificates.json`;
        const file = await GitHubAPI.getFileContent(owner, repo, path, branch, user.pat);
        if (file && file.content) {
          return JSON.parse(file.content);
        } else {
          if (user.username === window.APP_CONFIG.publicProfileEmail) {
            return await fetchPublicData(user.username, 'certificates');
          }
          return [];
        }
      } catch (e) { return []; }
    }
    const publicEmail = window.APP_CONFIG.publicProfileEmail;
    if (publicEmail) return await fetchPublicData(publicEmail, 'certificates');
    return [];
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
        return JSON.parse(localStorage.getItem(PROJECTS_KEY) || '{}');
      }
    }
    const publicEmail = window.APP_CONFIG.publicProfileEmail;
    if (!user && publicEmail) return await fetchPublicData(publicEmail, 'projects');
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
        return JSON.parse(localStorage.getItem(CERTS_KEY) || '[]');
      }
    }
    if (!user && window.APP_CONFIG.publicProfileEmail) return await fetchPublicData(window.APP_CONFIG.publicProfileEmail, 'certificates');
    return JSON.parse(localStorage.getItem(CERTS_KEY) || '[]');
  }

  // Fixed saveProjects with proper SHA retry
  async function saveProjects(data, forceEmpty = false) {
    const prev = localStorage.getItem(PROJECTS_KEY);
    if (!forceEmpty && prev) {
      const previous = JSON.parse(prev);
      if (Object.keys(previous).length > 0 && Object.keys(data).length === 0) {
        throw new Error('Cannot delete all projects this way. Use "Delete All" button.');
      }
    }
    for (const id in data) {
      if (!data[id].updatedAt) data[id].updatedAt = Date.now();
      if (data[id].blocked === undefined) data[id].blocked = false;
    }
    localStorage.setItem(PROJECTS_KEY, JSON.stringify(data));
    const user = window.SessionManager.getCurrentUser();
    if (!user || !user.pat) return;
    await verifyNotBlocked();
    const { owner, repo, branch, dataPath } = window.REPO_CONFIG;
    const encUser = encodeURIComponent(user.username);
    const path = `${dataPath}/users/${encUser}/projects.json`;
    let retries = 3;
    while (retries > 0) {
      try {
        let remoteData = {};
        let sha = null;
        try {
          const remoteFile = await GitHubAPI.getFileContent(owner, repo, path, branch, user.pat);
          if (remoteFile && remoteFile.sha) {
            sha = remoteFile.sha;
            if (remoteFile.content) remoteData = JSON.parse(remoteFile.content);
          }
        } catch(e) {}
        const merged = { ...remoteData };
        for (const [id, proj] of Object.entries(data)) {
          if (!merged[id] || proj.updatedAt > (merged[id].updatedAt || 0)) {
            merged[id] = proj;
          }
        }
        for (const id of Object.keys(remoteData)) {
          if (!data.hasOwnProperty(id)) {
            delete merged[id];
            await window.Logger.logActivity('project', 'delete_remote', `Deleted project ${id} from remote`);
          }
        }
        let finalData = merged;
        if (forceEmpty && Object.keys(data).length === 0) finalData = {};
        await GitHubAPI.updateFile(owner, repo, path, finalData, 'Update projects', branch, user.pat, sha);
        await window.Logger.logActivity('project', 'save', `Saved ${Object.keys(finalData).length} projects`);
        return;
      } catch (err) {
        retries--;
        if (retries === 0) {
          if (prev) localStorage.setItem(PROJECTS_KEY, prev);
          else localStorage.removeItem(PROJECTS_KEY);
          throw new Error('GitHub write failed after retries: ' + err.message);
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }

  async function saveCertificates(data, forceEmpty = false) {
    const prev = localStorage.getItem(CERTS_KEY);
    if (!forceEmpty && prev) {
      const previous = JSON.parse(prev);
      if (previous.length > 0 && data.length === 0) {
        throw new Error('Cannot delete all certificates this way. Use "Delete All" button.');
      }
    }
    data = data.map(cert => { if (!cert.updatedAt) cert.updatedAt = Date.now(); return cert; });
    localStorage.setItem(CERTS_KEY, JSON.stringify(data));
    const user = window.SessionManager.getCurrentUser();
    if (!user || !user.pat) return;
    await verifyNotBlocked();
    const { owner, repo, branch, dataPath } = window.REPO_CONFIG;
    const encUser = encodeURIComponent(user.username);
    const path = `${dataPath}/users/${encUser}/certificates.json`;
    let retries = 3;
    while (retries > 0) {
      try {
        let remoteData = [];
        let sha = null;
        try {
          const remoteFile = await GitHubAPI.getFileContent(owner, repo, path, branch, user.pat);
          if (remoteFile && remoteFile.sha) {
            sha = remoteFile.sha;
            if (remoteFile.content) remoteData = JSON.parse(remoteFile.content);
          }
        } catch(e) {}
        const mergedMap = new Map();
        for (const cert of remoteData) mergedMap.set(cert.id, cert);
        for (const cert of data) {
          const existing = mergedMap.get(cert.id);
          if (!existing || cert.updatedAt > existing.updatedAt) mergedMap.set(cert.id, cert);
        }
        const merged = Array.from(mergedMap.values());
        let finalData = merged;
        if (forceEmpty && data.length === 0) finalData = [];
        await GitHubAPI.updateFile(owner, repo, path, finalData, 'Update certificates', branch, user.pat, sha);
        await window.Logger.logActivity('certificate', 'save', `Saved ${finalData.length} certificates`);
        return;
      } catch (err) {
        retries--;
        if (retries === 0) {
          if (prev) localStorage.setItem(CERTS_KEY, prev);
          else localStorage.removeItem(CERTS_KEY);
          throw new Error('GitHub write failed after retries: ' + err.message);
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
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
        a.download = `portfolio_data_${window.SessionManager.getCurrentUser()?.username || 'default'}.zip`;
        a.click();
        window.Logger.logActivity('data', 'export', 'Exported data to ZIP');
      });
    });
  }

  async function blockProject(projectId, block = true) {
    const projects = await loadProjects();
    if (!projects[projectId]) throw new Error('Project not found');
    projects[projectId].blocked = block;
    projects[projectId].updatedAt = Date.now();
    await saveProjects(projects);
    await window.Logger.logActivity('project', 'block', `${block ? 'Blocked' : 'Unblocked'} project: ${projects[projectId].title}`);
    return true;
  }

  return {
    loadProjects, saveProjects, loadCertificates, saveCertificates, exportData,
    loadProjectsForView, loadCertificatesForView,
    blockProject
  };
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

function showToast(message, type = 'success') {
  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    container.style.position = 'fixed';
    container.style.bottom = '20px';
    container.style.right = '20px';
    container.style.zIndex = '1050';
    document.body.appendChild(container);
  }
  const toastId = 'toast-' + Date.now();
  const bgColor = type === 'success' ? '#28a745' : (type === 'error' ? '#dc3545' : '#17a2b8');
  const html = `<div id="${toastId}" style="background: ${bgColor}; color: white; padding: 12px 20px; border-radius: 8px; margin-top: 10px; min-width: 200px; max-width: 90%; box-shadow: 0 2px 10px rgba(0,0,0,0.1); animation: fadeInOut 3s ease; font-size: 14px; word-break: break-word;">${message}</div>`;
  container.insertAdjacentHTML('beforeend', html);
  setTimeout(() => { const toast = document.getElementById(toastId); if (toast) toast.remove(); }, 3000);
}

async function generateQRCodeDataURL(text, size = 50) {
  return new Promise((resolve) => {
    if (typeof QRCode === 'undefined') { resolve(null); return; }
    const container = document.createElement('div');
    try {
      new QRCode(container, { text, width: size, height: size, colorDark: "#000000", colorLight: "#ffffff", correctLevel: QRCode.CorrectLevel.L });
      setTimeout(() => {
        const canvas = container.querySelector('canvas');
        resolve(canvas ? canvas.toDataURL('image/png') : null);
      }, 100);
    } catch (err) { resolve(null); }
  });
}

// ─────────────────────────────────────────────────────────────
// Project report — EXCEL DOSSIER (replaces the old PDF version)
// Produces 5 sheets: Overview · Summary & Metrics · Technical
// Details · Work Breakdown · Gallery
// ─────────────────────────────────────────────────────────────
window.generateProjectReport = async function (projectId) {
  // ── Dynamically ensure ExcelJS + FileSaver are present ──
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

  // ── Image selection modal ─────────────────────────────────
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

    // ─── Styling constants ───
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

    // ═══════════════════════════════════════════════════════
    //  SHEET 1 — OVERVIEW
    // ═══════════════════════════════════════════════════════
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

    // Cover image
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

    // Snapshot
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

    // ═══════════════════════════════════════════════════════
    //  SHEET 2 — EXECUTIVE SUMMARY & METRICS
    // ═══════════════════════════════════════════════════════
    const summary = workbook.addWorksheet('Summary & Metrics', {
      pageSetup: { orientation: 'portrait', fitToPage: true, fitToWidth: 1, paperSize: 9,
        margins: { left: 0.5, right: 0.5, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 } }
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

    // Header row
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

    // ═══════════════════════════════════════════════════════
    //  SHEET 3 — TECHNICAL DETAILS
    // ═══════════════════════════════════════════════════════
    const tech = workbook.addWorksheet('Technical Details', {
      pageSetup: { orientation: 'portrait', fitToPage: true, fitToWidth: 1, paperSize: 9,
        margins: { left: 0.5, right: 0.5, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 } }
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

      // I/O Summary
      tech.mergeCells(`B${tr}:D${tr}`);
      styleSectionHeader(tech.getCell(`B${tr}`), '🔌   I/O SUMMARY');
      tech.getRow(tr).height = 24; tr++;

      const io = proj.io || { AI: 0, AO: 0, DI: 0, DO: 0 };
      const maxIO = Math.max(io.AI || 0, io.AO || 0, io.DI || 0, io.DO || 0, 1);

      // Header
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

      // Dates
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

      // Team
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

    // ═══════════════════════════════════════════════════════
    //  SHEET 4 — WORK BREAKDOWN
    // ═══════════════════════════════════════════════════════
    const wbSheet = workbook.addWorksheet('Work Breakdown', {
      pageSetup: { orientation: 'portrait', fitToPage: true, fitToWidth: 1, paperSize: 9,
        margins: { left: 0.5, right: 0.5, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 } }
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

    // ═══════════════════════════════════════════════════════
    //  SHEET 5 — GALLERY (only if images selected)
    // ═══════════════════════════════════════════════════════
    if (selectedImages.length > 0) {
      const gallery = workbook.addWorksheet('Gallery', {
        pageSetup: { orientation: 'portrait', fitToPage: true, fitToWidth: 1, paperSize: 9,
          margins: { left: 0.5, right: 0.5, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 } }
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

    // ── Save ─────────────────────────────────────────────────
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const safeName = (proj.title || 'project').replace(/[^a-z0-9]/gi, '_').toLowerCase();
    saveAs(blob, `${safeName}_report_${new Date().toISOString().slice(0, 10)}.xlsx`);

    if (typeof showToast === 'function') showToast('Excel report generated successfully!', 'success');
    else alert('Excel report generated successfully!');
  } catch (err) {
    console.error('Excel generation failed:', err);
    alert('Excel generation failed: ' + err.message);
  } finally {
    window.hideLoading();
  }
};
