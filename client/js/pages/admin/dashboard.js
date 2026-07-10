function adminLayout(content, activePath) {
  const app = document.getElementById('app');
  const strictAdmin = Auth.isStrictAdmin();
  const user = Auth.getUser();

  const allLinks = [
    { href: '/admin',          icon: 'fa-tachometer-alt', label: strictAdmin ? 'Shop Dashboard' : 'Staff Dashboard' },
    { href: '/admin/products', icon: 'fa-box',            label: 'Products'                   },
    { href: '/admin/categories', icon: 'fa-layer-group', label: 'Categories', adminOnly: true },
    { href: '/admin/bulk-upload', icon: 'fa-file-import', label: 'Bulk Upload', adminOnly: true },
    { href: '/admin/orders',   icon: 'fa-shopping-bag',   label: 'Orders'                     },
    { href: '/admin/coupons',  icon: 'fa-tag',            label: 'Coupons',    adminOnly: true },
    { href: '/admin/users',    icon: 'fa-users',          label: 'Customers',  adminOnly: true },
    { href: '/admin/reviews',  icon: 'fa-star',           label: 'Reviews'                    },
    { href: '/admin/security', icon: 'fa-shield-halved',  label: 'Security',   adminOnly: true },
  ];
  const links = allLinks.filter(l => !l.adminOnly || strictAdmin);

  app.innerHTML = `
    <div class="admin-layout">
      <aside class="admin-sidebar">
        <div style="padding:0 20px 20px;border-bottom:1px solid rgba(255,255,255,.1)">
          <div style="font-size:1.1rem;font-weight:800;color:#fff;font-family:Georgia,serif">Adhya <span style="color:var(--gold)">Shakti</span></div>
          <div style="font-size:.75rem;color:rgba(255,255,255,.4);margin-top:2px">${strictAdmin ? 'Admin Panel' : 'Staff Panel'}</div>
        </div>
        <div class="sidebar-section-label" style="padding:10px 20px 4px;font-size:.62rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:rgba(255,255,255,.3);margin-top:12px">Main Menu</div>
        <nav class="sidebar-links-row">${links.map(l => `<a href="${l.href}" data-link class="sidebar-link ${activePath === l.href ? 'active' : ''}"><i class="fas ${l.icon}"></i>${l.label}</a>`).join('')}</nav>
        <div class="sidebar-section-label" style="padding:10px 20px 4px;font-size:.62rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:rgba(255,255,255,.3);margin-top:8px">Accounts &amp; Bookkeeping</div>
        <nav class="sidebar-links-row">
          <a href="/admin/accounts" data-link class="sidebar-link ${activePath === '/admin/accounts' ? 'active' : ''}"><i class="fas fa-gauge-high"></i>Books Dashboard</a>
          <a href="/admin/accounts/sales" data-link class="sidebar-link ${activePath === '/admin/accounts/sales' ? 'active' : ''}"><i class="fas fa-receipt"></i>Sales</a>
          <a href="/admin/accounts/purchases" data-link class="sidebar-link ${activePath === '/admin/accounts/purchases' ? 'active' : ''}"><i class="fas fa-truck-ramp-box"></i>Purchases</a>
          <a href="/admin/accounts/inventory" data-link class="sidebar-link ${activePath === '/admin/accounts/inventory' ? 'active' : ''}"><i class="fas fa-boxes-stacked"></i>Inventory</a>
          <a href="/admin/accounts/vendors" data-link class="sidebar-link ${activePath === '/admin/accounts/vendors' ? 'active' : ''}"><i class="fas fa-people-group"></i>Vendors</a>
          <a href="/admin/accounts/expenses" data-link class="sidebar-link ${activePath === '/admin/accounts/expenses' ? 'active' : ''}"><i class="fas fa-money-bill-wave"></i>Expenses</a>
          <a href="/admin/accounts/reports" data-link class="sidebar-link ${activePath === '/admin/accounts/reports' ? 'active' : ''}"><i class="fas fa-chart-line"></i>Reports</a>
        </nav>
        <div class="sidebar-section-label" style="padding:10px 20px 4px;font-size:.62rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:rgba(255,255,255,.3);margin-top:8px">Account</div>
        <a href="/" class="sidebar-link"><i class="fas fa-store"></i>View Store</a>
        <a href="#" class="sidebar-link" data-csp-onclick="Auth.logout()"><i class="fas fa-sign-out-alt"></i>Logout</a>
        <div class="sidebar-footer" style="padding:16px 20px;border-top:1px solid rgba(255,255,255,.1);margin-top:auto">
          <div style="font-size:.75rem;color:rgba(255,255,255,.5)">Logged in as</div>
          <div style="font-size:.85rem;color:#fff;font-weight:600;margin-top:2px">${esc(user?.name || '')}</div>
          <div style="font-size:.7rem;color:rgba(255,255,255,.35)">${strictAdmin ? 'Administrator' : 'Staff Member'}</div>
        </div>
      </aside>
      <main class="admin-content">${content}</main>
    </div>`;
}

