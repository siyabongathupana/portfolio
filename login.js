// login.js – Complete with session tracking (IP, location, device)

document.addEventListener('DOMContentLoaded', () => {
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
    showError('Please verify your email address before logging in. Check your inbox for the verification link.');
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
      
      const isVerified = await window.AccountManager.isEmailVerified(username);
      if (!isVerified) {
        window.location.href = 'login.html?unverified=1';
        return;
      }
      
      const pat = await window.AccountManager.login(username, passphrase);
      resetRateLimit();
      window.SessionManager.setCurrentUser(username, pat);
      
      // Track session after successful login (don't await)
      trackUserSession(username).catch(e => console.error('Session tracking error:', e));
      
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
      showSuccess('Account created! A verification email has been sent to your inbox. Please verify your email before logging in.');
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

  document.getElementById('loginUsername').focus();

  // ========== SESSION TRACKING FUNCTIONS ==========
  
  async function trackUserSession(username) {
    try {
      let ipData = { ip: 'Unknown' };
      let locationData = { city: 'Unknown', region: 'Unknown', country_name: 'Unknown', country_code: 'Unknown' };
      
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        const ipResponse = await fetch('https://api.ipify.org?format=json', { signal: controller.signal });
        clearTimeout(timeoutId);
        if (ipResponse.ok) ipData = await ipResponse.json();
      } catch (e) {
        console.log('Could not fetch IP');
      }
      
      const userIP = ipData.ip || 'Unknown';
      
      if (userIP !== 'Unknown') {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 5000);
          const locationResponse = await fetch(`https://ipapi.co/${userIP}/json/`, { signal: controller.signal });
          clearTimeout(timeoutId);
          if (locationResponse.ok) locationData = await locationResponse.json();
        } catch (e) {
          console.log('Could not fetch location');
        }
      }
      
      const deviceInfo = {
        userAgent: navigator.userAgent || 'Unknown',
        platform: navigator.platform || 'Unknown',
        language: navigator.language || 'Unknown',
        screenSize: `${screen.width || 0}x${screen.height || 0}`,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Unknown',
        deviceType: /Mobile|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ? 'Mobile' : 
                     /Tablet|iPad/i.test(navigator.userAgent) ? 'Tablet' : 'Desktop',
        browser: getBrowserName(navigator.userAgent || ''),
        os: getOSName(navigator.userAgent || '')
      };
      
      const sessionData = {
        timestamp: Date.now(),
        date: new Date().toISOString(),
        ip: userIP,
        location: {
          city: locationData.city || 'Unknown',
          region: locationData.region || 'Unknown',
          country: locationData.country_name || 'Unknown',
          countryCode: locationData.country_code || 'Unknown',
          latitude: locationData.latitude || null,
          longitude: locationData.longitude || null,
          postal: locationData.postal || null,
          timezone: locationData.timezone || null
        },
        device: deviceInfo,
        loginSuccess: true
      };
      
      const currentUser = window.SessionManager.getCurrentUser();
      await window.AccountManager.saveUserSession(username, sessionData, currentUser?.pat);
      console.log('Session tracked for:', username);
    } catch (error) {
      console.error('Failed to track user session:', error);
    }
  }

  function getBrowserName(userAgent) {
    if (!userAgent) return 'Unknown';
    if (userAgent.includes('Chrome') && !userAgent.includes('Edg')) return 'Chrome';
    if (userAgent.includes('Firefox')) return 'Firefox';
    if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) return 'Safari';
    if (userAgent.includes('Edg')) return 'Edge';
    if (userAgent.includes('Opera') || userAgent.includes('OPR')) return 'Opera';
    return 'Unknown';
  }

  function getOSName(userAgent) {
    if (!userAgent) return 'Unknown';
    if (userAgent.includes('Windows')) return 'Windows';
    if (userAgent.includes('Mac')) return 'macOS';
    if (userAgent.includes('Linux') && !userAgent.includes('Android')) return 'Linux';
    if (userAgent.includes('Android')) return 'Android';
    if (userAgent.includes('iOS') || userAgent.includes('iPhone') || userAgent.includes('iPad')) return 'iOS';
    return 'Unknown';
  }
});
