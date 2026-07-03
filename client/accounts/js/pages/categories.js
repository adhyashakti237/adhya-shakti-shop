window.Pages = window.Pages || {};

// Admin-managed catalog categories used by Products, Inventory, and the storefront.
Pages.categories = async function(){
  if (!Auth.isAdmin()){
    Layout.render('categories', `
      <div class="center-card"><div class="empty">
        <i class="fa-solid fa-lock"></i>
        <p>Category management is admin-only.</p>
        <a class="btn mt16" data-link href="/">Back to bookkeeping</a>
      </div></div>`);
    return;
  }
  Layout.render('categories', `
    <div class="page-head">
      <div><h1>Categories</h1><div class="sub">Manage product categories and subcategories for the website, products, and inventory</div></div>
      <button class="btn btn-primary btn-sm" id="addRootCatBtn"><i class="fa-solid fa-plus"></i> Add category</button>
    </div>
    <div class="info-banner"><i class="fa-solid fa-circle-info"></i>
      <span>Turn a category <b>off</b> to hide it from the website without deleting old product, sale, purchase, or inventory records.</span></div>
    <div class="cat-manager-tools">
      <div>
        <b>Main categories</b>
        <span class="muted small">Open one section at a time on small screens, or expand everything when reviewing the full structure.</span>
      </div>
      <div class="cat-manager-actions">
        <button class="btn btn-sm" id="catExpandAll"><i class="fa-solid fa-up-right-and-down-left-from-center"></i> Expand all</button>
        <button class="btn btn-sm" id="catCollapseAll"><i class="fa-solid fa-down-left-and-up-right-to-center"></i> Collapse all</button>
      </div>
    </div>
    <div id="categoryList"><div class="empty"><span class="spinner"></span></div></div>`);

  document.getElementById('addRootCatBtn').onclick = () => CatalogCategories.add(null, 'Add main category');
  document.getElementById('catExpandAll').onclick = () => CatalogCategories.setAll(false);
  document.getElementById('catCollapseAll').onclick = () => CatalogCategories.setAll(true);
  CatalogCategories.load();
};

const CAT_COLLAPSE_KEY = 'adhya_catalog_category_collapsed_v1';

