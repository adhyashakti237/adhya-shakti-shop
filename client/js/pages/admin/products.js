Router.register('/admin/products', async () => {
  if (!Auth.isAdmin()) { Router.navigate('/admin/login'); return; }
  adminLayout('<div class="spinner"></div>', '/admin/products');
  const _gen = Router._gen;

  const SIZES = ['XS', 'S', 'M', 'L', 'XL', '2XL'];
  const PER_PAGE = 20;
  let categories = [], products = [], images = [], variantColors = [], productById = new Map();
  let categoryTree = { categories: [] };
  let currentPage = 1, totalProducts = 0, searchQuery = '', productFilter = 'active', productHealth = {};

  function catChildren(node) { return (node && (node.children || node.categories)) || []; }
  function flattenAdminCategories(tree) {
    const out = [];
    const roots = (tree && (tree.categories || tree.types)) || [];
    const walk = (node, path = []) => {
      const names = path.concat(node.name);
      out.push({ ...node, path_names: names, path_label: names.join(' / ') });
      catChildren(node).forEach(child => walk(child, names));
    };
    roots.forEach(root => walk(root));
    return out;
  }
  function adminCategoryOptions(selectedId) {
    return ['<option value="">Select category</option>'].concat(
      categories
        .filter(c => c.is_active !== 0 || c.id === selectedId)
        .map(c => `<option value="${c.id}" ${selectedId === c.id ? 'selected' : ''}>${esc(c.path_label || c.name)}</option>`)
    ).join('');
  }

  async function loadAll() {
    const url = `/admin/products?per_page=${PER_PAGE}&page=${currentPage}&status=${encodeURIComponent(productFilter)}${searchQuery ? '&search=' + encodeURIComponent(searchQuery) : ''}`;
    const [tree, prodRes] = await Promise.all([api.get('/category-tree'), api.get(url)]);
    categoryTree = tree || { categories: [] };
    categories = flattenAdminCategories(categoryTree);
    products = prodRes.products;
    productById = new Map(products.map(p => [p.id, p]));
    totalProducts = prodRes.total;
    productHealth = prodRes.health || {};
    if (Router.stale(_gen)) return;
    renderProductsPage();
  }

  function renderProductsPage() {
    const totalPages = Math.ceil(totalProducts / PER_PAGE);
    document.querySelector('.admin-content').innerHTML = `
      <div class="admin-page-title">
        Products (${totalProducts})
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${Auth.isStrictAdmin() ? `<button class="btn btn-ghost" data-csp-onclick="Router.navigate('/admin/bulk-upload')"><i class="fas fa-file-import"></i> Bulk Upload</button>` : ''}
          ${Auth.isStrictAdmin() ? `<button class="btn btn-ghost" data-csp-onclick="window.location.href='/api/admin/export/back_in_stock'"><i class="fas fa-envelope-open-text"></i> Restock List</button>` : ''}
          <button class="btn btn-primary" data-csp-onclick="openProductModal()"><i class="fas fa-plus"></i> Add Product</button>
          </div>
        </div>
        <div class="card">
          <div class="card-body" style="padding-bottom:0">
            <div class="flex-between mb-16" style="flex-wrap:wrap;gap:10px">
              <input class="form-control" style="max-width:280px" placeholder="Search products..." id="prod-search-input" value="${esc(searchQuery)}" data-csp-oninput="searchProducts(this.value)" />
              ${Auth.isStrictAdmin() ? `<div style="display:flex;gap:8px;flex-wrap:wrap">
                <button class="btn btn-ghost btn-sm" data-csp-onclick="Router.navigate('/admin/categories')"><i class="fas fa-layer-group"></i> Categories</button>
              </div>` : ''}
            </div>
            <div class="admin-product-health">
              ${[
                ['active', 'Active', productHealth.active],
                ['inactive', 'Inactive', productHealth.inactive],
                ['out_of_stock', 'Out of stock', productHealth.out_of_stock],
                ['no_image', 'No image', productHealth.no_image],
                ['no_category', 'No category', productHealth.no_category],
                ['no_cost', 'No cost price', productHealth.no_cost],
                ['notify_waiting', 'Back-in-stock', productHealth.notify_waiting],
                ['all', 'All', productHealth.all],
              ].map(([key, label, count]) => `
                <button class="admin-filter-chip ${productFilter === key ? 'active' : ''}" data-csp-onclick="setProductFilter('${key}')">
                  ${esc(label)} <span>${Number(count || 0)}</span>
                </button>`).join('')}
            </div>
            <div class="admin-product-report-note">
              <i class="fas fa-circle-info"></i>
              Product reports are live filters. Use No image, No cost price, and Out of stock before uploads or restocking.
            </div>
          </div>
          <div class="table-wrap admin-products-wrap">
            <table class="admin-products-table">
              <thead><tr><th>Product</th><th>Category</th><th>Price</th><th>Stock</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody id="products-table-body">
                ${renderProductRows(products)}
            </tbody>
          </table>
        </div>
        ${totalPages > 1 ? `
        <div class="card-body" style="display:flex;align-items:center;justify-content:space-between;padding-top:12px;flex-wrap:wrap;gap:8px">
          <span class="text-sm text-muted">Page ${currentPage} of ${totalPages} &nbsp;·&nbsp; ${totalProducts} products</span>
          <div style="display:flex;gap:6px">
            <button class="btn btn-sm btn-ghost" data-csp-onclick="goProductPage(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''}><i class="fas fa-chevron-left"></i> Prev</button>
            <button class="btn btn-sm btn-ghost" data-csp-onclick="goProductPage(${currentPage + 1})" ${currentPage >= totalPages ? 'disabled' : ''}>Next <i class="fas fa-chevron-right"></i></button>
          </div>
        </div>` : ''}
      </div>`;
  }

  let searchTimer;
  window.searchProducts = (q) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { searchQuery = q; currentPage = 1; loadAll(); }, 350);
  };

  window.goProductPage = (p) => { currentPage = p; loadAll(); };
  window.setProductFilter = (filter) => {
    productFilter = filter || 'active';
    currentPage = 1;
    loadAll();
  };

  function renderProductRows(prods) {
    if (!prods.length) return '<tr><td colspan="6" class="text-center text-muted" style="padding:32px">No products found</td></tr>';
    return prods.map(p => `
      <tr>
        <td>
          <div style="display:flex;align-items:center;gap:10px">
            <img src="${safeMediaUrl((p.images||[])[0], 'https://placehold.co/44x44/f5f5f5/999?text=?')}" alt="" style="width:44px;height:44px;object-fit:cover;border-radius:6px" data-csp-onerror="this.src='https://placehold.co/44x44/f5f5f5/999?text=?'" />
            <div><div style="font-weight:600">${esc(p.name)}</div>${p.sku ? `<div class="text-sm text-muted">SKU: ${esc(p.sku)}</div>` : ''}</div>
          </div>
        </td>
        <td>${esc(p.category_name || '-')}</td>
        <td>${fmt(p.price)}${p.compare_price > p.price ? `<br><small class="text-muted" style="text-decoration:line-through">${fmt(p.compare_price)}</small>` : ''}</td>
        <td>
          <span class="${p.stock <= 0 ? 'badge badge-cancelled' : p.stock <= 5 ? 'badge badge-pending' : 'badge badge-success'}">${p.stock <= 0 ? 'Out' : p.stock}</span>
          ${Number(p.back_in_stock_waiting || 0) > 0 ? `<div class="text-sm text-muted" style="margin-top:4px"><i class="fas fa-envelope"></i> ${Number(p.back_in_stock_waiting || 0)} waiting</div>` : ''}
        </td>
        <td>${p.is_active ? '<span class="badge badge-success">Active</span>' : '<span class="badge badge-cancelled">Inactive</span>'}</td>
        <td>
          <div style="display:flex;gap:6px">
            <button class="btn btn-sm btn-ghost" data-csp-onclick="openProductModalById('${p.id}')" aria-label="Edit ${esc(p.name)}"><i class="fas fa-edit"></i></button>
            <button class="btn btn-sm btn-danger" data-csp-onclick="deleteProduct('${p.id}')" aria-label="Delete ${esc(p.name)}"><i class="fas fa-trash"></i></button>
          </div>
        </td>
      </tr>`).join('');
  }

  // ── Variant matrix helpers ────────────────────────────────────────────────

  function renderVariantMatrix() {
    const wrap = document.getElementById('variant-matrix');
    if (!wrap) return;
    if (!variantColors.length) {
      wrap.innerHTML = `<div style="color:var(--text-light);font-size:.88rem;padding:10px 0">No colors added yet. Add a color below to set sizes and stock.</div>`;
      return;
    }
    wrap.innerHTML = `
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;font-size:.85rem">
          <thead>
            <tr>
              <th style="text-align:left;padding:6px 8px;background:var(--bg);border:1px solid var(--border)">Color</th>
              ${SIZES.map(s => `<th style="text-align:center;padding:6px 8px;background:var(--bg);border:1px solid var(--border);min-width:56px">${s}</th>`).join('')}
              <th style="padding:6px 8px;background:var(--bg);border:1px solid var(--border)"></th>
            </tr>
          </thead>
          <tbody>
            ${variantColors.map((c, ci) => `
              <tr>
                <td style="padding:6px 8px;border:1px solid var(--border);font-weight:600">
                  <div style="display:flex;align-items:center;gap:6px">
                    <div style="width:14px;height:14px;border-radius:50%;background:${cssColor(c.name)};border:1px solid #ccc;flex-shrink:0"></div>
                    ${esc(c.name)}
                  </div>
                </td>
                ${SIZES.map(s => {
                  const stock = c.sizes[s] !== undefined ? c.sizes[s] : 0;
                  return `<td style="padding:4px 6px;border:1px solid var(--border);text-align:center">
                    <input type="number" min="0" value="${stock}"
                      style="width:52px;text-align:center;border:1px solid var(--border);border-radius:4px;padding:3px 4px;font-size:.82rem"
                      data-csp-onchange="updateVariantStock(${ci},'${s}',this.value)" />
                  </td>`;
                }).join('')}
                <td style="padding:4px 8px;border:1px solid var(--border);text-align:center">
                  <button data-csp-onclick="removeVariantColor(${ci})" style="background:none;border:none;color:#e53;cursor:pointer;font-size:1rem" title="Remove color">×</button>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
      <div style="margin-top:8px;font-size:.78rem;color:var(--text-light)">Enter 0 stock for sizes that are out of stock or unavailable.</div>`;
  }

  function cssColor(name) {
    const map = {
      white:'#ffffff', black:'#222222', red:'#e53935', blue:'#1565c0',
      navy:'#0d1b4b', green:'#2e7d32', yellow:'#f9a825', orange:'#e65100',
      pink:'#e91e63', purple:'#6a1b9a', grey:'#757575', gray:'#757575',
      cream:'#f5f0e8', beige:'#d4b896', brown:'#5d4037', teal:'#00695c',
      maroon:'#880e4f', gold:'#c49a22', silver:'#9e9e9e',
    };
    return map[name.toLowerCase()] || '#aaa';
  }

  window.updateVariantStock = (ci, size, val) => {
    if (!variantColors[ci]) return;
    variantColors[ci].sizes[size] = Math.max(0, parseInt(val) || 0);
  };

  window.removeVariantColor = (ci) => {
    variantColors.splice(ci, 1);
    renderVariantMatrix();
  };

  window.addVariantColor = () => {
    const inp = document.getElementById('new-color-input');
    const name = inp.value.trim();
    if (!name) return;
    if (variantColors.find(c => c.name.toLowerCase() === name.toLowerCase())) {
      toast('Color already added', 'warning'); return;
    }
    variantColors.push({ name, sizes: {} });
    inp.value = '';
    renderVariantMatrix();
  };

  function buildVariantsPayload() {
    const result = [];
    variantColors.forEach(c => {
      SIZES.forEach(s => {
        const stock = c.sizes[s] !== undefined ? c.sizes[s] : 0;
        result.push({ color: c.name, size: s, stock });
      });
    });
    return result;
  }

  function loadExistingVariants(existingVariants) {
    variantColors = [];
    if (!existingVariants || !existingVariants.length) return;
    existingVariants.forEach(v => {
      let colorEntry = variantColors.find(c => c.name === v.color);
      if (!colorEntry) { colorEntry = { name: v.color, sizes: {} }; variantColors.push(colorEntry); }
      colorEntry.sizes[v.size] = v.stock;
    });
  }

  // ── Product modal ─────────────────────────────────────────────────────────

  window.openProductModalById = async (id) => {
    try {
      const product = await api.get(`/admin/products/${id}`);
      openProductModal(product);
    } catch (e) {
      toast(e.message || 'Product could not be loaded', 'error');
    }
  };

  window.openProductModal = async (product = null) => {
    images = product?.images || [];
    variantColors = [];

    // Load existing variants if editing
    let existingVariants = [];
    if (product?.id) {
      try {
        const full = await api.get(`/admin/products/${product.id}`);
        existingVariants = full.variants || [];
      } catch (e) {}
    }
    loadExistingVariants(existingVariants);

    openModal(`
      <div class="modal-header"><h3>${product ? 'Edit Product' : 'Add Product'}</h3><button class="modal-close" data-csp-onclick="closeModal()" aria-label="Close">×</button></div>
      <div class="modal-body">
        <div class="form-group"><label class="form-label">Product Name *</label>
          <input class="form-control" id="pm-name" value="${esc(product?.name || '')}" placeholder="Product name" required /></div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">Price ($) *</label>
            <input class="form-control" id="pm-price" type="number" value="${product?.price || ''}" min="0" step="0.01" /></div>
          <div class="form-group"><label class="form-label">Compare Price ($)</label>
            <input class="form-control" id="pm-compare" type="number" value="${product?.compare_price || ''}" min="0" step="0.01" /></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">Category</label>
            <select class="form-control" id="pm-cat">
              ${adminCategoryOptions(product?.category_id)}
            </select></div>
          <div class="form-group"><label class="form-label">SKU</label>
            <input class="form-control" id="pm-sku" value="${esc(product?.sku || '')}" placeholder="SKU-001" /></div>
        </div>
        <div class="form-group"><label class="form-label">Description</label>
          <textarea class="form-control" id="pm-desc" rows="3">${esc(product?.description || '')}</textarea></div>

        <!-- Variant Matrix -->
        <div class="form-group" style="border:1px solid var(--border);border-radius:8px;padding:14px;background:var(--bg)">
          <label class="form-label" style="margin-bottom:10px">
            <i class="fas fa-palette" style="color:var(--primary);margin-right:6px"></i>Colors & Sizes / Stock
          </label>
          <div id="variant-matrix"></div>
          <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
            <input class="form-control" id="new-color-input" placeholder="e.g. Blue, Navy, Cream, Red..."
              style="max-width:200px" data-csp-onkeydown="if(event.key==='Enter'){event.preventDefault();addVariantColor()}" />
            <button class="btn btn-outline btn-sm" type="button" data-csp-onclick="addVariantColor()">
              <i class="fas fa-plus"></i> Add Color
            </button>
          </div>
          <div style="margin-top:8px;font-size:.78rem;color:var(--text-light)">
            Sizes shown: XS, S, M, L, XL, 2XL — enter 0 for unavailable sizes.
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Product Images</label>
          <div class="img-upload-area" data-csp-onclick="document.getElementById('pm-img-input').click()">
            <i class="fas fa-cloud-upload-alt" style="font-size:1.8rem;color:var(--text-light);margin-bottom:8px"></i>
            <div class="text-sm text-muted">Click to upload images (JPG, PNG, WebP)</div>
          </div>
          <input type="file" id="pm-img-input" accept=".jpg,.jpeg,.png,.webp" multiple style="display:none" data-csp-onchange="uploadProductImages(this)" />
          <div class="img-preview-grid" id="pm-img-preview">
            ${images.map((im, i) => `
              <div class="img-preview-item">
                <img src="${safeMediaUrl(im)}" alt="Product photo ${i + 1}" data-csp-onerror="this.style.opacity='.3'" />
                <button class="remove-img" data-csp-onclick="removeImg(${i})">×</button>
              </div>`).join('')}
          </div>
        </div>
        <div class="form-group" style="display:flex;align-items:center;gap:10px;padding:12px;background:rgba(29,92,74,.04);border-radius:8px;border:1px solid var(--border)">
          <input type="checkbox" id="pm-custom-print" style="width:18px;height:18px;cursor:pointer" ${product?.allow_custom_print ? 'checked' : ''} />
          <label for="pm-custom-print" style="cursor:pointer;font-weight:600;font-size:.9rem;margin:0">
            <i class="fas fa-print" style="color:var(--primary);margin-right:6px"></i>Enable Custom Print Upload for this product
          </label>
        </div>
        <div class="form-group" style="display:flex;align-items:center;gap:10px;padding:12px;background:rgba(196,154,34,.05);border-radius:8px;border:1px solid rgba(196,154,34,.25)">
          <input type="checkbox" id="pm-bestseller" style="width:18px;height:18px;cursor:pointer" ${product?.is_bestseller ? 'checked' : ''} />
          <label for="pm-bestseller" style="cursor:pointer;font-weight:600;font-size:.9rem;margin:0">
            <i class="fas fa-fire" style="color:var(--secondary);margin-right:6px"></i>Mark as Bestseller <span style="font-size:.78rem;font-weight:400;color:var(--text-light)">(shows Bestseller badge on product cards)</span>
          </label>
        </div>
        ${product ? `<div class="form-group"><label class="form-label">Status</label>
          <select class="form-control" id="pm-active">
            <option value="1" ${product.is_active ? 'selected' : ''}>Active</option>
            <option value="0" ${!product.is_active ? 'selected' : ''}>Inactive</option>
          </select></div>` : ''}
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" data-csp-onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" id="save-product-btn" data-csp-onclick="saveProduct('${product?.id || ''}')">
          ${product ? 'Update Product' : 'Add Product'}
        </button>
      </div>`);

    // Render matrix after modal is in DOM
    renderVariantMatrix();

    // Auto-enable custom print when Clothing or Custom category is selected
    const pmCat = document.getElementById('pm-cat');
    if (pmCat) {
      pmCat.addEventListener('change', () => {
        const sel = categories.find(c => c.id === pmCat.value);
        const cb = document.getElementById('pm-custom-print');
        if (cb && sel) {
          cb.checked = (sel.path_names || [sel.name]).some(n => String(n).toLowerCase() === 'custom');
        }
      });
    }

    window.removeImg = (idx) => {
      images.splice(idx, 1);
      document.getElementById('pm-img-preview').innerHTML = images.map((im, i) => `
        <div class="img-preview-item"><img src="${safeMediaUrl(im)}" alt="Product photo ${i + 1}" /><button class="remove-img" data-csp-onclick="removeImg(${i})">×</button></div>`).join('');
    };
    window.uploadProductImages = async (input) => {
      for (const file of input.files) {
        try {
          const res = await api.upload(file);
          images.push(res.url);
        } catch (e) { toast(e.message, 'error'); }
      }
      document.getElementById('pm-img-preview').innerHTML = images.map((im, i) => `
        <div class="img-preview-item"><img src="${safeMediaUrl(im)}" alt="Product photo ${i + 1}" /><button class="remove-img" data-csp-onclick="removeImg(${i})">×</button></div>`).join('');
    };
  };

  window.saveProduct = async (id) => {
    const btn = document.getElementById('save-product-btn');

    // ── Validation ────────────────────────────────────────────────────────────
    const name = document.getElementById('pm-name').value.trim();
    const price = parseFloat(document.getElementById('pm-price').value);
    const category_id = document.getElementById('pm-cat').value;
    const description = document.getElementById('pm-desc').value.trim();

    if (!name) { toast('Product name is required', 'error'); return; }
    if (!price || price <= 0) { toast('A valid price is required', 'error'); return; }
    if (!category_id) { toast('Please select a category', 'error'); return; }
    if (!description) { toast('Description is required', 'error'); return; }
    if (!images.length) { toast('At least one product image is required', 'error'); return; }

    // If Clothing category → variants mandatory
    const selectedCat = categories.find(c => c.id === category_id);
    const isClothing = (selectedCat?.path_names || [selectedCat?.name || ''])
      .some(n => String(n).toLowerCase() === 'clothing');
    if (isClothing && variantColors.length === 0) {
      toast('Clothing products must have at least one color added', 'error'); return;
    }
    // ─────────────────────────────────────────────────────────────────────────

    btn.disabled = true; btn.textContent = 'Saving...';
    const variants = buildVariantsPayload();
    const data = {
      name, price,
      compare_price: parseFloat(document.getElementById('pm-compare').value) || null,
      category_id,
      stock: variants.reduce((s, v) => s + v.stock, 0),
      sku: document.getElementById('pm-sku').value,
      description,
      images,
      variations: [],
      variants,
      allow_custom_print: document.getElementById('pm-custom-print')?.checked ? 1 : 0,
      is_bestseller: document.getElementById('pm-bestseller')?.checked ? 1 : 0,
      is_active: id ? parseInt(document.getElementById('pm-active').value) : 1,
    };
    try {
      if (id) await api.put(`/admin/products/${id}`, data);
      else await api.post('/admin/products', data);
      toast(id ? 'Product updated!' : 'Product added!', 'success');
      closeModal(); await loadAll();
    } catch (e) { toast(e.message, 'error'); btn.disabled = false; btn.textContent = 'Save'; }
  };

  window.deleteProduct = async (id) => {
    const product = productById.get(id);
    const name = product?.name || 'this product';
    if (!confirm(`Archive "${name}"? It will be marked inactive, not permanently deleted.`)) return;
    try { await api.del(`/admin/products/${id}`); toast('Product archived', 'success'); await loadAll(); }
    catch (e) { toast(e.message, 'error'); }
  };

  // Category management now lives on the dedicated /admin/categories page.
  window.openCatModal = () => Router.navigate('/admin/categories');

  await loadAll();
});
