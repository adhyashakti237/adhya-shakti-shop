window.Pages = window.Pages || {};

Pages.sales = async function(){
  Sales._month = Sales._month || todayStr().slice(0, 7);
  Layout.render('sales', `
    <div class="page-head">
      <div><h1>Sales</h1><div class="sub">Money coming in</div></div>
      <button class="btn btn-primary btn-sm" id="addSaleBtn"><i class="fa-solid fa-plus"></i> Record</button>
    </div>
    <div class="monthsel">
      <i class="fa-solid fa-calendar muted"></i>
      <input class="input" type="month" id="saleMonth" value="${Sales._month}">
    </div>
    <div id="salesList"><div class="empty"><span class="spinner"></span></div></div>`);

  document.getElementById('addSaleBtn').onclick = () => Sales.openForm(null);
  document.getElementById('saleMonth').onchange = e => { Sales._month = e.target.value; Sales.load(); };
  Sales.load();
};

const Sales = {
  _items: [],
  _lines: [],
  _month: null,

  async load(){
    const box = document.getElementById('salesList');
    if (!box) return;
    let sales = [];
    try { sales = (await API.get('/api/sales?month=' + Sales._month)).sales; }
    catch(e){ box.innerHTML = `<div class="empty"><p>${esc(e.message)}</p></div>`; return; }

    if (!sales.length){
      box.innerHTML = `<div class="card"><div class="empty">
        <i class="fa-solid fa-receipt"></i><p>No sales this month</p>
        <p class="small">Tap “Record” to add your first sale.</p></div></div>`;
      return;
    }
    const isAdmin = true;
    const total = sales.reduce((a, s) => a + (s.total || 0), 0);
    box.innerHTML = `
      <div class="tile in" style="margin-bottom:12px"><div class="lbl">${sales.length} sale${sales.length>1?'s':''} this month</div>
        <div class="val">${money(total)}</div></div>
      <div class="card">${sales.map(s => Sales.row(s, isAdmin)).join('')}</div>`;
    box.querySelectorAll('[data-sale]').forEach(r => r.onclick = () => Sales.openDetail(r.getAttribute('data-sale')));
  },

  row(s, isAdmin){
    const who = s.customer_name || (s.channel === 'online' ? 'Online sale' : 'Walk-in sale');
    const clip = s.attachment_count ? `<i class="fa-solid fa-paperclip clip" title="${s.attachment_count} bill(s)"></i>` : '';
    const pf = (isAdmin && s.profit != null) ? `<div class="ri-sub">Profit ${money(s.profit)}</div>` : '';
    return `<div class="row-item" data-sale="${s.id}" style="cursor:pointer">
      <div class="ri-ico"><i class="fa-solid fa-receipt"></i></div>
      <div class="ri-main"><div class="ri-title">${esc(who)}</div>
        <div class="ri-sub">${fmtDate(s.sale_date)}${s.payment_method ? ' · ' + esc(s.payment_method) : ''}</div>${pf}</div>
      <div style="text-align:right">${clip} <span class="ri-amt amt-in">${money(s.total)}</span></div>
    </div>`;
  },

  // ── Form (create / edit) ──────────────────────────────────────────────────
  async openForm(sale){
    try { Sales._items = (await API.get('/api/items')).items; } catch(e){ Sales._items = []; }
    const isEdit = !!sale;
    Sales._lines = isEdit && sale.items && sale.items.length
      ? sale.items.map(it => ({ item_id: it.item_id || null, name: it.name, qty: it.qty,
          unit_price: it.unit_price, unit_cost: it.unit_cost || 0, custom: !it.item_id }))
      : [Sales.blankLine()];

    Modal.open(isEdit ? 'Edit sale' : 'Record a sale', `
      <div id="saleErr" class="form-err" style="display:none"></div>
      <div class="row-2">
        <div class="field"><label>Date</label>
          <input class="input" type="date" id="s_date" value="${(sale && sale.sale_date) || todayStr()}"></div>
        <div class="field"><label>Type</label>
          <select id="s_channel">
            <option value="manual" ${sale && sale.channel==='manual' ? 'selected':''}>Walk-in / manual</option>
            <option value="online" ${sale && sale.channel==='online' ? 'selected':''}>Online</option>
          </select></div>
      </div>
      ${CustomerPicker.html(sale && sale.customer_id ? { id: sale.customer_id, name: sale.customer_name } : null)}
      <div class="field"><label>Payment method</label><select id="s_pay"></select></div>
      <label style="font-size:13px;font-weight:500;color:var(--muted)">Items sold</label>
      <div id="saleLines" style="margin-top:8px"></div>
      <button class="btn btn-sm btn-block" id="addLineBtn" style="margin-bottom:12px"><i class="fa-solid fa-plus"></i> Add another item</button>
      <div class="field"><label>Discount <span class="muted small">(optional)</span></label>
        <input class="input" type="number" min="0" step="0.01" id="s_disc" value="${(sale && sale.discount) || ''}" placeholder="0.00"></div>
      <div class="totbar"><span>Total</span><span><span id="totTotal">$0.00</span>
        <div class="pf" id="totProfit"></div></span></div>
      ${Attach.pickerHtml('saleAttach')}
    `, `
      ${isEdit ? '<button class="btn btn-danger" id="saleDelete"><i class="fa-solid fa-trash"></i></button>' : ''}
      <button class="btn" data-close>Cancel</button>
      <button class="btn btn-primary" id="saleSave">${isEdit ? 'Save' : 'Record sale'}</button>`);

    // payment options
    const meta = await Meta.load();
    const paySel = document.getElementById('s_pay');
    paySel.innerHTML = (meta.payment_methods || ['Cash','Card']).map(p =>
      `<option ${sale && sale.payment_method === p ? 'selected' : ''}>${esc(p)}</option>`).join('');

    Attach.initPicker('saleAttach');
    CustomerPicker.bind();
    Sales.renderLines();
    document.getElementById('addLineBtn').onclick = () => { Sales._lines.push(Sales.blankLine()); Sales.renderLines(); };
    document.getElementById('s_disc').oninput = Sales.recompute;
    document.getElementById('saleSave').onclick = () => Sales.save(isEdit ? sale.id : null);
    if (isEdit) document.getElementById('saleDelete').onclick = () => Sales.confirmDelete(sale.id);
  },

  blankLine(){ return { item_id: null, name: '', qty: 1, unit_price: 0, unit_cost: 0, custom: false }; },

  renderLines(){
    const box = document.getElementById('saleLines');
    box.innerHTML = Sales._lines.map((l, i) => Sales.lineHtml(l, i)).join('');
    Sales._lines.forEach((l, i) => Sales.bindLine(i));
    Sales.recompute();
  },

  lineHtml(l, i){
    const sel = l.custom ? '__custom' : (l.item_id || '');
    const opts = ['<option value="">— choose item —</option>']
      .concat(Sales._items.map(it => `<option value="${it.id}" ${sel === it.id ? 'selected' : ''}>${esc(it.name)} (${fmtQty(it.stock)} in stock)</option>`))
      .concat([`<option value="__custom" ${sel === '__custom' ? 'selected' : ''}>+ Other / custom item</option>`]).join('');
    return `<div class="ln" data-i="${i}">
      <select class="ln-item">${opts}</select>
      <input class="input ln-name" placeholder="Item name" value="${esc(l.name || '')}" style="margin-top:8px;display:${l.custom ? 'block' : 'none'}">
      <div class="ln-qp">
        <input class="input ln-qty" type="number" min="0" step="1" value="${l.qty}">
        <span class="ln-x">×</span>
        <input class="input ln-price" type="number" min="0" step="0.01" value="${l.unit_price || ''}" placeholder="price">
        <button class="ln-del" type="button" title="Remove">&times;</button>
      </div>
      <div class="ln-sub" id="lnsub${i}"></div>
    </div>`;
  },

  bindLine(i){
    const row = document.querySelector(`.ln[data-i="${i}"]`);
    if (!row) return;
    const l = Sales._lines[i];
    const sel = row.querySelector('.ln-item');
    const nameI = row.querySelector('.ln-name');
    const qtyI = row.querySelector('.ln-qty');
    const priceI = row.querySelector('.ln-price');

    sel.onchange = () => {
      const v = sel.value;
      if (v === '__custom'){ l.custom = true; l.item_id = null; l.unit_cost = 0; nameI.style.display = 'block'; }
      else if (v === ''){ l.custom = false; l.item_id = null; l.name = ''; nameI.style.display = 'none'; }
      else {
        const it = Sales._items.find(x => x.id === v);
        l.custom = false; l.item_id = v; l.name = it.name; l.unit_cost = it.cost_price || 0;
        l.unit_price = it.sale_price || 0; priceI.value = l.unit_price; nameI.style.display = 'none';
      }
      Sales.recompute();
    };
    nameI.oninput = () => { l.name = nameI.value; };
    qtyI.oninput = () => { l.qty = Number(qtyI.value) || 0; Sales.recompute(); };
    priceI.oninput = () => { l.unit_price = Number(priceI.value) || 0; Sales.recompute(); };
    row.querySelector('.ln-del').onclick = () => {
      if (Sales._lines.length === 1){ Sales._lines[0] = Sales.blankLine(); }
      else Sales._lines.splice(i, 1);
      Sales.renderLines();
    };
  },

  recompute(){
    let subtotal = 0, cost = 0;
    Sales._lines.forEach((l, i) => {
      const lineTotal = (l.qty || 0) * (l.unit_price || 0);
      subtotal += lineTotal; cost += (l.qty || 0) * (l.unit_cost || 0);
      const sub = document.getElementById('lnsub' + i);
      if (sub) sub.textContent = lineTotal ? money(lineTotal) : '';
    });
    const disc = Number(document.getElementById('s_disc')?.value) || 0;
    const total = subtotal - disc;
    document.getElementById('totTotal').textContent = money(total);
    const pf = document.getElementById('totProfit');
    if (pf) pf.textContent = true ? ('Profit ' + money(total - cost)) : '';
  },

  async save(saleId){
    const err = document.getElementById('saleErr');
    err.style.display = 'none';
    const items = Sales._lines
      .filter(l => (l.name || '').trim() && (l.qty || 0) > 0)
      .map(l => ({ item_id: l.item_id, name: l.name.trim(), qty: l.qty, unit_price: l.unit_price, unit_cost: l.unit_cost }));
    if (!items.length){ err.textContent = 'Add at least one item with a quantity'; err.style.display = 'block'; return; }
    const btn = document.getElementById('saleSave');
    btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>';
    try {
      const customer = await CustomerPicker.resolve();   // {id,name} or throws — customer is mandatory
      const payload = {
        sale_date: document.getElementById('s_date').value || todayStr(),
        channel: document.getElementById('s_channel').value,
        customer_id: customer.id, customer_name: customer.name,
        payment_method: document.getElementById('s_pay').value,
        discount: Number(document.getElementById('s_disc').value) || 0,
        items,
      };
      const res = saleId ? await API.put('/api/sales/' + saleId, payload) : await API.post('/api/sales', payload);
      const files = Attach.files('saleAttach');
      if (files.length) await Attach.upload('sale', res.sale.id, files);
      Modal.close(); toast(saleId ? 'Sale updated' : 'Sale recorded');
      Sales.load();
    } catch(ex){ err.textContent = ex.message; err.style.display = 'block'; btn.disabled = false; btn.textContent = saleId ? 'Save' : 'Record sale'; }
  },

  // ── Detail ────────────────────────────────────────────────────────────────
  async openDetail(id){
    let s;
    try { s = (await API.get('/api/sales/' + id)).sale; } catch(e){ toast(e.message, true); return; }
    const isAdmin = true;
    const rows = s.items.map(it => `<tr><td>${esc(it.name)}</td><td class="r">${fmtQty(it.qty)}</td>
      <td class="r">${money(it.unit_price)}</td><td class="r">${money(it.qty * it.unit_price)}</td></tr>`).join('');
    const profitRow = (isAdmin && s.profit != null)
      ? `<div class="kv"><span class="k">Profit on this sale</span><span class="v" style="color:var(--green-ok)">${money(s.profit)}</span></div>` : '';
    Modal.open('Sale details', `
      <div class="kv"><span class="k">Date</span><span class="v">${fmtDate(s.sale_date)}</span></div>
      <div class="kv"><span class="k">Customer</span><span class="v">${esc(s.customer_name || '—')}</span></div>
      <div class="kv"><span class="k">Type</span><span class="v"><span class="chan ${s.channel}">${s.channel === 'online' ? 'Online' : 'Walk-in'}</span></span></div>
      <div class="kv"><span class="k">Payment method</span><span class="v">${esc(s.payment_method || '—')}</span></div>
      <table class="dtable"><thead><tr><th>Item</th><th class="r">Qty</th><th class="r">Price</th><th class="r">Total</th></tr></thead>
        <tbody>${rows}</tbody></table>
      ${s.discount ? `<div class="kv"><span class="k">Discount</span><span class="v">−${money(s.discount)}</span></div>` : ''}
      <div class="kv"><span class="k">Total</span><span class="v" style="font-size:16px">${money(s.total)}</span></div>
      ${profitRow}
      <div style="margin-top:14px"><label style="font-size:13px;font-weight:500;color:var(--muted)">Bills</label>
        <div id="saleBills">${Attach.viewerHtml(s.attachments)}</div></div>
    `, `<button class="btn btn-danger btn-sm" id="dDel"><i class="fa-solid fa-trash"></i></button>
        <button class="btn" id="dEdit"><i class="fa-solid fa-pen"></i> Edit</button>
        <button class="btn btn-primary" data-close>Done</button>`);
    Attach.bindDelete(document.getElementById('saleBills'), () => Sales.openDetail(id));
    document.getElementById('dEdit').onclick = () => { Modal.close(); Sales.openForm(s); };
    document.getElementById('dDel').onclick = () => Sales.confirmDelete(id);
  },

  confirmDelete(id){
    Modal.open('Delete sale?', `<p class="muted">This removes the sale and puts the items back into stock.
      Any attached bills are deleted too.</p>`,
      `<button class="btn" data-close>Cancel</button><button class="btn btn-danger" id="delYes">Delete</button>`);
    document.getElementById('delYes').onclick = async () => {
      try { await API.del('/api/sales/' + id); Modal.close(); toast('Sale deleted'); Sales.load(); }
      catch(e){ toast(e.message, true); }
    };
  },
};
