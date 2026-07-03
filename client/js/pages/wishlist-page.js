Router.register('/wishlist', async () => {
  const app = document.getElementById('app');
  if (Auth.isLoggedIn() && !Auth.isAdmin()) {
    app.innerHTML = '<div class="container section"><div class="spinner"></div></div>';
    await Wishlist.syncFromServer({ mergeLocal: true });
  }
  const items = Wishlist.get();

  if (!items.length) {
    app.innerHTML = `
      <div class="container section">
        <div class="wishlist-empty-pro">
          <div class="wishlist-empty-icon"><i class="fas fa-heart"></i></div>
          <h1>Your wishlist is empty</h1>
          <p>Save products you love and come back when you are ready to choose color, size, or place an order.</p>
          <div class="wishlist-empty-actions">
            <a href="/products" data-link class="btn btn-primary"><i class="fas fa-store"></i> Browse Products</a>
            <a href="/clothing" data-link class="btn btn-outline"><i class="fas fa-shirt"></i> Clothing</a>
            <a href="/jewelry" data-link class="btn btn-outline"><i class="fas fa-gem"></i> Jewelry</a>
          </div>
        </div>
      </div>`;
    return;
  }

  app.innerHTML = `
    <div class="page">
      <div class="container" style="padding-top:24px">
        <div class="breadcrumb"><a href="/" data-link>Home</a><span class="sep">/</span><span>Wishlist</span></div>
        <div class="wishlist-heading">
          <div>
            <h1>My Wishlist <span>(${items.length} item${items.length !== 1 ? 's' : ''})</span></h1>
            <p>Saved products are kept here so you can compare, choose options, and shop when ready.</p>
          </div>
          <button class="btn btn-ghost btn-sm" id="clear-wishlist-btn">
            <i class="fas fa-trash"></i> Clear All
          </button>
        </div>
        <div class="wishlist-grid-pro">
          ${items.map(p => `
            <div class="wishlist-card-pro">
              <a href="/product/${encodeURIComponent(p.id)}" data-link class="wishlist-card-media">
                <img src="${safeMediaUrl(p.image, 'https://placehold.co/300x300/f5f5f5/999?text=No+Image')}"
                  alt="${esc(p.name)}"
                  class="wishlist-card-img"
                  loading="lazy"
                  decoding="async"
                  width="300"
                  height="300"
                  data-csp-onerror="this.src='https://placehold.co/300x300/f5f5f5/999?text=No+Image'" />
              </a>
              <div class="wishlist-card-body">
                <div class="wishlist-card-title">${esc(p.name)}</div>
                <div class="wishlist-card-price">
                  <span class="price-current">${fmt(p.price)}</span>
                  ${p.compare_price > p.price ? `<span class="price-old">${fmt(p.compare_price)}</span>` : ''}
                </div>
                <div class="wishlist-card-actions">
                  <a href="/product/${encodeURIComponent(p.id)}" data-link class="btn btn-primary btn-sm">
                    <i class="fas fa-eye"></i> View
                  </a>
                  <button class="btn btn-ghost btn-sm" data-wishlist-remove="${esc(p.id)}" aria-label="Remove from wishlist">
                    <i class="fas fa-trash" style="color:var(--danger)"></i>
                  </button>
                </div>
              </div>
            </div>`).join('')}
        </div>

        <!-- You May Also Like -->
        <div style="margin-top:56px">
          <div class="flex-between mb-16">
            <h2 style="font-size:1.4rem;font-weight:700">You May Also Like</h2>
            <a href="/products" data-link class="btn btn-ghost btn-sm">View All <i class="fas fa-arrow-right" style="font-size:.75rem"></i></a>
          </div>
          <div id="ymal-products" class="grid-4"><div class="spinner"></div></div>
        </div>
      </div>
    </div>`;
  const clearBtn = document.getElementById('clear-wishlist-btn');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      if (confirm('Clear your entire wishlist?')) {
        Wishlist.clear();
        Router.navigate('/wishlist');
      }
    });
  }
  document.querySelectorAll('.wishlist-card-img').forEach(img => {
    img.addEventListener('error', () => {
      img.src = 'https://placehold.co/300x300/f5f5f5/999?text=No+Image';
    }, { once: true });
  });
  document.querySelectorAll('[data-wishlist-remove]').forEach(btn => {
    btn.addEventListener('click', () => {
      Wishlist.remove(btn.dataset.wishlistRemove);
      Router.navigate('/wishlist');
    });
  });

  // Load suggested products — prefer products from wishlist categories, fall back to newest
  try {
    const wishIds = new Set(items.map(i => String(i.id)));
    let suggestions = [];

    // Try to get products from the same category as the first wishlist item
    // We don't store category_id in wishlist, so just fetch newest and filter
    const { products } = await api.get('/products?per_page=12&sort=newest');
    suggestions = products.filter(p => !wishIds.has(String(p.id))).slice(0, 4);

    const el = document.getElementById('ymal-products');
    if (el) {
      el.innerHTML = suggestions.length
        ? suggestions.map(productCard).join('')
        : '<div class="empty-state" style="grid-column:1/-1;padding:32px 0"><i class="fas fa-store"></i><h3>Check back soon</h3><p>New products are being added</p></div>';
    }
  } catch {
    const el = document.getElementById('ymal-products');
    if (el) el.innerHTML = '';
  }
});
