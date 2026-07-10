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
  const accountLabel = Auth.isAdmin() ? 'My Account' : esc((user?.name || '').split(' ')[0] || 'Account');

  const userMenu = user
    ? `<div style="position:relative;display:flex;align-items:center;gap:4px">
        ${Auth.isStrictAdmin() ? `<a href="/admin" class="btn btn-sm btn-secondary"><i class="fas fa-cog"></i> Admin</a>` : ''}
        ${Auth.isStaff() ? `<a href="/admin/orders" class="btn btn-sm btn-secondary"><i class="fas fa-briefcase"></i> Staff Panel</a>` : ''}
        <a href="/dashboard" data-link class="btn btn-sm btn-outline"><i class="fas fa-user"></i> ${accountLabel}</a>
        <button data-csp-onclick="Auth.logout()" class="btn btn-sm btn-ghost" aria-label="Sign out"><i class="fas fa-sign-out-alt"></i></button>
      </div>`
    : `<a href="/login" data-link class="btn btn-sm btn-outline">Login</a>
       <a href="/register" data-link class="btn btn-sm btn-primary">Register</a>`;

  existing.innerHTML = `
    ${!annDismissed ? `<div class="announcement-bar" id="announcement-bar"><i class="fas fa-truck"></i>&ensp;Free shipping on orders over $49 — <a href="/products" data-link>Shop Now →</a><button class="ann-close" data-csp-onclick="sessionStorage.setItem('ann_dismissed','1');this.closest('.announcement-bar').style.display='none';document.documentElement.style.setProperty('--nav-h','64px')" aria-label="Close">×</button></div>` : ''}
    <div class="container navbar-inner">
      <a href="/" data-link class="nav-logo">
        <img src="/images/logo-main.png" alt="Adhya Shakti Shop" id="nav-logo-img" width="52" height="52" decoding="async" fetchpriority="high" data-csp-onerror="document.getElementById('nav-logo-img').style.display='none'" />
        <span class="logo-text" style="font-family:Georgia,serif;line-height:1.1">Adhya <span>Shakti</span><br><span style="font-size:.55rem;letter-spacing:2px;font-weight:400;color:var(--text-light);text-transform:uppercase;font-family:system-ui">Shop &nbsp;·&nbsp; Est. 2026</span></span>
      </a>
      <div class="nav-search">
        <input type="text" id="nav-search-input" placeholder="Search products..." aria-label="Search products" autocomplete="off" />
        <button class="search-btn" data-csp-onclick="doNavSearch()" aria-label="Search"><i class="fas fa-search"></i></button>
        <div class="nav-search-results" id="nav-search-results" role="listbox" hidden></div>
      </div>
      <a href="/cart" data-link class="mobile-header-cart ${Cart.count() ? 'visible' : ''}" aria-label="Open cart" aria-hidden="${Cart.count() ? 'false' : 'true'}" tabindex="${Cart.count() ? '0' : '-1'}">
        <i class="fas fa-shopping-cart"></i>
        <span class="mobile-cart-count" style="display:${Cart.count() ? 'flex' : 'none'}">${Cart.count()}</span>
      </a>
      <button class="hamburger" id="hamburger-btn" aria-label="Toggle menu" aria-controls="nav-links" aria-expanded="false">
        <span></span><span></span><span></span>
      </button>
      <nav class="nav-links" id="nav-links">
        <div class="mobile-search">
          <input type="text" id="m-search-input" placeholder="Search products..." aria-label="Search products" autocomplete="off" />
          <button class="mobile-search-btn" data-csp-onclick="doNavSearch('m-search-input')" aria-label="Search products"><i class="fas fa-search"></i></button>
          <div class="nav-search-results" id="m-search-results" role="listbox" hidden></div>
        </div>
        <a href="/" data-link>Home</a>
        <div class="nav-dropdown" id="nav-products-dropdown">
          <a href="/products" data-link class="nav-dropdown-trigger" aria-expanded="false" id="nav-dropdown-trigger">Products <i class="fas fa-chevron-down nav-chevron" id="nav-chevron"></i></a>
          <div class="nav-dropdown-menu" id="nav-cat-menu">
            <span class="nav-cat-loading" style="display:block;padding:14px 20px;font-size:.82rem;color:var(--text-light)"><i class="fas fa-spinner fa-spin"></i> Loading...</span>
          </div>
        </div>
        <a href="/about" data-link>About Us</a>
        <a href="/contact" data-link>Contact</a>
        <a href="/wishlist" data-link class="cart-badge">
          <i class="fas fa-heart"></i> Wishlist
          <span class="wishlist-count" aria-label="${Wishlist.count()} items in wishlist" style="display:${Wishlist.count() ? 'flex' : 'none'};background:var(--danger)">${Wishlist.count()}</span>
        </a>
        <a href="/cart" data-link class="cart-badge">
          <i class="fas fa-shopping-cart"></i> Cart
          <span class="cart-count" aria-label="${Cart.count()} items in cart" style="display:${Cart.count() ? 'flex' : 'none'}">${Cart.count()}</span>
        </a>
        ${userMenu}
      </nav>
    </div>`;

  wireLiveSearch(document.getElementById('nav-search-input'), document.getElementById('nav-search-results'));
  wireLiveSearch(document.getElementById('m-search-input'), document.getElementById('m-search-results'));
  if (!window.__liveSearchOutsideBound) {
    document.addEventListener('click', e => {
      if (!e.target.closest('.nav-search') && !e.target.closest('.mobile-search')) {
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

  // Close mobile menu when a nav link is clicked — except the Products dropdown
  // trigger, which has its own click handler to toggle the category submenu instead.
  document.querySelectorAll('#nav-links a:not(.nav-dropdown-trigger)').forEach(a =>
    a.addEventListener('click', () => {
      setMobileNavOpen(false);
    })
  );

  // ── Products mega-menu (built dynamically from the live category tree below) ──
  const _navGen = Router._gen;
  const dropdownWrap = document.getElementById('nav-products-dropdown');
  const dropdownMenu = document.getElementById('nav-cat-menu');
  const chevron      = document.getElementById('nav-chevron');
  let hideTimer;

  function closeAllMenus() {
    dropdownMenu.classList.remove('open');
    chevron.classList.remove('open');
    setMobileNavOpen(false);
  }
  const trigger = document.getElementById('nav-dropdown-trigger');
  function openDropdown() {
    clearTimeout(hideTimer);
    dropdownMenu.classList.add('open'); chevron.classList.add('open');
    if (trigger) trigger.setAttribute('aria-expanded', 'true');
  }
  function closeDropdown() {
    hideTimer = setTimeout(() => {
      dropdownMenu.classList.remove('open'); chevron.classList.remove('open');
      if (trigger) trigger.setAttribute('aria-expanded', 'false');
    }, 400);
  }

  document.querySelector('.nav-dropdown-trigger').addEventListener('click', (e) => {
    if (window.innerWidth <= MOBILE_NAV_MAX) {
      e.preventDefault();
      e.stopPropagation();
      dropdownMenu.classList.contains('open') ? closeDropdown() : openDropdown();
    }
  });
  document.querySelector('.nav-dropdown-trigger').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      dropdownMenu.classList.contains('open') ? closeDropdown() : openDropdown();
    }
    if (e.key === 'Escape') closeDropdown();
  });

  // Build mega-menu from the managed category tree
  api.get('/category-tree').catch(() => ({ categories: [] })).then((categoryTree) => {
    if (Router.stale(_navGen)) return;
    const menu = document.getElementById('nav-cat-menu');
    if (!menu) return;
    menu.innerHTML = '';

    const dedicatedPage = { Clothing: '/clothing', 'Custom Clothing': '/custom-printing', 'Custom Printing': '/custom-printing' };

    const grid = document.createElement('div');
    grid.className = 'nav-mega-grid';

    const menuColumns = activeCategoryTree(categoryTree);
    if (!menuColumns.length) {
      menu.innerHTML = '<span class="nav-cat-loading" style="display:block;padding:14px 20px;font-size:.82rem;color:var(--text-light)">No categories yet</span>';
      return;
    }

    const appendCategoryLinks = (colEl, nodes, depth = 0) => {
      nodes.forEach(item => {
        const isEmpty = categorySubtreeCount(item) === 0;
        const a = document.createElement('a');
        a.href = `/products?category=${item.id}`;
        a.dataset.link = '';
        a.style.paddingLeft = depth ? `${16 + depth * 14}px` : '';
        a.innerHTML = `<span class="cat-icon"><i class="fas ${categoryIcon(item.name)}"></i></span>${esc(item.name)}${isEmpty ? ' <span class="nav-soon-tag">Soon</span>' : ''}`;
        a.addEventListener('click', closeAllMenus);
        colEl.appendChild(a);
        appendCategoryLinks(colEl, categoryChildren(item), depth + 1);
      });
    };

    menuColumns.forEach(col => {
      const pageKey = /custom/i.test(col.name) ? 'Custom Printing' : col.name;
      const hasDedicated = !!dedicatedPage[pageKey];
      const isEmpty = categorySubtreeCount(col) === 0;
      const comingSoon = isEmpty && hasDedicated;

      const colEl = document.createElement('div');
      colEl.className = 'nav-mega-col';

      const titleEl = document.createElement(comingSoon || col.id ? 'a' : 'div');
      titleEl.className = 'nav-mega-col-title';
      if (comingSoon) { titleEl.href = dedicatedPage[pageKey]; titleEl.dataset.link = ''; }
      else if (col.id) { titleEl.href = `/products?category=${col.id}`; titleEl.dataset.link = ''; }
      titleEl.innerHTML = `<i class="fas ${categoryIcon(col.name)}"></i>${esc(col.name)}${isEmpty ? ' <span class="nav-soon-tag">Soon</span>' : ''}`;
      if (comingSoon || col.id) titleEl.addEventListener('click', closeAllMenus);
      colEl.appendChild(titleEl);

      appendCategoryLinks(colEl, categoryChildren(col));

      grid.appendChild(colEl);
    });

    menu.appendChild(grid);

    // View All footer
    const footer = document.createElement('div');
    footer.className = 'nav-mega-footer';
    footer.innerHTML = `<a href="/products" data-link><span class="cat-icon"><i class="fas fa-th"></i></span>View All Products <i class="fas fa-arrow-right" style="margin-left:auto;font-size:.7rem;opacity:.6"></i></a>`;
    footer.querySelector('a').addEventListener('click', closeAllMenus);
    menu.appendChild(footer);
  }).catch(() => {
    document.querySelector('.nav-cat-loading')?.remove();
  });
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

let quickAddResetTimer = null;

function showCartAddFeedback(product, qty) {
  let box = document.getElementById('cart-add-feedback');
  if (!box) {
    box = document.createElement('div');
    box.id = 'cart-add-feedback';
    box.className = 'cart-add-feedback';
    document.body.appendChild(box);
  }
  box.innerHTML = `
    <div class="cart-add-feedback-icon"><i class="fas fa-check"></i></div>
    <div class="cart-add-feedback-copy">
      <strong>Added to cart</strong>
      <span>${esc(product?.name || 'Item')} · Qty ${Number(qty || 1)}</span>
    </div>
    <a href="/cart" data-link class="cart-add-feedback-link">View cart</a>`;
  box.classList.add('visible');
  clearTimeout(box._hideTimer);
  box._hideTimer = setTimeout(() => box.classList.remove('visible'), 4500);
}

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
  btn.classList.remove('stepper', 'added');
  btn.removeAttribute('data-cart-key');
  btn.removeAttribute('data-qa-product');
  btn.setAttribute('data-csp-onclick', 'event.preventDefault();event.stopPropagation();quickAddToCart(this)');
  btn.innerHTML = '<i class="fas fa-cart-plus"></i>';
}

