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
            <a href="/products" data-link class="btn btn-primary"><i class="fas fa-store"></i> Shop All Products</a>
            <a href="/clothing" data-link class="btn btn-outline"><i class="fas fa-tshirt"></i> Clothing</a>
            <a href="/jewelry" data-link class="btn btn-outline"><i class="fas fa-gem"></i> Jewelry</a>
          </div>
        </div>
        <div class="merch-section">
          <div class="merch-section-head">
            <div>
              <h2>Products to Explore</h2>
              <p>Recent views and new arrivals, so you can start saving favorites.</p>
            </div>
            <a href="/products" data-link class="btn btn-ghost btn-sm">Browse All <i class="fas fa-arrow-right" style="font-size:.75rem"></i></a>
          </div>
          <div id="empty-wishlist-products" class="grid-4 merch-grid"><div class="spinner"></div></div>
        </div>
      </div>`;
    fillProductRail('empty-wishlist-products', {
      includeRecent: true,
      fallbackNewest: true,
      limit: 6,
    });
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
          ${items.map((p, idx) => {
            const hasImage = !!safeMediaUrl(p.image, '');
            const img = safeMediaUrl(p.image, '/images/logo-main.png');
            return `
            <div class="wishlist-card-pro">
              <a href="/product/${encodeURIComponent(p.id)}" data-link class="wishlist-card-media ${hasImage ? '' : 'product-img-placeholder'}">
                <img src="${img}"
                  alt="${esc(p.name)}"
                  class="wishlist-card-img"
                  loading="${idx < 4 ? 'eager' : 'lazy'}"
                  decoding="async"
                  fetchpriority="${idx < 2 ? 'high' : 'auto'}"
                  width="300"
                  height="300"
                  data-csp-onerror="this.closest('.wishlist-card-media')?.classList.add('product-img-placeholder');this.src='/images/logo-main.png'" />
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
            </div>`;
          }).join('')}
        </div>

        <!-- You May Also Like -->
        <div class="merch-section" style="margin-top:56px">
          <div class="merch-section-head">
            <div>
              <h2>You May Also Like</h2>
              <p>New and recently viewed products that are not already saved here.</p>
            </div>
            <a href="/products" data-link class="btn btn-ghost btn-sm">View All <i class="fas fa-arrow-right" style="font-size:.75rem"></i></a>
          </div>
          <div id="ymal-products" class="grid-4 merch-grid"><div class="spinner"></div></div>
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
      img.closest('.wishlist-card-media')?.classList.add('product-img-placeholder');
      img.src = '/images/logo-main.png';
    }, { once: true });
  });
  document.querySelectorAll('[data-wishlist-remove]').forEach(btn => {
    btn.addEventListener('click', () => {
      Wishlist.remove(btn.dataset.wishlistRemove);
      Router.navigate('/wishlist');
    });
  });

  fillProductRail('ymal-products', {
    excludeIds: items.map(i => i.id),
    includeRecent: true,
    fallbackNewest: true,
    limit: 6,
  });
});