function adminDashboardAgeDays(dateValue) {
  const t = new Date(String(dateValue || '').replace(' ', 'T')).getTime();
  if (!Number.isFinite(t)) return 0;
  return Math.floor((Date.now() - t) / 86400000);
}

function adminDashboardOrderCounts(orders = []) {
  return {
    pending: orders.filter(o => o.status === 'pending').length,
    processing: orders.filter(o => o.status === 'processing').length,
    returns: orders.filter(o => o.status === 'return_requested').length,
    readyToProcess: orders.filter(o => o.status === 'pending' && o.payment_status === 'paid').length,
    readyToShip: orders.filter(o => o.status === 'processing').length,
    oldPending: orders.filter(o => o.status === 'pending' && adminDashboardAgeDays(o.created_at) >= 2).length,
    missingTracking: orders.filter(o => o.status === 'shipped' && !String(o.tracking_number || '').trim()).length,
    reviewRequests: orders.filter(o => o.status === 'delivered' && !o.review_requested_at).length,
  };
}

function adminDashboardWorkCard(href, count, label, note, icon, tone = 'info') {
  return `
    <a href="${href}" data-link class="admin-work-card ${tone}">
      <i class="fas ${icon}"></i>
      <div><strong>${Number(count || 0)}</strong><span>${esc(label)}</span><small>${esc(note)}</small></div>
    </a>`;
}

function adminOpsCard(href, icon, title, note, adminOnly = false) {
  if (adminOnly && !Auth.isStrictAdmin()) return '';
  return `
    <a href="${href}" data-link class="admin-ops-card">
      <i class="fas ${icon}"></i>
      <div><strong>${esc(title)}</strong><span>${esc(note)}</span></div>
    </a>`;
}

function renderLowStockMiniList(products = []) {
  if (!products.length) {
    return '<div class="admin-focus-empty"><i class="fas fa-check-circle"></i><span>No low-stock products in this view.</span></div>';
  }
  return products.map(p => `
    <a href="/admin/products?filter=low_stock&search=${encodeURIComponent(p.name || '')}" data-link class="admin-focus-item">
      ${safeMediaUrl((p.images || [])[0]) ? `<img src="${safeMediaUrl((p.images || [])[0])}" alt="" />` : '<span class="admin-focus-thumb"></span>'}
      <div><strong>${esc(p.name || 'Product')}</strong><span>${Number(p.stock || 0) <= 0 ? 'Out of stock' : `${Number(p.stock || 0)} left`}</span></div>
    </a>`).join('');
}

function renderOrderMiniList(orders = []) {
  if (!orders.length) {
    return '<div class="admin-focus-empty"><i class="fas fa-receipt"></i><span>No orders in this queue.</span></div>';
  }
  return orders.slice(0, 6).map(o => `
    <a href="/admin/orders?q=${encodeURIComponent(o.order_number || '')}" data-link class="admin-focus-item">
      <span class="admin-focus-icon"><i class="fas fa-receipt"></i></span>
      <div><strong>${esc(o.order_number || 'Order')}</strong><span>${esc(o.customer_name || 'Customer')} · ${fmt(o.total || 0)} · ${esc((o.status || '').replace(/_/g, ' '))}</span></div>
    </a>`).join('');
}

