function openLightbox(images, startIdx) {
  images = (images || []).map(u => safeMediaUrl(u)).filter(Boolean);
  if (!images.length) return;
  let cur = startIdx;
  const ov = document.createElement('div');
  ov.className = 'lightbox-overlay';

  const draw = () => {
    ov.innerHTML = `
      <button class="lightbox-close" title="Close" aria-label="Close">×</button>
      <div class="lightbox-figure"><img class="lightbox-img" src="${images[cur]}" alt="" /></div>
      ${images.length > 1 ? `
        <button class="lightbox-arrow lb-prev" aria-label="Previous image"><i class="fas fa-chevron-left"></i></button>
        <button class="lightbox-arrow lb-next" aria-label="Next image"><i class="fas fa-chevron-right"></i></button>
        <div class="lightbox-counter">${cur + 1} / ${images.length}</div>` : ''}`;
    ov.querySelector('.lightbox-close').onclick = () => ov.remove();
    ov.querySelector('.lb-prev')?.addEventListener('click', () => { cur = (cur - 1 + images.length) % images.length; draw(); });
    ov.querySelector('.lb-next')?.addEventListener('click', () => { cur = (cur + 1) % images.length; draw(); });
    // Magnify-zoom: tap/click the image to zoom in, move to pan, tap again to reset.
    const fig = ov.querySelector('.lightbox-figure');
    const zimg = fig.querySelector('.lightbox-img');
    let zoomed = false;
    const setOrigin = (cx, cy) => {
      const r = fig.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const x = Math.min(100, Math.max(0, ((cx - r.left) / r.width) * 100));
      const y = Math.min(100, Math.max(0, ((cy - r.top) / r.height) * 100));
      zimg.style.transformOrigin = x + '% ' + y + '%';
    };
    fig.addEventListener('click', e => {
      e.stopPropagation();
      zoomed = !zoomed;
      fig.classList.toggle('zoomed', zoomed);
      if (zoomed) { setOrigin(e.clientX, e.clientY); zimg.style.transform = 'scale(2.4)'; }
      else { zimg.style.transform = ''; }
    });
    fig.addEventListener('mousemove', e => { if (zoomed) setOrigin(e.clientX, e.clientY); });
    fig.addEventListener('touchmove', e => { if (zoomed && e.touches[0]) { e.preventDefault(); setOrigin(e.touches[0].clientX, e.touches[0].clientY); } }, { passive: false });
  };

  ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
  const keyFn = e => {
    if (e.key === 'Escape') { ov.remove(); document.removeEventListener('keydown', keyFn); }
    if (images.length > 1 && e.key === 'ArrowLeft') { cur = (cur - 1 + images.length) % images.length; draw(); }
    if (images.length > 1 && e.key === 'ArrowRight') { cur = (cur + 1) % images.length; draw(); }
  };
  document.addEventListener('keydown', keyFn);
  // Clean up keyFn when overlay is removed
  new MutationObserver((_, obs) => {
    if (!document.body.contains(ov)) { document.removeEventListener('keydown', keyFn); obs.disconnect(); }
  }).observe(document.body, { childList: true, subtree: false });

  draw();
  document.body.appendChild(ov);
}

function saveRecentlyViewed(p, img) {
  const key = 'recently_viewed';
  try {
    let list = JSON.parse(localStorage.getItem(key) || '[]');
    list = list.filter(i => String(i.id) !== String(p.id));
    list.unshift({ id: p.id, name: p.name, price: p.price, compare_price: p.compare_price || 0, image: img || '' });
    localStorage.setItem(key, JSON.stringify(list.slice(0, 10)));
  } catch {}
}

function absoluteSiteUrl(url) {
  try { return new URL(url || '/', location.origin).href; } catch { return location.origin + '/'; }
}

function ensureCanonical(href) {
  let el = document.querySelector('link[rel="canonical"]');
  if (!el) {
    el = document.createElement('link');
    el.rel = 'canonical';
    document.head.appendChild(el);
  }
  el.href = href;
}

function setProductMeta(title, description, image) {
  const desc = String(description || '').replace(/\s+/g, ' ').trim().slice(0, 155);
  const imageUrl = image ? absoluteSiteUrl(image) : '';
  document.title = `${title} — Adhya Shakti Shop`;
  const setMeta = (sel, val) => { const el = document.querySelector(sel); if (el) el.setAttribute('content', val); };
  setMeta('meta[name="description"]', desc);
  setMeta('meta[property="og:title"]', `${title} — Adhya Shakti Shop`);
  setMeta('meta[property="og:description"]', desc);
  setMeta('meta[property="og:image"]', imageUrl);
  setMeta('meta[property="og:url"]', window.location.href);
  setMeta('meta[name="twitter:title"]', `${title} — Adhya Shakti Shop`);
  setMeta('meta[name="twitter:description"]', desc);
  setMeta('meta[name="twitter:image"]', imageUrl);
  ensureCanonical(absoluteSiteUrl(location.pathname));
}

