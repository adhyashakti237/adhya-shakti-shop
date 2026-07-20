const Router = {
  routes: {},
  _gen: 0,
  _scrollStore: {},
  _currentPath: location.pathname + location.search + location.hash,
  // Pages that fetch data after an `await` should capture `Router._gen` before
  // the await, then check `Router.stale(gen)` after — if the user has since
  // navigated away, the fetch result is discarded instead of being written
  // into (or clobbering) a page that's no longer current.
  stale(gen) { return gen !== Router._gen; },
  register(path, handler) { Router.routes[path] = handler; },
  navigate(path, push = true) {
    if (!path) return;
    if (/^(https?:|mailto:|tel:)/i.test(path)) { location.href = path; return; }
    Router.saveScrollPosition();
    const current = location.pathname + location.search + location.hash;
    if (push) history.pushState({}, '', path);
    else if (path === current) Router._gen++;
    Router.render(path);
  },
  pageDescriptions: {
    '/': 'Handcrafted jewelry and custom-printed clothing from New Jersey, USA. Shop earrings, necklaces, t-shirts, polo shirts, and hoodies.',
    '/products': 'Browse our full collection of handcrafted jewelry and custom-printed clothing. Filter by category, price, and more.',
    '/jewelry': 'Shop handcrafted jewelry inspired by Indian heritage — earrings, necklaces, bangles, and more.',
    '/clothing': 'Shop premium printed t-shirts, polo shirts, hoodies, and more from Adhya Shakti Shop.',
    '/custom-printing': 'Custom print your design on t-shirts, polo shirts, and hoodies. Made to order in New Jersey, USA.',
    '/about': 'Learn the story behind Adhya Shakti Shop — handcrafted jewelry and custom printing from New Jersey, USA.',
    '/contact': 'Contact Adhya Shakti Shop. Reach us by email or WhatsApp for any questions about orders or products.',
    '/faq': 'Frequently asked questions about orders, shipping, returns, and custom printing at Adhya Shakti Shop.',
    '/bulk-orders': 'Place bulk orders for custom-printed apparel and promotional items. Contact us for volume pricing.',
    '/cart': 'Review your shopping cart and proceed to secure checkout.',
    '/wishlist': 'View the products you saved for later at Adhya Shakti Shop.',
    '/checkout': 'Complete your purchase securely. Encrypted checkout powered by Stripe.',
    '/track-order': 'Track your Adhya Shakti Shop order status and shipping updates.',
    '/terms': 'Terms and conditions for shopping at Adhya Shakti Shop.',
    '/privacy': 'Privacy policy for Adhya Shakti Shop — how we collect, use, and protect your information.',
    '/refund': 'Return, refund, and cancellation policy for Adhya Shakti Shop orders.',
    '/coming-soon': 'Exciting new products coming soon to Adhya Shakti Shop — tumblers, cups, bags, and aprons. Sign up to be notified first.',
  },
  pageTitles: {
    '/': 'Adhya Shakti Shop — Handcrafted Jewelry & Custom Clothing',
    '/products': 'Products — Adhya Shakti Shop',
    '/jewelry': 'Jewelry — Adhya Shakti Shop',
    '/clothing': 'Clothing — Adhya Shakti Shop',
    '/custom-printing': 'Custom Printing — Adhya Shakti Shop',
    '/cart': 'Your Cart — Adhya Shakti Shop',
    '/wishlist': 'Wishlist — Adhya Shakti Shop',
    '/checkout': 'Checkout — Adhya Shakti Shop',
    '/login': 'Sign In — Adhya Shakti Shop',
    '/register': 'Create Account — Adhya Shakti Shop',
    '/forgot-password': 'Forgot Password — Adhya Shakti Shop',
    '/dashboard': 'My Account — Adhya Shakti Shop',
    '/dashboard/orders': 'My Orders — Adhya Shakti Shop',
    '/dashboard/profile': 'My Profile — Adhya Shakti Shop',
    '/about': 'About Us — Adhya Shakti Shop',
    '/contact': 'Contact Us — Adhya Shakti Shop',
    '/faq': 'FAQ — Adhya Shakti Shop',
    '/track-order': 'Track Order — Adhya Shakti Shop',
    '/refund': 'Return, Refund & Cancel Policy — Adhya Shakti Shop',
    '/terms': 'Terms & Conditions — Adhya Shakti Shop',
    '/privacy': 'Privacy Policy — Adhya Shakti Shop',
    '/bulk-orders': 'Bulk Orders — Adhya Shakti Shop',
    '/coming-soon': 'Coming Soon — Adhya Shakti Shop',
    '/admin': 'Admin — Adhya Shakti Shop',
    '/admin/login': 'Staff Sign In — Adhya Shakti Shop',
    '/admin/products': 'Products — Admin — Adhya Shakti Shop',
    '/admin/bulk-upload': 'Bulk Upload — Admin — Adhya Shakti Shop',
    '/admin/categories': 'Categories — Admin — Adhya Shakti Shop',
    '/admin/orders': 'Orders — Admin — Adhya Shakti Shop',
    '/admin/coupons': 'Coupons — Admin — Adhya Shakti Shop',
    '/admin/users': 'Customers — Admin — Adhya Shakti Shop',
    '/admin/reviews': 'Reviews — Adhya Shakti Shop',
    '/admin/security': 'Security — Admin — Adhya Shakti Shop',
    '/admin/accounts': 'Accounts & Bookkeeping — Admin — Adhya Shakti Shop',
    '/admin/accounts/sales': 'Sales — Accounts — Adhya Shakti Shop',
    '/admin/accounts/purchases': 'Purchases — Accounts — Adhya Shakti Shop',
    '/admin/accounts/inventory': 'Inventory — Accounts — Adhya Shakti Shop',
    '/admin/accounts/vendors': 'Vendors — Accounts — Adhya Shakti Shop',
    '/admin/accounts/expenses': 'Expenses — Accounts — Adhya Shakti Shop',
    '/admin/accounts/reports': 'Reports — Accounts — Adhya Shakti Shop',
  },
  defaultMetaImage: '/images/logo-main.png',
  noIndexPrefixes: ['/admin', '/dashboard'],
  noIndexPaths: new Set([
    '/cart', '/checkout', '/order-success', '/wishlist',
    '/login', '/register', '/forgot-password', '/reset-password',
    '/track-order',
  ]),
  ensureMeta(selector, attrName, attrValue) {
    let el = document.querySelector(selector);
    if (!el) {
      el = document.createElement('meta');
      el.setAttribute(attrName, attrValue);
      document.head.appendChild(el);
    }
    return el;
  },
  setMetaContent(selector, attrName, attrValue, content) {
    const el = Router.ensureMeta(selector, attrName, attrValue);
    el.setAttribute('content', content || '');
  },
  absoluteUrl(path) {
    try { return new URL(path || '/', location.origin).href; } catch { return location.origin + '/'; }
  },
  shouldNoIndex(path) {
    return Router.noIndexPaths.has(path) || Router.noIndexPrefixes.some(prefix => path === prefix || path.startsWith(prefix + '/'));
  },
  applyRouteMeta(cleanPath) {
    const title = Router.pageTitles[cleanPath] || 'Adhya Shakti Shop';
    const desc = Router.pageDescriptions[cleanPath] || 'Handcrafted jewelry and custom-printed clothing from New Jersey, USA. Secure checkout and nationwide shipping.';
    const canonicalUrl = Router.absoluteUrl(cleanPath || '/');
    const imageUrl = Router.absoluteUrl(Router.defaultMetaImage);
    document.title = title;

    Router.setMetaContent('meta[name="description"]', 'name', 'description', desc);
    Router.setMetaContent('meta[name="robots"]', 'name', 'robots', Router.shouldNoIndex(cleanPath) ? 'noindex,nofollow' : 'index,follow');
    Router.setMetaContent('meta[property="og:type"]', 'property', 'og:type', 'website');
    Router.setMetaContent('meta[property="og:url"]', 'property', 'og:url', canonicalUrl);
    Router.setMetaContent('meta[property="og:title"]', 'property', 'og:title', title);
    Router.setMetaContent('meta[property="og:description"]', 'property', 'og:description', desc);
    Router.setMetaContent('meta[property="og:image"]', 'property', 'og:image', imageUrl);
    Router.setMetaContent('meta[property="og:image:alt"]', 'property', 'og:image:alt', 'Adhya Shakti Shop');
    Router.setMetaContent('meta[name="twitter:card"]', 'name', 'twitter:card', 'summary_large_image');
    Router.setMetaContent('meta[name="twitter:title"]', 'name', 'twitter:title', title);
    Router.setMetaContent('meta[name="twitter:description"]', 'name', 'twitter:description', desc);
    Router.setMetaContent('meta[name="twitter:image"]', 'name', 'twitter:image', imageUrl);

    let canonical = document.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.rel = 'canonical';
      document.head.appendChild(canonical);
    }
    canonical.href = canonicalUrl;
  },
  // All window.* names that page handlers attach — cleaned before each navigation
  _pageGlobals: [
    'applyFilters', 'changePage',
    'selectColor', 'selectSize', 'goToProductImage', 'changeDetailQty',
    'addToCartDetail', 'buyNow', 'openSizeGuide', 'openReviewModal',
    'setStarRating', 'submitReview', 'selectPlacement', 'handlePrintUpload', 'removePrintImg',
    'placeOrder', 'applyCoupon',
    'doLogin', 'doRegister', 'doForgotPassword', 'doResetPassword', 'updatePwStrength', 'updateRpStrength',
    'renderCart', 'confirmClearCart', 'applyCartCoupon', 'removeCartCoupon',
    'submitPopupEmail',
    '_wrSelectProduct', '_wrRate', '_wrSubmit', 'handleReviewPhoto',
    'csSignup', 'toggleFaq', 'deleteReview',
    'clothingSignup', 'customPrintSignup',
    'changePassword', 'saveProfile', 'filterMyOrders', 'viewOrder', 'trackOrder', 'applyWelcomeDiscount',
    // NOTE: openWriteReview / confirmCancelOrder / doCancelOrder / confirmRequestReturn /
    // doRequestReturn are assigned ONCE at script load (top level of customer-dashboard.js),
    // not re-created per render — listing them here deletes them on the first navigation
    // and every order-action button silently dies. Keep them out of this cleanup list.
    'doTrackOrder', 'submitContact', 'submitBulkOrder',
    // Admin/staff bundle (admin.html) — same shared cleanup list
    'doAdminLogin', 'searchProducts', 'goProductPage',
    'updateVariantStock', 'removeVariantColor', 'addVariantColor', 'openProductModal',
    'removeImg', 'uploadProductImages', 'saveProduct', 'deleteProduct', 'deleteProductForever', 'submitDeleteForever',
    'setProductFilter',
    'previewBulkProducts', 'commitBulkProducts', 'resetBulkUpload', 'downloadBulkErrors',
    'openCatModal', 'addCategory', 'deleteCategory',
    'changeStatusFilter', 'setOrderView', 'viewOrderAdmin', 'editOrderStatus', 'openOrderEditor', 'updateOrderStatus', 'quickOrderStatus',
    'openProcessReturn', 'doProcessReturn', 'downloadImg', 'copyOrderValue', 'printPackingSlip', 'printAdminInvoice', 'sendOrderEmail',
    'openCreateUser', 'openEditUser', 'saveNewUser', 'saveEditUser', 'deleteUser', 'searchAdminUsers',
    'openCouponModal', 'saveCoupon', 'deleteCoupon',
    'createBackup', 'verifyBackup', 'downloadBackup', 'downloadAdminExport',
    'applySecurityFilters', 'clearSecurityFilters', 'quickSecurityFilter',
    'filterSecurityByIp', 'markVisibleSecurityReviewed', 'markSecurityEventReviewed',
    'openSecurityTab', 'restoreDrillBackup', 'clearRestoreDrillResult',
    'refreshSecurityPage',
    'reviewLowRiskSecurityEvents', 'trustSecurityIp', 'removeTrustedSecurityIp',
  ],
  cleanPageGlobals() {
    Router._pageGlobals.forEach(n => { try { delete window[n]; } catch {} });
  },

  // Overlays/bars that pages append to document.body (outside #app) — these don't get
  // wiped when a page re-renders #app, so they'd otherwise float over whatever page comes next.
  _pageDomCleanup: ['#sticky-atc', '.lightbox-overlay', '.modal-overlay', '#email-popup-overlay'],
  cleanPageDom() {
    Router._pageDomCleanup.forEach(sel => document.querySelectorAll(sel).forEach(el => el.remove()));
  },
  closeNavigationUi() {
    document.body.classList.remove('mobile-nav-open');
    document.getElementById('nav-links')?.classList.remove('open');
    document.getElementById('hamburger-btn')?.classList.remove('open');
    document.getElementById('hamburger-btn')?.setAttribute('aria-expanded', 'false');
    document.getElementById('nav-cat-menu')?.classList.remove('open');
    document.getElementById('nav-chevron')?.classList.remove('open');
    document.getElementById('nav-dropdown-trigger')?.setAttribute('aria-expanded', 'false');
  },
  scrollKey(path = location.pathname + location.search) {
    const url = new URL(path, location.origin);
    return url.pathname + url.search;
  },
  canRestoreScroll(path = location.pathname) {
    const clean = String(path || '').split(/[?#]/)[0];
    return clean === '/products' || clean === '/wishlist';
  },
  saveScrollPosition(path = location.pathname + location.search) {
    if (!Router.canRestoreScroll(path)) return;
    Router._scrollStore[Router.scrollKey(path)] = {
      x: window.scrollX || 0,
      y: window.scrollY || 0,
      at: Date.now(),
    };
  },
  restoreScrollPosition(path, gen) {
    const key = Router.scrollKey(path);
    const saved = Router._scrollStore[key];
    if (!saved) return false;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (Router.stale(gen)) return;
        window.scrollTo({ top: saved.y || 0, left: saved.x || 0, behavior: 'auto' });
      });
    });
    return true;
  },
  finishNavigation(gen, path) {
    if (Router.stale(gen)) return;
    const app = document.getElementById('app');
    app?.removeAttribute('aria-busy');
    Router.closeNavigationUi();
    const hash = (path.split('#')[1] || '').trim();
    requestAnimationFrame(() => {
      if (Router.stale(gen)) return;
      if (hash) {
        const target = document.getElementById(decodeURIComponent(hash));
        if (target) target.scrollIntoView({ block: 'start' });
      } else if (Router.canRestoreScroll(path) && Router.restoreScrollPosition(path, gen)) {
        // Product listing pages preserve the shopper's place when returning from a product.
      } else {
        window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      }
      app?.focus?.({ preventScroll: true });
    });
  },

  render(path) {
    Router._currentPath = path;
    Router.cleanPageGlobals();
    Router.cleanPageDom();
    Router._gen++;
    const gen = Router._gen;
    const app = document.getElementById('app');
    app?.classList.remove('route-silent-reset');
    if (app) app.style.minHeight = '';
    app?.setAttribute('aria-busy', 'true');
    Router.closeNavigationUi();
    const cleanPath = path.split(/[?#]/)[0];
    // Match exact then prefix
    let handler = Router.routes[cleanPath] || Router.routes[path];
    if (!handler) {
      const match = Object.keys(Router.routes).find(r => r.includes(':') && matchRoute(r, cleanPath));
      if (match) handler = Router.routes[match];
    }
    if (!handler) handler = Router.routes['/404'] || (() => {
      document.title = 'Page Not Found — Adhya Shakti Shop';
      app.innerHTML = `
        <div class="page">
          <div class="container section text-center" style="padding:80px 16px">
            <div style="font-size:6rem;font-weight:900;color:var(--primary);line-height:1;font-family:Georgia,serif">404</div>
            <h2 style="font-size:1.5rem;font-weight:700;margin:16px 0 8px">Page Not Found</h2>
            <p style="color:var(--text-light);margin-bottom:32px;max-width:360px;margin-left:auto;margin-right:auto">We couldn't find what you were looking for. It may have moved or the link might be incorrect.</p>
            <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap">
              <a href="/" data-link class="btn btn-primary"><i class="fas fa-home"></i> Go Home</a>
              <a href="/products" data-link class="btn btn-outline"><i class="fas fa-shopping-bag"></i> Browse Products</a>
              <a href="/contact" data-link class="btn btn-ghost"><i class="fas fa-envelope"></i> Contact Us</a>
            </div>
          </div>
        </div>`;
    });
    Router.applyRouteMeta(cleanPath);
    // Remove JSON-LD injected by the previous page before the next page adds its own.
    document.querySelectorAll('script[type="application/ld+json"]').forEach(el => el.remove());
    renderNavbar();
    let result;
    try {
      result = handler(getParams(path));
    } catch (e) {
      console.error(e);
      app.innerHTML = `<div class="container section empty-state"><i class="fas fa-triangle-exclamation"></i><h3>Something went wrong</h3><p>Please refresh the page or contact us if it keeps happening.</p><button class="btn btn-primary mt-16" data-csp-onclick="location.reload()">Reload</button></div>`;
    }
    renderFooter();
    Promise.resolve(result)
      .catch(e => {
        if (Router.stale(gen)) return;
        console.error(e);
        app.innerHTML = `<div class="container section empty-state"><i class="fas fa-triangle-exclamation"></i><h3>Something went wrong</h3><p>Please refresh the page or contact us if it keeps happening.</p><button class="btn btn-primary mt-16" data-csp-onclick="location.reload()">Reload</button></div>`;
      })
      .finally(() => Router.finishNavigation(gen, path));
  },
  init() {
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    window.addEventListener('pagehide', () => Router.saveScrollPosition());
    window.addEventListener('beforeunload', () => Router.saveScrollPosition());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') Router.saveScrollPosition();
    });
    window.addEventListener('popstate', () => {
      Router.saveScrollPosition(Router._currentPath);
      Router.render(location.pathname + location.search + location.hash);
    });
    document.addEventListener('click', e => {
      const a = e.target.closest('[data-link]');
      if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      if ((a.target && a.target !== '_self') || a.hasAttribute('download')) return;
      const href = a.getAttribute('href') || a.dataset.href;
      if (!href || href.startsWith('#') || /^(mailto:|tel:)/i.test(href)) return;
      const url = new URL(href, location.origin);
      if (url.origin !== location.origin) return;
      e.preventDefault();
      Router.saveScrollPosition();
      Router.navigate(url.pathname + url.search + url.hash);
    });
    Router.render(location.pathname + location.search + location.hash);
  }
};