async function renderStaffDashboard(gen) {
  const [ordersRes, lowRes, notifyRes] = await Promise.all([
    api.get('/admin/orders'),
    api.get('/admin/products?status=low_stock&per_page=6'),
    api.get('/admin/products?status=notify_waiting&per_page=1'),
  ]);
  if (Router.stale(gen)) return;

  const orders = Array.isArray(ordersRes) ? ordersRes : [];
  const counts = adminDashboardOrderCounts(orders);
  const health = lowRes.health || {};
  const notifyHealth = notifyRes.health || {};
  const recent = orders.slice().sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || ''))).slice(0, 6);
  const attentionTotal = counts.readyToProcess + counts.readyToShip + counts.returns + counts.missingTracking + counts.oldPending;

  document.querySelector('.admin-content').innerHTML = `
    <div class="admin-page-title">Staff Dashboard</div>
    <div class="admin-staff-hero">
      <div>
        <strong>Today's store workflow</strong>
        <span>${attentionTotal ? `${attentionTotal} item${attentionTotal === 1 ? '' : 's'} need attention.` : 'No urgent order work is showing right now.'}</span>
      </div>
      <a href="/admin/orders?view=attention" data-link class="btn btn-primary"><i class="fas fa-list-check"></i> Open work queue</a>
    </div>
    <div class="admin-work-grid" style="margin-bottom:18px">
      ${adminDashboardWorkCard('/admin/orders?view=ready_to_process', counts.readyToProcess, 'Ready to process', 'Paid pending orders waiting to be prepared.', 'fa-box-open', 'info')}
      ${adminDashboardWorkCard('/admin/orders?view=ready_to_ship', counts.readyToShip, 'Ready to ship', 'Processing orders that need tracking.', 'fa-truck-ramp-box', 'info')}
      ${adminDashboardWorkCard('/admin/orders?status=return_requested', counts.returns, 'Returns', 'Return requests waiting for review.', 'fa-undo-alt', 'danger')}
      ${adminDashboardWorkCard('/admin/orders?view=missing_tracking', counts.missingTracking, 'Missing tracking', 'Shipped orders without tracking numbers.', 'fa-truck', 'warn')}
      ${adminDashboardWorkCard('/admin/orders?view=old_pending', counts.oldPending, 'Old pending', 'Pending orders older than 2 days.', 'fa-calendar-xmark', 'danger')}
    </div>
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-icon orders"><i class="fas fa-clock"></i></div><div><div class="stat-value">${counts.pending}</div><div class="stat-label">Pending</div></div></div>
      <div class="stat-card"><div class="stat-icon products"><i class="fas fa-box-open"></i></div><div><div class="stat-value">${counts.processing}</div><div class="stat-label">Processing</div></div></div>
      <div class="stat-card"><div class="stat-icon customers"><i class="fas fa-triangle-exclamation"></i></div><div><div class="stat-value">${Number(health.low_stock || 0)}</div><div class="stat-label">Low Stock</div></div></div>
      <div class="stat-card"><div class="stat-icon revenue"><i class="fas fa-envelope-open-text"></i></div><div><div class="stat-value">${Number(notifyHealth.notify_waiting || 0)}</div><div class="stat-label">Restock Requests</div></div></div>
    </div>
    <div class="admin-ops-panel">
      <div class="admin-alert-board-head">
        <div><strong>Quick actions</strong><span>Shortcuts for repeated staff work.</span></div>
      </div>
      <div class="admin-ops-grid">
        ${adminOpsCard('/admin/orders', 'fa-shopping-bag', 'Orders', 'Search, update status, print slips.')}
        ${adminOpsCard('/admin/products?filter=low_stock', 'fa-triangle-exclamation', 'Low stock', 'Check items that may need restock.')}
        ${adminOpsCard('/admin/products?filter=no_image', 'fa-image', 'No image', 'Find products missing photos.')}
        ${adminOpsCard('/admin/accounts/inventory', 'fa-boxes-stacked', 'Inventory', 'Review stock and inventory records.')}
      </div>
    </div>
    <div class="grid-2" style="gap:18px">
      <div class="card">
        <div class="card-header flex-between"><span>Recent orders</span><a href="/admin/orders" data-link class="btn btn-sm btn-ghost">View all</a></div>
        <div class="admin-focus-list">${renderOrderMiniList(recent)}</div>
      </div>
      <div class="card">
        <div class="card-header flex-between"><span>Low-stock focus</span><a href="/admin/products?filter=low_stock" data-link class="btn btn-sm btn-ghost">Open report</a></div>
        <div class="admin-focus-list">${renderLowStockMiniList(lowRes.products || [])}</div>
      </div>
    </div>`;
}

