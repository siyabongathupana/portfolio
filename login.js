// login.js – with automatic polling for verification status

document.addEventListener('DOMContentLoaded', () => {
  // Rate limiting: store failed attempts in memory
  let failedAttempts = 0;
  let lastAttemptTime = 0;
  const BASE_DELAY = 1000;
  const MAX_ATTEMPTS = 5;

  async function enforceRateLimit() {
    const now = Date.now();
    if (failedAttempts >= MAX_ATTEMPTS) {
      const waitTime = Math.min(30000, BASE_DELAY * Math.pow(2, failedAttempts - MAX_ATTEMPTS + 1));
      const elapsed = now - lastAttemptTime;
      if (elapsed < waitTime) {
        const remaining = Math.ceil((waitTime - elapsed) / 1000);
        throw new Error(`Too many failed attempts. Please wait ${remaining} seconds.`);
      } else {
        failedAttempts = 0;
      }
    }
  }

  function recordFailedAttempt() {
    failedAttempts++;
    lastAttemptTime = Date.now();
  }

  function resetRateLimit() {
    failedAttempts = 0;
  }

  // Show/hide password toggle
  document.querySelectorAll('.toggle-password').forEach(toggle => {
    toggle.addEventListener('click', function() {
      const targetId = this.dataset.target;
      const input = document.getElementById(targetId);
      if (input.type === 'password') {
        input.type = 'text';
        this.querySelector('i').classList.remove('fa-eye');
        this.querySelector('i').classList.add('fa-eye-slash');
      } else {
        input.type = 'password';
        this.querySelector('i').classList.remove('fa-eye-slash');
        this.querySelector('i').classList.add('fa-eye');
      }
    });
  });

  // Password strength meter
  const regPassword = document.getElementById('regPassword');
  const strengthDiv = document.getElementById('passwordStrength');
  if (regPassword) {
    regPassword.addEventListener('input', function() {
      const val = this.value;
      let strength = 0;
      if (val.length >= 8) strength++;
      if (val.match(/[a-z]/) && val.match(/[A-Z]/)) strength++;
      if (val.match(/\d/)) strength++;
      if (val.match(/[^a-zA-Z0-9]/)) strength++;
      const width = (strength / 4) * 100;
      let color = '#dc3545';
      if (strength >= 3) color = '#ffc107';
      if (strength >= 4) color = '#28a745';
      strengthDiv.style.width = width + '%';
      strengthDiv.style.background = color;
      strengthDiv.style.height = '4px';
    });
  }

  function setButtonLoading(btn, isLoading) {
    if (isLoading) {
      btn.classList.add('btn-loading');
      btn.disabled = true;
      btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Processing...';
    } else {
      btn.classList.remove('btn-loading');
      btn.disabled = false;
      btn.innerHTML = btn.originalText || (btn.id === 'loginBtn' ? 'Login' : 'Register');
    }
  }

  const loginBtn = document.getElementById('loginBtn');
  const registerBtn = document.getElementById('registerBtn');
  if (loginBtn) loginBtn.originalText = loginBtn.innerHTML;
  if (registerBtn) registerBtn.originalText = registerBtn.innerHTML;

  const params = new URLSearchParams(window.location.search);
  if (params.get('blocked') === '1') {
    showError('Your account has been blocked. Contact the administrator.');
  }
  if (params.get('unverified') === '1') {
    showError('Your account is pending admin approval. Please wait for the administrator to verify your account. We will automatically check again every few seconds.');
  }
  if (params.get('reason') === 'token_expired') {
    showError('Your GitHub token has expired. Please update it using the "Update GitHub Token" link below.');
  }

  document.getElementById('showRegister').addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('loginForm').style.display = 'none';
    document.getElementById('registerForm').style.display = 'block';
    document.getElementById('formSubtext').innerText = 'Create a new account';
    clearMessages();
  });

  document.getElementById('showLogin').addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('registerForm').style.display = 'none';
    document.getElementById('loginForm').style.display = 'block';
    document.getElementById('formSubtext').innerText = 'Sign in to manage your portfolio';
    clearMessages();
  });

  document.getElementById('loginBtn').addEventListener('click', handleLogin);
  document.getElementById('registerBtn').addEventListener('click', handleRegister);
  document.getElementById('forgotPassphrase').addEventListener('click', (e) => {
    e.preventDefault();
    const email = document.getElementById('loginUsername').value.trim();
    if (!email.includes('@')) {
      showError('Enter your email first, then click "Forgot passphrase" again.');
      return;
    }
    showError('To reset your passphrase, please contact the administrator (siyabongatshem@gmail.com). Your account will be reset and you can re-register with the same email.');
  });

  // ======================== UPDATE TOKEN MODAL ========================
  const updateTokenLink = document.getElementById('updateTokenLink');
  if (updateTokenLink) {
    updateTokenLink.addEventListener('click', (e) => {
      e.preventDefault();
      // clear fields
      document.getElementById('updateTokenEmail').value = '';
      document.getElementById('updateTokenPassphrase').value = '';
      document.getElementById('updateTokenNewToken').value = '';
      document.getElementById('updateTokenError').style.display = 'none';
      document.getElementById('updateTokenSuccess').style.display = 'none';
      if (typeof $ !== 'undefined' && $('#updateTokenModal').length) {
        $('#updateTokenModal').modal('show');
      } else {
        showError('Could not open token update window. Please refresh the page.');
      }
    });
  }

  const confirmUpdateBtn = document.getElementById('confirmUpdateTokenBtn');
  if (confirmUpdateBtn) {
    confirmUpdateBtn.addEventListener('click', async () => {
      const email = document.getElementById('updateTokenEmail').value.trim();
      const passphrase = document.getElementById('updateTokenPassphrase').value;
      const newToken = document.getElementById('updateTokenNewToken').value.trim();

      const errorDiv = document.getElementById('updateTokenError');
      const successDiv = document.getElementById('updateTokenSuccess');
      errorDiv.style.display = 'none';
      successDiv.style.display = 'none';

      if (!email || !passphrase || !newToken) {
        errorDiv.textContent = 'All fields are required.';
        errorDiv.style.display = 'block';
        return;
      }
      if (!email.includes('@')) {
        errorDiv.textContent = 'Enter a valid email address.';
        errorDiv.style.display = 'block';
        return;
      }
      if (!newToken.startsWith('ghp_') && !newToken.startsWith('github_pat_')) {
        errorDiv.textContent = 'Token must start with ghp_ or github_pat_';
        errorDiv.style.display = 'block';
        return;
      }

      confirmUpdateBtn.disabled = true;
      confirmUpdateBtn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Updating...';

      try {
        const { owner, repo, branch, dataPath } = window.REPO_CONFIG;
        const encUser = encodeURIComponent(email);
        const accountPath = `${dataPath}/users/${encUser}/account.json`;
        const accountUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${accountPath}`;
        const resp = await fetch(accountUrl);
        if (!resp.ok) throw new Error('Account not found. Please register first.');
        const encryptedBlob = await resp.json();

        let decrypted;
        try {
          decrypted = await window.CryptoUtil.decrypt(encryptedBlob, passphrase);
        } catch (e) {
          throw new Error('Invalid passphrase. Could not decrypt account.');
        }
        const accountData = JSON.parse(decrypted);
        if (accountData.test !== 'VALID') throw new Error('Corrupted account data.');

        const testResp = await fetch('https://api.github.com/user', {
          headers: { Authorization: `token ${newToken}` }
        });
        if (!testResp.ok) {
          if (testResp.status === 401 || testResp.status === 403) {
            throw new Error('New token is invalid or expired. Please generate a new token with "repo" scope.');
          }
          throw new Error(`GitHub token validation failed (${testResp.status})`);
        }

        accountData.token = newToken;
        const newEncrypted = await window.CryptoUtil.encrypt(JSON.stringify(accountData), passphrase);

        let sha = null;
        const getUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${accountPath}?ref=${branch}`;
        const getResp = await fetch(getUrl, {
          headers: { Authorization: `token ${newToken}`, Accept: 'application/vnd.github.v3+json' }
        });
        if (getResp.ok) {
          const data = await getResp.json();
          sha = data.sha;
        } else if (getResp.status !== 404) {
          throw new Error(`Failed to get file info: ${getResp.status}`);
        }

        const putUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${accountPath}`;
        const putBody = {
          message: `Update token for ${email}`,
          content: btoa(unescape(encodeURIComponent(JSON.stringify(newEncrypted, null, 2)))),
          branch: branch
        };
        if (sha) putBody.sha = sha;

        const putResp = await fetch(putUrl, {
          method: 'PUT',
          headers: {
            Authorization: `token ${newToken}`,
            'Content-Type': 'application/json',
            Accept: 'application/vnd.github.v3+json'
          },
          body: JSON.stringify(putBody)
        });
        if (!putResp.ok) {
          const errData = await putResp.json();
          throw new Error(`Failed to save updated token: ${errData.message}`);
        }

        successDiv.textContent = 'Token updated successfully! You can now log in.';
        successDiv.style.display = 'block';
        setTimeout(() => {
          if (typeof $ !== 'undefined') $('#updateTokenModal').modal('hide');
          document.getElementById('loginUsername').value = email;
        }, 2000);
      } catch (err) {
        errorDiv.textContent = err.message;
        errorDiv.style.display = 'block';
      } finally {
        confirmUpdateBtn.disabled = false;
        confirmUpdateBtn.innerHTML = 'Update Token';
      }
    });
  }

  // ======================== LOGIN WITH POLLING ========================
  async function handleLogin() {
    clearMessages();
    const username = document.getElementById('loginUsername').value.trim();
    const passphrase = document.getElementById('loginPassword').value;
    if (!username || !passphrase) {
      showError('Please fill all fields.');
      return;
    }
    if (!username.includes('@')) {
      showError('Please enter a valid email address.');
      return;
    }

    try {
      await enforceRateLimit();
      setButtonLoading(loginBtn, true);
      
      const isAdminEmail = username === 'siyabongatshem@gmail.com';
      
      if (!isAdminEmail) {
        // Check verification with polling (max 20 seconds)
        let verified = false;
        let attempts = 0;
        const maxAttempts = 10; // 10 * 2s = 20s
        showError('Checking verification status...', 'info');

        while (!verified && attempts < maxAttempts) {
          verified = await window.AccountManager.isEmailVerified(username);
          if (!verified) {
            attempts++;
            if (attempts < maxAttempts) {
              showError(`⏳ Waiting for admin approval... (${attempts}/${maxAttempts})`, 'info');
              await new Promise(resolve => setTimeout(resolve, 2000));
            }
          }
        }

        if (!verified) {
          showError('Your account is still pending admin approval. Please wait for the administrator to verify your account.');
          setButtonLoading(loginBtn, false);
          return;
        }
        showError('✅ Account verified! Logging in...', 'success');
      }
      
      const pat = await window.AccountManager.login(username, passphrase);
      resetRateLimit();
      window.SessionManager.setCurrentUser(username, pat, passphrase);
      showSuccess('Login successful! Redirecting...');
      setTimeout(() => { window.location.href = 'admin.html'; }, 1000);
    } catch (err) {
      recordFailedAttempt();
      showError(err.message || 'Invalid email or passphrase.');
      setButtonLoading(loginBtn, false);
    }
  }

  async function handleRegister() {
    clearMessages();
    const username = document.getElementById('regUsername').value.trim();
    const passphrase = document.getElementById('regPassword').value;
    const confirm = document.getElementById('regPasswordConfirm').value;
    const token = document.getElementById('regToken').value.trim();

    if (!username || !passphrase || !token) {
      showError('Please fill all fields.');
      return;
    }
    if (!username.includes('@')) {
      showError('Must be a valid email address.');
      return;
    }
    if (passphrase !== confirm) {
      showError('Passphrases do not match.');
      return;
    }
    if (passphrase.length < 8) {
      showError('Passphrase must be at least 8 characters.');
      return;
    }
    let strength = 0;
    if (passphrase.length >= 8) strength++;
    if (passphrase.match(/[a-z]/) && passphrase.match(/[A-Z]/)) strength++;
    if (passphrase.match(/\d/)) strength++;
    if (passphrase.match(/[^a-zA-Z0-9]/)) strength++;
    if (strength < 3) {
      if (!confirm('Your passphrase is weak. It is recommended to use a mix of uppercase, lowercase, numbers and symbols. Continue anyway?')) {
        return;
      }
    }
    if (!token.startsWith('ghp_') && !token.startsWith('github_pat_')) {
      showError('Invalid token format. Must start with ghp_ or github_pat_');
      return;
    }

    try {
      setButtonLoading(registerBtn, true);
      await window.AccountManager.register(username, passphrase, token);
      showSuccess('Account created! The administrator has been notified. You will be able to log in once your account is verified.');
      document.getElementById('registerForm').style.display = 'none';
      document.getElementById('loginForm').style.display = 'block';
      document.getElementById('formSubtext').innerText = 'Sign in to manage your portfolio';
      document.getElementById('loginUsername').value = username;
      setButtonLoading(registerBtn, false);
    } catch (err) {
      showError(err.message || 'Registration failed.');
      setButtonLoading(registerBtn, false);
    }
  }

  function showError(msg, type = 'error') {
    const el = document.getElementById('errorMsg');
    el.textContent = msg;
    el.style.display = 'block';
    if (type === 'info') el.className = 'alert alert-info mt-3';
    else if (type === 'success') el.className = 'alert alert-success mt-3';
    else el.className = 'alert alert-danger mt-3';
    document.getElementById('successMsg').style.display = 'none';
  }

  function showSuccess(msg) {
    const el = document.getElementById('successMsg');
    el.textContent = msg;
    el.style.display = 'block';
    document.getElementById('errorMsg').style.display = 'none';
    setTimeout(() => { if (el.style.display === 'block') el.style.display = 'none'; }, 4000);
  }

  function clearMessages() {
    document.getElementById('errorMsg').style.display = 'none';
    document.getElementById('successMsg').style.display = 'none';
  }

  document.getElementById('loginUsername').focus();
});