function matchRoute(pattern, path) {
  const pp = pattern.split('/'); const rp = path.split('?')[0].split('/');
  if (pp.length !== rp.length) return false;
  return pp.every((s, i) => s.startsWith(':') || s === rp[i]);
}

function getParams(path) {
  const params = {}; const qs = path.split('?')[1];
  if (qs) qs.split('&').forEach(p => { const [k, v] = p.split('='); params[k] = decodeURIComponent(v || ''); });
  // Extract path params from current matched route
  const clean = path.split('?')[0];
  Object.keys(Router.routes).forEach(r => {
    if (!r.includes(':')) return;
    const pp = r.split('/'); const rp = clean.split('/');
    if (pp.length !== rp.length) return;
    pp.forEach((s, i) => { if (s.startsWith(':')) params[s.slice(1)] = rp[i]; });
  });
  return params;
}

function toast(msg, type = 'info', duration = 3000) {
  const c = document.getElementById('toast-container');
  const t = document.createElement('div');
  const icons = { success: 'fa-check-circle', error: 'fa-times-circle', warning: 'fa-exclamation-triangle', info: 'fa-info-circle' };
  t.className = `toast ${type}`;
  const icon = document.createElement('i');
  icon.className = `fas ${icons[type] || icons.info}`;
  t.appendChild(icon);
  t.appendChild(document.createTextNode(` ${msg || ''}`));
  c.appendChild(t);
  setTimeout(() => { t.style.animation = 'slideOut .3s ease forwards'; setTimeout(() => t.remove(), 300); }, duration);
}

