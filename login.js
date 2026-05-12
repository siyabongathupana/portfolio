
// login.js – Authentication with GitHub-stored accounts
document.getElementById('forgotPassphrase').addEventListener('click', (e) => {
  e.preventDefault();
  const email = document.getElementById('loginUsername').value.trim();
  if (!email.includes('@')) {
    showError('Enter your email (username) first.');
    return;
  }
  showError('If you forget your passphrase, contact the admin (siyabongatshem@gmail.com) to reset your account. After reset, you can re-register with the same email.');
});
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('showRegister').addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('loginForm').style.display = 'none';
    document.getElementById('registerForm').style.display = 'block';
    clearMessages();
  });

  document.getElementById('showLogin').addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('registerForm').style.display = 'none';
    document.getElementById('loginForm').style.display = 'block';
    clearMessages();
  });

  document.getElementById('loginBtn').addEventListener('click', handleLogin);
  document.getElementById('registerBtn').addEventListener('click', handleRegister);

  async function handleLogin() {
    clearMessages();
    const username = document.getElementById('loginUsername').value.trim();
    const passphrase = document.getElementById('loginPassword').value;
    if (!username || !passphrase) {
      showError('Please fill all fields.');
      return;
    }

    try {
      const pat = await window.AccountManager.login(username, passphrase);
      window.SessionManager.setCurrentUser(username, pat);
      showSuccess('Login successful! Redirecting...');
      setTimeout(() => { window.location.href = 'admin.html'; }, 1000);
    } catch (err) {
      showError('Invalid username or passphrase.');
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
    if (passphrase !== confirm) {
      showError('Passphrases do not match.');
      return;
    }
    if (passphrase.length < 8) {
      showError('Passphrase must be at least 8 characters.');
      return;
    }
    if (!token.startsWith('ghp_') && !token.startsWith('github_pat_')) {
      showError('Invalid token format. Must start with ghp_ or github_pat_');
      return;
    }

    try {
      await window.AccountManager.register(username, passphrase, token);
      showSuccess('Account created! You can now log in.');
      document.getElementById('registerForm').style.display = 'none';
      document.getElementById('loginForm').style.display = 'block';
      document.getElementById('loginUsername').value = username;
    } catch (err) {
      showError(err.message || 'Registration failed.');
    }
  }

  function showError(msg) {
    const el = document.getElementById('errorMsg');
    el.textContent = msg;
    el.style.display = 'block';
    document.getElementById('successMsg').style.display = 'none';
  }

  function showSuccess(msg) {
    const el = document.getElementById('successMsg');
    el.textContent = msg;
    el.style.display = 'block';
    document.getElementById('errorMsg').style.display = 'none';
  }

  function clearMessages() {
    document.getElementById('errorMsg').style.display = 'none';
    document.getElementById('successMsg').style.display = 'none';
  }
});
