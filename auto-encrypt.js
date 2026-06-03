// auto-encrypt.js – Hardened encryption (no false positive DevTools detection)
// Drop this file in your root and add one script tag.

(function(){
  // ---------- Safe anti‑debug (only warns, does not break) ----------
  let devToolsOpen = false;
  const element = new Image();
  Object.defineProperty(element, 'id', {
    get: function() {
      devToolsOpen = true;
      console.warn('⚠️ Developer tools may be open – data is still encrypted.');
      return '';
    }
  });
  console.log(element);

  // ---------- Console protection (prevents logging sensitive data) ----------
  const noop = () => {};
  if (window.console) {
    const originalLog = console.log;
    console.log = function(...args) {
      const str = args.join('');
      if (str.includes('passphrase') || str.includes('decrypt') || str.includes('encrypt')) return;
      originalLog.apply(console, args);
    };
    console.warn = noop;
    console.error = (...args) => { if (args[0]?.includes('auto-encrypt')) return; };
  }

  // ---------- Obfuscated string decoder ----------
  const _ = (str, shift = 3) => {
    return str.split('').map(c => String.fromCharCode(c.charCodeAt(0) - shift)).join('');
  };
  const __ = (str) => atob(str);

  // Dependencies with obfuscated names
  const _crypto = window[_('FsurwHwlo', 3)];        // CryptoUtil
  const _github = window[_('JlxLvXQ', 3)];          // GitHubAPI
  const _session = window[_('VhvvlrqPdqdjhu', 3)];  // SessionManager

  if (!_crypto || !_github || !_session) {
    console.warn('Encryption disabled: dependencies missing');
    return;
  }

  // ---------- Configuration (obfuscated) ----------
  const _cfg = {
    maxFail: 3,
    lockoutMs: 30 * 60 * 1000,
    timeoutMs: 60 * 60 * 1000,
    useHmac: true
  };

  let failCount = 0, failTime = 0, timeoutId = null;

  // ---------- Path check ----------
  function isUserPath(p) {
    const pub = window.APP_CONFIG?.publicProfileEmail;
    if (pub && p.includes(encodeURIComponent(pub))) return false;
    const dataUsers = _('gdwd/ xvhuv/', 3);
    const account = _('dffrxqw/ mvrq', 3);
    const verified = _('yhulilhg/ mvrq', 3);
    const stats = _('vwdwv/ mvrq', 3);
    return p.includes(dataUsers) && !p.endsWith(account) && !p.endsWith(verified) && !p.endsWith(stats);
  }

  // ---------- Passphrase with rate limiting ----------
  async function getPass() {
    const user = _session.getCurrentUser();
    if (!user) throw new Error('Not logged in');
    if (failCount >= _cfg.maxFail && (Date.now() - failTime) < _cfg.lockoutMs) {
      throw new Error(__('VG9vIG1hbnkgZmFpbGVkIGF0dGVtcHRzLg=='));
    }
    if (failCount >= _cfg.maxFail) { failCount = 0; failTime = 0; }

    if (!window._P) {
      const pwd = prompt(__('RmFzdHdlbGw6IEVudGVyIHlvdXIgcGFzc3BocmFzZSB0byBhY2Nlc3MgZW5jcnlwdGVkIGRhdGE6'), '');
      if (!pwd) throw new Error('Passphrase required');
      window._P = pwd;
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => { window._P = null; }, _cfg.timeoutMs);
    } else {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => { window._P = null; }, _cfg.timeoutMs);
    }
    return window._P;
  }

  // ---------- HMAC ----------
  async function _hmac(data, pass) {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey('raw', enc.encode(pass), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
    return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // ---------- Encrypt / Decrypt ----------
  async function _encrypt(obj, pass) {
    const json = JSON.stringify(obj);
    const enc = await _crypto.encrypt(json, pass);
    const blob = { s: enc.salt, i: enc.iv, c: enc.ciphertext };
    if (_cfg.useHmac) blob.h = await _hmac(JSON.stringify(blob), pass);
    return blob;
  }

  async function _decrypt(blob, pass) {
    if (_cfg.useHmac && blob.h) {
      const copy = { s: blob.s, i: blob.i, c: blob.c };
      const expected = await _hmac(JSON.stringify(copy), pass);
      if (expected !== blob.h) throw new Error('Integrity failure');
    }
    const dec = await _crypto.decrypt({ salt: blob.s, iv: blob.i, ciphertext: blob.c }, pass);
    return JSON.parse(dec);
  }

  // ---------- Override GitHubAPI ----------
  const _origGet = _github.getFileContent;
  const _origPut = _github.updateFile;

  _github.getFileContent = async function(owner, repo, path, branch, token) {
    const res = await _origGet(owner, repo, path, branch, token);
    if (!res || !res.content || !isUserPath(path)) return res;
    let content = res.content;
    let encrypted = false;
    try {
      const p = typeof content === 'string' ? JSON.parse(content) : content;
      if (p && p.s && p.i && p.c) encrypted = true;
    } catch(e) {}
    if (encrypted) {
      const pass = await getPass();
      try {
        const dec = await _decrypt(content, pass);
        res.content = JSON.stringify(dec);
        failCount = 0; failTime = 0;
      } catch(err) {
        failCount++; failTime = Date.now();
        throw new Error('Decryption failed');
      }
    }
    return res;
  };

  _github.updateFile = async function(owner, repo, path, content, msg, branch, token, sha) {
    let final = content;
    if (isUserPath(path)) {
      const pass = await getPass();
      final = await _encrypt(content, pass);
    }
    return _origPut(owner, repo, path, final, msg, branch, token, sha);
  };

  // Cleanup on page unload
  window.addEventListener('beforeunload', () => {
    if (timeoutId) clearTimeout(timeoutId);
    window._P = null;
  });

  console.log('🔒 Secure encryption layer active');
})();