function fmt(n) { return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function parseServerDate(value) {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return new Date(raw + 'T00:00:00');
  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(raw)) return new Date(raw.replace(' ', 'T'));
  return new Date(raw.replace(' ', 'T') + 'Z');
}
function viewerTimeZoneLabel() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'your device timezone'; }
  catch { return 'your device timezone'; }
}
function fmtDate(d) {
  const parsed = parseServerDate(d);
  return parsed && !isNaN(parsed) ? parsed.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }) : '-';
}
function fmtDateTime(d) {
  const parsed = parseServerDate(d);
  return parsed && !isNaN(parsed)
    ? parsed.toLocaleString('en-US', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })
    : '-';
}

// True until the first real Clothing product goes live — gates Clothing & Custom Printing
// (custom printing is only offered on clothing items, so they share one readiness signal).
async function clothingComingSoon() {
  try {
    const tree = await api.get('/category-tree');
    const clothing = ((tree && (tree.categories || tree.types)) || [])
      .find(c => c.name && c.name.toLowerCase() === 'clothing');
    if (!clothing) return true;
    const res = await api.get(`/products?category=${clothing.id}&per_page=1`);
    return res.total === 0;
  } catch {
    return true;
  }
}

// Custom Printing has its OWN readiness, independent of ready-made Clothing — it stays
// "Coming Soon" until the Custom Clothing category has at least one live product.
async function customComingSoon() {
  try {
    const tree = await api.get('/category-tree');
    const custom = ((tree && (tree.categories || tree.types)) || [])
      .find(c => c.name && /custom/i.test(c.name));
    if (!custom) return true;
    const res = await api.get(`/products?category=${custom.id}&per_page=1`);
    return res.total === 0;
  } catch {
    return true;
  }
}

