function categoryChildren(node) {
  return (node && (node.children || node.categories)) || [];
}

// Total live products in a category's whole branch (its own + every descendant's).
// The public /category-tree includes per-node counts; this sums them.
function categorySubtreeCount(node) {
  if (!node) return 0;
  return (Number(node.products) || 0) + categoryChildren(node).reduce((s, c) => s + categorySubtreeCount(c), 0);
}

function activeCategoryTree(tree) {
  const roots = (tree && (tree.categories || tree.types)) || [];
  const cloneActive = (node, path = []) => {
    if (!node || node.is_active === 0) return null;
    const nextPath = path.concat(node.name);
    const children = categoryChildren(node).map(c => cloneActive(c, nextPath)).filter(Boolean);
    return { ...node, children, categories: children, path_names: nextPath };
  };
  return roots.map(r => cloneActive(r)).filter(Boolean);
}

function flattenCategoryTree(tree) {
  const out = [];
  const walk = (node, path = []) => {
    const names = path.concat(node.name);
    out.push({ ...node, path_names: names, path_label: names.join(' / ') });
    categoryChildren(node).forEach(child => walk(child, names));
  };
  activeCategoryTree(tree).forEach(root => walk(root));
  return out;
}

function categoryIcon(label) {
  if (/jewel/i.test(label || '')) return 'fa-gem';
  if (/custom|print/i.test(label || '')) return 'fa-print';
  if (/other|mug|tumbler|bag|cap|apron/i.test(label || '')) return 'fa-box-open';
  return 'fa-tshirt';
}

function collectionPath(node) {
  const name = String(node?.name || '');
  if (/jewel/i.test(name)) return '/jewelry';
  if (/^clothing$/i.test(name)) return '/clothing';
  if (/custom/i.test(name)) return '/custom-printing';
  return node?.id ? `/products?category=${encodeURIComponent(node.id)}` : '/products';
}

function collectionLabel(node) {
  const name = String(node?.name || '');
  if (/custom/i.test(name)) return 'Custom';
  return name || 'Collection';
}

const MOBILE_NAV_MAX = 900;

// Backward aliases for older pages still being refactored.
function activeClothingTypes(tree) { return activeCategoryTree(tree); }
function flattenClothingCategories(tree) { return flattenCategoryTree(tree); }
function clothingIcon(label) { return categoryIcon(label); }

