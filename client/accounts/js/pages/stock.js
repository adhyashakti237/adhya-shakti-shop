window.Pages = window.Pages || {};

Pages.purchases = async function(){
  Purchases._month = Purchases._month || todayStr().slice(0, 7);
  Layout.render('purchases', `
    <div class="page-head">
      <div><h1>Purchases</h1><div class="sub">Buying stock to resell</div></div>
      <button class="btn btn-primary btn-sm" id="addPurBtn"><i class="fa-solid fa-plus"></i> Add purchase</button>
    </div>
    <div class="monthsel">
      <i class="fa-solid fa-calendar muted"></i>
      <input class="input" type="month" id="purMonth" value="${Purchases._month}">
    </div>
    <div id="purList"><div class="empty"><span class="spinner"></span></div></div>`);

  document.getElementById('addPurBtn').onclick = () => Purchases.openForm(null);
  document.getElementById('purMonth').onchange = e => { Purchases._month = e.target.value; Purchases.load(); };
  Purchases.load();
};

const Purchases = {
  _items: [],
  _lines: [],
  _month: null,

  async load(){
    const box = document.getElementById('purList');
    if (!box) return;
    let purchases = [];
    try { purchases = (await API.get('/api/purchases?month=' + Purchases._month)).purchases; }
    catch(e){ box.innerHTML = `<div class="empty"><p>${esc(e.message)}</p></div>`; return; }

    if (!purchases.length){
      box.innerHTML = `<div class="card"><div class="empty">
        <i class="fa-solid fa-truck-ramp-box"></i><p>No stock purchases this month</p>
        <p class="small">Tap “Add stock” when you buy inventory from a supplier.</p></div></div>`;
      return;
    }
    const total = purchases.reduce((a, p) => a + (p.total || 0), 0);
    box.innerHTML = `
      <div class="tile out" style="margin-bottom:12px"><div class="lbl">${purchases.length} purchase${purchases.length>1?'s':''} this month</div>
        <div class="val">${money(total)}</div></div>
      <div class="card">${purchases.map(Purchases.row).join('')}</div>`;
    box.querySelectorAll('[data-pur]').forEach(r => r.onclick = () => Purchases.openDetail(r.getAttribute('data-pur')));
  },

  row(p){
    const clip = p.attachment_count ? `<i class="fa-solid fa-paperclip clip" title="${p.attachment_count} bill(s)"></i>` : '';
    return `<div class="row-item" data-pur="${p.id}" style="cursor:pointer">
      <div class="ri-ico" style="background:var(--red-l);color:var(--red)"><i class="fa-solid fa-truck-ramp-box"></i></div>
      <div class="ri-main"><div class="ri-title">${esc(p.vendor_name || p.supplier || 'Stock purchase')}</div>
        <div class="ri-sub">${fmtDate(p.purchase_date)}${p.payment_method ? ' · ' + esc(p.payment_method) : ''}</div></div>
      <div style="text-align:right">${clip} <span class="ri-amt amt-out">−${money(p.total)}</span></div>
    </div>`;
  },

  async openForm(pur){
    try { Purchases._items = (await API.get('/api/items')).items; } catch(e){ Purchases._items = []; }
    await VendorPicker.load();
    const isEdit = !!pur;
    Purchases._lines = isEdit && pur.items && pur.items.length
      ? pur.items.map(it => ({ item_id: it.item_id || null, name: it.name, qty: it.qty, unit_cost: it.unit_cost, custom: !it.item_id }))
      : [Purchases.blankLine()];

    const meta = await Meta.load();
    Modal.open(isEdit ? 'Edit purchase' : 'Add purchase', `
      <div id="purErr" class="form-err" style="display:none"></div>
      <div class="row-2">
        <div class="field"><label>Date</label>
          <input class="input" type="date" id="p_date" value="${(pur && pur.purchase_date) || todayStr()}"></div>
        <div class="field"><label>Payment method</label>
          <select id="p_pay">${(meta.payment_methods||['Cash']).map(p => `<option ${pur && pur.payment_method===p?'selected':''}>${esc(p)}</option>`).join('')}</select></div>
      </div>
      ${VendorPicker.html(pur && pur.vendor_id)}
      <label style="font-size:13px;font-weight:500;color:var(--muted)">Items bought</label>
      <div class="fab-note">Pick an item to add it to your stock</div>
      <div id="purLines"></div>
      <button class="btn btn-sm btn-block" id="addPLineBtn" style="margin-bottom:12px"><i class="fa-solid fa-plus"></i> Add another item</button>
      <div class="totbar"><span>Total cost</span><span id="purTotal">$0.00</span></div>
      ${Attach.pickerHtml('purAttach')}
    `, `
      ${isEdit ? '<button class="btn btn-danger" id="purDelete"><i class="fa-solid fa-trash"></i></button>' : ''}
      <button class="btn" data-close>Cancel</button>
      <button class="btn btn-primary" id="purSave">${isEdit ? 'Save' : 'Add purchase'}</button>`);

    Attach.initPicker('purAttach');
    VendorPicker.bind();
    Purchases.renderLines();
    document.getElementById('addPLineBtn').onclick = () => { Purchases._lines.push(Purchases.blankLine()); Purchases.renderLines(); };
    document.getElementById('purSave').onclick = () => Purchases.save(isEdit ? pur.id : null);
    if (isEdit) document.getElementById('purDelete').onclick = () => Purchases.confirmDelete(pur.id);
  },

  blankLine(){ return { item_id: null, name: '', qty: 1, unit_cost: 0, custom: false }; },

  renderLines(){
    const box = document.getElementById('purLines');
    box.innerHTML = Purchases._lines.map((l, i) => Purchases.lineHtml(l, i)).join('');
    Purchases._lines.forEach((l, i) => Purchases.bindLine(i));
    Purchases.recompute();
  },

  lineHtml(l, i){
    const sel = l.custom ? '__custom' : (l.item_id || '');
    const opts = ['<option value="">— choose item —</option>']
      .concat(Purchases._items.map(it => `<option value="${it.id}" ${sel === it.id ? 'selected' : ''}>${esc(it.name)} (${fmtQty(it.stock)} in stock)</option>`))
      .concat([`<option value="__custom" ${sel === '__custom' ? 'selected' : ''}>+ Other / custom item</option>`]).join('');
    return `<div class="ln" data-i="${i}">
      <select class="ln-item">${opts}</select>
      <input class="input ln-name" placeholder="Item name" value="${esc(l.name || '')}" style="margin-top:8px;display:${l.custom ? 'block' : 'none'}">
      <div class="ln-qp">
        <input class="input ln-qty" type="number" min="0" step="1" value="${l.qty}">
        <span class="ln-x">× cost</span>
        <input class="input ln-price" type="number" min="0" step="0.01" value="${l.unit_cost || ''}" placeholder="unit cost">
        <button class="ln-del" type="button" title="Remove">&times;</button>
      </div>
      <div class="ln-sub" id="plnsub${i}"></div>
    </div>`;
  },

  bindLine(i){
    const row = document.querySelector(`#purLines .ln[data-i="${i}"]`);
    if (!row) return;
    const l = Purchases._lines[i];
    const sel = row.querySelector('.ln-item');
    const nameI = row.querySelector('.ln-name');
    const qtyI = row.querySelector('.ln-qty');
    const costI = row.querySelector('.ln-price');

    sel.onchange = () => {
      const v = sel.value;
      if (v === '__custom'){ l.custom = true; l.item_id = null; nameI.style.display = 'block'; }
      else if (v === ''){ l.custom = false; l.item_id = null; l.name = ''; nameI.style.display = 'none'; }
      else {
        const it = Purchases._items.find(x => x.id === v);
        l.custom = false; l.item_id = v; l.name = it.name;
        if (!l.unit_cost){ l.unit_cost = it.cost_price || 0; costI.value = l.unit_cost; }
        nameI.style.display = 'none';
      }
      Purchases.recompute();
    };
    nameI.oninput = () => { l.name = nameI.value; };
    qtyI.oninput = () => { l.qty = Number(qtyI.value) || 0; Purchases.recompute(); };
    costI.oninput = () => { l.unit_cost = Number(costI.value) || 0; Purchases.recompute(); };
    row.querySelector('.ln-del').onclick = () => {
      if (Purchases._lines.length === 1){ Purchases._lines[0] = Purchases.blankLine(); }
      else Purchases._lines.splice(i, 1);
      Purchases.renderLines();
    };
  },

  recompute(){
    let total = 0;
    Purchases._lines.forEach((l, i) => {
      const lt = (l.qty || 0) * (l.unit_cost || 0);
      total += lt;
      const sub = document.getElementById('plnsub' + i);
      if (sub) sub.textContent = lt ? money(lt) : '';
    });
    document.getElementById('purTotal').textContent = money(total);
  },

  async save(pid){
    const err = document.getElementById('purErr');
    err.style.display = 'none';
    const items = Purchases._lines
      .filter(l => (l.name || '').trim() && (l.qty || 0) > 0)
      .map(l => ({ item_id: l.item_id, name: l.name.trim(), qty: l.qty, unit_cost: l.unit_cost }));
    if (!items.length){ err.textContent = 'Add at least one item with a quantity'; err.style.display = 'block'; return; }
    const btn = document.getElementById('purSave');
    btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>';
    try {
      const vendor_id = await VendorPicker.resolve();
      const payload = {
        purchase_date: document.getElementById('p_date').value || todayStr(),
        payment_method: document.getElementById('p_pay').value,
        vendor_id, items,
      };
      const res = pid ? await API.put('/api/purchases/' + pid, payload) : await API.post('/api/purchases', payload);
      const files = Attach.files('purAttach');
      if (files.length) await Attach.upload('purchase', res.purchase.id, files);
      Modal.close(); toast(pid ? 'Purchase updated' : 'Purchase added');
      Purchases.load();
    } catch(ex){ err.textContent = ex.message; err.style.display = 'block'; btn.disabled = false; btn.textContent = pid ? 'Save' : 'Add purchase'; }
  },

  async openDetail(id){
    let p;
    try { p = (await API.get('/api/purchases/' + id)).purchase; } catch(e){ toast(e.message, true); return; }
    const rows = p.items.map(it => `<tr><td>${esc(it.name)}</td><td class="r">${fmtQty(it.qty)}</td>
      <td class="r">${money(it.unit_cost)}</td><td class="r">${money(it.qty * it.unit_cost)}</td></tr>`).join('');
    Modal.open('Purchase details', `
      <div class="kv"><span class="k">Date</span><span class="v">${fmtDate(p.purchase_date)}</span></div>
      <div class="kv"><span class="k">Vendor</span><span class="v">${esc(p.vendor_name || p.supplier || '—')}</span></div>
      <div class="kv"><span class="k">Payment method</span><span class="v">${esc(p.payment_method || '—')}</span></div>
      <table class="dtable"><thead><tr><th>Item</th><th class="r">Qty</th><th class="r">Cost</th><th class="r">Total</th></tr></thead>
        <tbody>${rows}</tbody></table>
      <div class="kv"><span class="k">Total cost</span><span class="v" style="font-size:16px">${money(p.total)}</span></div>
      <div style="margin-top:14px"><label style="font-size:13px;font-weight:500;color:var(--muted)">Supplier bill</label>
        <div id="purBills">${Attach.viewerHtml(p.attachments)}</div></div>
    `, `<button class="btn btn-danger btn-sm" id="pDel"><i class="fa-solid fa-trash"></i></button>
        <button class="btn" id="pEdit"><i class="fa-solid fa-pen"></i> Edit</button>
        <button class="btn btn-primary" data-close>Done</button>`);
    Attach.bindDelete(document.getElementById('purBills'), () => Purchases.openDetail(id));
    document.getElementById('pEdit').onclick = () => { Modal.close(); Purchases.openForm(p); };
    document.getElementById('pDel').onclick = () => Purchases.confirmDelete(id);
  },

  confirmDelete(id){
    Modal.open('Delete purchase?', `<p class="muted">This removes the purchase and takes the bought items back out of stock.
      Any attached bill is deleted too.</p>`,
      `<button class="btn" data-close>Cancel</button><button class="btn btn-danger" id="delYes">Delete</button>`);
    document.getElementById('delYes').onclick = async () => {
      try { await API.del('/api/purchases/' + id); Modal.close(); toast('Purchase deleted'); Purchases.load(); }
      catch(e){ toast(e.message, true); }
    };
  },
};
