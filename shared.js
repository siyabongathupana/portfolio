// shared.js – Guaranteed instant verification using localStorage cache

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
    setCurrentUser: (username, pat, passphrase) => {
      current = { username, pat, timestamp: Date.now() };
      sessionStorage.setItem('portfolioUser', JSON.stringify(current));
      if (passphrase) {
        sessionStorage.setItem('portfolioPassphrase', btoa(passphrase));
      }
      window.Logger.log('login', `User logged in as ${username}`, 'INFO');
    },
    getPassphrase: () => {
      const stored = sessionStorage.getItem('portfolioPassphrase');
      if (stored) {
        try { return atob(stored); } catch(e) {}
      }
      return null;
    },
    logout: () => {
      current = null;
      sessionStorage.removeItem('portfolioUser');
      sessionStorage.removeItem('portfolioPassphrase');
    },
    isAdmin: () => {
      const user = window.SessionManager.getCurrentUser();
      return user && window.APP_CONFIG.adminUsers && window.APP_CONFIG.adminUsers.includes(user.username);
    }
  };
})();

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

// ================================
// USER PREFERENCES
// ================================
window.loadUserPreferences = async function(username, token) {
  const { owner, repo, branch, dataPath } = window.REPO_CONFIG;
  const encUser = encodeURIComponent(username);
  const path = `${dataPath}/users/${encUser}/preferences.json`;
  try {
    const file = await GitHubAPI.getFileContent(owner, repo, path, branch, token);
    if (file && file.content) {
      return JSON.parse(file.content);
    }
  } catch(e) {}
  return { encryptionEnabled: false };
};

window.saveUserPreferences = async function(username, prefs, token) {
  const { owner, repo, branch, dataPath } = window.REPO_CONFIG;
  const encUser = encodeURIComponent(username);
  const path = `${dataPath}/users/${encUser}/preferences.json`;
  let sha = null;
  try {
    const existing = await GitHubAPI.getFileContent(owner, repo, path, branch, token);
    if (existing && existing.sha) sha = existing.sha;
  } catch(e) {}
  await GitHubAPI.updateFile(owner, repo, path, prefs, 'Update preferences', branch, token, sha);
};

