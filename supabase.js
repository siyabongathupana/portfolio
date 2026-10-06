// supabase.js — Initialises the Supabase client and exposes helpers.
// Load AFTER @supabase/supabase-js and config.js.

(function () {
  'use strict';

  const cfg = window.APP_CONFIG || {};
  if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) {
    console.error('[supabase.js] Missing supabaseUrl / supabaseAnonKey in config.js');
    return;
  }

  // The @supabase/supabase-js UMD bundle exposes `window.supabase.createClient`
  window.supabase = window.supabase.createClient(
    cfg.supabaseUrl,
    cfg.supabaseAnonKey,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: 'portfolio-auth'
      }
    }
  );

  // ── Auth readiness ──────────────────────────────────────
  // Pages can `await window.authReady` before reading the user.
  window.authReady = (async () => {
    const { data, error } = await window.supabase.auth.getSession();
    if (error) {
      console.warn('[supabase.js] getSession failed:', error.message);
      return null;
    }
    window.__currentAuthUser = data.session?.user || null;
    return window.__currentAuthUser;
  })();

  // Keep the cached user fresh
  window.supabase.auth.onAuthStateChange((event, session) => {
    window.__currentAuthUser = session?.user || null;
    window.dispatchEvent(new CustomEvent('authChanged', {
      detail: { event, user: session?.user || null }
    }));
  });

  console.log('[supabase.js] ready');
})();
