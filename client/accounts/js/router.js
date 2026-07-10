// History-based router, mounted under /accounts in the merged shop app.
const Router = {
  base: '/accounts',
  table: {},
  add(path, handler){ Router.table[path] = handler; },

  // Internal path (e.g. '/sales') -> browser URL ('/accounts/sales').
  toUrl(path){ return (path === '/' ? Router.base : Router.base + path); },
  // Browser URL -> internal path.
  current(){
    let p = location.pathname;
    if (p === Router.base || p === Router.base + '/') return '/';
    if (p.startsWith(Router.base + '/')) return p.slice(Router.base.length);
    return p;
  },

  navigate(path){
    if (!path) return;
    if (path.startsWith(Router.base + '/')) path = path.slice(Router.base.length);
    const url = Router.toUrl(path);
    if (url !== location.pathname) history.pushState({}, '', url);
    Router.resolve();
  },

  async resolve(){
    // Back-office only: not logged in, or a customer? Hand back to the shop admin login.
    if (!Auth.isLoggedIn() || !Auth.isStaffOrAdmin()){
      (ACC_EMBED ? window.top : window).location.href = '/admin';
      return;
    }
    await Router.run(Router.current());
    // Embedded: tell the admin shell which section is showing, so it highlights the right link.
    if (ACC_EMBED){
      try { window.parent.postMessage({ type: 'accRoute', path: Router.current() }, location.origin); } catch(e){}
    }
  },

  async run(path){
    const handler = Router.table[path] || Router.table['*'];
    const app = document.getElementById('app');
    app?.setAttribute('aria-busy', 'true');
    try { await handler(); }
    catch(e){
      app.innerHTML =
        `<div class="center-card"><div class="empty"><i class="fa-solid fa-triangle-exclamation"></i>
         <p>${esc(e.message || 'Something went wrong')}</p>
         <button class="btn mt16" data-csp-onclick="location.reload()">Reload</button></div></div>`;
    } finally {
      app?.removeAttribute('aria-busy');
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      requestAnimationFrame(() => app?.focus?.({ preventScroll: true }));
    }
  },
};

// Intercept in-app links + back/forward.
document.addEventListener('click', e => {
  const a = e.target.closest('a[data-link]');
  if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  if ((a.target && a.target !== '_self') || a.hasAttribute('download')) return;
  const href = a.getAttribute('href') || a.dataset.href;
  if (!href || href.startsWith('#') || /^(https?:|mailto:|tel:)/i.test(href)) return;
  e.preventDefault();
  Router.navigate(href);
});
window.addEventListener('popstate', () => Router.resolve());

// Embedded mode: the admin shell asks us to switch sections without a page reload.
window.addEventListener('message', e => {
  if (e.origin !== location.origin) return;
  if (e.data && e.data.type === 'accNav') Router.navigate(e.data.path || '/');
});
