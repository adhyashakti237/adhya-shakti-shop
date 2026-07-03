window.Pages = window.Pages || {};

Pages.reports = async function(){
  Reports._range = Reports._range || 'month';
  Reports._type = Reports._type || 'pl';
  Layout.render('reports', `
    <div class="page-head"><div><h1>Reports</h1><div class="sub">Your numbers, any way you need them</div></div></div>
    <div class="seg-control" id="repRange"></div>
    <div id="repCustom"></div>
    <div class="seg-control" id="repType" style="margin-top:4px"></div>
    <div id="repBody"><div class="empty"><span class="spinner"></span></div></div>`);
  Reports.renderControls();
  Reports.load();
};

const Reports = {
  _range: 'month', _type: 'pl', _from: todayStr(), _to: todayStr(),
  ranges: [
    { k:'month', label:'This month' }, { k:'last', label:'Last month' }, { k:'3m', label:'3 months' },
    { k:'year', label:'This year' }, { k:'all', label:'All time' }, { k:'custom', label:'Custom' },
  ],
  types: [
    { k:'pl', label:'Profit & Loss' }, { k:'full', label:'Full business' }, { k:'sales', label:'Sales' },
    { k:'purchases', label:'Purchases' }, { k:'expenses', label:'Expenses' }, { k:'vendor', label:'Vendors' },
    { k:'inventory', label:'Inventory' }, { k:'stock', label:'Stock' },
  ],

  rangeDates(){
    const t = new Date(); const iso = d => d.toISOString().slice(0, 10);
    const first = (y, m) => iso(new Date(y, m, 1)); const last = (y, m) => iso(new Date(y, m + 1, 0));
    switch (Reports._range){
      case 'last': { const d = new Date(t.getFullYear(), t.getMonth() - 1, 1); return { from: first(d.getFullYear(), d.getMonth()), to: last(d.getFullYear(), d.getMonth()) }; }
      case '3m':  { const d = new Date(t.getFullYear(), t.getMonth() - 2, 1); return { from: first(d.getFullYear(), d.getMonth()), to: iso(t) }; }
      case 'year': return { from: t.getFullYear() + '-01-01', to: iso(t) };
      case 'all':  return { from: '2000-01-01', to: iso(t) };
      case 'custom': return { from: Reports._from, to: Reports._to };
      default: return { from: first(t.getFullYear(), t.getMonth()), to: iso(t) };
    }
  },

  renderControls(){
    document.getElementById('repRange').innerHTML = Reports.ranges.map(r =>
      `<button class="seg ${r.k === Reports._range ? 'active' : ''}" data-r="${r.k}">${r.label}</button>`).join('');
    document.getElementById('repType').innerHTML = Reports.types.map(t =>
      `<button class="seg ${t.k === Reports._type ? 'active' : ''}" data-t="${t.k}">${t.label}</button>`).join('');
    document.getElementById('repCustom').innerHTML = Reports._range === 'custom' ? `
      <div class="row-2" style="margin-bottom:12px">
        <input class="input" type="date" id="rFrom" value="${Reports._from}">
        <input class="input" type="date" id="rTo" value="${Reports._to}"></div>` : '';
    document.querySelectorAll('#repRange .seg').forEach(b => b.onclick = () => { Reports._range = b.getAttribute('data-r'); Reports.renderControls(); Reports.load(); });
    document.querySelectorAll('#repType .seg').forEach(b => b.onclick = () => { Reports._type = b.getAttribute('data-t'); Reports.renderControls(); Reports.load(); });
    const f = document.getElementById('rFrom'), t = document.getElementById('rTo');
    if (f) f.onchange = () => { Reports._from = f.value; Reports.load(); };
    if (t) t.onchange = () => { Reports._to = t.value; Reports.load(); };
  },

  exportBtn(type, label){
    const { from, to } = Reports.rangeDates();
    const url = `/api/acc/reports/export?${new URLSearchParams({ type, from, to }).toString()}`;
    return `<a class="btn btn-sm" href="${url}" download><i class="fa-solid fa-file-arrow-down"></i> Export ${label || type} (CSV)</a>`;
  },

  async load(){
    const box = document.getElementById('repBody');
    if (!box) return;
    box.innerHTML = `<div class="empty"><span class="spinner"></span></div>`;
    const { from, to } = Reports.rangeDates();
    try {
      if (Reports._type === 'inventory') return Reports.inventory(box);
      if (Reports._type === 'stock') return Reports.stock(box, from, to);
      const d = await API.get(`/api/acc/reports/summary?from=${from}&to=${to}`);
      ({ pl: Reports.pl, full: Reports.full, sales: Reports.sales, purchases: Reports.purchases,
         expenses: Reports.expenses, vendor: Reports.vendor }[Reports._type] || Reports.pl)(box, d, from, to);
    } catch(e){ box.innerHTML = `<div class="empty"><p>${esc(e.message)}</p></div>`; }
  },

  kv(k, v, strong){ return `<div class="kv"><span class="k">${k}</span><span class="v" ${strong ? 'style="font-size:16px"' : ''}>${v}</span></div>`; },

  pl(box, d){
    box.innerHTML = `<div class="card card-pad">
      <h3 style="font-size:15px;font-weight:600;margin-bottom:8px">Profit &amp; Loss</h3>
      ${Reports.kv('Sales revenue', money(d.total_sales))}
      ${Reports.kv('− Cost of goods sold', money(d.product_cost))}
      ${Reports.kv('= Gross profit', '<b>'+money(d.gross_profit)+'</b>', true)}
      ${Reports.kv('− Operating expenses', money(d.expenses_total))}
      ${Reports.kv('= Net profit', '<b style="color:var(--green-ok)">'+money(d.net_profit)+'</b>', true)}
      <div style="border-top:1px dashed var(--line);margin:10px 0"></div>
      ${Reports.kv('− Stock purchased (restocking)', money(d.purchases_total))}
      ${Reports.kv('= Cash available', '<b>'+money(d.cash_available)+'</b>', true)}
    </div>
    <div class="small muted mt8">Restocking isn't a loss — it's now ${money(d.inventory_cost_value)} of inventory.</div>
    <div class="mt16">${Reports.exportBtn('sales','sales')}</div>`;
  },

  full(box, d){
    const cats = (d.expense_by_category || []).map(c => Reports.kv(esc(c.category), money(c.amount))).join('');
    const items = (d.top_items || []).slice(0,6).map(i => `<tr><td>${esc(i.name)}</td><td class="r">${fmtQty(i.qty)}</td><td class="r">${money(i.revenue)}</td><td class="r">${money(i.profit)}</td></tr>`).join('');
    const vends = (d.vendor_summary || []).map(v => Reports.kv(esc(v.name), money(v.spent))).join('') || '<div class="small muted">No vendor spend in range</div>';
    box.innerHTML = `<div class="card card-pad">
      <h3 style="font-size:15px;font-weight:600;margin-bottom:8px">Full business report</h3>
      ${Reports.kv('Sales', money(d.total_sales))}
      ${Reports.kv('Product cost', money(d.product_cost))}
      ${Reports.kv('Gross profit', money(d.gross_profit))}
      ${Reports.kv('Expenses', money(d.expenses_total))}
      ${Reports.kv('Net profit', '<b style="color:var(--green-ok)">'+money(d.net_profit)+'</b>')}
      ${Reports.kv('Stock purchased', money(d.purchases_total))}
      ${Reports.kv('Cash available', '<b>'+money(d.cash_available)+'</b>')}
      ${Reports.kv('Inventory value (cost)', money(d.inventory_cost_value))}
      ${Reports.kv('Inventory value (retail)', money(d.inventory_retail_value))}
      ${Reports.kv('Number of sales', d.sales_count)}
    </div>
    <div class="card card-pad mt16"><h3 style="font-size:14px;font-weight:600;margin-bottom:6px">Best sellers</h3>
      <table class="dtable"><thead><tr><th>Item</th><th class="r">Qty</th><th class="r">Revenue</th><th class="r">Profit</th></tr></thead><tbody>${items || '<tr><td colspan=4 class="muted small">No sales</td></tr>'}</tbody></table></div>
    <div class="card card-pad mt16"><h3 style="font-size:14px;font-weight:600;margin-bottom:6px">Spend by vendor</h3>${vends}</div>
    <div class="card card-pad mt16"><h3 style="font-size:14px;font-weight:600;margin-bottom:6px">Where money went</h3>${cats || '<div class="small muted">No expenses</div>'}</div>
    <div class="mt16" style="display:flex;gap:8px;flex-wrap:wrap">${Reports.exportBtn('sales','sales')}${Reports.exportBtn('purchases','purchases')}${Reports.exportBtn('expenses','expenses')}</div>`;
  },

  sales(box, d){
    const items = (d.top_items || []).map(i => `<tr><td>${esc(i.name)}</td><td class="r">${fmtQty(i.qty)}</td><td class="r">${money(i.revenue)}</td><td class="r">${money(i.profit)}</td></tr>`).join('');
    box.innerHTML = `<div class="grid grid-2" style="margin-bottom:12px">
      <div class="tile in"><div class="lbl">Sales revenue</div><div class="val">${money(d.total_sales)}</div></div>
      <div class="tile in"><div class="lbl">Gross profit</div><div class="val">${money(d.gross_profit)}</div></div></div>
      <div class="card card-pad"><h3 style="font-size:14px;font-weight:600;margin-bottom:6px">Best sellers</h3>
        <table class="dtable"><thead><tr><th>Item</th><th class="r">Qty</th><th class="r">Revenue</th><th class="r">Profit</th></tr></thead><tbody>${items || '<tr><td colspan=4 class="muted small">No sales</td></tr>'}</tbody></table></div>
      <div class="mt16">${Reports.exportBtn('sales','sales')}</div>`;
  },

  purchases(box, d){
    const vends = (d.vendor_summary || []).map(v => Reports.kv(esc(v.name), money(v.spent))).join('') || '<div class="small muted">No vendor spend in range</div>';
    box.innerHTML = `<div class="tile out" style="margin-bottom:12px"><div class="lbl">Stock purchased (restocking)</div><div class="val">${money(d.purchases_total)}</div></div>
      <div class="card card-pad"><h3 style="font-size:14px;font-weight:600;margin-bottom:6px">By vendor</h3>${vends}</div>
      <div class="mt16">${Reports.exportBtn('purchases','purchases')}</div>`;
  },

  expenses(box, d){
    const cats = (d.expense_by_category || []).map(c => Reports.kv(esc(c.category), money(c.amount))).join('') || '<div class="small muted">No expenses</div>';
    box.innerHTML = `<div class="tile out" style="margin-bottom:12px"><div class="lbl">Total expenses</div><div class="val">${money(d.expenses_total)}</div></div>
      <div class="card card-pad"><h3 style="font-size:14px;font-weight:600;margin-bottom:6px">By category</h3>${cats}</div>
      <div class="mt16">${Reports.exportBtn('expenses','expenses')}</div>`;
  },

  vendor(box, d){
    const rows = (d.vendor_summary || []).map(v => `<div class="row-item" data-ven="${v.id}" style="cursor:pointer">
      <div class="ri-ico"><i class="fa-solid fa-building-store"></i></div>
      <div class="ri-main"><div class="ri-title">${esc(v.name)}</div><div class="ri-sub">tap for full history</div></div>
      <div class="ri-amt amt-out">${money(v.spent)}</div></div>`).join('');
    box.innerHTML = `<div class="card">${rows || '<div class="empty" style="padding:24px"><p class="small muted">No vendor spend in this range</p></div>'}</div>
      <div class="small muted mt8">Tap a vendor for every purchase, expense &amp; receipt.</div>`;
    box.querySelectorAll('[data-ven]').forEach(r => r.onclick = () => Vendors.openDetail(r.getAttribute('data-ven')));
  },

  async inventory(box){
    const d = await API.get('/api/acc/reports/inventory');
    const lowItems = (d.items || []).filter(i => i.low);
    const rows = (d.items || []).map(i => `<tr><td>${esc(i.name)}${i.low ? ' <span class="badge badge-low">low</span>' : ''}</td>
      <td class="r">${fmtQty(i.stock)}</td><td class="r">${money(i.cost_value)}</td><td class="r">${money(i.retail_value)}</td></tr>`).join('');
    box.innerHTML = `<div class="grid grid-2" style="margin-bottom:12px">
      <div class="tile"><div class="lbl">Stock value (cost)</div><div class="val" style="font-size:18px">${money(d.total_cost_value)}</div></div>
      <div class="tile"><div class="lbl">Stock value (retail)</div><div class="val" style="font-size:18px">${money(d.total_retail_value)}</div></div></div>
      <div class="card card-pad inventory-alert-panel">
        <h3 style="font-size:14px;font-weight:600;margin-bottom:6px">Inventory alerts</h3>
        ${lowItems.length
          ? `<div class="alert alert-warn">${lowItems.length} product${lowItems.length === 1 ? '' : 's'} at or below low-stock level. Review these before the next sales push: ${lowItems.slice(0, 5).map(i => esc(i.name)).join(', ')}${lowItems.length > 5 ? '...' : ''}</div>`
          : '<div class="alert alert-info">No low-stock products in this inventory report.</div>'}
      </div>
      <div class="card card-pad"><table class="dtable"><thead><tr><th>Item</th><th class="r">Stock</th><th class="r">Cost val</th><th class="r">Retail val</th></tr></thead><tbody>${rows || '<tr><td colspan=4 class="muted small">No items</td></tr>'}</tbody></table></div>
      <div class="mt16">${Reports.exportBtn('inventory','inventory')}</div>`;
  },

  async stock(box, from, to){
    const d = await API.get(`/api/acc/reports/stock-moves?from=${from}&to=${to}`);
    const rows = (d.moves || []).map(m => `<tr><td>${fmtDate(m.date)}</td><td>${esc(m.item)}</td>
      <td>${esc(m.reason || '')}</td><td class="r" style="color:${m.change>=0?'var(--green-ok)':'var(--red)'}">${m.change>=0?'+':''}${fmtQty(m.change)}</td></tr>`).join('');
    box.innerHTML = `<div class="card card-pad"><h3 style="font-size:14px;font-weight:600;margin-bottom:6px">Stock movements</h3>
      <table class="dtable"><thead><tr><th>Date</th><th>Item</th><th>Reason</th><th class="r">Change</th></tr></thead><tbody>${rows || '<tr><td colspan=4 class="muted small">No movements in range</td></tr>'}</tbody></table></div>`;
  },
};
