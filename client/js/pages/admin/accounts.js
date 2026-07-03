// Embeds the Accounts & Bookkeeping app inside the admin shell so clicking a
// bookkeeping section stays on the SAME page (admin sidebar persists; only the
// content area changes). Navigation between sections is driven by postMessage,
// so there's no page reload once the panel is open.
(function () {
  const SECTIONS = ['', 'sales', 'purchases', 'inventory', 'vendors', 'expenses', 'reports'];

  const accUrl = sub => '/accounts' + (sub ? '/' + sub : '');
  const adminPath = sub => '/admin/accounts' + (sub ? '/' + sub : '');

  function highlight(path) {
    // Clear active on every sidebar link, then set it only on the exact match — so the
    // Categories link (main menu) and the bookkeeping links never get stuck highlighted.
    document.querySelectorAll('.admin-sidebar .sidebar-link').forEach(a => {
      a.classList.toggle('active', (a.getAttribute('href') || '') === path);
    });
  }

  // Keep the admin sidebar highlight in sync when the user navigates inside the iframe.
  if (!window._accMsgBound) {
    window._accMsgBound = true;
    window.addEventListener('message', e => {
      if (e.origin !== location.origin) return;
      if (e.data && e.data.type === 'accRoute') {
        const sub = (e.data.path === '/' || !e.data.path) ? '' : e.data.path.replace(/^\//, '');
        highlight(sub === 'categories' ? '/admin/categories' : adminPath(sub));
      }
    });
  }

  function show(sub) {
    if (!Auth.isAdmin()) { Router.navigate('/admin/login'); return; }
    const path = adminPath(sub);
    const frame = document.getElementById('accFrame');
    if (frame) {
      // Panel already open → switch section in place (admin shell stays; no full-page reload).
      frame.src = accUrl(sub);
      highlight(path);
      return;
    }
    adminLayout(`<iframe id="accFrame" class="acc-embed" src="${accUrl(sub)}" title="Accounts & Bookkeeping"></iframe>`, path);
  }

  // The Categories manager lives in the MAIN menu at /admin/categories — its own page,
  // embedded the same way the bookkeeping sections are.
  function showCategories() {
    if (!Auth.isStrictAdmin()) { Router.navigate(Auth.isAdmin() ? '/admin/orders' : '/admin/login'); return; }
    const frame = document.getElementById('accFrame');
    if (frame) { frame.src = '/accounts/categories'; highlight('/admin/categories'); return; }
    adminLayout('<iframe id="accFrame" class="acc-embed" src="/accounts/categories" title="Categories"></iframe>', '/admin/categories');
  }

  SECTIONS.forEach(sub => Router.register(adminPath(sub), () => show(sub)));
  Router.register('/admin/categories', showCategories);
  Router.register('/admin/accounts/categories', () => Router.navigate('/admin/categories'));
  Router.register('/admin/accounts/clothing', () => Router.navigate('/admin/categories'));
})();
