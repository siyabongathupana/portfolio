/* ================================================================
   theme-toggle.js — Global site theme switcher
   ----------------------------------------------------------------
   • Reads data/site-theme.json (public) → applies dark/light theme
   • Caches in localStorage for instant apply
   • Owner (admin email) sees a toggle button in the navbar
   • Toggle writes to data/site-theme.json on GitHub (site-wide)
   ================================================================ */
(function () {
  'use strict';

  const STORAGE_KEY = 'site-theme';
  const DEFAULT_THEME = 'dark';
  const ADMIN_EMAIL = (window.APP_CONFIG && window.APP_CONFIG.adminUsers && window.APP_CONFIG.adminUsers[0])
                      || 'siyabongatshem@gmail.com';
  const LINK_ID = 'theme-dark-css';

  function applyTheme(theme) {
    const link = document.getElementById(LINK_ID);
    if (link) link.disabled = (theme === 'light');
    const html = document.documentElement;
    html.classList.toggle('theme-dark', theme !== 'light');
    html.classList.toggle('theme-light', theme === 'light');
    try { localStorage.setItem(STORAGE_KEY, theme); } catch (e) {}
  }

  function getCached() {
    try { return localStorage.getItem(STORAGE_KEY) || DEFAULT_THEME; }
    catch (e) { return DEFAULT_THEME; }
  }

  async function fetchRemote() {
    try {
      if (!window.REPO_CONFIG) return null;
      const { owner, repo, branch, dataPath } = window.REPO_CONFIG;
      const url = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${dataPath}/site-theme.json?_t=${Date.now()}`;
      const resp = await fetch(url, { cache: 'no-store' });
      if (!resp.ok) return null;
      const data = await resp.json();
      return data.theme === 'light' ? 'light' : 'dark';
    } catch (e) { return null; }
  }

  async function writeRemote(theme) {
    const user = window.SessionManager && window.SessionManager.getCurrentUser();
    if (!user || !user.pat) throw new Error('You must be logged in as the owner.');
    if (user.username !== ADMIN_EMAIL) throw new Error('Only the site owner can change the global theme.');

    const { owner, repo, branch, dataPath } = window.REPO_CONFIG;
    const path = `${dataPath}/site-theme.json`;
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
    const headers = {
      Authorization: `token ${user.pat}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json'
    };

    let sha = null;
    const getResp = await fetch(`${url}?ref=${branch}&_t=${Date.now()}`, { headers, cache: 'no-store' });
    if (getResp.ok) { const j = await getResp.json(); sha = j.sha; }

    const body = {
      message: `Set site theme to ${theme}`,
      content: btoa(unescape(encodeURIComponent(JSON.stringify({
        theme,
        updatedAt: Date.now(),
        updatedBy: user.username
      }, null, 2)))),
      branch
    };
    if (sha) body.sha = sha;

    const putResp = await fetch(url, { method: 'PUT', headers, body: JSON.stringify(body) });
    if (!putResp.ok) {
      const err = await putResp.json().catch(() => ({}));
      throw new Error(err.message || `HTTP ${putResp.status}`);
    }
    return true;
  }

  function injectToggle() {
    const user = window.SessionManager && window.SessionManager.getCurrentUser();
    if (!user || user.username !== ADMIN_EMAIL) return;
    if (document.getElementById('siteThemeToggle')) return;

    const btn = document.createElement('button');
    btn.id = 'siteThemeToggle';
    btn.type = 'button';
    btn.style.cssText = [
      'position:fixed',
      'bottom:24px',
      'left:24px',
      'z-index:9997',
      'background:rgba(17,25,39,0.85)',
      'backdrop-filter:blur(14px)',
      '-webkit-backdrop-filter:blur(14px)',
      'border:1px solid rgba(47,199,255,0.35)',
      'color:#e0e8ee',
      'border-radius:40px',
      'padding:11px 20px',
      'font-weight:700',
      'font-size:0.82rem',
      'font-family:Inter,sans-serif',
      'cursor:pointer',
      'display:flex',
      'align-items:center',
      'gap:9px',
      'box-shadow:0 12px 36px rgba(0,0,0,0.45), 0 0 0 0 rgba(47,199,255,0.5)',
      'transition:all 0.25s'
    ].join(';');

    const refresh = () => {
      const isDark = document.documentElement.classList.contains('theme-dark');
      btn.innerHTML = isDark
        ? '<i class="fa fa-sun-o" style="color:#2fc7ff;"></i><span>Switch site to Light</span>'
        : '<i class="fa fa-moon-o" style="color:#2fc7ff;"></i><span>Switch site to Dark</span>';
    };
    refresh();

    btn.addEventListener('mouseenter', () => {
      btn.style.transform = 'translateY(-2px)';
      btn.style.boxShadow = '0 16px 44px rgba(0,0,0,0.55), 0 0 24px rgba(47,199,255,0.35)';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.transform = '';
      btn.style.boxShadow = '0 12px 36px rgba(0,0,0,0.45)';
    });

    btn.addEventListener('click', async () => {
      const isDark = document.documentElement.classList.contains('theme-dark');
      const next = isDark ? 'light' : 'dark';
      if (!confirm(`Switch the ENTIRE site to ${next.toUpperCase()} mode for ALL visitors?\n\nThis will be saved to GitHub and applied to everyone.`)) return;

      btn.disabled = true;
      btn.style.opacity = '0.6';
      try {
        await writeRemote(next);
        applyTheme(next);
        refresh();
        if (window.showToast) window.showToast(`Site theme is now ${next} for everyone`, 'success');
      } catch (err) {
        alert('Failed to change theme: ' + err.message);
      } finally {
        btn.disabled = false;
        btn.style.opacity = '1';
      }
    });

    document.body.appendChild(btn);
  }

  async function init() {
    const remote = await fetchRemote();
    if (remote && remote !== getCached()) applyTheme(remote);
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', injectToggle);
    } else {
      injectToggle();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.SiteTheme = {
    set: applyTheme,
    get: () => document.documentElement.classList.contains('theme-dark') ? 'dark' : 'light',
    writeRemote
  };
})();