function renderNavbar() {
  // Remove any stale standalone announcement bar left by older code
  const staleAnn = document.getElementById('announcement-bar');
  if (staleAnn && !staleAnn.closest('#navbar')) staleAnn.remove();

  const annDismissed = sessionStorage.getItem('ann_dismissed');
  document.documentElement.style.setProperty('--nav-h', annDismissed ? '64px' : '100px');

  const user = Auth.getUser();
  let existing = document.getElementById('navbar');
  if (!existing) { existing = document.createElement('div'); existing.id = 'navbar'; document.body.prepend(existing); }
  const userMenu = user
    ? `<div class="nav-account-actions desktop-menu-actions">
        ${Auth.isStrictAdmin() ? `<a href="/admin" class="btn btn-sm btn-secondary"><i class="fas fa-cog"></i> Admin</a>` : ''}
        ${Auth.isStaff() ? `<a href="/admin/orders" class="btn btn-sm btn-secondary"><i class="fas fa-briefcase"></i> Staff Panel</a>` : ''}
        <a href="/dashboard" data-link class="btn btn-sm btn-outline nav-account-link nav-icon-only" aria-label="Open account" title="Account"><i class="fas fa-user"></i></a>
        <button data-csp-onclick="Auth.logout()" class="btn btn-sm btn-ghost" aria-label="Sign out"><i class="fas fa-sign-out-alt"></i></button>
      </div>`
    : `<div class="nav-account-actions desktop-menu-actions">
        <a href="/login" data-link class="btn btn-sm btn-outline">Login</a>
        <a href="/register" data-link class="btn btn-sm btn-primary">Register</a>
       </div>`;
  const drawerAccount = user
    ? `${Auth.isStrictAdmin() ? `<a href="/admin" class="mobile-drawer-link"><i class="fas fa-cog"></i><span>Admin Panel</span></a>` : ''}
       ${Auth.isStaff() ? `<a href="/admin/orders" class="mobile-drawer-link"><i class="fas fa-briefcase"></i><span>Staff Panel</span></a>` : ''}
       <a href="/dashboard" data-link class="mobile-drawer-link"><i class="fas fa-user"></i><span>Account</span></a>
       <button type="button" class="mobile-drawer-link" data-csp-onclick="Auth.logout()"><i class="fas fa-sign-out-alt"></i><span>Logout</span></button>`
    : `<a href="/login" data-link class="mobile-drawer-link"><i class="fas fa-user"></i><span>Login</span></a>
       <a href="/register" data-link class="mobile-drawer-link"><i class="fas fa-user-plus"></i><span>Register</span></a>`;

  existing.innerHTML = `
    ${!annDismissed ? `<div class="announcement-bar" id="announcement-bar"><i class="fas fa-truck"></i>&ensp;Free shipping on orders over $49 — <a href="/products" data-link>Shop Now →</a><button class="ann-close" data-csp-onclick="sessionStorage.setItem('ann_dismissed','1');this.closest('.announcement-bar').style.display='none';document.documentElement.style.setProperty('--nav-h','64px')" aria-label="Close">×</button></div>` : ''}
    <div class="container navbar-inner">
      <a href="/" data-link class="nav-logo">
        <img src="/images/logo-main.png" alt="Adhya Shakti Shop" id="nav-logo-img" width="52" height="52" decoding="async" fetchpriority="high" data-csp-onerror="document.getElementById('nav-logo-img').style.display='none'" />
        <span class="logo-text" style="font-family:Georgia,serif;line-height:1.1">Adhya <span>Shakti</span><br><span style="font-size:.55rem;letter-spacing:2px;font-weight:400;color:var(--text-light);text-transform:uppercase;font-family:system-ui">Shop &nbsp;·&nbsp; Est. 2026</span></span>
      </a>
      <div class="nav-search" id="desktop-nav-search">
        <input type="text" id="nav-search-input" placeholder="Search products..." aria-label="Search products" autocomplete="off" />
        <button class="search-btn" data-csp-onclick="doNavSearch()" aria-label="Search"><i class="fas fa-search"></i></button>
        <div class="nav-search-results" id="nav-search-results" role="listbox" hidden></div>
      </div>
      <div class="mobile-header-actions" aria-label="Quick actions">
        <button class="mobile-header-icon" type="button" data-csp-onclick="openMobileSearch()" aria-label="Search products"><i class="fas fa-search"></i></button>
        <a href="/cart" data-link class="mobile-header-icon mobile-header-cart visible" aria-label="Open cart">
          <i class="fas fa-shopping-bag"></i>
          <span class="mobile-action-count mobile-cart-count cart-count" aria-label="${Cart.count()} items in cart" style="display:${Cart.count() ? 'flex' : 'none'}">${Cart.count()}</span>
        </a>
      </div>
      <button class="hamburger" id="hamburger-btn" aria-label="Toggle menu" aria-controls="nav-links" aria-expanded="false">
        <span></span><span></span><span></span>
      </button>
      <nav class="nav-links" id="nav-links">
        <div class="mobile-search">
          <input type="text" id="m-search-input" placeholder="Search products..." aria-label="Search products" autocomplete="off" />
          <button class="mobile-search-btn" data-csp-onclick="doNavSearch('m-search-input')" aria-label="Search products"><i class="fas fa-search"></i></button>
          <div class="nav-search-results" id="m-search-results" role="listbox" hidden></div>
        </div>
        <div class="nav-collection-item" data-nav-root="jewelry"><a href="/jewelry" data-link class="nav-collection-link">Jewelry</a></div>
        <div class="nav-collection-item" data-nav-root="clothing"><a href="/clothing" data-link class="nav-collection-link">Clothing</a></div>
        <div class="nav-collection-item" data-nav-root="custom"><a href="/custom-printing" data-link class="nav-collection-link">Custom</a></div>
        <div class="mobile-drawer-actions">
          <a href="/wishlist" data-link class="mobile-drawer-link">
            <i class="fas fa-heart"></i><span>Wishlist</span>
            <span class="mobile-drawer-count wishlist-count" style="display:${Wishlist.count() ? 'inline-flex' : 'none'}">${Wishlist.count()}</span>
          </a>
          <a href="/cart" data-link class="mobile-drawer-link">
            <i class="fas fa-shopping-bag"></i><span>Cart</span>
            <span class="mobile-drawer-count cart-count" style="display:${Cart.count() ? 'inline-flex' : 'none'}">${Cart.count()}</span>
          </a>
          ${drawerAccount}
        </div>
        <button type="button" class="nav-action-link nav-search-toggle" data-csp-onclick="openDesktopSearch()" aria-label="Search products" title="Search"><i class="fas fa-search"></i></button>
        <a href="/wishlist" data-link class="cart-badge nav-action-link" aria-label="Open wishlist" title="Wishlist">
          <i class="fas fa-heart"></i> <span class="nav-action-text">Wishlist</span>
          <span class="wishlist-count" aria-label="${Wishlist.count()} items in wishlist" style="display:${Wishlist.count() ? 'flex' : 'none'};background:var(--danger)">${Wishlist.count()}</span>
        </a>
        <a href="/cart" data-link class="cart-badge nav-action-link" aria-label="Open cart" title="Cart">
          <i class="fas fa-shopping-bag"></i> <span class="nav-action-text">Cart</span>
          <span class="cart-count" aria-label="${Cart.count()} items in cart" style="display:${Cart.count() ? 'flex' : 'none'}">${Cart.count()}</span>
        </a>
        ${userMenu}
      </nav>
    </div>`;

  wireLiveSearch(document.getElementById('nav-search-input'), document.getElementById('nav-search-results'));
  wireLiveSearch(document.getElementById('m-search-input'), document.getElementById('m-search-results'));
  if (!window.__liveSearchOutsideBound) {
    document.addEventListener('click', e => {
      if (!e.target.closest('.nav-search') && !e.target.closest('.nav-search-toggle') && !e.target.closest('.mobile-search')) {
        document.getElementById('desktop-nav-search')?.classList.remove('open');
        closeSearchResults(document.getElementById('nav-search-results'));
        closeSearchResults(document.getElementById('m-search-results'));
      }
    });
    window.__liveSearchOutsideBound = true;
  }

  const navLinksEl = document.getElementById('nav-links');
  const hamburgerEl = document.getElementById('hamburger-btn');
  function setMobileNavOpen(open) {
    navLinksEl?.classList.toggle('open', open);
    hamburgerEl?.classList.toggle('open', open);
    hamburgerEl?.setAttribute('aria-expanded', open ? 'true' : 'false');
    document.body.classList.toggle('mobile-nav-open', !!open && window.innerWidth <= MOBILE_NAV_MAX);
  }
  window.openMobileSearch = function openMobileSearch() {
    setMobileNavOpen(true);
    setTimeout(() => document.getElementById('m-search-input')?.focus(), 40);
  };
  window.openDesktopSearch = function openDesktopSearch() {
    const box = document.getElementById('desktop-nav-search');
    box?.classList.toggle('open');
    setTimeout(() => document.getElementById('nav-search-input')?.focus(), 30);
  };

  if (!window._mobileNavResizeBound) {
    window._mobileNavResizeBound = true;
    window.addEventListener('resize', () => {
      if (window.innerWidth > MOBILE_NAV_MAX) document.body.classList.remove('mobile-nav-open');
      if (window.innerWidth > MOBILE_NAV_MAX) hamburgerEl?.setAttribute('aria-expanded', 'false');
    });
  }

  document.getElementById('hamburger-btn').addEventListener('click', () => {
    setMobileNavOpen(!navLinksEl?.classList.contains('open'));
  });

  navLinksEl?.addEventListener('click', e => {
    const collectionLink = e.target.closest('.nav-collection-link');
    if (collectionLink && window.innerWidth <= MOBILE_NAV_MAX) {
      const item = collectionLink.closest('.nav-collection-item');
      if (item?.classList.contains('has-children')) {
        e.preventDefault();
        item.classList.toggle('open');
        collectionLink.setAttribute('aria-expanded', item.classList.contains('open') ? 'true' : 'false');
        return;
      }
    }
    if (e.target.closest('a')) {
      setMobileNavOpen(false);
    }
  });

  buildCollectionNav();
}