// ================================
// ACCOUNT MANAGER – WITH LOCAL CACHE
// ================================
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
    console.log(`🔔 [Admin Notification] New user registered: ${userEmail}`);
    console.log(`   → Go to Admin → Users tab to verify them.`);
    
    if (!cfg || !cfg.publicKey || cfg.publicKey === 'YOUR_EMAILJS_PUBLIC_KEY') {
      console.warn('⚠️ EmailJS not configured – check config.js');
      return;
    }
    try {
      await this._sendEmail(cfg.adminTemplateID, {
        to_email: cfg.adminEmail,
        subject: `New user registration: ${userEmail}`,
        message: `A new user (${userEmail}) has created an account. Please verify them from the admin panel.`
      });
      console.log(`📧 Admin notification email sent to ${cfg.adminEmail}`);
    } catch (e) {
      console.warn('⚠️ Admin email failed (ignored):', e.message);
    }
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
  
  // ============================================================
  // CACHED VERIFICATION – reads from localStorage first
  // ============================================================
  isVerifiedLocally(email) {
    const cache = localStorage.getItem('verifiedCache');
    if (cache) {
      try {
        const data = JSON.parse(cache);
        if (data[email] === true) return true;
        if (data[email] === false) return false;
      } catch(e) {}
    }
    return null; // unknown
  },

  setVerifiedLocally(email, status) {
    let cache = {};
    const existing = localStorage.getItem('verifiedCache');
    if (existing) {
      try { cache = JSON.parse(existing); } catch(e) {}
    }
    cache[email] = status;
    localStorage.setItem('verifiedCache', JSON.stringify(cache));
  },

  // For admin dashboard: returns all verification statuses from cache
  getAllVerifiedStatuses() {
    const cache = localStorage.getItem('verifiedCache');
    if (cache) {
      try { return JSON.parse(cache); } catch(e) {}
    }
    return {};
  },

  // Admin bulk refresh – fetches fresh from GitHub and updates cache
  async refreshVerificationCache(adminToken) {
    const { owner, repo, branch } = window.REPO_CONFIG;
    const cb = Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/data/verified_users.json?ref=${branch}&cb=${cb}`;
    try {
      const resp = await fetch(url, {
        headers: {
          'Authorization': `token ${adminToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache'
        },
        cache: 'no-store'
      });
      if (resp.ok) {
        const data = await resp.json();
        const content = atob(data.content.replace(/\n/g, ''));
        const json = JSON.parse(content);
        const verifiedList = json.verified || [];
        // Build a map of email->true for all verified
        const map = {};
        verifiedList.forEach(email => { map[email] = true; });
        // Also mark all other known users as false? We'll only store true values.
        // For users not in the list, we don't set them; they remain as whatever they were.
        // But we want to show verified only if true.
        // We'll update the cache with the fresh list.
        let cache = this.getAllVerifiedStatuses();
        // For each verified, set true
        verifiedList.forEach(email => { cache[email] = true; });
        // For users that are in the list but previously false, we leave them.
        // We don't clear others, because they might be unverified.
        // If we want to be thorough, we could set all known users from the users list.
        // But we'll just merge.
        localStorage.setItem('verifiedCache', JSON.stringify(cache));
        console.log('✅ Verification cache refreshed from GitHub');
        return cache;
      }
    } catch (err) {
      console.warn('Failed to refresh cache:', err);
    }
    return this.getAllVerifiedStatuses();
  },

  // Login verification – tries cache first, then single API call
  async isEmailVerified(email, forceCheck = false) {
    // First check local cache
    const cached = this.isVerifiedLocally(email);
    if (cached === true) return true;
    if (!forceCheck && cached === false) return false; // only if not forcing

    // If not cached or forceCheck, do a single API call (no retries)
    const { owner, repo, branch, dataPath } = window.REPO_CONFIG;
    const encUser = encodeURIComponent(email);
    const cb = Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
    const userUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${dataPath}/users/${encUser}/verified.json?ref=${branch}&cb=${cb}`;
    try {
      const resp = await fetch(userUrl, {
        headers: {
          'Authorization': `token ${window.SessionManager.getCurrentUser()?.pat || ''}`,
          'Accept': 'application/vnd.github.v3+json',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache'
        },
        cache: 'no-store'
      });
      if (resp.ok) {
        const data = await resp.json();
        const content = atob(data.content.replace(/\n/g, ''));
        const json = JSON.parse(content);
        if (json.verified === true) {
          this.setVerifiedLocally(email, true);
          return true;
        }
      }
    } catch (err) {
      console.warn('Verification API call failed:', err);
    }
    // If individual check fails, try global list as fallback
    try {
      const cb2 = Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
      const globalUrl = `https://api.github.com/repos/${owner}/${repo}/contents/data/verified_users.json?ref=${branch}&cb=${cb2}`;
      const resp = await fetch(globalUrl, {
        headers: {
          'Authorization': `token ${window.SessionManager.getCurrentUser()?.pat || ''}`,
          'Accept': 'application/vnd.github.v3+json',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache'
        },
        cache: 'no-store'
      });
      if (resp.ok) {
        const data = await resp.json();
        const content = atob(data.content.replace(/\n/g, ''));
        const json = JSON.parse(content);
        if (json.verified && json.verified.includes(email)) {
          this.setVerifiedLocally(email, true);
          return true;
        }
      }
    } catch (err) {
      console.warn('Global verification check failed:', err);
    }
    // If not verified, cache as false
    this.setVerifiedLocally(email, false);
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
    } catch (err) {
      console.warn('⚠️ Could not create verified.json:', err.message);
    }
    
    try {
      await window.saveUserPreferences(username, { encryptionEnabled: true }, pat);
      console.log(`🔐 Encryption enabled for ${username}`);
    } catch (e) {
      console.warn(`⚠️ Could not save preferences for ${username}:`, e.message);
    }
    
    await this._notifyAdminNewUser(username);
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
  },

  async verifyUser(username, adminToken) {
    const { owner, repo, branch, dataPath } = window.REPO_CONFIG;
    const encUser = encodeURIComponent(username);
    const path = `${dataPath}/users/${encUser}/verified.json`;

    let sha = null;
    try {
      const file = await GitHubAPI.getFileContent(owner, repo, path, branch, adminToken);
      if (file && file.sha) sha = file.sha;
    } catch(e) {}

    const newContent = {
      verified: true,
      verifiedAt: Date.now(),
      email: username
    };
    const result = await GitHubAPI.updateFile(owner, repo, path, newContent, `Verify user ${username}`, branch, adminToken, sha);
    console.log(`✅ Updated individual verified.json for ${username}`);

    const globalPath = `data/verified_users.json`;
    let globalData = { verified: [] };
    let globalSha = null;
    try {
      const globalFile = await GitHubAPI.getFileContent(owner, repo, globalPath, branch, adminToken);
      if (globalFile && globalFile.content) {
        globalData = JSON.parse(globalFile.content);
        globalSha = globalFile.sha;
      }
    } catch(e) {}
    if (!globalData.verified) globalData.verified = [];
    if (!globalData.verified.includes(username)) {
      globalData.verified.push(username);
      await GitHubAPI.updateFile(owner, repo, globalPath, globalData, `Add ${username} to verified list`, branch, adminToken, globalSha);
      console.log(`✅ Added ${username} to global verified list`);
    }

    // Update local cache immediately
    this.setVerifiedLocally(username, true);

    await window.Logger.logActivity('admin', 'verify_user', `Verified user ${username}`);
    return result;
  }
};

