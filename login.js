// login.js – Improved with rate limiting, password strength, UX
document.addEventListener('DOMContentLoaded', () => {
  // Rate limiting: store failed attempts in memory (resets on page refresh)
  let failedAttempts = 0;
  let lastAttemptTime = 0;
  const BASE_DELAY = 1000; // 1 second
  const MAX_ATTEMPTS = 5;

  // Helper to enforce delay
  async function enforceRateLimit() {
    const now = Date.now();
    if (failedAttempts >= MAX_ATTEMPTS) {
      const waitTime = Math.min(30000, BASE_DELAY * Math.pow(2, failedAttempts - MAX_ATTEMPTS + 1));
      const elapsed = now - lastAttemptTime;
      if (elapsed < waitTime) {
        const remaining = Math.ceil((waitTime - elapsed) / 1000);
        throw new Error(`Too many failed attempts. Please wait ${remaining} seconds.`);
      } else {
        // Reset after cooldown
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

  // Loading button state
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

  // Store original button texts
  const loginBtn = document.getElementById('loginBtn');
  const registerBtn = document.getElementById('registerBtn');
  if (loginBtn) loginBtn.originalText = loginBtn.innerHTML;
  if (registerBtn) registerBtn.originalText = registerBtn.innerHTML;

  const params = new URLSearchParams(window.location.search);
  if (params.get('blocked') === '1') {
    showError('Your account has been blocked. Contact the administrator.');
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
      const pat = await window.AccountManager.login(username, passphrase);
      resetRateLimit();
      window.SessionManager.setCurrentUser(username, pat);
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
    // Check strength (optional warning)
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
      showSuccess('Account created! A confirmation email has been sent. You can now log in.');
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

  function showError(msg) {
    const el = document.getElementById('errorMsg');
    el.textContent = msg;
    el.style.display = 'block';
    document.getElementById('successMsg').style.display = 'none';
    // Auto-hide after 5 seconds
    setTimeout(() => { if (el.style.display === 'block') el.style.display = 'none'; }, 5000);
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

  // Auto-focus on email field
  document.getElementById('loginUsername').focus();
});