function buildCollectionNav() {
  const navGen = Router._gen;
  api.get('/category-tree').catch(() => ({ categories: [] })).then((categoryTree) => {
    if (Router.stale(navGen)) return;
    const roots = activeCategoryTree(categoryTree);
    const rootFor = {
      jewelry: roots.find(r => /jewel/i.test(r.name || '')),
      clothing: roots.find(r => /^clothing$/i.test(r.name || '')),
      custom: roots.find(r => /custom/i.test(r.name || '')),
    };

    Object.entries(rootFor).forEach(([key, root]) => {
      const shell = document.querySelector(`.nav-collection-item[data-nav-root="${key}"]`);
      if (!shell || !root) return;
      const href = collectionPath(root);
      const label = collectionLabel(root);
      const children = categoryChildren(root).filter(c => c && c.is_active !== 0);
      shell.classList.toggle('has-children', !!children.length);
      shell.innerHTML = `
        <a href="${href}" data-link class="nav-collection-link" ${children.length ? 'aria-expanded="false"' : ''}>
          <span><i class="fas ${categoryIcon(label)}"></i>${esc(label)}</span>
          ${children.length ? '<i class="fas fa-chevron-down nav-collection-chevron"></i>' : ''}
        </a>
        ${children.length ? collectionDropdownHtml(children) : ''}
      `;
    });
  });
}

