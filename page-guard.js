// page-guard.js — Runs first in <body>. Hides page until auth+permission confirmed.
(function () {
  const required = document.body.dataset.requires;
  if (!required) {
    document.body.style.visibility = 'visible';
    return;
  }

  // Wait for Auth to be ready (it's loaded in head)
  const start = async () => {
    try {
      if (!window.Auth) { setTimeout(start, 30); return; }
      const ok = await window.Auth.checkPageAccess(required);
      if (ok) {
        document.body.style.visibility = 'visible';
        document.dispatchEvent(new CustomEvent('page-authorized'));
      }
      // If not ok, Auth.showDenied already replaced body content
    } catch (err) {
      document.body.innerHTML = `
        <div style="padding:60px 20px;text-align:center;font-family:'Inter',sans-serif;">
          <h2 style="color:#dc3545;">Access Check Failed</h2>
          <p style="color:#5a7d9a;">${(err.message || '').replace(/[<>]/g,'')}</p>
          <a href="index.html" style="color:#2fc7ff;">Return Home</a>
        </div>`;
      document.body.style.visibility = 'visible';
    }
  };
  start();
})();
