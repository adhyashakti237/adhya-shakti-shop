window.Pages = window.Pages || {};

function fmtQty(n){
  n = Number(n || 0);
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, '');
}

Pages.inventory = async function(){
  Layout.render('inventory', `
    <div class="page-head">
      <div><h1>Inventory</h1><div class="sub">Your items, stock &amp; prices — adding one creates the product &amp; a purchase</div></div>
      <button class="btn btn-primary btn-sm" id="addItemBtn"><i class="fa-solid fa-plus"></i> Add item</button>
    </div>
    <div class="searchbar"><i class="fa-solid fa-magnifying-glass"></i>
      <input class="input" id="itemSearch" placeholder="Search by name, SKU or category…"></div>
    <div id="itemList"><div class="empty"><span class="spinner"></span></div></div>`);

  document.getElementById('addItemBtn').onclick = () => Inventory.openForm(null);
  let timer;
  document.getElementById('itemSearch').oninput = e => {
    clearTimeout(timer);
    timer = setTimeout(() => Inventory.load(e.target.value.trim()), 220);
  };
  Inventory.load('');
};

const Inventory = {
  _variants: [],
  _images: [],

  async load(q){
    const box = document.getElementById('itemList');
    if (!box) return;
    let items = [];
    try { items = (await API.get('/api/items?q=' + encodeURIComponent(q || ''))).items; }
    catch(e){ box.innerHTML = `<div class="empty"><p>${esc(e.message)}</p></div>`; return; }

    if (!items.length){
      box.innerHTML = `<div class="card"><div class="empty">
        <i class="fa-solid fa-boxes-stacked"></i>
        <p>${q ? 'No items match your search' : 'No items yet'}</p>
        <p class="small">${q ? '' : 'Add your first product to start tracking stock.'}</p>
      </div></div>`;
      return;
    }
    box.innerHTML = `<div class="card">${items.map(Inventory.row).join('')}</div>`;
    box.querySelectorAll('[data-edit]').forEach(r =>
      r.onclick = () => Inventory.openForm(JSON.parse(r.getAttribute('data-edit'))));
  },

  row(it){
    const low = Number(it.stock) <= Number(it.low_stock_threshold);
    const stockBadge = `<span class="badge ${low ? 'badge-low' : 'badge-ok'}">${fmtQty(it.stock)} ${low ? 'left' : 'in stock'}</span>`;
    const sub = [it.sku ? '#' + esc(it.sku) : '', esc(it.category || '')].filter(Boolean).join(' · ');
    const margin = Number(it.cost_price) > 0
      ? `<div class="ri-sub">Cost ${money(it.cost_price)} → Sells ${money(it.sale_price)}</div>`
      : `<div class="ri-sub">Sells ${money(it.sale_price)}</div>`;
    return `
      <div class="row-item" data-edit='${esc(JSON.stringify(it))}' style="cursor:pointer">
        <div class="ri-ico"><i class="fa-solid fa-tag"></i></div>
        <div class="ri-main">
          <div class="ri-title">${esc(it.name)}</div>
          ${sub ? `<div class="ri-sub">${sub}</div>` : ''}
          ${margin}
        </div>
        <div style="text-align:right">${stockBadge}</div>
      </div>`;
  },

  async openForm(item){
    const isEdit = !!(item && item.id);
    let cats = [];
    try { cats = (await API.get('/api/acc/categories')).categories; } catch(e){}
    await VendorPicker.load();
    let e = item || {};
    if (isEdit){ try { e = (await API.get('/api/items/' + item.id)).item; } catch(ex){ e = item; } }

    Inventory._variants = (e.variants && e.variants.length)
      ? e.variants.map(v => ({ color: v.color || '', size: v.size || '', qty: v.stock != null ? v.stock : (v.qty || 0) }))
      : [];
    Inventory._images = Array.isArray(e.images) ? e.images.slice() : [];
    const hasVariants = Inventory._variants.length > 0;
    const catOpts = accCategoryOptionsFromRows(cats, e.category_id, true);

    Modal.open(isEdit ? 'Edit item' : 'Add item', `
      <div id="itemErr" class="form-err" style="display:none"></div>
      <div class="field"><label>Item name *</label>
        <input class="input" id="f_name" value="${esc(e.name || '')}" placeholder="e.g. Women's Cord Set"></div>
      <div class="row-2">
        <div class="field"><label>Category</label><select id="f_cat">${catOpts}</select></div>
        <div class="field"><label>SKU / code</label><input class="input" id="f_sku" value="${esc(e.sku || '')}" placeholder="optional"></div>
      </div>
      <div class="field"><label>Description <span class="muted small">(optional)</span></label>
        <textarea id="f_desc" placeholder="Shown on the product page">${esc(e.description || '')}</textarea></div>
      <div class="row-2">
        <div class="field"><label>Sale price (you charge)</label>
          <input class="input" type="number" step="0.01" min="0" id="f_sale" value="${e.sale_price != null ? e.sale_price : ''}" placeholder="0.00"></div>
        <div class="field"><label>Compare-at price <span class="muted small">(optional)</span></label>
          <input class="input" type="number" step="0.01" min="0" id="f_compare" value="${e.compare_price != null ? e.compare_price : ''}" placeholder="0.00"></div>
      </div>
      <div class="row-2">
        <div class="field"><label>Cost price (what you pay)</label>
          <input class="input" type="number" step="0.01" min="0" id="f_cost" value="${e.cost_price != null ? e.cost_price : ''}" placeholder="0.00"></div>
        <div class="field"><label>Low-stock alert at</label>
          <input class="input" type="number" step="1" min="0" id="f_low" value="${e.low_stock_threshold != null ? e.low_stock_threshold : 5}"></div>
      </div>
      ${VendorPicker.html(e.vendor_id)}
      <div class="field" style="margin-bottom:8px">
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-weight:500;color:var(--text)">
          <input type="checkbox" id="f_hasvar" style="width:auto;min-height:0" ${hasVariants ? 'checked' : ''}>
          This item comes in colours &amp; sizes (e.g. clothing)</label></div>
      <div id="varBox" style="display:${hasVariants ? 'block' : 'none'}">
        <div id="varRows"></div>
        <button class="btn btn-sm btn-block" id="addVarBtn" type="button" style="margin-bottom:10px"><i class="fa-solid fa-plus"></i> Add colour / size</button>
      </div>
      <div id="simpleBox" class="field" style="display:${hasVariants ? 'none' : 'block'}">
        <label>${isEdit ? 'Stock on hand' : 'Quantity bought'}</label>
        <input class="input" type="number" step="1" min="0" id="f_stock" value="${(!hasVariants && e.stock != null) ? e.stock : ''}" placeholder="0"></div>
      <div class="field"><label>Photos <span class="muted small">(optional)</span></label>
        <label class="attach-add"><i class="fa-solid fa-image"></i> Add photo
          <input type="file" accept=".jpg,.jpeg,.png,.webp" multiple hidden id="f_imgInput"></label>
        <div class="attach-thumbs" id="imgThumbs"></div></div>
      ${isEdit ? '<div class="field"><label>Stock history</label><div id="stockHist" class="small muted">Loading…</div></div>' : ''}
    `, `
      ${isEdit ? '<button class="btn btn-danger" id="itemDelete"><i class="fa-solid fa-trash"></i></button>' : ''}
      <button class="btn" data-close>Cancel</button>
      <button class="btn btn-primary" id="itemSave">${isEdit ? 'Save' : 'Add item'}</button>
    `);

    VendorPicker.bind();
    Inventory.renderVariants();
    Inventory.renderImages();
    if (isEdit) Inventory.loadMoves(item.id);

    document.getElementById('f_hasvar').onchange = ev => {
      document.getElementById('varBox').style.display = ev.target.checked ? 'block' : 'none';
      document.getElementById('simpleBox').style.display = ev.target.checked ? 'none' : 'block';
      if (ev.target.checked && !Inventory._variants.length){ Inventory._variants.push({ color: '', size: '', qty: 0 }); Inventory.renderVariants(); }
    };
    document.getElementById('addVarBtn').onclick = () => { Inventory._variants.push({ color: '', size: '', qty: 0 }); Inventory.renderVariants(); };
    document.getElementById('f_imgInput').onchange = ev => Inventory.uploadImages(ev.target.files);

    document.getElementById('itemSave').onclick = async () => {
      const err = document.getElementById('itemErr');
      err.style.display = 'none';
      const name = document.getElementById('f_name').value.trim();
      if (!name){ err.textContent = 'Please enter an item name'; err.style.display = 'block'; return; }
      const hasVar = document.getElementById('f_hasvar').checked;
      const btn = document.getElementById('itemSave');
      btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>';
      try {
        const vendor_id = await VendorPicker.resolve();
        const payload = {
          name, category_id: document.getElementById('f_cat').value || null,
          description: document.getElementById('f_desc').value.trim(),
          sale_price: document.getElementById('f_sale').value || 0,
          compare_price: document.getElementById('f_compare').value || null,
          cost_price: document.getElementById('f_cost').value || 0,
          sku: document.getElementById('f_sku').value.trim(),
          low_stock_threshold: document.getElementById('f_low').value || 5,
          vendor_id, images: Inventory._images,
        };
        if (hasVar) payload.variants = Inventory._variants.filter(v => (v.color || v.size));
        else payload.stock = document.getElementById('f_stock').value || 0;
        if (isEdit) await API.put('/api/items/' + item.id, payload);
        else await API.post('/api/items', payload);
        Modal.close();
        toast(isEdit ? 'Item saved' : 'Item added — product & purchase created');
        Inventory.load(document.getElementById('itemSearch')?.value.trim() || '');
      } catch(ex){ err.textContent = ex.message; err.style.display = 'block'; btn.disabled = false; btn.textContent = isEdit ? 'Save' : 'Add item'; }
    };

    const del = document.getElementById('itemDelete');
    if (del) del.onclick = () => {
      Modal.open('Remove item?', `<p class="muted">"${esc(e.name)}" will be hidden from your inventory and the website.
        Past sales and purchases stay intact.</p>`,
        `<button class="btn" data-close>Cancel</button><button class="btn btn-danger" id="confirmDel">Remove</button>`);
      document.getElementById('confirmDel').onclick = async () => {
        try { await API.del('/api/items/' + item.id); Modal.close(); toast('Item removed'); Inventory.load(''); }
        catch(ex){ toast(ex.message, true); }
      };
    };
  },

  renderVariants(){
    const box = document.getElementById('varRows');
    if (!box) return;
    box.innerHTML = Inventory._variants.map((v, i) => `<div class="ln" data-vi="${i}">
      <div class="row-2">
        <input class="input v-color" placeholder="Colour (e.g. Blue)" value="${esc(v.color || '')}">
        <input class="input v-size" placeholder="Size (e.g. M)" value="${esc(v.size || '')}">
      </div>
      <div class="ln-qp" style="margin-top:8px">
        <input class="input v-qty" type="number" min="0" step="1" value="${v.qty || ''}" placeholder="qty" style="flex:1">
        <button class="ln-del" type="button" title="Remove">&times;</button>
      </div></div>`).join('');
    Inventory._variants.forEach((v, i) => {
      const row = box.querySelector(`[data-vi="${i}"]`);
      row.querySelector('.v-color').oninput = ev => v.color = ev.target.value;
      row.querySelector('.v-size').oninput = ev => v.size = ev.target.value;
      row.querySelector('.v-qty').oninput = ev => v.qty = Number(ev.target.value) || 0;
      row.querySelector('.ln-del').onclick = () => { Inventory._variants.splice(i, 1); Inventory.renderVariants(); };
    });
  },

  async uploadImages(files){
    for (const f of files){
      const fd = new FormData(); fd.append('file', f);
      try {
        const res = await fetch('/api/upload', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { [API.CSRF_HEADER]: await API.csrf() },
          body: fd
        });
        const d = await res.json();
        if (res.status === 403 && /security check failed/i.test(d.error || '')) API.clearCsrf();
        if (d.url) Inventory._images.push(d.url); else toast(d.error || 'Image upload failed', true);
      } catch(e){ toast('Image upload failed', true); }
    }
    Inventory.renderImages();
  },

  renderImages(){
    const box = document.getElementById('imgThumbs');
    if (!box) return;
    box.innerHTML = Inventory._images.map((u, i) => `<div style="position:relative">
      <span class="attach-thumb"><img src="${esc(u)}" alt=""></span>
      <button class="rm" data-img="${i}" type="button">&times;</button></div>`).join('');
    box.querySelectorAll('[data-img]').forEach(b => b.onclick = () => { Inventory._images.splice(+b.getAttribute('data-img'), 1); Inventory.renderImages(); });
  },

  async loadMoves(itemId){
    const box = document.getElementById('stockHist');
    if (!box) return;
    let moves = [];
    try { moves = (await API.get('/api/items/' + itemId + '/moves')).moves; } catch(e){ box.textContent = ''; return; }
    if (!moves.length){ box.textContent = 'No stock movements yet.'; return; }
    box.innerHTML = moves.map(m => {
      const up = m.change >= 0;
      return `<div class="kv" style="padding:6px 0"><span class="k">${fmtDate(m.created_at)} · ${esc(m.reason || '')}</span>
        <span class="v" style="color:${up ? 'var(--green-ok)' : 'var(--red)'}">${up ? '+' : ''}${fmtQty(m.change)}</span></div>`;
    }).join('');
  },
};