function collectionDropdownHtml(nodes) {
  const rows = nodes.map(node => {
    const children = categoryChildren(node).filter(c => c && c.is_active !== 0);
    const href = collectionPath(node);
    return `
      <div class="nav-collection-row ${children.length ? 'has-submenu' : ''}">
        <a href="${href}" data-link class="nav-collection-drop-link">
          <span><i class="fas ${categoryIcon(node.name)}"></i>${esc(node.name)}</span>
          ${children.length ? '<i class="fas fa-chevron-right nav-collection-sub-chevron"></i>' : ''}
        </a>
        ${children.length ? `
          <div class="nav-collection-submenu">
            ${children.map(child => `
              <a href="${collectionPath(child)}" data-link>
                <i class="fas ${categoryIcon(child.name)}"></i>${esc(child.name)}
              </a>
            `).join('')}
          </div>
        ` : ''}
      </div>
    `;
  }).join('');
  return `<div class="nav-collection-menu">${rows}</div>`;
}

function doNavSearch(inputId = 'nav-search-input') {
  const input = document.getElementById(inputId) || document.getElementById('nav-search-input') || document.getElementById('m-search-input');
  const val = input?.value.trim();
  closeSearchResults(document.getElementById('nav-search-results'));
  closeSearchResults(document.getElementById('m-search-results'));
  if (val) {
    document.getElementById('nav-links')?.classList.remove('open');
    document.getElementById('hamburger-btn')?.classList.remove('open');
    document.getElementById('hamburger-btn')?.setAttribute('aria-expanded', 'false');
    document.getElementById('desktop-nav-search')?.classList.remove('open');
    document.body.classList.remove('mobile-nav-open');
    Router.navigate(`/products?search=${encodeURIComponent(val)}`);
  }
}

function closeSearchResults(box) {
  if (box) { box.hidden = true; box.innerHTML = ''; }
}

let _liveSearchReq = 0;
async function fillSearchResults(box, q) {
  if (!box) return;
  const reqId = ++_liveSearchReq;
  let res;
  try { res = await api.get(`/products?search=${encodeURIComponent(q)}&per_page=6`); }
  catch (e) { if (reqId === _liveSearchReq) closeSearchResults(box); return; }
  if (reqId !== _liveSearchReq) return;            // ignore stale responses
  const items = res.products || [];
  if (!items.length) {
    box.innerHTML = `<div class="nav-search-empty">No matches for "${esc(q)}"</div>`;
    box.hidden = false;
    return;
  }
  box.innerHTML = items.map(p => {
    let img = '';
    try { const imgs = typeof p.images === 'string' ? JSON.parse(p.images || '[]') : (p.images || []); img = imgs[0] || ''; } catch (e) {}
    const src = img ? esc(img) : 'https://placehold.co/44/f5f5f5/ccc?text=%20';
    return `<a href="/product/${encodeURIComponent(p.id)}" data-link class="nav-search-item" role="option">
        <img src="${src}" alt="" loading="lazy" decoding="async" width="44" height="44" data-csp-onerror="this.src='https://placehold.co/44/f5f5f5/ccc?text=%20'" />
        <span class="ns-name">${esc(p.name)}</span>
        <span class="ns-price">${fmt(p.price)}</span>
      </a>`;
  }).join('') + `<a href="/products?search=${encodeURIComponent(q)}" data-link class="nav-search-all">See all results <i class="fas fa-arrow-right"></i></a>`;
  box.hidden = false;
}

function showCartAddFeedback(product, qty) {
  let box = document.getElementById('cart-add-feedback');
  if (!box) {
    box = document.createElement('div');
    box.id = 'cart-add-feedback';
    box.className = 'cart-add-feedback';
    document.body.appendChild(box);
  }
  const removed = Number(qty || 0) <= 0;
  box.innerHTML = `
    <div class="cart-add-feedback-icon"><i class="fas ${removed ? 'fa-minus' : 'fa-check'}"></i></div>
    <div class="cart-add-feedback-copy">
      <strong>${removed ? 'Removed from cart' : 'Added to cart'}</strong>
      <span>${esc(product?.name || 'Item')}${removed ? '' : ` · Qty ${Number(qty || 1)}`}</span>
    </div>
    <a href="/cart" data-link class="cart-add-feedback-link">View cart</a>`;
  box.classList.add('visible');
  clearTimeout(box._hideTimer);
  box._hideTimer = setTimeout(() => box.classList.remove('visible'), 4500);
}
window.showCartAddFeedback = showCartAddFeedback;

function quickAddQtyForKey(key) {
  return Cart.get().find(i => i.key === key)?.qty || 0;
}