const CatalogCategories = {
  tree: [],
  collapsed: new Set(),

  initState(){
    try {
      const raw = JSON.parse(localStorage.getItem(CAT_COLLAPSE_KEY) || '[]');
      CatalogCategories.collapsed = new Set(Array.isArray(raw) ? raw.map(String) : []);
    } catch {
      CatalogCategories.collapsed = new Set();
    }
  },

  saveState(){
    try { localStorage.setItem(CAT_COLLAPSE_KEY, JSON.stringify([...CatalogCategories.collapsed])); }
    catch {}
  },

  async load(){
    const box = document.getElementById('categoryList');
    if (!box) return;
    let tree = [];
    try { tree = (await API.get('/api/acc/category-tree')).categories || []; }
    catch(e){ box.innerHTML = `<div class="card"><div class="empty"><p>${esc(e.message)}</p></div></div>`; return; }

    if (!tree.length){
      box.innerHTML = `<div class="card"><div class="empty">
        <i class="fa-solid fa-layer-group"></i>
        <p>No categories yet</p>
        <p class="small">Add Clothing, Jewelry, Custom, Other, or any future category you need.</p>
        <button class="btn btn-primary mt16" id="emptyAddCat"><i class="fa-solid fa-plus"></i> Add your first category</button>
      </div></div>`;
      document.getElementById('emptyAddCat').onclick = () => CatalogCategories.add(null, 'Add main category');
      return;
    }

    CatalogCategories.tree = tree;
    CatalogCategories.initState();
    box.innerHTML = tree.map(n => CatalogCategories.nodeCard(n, 0)).join('');
    box.querySelectorAll('[data-cat-toggle]').forEach(el => el.onclick = () =>
      CatalogCategories.toggleOpen(el.dataset.id));
    box.querySelectorAll('[data-cat-act]').forEach(el => el.onclick = () =>
      CatalogCategories.act(el.dataset.catAct, el.dataset.id, el.dataset.name, el.dataset.active));
  },

  nodeCard(n, depth){
    const off = !n.is_active;
    const kids = accCategoryChildren(n);
    const isRoot = depth === 0;
    const collapsed = isRoot && CatalogCategories.collapsed.has(String(n.id));
    const productText = n.products ? `${n.products} product${n.products > 1 ? 's' : ''}` : 'No products';
    const subText = kids.length ? `${kids.length} subcategor${kids.length === 1 ? 'y' : 'ies'}` : 'No subcategories';

    if (isRoot) {
      return `
        <section class="card cat-root-card ${off ? 'is-off' : ''} ${collapsed ? 'is-collapsed' : ''}">
          <div class="cat-root-head">
            <button class="cat-root-toggle" type="button" data-cat-toggle="1" data-id="${n.id}" title="${collapsed ? 'Expand' : 'Collapse'} ${esc(n.name)}">
              <i class="fa-solid fa-chevron-${collapsed ? 'right' : 'down'}"></i>
            </button>
            <div class="cat-root-main">
              <div class="cat-root-title">
                <i class="fa-solid ${off ? 'fa-folder' : 'fa-folder-open'}"></i>
                <span>${esc(n.name)}</span>
                <span class="badge ${off ? 'badge-low' : 'badge-ok'}">${off ? 'Hidden' : 'Visible'}</span>
              </div>
              <div class="cat-root-meta">${esc(subText)} · ${esc(productText)}</div>
            </div>
            <div class="clo-actions">
              <button class="icon-btn" title="Add subcategory" data-cat-act="add" data-id="${n.id}" data-name="${esc(n.name)}"><i class="fa-solid fa-plus"></i></button>
              <button class="icon-btn" title="${off ? 'Show on website' : 'Hide from website'}" data-cat-act="toggle" data-id="${n.id}" data-active="${n.is_active}"><i class="fa-solid fa-${off ? 'eye-slash' : 'eye'}"></i></button>
              <button class="icon-btn" title="Rename" data-cat-act="rename" data-id="${n.id}" data-name="${esc(n.name)}"><i class="fa-solid fa-pen"></i></button>
              <button class="icon-btn" title="Delete" data-cat-act="del" data-id="${n.id}" data-name="${esc(n.name)}"><i class="fa-solid fa-trash"></i></button>
            </div>
          </div>
          <div class="cat-root-body" ${collapsed ? 'hidden' : ''}>
            ${kids.length ? kids.map(c => CatalogCategories.nodeCard(c, depth + 1)).join('') : `
              <div class="cat-empty-child">
                <span>No subcategories yet</span>
                <button class="btn btn-sm" data-cat-act="add" data-id="${n.id}" data-name="${esc(n.name)}"><i class="fa-solid fa-plus"></i> Add subcategory</button>
              </div>`}
          </div>
        </section>`;
    }

    const body = `
      <div class="clo-cat depth-${Math.min(depth, 4)} ${off ? 'is-off' : ''}">
        <div class="cat-row-main">
          <div class="clo-cmain">
            <i class="fa-solid fa-tag"></i>
            <span>${esc(n.name)}</span>
            ${n.products ? `<span class="muted small">· ${n.products} product${n.products > 1 ? 's' : ''}</span>` : ''}
            <span class="badge ${off ? 'badge-low' : 'badge-ok'}">${off ? 'Hidden' : 'Visible'}</span>
          </div>
          <div class="clo-actions">
            <button class="icon-btn" title="Add subcategory" data-cat-act="add" data-id="${n.id}" data-name="${esc(n.name)}"><i class="fa-solid fa-plus"></i></button>
            <button class="icon-btn" title="${off ? 'Show on website' : 'Hide from website'}" data-cat-act="toggle" data-id="${n.id}" data-active="${n.is_active}"><i class="fa-solid fa-${off ? 'eye-slash' : 'eye'}"></i></button>
            <button class="icon-btn" title="Rename" data-cat-act="rename" data-id="${n.id}" data-name="${esc(n.name)}"><i class="fa-solid fa-pen"></i></button>
            <button class="icon-btn" title="Delete" data-cat-act="del" data-id="${n.id}" data-name="${esc(n.name)}"><i class="fa-solid fa-trash"></i></button>
          </div>
        </div>
        ${kids.length ? `<div class="clo-cats">${kids.map(c => CatalogCategories.nodeCard(c, depth + 1)).join('')}</div>` : ''}
      </div>`;
    return body;
  },

  toggleOpen(id){
    const key = String(id);
    if (CatalogCategories.collapsed.has(key)) CatalogCategories.collapsed.delete(key);
    else CatalogCategories.collapsed.add(key);
    CatalogCategories.saveState();
    CatalogCategories.load();
  },

  setAll(collapse){
    const ids = CatalogCategories.tree.map(n => String(n.id));
    CatalogCategories.collapsed = collapse ? new Set(ids) : new Set();
    CatalogCategories.saveState();
    CatalogCategories.load();
  },

  act(action, id, name, active){
    if (action === 'add') return CatalogCategories.add(id, 'Add subcategory to ' + name);
    if (action === 'toggle') return CatalogCategories.toggle(id, String(active) === '1');
    if (action === 'rename') return CatalogCategories.rename(id, name);
    if (action === 'del') return CatalogCategories.remove(id, name);
  },

  prompt(title, label, placeholder, value, onSave){
    Modal.open(title, `
      <div id="catErr" class="form-err" style="display:none"></div>
      <div class="field"><label>${label}</label>
        <input class="input" id="catName" value="${esc(value || '')}" placeholder="${esc(placeholder || '')}"></div>`,
      `<button class="btn" data-close>Cancel</button><button class="btn btn-primary" id="catSave">Save</button>`);
    setTimeout(() => { const el = document.getElementById('catName'); if (el){ el.focus(); el.select(); } }, 40);
    const save = async () => {
      const name = document.getElementById('catName').value.trim();
      const err = document.getElementById('catErr');
      if (!name){ err.textContent = 'Please enter a name'; err.style.display = 'block'; return; }
      try { await onSave(name); Modal.close(); CatalogCategories.load(); }
      catch(e){ err.textContent = e.message; err.style.display = 'block'; }
    };
    document.getElementById('catSave').onclick = save;
    document.getElementById('catName').addEventListener('keydown', e => { if (e.key === 'Enter') save(); });
  },

  add(parentId, title){
    CatalogCategories.prompt(title || 'Add category', 'Category name', 'e.g. Clearance, Kids Clothing, Saree', '',
      async name => { await API.post('/api/acc/categories/node', { name, parent_id: parentId }); toast('Category added'); });
  },

  rename(id, cur){
    CatalogCategories.prompt('Rename category', 'Name', '', cur,
      async name => { await API.put('/api/acc/categories/node/' + id, { name }); toast('Renamed'); });
  },

  async toggle(id, isActive){
    try {
      await API.put('/api/acc/categories/node/' + id, { is_active: !isActive });
      toast(isActive ? 'Hidden from website' : 'Now visible');
      CatalogCategories.load();
    } catch(e){ toast(e.message, true); }
  },

  remove(id, name){
    Modal.open('Delete category?', `<p class="muted">Delete <b>${esc(name)}</b>? This cannot be undone.</p>
      <p class="small muted">If it has subcategories or products, deactivate it instead.</p>`,
      `<button class="btn" data-close>Cancel</button><button class="btn btn-danger" id="catDel">Delete</button>`);
    document.getElementById('catDel').onclick = async () => {
      try { await API.del('/api/acc/categories/node/' + id); Modal.close(); toast('Deleted'); CatalogCategories.load(); }
      catch(e){ Modal.close(); toast(e.message, true); }
    };
  },
};
window.CatalogCategories = CatalogCategories;
