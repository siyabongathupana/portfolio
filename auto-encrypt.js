// auto-encrypt.js – Intercepts ALL fetch calls to GitHub API
// Encrypts/decrypts user data files transparently.
// No modifications to any existing .js files required.

(function() {
  // Wait for dependencies
  if (!window.CryptoUtil || !window.SessionManager) {
    console.warn('auto-encrypt.js: dependencies not ready, retrying...');
    setTimeout(arguments.callee, 200);
    return;
  }

  // ---------- Configuration ----------
  const CONFIG = {
    MAX_DECRYPT_ATTEMPTS: 3,
    LOCKOUT_MS: 30 * 60 * 1000,
    SESSION_TIMEOUT_MS: 60 * 60 * 1000,
    USE_HMAC: true
  };

  let decryptAttempts = 0;
  let lastFailTime = 0;
  let sessionTimeoutId = null;

  // ---------- Helper functions ----------
  function isUserDataPath(path) {
    const publicEmail = window.APP_CONFIG?.publicProfileEmail;
    if (publicEmail && path.includes(encodeURIComponent(publicEmail))) {
      return false;
    }
    return path.includes('/data/users/') &&
           !path.endsWith('account.json') &&
           !path.endsWith('verified.json') &&
           !path.endsWith('stats.json');
  }

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
      }, CONFIG.SESSION_TIMEOUT_MS);
    } else {
      if (sessionTimeoutId) clearTimeout(sessionTimeoutId);
      sessionTimeoutId = setTimeout(() => {
        window._userPassphrase = null;
      }, CONFIG.SESSION_TIMEOUT_MS);
    }
    return window._userPassphrase;
  }

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

  // ---------- Intercept global fetch ----------
  const originalFetch = window.fetch;

  window.fetch = async function(url, options) {
    // Only intercept GitHub API calls that read/write file contents
    if (typeof url === 'string' && url.includes('api.github.com/repos/') && url.includes('/contents/')) {
      const isGet = !options || options.method === 'GET' || !options.method;
      const isPut = options && (options.method === 'PUT' || options.method === 'PUT');

      // GET: decrypt content if it's a user data file
      if (isGet) {
        const response = await originalFetch(url, options);
        if (!response.ok) return response;
        const clonedResponse = response.clone();
        const data = await clonedResponse.json();
        if (data && data.content && data.path && isUserDataPath(data.path)) {
          let content = data.content;
          let isEncrypted = false;
          try {
            const parsed = JSON.parse(atob(content));
            if (parsed && parsed.salt && parsed.iv && parsed.ciphertext) {
              isEncrypted = true;
            }
          } catch(e) {}
          if (isEncrypted) {
            const pass = await getPassphrase();
            try {
              const encryptedBlob = JSON.parse(atob(content));
              const decrypted = await decryptBlob(encryptedBlob, pass);
              const newContent = btoa(unescape(encodeURIComponent(JSON.stringify(decrypted))));
              // Return a new response with decrypted content
              const newData = { ...data, content: newContent };
              const newResponse = new Response(JSON.stringify(newData), {
                status: response.status,
                statusText: response.statusText,
                headers: response.headers
              });
              decryptAttempts = 0;
              lastFailTime = 0;
              return newResponse;
            } catch(err) {
              decryptAttempts++;
              lastFailTime = Date.now();
              console.error('Decryption failed', err);
            }
          }
        }
        return response;
      }

      // PUT: encrypt content before sending
      if (isPut && options && options.body) {
        let body = JSON.parse(options.body);
        if (body && body.content && body.path && isUserDataPath(body.path)) {
          const pass = await getPassphrase();
          let originalContent;
          try {
            originalContent = JSON.parse(atob(body.content));
          } catch(e) {
            originalContent = body.content;
          }
          // Check if it's already encrypted (to avoid double encryption)
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
          }
        }
      }
    }
    return originalFetch(url, options);
  };

  console.log('🔒 Global fetch interceptor active – all user data will be encrypted');
})();