function renderQuickStepper(btn, product, key) {
  const qty = quickAddQtyForKey(key);
  btn.classList.add('stepper');
  btn.removeAttribute('data-csp-onclick');
  btn.dataset.cartKey = key;
  btn.dataset.qaProduct = encodeURIComponent(JSON.stringify(product));
  btn.innerHTML = `
    <button type="button" class="quick-step-btn" aria-label="Decrease quantity">−</button>
    <span class="quick-step-count">${qty}</span>
    <button type="button" class="quick-step-btn" aria-label="Increase quantity">+</button>`;
  const [minus, plus] = btn.querySelectorAll('.quick-step-btn');
  minus.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); quickAdjustCart(btn, -1); });
  plus.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); quickAdjustCart(btn, 1); });
}

function resetQuickAddButton(btn) {
  if (!btn || !btn.classList.contains('stepper')) return;
  clearTimeout(btn._qaResetTimer);
  btn.classList.remove('stepper', 'added');
  btn.removeAttribute('data-cart-key');
  btn.removeAttribute('data-qa-product');
  btn.setAttribute('data-csp-onclick', 'event.preventDefault();event.stopPropagation();quickAddToCart(this)');
  btn.innerHTML = '<i class="fas fa-cart-plus"></i>';
}

// Per-button timer: quick-adding a second product must not cancel the first
// button's pending reset (a shared timer left earlier steppers stuck open).
function scheduleQuickAddReset(btn) {
  clearTimeout(btn._qaResetTimer);
  btn._qaResetTimer = setTimeout(() => resetQuickAddButton(btn), 5000);
}

// The quick-add overlay is a <div role="button"> (a real <button> can't nest the
// stepper's inner buttons), so Enter/Space don't fire a click natively.
document.addEventListener('keydown', e => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const el = e.target;
  if (el?.classList?.contains('product-quickadd-overlay') && !el.classList.contains('stepper')) {
    e.preventDefault();
    el.click();
  }
});

function quickAdjustCart(btn, delta) {
  try {
    const key = btn.dataset.cartKey;
    const product = JSON.parse(decodeURIComponent(btn.dataset.qaProduct || ''));
    const current = quickAddQtyForKey(key);
    const next = Math.max(0, Math.min(Number(product.stock || 99), current + delta));
    Cart.updateQty(key, next);
    if (next <= 0) {
      resetQuickAddButton(btn);
      showCartAddFeedback(product, 0);
      return;
    }
    const count = btn.querySelector('.quick-step-count');
    if (count) count.textContent = next;
    showCartAddFeedback(product, next);
    scheduleQuickAddReset(btn);
  } catch {
    toast('Could not update cart quantity.', 'error');
  }
}

function quickAddToCart(btn) {
  try {
    const p = JSON.parse(decodeURIComponent(btn.getAttribute('data-qa-enc') || ''));
    if (!p || !p.id) return;
    const stockKnown = p.stock !== undefined && p.stock !== null && p.stock !== '';
    if (p.has_variants || p.allow_custom_print || !stockKnown || Number(p.stock || 0) <= 0) {
      toast('Please open the product page to choose available options.', 'info');
      Router.navigate(`/product/${encodeURIComponent(p.id)}`);
      return;
    }
    const key = Cart.add(p, 1, null, null, { silent: true });
    btn.classList.add('added');
    renderQuickStepper(btn, p, key);
    showCartAddFeedback(p, quickAddQtyForKey(key));
    scheduleQuickAddReset(btn);
  } catch (e) {
    toast('Could not add to cart. Please open the product page.', 'error');
  }
}

function wireLiveSearch(input, box) {
  if (!input || !box || input.dataset.liveWired) return;
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { closeSearchResults(box); const v = input.value.trim(); if (v) doNavSearch(input.id); }
    else if (e.key === 'Escape') closeSearchResults(box);
  });
  let t = null;
  input.addEventListener('input', () => {
    const q = input.value.trim(); clearTimeout(t);
    if (q.length < 2) { closeSearchResults(box); return; }
    t = setTimeout(() => fillSearchResults(box, q), 250);
  });
  input.dataset.liveWired = '1';
}

