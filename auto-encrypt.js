// auto-encrypt.js – Ultimate encryption interceptor
// Works with GitHubAPI and raw fetch (timesheet.js, dashboard.js, etc.)

(function() {
  // Wait for dependencies
  if (!window.CryptoUtil || !window.SessionManager) {
    console.warn('auto-encrypt.js: waiting for dependencies...');
    setTimeout(arguments.callee, 200);
    return;
  }

  console.log('🔐 auto-encrypt.js initializing...');

  // ---------- Configuration ----------
  const CONFIG = {
    MAX_DECRYPT_ATTEMPTS: 3,
    LOCKOUT_MS: 30 * 60 * 1000,
    SESSION_TIMEOUT_MS: 60 * 60 * 1000,
    USE_HMAC: true,
    DEBUG: true  // Set to false to disable logs
  };

  let decryptAttempts = 0;
  let lastFailTime = 0;
  let sessionTimeoutId = null;

  function log(msg) {
    if (CONFIG.DEBUG) console.log('[auto-encrypt]', msg);
  }

  // ---------- Path detection ----------
  function isUserDataPath(path) {
    if (!path) return false;
    const publicEmail = window.APP_CONFIG?.publicProfileEmail;
    if (publicEmail && path.includes(encodeURIComponent(publicEmail))) {
      log(`Public profile path, skipping: ${path}`);
      return false;
    }
    const isUser = path.includes('/data/users/') &&
           !path.endsWith('account.json') &&
           !path.endsWith('verified.json') &&
           !path.endsWith('stats.json');
    if (isUser) log(`User data path detected: ${path}`);
    return isUser;
  }

  // ---------- Passphrase management ----------
  async function getPassphrase() {
    const user = window.SessionManager.getCurrentUser();
    if (!user) throw new Error('Not logged in');

    if (decryptAttempts >= CONFIG.MAX_DECRYPT_ATTEMPTS &&
        (Date.now() - lastFailTime) < CONFIG.LOCKOUT_MS) {
      throw new Error('Too many failed attempts. Please wait.');
    }
    if (decryptAttempts >= CONFIG.MAX_DECRYPT_ATTEMPTS) {
      decryptAttempts = 0;
      lastFailTime = 0;
    }

    if (!window._userPassphrase) {
      const pwd = prompt("🔐 Enter your passphrase to access encrypted data:", "");
      if (!pwd) throw new Error('Passphrase required');
      window._userPassphrase = pwd;
      if (sessionTimeoutId) clearTimeout(sessionTimeoutId);
      sessionTimeoutId = setTimeout(() => {
        window._userPassphrase = null;
        log('Session timeout – passphrase cleared');
      }, CONFIG.SESSION_TIMEOUT_MS);
    } else {
      if (sessionTimeoutId) clearTimeout(sessionTimeoutId);
      sessionTimeoutId = setTimeout(() => {
        window._userPassphrase = null;
      }, CONFIG.SESSION_TIMEOUT_MS);
    }
    return window._userPassphrase;
  }

  // ---------- Crypto helpers ----------
  async function computeHMAC(data, passphrase) {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw', encoder.encode(passphrase),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
    return Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  async function encryptBlob(obj, passphrase) {
    const json = JSON.stringify(obj);
    const encrypted = await window.CryptoUtil.encrypt(json, passphrase);
    const blob = { salt: encrypted.salt, iv: encrypted.iv, ciphertext: encrypted.ciphertext };
    if (CONFIG.USE_HMAC) {
      blob.hmac = await computeHMAC(JSON.stringify(blob), passphrase);
    }
    return blob;
  }

  async function decryptBlob(blob, passphrase) {
    if (CONFIG.USE_HMAC && blob.hmac) {
      const copy = { ...blob };
      delete copy.hmac;
      const expected = await computeHMAC(JSON.stringify(copy), passphrase);
      if (expected !== blob.hmac) {
        throw new Error('Data integrity check failed');
      }
    }
    const decrypted = await window.CryptoUtil.decrypt(
      { salt: blob.salt, iv: blob.iv, ciphertext: blob.ciphertext },
      passphrase
    );
    return JSON.parse(decrypted);
  }

  // ---------- Intercept GitHubAPI methods (for admin panel) ----------
  if (window.GitHubAPI) {
    const originalGet = window.GitHubAPI.getFileContent;
    const originalUpdate = window.GitHubAPI.updateFile;

    window.GitHubAPI.getFileContent = async function(owner, repo, path, branch, token) {
      const result = await originalGet(owner, repo, path, branch, token);
      if (!result || !result.content || !isUserDataPath(path)) return result;
      let content = result.content;
      let isEncrypted = false;
      try {
        const parsed = typeof content === 'string' ? JSON.parse(content) : content;
        if (parsed && parsed.salt && parsed.iv && parsed.ciphertext) isEncrypted = true;
      } catch(e) {}
      if (isEncrypted) {
        const pass = await getPassphrase();
        try {
          const decrypted = await decryptBlob(content, pass);
          result.content = JSON.stringify(decrypted);
          decryptAttempts = 0;
          lastFailTime = 0;
          log(`Decrypted ${path}`);
        } catch(err) {
          decryptAttempts++;
          lastFailTime = Date.now();
          log(`Decryption failed for ${path}: ${err.message}`);
          throw err;
        }
      }
      return result;
    };

    window.GitHubAPI.updateFile = async function(owner, repo, path, content, msg, branch, token, sha) {
      let final = content;
      if (isUserDataPath(path)) {
        const pass = await getPassphrase();
        final = await encryptBlob(content, pass);
        log(`Encrypted ${path} before upload`);
      }
      return originalUpdate(owner, repo, path, final, msg, branch, token, sha);
    };
    log('GitHubAPI patched');
  }

  // ---------- Intercept global fetch (for timesheet.js and others) ----------
  const originalFetch = window.fetch;
  window.fetch = async function(url, options) {
    // Only intercept GitHub API content requests
    if (typeof url === 'string' && url.includes('api.github.com/repos/') && url.includes('/contents/')) {
      const isGet = !options || options.method === 'GET' || !options.method;
      const isPut = options && (options.method === 'PUT' || options.method === 'PUT');

      // ---- GET: decrypt ----
      if (isGet) {
        const response = await originalFetch(url, options);
        if (!response.ok) return response;
        const cloned = response.clone();
        const data = await cloned.json();
        if (data && data.content && data.path && isUserDataPath(data.path)) {
          let content = data.content;
          let isEncrypted = false;
          try {
            const parsed = JSON.parse(atob(content));
            if (parsed && parsed.salt && parsed.iv && parsed.ciphertext) isEncrypted = true;
          } catch(e) {}
          if (isEncrypted) {
            const pass = await getPassphrase();
            try {
              const encryptedBlob = JSON.parse(atob(content));
              const decrypted = await decryptBlob(encryptedBlob, pass);
              const newContent = btoa(unescape(encodeURIComponent(JSON.stringify(decrypted))));
              const newData = { ...data, content: newContent };
              log(`Decrypted via fetch: ${data.path}`);
              return new Response(JSON.stringify(newData), {
                status: response.status,
                statusText: response.statusText,
                headers: response.headers
              });
            } catch(err) {
              decryptAttempts++;
              lastFailTime = Date.now();
              log(`Fetch decrypt error: ${err.message}`);
            }
          }
        }
        return response;
      }

      // ---- PUT: encrypt ----
      if (isPut && options && options.body) {
        let body;
        try {
          body = JSON.parse(options.body);
        } catch(e) { return originalFetch(url, options); }
        if (body && body.content && body.path && isUserDataPath(body.path)) {
          const pass = await getPassphrase();
          let originalContent;
          try {
            originalContent = JSON.parse(atob(body.content));
          } catch(e) {
            originalContent = body.content;
          }
          // Avoid double encryption
          let isAlreadyEncrypted = false;
          try {
            if (originalContent && originalContent.salt && originalContent.iv && originalContent.ciphertext) {
              isAlreadyEncrypted = true;
            }
          } catch(e) {}
          if (!isAlreadyEncrypted) {
            const encryptedBlob = await encryptBlob(originalContent, pass);
            body.content = btoa(unescape(encodeURIComponent(JSON.stringify(encryptedBlob))));
            options.body = JSON.stringify(body);
            log(`Encrypted via fetch: ${body.path}`);
          }
        }
      }
    }
    return originalFetch(url, options);
  };
  log('Global fetch interceptor active');

  // ---------- One-time migration warning ----------
  log('Ready – user data will be encrypted on next save');
})();