// ================================
// PORTFOLIO DATA
// ================================
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
          let data = JSON.parse(file.content);
          if (data.salt && data.iv && data.ciphertext) {
            const passphrase = window.SessionManager.getPassphrase();
            if (!passphrase) throw new Error('Passphrase required to decrypt projects');
            const decryptedStr = await window.CryptoUtil.decrypt(data, passphrase);
            data = JSON.parse(decryptedStr);
          }
          return data;
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
          let data = JSON.parse(file.content);
          if (data.salt && data.iv && data.ciphertext) {
            const passphrase = window.SessionManager.getPassphrase();
            if (!passphrase) throw new Error('Passphrase required to decrypt certificates');
            const decryptedStr = await window.CryptoUtil.decrypt(data, passphrase);
            data = JSON.parse(decryptedStr);
          }
          return data;
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
          let data = JSON.parse(file.content);
          if (data.salt && data.iv && data.ciphertext) {
            const passphrase = window.SessionManager.getPassphrase();
            if (!passphrase) throw new Error('Passphrase required to decrypt projects');
            const decryptedStr = await window.CryptoUtil.decrypt(data, passphrase);
            data = JSON.parse(decryptedStr);
          }
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
          let data = JSON.parse(file.content);
          if (data.salt && data.iv && data.ciphertext) {
            const passphrase = window.SessionManager.getPassphrase();
            if (!passphrase) throw new Error('Passphrase required to decrypt certificates');
            const decryptedStr = await window.CryptoUtil.decrypt(data, passphrase);
            data = JSON.parse(decryptedStr);
          }
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
    
    const prefs = await window.loadUserPreferences(user.username, user.pat);
    let contentToSave = data;
    if (prefs.encryptionEnabled) {
      const passphrase = window.SessionManager.getPassphrase();
      if (!passphrase) throw new Error('Passphrase required to encrypt projects');
      contentToSave = await window.CryptoUtil.encrypt(JSON.stringify(data), passphrase);
    }
    
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
        
        let finalData = contentToSave;
        if (!prefs.encryptionEnabled) {
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
          finalData = merged;
          if (forceEmpty && Object.keys(data).length === 0) finalData = {};
        }
        
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
    
    const prefs = await window.loadUserPreferences(user.username, user.pat);
    let contentToSave = data;
    if (prefs.encryptionEnabled) {
      const passphrase = window.SessionManager.getPassphrase();
      if (!passphrase) throw new Error('Passphrase required to encrypt certificates');
      contentToSave = await window.CryptoUtil.encrypt(JSON.stringify(data), passphrase);
    }
    
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
        
        let finalData = contentToSave;
        if (!prefs.encryptionEnabled) {
          const mergedMap = new Map();
          for (const cert of remoteData) mergedMap.set(cert.id, cert);
          for (const cert of data) {
            const existing = mergedMap.get(cert.id);
            if (!existing || cert.updatedAt > existing.updatedAt) mergedMap.set(cert.id, cert);
          }
          const merged = Array.from(mergedMap.values());
          finalData = merged;
          if (forceEmpty && data.length === 0) finalData = [];
        }
        
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