function renderFooter() {
  let existing = document.getElementById('footer');
  if (!existing) { existing = document.createElement('div'); existing.id = 'footer'; document.body.appendChild(existing); }
  existing.innerHTML = `
    <div class="container">
      <div class="footer-grid">
        <div class="footer-brand">
          <h2 style="font-family:Georgia,serif">Adhya <span style="color:var(--gold)">Shakti</span> Shop</h2>
          <div style="font-size:.68rem;letter-spacing:3px;text-transform:uppercase;color:rgba(255,255,255,.38);margin-bottom:14px;font-weight:600">Est. 2026 &nbsp;&bull;&nbsp; New Jersey, USA</div>
          <p>Handcrafted jewelry, selected clothing, and custom printing from New Jersey. Clean shopping, clear support, and nationwide shipping.</p>
          <div class="social-links footer-social-stack">
            <a href="https://www.instagram.com/adhyashaktijewelry?igsh=MXZkbDQ2cnNhNGhrbw==" target="_blank" rel="noopener noreferrer" class="social-link" title="Instagram Jewelry" aria-label="Instagram Jewelry"><i class="fab fa-instagram"></i><span>Jewelry</span></a>
            <a href="https://www.instagram.com/adhyashaktiprinting" target="_blank" rel="noopener noreferrer" class="social-link" title="Instagram Printing" aria-label="Instagram Printing"><i class="fab fa-instagram"></i><span>Printing</span></a>
            <a href="https://wa.me/c/18483363769" target="_blank" rel="noopener noreferrer" class="social-link" title="WhatsApp Catalog" aria-label="WhatsApp Catalog"><i class="fab fa-whatsapp"></i><span>WhatsApp</span></a>
          </div>
        </div>
        <div class="footer-col">
          <h4>Shop</h4>
          <a href="/products" data-link>All Products</a>
          <a href="/jewelry" data-link>Jewelry</a>
          <a href="/clothing" data-link id="footer-link-clothing">Clothing</a>
          <a href="/custom-printing" data-link id="footer-link-custom">Custom Printing</a>
          <a href="/bulk-orders" data-link>Bulk Orders</a>
        </div>
        <div class="footer-col">
          <h4>Help</h4>
          <a href="/track-order" data-link>Track Your Order</a>
          <a href="/contact" data-link>Contact Support</a>
          <a href="/faq" data-link>FAQ</a>
          <a href="/refund" data-link>Returns & Refunds</a>
          <a href="/terms" data-link>Terms & Conditions</a>
          <a href="/privacy" data-link>Privacy Policy</a>
        </div>
        <div class="footer-col">
          <h4>About</h4>
          <a href="/" data-link>Home</a>
          <a href="/about" data-link>Our Story</a>
          <a href="mailto:contact@adhyashaktishop.com"><i class="fas fa-envelope" style="margin-right:6px"></i>contact@adhyashaktishop.com</a>
          <a href="https://www.google.com/maps/search/?api=1&query=New+Jersey+USA" target="_blank" rel="noopener noreferrer"><i class="fas fa-map-marker-alt" style="margin-right:6px"></i>New Jersey, USA</a>
          <a href="https://wa.me/c/18483363769" target="_blank" rel="noopener noreferrer"><i class="fab fa-whatsapp" style="margin-right:6px"></i>WhatsApp Catalog</a>
        </div>
      </div>
      <div class="footer-newsletter-bar">
        <div>
          <div style="font-weight:700;font-size:1.05rem;color:#fff;margin-bottom:4px">Get 10% Off Your First Order</div>
          <div style="color:rgba(255,255,255,.65);font-size:.88rem">Join our newsletter for exclusive deals and new arrivals.</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:6px;flex-shrink:0">
          <form id="footer-nl-form">
            <input type="email" id="footer-nl-email" placeholder="your@email.com" class="footer-nl-input" required />
            <button type="submit" class="btn btn-primary" style="white-space:nowrap">Subscribe</button>
          </form>
          <div id="footer-nl-msg"></div>
        </div>
      </div>
      <div class="footer-bottom">
        <span>© ${new Date().getFullYear()} Adhya Shakti Shop. All rights reserved.</span>
        <span>New Jersey, USA &nbsp;|&nbsp; <i class="fas fa-heart" style="color:var(--blush)"></i> Handcrafted with love</span>
      </div>
    </div>`;

  // Wire footer newsletter form (guard against double-binding on re-render)
  const nlForm = existing.querySelector('#footer-nl-form');
  if (nlForm && !nlForm.dataset.wired) {
    nlForm.dataset.wired = '1';
    nlForm.addEventListener('submit', async e => {
      e.preventDefault();
      const email = existing.querySelector('#footer-nl-email').value.trim();
      const msg   = existing.querySelector('#footer-nl-msg');
      const btn   = nlForm.querySelector('button[type="submit"]');
      btn.disabled = true; btn.textContent = 'Subscribing...';
      try {
        const res = await api.post('/newsletter/subscribe', { email });
        nlForm.style.display = 'none';
        msg.innerHTML = `<div style="color:rgba(255,255,255,.9);font-size:.88rem"><i class="fas fa-check-circle" style="color:var(--gold);margin-right:6px"></i>${esc(res.message || 'You are subscribed.')}</div>`;
      } catch (err) {
        msg.innerHTML = `<div style="color:#f87171;font-size:.82rem">${esc(err.message || 'Something went wrong. Please try again.')}</div>`;
        btn.disabled = false; btn.textContent = 'Subscribe';
      }
    });
  }

  // Tag Clothing/Custom Printing links as "Coming Soon" until real clothing products exist
  clothingComingSoon().then(isComingSoon => {
    if (!isComingSoon) return;
    ['footer-link-clothing', 'footer-link-custom'].forEach(id => {
      const link = document.getElementById(id);
      if (link && !link.querySelector('.footer-soon-tag')) {
        link.insertAdjacentHTML('beforeend', ' <span class="footer-soon-tag" style="opacity:.6;font-size:.85em">(Coming Soon)</span>');
      }
    });
  });
}