function scheduleQuickAddReset(btn) {
  clearTimeout(quickAddResetTimer);
  quickAddResetTimer = setTimeout(() => resetQuickAddButton(btn), 5000);
}

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
          <p>Your destination for handcrafted jewelry and custom-printed clothing. Based in New Jersey, USA — shipping nationwide.</p>
          <div class="social-links" style="align-items:flex-start">
            <a href="https://www.facebook.com/profile.php?id=61590793342693" target="_blank" rel="noopener noreferrer" class="social-link" title="Facebook"><i class="fab fa-facebook-f"></i></a>
            <div style="display:flex;flex-direction:column;align-items:center;gap:2px">
              <a href="https://www.instagram.com/adhyashaktijewelry?igsh=MXZkbDQ2cnNhNGhrbw==" target="_blank" rel="noopener noreferrer" class="social-link" title="Instagram — Jewellery"><i class="fab fa-instagram"></i></a>
              <span style="font-size:.5rem;color:rgba(255,255,255,.4);letter-spacing:.5px;text-transform:uppercase">Jewelry</span>
            </div>
            <div style="display:flex;flex-direction:column;align-items:center;gap:2px">
              <a href="https://www.instagram.com/adhyashaktiprinting" target="_blank" rel="noopener noreferrer" class="social-link" title="Instagram — Printing"><i class="fab fa-instagram"></i></a>
              <span style="font-size:.5rem;color:rgba(255,255,255,.4);letter-spacing:.5px;text-transform:uppercase">Printing</span>
            </div>
            <a href="https://wa.me/c/18483363769" target="_blank" rel="noopener noreferrer" class="social-link" title="WhatsApp Catalog"><i class="fab fa-whatsapp"></i></a>
          </div>
        </div>
        <div class="footer-col">
          <h4>Quick Links</h4>
          <a href="/" data-link>Home</a>
          <a href="/jewelry" data-link>Jewelry</a>
          <a href="/clothing" data-link id="footer-link-clothing">Clothing</a>
          <a href="/custom-printing" data-link id="footer-link-custom">Custom Printing</a>
          <a href="/bulk-orders" data-link>Bulk Orders</a>
          <a href="/coming-soon" data-link>Coming Soon</a>
          <a href="/about" data-link>About Us</a>
          <a href="/contact" data-link>Contact Us</a>
        </div>
        <div class="footer-col">
          <h4>Help & Policies</h4>
          <a href="/faq" data-link>FAQ</a>
          <a href="/track-order" data-link>Track Your Order</a>
          <a href="/terms" data-link>Terms & Conditions</a>
          <a href="/privacy" data-link>Privacy Policy</a>
          <a href="/refund" data-link>Return, Refund & Cancel Policy</a>
        </div>
        <div class="footer-col">
          <h4>Contact</h4>
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

