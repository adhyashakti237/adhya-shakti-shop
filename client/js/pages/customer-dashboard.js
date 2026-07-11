function dashLayout(user, content, activeTab) {
  const app = document.getElementById('app');
  const tabs = [
    { href: '/dashboard',         icon: 'fa-tachometer-alt', label: 'Dashboard' },
    { href: '/dashboard/orders',  icon: 'fa-box',            label: 'My Orders' },
    { href: '/dashboard/profile', icon: 'fa-user',           label: 'Profile' },
    { href: '/wishlist',          icon: 'fa-heart',          label: 'Wishlist' },
  ];
  app.innerHTML = `
    <div class="page">
      <div class="container" style="padding-top:24px">
        <div class="dashboard-layout">
          <div class="dash-sidebar">
            <div class="dash-user">
              <div class="dash-avatar">${esc((user.name || '?')[0].toUpperCase())}</div>
              <div style="font-weight:600">${esc(user.name)}</div>
              <div class="text-sm text-muted">${esc(user.email)}</div>
            </div>
            <nav class="dash-nav">
              ${tabs.map(t => `<a href="${t.href}" data-link class="${activeTab === t.href ? 'active' : ''}"><i class="fas ${t.icon}"></i> ${t.label}</a>`).join('')}
              <a href="#" data-csp-onclick="Auth.logout()"><i class="fas fa-sign-out-alt"></i> Logout</a>
            </nav>
          </div>
          <div id="dash-content">${content}</div>
        </div>
      </div>
    </div>`;
}

function welcomeDiscountBanner(status) {
  if (!status?.available) return '';
  const code = status.code || 'WELCOME10';
  return `
    <div class="account-welcome-offer" style="background:linear-gradient(90deg,rgba(29,92,74,.08),rgba(196,154,34,.08));border:1px solid rgba(29,92,74,.2);border-radius:12px;padding:16px;margin-bottom:18px;display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap">
      <div>
        <div style="font-weight:800;color:var(--primary);margin-bottom:4px"><i class="fas fa-tag"></i> Your first-order discount is ready</div>
        <div class="text-sm text-muted">Use <strong style="color:var(--text)">${esc(code)}</strong> at checkout for 10% off. It works once with this account email.</div>
      </div>
      <button class="btn btn-primary btn-sm" data-csp-onclick="applyWelcomeDiscount()"><i class="fas fa-shopping-cart"></i> Use in cart</button>
    </div>`;
}

const ACCOUNT_ORDER_STEPS = ['pending', 'processing', 'shipped', 'delivered'];

function accountStatusMeta(status) {
  const s = String(status || '').toLowerCase();
  return {
    pending: { label: 'Pending', icon: 'fa-clock', tone: 'pending', message: 'Your order was received and is waiting for review.' },
    processing: { label: 'Processing', icon: 'fa-cog', tone: 'processing', message: 'Your order is being prepared for shipment.' },
    shipped: { label: 'Shipped', icon: 'fa-truck', tone: 'shipped', message: 'Your package is on the way.' },
    delivered: { label: 'Delivered', icon: 'fa-home', tone: 'delivered', message: 'The carrier marked this order delivered.' },
    cancelled: { label: 'Cancelled', icon: 'fa-times-circle', tone: 'cancelled', message: 'This order was cancelled. Refund timing depends on your bank.' },
    return_requested: { label: 'Return Requested', icon: 'fa-undo-alt', tone: 'pending', message: 'Your return request is waiting for package review.' },
    return_received: { label: 'Return Received', icon: 'fa-box-open', tone: 'processing', message: 'Your returned package was received and is being reviewed.' },
    refund_pending: { label: 'Refund Pending', icon: 'fa-hourglass-half', tone: 'pending', message: 'Refund processing has started.' },
    refunded: { label: 'Refunded', icon: 'fa-check-circle', tone: 'delivered', message: 'Refund has been issued to the original payment method.' },
  }[s] || { label: s ? s.replace(/_/g, ' ') : 'Unknown', icon: 'fa-circle', tone: 'pending', message: 'Status update available.' };
}

function customerOrderGuidance(o) {
  const s = String(o?.status || '').toLowerCase();
  const tracking = String(o?.tracking_number || '').trim();
  const support = 'Need help? Reply to your order email or contact contact@adhyashaktishop.com with your order number.';
  const map = {
    pending: 'We received your paid order. If you need to cancel, you can do that before it ships.',
    processing: 'Your order is being prepared. Cancellation is still available until it ships.',
    shipped: tracking ? 'Your order shipped. Tracking may take a little time to update after the carrier scan.' : 'Your order is marked shipped. Tracking will appear here when available.',
    delivered: 'Your order is delivered. If something is wrong, contact us quickly so we can help.',
    cancelled: 'This order was cancelled. If a refund applies, banks usually show it in 5-7 business days.',
    return_requested: 'Return request received. Please ship the package back within 7 business days and keep your receipt.',
    return_received: 'We received the return package. Refund review is in progress.',
    refunded: 'Refund issued. Your bank controls when it appears on your card.',
  };
  return `${map[s] || accountStatusMeta(s).message} ${support}`;
}