function productCard(p, index = 99) {
  const rawImg = (p.images || [])[0] || p.image;
  const hasImage = !!safeMediaUrl(rawImg, '');
  const img = safeMediaUrl(rawImg, '/images/logo-main.png');
  const priorityIndex = Number.isFinite(Number(index)) ? Number(index) : 99;
  const imageLoading = priorityIndex < 4 ? 'eager' : 'lazy';
  const imagePriority = priorityIndex < 2 ? 'high' : 'auto';
  const discount = p.compare_price > p.price ? Math.round((1 - p.price / p.compare_price) * 100) : 0;
  const wData = Wishlist.payloadAttr({ id: p.id, name: p.name, price: p.price, compare_price: p.compare_price || 0, image: img });
  const isNew = p.created_at && (Date.now() - new Date(p.created_at.replace(' ', 'T') + 'Z').getTime()) < 30 * 86400 * 1000;
  const stockKnown = p.stock !== undefined && p.stock !== null && p.stock !== '';
  const stock = Number(p.stock || 0);
  const hasVariants = !!p.has_variants;
  const customPrint = !!p.allow_custom_print;
  // Prefer the API's variant-aware availability flag when present (a clothing
  // item is in stock if ANY size/colour has stock, whatever p.stock says).
  const outOfStock = (p.in_stock !== undefined && p.in_stock !== null)
    ? !Number(p.in_stock)
    : (stockKnown && stock <= 0);
  const lowStock = stockKnown && !outOfStock && !hasVariants && stock > 0 && stock <= 5;
  const canQuickAdd = stockKnown && stock > 0 && !hasVariants && !customPrint;
  const categoryLabel = p.category_name || p.category || p.category_label || '';
  const quickPayload = { id: p.id, name: p.name, price: p.price, images: [img], stock, has_variants: hasVariants, allow_custom_print: customPrint };
  return `
    <a class="product-card" href="/product/${p.id}" data-link>
      <div class="product-img ${hasImage ? '' : 'product-img-placeholder'}">
        <img src="${img}" alt="${esc(p.name)}" loading="${imageLoading}" decoding="async" fetchpriority="${imagePriority}" width="300" height="300" data-csp-onerror="this.closest('.product-img')?.classList.add('product-img-placeholder');this.src='/images/logo-main.png'" />
        ${discount ? `<span class="product-badge">${discount}% OFF</span>` : ''}
        <button class="product-wishlist-overlay ${Wishlist.has(p.id) ? 'wishlisted' : ''}"
          data-wid="${esc(p.id)}" data-wp-enc="${wData}"
          data-csp-onclick="event.preventDefault();event.stopPropagation();Wishlist.toggleCard(this)"
          aria-label="${Wishlist.has(p.id) ? 'Remove from wishlist' : 'Add to wishlist'}">
          <i class="fas fa-heart"></i>
        </button>
        ${canQuickAdd ? `<div class="product-quickadd-overlay" role="button" tabindex="0"
          data-qa-enc="${encodeURIComponent(JSON.stringify(quickPayload))}"
          data-csp-onclick="event.preventDefault();event.stopPropagation();quickAddToCart(this)"
          aria-label="Add ${esc(p.name)} to cart" title="Add to cart">
          <i class="fas fa-cart-plus"></i>
        </div>` : (hasVariants || customPrint || !stockKnown || outOfStock) ? `<div class="product-option-overlay" role="button" tabindex="0"
          data-csp-onclick="event.preventDefault();event.stopPropagation();Router.navigate('/product/${encodeURIComponent(p.id)}')"
          aria-label="${outOfStock ? 'Open product for back in stock notification' : hasVariants ? 'Open product to choose color and size' : customPrint ? 'Open product to customize print' : 'Open product options'}"
          title="${outOfStock ? 'Notify me' : hasVariants ? 'Choose options' : customPrint ? 'Customize' : 'View options'}">
          <i class="fas ${outOfStock ? 'fa-bell' : hasVariants ? 'fa-palette' : customPrint ? 'fa-print' : 'fa-eye'}"></i>
          <span>${outOfStock ? 'Notify' : hasVariants ? 'Options' : customPrint ? 'Custom' : 'View'}</span>
        </div>` : ''}
        ${outOfStock ? `<span class="product-badge-tag out-stock-badge">Out of Stock</span>`
          : p.is_bestseller ? `<span class="product-badge-tag bestseller-badge"><i class="fas fa-fire"></i> Bestseller</span>`
          : isNew ? `<span class="product-badge-tag new-badge">✦ New</span>` : ''}
      </div>
      <div class="product-info">
        ${lowStock ? `<div class="low-stock-badge"><i class="fas fa-exclamation-circle"></i> Only ${p.stock} left!</div>` : ''}
        ${categoryLabel ? `<div class="product-category-label">${esc(categoryLabel)}</div>` : ''}
        <div class="product-name">${esc(p.name)}</div>
        ${p.avg_rating > 0 ? `<div style="display:flex;align-items:center;gap:4px;margin-bottom:4px;font-size:.75rem">
          <span style="color:#f59e0b">${'★'.repeat(Math.round(p.avg_rating))}${'☆'.repeat(5-Math.round(p.avg_rating))}</span>
          <span style="color:var(--text-light)">(${p.review_count})</span>
        </div>` : ''}
        <div class="product-price">
          <span class="price-current">${fmt(p.price)}</span>
          ${p.compare_price > p.price ? `<span class="price-old">${fmt(p.compare_price)}</span>` : ''}
          ${discount ? `<span class="price-discount">${discount}% off</span>` : ''}
        </div>
        ${hasVariants ? `<div class="product-option-note"><i class="fas fa-palette"></i> Choose color & size</div>`
          : customPrint ? `<div class="product-option-note"><i class="fas fa-print"></i> Customize print</div>`
          : !stockKnown ? `<div class="product-option-note"><i class="fas fa-circle-info"></i> Open for options</div>` : ''}
      </div>
    </a>`;
}

