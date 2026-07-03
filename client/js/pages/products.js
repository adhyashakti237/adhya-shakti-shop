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
        <div id="price-chip-bar" class="price-chips"></div>
        <div class="filter-bar">
          <select id="sort-filter" data-csp-onchange="applyFilters()">
            <option value="newest">Newest First</option>
            <option value="price_asc">Price: Low to High</option>
            <option value="price_desc">Price: High to Low</option>
          </select>
          <input type="text" id="search-box" class="form-control" style="max-width:260px" placeholder="Search products..." value="${params.search || ''}" data-csp-onkeydown="if(event.key==='Enter')applyFilters()" />
          <span class="results-count" id="results-count"></span>
        </div>
        <div id="products-grid" class="grid-4"><div class="spinner"></div></div>
        <div id="pagination"></div>
      </div>
    </div>`;

  let currentPage = parseInt(params.page) || 1;
  let currentCat = params.category || '';
  let currentSearch = params.search || '';
  let currentPrice = { min: null, max: null };
  let allCats = [];
  let categoryTree = { categories: [] };

  const PRICE_RANGES = [
    { label: 'Under $30',  min: null, max: 30 },
    { label: '$30 – $75',  min: 30,   max: 75 },
    { label: '$75 – $150', min: 75,   max: 150 },
    { label: '$150+',      min: 150,  max: null },
  ];

  function buildPriceChips() {
    const bar = document.getElementById('price-chip-bar');
    if (!bar) return;
    bar.innerHTML = '';
    PRICE_RANGES.forEach(r => {
      const btn = document.createElement('button');
      btn.className = 'price-chip' + (currentPrice.min === r.min && currentPrice.max === r.max ? ' active' : '');
      btn.textContent = r.label;
      btn.onclick = () => {
        currentPrice = (currentPrice.min === r.min && currentPrice.max === r.max)
          ? { min: null, max: null } : { min: r.min, max: r.max };
        currentPage = 1;
        buildPriceChips();
        loadProducts();
      };
      bar.appendChild(btn);
    });
  }
  buildPriceChips();

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
    const setDesc = (text) => {
      const desc = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 155);
      const meta = document.querySelector('meta[name="description"]');
      if (meta) meta.setAttribute('content', desc);
      const og = document.querySelector('meta[property="og:description"]');
      if (og) og.setAttribute('content', desc);
    };

    const matchedCat = allCats.find(c => c.id === currentCat);
    if (currentSearch) {
      titleEl.textContent = 'Search results';
      subEl.textContent = `Showing ${total === null ? 'products' : total + ' product' + (total === 1 ? '' : 's')} matching "${currentSearch}".`;
      document.title = `Search results for ${currentSearch} — Adhya Shakti Shop`;
      setDesc(`Shop products matching ${currentSearch} at Adhya Shakti Shop. Jewelry, clothing, custom gifts, and more from New Jersey.`);
      return;
    }

    if (matchedCat) {
      titleEl.textContent = matchedCat.name || 'Products';
      subEl.textContent = matchedCat.path_label || 'Browse this collection.';
      document.title = `${matchedCat.path_label || matchedCat.name} — Adhya Shakti Shop`;
      setDesc(`Shop ${matchedCat.path_label || matchedCat.name} at Adhya Shakti Shop. Handpicked products, secure checkout, and shipping from New Jersey.`);
      return;
    }

    titleEl.textContent = 'All Products';
    subEl.textContent = 'Browse jewelry, clothing, custom items, and gifts from Adhya Shakti Shop.';
    document.title = 'Products — Adhya Shakti Shop';
    setDesc('Browse jewelry, clothing, custom items, and gifts from Adhya Shakti Shop. Secure checkout and shipping from New Jersey.');
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
      btn.onclick = () => { currentCat = headId; currentPage = 1; loadProducts(); buildCatFilter(cats, headId); };
      wrap.appendChild(btn);

      if (availSubs.length) {
        const flyout = document.createElement('div');
        flyout.className = 'cat-pill-flyout';
        availSubs.forEach(sub => {
          const item = document.createElement('button');
          item.className = 'cat-pill-flyout-item' + (activeCat === sub.id ? ' active' : '');
          item.textContent = sub.label;
          item.onclick = e => { e.stopPropagation(); currentCat = sub.id; currentPage = 1; loadProducts(); buildCatFilter(cats, sub.id); };
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
      if (currentPrice.min !== null) url += `&min_price=${currentPrice.min}`;
      if (currentPrice.max !== null) url += `&max_price=${currentPrice.max}`;
      const { products, total } = await api.get(url);
      if (Router.stale(_gen)) return;

      document.getElementById('results-count').textContent = `${total} product${total !== 1 ? 's' : ''} found`;
      updatePageIntro(total);

      if (!products.length) {
        const matchedCat = allCats.find(c => c.id === currentCat);
        const pathNames = (matchedCat?.path_names || [matchedCat?.name || '']).map(n => String(n).toLowerCase());
        const isCustomRelated = pathNames.some(n => n === 'custom' || /custom|print/.test(n));
        const isClothingRelated = pathNames.includes('clothing');
        if (isClothingRelated || isCustomRelated) {
          const dest = isCustomRelated ? '/custom-printing' : '/clothing';
          grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><i class="fas fa-clock"></i><h3>Coming Soon</h3><p>This category isn't available yet — <a href="${dest}" data-link>see details and get notified</a>.</p></div>`;
        } else {
          grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><i class="fas fa-search"></i><h3>No products found</h3><p>Try a different search or category</p></div>`;
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