window.generateProjectReport = async function(projectId) {
  const data = await window.portfolioData.loadProjectsForView();
  const proj = data[projectId];
  if (!proj) { alert("Project not found!"); return; }
  if (proj.blocked === true && !window.SessionManager.isAdmin()) { alert("Access denied: This project is blocked."); return; }
  const isDeltaV = proj.projectCategory === 'deltaV' || proj.controllerType;
  let selectedImages = proj.selectedImages || [];
  
  if (selectedImages.length > 0) {
    const imageOptions = selectedImages.map((img, idx) => `<div class="image-select-option" style="display: flex; align-items: center; margin-bottom: 15px; padding: 10px; border: 1px solid #e2e8f0; border-radius: 8px; background: white; flex-wrap: wrap;">
        <input type="checkbox" class="pdf-image-checkbox" data-idx="${idx}" checked style="margin-right: 15px; width: 20px; height: 20px;">
        <img src="${img.url}" style="width: 50px; height: 50px; object-fit: cover; border-radius: 6px; margin-right: 15px;">
        <div style="flex: 1; min-width: 150px;"><div style="font-weight: 500; margin-bottom: 4px; color: #1e2a3e;">Image ${idx + 1}</div><div style="font-size: 12px; color: #666; word-break: break-word;">${img.caption || 'No caption'}</div></div>
      </div>`).join('');
    const modalHtml = `<div id="pdfImageModal" style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.6); z-index: 10000; display: flex; align-items: center; justify-content: center; padding: 15px;">
        <div style="background: white; border-radius: 20px; max-width: 550px; width: 100%; max-height: 85vh; overflow: auto; padding: 20px;">
          <h3>Select Images for PDF Report</h3><div id="pdfImageList">${imageOptions}</div>
          <div style="display: flex; gap: 10px; justify-content: flex-end; margin-top: 20px;">
            <button id="selectAllImagesBtn">Select All</button><button id="deselectAllImagesBtn">Deselect All</button>
            <button id="confirmPdfImagesBtn">Generate PDF</button><button id="cancelPdfImagesBtn">Cancel</button>
          </div>
        </div>
      </div>`;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    const result = await new Promise((resolve) => {
      const modal = document.getElementById('pdfImageModal');
      document.getElementById('selectAllImagesBtn').onclick = () => document.querySelectorAll('#pdfImageList .pdf-image-checkbox').forEach(cb => cb.checked = true);
      document.getElementById('deselectAllImagesBtn').onclick = () => document.querySelectorAll('#pdfImageList .pdf-image-checkbox').forEach(cb => cb.checked = false);
      document.getElementById('confirmPdfImagesBtn').onclick = () => {
        const selected = []; document.querySelectorAll('#pdfImageList .pdf-image-checkbox:checked').forEach(cb => selected.push(selectedImages[parseInt(cb.dataset.idx)]));
        modal.remove(); resolve(selected);
      };
      document.getElementById('cancelPdfImagesBtn').onclick = () => { modal.remove(); resolve(null); };
    });
    if (result === null) return;
    selectedImages = result;
  }
  window.showLoading('Generating PDF...');
  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const darkColor = '#0b2b3b';
    const textColor = '#1e2a3e';
    const repoOwner = window.REPO_CONFIG.owner;
    const repoName = window.REPO_CONFIG.repo;
    const repoUrl = `https://github.com/${repoOwner}/${repoName}`;
    let logoImage = null;
    try {
      const logoResponse = await fetch(`https://raw.githubusercontent.com/${repoOwner}/${repoName}/main/logo.png`);
      if (logoResponse.ok) { const logoBlob = await logoResponse.blob(); logoImage = await new Promise(resolve => { const reader = new FileReader(); reader.onloadend = () => resolve(reader.result); reader.readAsDataURL(logoBlob); }); }
    } catch(e) {}
    // Cover
    doc.setFillColor(11,43,59); doc.rect(0,0,pageWidth,15,'F');
    doc.setFillColor(47,199,255); doc.rect(0,15,pageWidth,3,'F');
    if(logoImage) doc.addImage(logoImage,'PNG',pageWidth/2-20,35,40,40);
    else { doc.setFillColor(47,199,255); doc.circle(pageWidth/2,55,20,'F'); doc.setFillColor(255,255,255); doc.setFontSize(24); doc.setFont(undefined,'bold'); doc.text('YP',pageWidth/2,62,{align:'center'}); }
    doc.setTextColor(11,43,59); doc.setFontSize(32); doc.setFont(undefined,'bold'); doc.text('PROJECT REPORT',pageWidth/2,95,{align:'center'});
    doc.setFontSize(14); doc.setFont(undefined,'normal'); doc.setTextColor(100,100,100); doc.text('Professional Engineering Documentation',pageWidth/2,110,{align:'center'});
    doc.setDrawColor(47,199,255); doc.setLineWidth(1); doc.line(pageWidth/2-50,118,pageWidth/2+50,118);
    doc.setFontSize(22); doc.setFont(undefined,'bold'); doc.setTextColor(darkColor); const titleLines = doc.splitTextToSize(proj.title,140); doc.text(titleLines,pageWidth/2,145,{align:'center'});
    const projectTypeText = isDeltaV ? 'DELTAV PROJECT' : 'GENERAL ENGINEERING PROJECT';
    doc.setFillColor(47,199,255); doc.roundedRect(pageWidth/2-45,165,90,10,5,5,'F'); doc.setTextColor(255,255,255); doc.setFontSize(9); doc.setFont(undefined,'bold'); doc.text(projectTypeText,pageWidth/2,172,{align:'center'});
    const status = proj.status||'Planned'; let statusColor; if(status==='Completed')statusColor=[40,167,69]; else if(status==='Ongoing')statusColor=[47,199,255]; else if(status==='Paused')statusColor=[255,193,7]; else statusColor=[108,117,125];
    doc.setFillColor(statusColor[0],statusColor[1],statusColor[2]); doc.roundedRect(pageWidth/2-35,182,70,9,5,5,'F'); doc.setTextColor(255,255,255); doc.setFontSize(9); doc.text(status,pageWidth/2,188,{align:'center'});
    doc.setFontSize(8); doc.setFont(undefined,'italic'); doc.setTextColor(150,150,150); doc.text(`Generated: ${new Date().toLocaleString()}`,pageWidth/2,pageHeight-25,{align:'center'}); doc.text('Your Portfolio System',pageWidth/2,pageHeight-18,{align:'center'});
    const qrDataURL = await generateQRCodeDataURL(repoUrl,50); if(qrDataURL) doc.addImage(qrDataURL,'PNG',pageWidth-25,pageHeight-28,15,15);
    doc.addPage();
    let yPos=20;
    doc.setFillColor(11,43,59); doc.rect(0,yPos,pageWidth,10,'F'); doc.setFillColor(47,199,255); doc.rect(0,yPos+10,pageWidth,3,'F'); yPos+=20;
    doc.setFontSize(20); doc.setFont(undefined,'bold'); doc.setTextColor(darkColor); doc.text('Project Overview',20,yPos); yPos+=15;
    const infoItems = [{label:'Project Title',value:proj.title},{label:'Industry/Category',value:proj.industry||'N/A'},{label:'Company/Client',value:proj.client||'N/A'},{label:'Project Duration',value:proj.duration||'N/A'},{label:'Status',value:proj.status||'N/A'},{label:'User Role',value:proj.userRole||'N/A'},{label:'Team Members',value:proj.teamMembers||'N/A'}];
    let leftX=20,rightX=110,leftY=yPos,rightY=yPos,boxHeight=22;
    for(let i=0;i<infoItems.length;i++){ const item=infoItems[i]; const isLeft=i<Math.ceil(infoItems.length/2); const x=isLeft?leftX:rightX; const y=isLeft?leftY:rightY;
      doc.setFillColor(248,250,252); doc.roundedRect(x-3,y-5,85,boxHeight,4,4,'F');
      doc.setFontSize(8); doc.setFont(undefined,'bold'); doc.setTextColor(100,100,100); doc.text(item.label,x,y);
      doc.setFontSize(10); doc.setFont(undefined,'normal'); doc.setTextColor(textColor); const valueLines=doc.splitTextToSize(item.value||'N/A',78); doc.text(valueLines,x,y+6);
      if(isLeft) leftY+=boxHeight+3; else rightY+=boxHeight+3;
    }
    yPos = Math.max(leftY,rightY)+10;
    if(proj.description||proj.shortDesc){
      doc.setFillColor(240,248,252); doc.roundedRect(15,yPos-3,pageWidth-30,8,4,4,'F');
      doc.setFontSize(14); doc.setFont(undefined,'bold'); doc.setTextColor(darkColor); doc.text('Project Description',20,yPos); yPos+=10;
      doc.setFontSize(10); doc.setFont(undefined,'normal'); doc.setTextColor(textColor); const descText=proj.description||proj.shortDesc||'No description provided'; const descLines=doc.splitTextToSize(descText,pageWidth-40); doc.text(descLines,20,yPos); yPos+=(descLines.length*5)+15;
    }
    if(isDeltaV){
      doc.setFillColor(11,43,59); doc.rect(0,yPos,pageWidth,10,'F'); doc.setFillColor(47,199,255); doc.rect(0,yPos+10,pageWidth,3,'F'); yPos+=20;
      doc.setFontSize(18); doc.setFont(undefined,'bold'); doc.setTextColor(darkColor); doc.text('DeltaV Configuration',20,yPos); yPos+=15;
      const deltaVItems=[{label:'Controller Type',value:proj.controllerType||'N/A'},{label:'DeltaV Version',value:proj.deltaVVersion||'N/A'},{label:'Project Type',value:proj.projectType||'N/A'},{label:'Cabinets',value:proj.cabinetCount?.toString()||'0'}];
      for(const item of deltaVItems){
        doc.setFillColor(245,247,250); doc.roundedRect(18,yPos-3,pageWidth-36,10,3,3,'F');
        doc.setFontSize(9); doc.setFont(undefined,'bold'); doc.setTextColor(100,100,100); doc.text(item.label,25,yPos);
        doc.setFontSize(10); doc.setFont(undefined,'normal'); doc.setTextColor(textColor); doc.text(item.value,75,yPos); yPos+=12;
      }
      yPos+=10; doc.setFontSize(14); doc.setFont(undefined,'bold'); doc.setTextColor(darkColor); doc.text('I/O Configuration',20,yPos); yPos+=12;
      const io=proj.io||{AI:0,AO:0,DI:0,DO:0}; const ioData=[{label:'AI',value:io.AI},{label:'AO',value:io.AO},{label:'DI',value:io.DI},{label:'DO',value:io.DO}];
      const maxIo=Math.max(io.AI,io.AO,io.DI,io.DO,1); const startX=20; const barWidth=35;
      for(let i=0;i<ioData.length;i++){ const item=ioData[i]; const barX=startX+(i*42); doc.setFillColor(230,240,250); doc.rect(barX,yPos+5,barWidth,30,'F'); const barHeight=(item.value/maxIo)*28; doc.setFillColor(47,199,255); doc.rect(barX,yPos+35-barHeight,barWidth,barHeight,'F'); doc.setFontSize(9); doc.setFont(undefined,'bold'); doc.setTextColor(100,100,100); doc.text(item.label,barX+barWidth/2,yPos+42,{align:'center'}); doc.setFontSize(11); doc.setFont(undefined,'bold'); doc.setTextColor(darkColor); doc.text(item.value.toString(),barX+barWidth/2,yPos+50,{align:'center'}); }
      yPos+=60;
      if(proj.dates?.start){ const dateParts=[]; if(proj.dates.start) dateParts.push(`Start: ${proj.dates.start}`); if(proj.dates.finish) dateParts.push(`Finish: ${proj.dates.finish}`); if(proj.dates.ifat) dateParts.push(`IFAT: ${proj.dates.ifat}`); if(proj.dates.cfat) dateParts.push(`CFAT: ${proj.dates.cfat}`); if(dateParts.length){ doc.setFillColor(240,248,252); doc.roundedRect(15,yPos-5,pageWidth-30,12,4,4,'F'); doc.setFontSize(9); doc.setFont(undefined,'normal'); doc.setTextColor(textColor); doc.text(dateParts.join('  |  '),20,yPos); yPos+=15; } }
      if(proj.team?.lead||proj.team?.engineer||proj.team?.technician){ doc.setFontSize(9); doc.setTextColor(100,100,100); doc.text(`Team: Lead: ${proj.team.lead||'N/A'}  |  Engineer: ${proj.team.engineer||'N/A'}  |  Technician: ${proj.team.technician||'N/A'}`,20,yPos); yPos+=12; }
    } else {
      if(proj.technical){
        doc.setFillColor(11,43,59); doc.rect(0,yPos,pageWidth,10,'F'); doc.setFillColor(47,199,255); doc.rect(0,yPos+10,pageWidth,3,'F'); yPos+=20;
        doc.setFontSize(18); doc.setFont(undefined,'bold'); doc.setTextColor(darkColor); doc.text('Technical Details',20,yPos); yPos+=15;
        const techItems=[{label:'Technologies',value:proj.technical.technologies},{label:'Hardware',value:proj.technical.hardware},{label:'Software',value:proj.technical.software},{label:'Protocols',value:proj.technical.protocols},{label:'Languages',value:proj.technical.languages}];
        for(const item of techItems){ if(item.value){ doc.setFillColor(245,247,250); doc.roundedRect(18,yPos-3,pageWidth-36,10,3,3,'F'); doc.setFontSize(9); doc.setFont(undefined,'bold'); doc.setTextColor(100,100,100); doc.text(item.label,25,yPos); doc.setFontSize(9); doc.setFont(undefined,'normal'); doc.setTextColor(textColor); const lines=doc.splitTextToSize(item.value,pageWidth-80); doc.text(lines,70,yPos); yPos+=12+(lines.length*4); } }
        yPos+=5;
      }
      if(proj.workBreakdown){
        const wb=proj.workBreakdown; const wbSections=[{title:'Work Breakdown Structure',content:wb.workBreakdown},{title:'Problems Encountered',content:wb.problems},{title:'Root Causes',content:wb.rootCauses},{title:'Solutions Implemented',content:wb.solutions},{title:'Improvements Made',content:wb.improvements},{title:'Lessons Learned',content:wb.lessons},{title:'Risks Identified',content:wb.risks},{title:'Testing Procedure',content:wb.testing}];
        for(const section of wbSections){ if(section.content){ if(yPos>pageHeight-60){ doc.addPage(); yPos=20; doc.setFillColor(11,43,59); doc.rect(0,yPos,pageWidth,10,'F'); doc.setFillColor(47,199,255); doc.rect(0,yPos+10,pageWidth,3,'F'); yPos+=20; doc.setFontSize(18); doc.setFont(undefined,'bold'); doc.setTextColor(darkColor); doc.text('Work Breakdown & Analysis',20,yPos); yPos+=15; }
            doc.setFillColor(240,248,252); doc.roundedRect(15,yPos-3,pageWidth-30,8,4,4,'F'); doc.setFontSize(12); doc.setFont(undefined,'bold'); doc.setTextColor(darkColor); doc.text(section.title,20,yPos); yPos+=10; doc.setFontSize(9); doc.setFont(undefined,'normal'); doc.setTextColor(textColor); const contentLines=doc.splitTextToSize(section.content,pageWidth-40); doc.text(contentLines,20,yPos); yPos+=(contentLines.length*5)+10; } }
      }
    }
    if(selectedImages.length>0){
      if(yPos>pageHeight-60){ doc.addPage(); yPos=20; }
      doc.setFillColor(11,43,59); doc.rect(0,yPos,pageWidth,10,'F'); doc.setFillColor(47,199,255); doc.rect(0,yPos+10,pageWidth,3,'F'); yPos+=20;
      doc.setFontSize(18); doc.setFont(undefined,'bold'); doc.setTextColor(darkColor); doc.text('Project Gallery',20,yPos); yPos+=15;
      let imgCount=0;
      for(const img of selectedImages){
        if(imgCount%2===0){ if(yPos>pageHeight-80){ doc.addPage(); yPos=20; doc.setFillColor(11,43,59); doc.rect(0,yPos,pageWidth,10,'F'); doc.setFillColor(47,199,255); doc.rect(0,yPos+10,pageWidth,3,'F'); yPos+=20; doc.setFontSize(18); doc.setFont(undefined,'bold'); doc.setTextColor(darkColor); doc.text('Project Gallery (continued)',20,yPos); yPos+=15; }
          const imgX=15,imgY=yPos; doc.setDrawColor(200,200,200); doc.setFillColor(250,250,250); doc.roundedRect(imgX,imgY,85,70,5,5,'FD');
          try{ const imgResponse=await fetch(img.url); if(imgResponse.ok){ const imgBlob=await imgResponse.blob(); const imgDataUrl=await new Promise(resolve=>{const reader=new FileReader(); reader.onloadend=()=>resolve(reader.result); reader.readAsDataURL(imgBlob);}); doc.addImage(imgDataUrl,'JPEG',imgX+2,imgY+2,81,50); } }catch(err){ doc.setFontSize(8); doc.setFont(undefined,'italic'); doc.setTextColor(150,150,150); doc.text('Image preview',imgX+42,imgY+30,{align:'center'}); }
          if(img.caption){ doc.setFontSize(7); doc.setFont(undefined,'normal'); doc.setTextColor(100,100,100); const captionLines=doc.splitTextToSize(img.caption,80); doc.text(captionLines,imgX+2,imgY+60); }
        }
        imgCount++; if(imgCount%2===0) yPos+=78;
      }
    }
    const pageCount=doc.internal.getNumberOfPages();
    for(let i=1;i<=pageCount;i++){ doc.setPage(i); doc.setDrawColor(200,200,200); doc.setLineWidth(0.5); doc.line(15,pageHeight-15,pageWidth-15,pageHeight-15); doc.setFontSize(8); doc.setFont(undefined,'normal'); doc.setTextColor(120,120,120); doc.text(`Your Portfolio - ${proj.title.substring(0,40)}`,20,pageHeight-8); doc.text(`Page ${i} of ${pageCount}`,pageWidth/2,pageHeight-8,{align:'center'}); const pageQrDataURL=await generateQRCodeDataURL(repoUrl,25); if(pageQrDataURL) doc.addImage(pageQrDataURL,'PNG',pageWidth-22,pageHeight-20,12,12); doc.setFontSize(35); doc.setTextColor(240,240,240); doc.setGState(new doc.GState({opacity:0.08})); doc.text('CONFIDENTIAL',pageWidth/2,pageHeight/2,{align:'center',angle:45}); doc.setGState(new doc.GState({opacity:1})); }
    const safeFileName=proj.title.replace(/[^a-z0-9]/gi,'_').toLowerCase(); doc.save(`${safeFileName}_report.pdf`);
    showToast('PDF generated successfully!','success');
  } catch(err){ console.error(err); showToast('PDF generation failed: '+err.message,'error'); } finally{ window.hideLoading(); }
};