function getRecentlyViewedProducts(limit = 4, excludeIds = []) {
  const exclude = new Set((excludeIds || []).map(id => String(id)));
  try {
    const list = JSON.parse(localStorage.getItem('recently_viewed') || '[]');
    return (Array.isArray(list) ? list : [])
      .filter(p => p && p.id && !exclude.has(String(p.id)))
      .map(p => ({
        ...p,
        images: p.images || (p.image ? [p.image] : []),
        stock: p.stock,
        has_variants: !!p.has_variants,
        allow_custom_print: !!p.allow_custom_print,
      }))
      .slice(0, limit);
  } catch {
    return [];
  }
}

async function fillProductRail(targetId, opts = {}) {
  const el = document.getElementById(targetId);
  if (!el) return [];

  const limit = opts.limit || 4;
  const exclude = new Set((opts.excludeIds || []).map(id => String(id)));
  const seen = new Set(exclude);
  const products = [];
  const addProducts = (items = []) => {
    items.forEach(p => {
      if (!p?.id || seen.has(String(p.id)) || products.length >= limit) return;
      seen.add(String(p.id));
      products.push(p);
    });
  };

  if (opts.includeRecent !== false) {
    addProducts(getRecentlyViewedProducts(limit, [...exclude]));
  }

  const loadUrl = async (url) => {
    try {
      const res = await api.get(url);
      addProducts(res.products || []);
    } catch {}
  };

  if (products.length < limit && opts.categoryId) {
    await loadUrl(`/products?category=${encodeURIComponent(opts.categoryId)}&per_page=${Math.max(8, limit * 2)}&sort=newest`);
  }
  if (products.length < limit && opts.fallbackNewest !== false) {
    await loadUrl(`/products?per_page=${Math.max(8, limit * 2)}&sort=newest`);
  }

  const freshEl = document.getElementById(targetId);
  if (!freshEl) return products;
  freshEl.innerHTML = products.length
    ? products.slice(0, limit).map(productCard).join('')
    : (opts.emptyHtml || '<div class="merch-empty"><i class="fas fa-store"></i><h3>More products coming soon</h3><p>Check back soon for new arrivals.</p></div>');
  return products;
}

function openModal(html) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `<div class="modal">${html}</div>`;
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
  return overlay;
}

function closeModal() { document.querySelector('.modal-overlay')?.remove(); }
