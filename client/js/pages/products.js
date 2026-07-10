Router.register('/jewelry', async () => {
  const _gen = Router._gen;
  try {
    const tree = await api.get('/category-tree');
    if (Router.stale(_gen)) return;
    const cat = ((tree && (tree.categories || tree.types)) || []).find(c => /jewel/i.test(c.name));
    Router.navigate(cat ? `/products?category=${cat.id}` : '/products');
  } catch {
    if (!Router.stale(_gen)) Router.navigate('/products');
  }
});



Router.register('/products', async (params) => {
  const _gen = Router._gen;
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="page">
      <div class="container" style="padding-top:24px">
        <div class="breadcrumb">
          <a href="/" data-link>Home</a><span class="sep">/</span><span>Products</span>
        </div>
        <div class="shop-page-intro">
          <div>
            <div class="shop-page-kicker">Shop</div>
            <h1 id="products-title">All Products</h1>
            <p id="products-subtitle">Browse jewelry, clothing, custom items, and gifts from Adhya Shakti Shop.</p>
          </div>
        </div>
        <div id="cat-filter-bar" class="cat-pill-bar"></div>
        <div class="filter-bar">
          <select id="sort-filter" data-csp-onchange="applyFilters()">
            <option value="newest">Newest First</option>
            <option value="price_asc">Price: Low to High</option>
            <option value="price_desc">Price: High to Low</option>
          </select>
          <input type="text" id="search-box" class="form-control" style="max-width:260px" placeholder="Search products..." value="${params.search || ''}" data-csp-onkeydown="if(event.key==='Enter')applyFilters()" />
          <span class="results-count" id="results-count"></span>
        </div>
        <div id="shop-context-panel" class="shop-context-panel" style="display:none"></div>
        <div id="products-grid" class="grid-4"><div class="spinner"></div></div>
        <div id="pagination"></div>
      </div>
    </div>`;

  let currentPage = parseInt(params.page) || 1;
  let currentCat = params.category || '';
  let currentSearch = params.search || '';
  let allCats = [];
  let categoryTree = { categories: [] };

  const cleanText = value => String(value || '').replace(/\s+/g, ' ').trim();
  const absoluteUrl = path => {
    try { return new URL(path || '/', location.origin).href; } catch { return location.origin + '/'; }
  };
  const selectedCategory = () => allCats.find(c => c.id === currentCat) || null;
  function setMeta(sel, val) {
    const el = document.querySelector(sel);
    if (el) el.setAttribute('content', val);
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

  function setProductsMeta(title, description, canonicalPath) {
    const desc = cleanText(description).slice(0, 155);
    const fullTitle = `${title} — Adhya Shakti Shop`;
    const canonical = absoluteUrl(canonicalPath || '/products');
    document.title = fullTitle;
    setMeta('meta[name="description"]', desc);
    setMeta('meta[name="robots"]', 'index,follow');
    setMeta('meta[property="og:type"]', 'website');
    setMeta('meta[property="og:title"]', fullTitle);
    setMeta('meta[property="og:description"]', desc);
    setMeta('meta[property="og:url"]', canonical);
    setMeta('meta[property="og:image"]', absoluteUrl('/images/logo-main.png'));
    setMeta('meta[property="og:image:alt"]', 'Adhya Shakti Shop');
    setMeta('meta[name="twitter:card"]', 'summary_large_image');
    setMeta('meta[name="twitter:title"]', fullTitle);
    setMeta('meta[name="twitter:description"]', desc);
    setMeta('meta[name="twitter:image"]', absoluteUrl('/images/logo-main.png'));
    ensureCanonical(canonical);
  }

  function categoryDescription(cat, total = null) {
    const label = cat?.path_label || cat?.name || 'products';
    const countText = total === null ? 'Shop' : `Shop ${total} ${total === 1 ? 'item' : 'items'} in`;
    const lower = label.toLowerCase();
    if (/jewel/.test(lower)) return `${countText} ${label}: necklaces, earrings, bracelets, sets, and gift-ready pieces from Adhya Shakti Shop.`;
    if (/custom|print/.test(lower)) return `${countText} ${label}: personalized apparel and gifts with secure checkout and support before ordering.`;
    if (/cloth|shirt|polo|hood|co-ord|women|men/.test(lower)) return `${countText} ${label}: clothing options with clear color, size, stock, and product details.`;
    return `${countText} ${label}: curated products, secure checkout, and shipping from New Jersey.`;
  }

  function renderShopContext(total = null) {
    const panel = document.getElementById('shop-context-panel');
    if (!panel) return;
    const cat = selectedCategory();
    const active = [];
    if (cat) active.push(`<span><i class="fas ${categoryIcon(cat.name)}"></i>${esc(cat.path_label || cat.name)}</span>`);
    if (currentSearch) active.push(`<span><i class="fas fa-search"></i>${esc(currentSearch)}</span>`);
    const totalText = total === null ? 'Products update as you shop.' : `${total} product${total === 1 ? '' : 's'} available.`;
    const desc = cat ? categoryDescription(cat, total) : 'Browse jewelry, clothing, custom items, and gifts with secure checkout and support from a small New Jersey shop.';
    panel.style.display = 'none';
    panel.innerHTML = `
      <div class="shop-context-copy">
        <div class="shop-context-title">${cat ? esc(cat.path_label || cat.name) : 'Shop With Confidence'}</div>
        <p>${esc(desc)}</p>
        <div class="shop-context-trust">
          <span><i class="fas fa-lock"></i> Secure checkout</span>
          <span><i class="fas fa-truck"></i> Ships from New Jersey</span>
          <span><i class="fas fa-envelope"></i> Help before ordering</span>
        </div>
      </div>
      <div class="shop-context-side">
        <div class="shop-context-count">${esc(totalText)}</div>
        ${active.length ? `<div class="active-filter-list">${active.join('')}</div>
          <button class="btn btn-ghost btn-sm" id="clear-product-filters" type="button"><i class="fas fa-xmark"></i> Clear filters</button>` : ''}
      </div>`;
    document.getElementById('clear-product-filters')?.addEventListener('click', () => {
      currentCat = '';
      currentSearch = '';
      currentPage = 1;
      const search = document.getElementById('search-box');
      if (search) search.value = '';
      buildCatFilter(allCats, '');
      loadProducts();
    });
  }

  function updateProductListJsonLd(products) {
    document.getElementById('products-list-jsonld')?.remove();
    if (!products || !products.length) return;
    const itemList = {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: selectedCategory()?.path_label || (currentSearch ? `Search results for ${currentSearch}` : 'Adhya Shakti Shop products'),
      itemListElement: products.slice(0, 12).map((p, idx) => ({
        '@type': 'ListItem',
        position: idx + 1,
        url: absoluteUrl(`/product/${encodeURIComponent(p.id)}`),
        name: p.name,
      })),
    };
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.id = 'products-list-jsonld';
    script.textContent = JSON.stringify(itemList);
    document.head.appendChild(script);
  }

  function categoryGroups() {
    return activeCategoryTree(categoryTree).map(root => ({
      label: root.name,
      icon: categoryIcon(root.name),
      typeId: root.id,
      node: root,
      subs: collectDescendants(root),
    }));
  }

  function collectDescendants(node, prefix = '') {
    const out = [];
    categoryChildren(node).forEach(child => {
      const label = prefix ? `${prefix} / ${child.name}` : child.name;
      out.push({ label, id: child.id, node: child });
      out.push(...collectDescendants(child, label));
    });
    return out;
  }

  function updatePageIntro(total = null) {
    const titleEl = document.getElementById('products-title');
    const subEl = document.getElementById('products-subtitle');
    if (!titleEl || !subEl) return;

    const matchedCat = selectedCategory();
    if (currentSearch) {
      titleEl.textContent = 'Search results';
      subEl.textContent = `Showing ${total === null ? 'products' : total + ' product' + (total === 1 ? '' : 's')} matching "${currentSearch}".`;
      setProductsMeta(`Search results for ${currentSearch}`, `Shop products matching ${currentSearch} at Adhya Shakti Shop. Jewelry, clothing, custom gifts, and more from New Jersey.`, '/products');
      renderShopContext(total);
      return;
    }

    if (matchedCat) {
      titleEl.textContent = matchedCat.name || 'Products';
      subEl.textContent = categoryDescription(matchedCat, total);
      setProductsMeta(matchedCat.path_label || matchedCat.name, categoryDescription(matchedCat, total), `/products?category=${encodeURIComponent(matchedCat.id)}`);
      renderShopContext(total);
      return;
    }

    titleEl.textContent = 'All Products';
    subEl.textContent = 'Browse jewelry, clothing, custom items, and gifts from Adhya Shakti Shop.';
    setProductsMeta('Products', 'Browse jewelry, clothing, custom items, and gifts from Adhya Shakti Shop. Secure checkout and shipping from New Jersey.', '/products');
    renderShopContext(total);
  }

  function buildCatFilter(cats, activeCat) {
    const bar = document.getElementById('cat-filter-bar');
    if (!bar) return;
    bar.innerHTML = '';

    // All button
    const allBtn = document.createElement('button');
    allBtn.className = 'cat-pill' + (!activeCat ? ' active' : '');
    allBtn.textContent = 'All';
    allBtn.onclick = () => { currentCat = ''; currentPage = 1; loadProducts(); buildCatFilter(cats, ''); };
    bar.appendChild(allBtn);

    categoryGroups().forEach(group => {
      const headId = group.typeId;
      if (!headId) return;

      const availSubs = group.subs
        .filter(s => s.id && (categorySubtreeCount(s.node) > 0 || s.id === activeCat));

      // Hide categories with no live products (unless it's the currently active filter).
      if (categorySubtreeCount(group.node) === 0 && headId !== activeCat && !availSubs.length) return;

      const isGroupActive = activeCat === headId || availSubs.some(s => s.id === activeCat);
      const wrap = document.createElement('div');
      wrap.className = 'cat-pill-group';

      const btn = document.createElement('button');
      btn.className = 'cat-pill' + (isGroupActive ? ' active' : '');
      btn.innerHTML = `<i class="fas ${group.icon}" style="font-size:.75rem"></i> ${group.label}` +
        (availSubs.length ? ` <i class="fas fa-chevron-down" style="font-size:.6rem;opacity:.65"></i>` : '');
      btn.onclick = () => {
        if (availSubs.length && window.innerWidth <= 900) {
          const wasOpen = wrap.classList.contains('open');
          bar.querySelectorAll('.cat-pill-group.open').forEach(el => { if (el !== wrap) el.classList.remove('open'); });
          wrap.classList.toggle('open', !wasOpen);
          return;
        }
        currentCat = headId; currentPage = 1; loadProducts(); buildCatFilter(cats, headId);
      };
      wrap.appendChild(btn);

      if (availSubs.length) {
        const flyout = document.createElement('div');
        flyout.className = 'cat-pill-flyout';
        // "All <group>" entry so mobile users (where tapping the pill only opens
        // this flyout) can still filter by the whole parent category.
        const allItem = document.createElement('button');
        allItem.className = 'cat-pill-flyout-item' + (activeCat === headId ? ' active' : '');
        allItem.innerHTML = `<strong>All ${esc(group.label)}</strong>`;
        allItem.onclick = e => {
          e.stopPropagation();
          currentCat = headId;
          currentPage = 1;
          loadProducts();
          buildCatFilter(cats, headId);
        };
        flyout.appendChild(allItem);
        availSubs.forEach(sub => {
          const item = document.createElement('button');
          item.className = 'cat-pill-flyout-item' + (activeCat === sub.id ? ' active' : '');
          item.textContent = sub.label;
          item.onclick = e => {
            e.stopPropagation();
            currentCat = sub.id;
            currentPage = 1;
            loadProducts();
            buildCatFilter(cats, sub.id);
          };
          flyout.appendChild(item);
        });
        wrap.appendChild(flyout);
      }

      bar.appendChild(wrap);
    });
  }

  // Load categories and build pill filter
  try {
    const tree = await api.get('/category-tree').catch(() => ({ categories: [] }));
    categoryTree = tree || { categories: [] };
    allCats = flattenCategoryTree(categoryTree);
    buildCatFilter(allCats, currentCat);
    updatePageIntro();
  } catch {}

  window.applyFilters = () => {
    currentSearch = document.getElementById('search-box').value;
    currentPage = 1;
    loadProducts();
  };

  async function loadProducts() {
    const grid = document.getElementById('products-grid');
    grid.innerHTML = '<div class="spinner"></div>';
    const sort = document.getElementById('sort-filter')?.value || 'newest';
    try {
      let url = `/products?page=${currentPage}&per_page=12&sort=${sort}`;
      if (currentCat) url += `&category=${currentCat}`;
      if (currentSearch) url += `&search=${encodeURIComponent(currentSearch)}`;
      const { products, total } = await api.get(url);
      if (Router.stale(_gen)) return;

      document.getElementById('results-count').textContent = `${total} product${total !== 1 ? 's' : ''} found`;
      updatePageIntro(total);
      updateProductListJsonLd(products);

      if (!products.length) {
        const matchedCat = allCats.find(c => c.id === currentCat);
        const pathNames = (matchedCat?.path_names || [matchedCat?.name || '']).map(n => String(n).toLowerCase());
        const isCustomRelated = pathNames.some(n => n === 'custom' || /custom|print/.test(n));
        const isClothingRelated = pathNames.includes('clothing');
        if (isClothingRelated || isCustomRelated) {
          const dest = isCustomRelated ? '/custom-printing' : '/clothing';
          grid.innerHTML = `<div class="empty-state product-empty-state" style="grid-column:1/-1"><i class="fas fa-clock"></i><h3>Coming Soon</h3><p>This category isn't available yet — <a href="${dest}" data-link>see details and get notified</a>.</p><a href="/products" data-link class="btn btn-primary btn-sm mt16">Browse available products</a></div>`;
        } else {
          grid.innerHTML = `
            <div class="empty-state product-empty-state" style="grid-column:1/-1">
              <i class="fas fa-search"></i>
              <h3>No products found${currentSearch ? ` for “${esc(currentSearch)}”` : ''}</h3>
              <p>Try a different search or category.</p>
              <button class="btn btn-primary btn-sm mt16" id="empty-clear-product-filters" type="button">Clear filters</button>
            </div>
            <div style="grid-column:1/-1;margin-top:8px">
              <div class="text-center mb-16">
                <div style="font-size:.78rem;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:var(--gold);margin-bottom:6px">While You're Here</div>
                <h3 style="font-size:1.25rem;font-weight:800;font-family:Georgia,serif">Popular Right Now</h3>
              </div>
              <div id="empty-search-rail" class="grid-4 merch-grid"><div class="spinner"></div></div>
            </div>`;
          document.getElementById('empty-clear-product-filters')?.addEventListener('click', () => {
            currentCat = '';
            currentSearch = '';
            currentPage = 1;
            const search = document.getElementById('search-box');
            if (search) search.value = '';
            buildCatFilter(allCats, '');
            loadProducts();
          });
          fillProductRail('empty-search-rail', { includeRecent: true, fallbackNewest: true, limit: 4 });
        }
      } else {
        grid.innerHTML = products.map(productCard).join('');
      }

      const totalPages = Math.ceil(total / 12);
      const pag = document.getElementById('pagination');
      if (totalPages > 1) {
        pag.innerHTML = `<div class="pagination">
          ${currentPage > 1 ? `<button class="page-btn" data-csp-onclick="changePage(${currentPage - 1})" aria-label="Previous page"><i class="fas fa-chevron-left"></i></button>` : ''}
          ${Array.from({ length: totalPages }, (_, i) => i + 1).map(p =>
            `<button class="page-btn ${p === currentPage ? 'active' : ''}" data-csp-onclick="changePage(${p})" aria-label="Page ${p}" ${p === currentPage ? 'aria-current="page"' : ''}>${p}</button>`
          ).join('')}
          ${currentPage < totalPages ? `<button class="page-btn" data-csp-onclick="changePage(${currentPage + 1})" aria-label="Next page"><i class="fas fa-chevron-right"></i></button>` : ''}
        </div>`;
      } else pag.innerHTML = '';
    } catch (e) {
      grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><i class="fas fa-exclamation-circle"></i><h3>Failed to load products</h3><p>${esc(e.message)}</p></div>`;
    }
  }

  window.changePage = (p) => { currentPage = p; loadProducts(); window.scrollTo(0, 0); };
  loadProducts();
});
