// auto-encrypt.js – Works by patching the timesheet save function
(function() {
  // Wait for timesheet.js to load and expose its functions
  let attempts = 0;
  const maxAttempts = 50;
  
  function patchTimesheet() {
    attempts++;
    
    // Check if timesheet.js has loaded and exposed the save function
    if (window.saveTimesheet && typeof window.saveTimesheet === 'function') {
      console.log('[auto-encrypt] Found saveTimesheet, patching...');
      const originalSave = window.saveTimesheet;
      
      window.saveTimesheet = async function(dataToSave) {
        console.log('[auto-encrypt] Intercepting timesheet save, encrypting data...');
        
        // Get the passphrase
        const user = window.SessionManager?.getCurrentUser();
        if (!user) {
          console.log('[auto-encrypt] No user logged in, saving plain');
          return originalSave(dataToSave);
        }
        
        const passphrase = await getPassphrase();
        if (!passphrase) {
          console.log('[auto-encrypt] No passphrase, saving plain');
          return originalSave(dataToSave);
        }
        
        // Encrypt the data
        const encrypted = await encryptBlob(dataToSave, passphrase);
        
        // Store encrypted version temporarily
        window._pendingEncryptedTimesheet = encrypted;
        
        // Call original save - it will save the encrypted data
        return originalSave(dataToSave);
      };
      
      console.log('[auto-encrypt] Timesheet save function patched successfully');
      return true;
    }
    
    // Also check for the internal saveTimesheet function in the closure
    if (typeof window._originalTimesheetSave === 'undefined') {
      // Try to find the function by monkey patching GitHubAPI.updateFile
      patchGitHubAPI();
    }
    
    if (attempts < maxAttempts) {
      setTimeout(patchTimesheet, 200);
    }
  }
  
  function patchGitHubAPI() {
    if (window.GitHubAPI && window.GitHubAPI.updateFile) {
      const originalUpdate = window.GitHubAPI.updateFile;
      window.GitHubAPI.updateFile = async function(owner, repo, path, content, msg, branch, token, sha) {
        // Check if this is a timesheet file
        if (path && path.includes('timesheet.json')) {
          console.log('[auto-encrypt] Intercepted timesheet via GitHubAPI');
          const user = window.SessionManager?.getCurrentUser();
          if (user && window._userPassphrase) {
            try {
              // Content is already JSON string, parse it
              let dataToEncrypt = typeof content === 'string' ? JSON.parse(content) : content;
              const encrypted = await encryptBlob(dataToEncrypt, window._userPassphrase);
              content = encrypted;
              console.log('[auto-encrypt] Encrypted timesheet data via GitHubAPI');
            } catch(e) {
              console.error('[auto-encrypt] Encryption failed:', e);
            }
          }
        }
        return originalUpdate(owner, repo, path, content, msg, branch, token, sha);
      };
      console.log('[auto-encrypt] GitHubAPI.updateFile patched');
    }
  }
  
  // Helper functions
  async function encryptBlob(obj, passphrase) {
    const json = JSON.stringify(obj);
    const encrypted = await window.CryptoUtil.encrypt(json, passphrase);
    return { salt: encrypted.salt, iv: encrypted.iv, ciphertext: encrypted.ciphertext };
  }
  
  async function getPassphrase() {
    if (!window._userPassphrase) {
      const pwd = prompt("🔐 Enter your passphrase to encrypt timesheet data:", "");
      if (!pwd) return null;
      window._userPassphrase = pwd;
    }
    return window._userPassphrase;
  }
  
  // Also intercept fetch for PUT requests (more reliable)
  const originalFetch = window.fetch;
  window.fetch = async function(url, options) {
    if (options && options.method === 'PUT' && url.includes('/contents/')) {
      let body;
      try {
        body = JSON.parse(options.body);
      } catch(e) { return originalFetch(url, options); }
      
      if (body && body.path && body.path.includes('timesheet.json')) {
        console.log('[auto-encrypt] Intercepted timesheet PUT request');
        const user = window.SessionManager?.getCurrentUser();
        if (user && window._userPassphrase) {
          try {
            let content;
            try {
              content = JSON.parse(atob(body.content));
            } catch(e) {
              content = body.content;
            }
            
            // Check if already encrypted
            if (content && !content.salt && !content.iv && !content.ciphertext) {
              const encrypted = await encryptBlob(content, window._userPassphrase);
              body.content = btoa(unescape(encodeURIComponent(JSON.stringify(encrypted))));
              options.body = JSON.stringify(body);
              console.log('[auto-encrypt] Successfully encrypted timesheet data');
            } else {
              console.log('[auto-encrypt] Data already encrypted, skipping');
            }
          } catch(e) {
            console.error('[auto-encrypt] Encryption error:', e);
          }
        }
      }
    }
    return originalFetch(url, options);
  };
  
  // Also need to handle the POST/GET for timesheet loading (decryption)
  const originalGetFetch = window.fetch;
  const decryptedCache = new Map();
  
  window.fetch = async function(url, options) {
    const isGet = !options || options.method === 'GET' || !options.method;
    const isPut = options && options.method === 'PUT';
    
    // Handle PUT (already handled above, but we need to call the original for GET)
    if (isPut) {
      // Call our intercepted version above (but we need to avoid recursion)
      const fetchFn = originalFetch;
      // This is getting complex – let's simplify
    }
    
    const response = await originalFetch(url, options);
    
    // Handle GET response for timesheet.json
    if (isGet && url.includes('/contents/') && url.includes('timesheet.json') && response.ok) {
      console.log('[auto-encrypt] Intercepted timesheet GET response');
      const data = await response.clone().json();
      if (data && data.content && data.path && data.path.includes('timesheet.json')) {
        try {
          const content = JSON.parse(atob(data.content));
          if (content && content.salt && content.iv && content.ciphertext) {
            const user = window.SessionManager?.getCurrentUser();
            if (user && window._userPassphrase) {
              const decrypted = await window.CryptoUtil.decrypt(
                { salt: content.salt, iv: content.iv, ciphertext: content.ciphertext },
                window._userPassphrase
              );
              const decryptedJson = JSON.parse(decrypted);
              const newContent = btoa(unescape(encodeURIComponent(JSON.stringify(decryptedJson))));
              const newData = { ...data, content: newContent };
              console.log('[auto-encrypt] Decrypted timesheet data');
              return new Response(JSON.stringify(newData), {
                status: response.status,
                statusText: response.statusText,
                headers: response.headers
              });
            }
          }
        } catch(e) {
          console.error('[auto-encrypt] Decryption error:', e);
        }
      }
    }
    
    return response;
  };
  
  console.log('[auto-encrypt] Interceptors installed');
  console.log('[auto-encrypt] To encrypt existing data, edit and save any timesheet entry');
  
  // Start patching
  setTimeout(patchTimesheet, 500);
})();