Router.register('/product/:id', async (params) => {
  const _gen = Router._gen;
  document.getElementById('sticky-atc')?.remove();
  const app = document.getElementById('app');
  app.innerHTML = '<div class="container section"><div class="spinner"></div></div>';

  try {
    const p = await api.get(`/products/${params.id}`);
    if (Router.stale(_gen)) return;
    const imgs = (p.images || []).map(u => safeMediaUrl(u)).filter(Boolean);
    if (!imgs.length) imgs.push('https://placehold.co/500x500/f5f5f5/999?text=No+Image');
    setProductMeta(p.name, p.description || `Buy ${p.name} at Adhya Shakti Shop. Handcrafted jewelry and custom-printed clothing from New Jersey, USA.`, imgs[0]);
    const discount = p.compare_price > p.price ? Math.round((1 - p.price / p.compare_price) * 100) : 0;
    const avgRating = p.reviews?.length ? (p.reviews.reduce((s, r) => s + r.rating, 0) / p.reviews.length).toFixed(1) : 0;

    // Build variant lookup: { color: { size: stock } }
    const variants = (p.variants || []).map(v => ({
      color: String(v.color || '').replace(/[<>"'`]/g, '').slice(0, 40),
      size: String(v.size || '').replace(/[<>"'`]/g, '').slice(0, 20),
      stock: Number(v.stock) || 0,
    })).filter(v => v.color && v.size);
    const variantMap = {};
    variants.forEach(v => {
      if (!variantMap[v.color]) variantMap[v.color] = {};
      variantMap[v.color][v.size] = v.stock;
    });
    const colors = Object.keys(variantMap);
    const SIZE_ORDER = ['XXS', 'XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL'];
    const variantSizes = [...new Set(variants.map(v => v.size))].sort((a, b) => {
      const ai = SIZE_ORDER.indexOf(String(a).toUpperCase());
      const bi = SIZE_ORDER.indexOf(String(b).toUpperCase());
      if (ai !== -1 || bi !== -1) return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
      return String(a).localeCompare(String(b));
    });
    const hasVariants = colors.length > 0;
    const totalVariantStock = variants.reduce((s, v) => s + v.stock, 0);
    const allOutOfStock = hasVariants && totalVariantStock === 0;
    const simpleOutOfStock = !hasVariants && Number(p.stock || 0) <= 0;
    const unavailable = allOutOfStock || simpleOutOfStock;
    const wData = Wishlist.payloadAttr({ id: p.id, name: p.name, price: p.price, compare_price: p.compare_price || 0, image: imgs[0] });
    const viewer = (typeof Auth !== 'undefined' && Auth.getUser) ? Auth.getUser() : null;
    const notifyEmail = viewer?.email || '';

    // Color dot helper
    const colorDotMap = {
      white:'#ffffff', black:'#222', red:'#e53935', blue:'#1565c0',
      navy:'#0d1b4b', green:'#2e7d32', yellow:'#f9a825', orange:'#e65100',
      pink:'#e91e63', purple:'#6a1b9a', grey:'#757575', gray:'#757575',
      cream:'#f5f0e8', beige:'#d4b896', brown:'#5d4037', teal:'#00695c',
      maroon:'#880e4f', gold:'#c49a22', silver:'#9e9e9e',
    };
    function colorDot(name) { return colorDotMap[String(name || '').toLowerCase()] || '#aaa'; }

    app.innerHTML = `
      <div class="page">
        <div class="container" style="padding-top:24px">
          <div class="breadcrumb">
            <a href="/" data-link>Home</a><span class="sep">/</span>
            <a href="/products" data-link>Products</a><span class="sep">/</span>
            ${p.category_name ? `<a href="/products?category=${p.category_id}" data-link>${esc(p.category_name)}</a><span class="sep">/</span>` : ''}
            <span>${esc(p.name)}</span>
          </div>
          <div class="product-detail mt-24">
            <div class="product-images">
              <div class="main-img" id="main-img-wrap">
                <div class="main-img-track" id="main-img-track">
                  ${imgs.map((im, i) => `<div class="main-img-slide"><img src="${im}" alt="${esc(p.name)} product image ${i + 1}" loading="${i === 0 ? 'eager' : 'lazy'}" decoding="async" fetchpriority="${i === 0 ? 'high' : 'auto'}" width="500" height="500" data-csp-onerror="this.src='https://placehold.co/500x500/f5f5f5/999?text=No+Image'" /></div>`).join('')}
                </div>
                ${imgs.length > 1 ? `
                  <button class="main-img-arrow prev" id="main-img-prev" aria-label="Previous image"><i class="fas fa-chevron-left"></i></button>
                  <button class="main-img-arrow next" id="main-img-next" aria-label="Next image"><i class="fas fa-chevron-right"></i></button>
                ` : ''}
              </div>
              ${imgs.length > 1 ? `<div class="thumb-row">
                ${imgs.map((im, i) => `<div class="thumb ${i === 0 ? 'active' : ''}" data-csp-onclick="goToProductImage(${i})"><img src="${im}" alt="${esc(p.name)} thumbnail ${i + 1}" loading="lazy" decoding="async" width="72" height="72" /></div>`).join('')}
              </div>` : ''}
            </div>
            <div class="product-detail-info">
              <div class="text-muted text-sm mb-8">${esc(p.category_name || '')}</div>
              <h1 style="font-size:1.6rem;font-weight:800;margin-bottom:12px">${esc(p.name)}</h1>
              <div class="product-rating mb-16">
                <span class="stars">${avgRating > 0 ? '★'.repeat(Math.round(avgRating)) + '☆'.repeat(5-Math.round(avgRating)) : '☆☆☆☆☆'}</span>
                <span>${avgRating > 0 ? avgRating : 'No'} ratings (${p.reviews?.length || 0} reviews)</span>
              </div>
              <div style="display:flex;align-items:baseline;gap:12px;margin-bottom:24px">
                <span class="price-big">${fmt(p.price)}</span>
                ${p.compare_price > p.price ? `<span class="price-old" style="font-size:1.1rem">${fmt(p.compare_price)}</span>
                  <span class="badge badge-success">${discount}% OFF</span>` : ''}
              </div>
              ${p.description ? `<p style="color:#555;line-height:1.8;margin-bottom:24px">${esc(p.description)}</p>` : ''}

              ${allOutOfStock ? `
              <!-- All out of stock banner -->
              <div style="background:#fff8f8;border:1.5px solid #f5c0c0;border-radius:10px;padding:18px 20px;margin-bottom:20px;display:flex;align-items:center;gap:14px">
                <div style="font-size:2rem">🚫</div>
                <div>
                  <div style="font-weight:700;font-size:1rem;color:#c0392b;margin-bottom:4px">Currently Out of Stock</div>
                  <div style="font-size:.88rem;color:#888">This product is not available right now. Check back soon — we restock regularly!</div>
                </div>
              </div>
              ` : hasVariants ? `
              <div class="variant-buy-helper">
                <i class="fas fa-circle-info"></i>
                Select a color and size before adding this item to your cart. All sizes are shown below; unavailable sizes turn grey after you choose a color.
              </div>

              <!-- Color selector -->
              <div class="form-group" style="margin-bottom:16px">
                <div class="form-label" style="margin-bottom:8px">Color: <strong id="selected-color-label">— select a color</strong></div>
                <div style="display:flex;flex-wrap:wrap;gap:8px" id="color-options">
                  ${colors.map(c => `
                    <button type="button" data-color-option="${esc(c)}"
                      aria-pressed="false"
                      style="display:flex;align-items:center;gap:6px;padding:6px 12px;border:2px solid var(--border);border-radius:20px;background:#fff;cursor:pointer;font-size:.88rem;transition:all .15s"
                      id="color-btn-${colors.indexOf(c)}">
                      <span style="width:14px;height:14px;border-radius:50%;background:${colorDot(c)};border:1px solid #ccc;flex-shrink:0;display:inline-block"></span>
                      ${esc(c)}
                    </button>`).join('')}
                </div>
              </div>

              <!-- Size selector -->
              <div class="form-group" id="size-section" style="display:block;margin-bottom:16px">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
                  <div class="form-label" style="margin-bottom:0">Size: <strong id="selected-size-label">— select a size</strong></div>
                  <button data-csp-onclick="openSizeGuide()" style="background:none;border:none;cursor:pointer;color:var(--primary);font-size:.82rem;font-weight:600;display:flex;align-items:center;gap:5px;padding:0"><i class="fas fa-ruler-combined"></i> Size Guide</button>
                </div>
                <div style="display:flex;flex-wrap:wrap;gap:8px" id="size-options">
                  ${variantSizes.map(s => `
                    <button type="button" data-size-option="${esc(s)}" aria-disabled="false"
                      id="size-btn-${esc(String(s).replace(/[^a-z0-9_-]/gi, '-'))}"
                      style="min-width:48px;padding:6px 12px;border:2px solid #ddd;border-radius:6px;background:#f7f7f7;color:#999;cursor:pointer;font-size:.88rem;font-weight:600;position:relative;transition:all .15s"
                      title="Select a color first to check this size">
                      ${esc(s)}
                    </button>`).join('')}
                </div>
              </div>

              <!-- Stock status -->
              <div id="variant-stock-info" style="margin-bottom:16px;font-size:.88rem;color:var(--text-light)">
                <i class="fas fa-info-circle" style="color:var(--primary);margin-right:6px"></i>Select a color to check size availability.
              </div>
              ` : `
              <!-- Simple stock display (no variants) -->
              <div style="margin-bottom:16px;font-size:.88rem">
                ${p.stock <= 0
                  ? `<span style="color:#b91c1c"><i class="fas fa-times-circle" style="margin-right:5px"></i>Out of Stock</span>`
                  : p.stock <= 5
                    ? `<span class="low-stock-badge" style="font-size:.85rem;padding:4px 10px"><i class="fas fa-exclamation-circle"></i> Only ${p.stock} left — order soon!</span>`
                    : `<span style="color:var(--success)"><i class="fas fa-check-circle" style="margin-right:5px"></i>In Stock</span>`}
              </div>`}

              <div class="form-group">
                <div class="form-label">Quantity</div>
                <div class="qty-control">
                  <button class="qty-btn" data-csp-onclick="changeDetailQty(-1)">−</button>
                  <input class="qty-val" id="detail-qty" type="number" value="1" min="1" max="${p.stock || 999}" />
                  <button class="qty-btn" data-csp-onclick="changeDetailQty(1)">+</button>
                </div>
              </div>

              ${p.allow_custom_print ? `
              <!-- Custom Print Upload Section -->
              <div style="border:2px solid var(--primary);border-radius:12px;padding:20px;margin-bottom:20px;background:linear-gradient(135deg,rgba(29,92,74,.04),rgba(196,154,34,.04))">
                <div style="font-weight:700;font-size:.95rem;margin-bottom:4px;color:var(--primary)"><i class="fas fa-print" style="margin-right:8px"></i>Custom Print Design</div>
                <div style="font-size:.82rem;color:var(--text-light);margin-bottom:12px">Upload your artwork. Min 1, max 3 images per side.</div>
                <div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:10px 14px;margin-bottom:14px;font-size:.8rem;color:#0369a1;display:flex;gap:16px;flex-wrap:wrap">
                  <span><i class="fas fa-file-image" style="margin-right:4px"></i>JPG, PNG, WebP</span>
                  <span><i class="fas fa-tachometer-alt" style="margin-right:4px"></i>Clear, high-resolution image recommended</span>
                  <span><i class="fas fa-weight-hanging" style="margin-right:4px"></i>Max 6 MB per file</span>
                  <span><i class="fas fa-vector-square" style="margin-right:4px"></i>Print area: up to 12″ × 16″</span>
                </div>

                <!-- Placement selector -->
                <div style="margin-bottom:16px">
                  <div style="font-size:.85rem;font-weight:600;margin-bottom:8px">Print Placement</div>
                  <div style="display:flex;gap:10px;flex-wrap:wrap">
                    <button id="place-front" data-csp-onclick="selectPlacement('front')"
                      style="padding:8px 18px;border:2px solid var(--border);border-radius:8px;background:#fff;cursor:pointer;font-size:.88rem;font-weight:600;transition:all .15s">
                      <i class="fas fa-tshirt" style="margin-right:6px"></i>Front Only
                    </button>
                    <button id="place-back" data-csp-onclick="selectPlacement('back')"
                      style="padding:8px 18px;border:2px solid var(--border);border-radius:8px;background:#fff;cursor:pointer;font-size:.88rem;font-weight:600;transition:all .15s">
                      <i class="fas fa-tshirt fa-flip-horizontal" style="margin-right:6px"></i>Back Only
                    </button>
                    <button id="place-both" data-csp-onclick="selectPlacement('both')"
                      style="padding:8px 18px;border:2px solid var(--border);border-radius:8px;background:#fff;cursor:pointer;font-size:.88rem;font-weight:600;transition:all .15s">
                      <i class="fas fa-tshirt" style="margin-right:4px"></i><i class="fas fa-plus" style="font-size:.65rem;margin-right:4px"></i><i class="fas fa-tshirt fa-flip-horizontal" style="margin-right:6px"></i>Front & Back
                    </button>
                  </div>
                  <div id="both-price-note" style="display:none;margin-top:8px;font-size:.82rem;color:var(--secondary);font-weight:600">
                    <i class="fas fa-info-circle"></i> +$8.99 for Front & Back printing
                  </div>
                </div>

                <!-- Front upload -->
                <div id="upload-front" style="display:none;margin-bottom:12px">
                  <div style="font-size:.85rem;font-weight:600;margin-bottom:6px;color:var(--primary)">Front Design (1–3 images)</div>
                  <div style="border:2px dashed var(--border);border-radius:8px;padding:14px;text-align:center;cursor:pointer;background:#fff" data-csp-onclick="document.getElementById('file-front').click()">
                    <i class="fas fa-cloud-upload-alt" style="font-size:1.4rem;color:var(--text-light);margin-bottom:4px;display:block"></i>
                    <div style="font-size:.82rem;color:var(--text-light)">Click to upload front design</div>
                  </div>
                  <input type="file" id="file-front" accept=".jpg,.jpeg,.png,.webp" multiple style="display:none" data-csp-onchange="handlePrintUpload('front',this)" />
                  <div id="preview-front" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px"></div>
                </div>

                <!-- Back upload -->
                <div id="upload-back" style="display:none">
                  <div style="font-size:.85rem;font-weight:600;margin-bottom:6px;color:var(--primary)">Back Design (1–3 images)</div>
                  <div style="border:2px dashed var(--border);border-radius:8px;padding:14px;text-align:center;cursor:pointer;background:#fff" data-csp-onclick="document.getElementById('file-back').click()">
                    <i class="fas fa-cloud-upload-alt" style="font-size:1.4rem;color:var(--text-light);margin-bottom:4px;display:block"></i>
                    <div style="font-size:.82rem;color:var(--text-light)">Click to upload back design</div>
                  </div>
                  <input type="file" id="file-back" accept=".jpg,.jpeg,.png,.webp" multiple style="display:none" data-csp-onchange="handlePrintUpload('back',this)" />
                  <div id="preview-back" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px"></div>
                </div>
              </div>` : ''}

              <div style="display:flex;gap:12px;margin-bottom:24px;flex-wrap:wrap">
                ${unavailable
                  ? `<button class="btn btn-lg" disabled style="background:#eee;color:#999;border:1px solid #ddd;cursor:not-allowed;opacity:1"><i class="fas fa-clock"></i> Out of Stock</button>`
                  : `<button class="btn btn-primary btn-lg" id="atc-btn" data-csp-onclick="addToCartDetail()"><i class="fas fa-cart-plus"></i> Add to Cart</button>
                     <button class="btn btn-secondary btn-lg" data-csp-onclick="buyNow()"><i class="fas fa-bolt"></i> Buy Now</button>`}
                <button class="btn btn-outline btn-lg ${Wishlist.has(p.id) ? 'wishlisted' : ''}"
                  id="wishlist-btn" data-wid="${esc(p.id)}" data-wp-enc="${wData}"
                  data-csp-onclick="Wishlist.toggleDetail()" aria-label="Save to wishlist">
                  <i class="fas fa-heart"></i> <span id="wish-label">${Wishlist.has(p.id) ? 'Saved' : 'Save'}</span>
                </button>
              </div>
              ${unavailable ? `
              <div id="back-stock-box" style="border:1.5px solid #d8eadf;background:#f6fbf8;border-radius:12px;padding:16px;margin:-8px 0 24px">
                <div style="font-weight:800;color:var(--primary);margin-bottom:4px"><i class="fas fa-bell" style="margin-right:7px"></i>Notify me when this is back</div>
                <div style="font-size:.86rem;color:var(--text-light);line-height:1.55;margin-bottom:12px">Enter your email and we will send one message when this product is available again.</div>
                <div style="display:flex;gap:8px;flex-wrap:wrap">
                  <input class="form-control" id="bis-email" type="email" value="${esc(notifyEmail)}" placeholder="you@example.com" style="flex:1;min-width:210px;background:#fff" />
                  <button class="btn btn-primary" id="bis-btn" data-csp-onclick="requestBackInStock()"><i class="fas fa-envelope"></i> Notify Me</button>
                </div>
                <div id="bis-msg" style="font-size:.82rem;margin-top:8px;color:var(--text-light)"></div>
              </div>` : ''}
              <div class="product-confidence-panel">
                <div><i class="fas fa-lock"></i><span>Secure checkout powered by Stripe</span></div>
                <div><i class="fas fa-truck"></i><span>Ships from New Jersey, USA</span></div>
                <div><i class="fas fa-rotate-left"></i><span>Easy 15-day returns — we'll make it right</span></div>
                <div><i class="fas fa-ruler-combined"></i><span>Need help with size? Contact us before ordering</span></div>
              </div>
              <!-- Delivery estimate -->
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:16px;font-size:.85rem;color:var(--text-light)">
                <i class="fas fa-shipping-fast" style="color:var(--primary)"></i>
                <span>Usually ships within <strong style="color:var(--text)">2–3 business days</strong></span>
              </div>

              <!-- Guarantee badge -->
              <div style="display:flex;align-items:center;gap:12px;background:linear-gradient(135deg,#f0fdf4,#dcfce7);border:1.5px solid #bbf7d0;border-radius:10px;padding:12px 16px;margin-bottom:16px">
                <div style="width:38px;height:38px;background:#16a34a;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0">
                  <i class="fas fa-medal" style="color:#fff;font-size:1.1rem"></i>
                </div>
                <div>
                  <div style="font-weight:700;font-size:.9rem;color:#15803d">100% Satisfaction Guaranteed</div>
                  <div style="font-size:.8rem;color:#166534">If something's not right, we'll make it right.</div>
                </div>
              </div>
              <div style="background:var(--bg);border-radius:8px;padding:16px;font-size:.88rem">
                <div style="display:flex;gap:24px;flex-wrap:wrap">
                  <span><i class="fas fa-shipping-fast" style="color:var(--primary);margin-right:6px"></i>Free shipping on orders over $49</span>
                  <span><i class="fas fa-envelope" style="color:var(--primary);margin-right:6px"></i>Contact us for returns</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Complete the Look -->
          <div class="section merch-section" id="ctl-section" style="${p.category_id ? '' : 'display:none'}">
            <div class="merch-section-head">
              <div>
                <h2>Complete the Look</h2>
                <p>Similar picks from this category that pair well with what you are viewing.</p>
              </div>
              <a href="/products${p.category_id ? '?category=' + p.category_id : ''}" data-link class="btn btn-ghost btn-sm">View All <i class="fas fa-arrow-right" style="font-size:.75rem"></i></a>
            </div>
            <div id="ctl-products" class="grid-4 merch-grid"><div class="spinner"></div></div>
          </div>

          <!-- Recently Viewed -->
          <div class="section merch-section" id="recent-product-section">
            <div class="merch-section-head">
              <div>
                <h2>Recently Viewed</h2>
                <p>Products you looked at recently, kept here so you can compare without searching again.</p>
              </div>
              <a href="/products" data-link class="btn btn-ghost btn-sm">Browse All <i class="fas fa-arrow-right" style="font-size:.75rem"></i></a>
            </div>
            <div id="recent-product-rail" class="grid-4 merch-grid"><div class="spinner"></div></div>
          </div>

          <!-- Reviews -->
          <div class="section">
            <div class="flex-between mb-16">
              <h2 style="font-size:1.4rem;font-weight:700">Customer Reviews</h2>
              ${Auth.isLoggedIn() ? `<button class="btn btn-outline" data-csp-onclick="openReviewModal('${p.id}')"><i class="fas fa-pen"></i> Write a Review</button>` : ''}
            </div>
            <div id="reviews-list">
              ${p.reviews?.length ? p.reviews.map(r => `
                <div class="review-card">
                  <div class="flex-between mb-8">
                    <div>
                      <div class="review-author">${esc(r.user_name)}</div>
                      <div class="stars" style="font-size:.9rem">${'★'.repeat(r.rating)}${'☆'.repeat(5-r.rating)}</div>
                    </div>
                    <div class="review-date">${fmtDate(r.created_at)}</div>
                  </div>
                  ${r.comment ? `<p style="color:#555;font-size:.93rem">${esc(r.comment)}</p>` : ''}
                  ${(() => { const reviewImgs = (r.images || []).map(u => safeMediaUrl(u)).filter(Boolean); return reviewImgs.length ? `<div class="review-photos">${reviewImgs.map((im,i) => `<img src="${im}" alt="Photo from ${esc(r.user_name)}'s review" class="review-photo" data-csp-onclick="openLightbox(JSON.parse(decodeURIComponent('${encodeURIComponent(JSON.stringify(reviewImgs))}')),${i})" />`).join('')}</div>` : ''; })()}
                </div>`).join('') : '<div class="empty-state" style="padding:40px 0"><i class="fas fa-star"></i><h3>No reviews yet</h3><p>Be the first to review this product</p></div>'}
            </div>
          </div>
        </div>
      </div>`;

    saveRecentlyViewed(p, imgs[0]);

    // ── Image lightbox ────────────────────────────────────────────────────────
    document.querySelectorAll('.main-img-slide img').forEach(el =>
      el.addEventListener('click', () => openLightbox(imgs, curImgIdx))
    );
    document.querySelectorAll('.thumb img').forEach((el, i) =>
      el.addEventListener('click', () => openLightbox(imgs, i))
    );

    // ── Complete the Look ─────────────────────────────────────────────────────
    if (p.category_id) {
      fillProductRail('ctl-products', {
        categoryId: p.category_id,
        excludeIds: [p.id],
        includeRecent: false,
        fallbackNewest: false,
        limit: 4,
        emptyHtml: '<div class="merch-empty"><i class="fas fa-box-open"></i><h3>No matching products yet</h3><p>New items are being added to this category.</p></div>',
      }).then(items => {
        if (!items.length) document.getElementById('ctl-section')?.style?.setProperty('display', 'none');
      });
    }
    fillProductRail('recent-product-rail', {
      excludeIds: [p.id],
      includeRecent: true,
      fallbackNewest: false,
      limit: 4,
      emptyHtml: '<div class="merch-empty"><i class="fas fa-clock"></i><h3>No recent products yet</h3><p>Browse a few products and they will appear here.</p></div>',
    }).then(items => {
      if (!items.length) document.getElementById('recent-product-section')?.style?.setProperty('display', 'none');
    });

    // ── Sticky Add-to-Cart bar ────────────────────────────────────────────────
    const stickyBar = document.createElement('div');
    stickyBar.id = 'sticky-atc';
    stickyBar.className = 'sticky-atc';
    stickyBar.innerHTML = `
      <div style="min-width:0;flex:1">
        <div style="font-weight:700;font-size:.9rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(p.name)}</div>
        <div style="font-size:.88rem;color:var(--primary);font-weight:700">${fmt(p.price)}${hasVariants ? ' · Select color & size' : ''}</div>
      </div>
      ${unavailable
        ? `<button class="btn btn-lg" disabled style="background:#eee;color:#999;border:1px solid #ddd;cursor:not-allowed">Out of Stock</button>`
        : `<button class="btn btn-primary btn-lg" id="sticky-atc-btn" data-csp-onclick="addToCartDetail()"><i class="fas fa-cart-plus"></i> Add to Cart</button>`}`;
    document.body.appendChild(stickyBar);

    const purchaseControls = document.getElementById('atc-btn')?.closest('div') || document.querySelector('.product-detail-info');
    if (purchaseControls) {
      new IntersectionObserver(
        ([entry]) => {
          const hasScrolledPastControls = entry.boundingClientRect.bottom < 0;
          stickyBar.classList.toggle('visible', !entry.isIntersecting && hasScrolledPastControls);
        },
        { threshold: 0 }
      ).observe(purchaseControls);
    }

    // ── JSON-LD structured data ──────────────────────────────────────────────
    const ldScript = document.createElement('script');
    ldScript.type = 'application/ld+json';
    ldScript.textContent = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: p.name,
      description: p.description || `Buy ${p.name} at Adhya Shakti Shop.`,
      image: imgs.map(absoluteSiteUrl),
      url: absoluteSiteUrl(location.pathname),
      brand: { '@type': 'Brand', name: 'Adhya Shakti Shop' },
      ...(p.sku ? { sku: String(p.sku) } : {}),
      offers: {
        '@type': 'Offer',
        priceCurrency: 'USD',
        price: p.price,
        availability: 'https://schema.org/' + (unavailable ? 'OutOfStock' : 'InStock'),
        itemCondition: 'https://schema.org/NewCondition',
        seller: { '@type': 'Organization', name: 'Adhya Shakti Shop' },
      },
      ...(p.reviews?.length ? {
        aggregateRating: {
          '@type': 'AggregateRating',
          ratingValue: avgRating,
          reviewCount: p.reviews.length,
        },
      } : {}),
    });
    document.head.appendChild(ldScript);

    // ── Size guide modal ──────────────────────────────────────────────────────
    window.openSizeGuide = () => {
      openModal(`
        <div style="padding:8px">
          <h3 style="font-family:Georgia,serif;margin-bottom:4px;color:var(--primary)">Size Guide — US Unisex</h3>
          <p style="font-size:.82rem;color:var(--text-light);margin-bottom:16px">Measurements are in inches. When in doubt, size up.</p>
          <div style="overflow-x:auto">
            <table style="width:100%;border-collapse:collapse;font-size:.88rem">
              <thead>
                <tr style="background:var(--primary);color:#fff">
                  <th style="padding:9px 14px;text-align:left">Size</th>
                  <th style="padding:9px 14px;text-align:left">Chest</th>
                  <th style="padding:9px 14px;text-align:left">Waist</th>
                  <th style="padding:9px 14px;text-align:left">Hip</th>
                  <th style="padding:9px 14px;text-align:left">Height</th>
                </tr>
              </thead>
              <tbody>
                ${[
                  ['XS','32–34','26–28','34–36','5\'0–5\'4"'],
                  ['S','34–36','28–30','36–38','5\'2–5\'7"'],
                  ['M','38–40','32–34','40–42','5\'5–5\'9"'],
                  ['L','42–44','36–38','44–46','5\'7–6\'0"'],
                  ['XL','46–48','40–42','48–50','5\'9–6\'2"'],
                  ['2XL','50–52','44–46','52–54','5\'11–6\'4"'],
                ].map((r,i) => `<tr style="${i%2?'background:var(--bg)':''}"><td style="padding:9px 14px;font-weight:700;color:var(--primary)">${r[0]}</td><td style="padding:9px 14px">${r[1]}"</td><td style="padding:9px 14px">${r[2]}"</td><td style="padding:9px 14px">${r[3]}"</td><td style="padding:9px 14px">${r[4]}</td></tr>`).join('')}
              </tbody>
            </table>
          </div>
          <p style="font-size:.8rem;color:var(--text-light);margin-top:14px"><i class="fas fa-info-circle" style="color:var(--primary);margin-right:5px"></i>Measurements are body measurements, not garment measurements. Not sure? <a href="/contact" data-link data-csp-onclick="closeModal()">Contact us</a> and we'll help you pick the right size.</p>
          <div style="text-align:right;margin-top:16px">
            <button class="btn btn-primary" data-csp-onclick="closeModal()">Got it</button>
          </div>
        </div>`);
    };

    // ── Custom print state ────────────────────────────────────────────────────
    const isCustom = !!p.allow_custom_print;
    let printPlacement = null;
    let printImages = { front: [], back: [] };

    window.selectPlacement = (side) => {
      printPlacement = side;
      ['front','back','both'].forEach(s => {
        const btn = document.getElementById('place-' + s);
        if (!btn) return;
        btn.style.borderColor = s === side ? 'var(--primary)' : 'var(--border)';
        btn.style.background = s === side ? 'var(--primary)' : '#fff';
        btn.style.color = s === side ? '#fff' : 'var(--text)';
      });
      document.getElementById('upload-front').style.display = (side === 'front' || side === 'both') ? 'block' : 'none';
      document.getElementById('upload-back').style.display  = (side === 'back'  || side === 'both') ? 'block' : 'none';
      document.getElementById('both-price-note').style.display = side === 'both' ? 'block' : 'none';
      // Update displayed price
      const priceEl = document.querySelector('.price-big');
      if (priceEl) priceEl.textContent = fmt(p.price + (side === 'both' ? 8.99 : 0));
    };

    window.handlePrintUpload = async (side, input) => {
      const existing = printImages[side] || [];
      const remaining = 3 - existing.length;
      if (remaining <= 0) { toast('Maximum 3 images per side allowed', 'warning'); input.value = ''; return; }
      const files = Array.from(input.files).slice(0, remaining);
      const previewEl = document.getElementById('preview-' + side);
      for (const file of files) {
        try {
          const res = await api.upload(file);
          printImages[side].push(res.url);
          const wrap = document.createElement('div');
          wrap.style.cssText = 'position:relative;display:inline-block';
          wrap.dataset.url = res.url;
          wrap.innerHTML = `
            <img src="${res.url}" alt="Uploaded print design" style="width:72px;height:72px;object-fit:cover;border-radius:6px;border:2px solid var(--primary)" />
            <button data-csp-onclick="removePrintImg('${side}',this.closest('[data-url]'))"
              style="position:absolute;top:-6px;right:-6px;width:20px;height:20px;border-radius:50%;background:#e53;color:#fff;border:none;cursor:pointer;font-size:.75rem;line-height:1;display:flex;align-items:center;justify-content:center">×</button>`;
          previewEl.appendChild(wrap);
        } catch (e) { toast('Upload failed: ' + e.message, 'error'); }
      }
      input.value = '';
    };

    // Uses DOM dataset to find the correct URL — avoids stale index issues
    window.removePrintImg = (side, el) => {
      const url = el.dataset.url;
      printImages[side] = printImages[side].filter(u => u !== url);
      el.remove();
    };

    // ── Variant selection state ───────────────────────────────────────────────
    let selectedColor = null, selectedSize = null;
    const setPurchaseEnabled = (enabled) => {
      ['atc-btn', 'sticky-atc-btn'].forEach(id => {
        const btn = document.getElementById(id);
        if (btn) btn.disabled = !enabled;
      });
    };
    const syncPurchaseState = () => {
      if (unavailable) { setPurchaseEnabled(false); return; }
      if (!hasVariants) { setPurchaseEnabled(true); return; }
      const stock = selectedColor && selectedSize ? (variantMap[selectedColor]?.[selectedSize] || 0) : 0;
      setPurchaseEnabled(selectedColor && selectedSize ? stock > 0 : true);
    };

    const renderSizeOptions = (color = null) => {
      const sizeOpts = document.getElementById('size-options');
      if (!sizeOpts) return;
      const colorSizes = color ? (variantMap[color] || {}) : {};
      const displaySizes = variantSizes.length ? variantSizes : Object.keys(colorSizes);
      sizeOpts.innerHTML = displaySizes.map(s => {
        const hasColor = !!color;
        const stock = hasColor ? (colorSizes[s] !== undefined ? colorSizes[s] : 0) : 0;
        const oos = hasColor && stock <= 0;
        const pendingColor = !hasColor;
        return `<button type="button" data-size-option="${esc(s)}" ${oos ? 'disabled' : ''}
          aria-disabled="${oos ? 'true' : 'false'}" aria-pressed="false"
          id="size-btn-${esc(String(s).replace(/[^a-z0-9_-]/gi, '-'))}"
          style="min-width:48px;padding:6px 12px;border:2px solid ${pendingColor || oos ? '#ddd' : 'var(--border)'};
            border-radius:6px;background:${pendingColor || oos ? '#f7f7f7' : '#fff'};
            color:${pendingColor || oos ? '#999' : 'var(--text)'};
            cursor:${oos ? 'not-allowed' : 'pointer'};
            font-size:.88rem;font-weight:600;position:relative;transition:all .15s"
          title="${pendingColor ? 'Select a color first to check this size' : oos ? 'Out of stock for ' + color : stock + ' available in ' + color}">
          ${esc(s)}
          ${oos ? `<span style="position:absolute;top:50%;left:50%;width:80%;height:1px;background:#bbb;transform:translate(-50%,-50%) rotate(-20deg)"></span>` : ''}
        </button>`;
      }).join('');
      sizeOpts.querySelectorAll('[data-size-option]').forEach(btn => {
        btn.addEventListener('click', () => window.selectSize(btn.dataset.sizeOption));
      });
    };

    window.selectColor = (color) => {
      selectedColor = color;
      selectedSize = null;

      // Update color buttons
      document.querySelectorAll('[data-color-option]').forEach(btn => {
        const c = btn.dataset.colorOption;
        const active = c === color;
        btn.style.borderColor = active ? 'var(--primary)' : 'var(--border)';
        btn.style.background = active ? 'var(--bg)' : '#fff';
        btn.style.fontWeight = active ? '700' : '400';
        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
      document.getElementById('selected-color-label').textContent = color;

      // Render sizes for selected color
      renderSizeOptions(color);

      document.getElementById('variant-stock-info').innerHTML =
        `<i class="fas fa-info-circle" style="color:var(--primary);margin-right:6px"></i>Select a size for ${esc(color)}. Unavailable sizes are greyed out.`;
      document.getElementById('selected-size-label').textContent = '— select a size';
      syncPurchaseState();
    };

    window.selectSize = (size) => {
      if (!selectedColor) {
        toast('Please select a color first to check size availability.', 'warning');
        const stockInfo = document.getElementById('variant-stock-info');
        if (stockInfo) {
          stockInfo.innerHTML = '<i class="fas fa-info-circle" style="color:var(--warning);margin-right:6px"></i>Choose a color first, then select your size.';
        }
        document.getElementById('selected-color-label')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      const stock = (variantMap[selectedColor] || {})[size] || 0;
      if (stock <= 0) {
        toast(`Size ${size} is not available in ${selectedColor}.`, 'warning');
        return;
      }
      selectedSize = size;

      // Update size buttons
      document.querySelectorAll('[data-size-option]').forEach(btn => {
        const s = btn.dataset.sizeOption;
        const sStock = (variantMap[selectedColor] || {})[s] || 0;
        if (sStock === 0) return; // keep oos styling
        const active = s === size;
        btn.style.borderColor = active ? 'var(--primary)' : 'var(--border)';
        btn.style.background = active ? 'var(--primary)' : '#fff';
        btn.style.color = active ? '#fff' : 'var(--text)';
        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
      });

      document.getElementById('selected-size-label').textContent = size;
      document.getElementById('detail-qty').max = stock;
      document.getElementById('detail-qty').value = Math.min(parseInt(document.getElementById('detail-qty').value) || 1, stock);

      const stockInfo = document.getElementById('variant-stock-info');
      stockInfo.innerHTML = stock > 0
        ? `<i class="fas fa-check-circle" style="color:#2e7d32;margin-right:6px"></i><span style="color:#2e7d32;font-weight:600">${stock} in stock</span>`
        : `<i class="fas fa-times-circle" style="color:#e53;margin-right:6px"></i><span style="color:#e53;font-weight:600">Out of Stock</span>`;

      syncPurchaseState();
    };

    let curImgIdx = 0;
    const imgTrack = document.getElementById('main-img-track');
    window.goToProductImage = (i) => {
      curImgIdx = (i + imgs.length) % imgs.length;
      imgTrack.style.transform = `translateX(-${curImgIdx * 100}%)`;
      document.querySelectorAll('.thumb').forEach((t, idx) => t.classList.toggle('active', idx === curImgIdx));
    };

    if (imgTrack) {
      document.getElementById('main-img-prev')?.addEventListener('click', () => goToProductImage(curImgIdx - 1));
      document.getElementById('main-img-next')?.addEventListener('click', () => goToProductImage(curImgIdx + 1));

      let touchStartX = 0, touchDeltaX = 0, dragging = false;
      imgTrack.addEventListener('touchstart', e => {
        touchStartX = e.touches[0].clientX; dragging = true;
        imgTrack.style.transition = 'none';
      }, { passive: true });
      imgTrack.addEventListener('touchmove', e => {
        if (!dragging) return;
        touchDeltaX = e.touches[0].clientX - touchStartX;
        imgTrack.style.transform = `translateX(calc(-${curImgIdx * 100}% + ${touchDeltaX}px))`;
      }, { passive: true });
      imgTrack.addEventListener('touchend', () => {
        dragging = false;
        imgTrack.style.transition = '';
        if (Math.abs(touchDeltaX) > 40) goToProductImage(curImgIdx + (touchDeltaX < 0 ? 1 : -1));
        else goToProductImage(curImgIdx);
        touchDeltaX = 0;
      });
    }

    window.changeDetailQty = (d) => {
      const inp = document.getElementById('detail-qty');
      const maxStock = selectedColor && selectedSize
        ? (variantMap[selectedColor]?.[selectedSize] || 0)
        : Math.max(0, Number(p.stock || 0));
      if (maxStock <= 0) { inp.value = 1; return; }
      inp.value = Math.max(1, Math.min(maxStock, (parseInt(inp.value) || 1) + d));
    };

    window.addToCartDetail = () => {
      if (unavailable) { toast('This product is out of stock', 'warning'); return false; }
      if (hasVariants && !selectedColor) {
        toast('Please select a color first.', 'warning'); return false;
      }
      if (hasVariants && !selectedSize) {
        toast('Please select a size.', 'warning'); return false;
      }
      if (hasVariants && (variantMap[selectedColor]?.[selectedSize] || 0) <= 0) {
        toast('This size is not available in the selected color.', 'warning'); return false;
      }
      // Custom print validation
      if (isCustom) {
        if (!printPlacement) { toast('Please select a print placement (Front, Back, or Both)', 'warning'); return false; }
        if ((printPlacement === 'front' || printPlacement === 'both') && printImages.front.length === 0) {
          toast('Please upload at least one image for the Front design', 'warning'); return false;
        }
        if ((printPlacement === 'back' || printPlacement === 'both') && printImages.back.length === 0) {
          toast('Please upload at least one image for the Back design', 'warning'); return false;
        }
      }
      const qty = parseInt(document.getElementById('detail-qty')?.value) || 1;
      const variation = hasVariants ? `${selectedColor} / ${selectedSize}` : null;
      const customPrint = isCustom ? {
        placement: printPlacement,
        front_images: [...printImages.front],
        back_images: [...printImages.back],
        extra_charge: printPlacement === 'both' ? 8.99 : 0,
      } : null;
      Cart.add(p, qty, variation, customPrint);
      return true;
    };

    window.buyNow = () => {
      if (addToCartDetail()) Router.navigate('/cart');
    };

    window.requestBackInStock = async () => {
      const emailEl = document.getElementById('bis-email');
      const btn = document.getElementById('bis-btn');
      const msg = document.getElementById('bis-msg');
      const email = (emailEl?.value || '').trim();
      if (!email || !email.includes('@')) {
        toast('Please enter a valid email address.', 'warning');
        if (msg) { msg.style.color = '#b45309'; msg.textContent = 'Please enter a valid email address.'; }
        emailEl?.focus();
        return;
      }
      if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...'; }
      try {
        const res = await api.post(`/products/${p.id}/back-in-stock`, {
          email,
          name: viewer?.name || '',
        });
        toast(res.message || "You're on the list.", 'success');
        if (msg) {
          msg.style.color = 'var(--success)';
          msg.textContent = res.message || "You're on the list. We'll email you when it is available again.";
        }
        if (btn) btn.innerHTML = '<i class="fas fa-check"></i> Requested';
      } catch (e) {
        toast(e.message, 'error');
        if (msg) { msg.style.color = '#b91c1c'; msg.textContent = e.message; }
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-envelope"></i> Notify Me'; }
      }
    };

    // Keep sizes visible before color selection so customers understand the buying flow.
    if (hasVariants) renderSizeOptions();
    syncPurchaseState();
    document.querySelectorAll('[data-color-option]').forEach(btn => {
      btn.addEventListener('click', () => window.selectColor(btn.dataset.colorOption));
    });

    window.openReviewModal = (pid) => {
      let reviewImages = [];
      const overlay = openModal(`
        <div class="modal-header"><h3>Write a Review</h3><button class="modal-close" data-csp-onclick="closeModal()" aria-label="Close">×</button></div>
        <div class="modal-body">
          <div class="form-group">
            <div class="form-label">Rating</div>
            <div class="star-rating" id="star-input">
              ${[1,2,3,4,5].map(n => `<span class="star fas fa-star" data-val="${n}"></span>`).join('')}
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Comment</label>
            <textarea class="form-control" id="review-comment" placeholder="Share your experience..."></textarea>
          </div>
          <div class="form-group">
            <label class="form-label">Add Photos <span style="font-weight:400;color:var(--text-light);font-size:.82rem">(optional, up to 3)</span></label>
            <div style="border:2px dashed var(--border);border-radius:8px;padding:12px;text-align:center;cursor:pointer;background:var(--bg)" data-csp-onclick="document.getElementById('review-photo-input').click()">
              <i class="fas fa-camera" style="font-size:1.4rem;color:var(--text-light);margin-bottom:4px;display:block"></i>
              <div style="font-size:.82rem;color:var(--text-light)">Click to upload photos</div>
            </div>
            <input type="file" id="review-photo-input" accept=".jpg,.jpeg,.png,.webp" multiple style="display:none" data-csp-onchange="handleReviewPhoto(this)" />
            <div id="review-photo-preview" class="review-photos"></div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" data-csp-onclick="closeModal()">Cancel</button>
          <button class="btn btn-primary" data-csp-onclick="submitReview('${pid}')">Submit Review</button>
        </div>`);
      // Focus trap
      const focusable = [...overlay.querySelectorAll('button,input,textarea,[tabindex]:not([tabindex="-1"])')].filter(el => !el.disabled);
      const first = focusable[0]; const last = focusable[focusable.length - 1];
      setTimeout(() => first?.focus(), 50);
      overlay.addEventListener('keydown', e => {
        if (e.key === 'Escape') { overlay.remove(); return; }
        if (e.key !== 'Tab') return;
        if (e.shiftKey ? document.activeElement === first : document.activeElement === last) {
          e.preventDefault(); (e.shiftKey ? last : first)?.focus();
        }
      });
      let selectedRating = 0;
      const stars = document.querySelectorAll('#star-input .star');
      const paintStars = (n) => stars.forEach((s, i) => s.classList.toggle('active', i < n));
      stars.forEach((s, idx) => {
        s.addEventListener('mouseover', () => paintStars(idx + 1));
        s.addEventListener('mouseout',  () => paintStars(selectedRating));
        s.addEventListener('click',     () => { selectedRating = idx + 1; paintStars(selectedRating); });
      });
      window.setStarRating = (n) => { selectedRating = n; paintStars(n); };
      window.handleReviewPhoto = async (input) => {
        const remaining = 3 - reviewImages.length;
        if (remaining <= 0) { toast('Max 3 photos per review', 'warning'); input.value = ''; return; }
        const files = Array.from(input.files).slice(0, remaining);
        const preview = document.getElementById('review-photo-preview');
        for (const file of files) {
          try {
            const res = await api.upload(file);
            reviewImages.push(res.url);
            const img = document.createElement('img');
            img.src = res.url; img.className = 'review-photo';
            img.onclick = () => openLightbox(reviewImages, reviewImages.indexOf(res.url));
            if (preview) preview.appendChild(img);
          } catch (e) { toast('Photo upload failed: ' + e.message, 'error'); }
        }
        input.value = '';
      };

      window.submitReview = async (pid) => {
        if (!selectedRating) { toast('Please select a rating', 'warning'); return; }
        const btn = overlay.querySelector('.modal-footer .btn-primary');
        if (btn) { btn.disabled = true; btn.textContent = 'Submitting...'; }
        try {
          await api.post(`/products/${pid}/reviews`, {
            rating: selectedRating,
            comment: document.getElementById('review-comment').value,
            images: reviewImages,
          });
          toast('Review submitted!', 'success'); closeModal(); Router.render(location.pathname);
        } catch (e) {
          toast(e.message, 'error');
          if (btn) { btn.disabled = false; btn.textContent = 'Submit Review'; }
        }
      };
    };
  } catch (e) {
    if (Router.stale(_gen)) return;
    app.innerHTML = `<div class="container section empty-state"><i class="fas fa-exclamation-circle"></i><h3>Product not found</h3><p>${esc(e.message)}</p><a href="/products" data-link class="btn btn-primary mt-16">Browse Products</a></div>`;
  }
});