Router.register('/admin', async () => {
  if (!Auth.isAdmin()) { Router.navigate('/admin/login'); return; }
  adminLayout('<div class="spinner"></div>', '/admin');
  const _gen = Router._gen;
  if (Auth.isStaff()) {
    try { await renderStaffDashboard(_gen); } catch (e) {
      if (Router.stale(_gen)) return;
      document.querySelector('.admin-content').innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-circle"></i><h3>${esc(e.message)}</h3><p>Open Orders if the dashboard could not load.</p></div>`;
    }
    return;
  }
  try {
    const stats = await api.get('/admin/stats');
    if (Router.stale(_gen)) return;
    const orderStatusMap = {};
    stats.order_stats.forEach(s => orderStatusMap[s.status] = s.count);
    const alertCards = [
      { count: stats.pending_orders || 0, label: 'Pending orders', note: 'Review and move paid orders into processing.', icon: 'fa-clock', href: '/admin/orders?status=pending', tone: 'warn' },
      { count: stats.processing_orders || 0, label: 'Processing orders', note: 'Prepare orders and add tracking before shipping.', icon: 'fa-box-open', href: '/admin/orders?status=processing', tone: 'info' },
      { count: stats.return_requests || 0, label: 'Return requests', note: 'Inspect packages before refund decisions.', icon: 'fa-undo-alt', href: '/admin/orders?status=return_requested', tone: 'danger' },
      { count: stats.low_stock?.length || 0, label: 'Low-stock products', note: 'Restock or deactivate products that cannot be sold.', icon: 'fa-triangle-exclamation', href: '/admin/products?filter=low_stock', tone: 'warn' },
      { count: stats.missing_tracking_orders || 0, label: 'Missing tracking', note: 'Shipped orders should have a tracking number.', icon: 'fa-truck', href: '/admin/orders?status=shipped', tone: 'warn' },
      { count: stats.old_pending_orders || 0, label: 'Old pending orders', note: 'Pending orders older than 2 days need review.', icon: 'fa-calendar-xmark', href: '/admin/orders?status=pending', tone: 'danger' },
    ].filter(a => Number(a.count || 0) > 0);

    document.querySelector('.admin-content').innerHTML = `
      <div class="admin-page-title">Dashboard</div>
      ${alertCards.length ? `
      <div class="admin-alert-board">
        <div class="admin-alert-board-head">
          <div><strong>Needs attention</strong><span>Operational items to review today.</span></div>
          <a href="/admin/orders" data-link class="btn btn-sm btn-outline"><i class="fas fa-list-check"></i> Open orders</a>
        </div>
        <div class="admin-alert-grid">
          ${alertCards.map(a => `
            <a href="${a.href}" data-link class="admin-alert-card ${a.tone}">
              <i class="fas ${a.icon}"></i>
              <div><strong>${Number(a.count || 0)}</strong><span>${esc(a.label)}</span><small>${esc(a.note)}</small></div>
            </a>`).join('')}
        </div>
      </div>` : ''}
      <div class="admin-ops-panel">
        <div class="admin-alert-board-head">
          <div><strong>Operations shortcuts</strong><span>Fast paths for the work you check most often.</span></div>
        </div>
        <div class="admin-ops-grid">
          ${adminOpsCard('/admin/orders?view=attention', 'fa-list-check', 'Order work queue', 'Returns, old pending, shipping, and review follow-up.')}
          ${adminOpsCard('/admin/products?filter=low_stock', 'fa-triangle-exclamation', 'Low-stock report', 'Restock or deactivate items before customers get stuck.')}
          ${adminOpsCard('/admin/products?filter=no_image', 'fa-image', 'Missing images', 'Find products that need photos.')}
          ${adminOpsCard('/admin/products?filter=no_cost', 'fa-dollar-sign', 'Missing cost', 'Protect product profit reporting.')}
          ${adminOpsCard('/admin/accounts', 'fa-chart-line', 'Books dashboard', 'Sales, purchases, expenses, reports.')}
          ${adminOpsCard('/admin/security', 'fa-shield-halved', 'Security center', 'Backups, events, health, and exports.', true)}
        </div>
      </div>
      <div class="stats-grid">
        <div class="stat-card"><div class="stat-icon orders"><i class="fas fa-shopping-bag"></i></div><div><div class="stat-value">${stats.total_orders}</div><div class="stat-label">Total Orders</div></div></div>
        <div class="stat-card"><div class="stat-icon revenue"><i class="fas fa-dollar-sign"></i></div><div><div class="stat-value">${fmt(stats.total_revenue)}</div><div class="stat-label">Revenue</div></div></div>
        <div class="stat-card"><div class="stat-icon products"><i class="fas fa-box"></i></div><div><div class="stat-value">${stats.total_products}</div><div class="stat-label">Products</div></div></div>
        <div class="stat-card"><div class="stat-icon customers"><i class="fas fa-users"></i></div><div><div class="stat-value">${stats.total_customers}</div><div class="stat-label">Customers</div></div></div>
        <div class="stat-card" style="border-left:3px solid #d97706"><div class="stat-icon" style="background:#fef3c7;color:#d97706"><i class="fas fa-clock"></i></div><div><div class="stat-value" style="color:#d97706">${stats.pending_orders ?? 0}</div><div class="stat-label">Pending Orders</div></div></div>
      </div>
      <div class="grid-2" style="gap:24px">
        <div class="card">
          <div class="card-header flex-between"><span>Recent Orders</span><a href="/admin/orders" data-link class="btn btn-sm btn-ghost">View All</a></div>
          <div class="table-wrap"><table>
            <thead><tr><th>Order #</th><th>Customer</th><th>Total</th><th>Status</th></tr></thead>
            <tbody>
              ${stats.recent_orders.map(o => `
                <tr>
                  <td><strong>${o.order_number}</strong></td>
                  <td>${esc(o.customer_name)}</td>
                  <td>${fmt(o.total)}</td>
                  <td>${statusBadge(o.status)}</td>
                </tr>`).join('') || '<tr><td colspan="4" class="text-center text-muted" style="padding:24px">No orders yet</td></tr>'}
            </tbody>
          </table></div>
        </div>
        <div class="card">
          <div class="card-header">Order Status Breakdown</div>
          <div class="card-body">
            ${['pending','processing','shipped','delivered','cancelled'].map(s => `
              <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border)">
                <span>${statusBadge(s)}</span>
                <strong>${orderStatusMap[s] || 0}</strong>
              </div>`).join('')}
          </div>
        </div>
      </div>
      ${(stats.low_stock && stats.low_stock.length) ? `
      <div class="card" style="margin-top:24px">
        <div class="card-header flex-between">
          <span><i class="fas fa-exclamation-triangle" style="color:#d97706;margin-right:8px"></i>Low Stock Alert <span style="font-size:.78rem;font-weight:400;color:var(--text-light)">(stock ≤ 5)</span></span>
          <a href="/admin/products" data-link class="btn btn-sm btn-ghost">Manage Products</a>
        </div>
        <div class="table-wrap"><table>
          <thead><tr><th>Product</th><th style="text-align:center">Stock</th></tr></thead>
          <tbody>
            ${stats.low_stock.map(p => `
              <tr>
                <td style="display:flex;align-items:center;gap:10px">
                  ${safeMediaUrl(p.images[0]) ? `<img src="${safeMediaUrl(p.images[0])}" alt="" style="width:36px;height:36px;object-fit:cover;border-radius:6px;flex-shrink:0" />` : '<div style="width:36px;height:36px;background:var(--bg);border-radius:6px;flex-shrink:0"></div>'}
                  <span style="font-weight:600">${esc(p.name)}</span>
                </td>
                <td style="text-align:center">
                  <span style="background:${p.stock === 0 ? '#fee2e2' : '#fef3c7'};color:${p.stock === 0 ? '#dc2626' : '#d97706'};padding:2px 10px;border-radius:12px;font-weight:700;font-size:.85rem">${p.stock === 0 ? 'Out of Stock' : p.stock}</span>
                </td>
              </tr>`).join('')}
          </tbody>
        </table></div>
      </div>` : ''}`;
  } catch (e) {
    if (Router.stale(_gen)) return;
    document.querySelector('.admin-content').innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-circle"></i><h3>${esc(e.message)}</h3><p>Make sure the server is running</p></div>`;
  }
});
