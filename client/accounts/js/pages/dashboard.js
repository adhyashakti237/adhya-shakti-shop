window.Pages = window.Pages || {};

Pages.dashboard = async function(){
  Dashboard._period = Dashboard._period || 'month';
  Layout.render('home', `<div class="empty"><span class="spinner"></span></div>`);
  await Dashboard.render();
};

const Dashboard = {
  _period: 'month',
  _from: todayStr(),
  _to: todayStr(),
  periods: [
    { k:'today', label:'Today' }, { k:'week', label:'This week' }, { k:'month', label:'This month' },
    { k:'year', label:'This year' }, { k:'all', label:'All time' }, { k:'custom', label:'Custom' },
  ],

  query(){
    return Dashboard._period === 'custom'
      ? `from=${Dashboard._from}&to=${Dashboard._to}`
      : `period=${Dashboard._period}`;
  },

  async render(){
    let d = {};
    try { d = await API.get('/api/acc/dashboard?' + Dashboard.query()); } catch(e){ toast(e.message, true); }

    const chips = Dashboard.periods.map(p =>
      `<button class="seg ${p.k === Dashboard._period ? 'active' : ''}" data-p="${p.k}">${p.label}</button>`).join('');
    const customRow = Dashboard._period === 'custom' ? `
      <div class="row-2" style="margin:-4px 0 14px">
        <input class="input" type="date" id="dFrom" value="${Dashboard._from}">
        <input class="input" type="date" id="dTo" value="${Dashboard._to}">
      </div>` : '';

    const lowAlert = (d.low_stock_count || 0) ? `
      <a href="/inventory" data-link class="alert alert-warn" style="margin-bottom:14px;width:100%">
        <i class="fa-solid fa-triangle-exclamation"></i>
        <span>${d.low_stock_count} item${d.low_stock_count > 1 ? 's' : ''} low on stock — tap to view</span></a>` : '';

    const list = (title, icon, rows) => `<div class="card" style="margin-bottom:12px">
      <div class="card-pad" style="padding-bottom:4px"><strong><i class="fa-solid ${icon}"></i> ${title}</strong></div>
      ${rows || `<div class="empty" style="padding:20px"><p class="small muted">Nothing yet</p></div>`}</div>`;

    const best = (d.best_sellers || []).slice(0, 5).map(b => `<div class="row-item">
      <div class="ri-main"><div class="ri-title">${esc(b.name)}</div><div class="ri-sub">${fmtQty(b.qty)} sold · profit ${money(b.profit)}</div></div>
      <div class="ri-amt amt-in">${money(b.revenue)}</div></div>`).join('');
    const low = (d.low_stock || []).slice(0, 5).map(l => `<div class="row-item">
      <div class="ri-main"><div class="ri-title">${esc(l.name)}</div></div>
      <span class="badge badge-low">${fmtQty(l.stock)} left</span></div>`).join('');
    const vend = (d.vendor_summary || []).slice(0, 5).map(v => `<div class="row-item">
      <div class="ri-main"><div class="ri-title">${esc(v.name)}</div></div>
      <div class="ri-amt amt-out">${money(v.spent)}</div></div>`).join('');

    const inner = `
      <div class="page-head"><div><h1>Dashboard</h1><div class="sub">Your full business picture</div></div></div>
      <div class="seg-control">${chips}</div>
      ${customRow}

      <div class="grid grid-2" style="margin-bottom:8px">
        <div class="tile in"><div class="lbl">Product profit</div><div class="val">${money(d.gross_profit)}</div>
          <div class="small muted">sales − product cost</div></div>
        <div class="tile in"><div class="lbl">Net profit</div><div class="val">${money(d.net_profit)}</div>
          <div class="small muted">after expenses</div></div>
      </div>
      <div class="tile profit" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
        <div><div class="lbl">Cash available · after restocking</div><div class="val">${money(d.cash_available)}</div></div>
        <i class="fa-solid fa-wallet" style="font-size:24px;color:var(--gold)"></i>
      </div>
      <div class="small muted" style="margin-bottom:14px">Restock money isn't lost — it's now ${money(d.inventory_cost_value)} of stock on your shelves.</div>

      <div class="grid grid-2" style="margin-bottom:8px">
        <div class="tile"><div class="lbl">Total sales</div><div class="val" style="font-size:18px">${money(d.total_sales)}</div></div>
        <div class="tile"><div class="lbl">Product cost</div><div class="val" style="font-size:18px">${money(d.product_cost)}</div></div>
        <div class="tile"><div class="lbl">Purchases</div><div class="val" style="font-size:18px">${money(d.purchases_total)}</div></div>
        <div class="tile"><div class="lbl">Expenses</div><div class="val" style="font-size:18px">${money(d.expenses_total)}</div></div>
      </div>
      <div class="tile" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <span class="lbl" style="margin:0">Inventory value (at cost)</span>
        <span class="val" style="font-size:18px">${money(d.inventory_cost_value)}</span></div>

      ${lowAlert}

      <div class="grid" style="margin-bottom:18px">
        <button class="btn btn-primary btn-block" data-go="/sales"><i class="fa-solid fa-plus"></i> Record a sale</button>
        <div class="grid grid-2">
          <button class="btn" data-go="/expenses"><i class="fa-solid fa-money-bill-wave"></i> Expense</button>
          <button class="btn" data-go="/purchases"><i class="fa-solid fa-truck-ramp-box"></i> Purchase</button>
        </div>
      </div>

      ${list('Best sellers', 'fa-trophy', best)}
      ${list('Top vendors', 'fa-building-store', vend)}
      ${list('Low stock', 'fa-triangle-exclamation', low)}`;

    Layout.render('home', inner);
    document.querySelectorAll('.seg-control .seg').forEach(b => b.onclick = () => {
      Dashboard._period = b.getAttribute('data-p'); Dashboard.render();
    });
    const f = document.getElementById('dFrom'), t = document.getElementById('dTo');
    if (f) f.onchange = () => { Dashboard._from = f.value; Dashboard.render(); };
    if (t) t.onchange = () => { Dashboard._to = t.value; Dashboard.render(); };
    document.querySelectorAll('[data-go]').forEach(b => b.onclick = () => Router.navigate(b.getAttribute('data-go')));
  },
};