function productCard(p) {
  const img = safeMediaUrl((p.images || [])[0] || p.image, 'https://placehold.co/300x300/f5f5f5/999?text=No+Image');
  const discount = p.compare_price > p.price ? Math.round((1 - p.price / p.compare_price) * 100) : 0;
  const wData = Wishlist.payloadAttr({ id: p.id, name: p.name, price: p.price, compare_price: p.compare_price || 0, image: img });
  const isNew = p.created_at && (Date.now() - new Date(p.created_at.replace(' ', 'T') + 'Z').getTime()) < 30 * 86400 * 1000;
  const stockKnown = p.stock !== undefined && p.stock !== null && p.stock !== '';
  const stock = Number(p.stock || 0);
  const hasVariants = !!p.has_variants;
  const customPrint = !!p.allow_custom_print;
  const outOfStock = stockKnown && stock <= 0;
  const lowStock = stockKnown && !outOfStock && !hasVariants && stock > 0 && stock <= 5;
  const canQuickAdd = stockKnown && stock > 0 && !hasVariants && !customPrint;
  const quickPayload = { id: p.id, name: p.name, price: p.price, images: [img], stock, has_variants: hasVariants, allow_custom_print: customPrint };
  return `
    <a class="product-card" href="/product/${p.id}" data-link>
      <div class="product-img">
        <img src="${img}" alt="${esc(p.name)}" loading="lazy" decoding="async" width="300" height="300" data-csp-onerror="this.src='https://placehold.co/300x300/f5f5f5/999?text=No+Image'" />
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
        </div>` : ''}
        ${outOfStock ? `<span class="product-badge-tag" style="background:#6b7280;color:#fff">Out of Stock</span>`
          : p.is_bestseller ? `<span class="product-badge-tag bestseller-badge"><i class="fas fa-fire"></i> Bestseller</span>`
          : isNew ? `<span class="product-badge-tag new-badge">✦ New</span>` : ''}
      </div>
      <div class="product-info">
        ${lowStock ? `<div class="low-stock-badge"><i class="fas fa-exclamation-circle"></i> Only ${p.stock} left!</div>` : ''}
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
        ${hasVariants ? `<div class="product-option-note"><i class="fas fa-palette"></i> Color/size options</div>`
          : customPrint ? `<div class="product-option-note"><i class="fas fa-print"></i> Custom print options</div>`
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