// HTML-escape any user-supplied string before inserting into innerHTML
function esc(s) { const d = document.createElement('div'); d.textContent = s ?? ''; return d.innerHTML; }
function safeMediaUrl(url, fallback = '') {
  const raw = String(url || '').trim();
  if (/^\/uploads\/(?:[0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.(jpe?g|png|webp)$/i.test(raw)) return raw;
  if (/^\/images\/[A-Za-z0-9._/-]+\.(jpe?g|png|webp)$/i.test(raw)) return raw;
  try {
    const u = new URL(raw, location.origin);
    if (u.origin === location.origin && /^\/(uploads|images)\//.test(u.pathname)) return u.pathname;
    if (u.protocol === 'https:' && u.hostname === 'placehold.co') return u.href;
  } catch {}
  return fallback;
}

function statusBadge(status) {
  const labels = {
    pending:          'Pending',
    processing:       'Processing',
    shipped:          'Shipped',
    delivered:        'Delivered',
    cancelled:        'Cancelled',
    return_requested: 'Return Requested',
    return_received:  'Return Received',
    refund_pending:   'Refund Pending',
    refunded:         'Refunded',
    paid:             'Paid',
    unpaid:           'Unpaid',
    failed:           'Failed',
  };
  const s = (status || '').toLowerCase();
  const label = labels[s] || status;
  return `<span class="badge badge-${s}">${label}</span>`;
}

window.Router = Router;
