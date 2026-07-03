function adminLayout(content, activePath) {
  const app = document.getElementById('app');
  const strictAdmin = Auth.isStrictAdmin();
  const user = Auth.getUser();

  const allLinks = [
    { href: '/admin',          icon: 'fa-tachometer-alt', label: 'Shop Dashboard',  adminOnly: true },
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

Router.register('/admin', async () => {
  if (!Auth.isAdmin()) { Router.navigate('/admin/login'); return; }
  // Staff cannot see the dashboard — send them to orders
  if (Auth.isStaff()) { Router.navigate('/admin/orders'); return; }
  adminLayout('<div class="spinner"></div>', '/admin');
  const _gen = Router._gen;
  try {
    const stats = await api.get('/admin/stats');
    if (Router.stale(_gen)) return;
    const orderStatusMap = {};
    stats.order_stats.forEach(s => orderStatusMap[s.status] = s.count);
    const alertCards = [
      { count: stats.pending_orders || 0, label: 'Pending orders', note: 'Review and move paid orders into processing.', icon: 'fa-clock', href: '/admin/orders?status=pending', tone: 'warn' },
      { count: stats.processing_orders || 0, label: 'Processing orders', note: 'Prepare orders and add tracking before shipping.', icon: 'fa-box-open', href: '/admin/orders?status=processing', tone: 'info' },
      { count: stats.return_requests || 0, label: 'Return requests', note: 'Inspect packages before refund decisions.', icon: 'fa-undo-alt', href: '/admin/orders?status=return_requested', tone: 'danger' },
      { count: stats.low_stock?.length || 0, label: 'Low-stock products', note: 'Restock or deactivate products that cannot be sold.', icon: 'fa-triangle-exclamation', href: '/admin/products?filter=low-stock', tone: 'warn' },
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