function accountOrderTrackingUrl(trackingNumber) {
  const tracking = String(trackingNumber || '').trim();
  if (!tracking) return '';
  return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${encodeURIComponent(tracking)}`;
}

function accountOrderNextAction(o) {
  const s = String(o?.status || '').toLowerCase();
  const tracking = String(o?.tracking_number || '').trim();
  if (s === 'pending') return { icon: 'fa-clock', tone: 'warn', text: 'We received your order. You can still cancel before it ships.' };
  if (s === 'processing') return { icon: 'fa-box-open', tone: 'info', text: 'We are preparing your order. Tracking appears after shipping.' };
  if (s === 'shipped' && tracking) return { icon: 'fa-truck-fast', tone: 'info', text: `Tracking is ready: ${tracking}` };
  if (s === 'shipped') return { icon: 'fa-truck', tone: 'info', text: 'Shipped. Tracking will show here when it is available.' };
  if (s === 'delivered') return { icon: 'fa-star', tone: 'success', text: 'Delivered. You can write a review or contact us if anything is wrong.' };
  if (s === 'return_requested') return { icon: 'fa-undo-alt', tone: 'warn', text: 'Return request received. Ship it back within 7 business days.' };
  if (s === 'return_received') return { icon: 'fa-box-open', tone: 'info', text: 'Return package received. Refund review is in progress.' };
  if (s === 'cancelled') return { icon: 'fa-ban', tone: 'danger', text: 'Cancelled. Refund timing depends on your bank.' };
  if (s === 'refunded') return { icon: 'fa-check-circle', tone: 'success', text: 'Refund issued to the original payment method.' };
  return { icon: 'fa-circle-info', tone: 'info', text: accountStatusMeta(s).message };
}

function accountOrderNextActionHtml(o) {
  const next = accountOrderNextAction(o);
  return `<div class="account-order-next ${next.tone}"><i class="fas ${next.icon}"></i><span>${esc(next.text)}</span></div>`;
}

function accountOrderTrackingPanel(o) {
  const tracking = String(o?.tracking_number || '').trim();
  const href = accountOrderTrackingUrl(tracking);
  if (!tracking) {
    return `
      <div class="account-tracking-panel muted">
        <i class="fas fa-truck"></i>
        <div>
          <strong>Tracking not available yet</strong>
          <span>We will add tracking once the package is ready with the carrier.</span>
        </div>
      </div>`;
  }
  return `
    <div class="account-tracking-panel">
      <i class="fas fa-truck-fast"></i>
      <div>
        <strong>${esc(tracking)}</strong>
        <span>Carrier scans can take a little time to update after shipment.</span>
      </div>
      <a class="btn btn-sm btn-outline account-tracking-link" href="${href}" target="_blank" rel="noopener">
        Track package <i class="fas fa-external-link-alt"></i>
      </a>
    </div>`;
}

function accountOrderSupportStrip(o) {
  return `
    <div class="account-support-strip">
      <i class="fas fa-headset"></i>
      <div>
        <strong>Need help with this order?</strong>
        <span>Email <a href="mailto:contact@adhyashaktishop.com?subject=Order%20${encodeURIComponent(o?.order_number || '')}">contact@adhyashaktishop.com</a> and include order <b>${esc(o?.order_number || '')}</b>.</span>
      </div>
    </div>`;
}

function accountReturnReasonHtml(o) {
  const reason = String(o?.return_reason || '').trim();
  if (!reason) return '';
  return `
    <div class="account-return-reason">
      <div><i class="fas fa-message"></i> Return reason</div>
      <p>${esc(reason)}</p>
    </div>`;
}

function accountRefundResultMeta(result, paymentStatus) {
  const r = String(result || '').toLowerCase();
  const p = String(paymentStatus || '').toLowerCase();
  if (r === 'refunded_automatically' || p === 'refunded') {
    return {
      icon: 'fa-check-circle',
      title: 'Refund issued automatically',
      text: 'The refund was sent back to the original payment method. Most banks show it within 5-7 business days.',
      tone: 'success',
    };
  }
  if (r === 'manual_refund_required' || p === 'refund_pending') {
    return {
      icon: 'fa-clock',
      title: 'Refund needs team review',
      text: 'The order is cancelled and our team needs to complete the refund from Stripe/admin.',
      tone: 'warn',
    };
  }
  if (r === 'no_payment_to_refund') {
    return {
      icon: 'fa-info-circle',
      title: 'No captured payment to refund',
      text: 'The order was cancelled before a captured payment needed to be refunded.',
      tone: 'info',
    };
  }
  return {
    icon: 'fa-info-circle',
    title: 'Refund status',
    text: 'If a refund applies, timing depends on the original payment method and your bank.',
    tone: 'info',
  };
}

function accountCancellationDetailsHtml(o) {
  const status = String(o?.status || '').toLowerCase();
  const payment = String(o?.payment_status || '').toLowerCase();
  if (status !== 'cancelled' && payment !== 'refund_pending' && payment !== 'refunded') return '';
  const refund = accountRefundResultMeta(o?.refund_result, payment);
  const by = String(o?.cancelled_by || '').toLowerCase();
  const who = by === 'customer' ? 'Cancelled by you' : by === 'admin' || by === 'staff' ? 'Cancelled by our team' : 'Cancelled';
  const when = o?.cancelled_at ? fmtDate(o.cancelled_at) : '';
  return `
    <div class="account-cancel-panel ${refund.tone}" style="border:1px solid var(--border);border-radius:12px;padding:14px;margin:0 0 16px;background:#fff">
      <div style="display:flex;gap:10px;align-items:flex-start">
        <i class="fas ${refund.icon}" style="margin-top:2px;color:${refund.tone === 'success' ? 'var(--success)' : refund.tone === 'warn' ? '#d97706' : 'var(--primary)'}"></i>
        <div style="min-width:0">
          <div style="font-weight:800;color:var(--text);margin-bottom:4px">${esc(who)}${when ? ` on ${esc(when)}` : ''}</div>
          <div style="font-size:.9rem;color:var(--text-light);line-height:1.55"><strong>${esc(refund.title)}.</strong> ${esc(refund.text)}</div>
        </div>
      </div>
    </div>`;
}

function accountOrderTimeline(status, compact = false) {
  const current = ACCOUNT_ORDER_STEPS.indexOf(String(status || '').toLowerCase());
  const special = current === -1;
  if (special) {
    const meta = accountStatusMeta(status);
    return `<div class="account-special-status ${meta.tone}"><i class="fas ${meta.icon}"></i><span>${esc(meta.message)}</span></div>`;
  }
  return `
    <div class="account-order-timeline ${compact ? 'compact' : ''}">
      ${ACCOUNT_ORDER_STEPS.map((step, idx) => {
        const meta = accountStatusMeta(step);
        const state = idx < current ? 'done' : idx === current ? 'current' : '';
        return `
          <div class="account-timeline-step ${state}">
            <span class="account-step-dot"><i class="fas ${idx < current ? 'fa-check' : meta.icon}"></i></span>
            <span class="account-step-label">${meta.label}</span>
          </div>`;
      }).join('')}
    </div>`;
}

function accountOrderCard(o, compact = false) {
  const itemCount = Array.isArray(o.items) ? o.items.length : 0;
  const firstItem = itemCount ? o.items[0] : null;
  const itemText = itemCount ? o.items.map(i => i.name || '').filter(Boolean).join(' ') : '';
  const itemPreview = itemCount ? o.items.slice(0, 2).map(i => {
    const opt = i.variation ? ` (${i.variation})` : '';
    return `${i.qty || 1}x ${i.name || 'Item'}${opt}`;
  }).join(' · ') : '';
  return `
    <article class="account-order-card" data-order="${esc(`${o.order_number || ''} ${itemText} ${o.status || ''} ${o.payment_status || ''}`.toLowerCase())}" data-status="${esc(o.status || '')}" data-payment="${esc(o.payment_status || '')}">
      <div class="account-order-main">
        <div>
          <div class="account-order-number">${esc(o.order_number || '')}</div>
          <div class="text-muted text-sm">${fmtDate(o.created_at)} · ${itemCount} item${itemCount === 1 ? '' : 's'}${firstItem ? ` · ${esc(firstItem.name || '')}` : ''}</div>
          ${itemPreview ? `<div class="account-order-preview">${esc(itemPreview)}</div>` : ''}
        </div>
        <div class="account-order-total">${fmt(o.total || 0)}</div>
      </div>
      ${accountOrderTimeline(o.status, compact)}
      ${accountOrderNextActionHtml(o)}
      <div class="account-order-footer">
        <div class="account-order-badges">
          ${statusBadge(o.payment_status)}
          ${statusBadge(o.status)}
        </div>
        <div class="account-order-actions">
          <button class="btn btn-sm btn-outline" data-csp-onclick="trackOrder('${esc(o.id)}','${esc(o.status)}','${esc(o.tracking_number || '')}')"><i class="fas fa-map-marker-alt"></i> Track</button>
          <button class="btn btn-sm btn-primary" data-csp-onclick="viewOrder('${esc(o.id)}')"><i class="fas fa-eye"></i> Details</button>
        </div>
      </div>
    </article>`;
}

function parseAccountAddress(profile) {
  try {
    const parsed = profile && profile.address ? JSON.parse(profile.address || '{}') : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function accountAddressPreview(addr) {
  const line = [addr.line1, addr.landmark].filter(Boolean).join(', ');
  const cityLine = [addr.city, addr.state].filter(Boolean).join(', ') + (addr.pin ? ` ${addr.pin}` : '');
  return [line, cityLine].filter(Boolean).join(' · ');
}

function showOrderTracking(id, status, trackingNumber = '') {
  const steps = ['pending', 'processing', 'shipped', 'delivered'];
  const curIdx = steps.indexOf(status);
  const specialLabels = {
    cancelled:        { icon: 'fa-times-circle', color: 'var(--danger)',  text: 'This order was cancelled.' },
    return_requested: { icon: 'fa-undo-alt',      color: '#c2410c',       text: 'Return requested. Please ship the package back within 7 business days.' },
    return_received:  { icon: 'fa-check-circle',  color: 'var(--success)',text: 'We have received your return. Refund is being processed.' },
    refund_pending:   { icon: 'fa-hourglass-half',color: '#d97706',       text: 'Your refund is being processed. It will appear on your card within 5-7 business days.' },
    refunded:         { icon: 'fa-check-circle',  color: 'var(--success)',text: 'Your refund has been issued.' },
  };
  const special = specialLabels[status];
  openModal(`
    <div class="modal-header"><h3><i class="fas fa-map-marker-alt" style="color:var(--primary);margin-right:8px"></i>Order Tracking</h3><button class="modal-close" data-csp-onclick="closeModal()" aria-label="Close">×</button></div>
    <div class="modal-body">
      ${special ? `
        <div style="text-align:center;padding:20px 0">
          <i class="fas ${special.icon}" style="font-size:3rem;color:${special.color};display:block;margin-bottom:16px"></i>
          <div style="font-size:1rem;font-weight:700;color:${special.color};margin-bottom:8px">${special.text}</div>
        </div>` : accountOrderTimeline(status)}
      ${accountOrderTrackingPanel({ status, tracking_number: trackingNumber })}
      <div class="account-support-strip" style="margin-top:12px">
        <i class="fas fa-circle-info"></i>
        <div>
          <strong>Status updates are automatic</strong>
          <span>If a carrier scan is delayed, check again later or contact us with your order number.</span>
        </div>
      </div>
    </div>`);
}

Router.register('/dashboard', async () => {
  if (!Auth.isLoggedIn()) { Router.navigate('/login'); return; }
  const user = Auth.getUser();
  const _gen = Router._gen;

  try {
    const [orders, welcomeStatus] = await Promise.all([
      api.get('/orders/my'),
      api.get('/welcome-discount/status').catch(() => null),
    ]);
    if (Auth.isLoggedIn() && !Auth.isAdmin()) {
      try { await Wishlist.syncFromServer({ mergeLocal: true }); } catch {}
    }
    if (Router.stale(_gen)) return;
    const pending = orders.filter(o => o.status === 'pending').length;
    const active = orders.filter(o => ['pending', 'processing', 'shipped'].includes(o.status)).length;
    const delivered = orders.filter(o => o.status === 'delivered').length;
    const paidTotal = orders
      .filter(o => ['paid', 'refunded', 'refund_pending'].includes(String(o.payment_status || '').toLowerCase()))
      .reduce((sum, o) => sum + Number(o.total || 0), 0);
    const purchasedItems = orders.reduce((sum, o) => sum + (Array.isArray(o.items) ? o.items.reduce((s, i) => s + Number(i.qty || 0), 0) : 0), 0);
    const wishlistCount = Wishlist.get().length;
    const latest = orders[0];
    dashLayout(user, `
      <div class="account-page">
        ${welcomeDiscountBanner(welcomeStatus)}
        <section class="account-hero">
          <div>
            <div class="account-kicker">My Account</div>
            <h1>Welcome back, ${esc((user.name || '').split(' ')[0] || 'there')}</h1>
            <p>Track your orders, manage your profile, and get back to products you saved.</p>
          </div>
          <div class="account-hero-actions">
            <a href="/products" data-link class="btn btn-primary"><i class="fas fa-store"></i> Shop Again</a>
            <a href="/contact" data-link class="btn btn-outline"><i class="fas fa-headset"></i> Support</a>
          </div>
        </section>

        <div class="stats-grid-3 account-stat-grid">
          <div class="stat-card"><div class="stat-icon orders"><i class="fas fa-box"></i></div><div><div class="stat-value">${orders.length}</div><div class="stat-label">Total orders</div></div></div>
          <div class="stat-card"><div class="stat-icon products"><i class="fas fa-truck"></i></div><div><div class="stat-value">${active}</div><div class="stat-label">Active orders</div></div></div>
          <div class="stat-card"><div class="stat-icon revenue"><i class="fas fa-heart"></i></div><div><div class="stat-value">${wishlistCount}</div><div class="stat-label">Saved items</div></div></div>
        </div>

        <div class="account-overview-grid">
          <div class="card account-panel">
            <div class="card-header flex-between"><span>Recent Orders</span><a href="/dashboard/orders" data-link class="btn btn-sm btn-ghost">View All</a></div>
            <div class="card-body account-order-list">
              ${orders.slice(0, 3).map(o => accountOrderCard(o, true)).join('') || `
                <div class="empty-state account-empty-inline">
                  <i class="fas fa-box-open"></i>
                  <h3>No orders yet</h3>
                  <p>When you place an order, tracking and receipts will appear here.</p>
                  <a href="/products" data-link class="btn btn-primary mt-16">Browse Products</a>
                </div>`}
            </div>
          </div>
          <div class="card account-panel">
            <div class="card-header">Account Snapshot</div>
            <div class="card-body">
              <div class="account-snapshot-row"><span>Email</span><strong>${esc(user.email || '')}</strong></div>
              <div class="account-snapshot-row"><span>Latest order</span><strong>${latest ? esc(latest.order_number) : 'None yet'}</strong></div>
              <div class="account-snapshot-row"><span>Purchase total</span><strong>${fmt(paidTotal)}</strong></div>
              <div class="account-snapshot-row"><span>Items purchased</span><strong>${purchasedItems}</strong></div>
              <div class="account-snapshot-row"><span>Pending orders</span><strong>${pending}</strong></div>
              <div class="account-snapshot-row"><span>Delivered orders</span><strong>${delivered}</strong></div>
              <div class="account-action-stack">
                <a href="/dashboard/profile" data-link class="btn btn-outline btn-sm"><i class="fas fa-user-pen"></i> Update Profile</a>
                <a href="/wishlist" data-link class="btn btn-outline btn-sm"><i class="fas fa-heart"></i> Open Wishlist</a>
                <a href="/track-order" data-link class="btn btn-outline btn-sm"><i class="fas fa-location-dot"></i> Track by Order #</a>
              </div>
            </div>
          </div>
        </div>
      </div>`, '/dashboard');
  } catch (e) { if (Router.stale(_gen)) return; dashLayout(user, `<div class="empty-state"><i class="fas fa-exclamation-circle"></i><h3>${esc(e.message)}</h3></div>`, '/dashboard'); }

  window.viewOrder = (id) => openOrderModal(id);
  window.trackOrder = showOrderTracking;
  window.applyWelcomeDiscount = () => {
    sessionStorage.setItem('cart_coupon_code', welcomeStatus?.code || 'WELCOME10');
    Router.navigate('/cart');
  };
});

Router.register('/dashboard/orders', async () => {
  if (!Auth.isLoggedIn()) { Router.navigate('/login'); return; }
  const user = Auth.getUser();
  const _gen = Router._gen;

  try {
    const orders = await api.get('/orders/my');
    if (Router.stale(_gen)) return;
    const active = orders.filter(o => ['pending', 'processing', 'shipped'].includes(o.status)).length;
    const delivered = orders.filter(o => o.status === 'delivered').length;
    const paidTotal = orders
      .filter(o => ['paid', 'refunded', 'refund_pending'].includes(String(o.payment_status || '').toLowerCase()))
      .reduce((sum, o) => sum + Number(o.total || 0), 0);
    dashLayout(user, `
      <div class="account-page">
        <div class="admin-page-title">My Orders</div>
        <p class="text-muted" style="margin-top:-10px;margin-bottom:18px">Track status, open receipts, and manage eligible cancellations or returns.</p>
        ${orders.length ? `
          <div class="account-order-summary-grid">
            <div><strong>${orders.length}</strong><span>Total orders</span></div>
            <div><strong>${active}</strong><span>Active</span></div>
            <div><strong>${delivered}</strong><span>Delivered</span></div>
            <div><strong>${fmt(paidTotal)}</strong><span>Purchase total</span></div>
          </div>` : ''}
        ${orders.length ? `
          <div class="flex-between mb-16" style="flex-wrap:wrap;gap:10px">
            <input class="form-control" id="order-search" style="max-width:320px" placeholder="Search order #, product, or status..." data-csp-oninput="filterMyOrders()" />
            <select class="form-control" id="order-status-filter" style="max-width:180px" data-csp-onchange="filterMyOrders()">
              <option value="">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="processing">Processing</option>
              <option value="shipped">Shipped</option>
              <option value="delivered">Delivered</option>
              <option value="cancelled">Cancelled</option>
              <option value="refunded">Refunded</option>
            </select>
          </div>
          <div id="my-orders-body" class="account-order-list account-order-list-full">
            ${orders.map(o => accountOrderCard(o)).join('')}
          </div>` :
          `<div class="empty-state"><i class="fas fa-box"></i><h3>No orders yet</h3><p>Start shopping to see your orders here</p><a href="/products" data-link class="btn btn-primary mt-16">Browse Products</a></div>`}
      </div>`, '/dashboard/orders');
  } catch {}

  window.filterMyOrders = () => {
    const search = (document.getElementById('order-search')?.value || '').toLowerCase();
    const status = document.getElementById('order-status-filter')?.value || '';
    document.querySelectorAll('#my-orders-body .account-order-card').forEach(row => {
      const matchSearch = !search || row.dataset.order?.includes(search);
      const matchStatus = !status || row.dataset.status === status || row.dataset.payment === status;
      row.style.display = matchSearch && matchStatus ? '' : 'none';
    });
  };

  window.viewOrder = (id) => openOrderModal(id);
  window.trackOrder = showOrderTracking;
});

Router.register('/dashboard/profile', async () => {
  if (!Auth.isLoggedIn()) { Router.navigate('/login'); return; }
  const user = Auth.getUser();
  const _gen = Router._gen;

  let profile;
  try { profile = await api.get('/auth/me'); } catch { profile = user; }
  if (Router.stale(_gen)) return;
  const savedAddress = parseAccountAddress(profile);
  const addressPreview = accountAddressPreview(savedAddress);

  dashLayout(user, `
    <div class="account-page">
      <div class="admin-page-title">My Profile</div>
      <p class="text-muted" style="margin-top:-10px;margin-bottom:18px">Keep your contact details current so order updates and support messages reach you.</p>
      <div class="account-profile-grid">
        <div class="card account-panel">
          <div class="card-header">Account Details</div>
          <div class="card-body">
            <div class="account-profile-summary">
              <div class="dash-avatar">${esc((profile.name || user.name || '?')[0].toUpperCase())}</div>
              <div>
                <h3>${esc(profile.name || user.name || '')}</h3>
                <p>${esc(profile.email || user.email || '')}</p>
              </div>
            </div>
            <form data-csp-onsubmit="saveProfile(event)" class="account-form">
              <div class="form-row">
                <div class="form-group"><label class="form-label">Full Name</label><input class="form-control" id="p-name" value="${esc(profile.name || '')}" autocomplete="name" required /></div>
                <div class="form-group"><label class="form-label">Phone</label><input class="form-control" id="p-phone" type="tel" value="${esc(profile.phone || '')}" placeholder="Phone number" autocomplete="tel" inputmode="tel" /></div>
              </div>
              <div class="form-group"><label class="form-label">Email</label><input class="form-control" value="${esc(profile.email)}" autocomplete="email" disabled /><div class="text-muted text-sm" style="margin-top:5px">Email is used for login and order updates.</div></div>
              <div class="account-saved-address">
                <i class="fas fa-location-dot"></i>
                <div>
                  <strong>Saved shipping address</strong>
                  <span>${addressPreview ? esc(addressPreview) : 'Add your address once, then checkout can fill it automatically.'}</span>
                </div>
              </div>
              <div class="form-group"><label class="form-label">Street Address</label><input class="form-control" id="p-address" value="${esc(savedAddress.line1 || '')}" placeholder="123 Main St" autocomplete="street-address" /></div>
              <div class="form-row">
                <div class="form-group"><label class="form-label">City</label><input class="form-control" id="p-city" value="${esc(savedAddress.city || '')}" placeholder="City" autocomplete="address-level2" /></div>
                <div class="form-group"><label class="form-label">State</label><input class="form-control" id="p-state" value="${esc(savedAddress.state || '')}" placeholder="NJ" autocomplete="address-level1" /></div>
              </div>
              <div class="form-row">
                <div class="form-group"><label class="form-label">ZIP Code</label><input class="form-control" id="p-pin" value="${esc(savedAddress.pin || savedAddress.zip || '')}" placeholder="08817" maxlength="10" autocomplete="postal-code" inputmode="numeric" /></div>
                <div class="form-group"><label class="form-label">Apt / Suite / Unit</label><input class="form-control" id="p-landmark" value="${esc(savedAddress.landmark || '')}" placeholder="Apt 4B" autocomplete="address-line2" /></div>
              </div>
              <button class="btn btn-primary" type="submit"><i class="fas fa-save"></i> Save Changes</button>
            </form>
          </div>
        </div>
        <div class="card account-panel">
          <div class="card-header"><i class="fas fa-lock" style="margin-right:8px;color:var(--primary)"></i>Password & Security</div>
          <div class="card-body">
            <div class="account-security-note">
              <i class="fas fa-shield-halved"></i>
              <span>Use a password you do not use on other websites. After changing it, older sessions are revoked by the server.</span>
            </div>
            <form data-csp-onsubmit="changePassword(event)" class="account-form">
              <div class="form-group"><label class="form-label">Current Password</label><input class="form-control" id="cp-current" type="password" placeholder="Enter current password" required autocomplete="current-password" /></div>
              <div class="form-group"><label class="form-label">New Password</label><input class="form-control" id="cp-new" type="password" placeholder="Min. 8 characters" required autocomplete="new-password" />
                <div style="font-size:.76rem;color:var(--text-light);margin-top:5px">Must include uppercase, lowercase, number and special character.</div>
              </div>
              <div class="form-group"><label class="form-label">Confirm New Password</label><input class="form-control" id="cp-confirm" type="password" placeholder="Repeat new password" required autocomplete="new-password" /></div>
              <button class="btn btn-primary" type="submit" id="cp-btn"><i class="fas fa-key"></i> Update Password</button>
            </form>
          </div>
        </div>
      </div>
    </div>`, '/dashboard/profile');

  window.saveProfile = async (e) => {
    e.preventDefault();
    try {
      const pin = document.getElementById('p-pin').value.trim();
      if (pin && !/^\d{5}(?:-\d{4})?$/.test(pin)) {
        toast('Please enter a valid US ZIP code.', 'warning');
        document.getElementById('p-pin').focus();
        return;
      }
      await api.put('/user/profile', {
        name: document.getElementById('p-name').value,
        phone: document.getElementById('p-phone').value,
        address: {
          line1: document.getElementById('p-address').value,
          city: document.getElementById('p-city').value,
          state: document.getElementById('p-state').value,
          pin,
          landmark: document.getElementById('p-landmark').value,
        },
      });
      toast('Profile updated!', 'success');
    } catch (err) { toast(err.message, 'error'); }
  };

  window.changePassword = async (e) => {
    e.preventDefault();
    const newPw = document.getElementById('cp-new').value;
    if (newPw !== document.getElementById('cp-confirm').value) { toast('New passwords do not match', 'warning'); return; }
    const btn = document.getElementById('cp-btn');
    btn.disabled = true; btn.textContent = 'Updating...';
    try {
      const res = await api.post('/auth/change-password', {
        current_password: document.getElementById('cp-current').value,
        new_password: newPw,
      });
      toast(res.message, 'success');
      (e.target?.closest?.('form') || document.querySelector('form[data-csp-onsubmit="changePassword(event)"]'))?.reset();
    } catch (err) { toast(err.message, 'error'); }
    finally { btn.disabled = false; btn.innerHTML = '<i class="fas fa-key"></i> Update Password'; }
  };
});

async function openOrderModal(id) {
  const _gen = Router._gen;
  try {
    const o = await api.get(`/orders/${id}`);
    if (Router.stale(_gen)) return;
    const addr = o.shipping_address || {};
    openModal(`
      <div class="modal-header">
        <h3><i class="fas fa-receipt" style="color:var(--primary);margin-right:8px"></i>Order #${esc(o.order_number || '')}</h3>
        <button class="modal-close" data-csp-onclick="closeModal()" aria-label="Close">×</button>
      </div>
      <div class="modal-body">

        <!-- Status row -->
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:16px;padding-bottom:16px;border-bottom:1px solid var(--border)">
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
            <div>
              <div style="font-size:.68rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-light);margin-bottom:3px">Payment</div>
              ${statusBadge(o.payment_status)}
            </div>
            <div style="color:var(--border)">|</div>
            <div>
              <div style="font-size:.68rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-light);margin-bottom:3px">Order Status</div>
              ${statusBadge(o.status)}
            </div>
          </div>
          <div style="text-align:right">
            <div style="font-size:.72rem;color:var(--text-light)">Ordered on</div>
            <div style="font-size:.88rem;font-weight:600">${fmtDate(o.created_at)}</div>
          </div>
        </div>

        <div style="margin-bottom:16px">
          ${accountOrderTimeline(o.status)}
        </div>

        ${accountOrderNextActionHtml(o)}
        ${accountReturnReasonHtml(o)}
        ${accountCancellationDetailsHtml(o)}

        <div class="alert alert-info" style="margin-bottom:16px">
          <strong>${esc(accountStatusMeta(o.status).label)}:</strong>
          ${esc(customerOrderGuidance(o))}
        </div>

        ${o.payment_status === 'paid' ? `
        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:10px 14px;margin-bottom:16px;display:flex;align-items:center;gap:10px">
          <i class="fas fa-check-circle" style="color:var(--success);font-size:1.1rem"></i>
          <div style="font-size:.84rem"><strong style="color:var(--success)">Payment received.</strong> Your card was charged ${fmt(o.total)}. You'll receive a Stripe receipt by email.</div>
        </div>` : ''}

        ${o.status === 'pending' ? `
        <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:10px 14px;margin-bottom:16px;display:flex;align-items:center;gap:10px">
          <i class="fas fa-clock" style="color:#d97706;font-size:1.1rem"></i>
          <div style="font-size:.84rem"><strong style="color:#d97706">Order is waiting for review.</strong> We will update the status as it moves into processing and shipping.</div>
        </div>` : ''}

        ${o.status === 'delivered' ? `
        <div class="account-review-nudge">
          <i class="fas fa-star"></i>
          <div>
            <strong>How was everything?</strong>
            <span>Your review helps other shoppers. If something arrived wrong or damaged, contact us first so we can fix it.</span>
          </div>
        </div>` : ''}

        <!-- Items -->
        <div style="font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-light);margin-bottom:10px">Items Ordered</div>
        ${o.items.map(i => `
          <div style="display:flex;gap:12px;padding:12px 0;border-bottom:1px solid var(--border);align-items:flex-start">
            <img src="${safeMediaUrl(i.image, 'https://placehold.co/56x56/f5f5f5/999?text=?')}"
              style="width:56px;height:56px;object-fit:cover;border-radius:8px;border:1px solid var(--border);flex-shrink:0"
              data-csp-onerror="this.src='https://placehold.co/56x56/f5f5f5/999?text=?'" />
            <div style="flex:1">
              <div style="font-weight:700;margin-bottom:2px">${esc(i.name)}</div>
              ${i.variation ? `<div style="font-size:.8rem;color:var(--text-light);margin-bottom:2px"><i class="fas fa-palette" style="font-size:.7rem"></i> ${esc(i.variation)}</div>` : ''}
              ${i.customPrint ? `
                <div style="font-size:.78rem;color:var(--primary);font-weight:600;margin-top:3px">
                  <i class="fas fa-print" style="font-size:.7rem"></i>
                  Custom Print — ${i.customPrint.placement === 'both' ? 'Front & Back' : i.customPrint.placement === 'front' ? 'Front Only' : 'Back Only'}
                  ${i.customPrint.extra_charge ? `(+$${Number(i.customPrint.extra_charge).toFixed(2)})` : ''}
                </div>` : ''}
              <div style="font-size:.82rem;color:var(--text-light);margin-top:2px">Qty: ${i.qty} × ${fmt(i.price)}</div>
            </div>
            <div style="font-weight:700;font-size:.95rem;white-space:nowrap">${fmt(i.price * i.qty)}</div>
          </div>`).join('')}

        <!-- Totals -->
        <div style="margin-top:12px">
          <div class="summary-row"><span>Subtotal</span><span>${fmt(o.subtotal)}</span></div>
          ${o.discount > 0 ? `<div class="summary-row"><span>Discount${o.coupon_code ? ` (${esc(o.coupon_code)})` : ''}</span><span style="color:var(--success)">-${fmt(o.discount)}</span></div>` : ''}
          <div class="summary-row"><span>Shipping</span><span>${o.shipping_charge === 0 ? '<span style="color:var(--success)">FREE</span>' : fmt(o.shipping_charge)}</span></div>
          <div class="summary-row total"><span>Total Charged</span><span style="color:var(--primary)">${fmt(o.total)}</span></div>
        </div>

        <!-- Shipping address -->
        <div style="margin-top:16px;padding:12px 14px;background:var(--bg);border-radius:8px">
          <div style="font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-light);margin-bottom:6px"><i class="fas fa-map-marker-alt"></i> Shipping Address</div>
          <div style="font-size:.88rem;line-height:1.6">${esc(addr.line1)}${addr.landmark ? ', ' + esc(addr.landmark) : ''}<br>${esc(addr.city)}, ${esc(addr.state)} ${esc(addr.pin || addr.zip || '')}</div>
        </div>

        <div style="margin-top:12px">${accountOrderTrackingPanel(o)}</div>
        ${accountOrderSupportStrip(o)}

      </div>
      <div class="modal-footer" style="flex-wrap:wrap;gap:8px">
        <button class="btn btn-ghost" type="button" data-csp-onclick="closeModal()">Close</button>
        ${['pending','processing'].includes(o.status) ? `
          <button class="btn btn-outline" style="border-color:var(--danger);color:var(--danger)"
            type="button" data-csp-onclick="confirmCancelOrder('${esc(o.id)}','${esc(o.order_number || '')}')">
            <i class="fas fa-times-circle"></i> Cancel Order & Refund
          </button>` : ''}
        ${['shipped','delivered'].includes(o.status) ? `
          <button class="btn btn-outline" style="border-color:#c2410c;color:#c2410c"
            data-csp-onclick="confirmRequestReturn('${o.id}','${o.order_number}')">
            <i class="fas fa-undo-alt"></i> Request Return
          </button>` : ''}
        ${o.status === 'delivered' ? `
          <button class="btn btn-outline" style="border-color:var(--gold);color:var(--gold)"
            data-csp-onclick="openWriteReview(${JSON.stringify(o.items).replace(/"/g,'&quot;')})">
            <i class="fas fa-star"></i> Write a Review
          </button>` : ''}
        <button class="btn btn-outline" data-csp-onclick="printInvoice('${o.id}')">
          <i class="fas fa-file-download"></i> Download Invoice
        </button>
      </div>`);

  } catch (e) { toast(e.message, 'error'); }
}

window.openWriteReview = (items) => {
  const products = (Array.isArray(items) ? items : []).filter(i => i.id);
  if (!products.length) { toast('No products found in this order.', 'error'); return; }

  let selectedProduct = products[0];
  let selectedRating  = 0;

  const renderStars = () => {
    document.querySelectorAll('.wr-star').forEach((s, i) => {
      s.style.color = i < selectedRating ? 'var(--gold)' : 'var(--border)';
    });
  };

  openModal(`
    <div class="modal-header">
      <h3><i class="fas fa-star" style="color:var(--gold);margin-right:8px"></i>Write a Review</h3>
      <button class="modal-close" data-csp-onclick="closeModal()" aria-label="Close">×</button>
    </div>
    <div class="modal-body" style="display:flex;flex-direction:column;gap:16px">
      ${products.length > 1 ? `
        <div class="form-group">
          <label class="form-label">Select Product</label>
          <select class="form-control" id="wr-product" data-csp-onchange="window._wrSelectProduct(this.value)">
            ${products.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}
          </select>
        </div>` : `<div style="font-weight:600;color:var(--text)">${esc(products[0].name)}</div>`}
      <div class="form-group">
        <label class="form-label">Your Rating *</label>
        <div style="display:flex;gap:6px;font-size:1.8rem;cursor:pointer">
          ${[1,2,3,4,5].map(n => `<span class="wr-star" data-csp-onclick="window._wrRate(${n})" style="color:var(--border);transition:color .15s" title="${n} star${n>1?'s':''}">★</span>`).join('')}
        </div>
        <div id="wr-rating-err" style="color:var(--danger);font-size:.78rem;margin-top:4px;display:none">Please select a rating.</div>
      </div>
      <div class="form-group">
        <label class="form-label">Your Review</label>
        <textarea id="wr-comment" class="form-control" rows="4" placeholder="Share your experience with this product..." style="resize:vertical"></textarea>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" data-csp-onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" id="wr-submit-btn" data-csp-onclick="window._wrSubmit()"><i class="fas fa-paper-plane"></i> Submit Review</button>
    </div>`);

  window._wrSelectProduct = (id) => { selectedProduct = products.find(p => p.id === id) || products[0]; };
  window._wrRate = (n) => { selectedRating = n; renderStars(); document.getElementById('wr-rating-err').style.display = 'none'; };
  window._wrSubmit = async () => {
    if (!selectedRating) { document.getElementById('wr-rating-err').style.display = 'block'; return; }
    const btn = document.getElementById('wr-submit-btn');
    btn.disabled = true; btn.textContent = 'Submitting...';
    try {
      await api.post(`/products/${selectedProduct.id}/reviews`, {
        rating:  selectedRating,
        comment: (document.getElementById('wr-comment')?.value || '').trim(),
      });
      closeModal();
      toast('Thank you for your review!', 'success');
    } catch (err) {
      toast(err.message || 'Could not submit review. Please try again.', 'error');
      btn.disabled = false; btn.innerHTML = '<i class="fas fa-paper-plane"></i> Submit Review';
    }
  };
  renderStars();
};

window.confirmCancelOrder = (id, orderNum) => {
  closeModal();
  openModal(`
    <div class="modal-header"><h3><i class="fas fa-exclamation-triangle" style="color:var(--danger);margin-right:8px"></i>Cancel Order?</h3><button class="modal-close" data-csp-onclick="closeModal()" aria-label="Close">×</button></div>
    <div class="modal-body">
      <p style="margin-bottom:12px">You are about to cancel order <strong>${esc(orderNum)}</strong>.</p>
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:12px 16px;font-size:.88rem;margin-bottom:12px">
        <i class="fas fa-check-circle" style="color:var(--success)"></i>
        <strong>Full refund if eligible</strong> - since your order has not shipped yet, the refund goes back to your original card. Banks usually show it within <strong>5-7 business days</strong>.
      </div>
      <p style="font-size:.85rem;color:var(--text-light)">After cancellation, the order cannot be restarted. You can place a new order anytime.</p>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" type="button" data-csp-onclick="closeModal()">Keep Order</button>
      <button class="btn btn-primary" type="button" style="background:var(--danger);border-color:var(--danger)" data-cancel-submit="1" data-csp-onclick="doCancelOrder('${esc(id)}')">
        <i class="fas fa-times-circle"></i> Yes, Cancel & Refund
      </button>
    </div>`);
};

window.doCancelOrder = async (id) => {
  const _gen = Router._gen;
  const btn = document.querySelector('[data-cancel-submit="1"]');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Cancelling...'; }
  try {
    const res = await api.post(`/orders/${id}/cancel`, {});
    if (Router.stale(_gen)) return;
    closeModal();
    toast(res.message, 'success');
    setTimeout(() => { if (!Router.stale(_gen)) Router.navigate('/dashboard/orders'); }, 1200);
  } catch (e) {
    if (!Router.stale(_gen)) toast(e.message, 'error');
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-times-circle"></i> Yes, Cancel & Refund';
    }
  }
};

window.confirmRequestReturn = (id, orderNum) => {
  openModal(`
    <div class="modal-header"><h3><i class="fas fa-undo-alt" style="color:#c2410c;margin-right:8px"></i>Request Return</h3><button class="modal-close" data-csp-onclick="closeModal()" aria-label="Close">×</button></div>
    <div class="modal-body">
      <p style="margin-bottom:16px">You are requesting a return for order <strong>${esc(orderNum)}</strong>. Please review these conditions before submitting:</p>
        <div style="display:flex;flex-direction:column;gap:10px;font-size:.88rem">
        <div style="display:flex;gap:10px;align-items:flex-start;padding:10px;background:#f9fafb;border-radius:8px">
          <i class="fas fa-box" style="color:var(--primary);margin-top:2px;flex-shrink:0"></i>
          <div><strong>Ship the package back within 7 business days</strong> of submitting this request. We'll email you our return address.</div>
        </div>
        <div style="display:flex;gap:10px;align-items:flex-start;padding:10px;background:#f0fdf4;border-radius:8px">
          <i class="fas fa-check-circle" style="color:var(--success);margin-top:2px;flex-shrink:0"></i>
          <div><strong>Full refund</strong> if item is in original packaging and unused.</div>
        </div>
        <div style="display:flex;gap:10px;align-items:flex-start;padding:10px;background:#fff7ed;border-radius:8px">
          <i class="fas fa-exclamation-circle" style="color:#c2410c;margin-top:2px;flex-shrink:0"></i>
          <div><strong>50% refund</strong> if the item appears to have been used.</div>
        </div>
        <div style="display:flex;gap:10px;align-items:flex-start;padding:10px;background:#fef2f2;border-radius:8px">
          <i class="fas fa-ban" style="color:var(--danger);margin-top:2px;flex-shrink:0"></i>
          <div><strong>Custom printed items</strong> are not eligible for returns unless defective or wrong.</div>
        </div>
      </div>
      <div class="form-group" style="margin-top:16px">
        <label class="form-label">Reason for return *</label>
        <textarea class="form-control" id="return-reason" rows="4" maxlength="1000" placeholder="Tell us what happened, for example wrong size, damaged item, not as expected..." required></textarea>
        <div class="form-hint">Please do not include card numbers, passwords, or private information.</div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" data-csp-onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" style="background:#c2410c;border-color:#c2410c" data-return-submit="1" data-csp-onclick="doRequestReturn('${id}')">
        <i class="fas fa-undo-alt"></i> Submit Return Request
      </button>
    </div>`);
};

window.doRequestReturn = async (id) => {
  const _gen = Router._gen;
  const reasonEl = document.getElementById('return-reason');
  const reason = (reasonEl?.value || '').trim();
  if (reason.length < 10) {
    toast('Please add a short reason for the return request.', 'warning');
    reasonEl?.focus();
    return;
  }
  const btn = document.querySelector('[data-return-submit="1"]');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...'; }
  try {
    const res = await api.post(`/orders/${id}/request-return`, { reason });
    if (Router.stale(_gen)) return;
    closeModal();
    toast(res.message, 'success');
    setTimeout(() => { if (!Router.stale(_gen)) Router.navigate('/dashboard/orders'); }, 1200);
  } catch (e) {
    if (!Router.stale(_gen)) toast(e.message, 'error');
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-undo-alt"></i> Submit Return Request'; }
  }
};

async function printInvoice(idOrObj) {
  // Accept either an order ID string or a pre-fetched order object
  const o = typeof idOrObj === 'string' ? await api.get(`/orders/${idOrObj}`) : idOrObj;
  const addr = o.shipping_address || {};
  const win = window.open('', '_blank');
  if (!win) {
    toast('Please allow popups to open the invoice.', 'warning');
    return;
  }
  win.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <title>Invoice — ${esc(o.order_number || '')}</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'Segoe UI',Arial,sans-serif;color:#1a1a1a;background:#fff;padding:22px 28px;font-size:11px;line-height:1.4}
    .header{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;padding-bottom:14px;border-bottom:2.5px solid #1D5C4A}
    .logo-wrap{display:flex;align-items:center;gap:10px}
    .logo-wrap img{height:48px;width:auto;object-fit:contain}
    .brand-text{font-family:Georgia,serif;font-size:16px;font-weight:800;color:#1D5C4A;line-height:1.15}
    .brand-text span{color:#C49A22}
    .brand-sub{font-size:9px;color:#999;letter-spacing:.08em;text-transform:uppercase;margin-top:1px}
    .inv-meta{text-align:right}
    .inv-meta .inv-title{font-size:20px;font-weight:900;color:#1D5C4A;letter-spacing:.04em}
    .inv-meta p{font-size:10px;color:#555;margin-top:3px}
    .info-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;margin-bottom:14px;padding:12px 14px;background:#f9f9f7;border-radius:6px;border:1px solid #e8e8e4}
    .info-box h4{font-size:8.5px;font-weight:700;text-transform:uppercase;letter-spacing:.09em;color:#999;margin-bottom:5px}
    .info-box p{font-size:10.5px;line-height:1.65;color:#333}
    .chips{display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap}
    .chip{padding:3px 10px;border-radius:12px;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.05em}
    .chip-paid{background:#dcfce7;color:#166534}
    .chip-pending{background:#fef3c7;color:#92400e}
    .chip-processing{background:#dbeafe;color:#1e40af}
    .chip-shipped{background:#ede9fe;color:#5b21b6}
    .chip-delivered{background:#dcfce7;color:#166534}
    table{width:100%;border-collapse:collapse;margin-bottom:14px;font-size:10.5px}
    thead tr{background:#1D5C4A;color:#fff}
    thead th{padding:7px 10px;text-align:left;font-size:9.5px;font-weight:700;letter-spacing:.04em}
    tbody tr{border-bottom:1px solid #f0f0ee}
    tbody tr:last-child{border-bottom:none}
    tbody td{padding:8px 10px;vertical-align:middle}
    .item-img{width:40px;height:40px;object-fit:cover;border-radius:5px;border:1px solid #e5e5e5;display:block}
    .item-name{font-weight:700;font-size:10.5px;margin-bottom:1px}
    .item-sub{font-size:9.5px;color:#777;margin-top:1px}
    .item-custom{font-size:9.5px;color:#1D5C4A;font-weight:700;margin-top:2px}
    .totals-wrap{display:flex;justify-content:flex-end;margin-bottom:14px}
    .totals{width:220px}
    .trow{display:flex;justify-content:space-between;padding:4px 0;font-size:10.5px;border-bottom:1px solid #f3f3f0}
    .trow.grand{font-weight:800;font-size:13px;color:#1D5C4A;border-top:2px solid #1D5C4A;border-bottom:none;padding-top:8px;margin-top:2px}
    .footer{padding-top:10px;border-top:1px solid #e8e8e4;display:flex;justify-content:space-between;align-items:center;margin-top:10px}
    .footer p{font-size:9px;color:#bbb}
    .support-note{margin-top:12px;padding:10px 12px;background:#f8faf9;border:1px solid #e7eee9;border-radius:6px;color:#42524c;font-size:9.5px;line-height:1.55}
    .support-note strong{color:#1D5C4A}
    .no-print{text-align:center;margin-top:18px}
    .print-btn{background:#1D5C4A;color:#fff;border:none;padding:9px 26px;border-radius:6px;font-size:12px;font-weight:700;cursor:pointer;letter-spacing:.02em}
    .print-hint{font-size:9.5px;color:#bbb;margin-top:5px}
    @media print{
      body{padding:0}
      .no-print{display:none!important}
      @page{size:A4;margin:10mm 12mm}
    }
  </style>
</head>
<body>

  <!-- HEADER -->
  <div class="header">
    <div class="logo-wrap">
      <img src="/images/logo-main.png" alt="Adhya Shakti Shop"
        width="120" height="120" loading="lazy" decoding="async"
        data-csp-onerror="this.style.display='none';document.getElementById('brand-fallback').style.display='block'" />
      <div id="brand-fallback" style="display:none">
        <div class="brand-text">Adhya <span>Shakti</span> Shop</div>
        <div class="brand-sub">New Jersey, USA</div>
      </div>
    </div>
    <div class="inv-meta">
      <div class="inv-title">INVOICE</div>
      <p><strong>${esc(o.order_number)}</strong></p>
      <p>Date: ${new Date(o.created_at).toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'})}</p>
    </div>
  </div>

  <!-- BILL / SHIP / ORDER INFO -->
  <div class="info-grid">
    <div class="info-box">
      <h4>Bill To</h4>
      <p><strong>${esc(o.customer_name)}</strong><br>${esc(o.customer_email)}<br>${esc(o.customer_phone || '')}</p>
    </div>
    <div class="info-box">
      <h4>Ship To</h4>
      <p>${esc(addr.line1)}${addr.landmark ? ', ' + esc(addr.landmark) : ''}<br>${esc(addr.city)}, ${esc(addr.state)} ${esc(addr.pin || addr.zip || '')}<br>United States</p>
    </div>
    <div class="info-box">
      <h4>Order Info</h4>
      <p>
        <strong>Payment:</strong> ${o.payment_status.charAt(0).toUpperCase()+o.payment_status.slice(1)}<br>
        <strong>Status:</strong> ${o.status.charAt(0).toUpperCase()+o.status.slice(1)}<br>
        <strong>Method:</strong> Card
        ${o.tracking_number ? '<br><strong>Tracking:</strong> ' + esc(o.tracking_number) : ''}
      </p>
    </div>
  </div>

  <!-- STATUS CHIPS -->
  <div class="chips">
    <span class="chip chip-${o.payment_status}">Payment: ${o.payment_status.toUpperCase()}</span>
    <span class="chip chip-${o.status}">Order: ${o.status.toUpperCase()}</span>
  </div>

  <!-- ITEMS TABLE -->
  <table>
    <thead>
      <tr>
        <th style="width:36px"></th>
        <th style="width:40%">Item</th>
        <th style="text-align:center;width:9%">Qty</th>
        <th style="text-align:right;width:18%">Unit Price</th>
        <th style="text-align:right;width:18%">Total</th>
      </tr>
    </thead>
    <tbody>
      ${o.items.map(i => `
        <tr>
          <td style="padding:8px 6px 8px 10px">
            ${safeMediaUrl(i.image)
              ? `<img class="item-img" src="${safeMediaUrl(i.image)}" alt="" loading="lazy" decoding="async" width="40" height="40" data-csp-onerror="this.style.opacity='.3'" />`
              : `<div style="width:40px;height:40px;background:#f3f3f0;border-radius:5px;border:1px solid #e5e5e5"></div>`}
          </td>
          <td>
            <div class="item-name">${esc(i.name)}</div>
            ${i.variation ? `<div class="item-sub">Variant: ${esc(i.variation)}</div>` : ''}
            ${i.customPrint ? `<div class="item-custom">Custom Print — ${i.customPrint.placement === 'both' ? 'Front &amp; Back' : i.customPrint.placement === 'front' ? 'Front Only' : 'Back Only'}${i.customPrint.extra_charge ? ' (+$'+Number(i.customPrint.extra_charge).toFixed(2)+')' : ''}</div>` : ''}
          </td>
          <td style="text-align:center">${i.qty}</td>
          <td style="text-align:right">$${Number(i.price).toFixed(2)}</td>
          <td style="text-align:right;font-weight:700">$${(i.price*i.qty).toFixed(2)}</td>
        </tr>`).join('')}
    </tbody>
  </table>

  <!-- TOTALS -->
  <div class="totals-wrap">
    <div class="totals">
      <div class="trow"><span>Subtotal</span><span>$${Number(o.subtotal).toFixed(2)}</span></div>
      ${o.discount > 0 ? `<div class="trow"><span>Discount${o.coupon_code?' ('+esc(o.coupon_code)+')':''}</span><span style="color:#16a34a">-$${Number(o.discount).toFixed(2)}</span></div>` : ''}
      <div class="trow"><span>Shipping</span><span>${o.shipping_charge===0?'FREE':'$'+Number(o.shipping_charge).toFixed(2)}</span></div>
      <div class="trow grand"><span>Total Charged</span><span>$${Number(o.total).toFixed(2)}</span></div>
    </div>
  </div>

  <div class="support-note">
    <strong>Order support:</strong> Email contact@adhyashaktishop.com with order ${esc(o.order_number)} if you need help.
    Refunds, cancellations, and returns follow the policy shown on adhyashaktishop.com/refund.
  </div>

  <!-- FOOTER -->
  <div class="footer">
    <p>Adhya Shakti Shop &nbsp;•&nbsp; New Jersey, USA &nbsp;•&nbsp; contact@adhyashaktishop.com</p>
    <p>Thank you for your order!</p>
  </div>

  <!-- PRINT BUTTON (hidden when printing) -->
  <div class="no-print">
    <button class="print-btn" data-csp-onclick="window.print()">Print / Save as PDF</button>
    <p class="print-hint">In the print dialog → choose <strong>Save as PDF</strong> → click Save</p>
  </div>

</body>
</html>`);
  win.document.close();
  setTimeout(() => win.print(), 600);
}
