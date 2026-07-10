Router.register('/admin/orders', async () => {
  if (!Auth.isAdmin()) { Router.navigate('/admin/login'); return; }
  adminLayout('<div class="spinner"></div>', '/admin/orders');
  const _gen = Router._gen;

  const initialParams = new URLSearchParams(location.search || '');
  let orders = [], filterStatus = initialParams.get('status') || '', viewMode = initialParams.get('view') || '', searchTerm = (initialParams.get('q') || '').toLowerCase().trim();
  const ATTENTION_PENDING_DAYS = 2;

  function ageDays(dateValue) {
    const t = new Date(String(dateValue || '').replace(' ', 'T')).getTime();
    if (!Number.isFinite(t)) return 0;
    return Math.floor((Date.now() - t) / 86400000);
  }

  function cleanStatusLabel(value) {
    return String(value || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  function orderAttentionFlags(o) {
    const flags = [];
    if (o.status === 'return_requested') flags.push({ label: 'Return requested', icon: 'fa-undo-alt', tone: 'danger' });
    if (o.status === 'return_requested' && !String(o.return_reason || '').trim()) flags.push({ label: 'Missing reason', icon: 'fa-message', tone: 'warn' });
    if (o.status === 'cancelled' && (o.payment_status === 'refund_pending' || o.refund_result === 'manual_refund_required')) flags.push({ label: 'Manual refund needed', icon: 'fa-credit-card', tone: 'danger' });
    if (o.status === 'cancelled' && o.cancelled_by === 'customer') flags.push({ label: 'Cancelled by customer', icon: 'fa-user-xmark', tone: 'warn' });
    if (o.status === 'pending' && ageDays(o.created_at) >= ATTENTION_PENDING_DAYS) flags.push({ label: `${ageDays(o.created_at)} days pending`, icon: 'fa-clock', tone: 'warn' });
    if (o.status === 'shipped' && !String(o.tracking_number || '').trim()) flags.push({ label: 'Missing tracking', icon: 'fa-truck', tone: 'warn' });
    if (o.status === 'pending' && o.payment_status === 'paid') flags.push({ label: 'Needs processing', icon: 'fa-box-open', tone: 'info' });
    return flags;
  }

  function orderFlagsHtml(o, compact = false) {
    const flags = orderAttentionFlags(o);
    if (!flags.length) return compact ? '' : '<span class="admin-order-ok"><i class="fas fa-check-circle"></i> No flags</span>';
    return `<div class="admin-order-flags ${compact ? 'compact' : ''}">
      ${flags.map(f => `<span class="admin-order-flag ${f.tone}"><i class="fas ${f.icon}"></i>${esc(f.label)}</span>`).join('')}
    </div>`;
  }

  function orderNextStep(o) {
    const status = String(o?.status || '').toLowerCase();
    const payment = String(o?.payment_status || '').toLowerCase();
    const tracking = String(o?.tracking_number || '').trim();
    if (status === 'return_requested') return { tone: 'danger', icon: 'fa-undo-alt', label: 'Process return', note: 'Inspect the package, then choose full or 50% refund.' };
    if (status === 'pending' && payment === 'paid') return { tone: 'info', icon: 'fa-box-open', label: 'Start processing', note: 'Move this paid order into processing when you begin preparing it.' };
    if (status === 'pending') return { tone: 'warn', icon: 'fa-clock', label: 'Review payment', note: 'Check payment status before preparing this order.' };
    if (status === 'processing') return { tone: 'info', icon: 'fa-truck-ramp-box', label: 'Pack and ship', note: 'Add tracking before marking it shipped.' };
    if (status === 'shipped' && !tracking) return { tone: 'warn', icon: 'fa-truck', label: 'Add tracking', note: 'A shipped order should have a tracking number.' };
    if (status === 'shipped') return { tone: 'info', icon: 'fa-house-circle-check', label: 'Watch delivery', note: 'Mark delivered after the carrier confirms delivery.' };
    if (status === 'delivered' && !o.review_requested_at) return { tone: 'success', icon: 'fa-star', label: 'Request review', note: 'Send a review request after confirming the order is complete.' };
    if (status === 'delivered') return { tone: 'success', icon: 'fa-check-circle', label: 'Complete', note: 'Order is delivered and review request was already sent.' };
    if (status === 'cancelled' && (payment === 'refund_pending' || o.refund_result === 'manual_refund_required')) return { tone: 'danger', icon: 'fa-credit-card', label: 'Manual refund needed', note: 'Stock was restored, but Stripe refund still needs review.' };
    if (status === 'cancelled') return { tone: 'danger', icon: 'fa-ban', label: 'Cancelled', note: 'No fulfillment action needed.' };
    if (status === 'return_received') return { tone: 'info', icon: 'fa-box-open', label: 'Return received', note: 'Refund workflow has been handled or is pending.' };
    return { tone: 'info', icon: 'fa-circle-info', label: 'Review order', note: 'Open details and confirm the next safe step.' };
  }

  function orderNextStepHtml(o, compact = false) {
    const next = orderNextStep(o);
    return `
      <div class="admin-order-next-step ${next.tone} ${compact ? 'compact' : ''}">
        <i class="fas ${next.icon}"></i>
        <div><strong>${esc(next.label)}</strong>${compact ? '' : `<span>${esc(next.note)}</span>`}</div>
      </div>`;
  }

  function quickActionButtons(o, compact = false) {
    const status = String(o?.status || '').toLowerCase();
    const buttons = [];
    if (status === 'pending' && o.payment_status === 'paid') {
      buttons.push(`<button class="btn btn-sm btn-primary" data-csp-onclick="quickOrderStatus('${o.id}','processing')"><i class="fas fa-box-open"></i>${compact ? '' : ' Start processing'}</button>`);
    }
    if (status === 'processing') {
      buttons.push(`<button class="btn btn-sm btn-outline" data-csp-onclick="openOrderEditor('${o.id}')"><i class="fas fa-truck"></i>${compact ? '' : ' Add tracking / ship'}</button>`);
    }
    if (status === 'shipped' && String(o.tracking_number || '').trim()) {
      buttons.push(`<button class="btn btn-sm btn-primary" data-csp-onclick="quickOrderStatus('${o.id}','delivered')"><i class="fas fa-check"></i>${compact ? '' : ' Mark delivered'}</button>`);
    }
    if (status === 'shipped' && !String(o.tracking_number || '').trim()) {
      buttons.push(`<button class="btn btn-sm btn-outline" data-csp-onclick="openOrderEditor('${o.id}')"><i class="fas fa-truck"></i>${compact ? '' : ' Add tracking'}</button>`);
    }
    if (status === 'return_requested') {
      buttons.push(`<button class="btn btn-sm" style="background:#c2410c;color:#fff;border:none" data-csp-onclick="openProcessReturn('${o.id}','${o.order_number}',${o.total})"><i class="fas fa-undo-alt"></i>${compact ? '' : ' Process return'}</button>`);
    }
    if (status === 'delivered' && !o.review_requested_at) {
      buttons.push(`<button class="btn btn-sm btn-outline" data-csp-onclick="sendOrderEmail('${o.id}','review')"><i class="fas fa-star"></i>${compact ? '' : ' Request review'}</button>`);
    }
    return buttons.length ? `<div class="admin-order-quick-actions ${compact ? 'compact' : ''}">${buttons.join('')}</div>` : '';
  }

  function orderMatchesView(o) {
    if (!viewMode) return true;
    if (viewMode === 'attention') return orderAttentionFlags(o).length > 0;
    if (viewMode === 'missing_tracking') return o.status === 'shipped' && !String(o.tracking_number || '').trim();
    if (viewMode === 'old_pending') return o.status === 'pending' && ageDays(o.created_at) >= ATTENTION_PENDING_DAYS;
    if (viewMode === 'ready_to_process') return o.status === 'pending' && o.payment_status === 'paid';
    if (viewMode === 'ready_to_ship') return o.status === 'processing';
    if (viewMode === 'review_requests') return o.status === 'delivered' && !o.review_requested_at;
    return true;
  }

  function safeAddress(addr) {
    addr = addr || {};
    const line1 = addr.line1 || addr.address || '';
    const line2 = addr.landmark || '';
    const cityStateZip = [addr.city, addr.state].filter(Boolean).join(', ') + (addr.pin || addr.zip ? ` ${addr.pin || addr.zip}` : '');
    return { line1, line2, cityStateZip };
  }

  function addressHtml(addr) {
    const a = safeAddress(addr);
    return `
      <div class="admin-order-block">
        <div class="admin-order-block-title"><i class="fas fa-location-dot"></i> Shipping</div>
        <div class="admin-order-block-body">
          <strong>${esc(a.line1 || 'Address not provided')}</strong>
          ${a.line2 ? `<span>${esc(a.line2)}</span>` : ''}
          <span>${esc(a.cityStateZip || '')}</span>
          <span>United States</span>
        </div>
      </div>`;
  }

  function cancelSourceLabel(value) {
    const v = String(value || '').toLowerCase();
    if (v === 'customer') return 'Customer';
    if (v === 'staff') return 'Staff';
    if (v === 'admin') return 'Admin';
    return v ? cleanStatusLabel(v) : 'Not recorded';
  }

  function refundResultText(o) {
    const result = String(o.refund_result || '').toLowerCase();
    if (result === 'refunded_automatically') return { tone: 'success', icon: 'fa-circle-check', label: 'Refunded automatically through Stripe' };
    if (result === 'manual_refund_required') return { tone: 'danger', icon: 'fa-triangle-exclamation', label: 'Manual refund needed in Stripe' };
    if (result === 'no_payment_to_refund') return { tone: 'info', icon: 'fa-circle-info', label: 'No payment refund was needed' };
    if (o.payment_status === 'refunded') return { tone: 'success', icon: 'fa-circle-check', label: 'Refunded' };
    if (o.payment_status === 'refund_pending') return { tone: 'danger', icon: 'fa-triangle-exclamation', label: 'Refund pending - review Stripe' };
    return { tone: 'info', icon: 'fa-circle-info', label: 'Refund status not recorded' };
  }

  function cancellationHtml(o) {
    if (o.status !== 'cancelled' && !o.cancelled_at && !o.refund_result) return '';
    const refund = refundResultText(o);
    const source = cancelSourceLabel(o.cancelled_by);
    const isCustomer = String(o.cancelled_by || '').toLowerCase() === 'customer';
    return `
      <div class="admin-order-block" style="margin-bottom:16px;border-color:${refund.tone === 'danger' ? '#fecaca' : '#bbf7d0'};background:${refund.tone === 'danger' ? '#fef2f2' : '#f0fdf4'}">
        <div class="admin-order-block-title" style="color:${refund.tone === 'danger' ? '#b91c1c' : '#047857'}">
          <i class="fas ${isCustomer ? 'fa-user-xmark' : 'fa-ban'}"></i>
          Cancelled by ${esc(source)}
        </div>
        <div class="admin-order-block-body" style="color:#25332f">
          <span><strong>Cancellation time:</strong> ${o.cancelled_at ? fmtDateTime(o.cancelled_at) : 'Not recorded'}</span>
          <span><strong>Stock:</strong> Returned to inventory automatically</span>
          <span><strong>Refund:</strong> <i class="fas ${refund.icon}"></i> ${esc(refund.label)}</span>
          <span><strong>Audit note:</strong> Customer cancellation restored stock, voided the bookkeeping sale, and updated refund status.</span>
        </div>
      </div>`;
  }

  function contactHtml(o) {
    return `
      <div class="admin-order-block">
        <div class="admin-order-block-title"><i class="fas fa-user"></i> Customer Contact</div>
        <div class="admin-order-block-body">
          <strong>${esc(o.customer_name || 'Customer')}</strong>
          <span>${esc(o.customer_email || '')}</span>
          <span>${esc(o.customer_phone || '')}</span>
          <div class="admin-order-copy-row">
            <button class="btn btn-sm btn-outline" data-csp-onclick="copyOrderValue('${o.id}','email')"><i class="fas fa-copy"></i> Copy email</button>
            <button class="btn btn-sm btn-outline" data-csp-onclick="copyOrderValue('${o.id}','phone')"><i class="fas fa-phone"></i> Copy phone</button>
          </div>
        </div>
      </div>`;
  }

  function itemMetaHtml(i) {
    const meta = [];
    const variation = String(i.variation || '').trim();
    if (variation) {
      const pieces = variation.split('/').map(x => x.trim()).filter(Boolean);
      if (pieces[0]) meta.push(`<span><i class="fas fa-palette"></i> Color: ${esc(pieces[0])}</span>`);
      if (pieces[1]) meta.push(`<span><i class="fas fa-ruler"></i> Size: ${esc(pieces[1])}</span>`);
      if (pieces.length < 2) meta.push(`<span><i class="fas fa-tag"></i> ${esc(variation)}</span>`);
    }
    if (i.customPrint) {
      const placement = i.customPrint.placement === 'both' ? 'Front & Back' : i.customPrint.placement === 'front' ? 'Front Only' : i.customPrint.placement === 'back' ? 'Back Only' : 'Custom print';
      const counts = [];
      if (i.customPrint.front_images?.length) counts.push(`${i.customPrint.front_images.length} front file${i.customPrint.front_images.length === 1 ? '' : 's'}`);
      if (i.customPrint.back_images?.length) counts.push(`${i.customPrint.back_images.length} back file${i.customPrint.back_images.length === 1 ? '' : 's'}`);
      meta.push(`<span><i class="fas fa-print"></i> ${esc(placement)}${counts.length ? ` - ${esc(counts.join(', '))}` : ''}</span>`);
    }
    meta.push(`<span><i class="fas fa-layer-group"></i> Qty: ${Number(i.qty || 0)}</span>`);
    return meta.length ? `<div class="admin-order-item-meta">${meta.join('')}</div>` : '';
  }

  function printWindow(title, bodyHtml) {
    const win = window.open('', '_blank');
    win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>${esc(title)}</title>
      <style>
        body{font-family:Arial,sans-serif;color:#111;padding:24px;font-size:12px;line-height:1.45}
        .head{display:flex;justify-content:space-between;gap:20px;border-bottom:3px solid #1D5C4A;padding-bottom:14px;margin-bottom:18px}
        h1{font-size:22px;margin:0;color:#1D5C4A}.muted{color:#666}.grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:14px 0}
        .box{border:1px solid #ddd;border-radius:8px;padding:12px} table{width:100%;border-collapse:collapse;margin-top:14px}
        th{background:#1D5C4A;color:#fff;text-align:left;padding:8px}td{border-bottom:1px solid #eee;padding:8px;vertical-align:top}
        .totals{margin-left:auto;width:240px;margin-top:14px}.row{display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #eee}.grand{font-weight:800;font-size:15px;color:#1D5C4A;border-top:2px solid #1D5C4A}
        .no-print{text-align:center;margin-top:22px}.btn{background:#1D5C4A;color:#fff;border:0;border-radius:6px;padding:10px 22px;font-weight:700;cursor:pointer}
        @media print{.no-print{display:none}@page{size:A4;margin:12mm}}
      </style></head><body>${bodyHtml}<div class="no-print"><button class="btn" onclick="window.print()">Print / Save PDF</button></div></body></html>`);
    win.document.close();
    setTimeout(() => win.print(), 500);
  }

  function printOrderDocument(o, type = 'invoice') {
    const addr = safeAddress(o.shipping_address);
    const isPacking = type === 'packing';
    const items = (o.items || []).map(i => `
      <tr>
        <td><strong>${esc(i.name || 'Item')}</strong>${itemMetaHtml(i)}</td>
        <td style="text-align:center">${Number(i.qty || 0)}</td>
        ${isPacking ? '' : `<td style="text-align:right">${fmt(i.price || 0)}</td><td style="text-align:right">${fmt((i.price || 0) * (i.qty || 0))}</td>`}
      </tr>`).join('');
    const totals = isPacking ? '' : `
      <div class="totals">
        <div class="row"><span>Subtotal</span><strong>${fmt(o.subtotal || 0)}</strong></div>
        ${o.discount > 0 ? `<div class="row"><span>Discount${o.coupon_code ? ` (${esc(o.coupon_code)})` : ''}</span><strong>-${fmt(o.discount)}</strong></div>` : ''}
        <div class="row"><span>Shipping</span><strong>${Number(o.shipping_charge || 0) === 0 ? 'FREE' : fmt(o.shipping_charge)}</strong></div>
        <div class="row grand"><span>Total</span><strong>${fmt(o.total || 0)}</strong></div>
      </div>`;
    printWindow(`${isPacking ? 'Packing Slip' : 'Invoice'} ${o.order_number}`, `
      <div class="head"><div><h1>${isPacking ? 'Packing Slip' : 'Invoice'}</h1><div class="muted">Adhya Shakti Shop - New Jersey, USA</div></div><div><strong>${esc(o.order_number)}</strong><br><span class="muted">${fmtDate(o.created_at)}</span></div></div>
      <div class="grid">
        <div class="box"><strong>Customer</strong><br>${esc(o.customer_name || '')}<br>${esc(o.customer_email || '')}<br>${esc(o.customer_phone || '')}</div>
        <div class="box"><strong>Ship To</strong><br>${esc(addr.line1 || '')}${addr.line2 ? '<br>' + esc(addr.line2) : ''}<br>${esc(addr.cityStateZip || '')}<br>United States</div>
      </div>
      ${o.tracking_number ? `<div class="box"><strong>Tracking:</strong> ${esc(o.tracking_number)}</div>` : ''}
      <table><thead><tr><th>Item</th><th style="text-align:center">Qty</th>${isPacking ? '' : '<th style="text-align:right">Price</th><th style="text-align:right">Line Total</th>'}</tr></thead><tbody>${items}</tbody></table>
      ${totals}
      ${o.notes ? `<div class="box" style="margin-top:14px"><strong>Internal notes</strong><br>${esc(o.notes)}</div>` : ''}
    `);
  }

  async function loadOrders() {
    const url = filterStatus ? `/admin/orders?status=${filterStatus}` : '/admin/orders';
    orders = await api.get(url);
    if (Router.stale(_gen)) return;
    renderOrders();
  }

  function renderOrders() {
    const visibleOrders = orders.filter(o => {
      const itemText = (o.items || []).map(i => `${i.name || ''} ${i.variation || ''}`).join(' ');
      const haystack = `${o.order_number || ''} ${o.customer_name || ''} ${o.customer_email || ''} ${o.customer_phone || ''} ${o.status || ''} ${o.payment_status || ''} ${itemText}`.toLowerCase();
      return orderMatchesView(o) && (!searchTerm || haystack.includes(searchTerm));
    });
    const counts = {
      pending: orders.filter(o => o.status === 'pending').length,
      processing: orders.filter(o => o.status === 'processing').length,
      returns: orders.filter(o => o.status === 'return_requested').length,
      paid: orders.filter(o => o.payment_status === 'paid').length,
      attention: orders.filter(o => orderAttentionFlags(o).length).length,
      missingTracking: orders.filter(o => o.status === 'shipped' && !String(o.tracking_number || '').trim()).length,
      oldPending: orders.filter(o => o.status === 'pending' && ageDays(o.created_at) >= ATTENTION_PENDING_DAYS).length,
      readyToProcess: orders.filter(o => o.status === 'pending' && o.payment_status === 'paid').length,
      readyToShip: orders.filter(o => o.status === 'processing').length,
      reviewRequests: orders.filter(o => o.status === 'delivered' && !o.review_requested_at).length,
    };
    const workCards = [
      { view: 'attention', count: counts.attention, label: 'Needs attention', note: 'Returns, old pending, missing tracking, and paid pending orders.', icon: 'fa-triangle-exclamation', tone: 'warn' },
      { view: 'ready_to_process', count: counts.readyToProcess, label: 'Ready to process', note: 'Paid pending orders waiting for preparation.', icon: 'fa-box-open', tone: 'info' },
      { view: 'ready_to_ship', count: counts.readyToShip, label: 'Ready to ship', note: 'Processing orders that need tracking and shipment.', icon: 'fa-truck-ramp-box', tone: 'info' },
      { view: 'missing_tracking', count: counts.missingTracking, label: 'Missing tracking', note: 'Shipped orders without tracking numbers.', icon: 'fa-truck', tone: 'warn' },
      { view: 'review_requests', count: counts.reviewRequests, label: 'Review requests', note: 'Delivered orders still waiting for review request email.', icon: 'fa-star', tone: 'success' },
      { view: 'old_pending', count: counts.oldPending, label: 'Old pending', note: `Pending orders older than ${ATTENTION_PENDING_DAYS} days.`, icon: 'fa-calendar-xmark', tone: 'danger' },
    ];
    document.querySelector('.admin-content').innerHTML = `
      <div class="admin-page-title">Orders (${visibleOrders.length}${visibleOrders.length !== orders.length ? ` of ${orders.length}` : ''})</div>
      <div class="admin-work-queue">
        <div class="admin-work-queue-head">
          <div><strong>Order work queue</strong><span>Use these shortcuts to work the next safest order actions.</span></div>
          ${viewMode ? `<button class="btn btn-sm btn-outline" data-csp-onclick="setOrderView('')"><i class="fas fa-xmark"></i> Clear queue filter</button>` : ''}
        </div>
        <div class="admin-work-grid">
          ${workCards.map(c => `
            <button class="admin-work-card ${c.tone} ${viewMode === c.view ? 'active' : ''}" data-csp-onclick="setOrderView('${c.view}')">
              <i class="fas ${c.icon}"></i>
              <div><strong>${Number(c.count || 0)}</strong><span>${esc(c.label)}</span><small>${esc(c.note)}</small></div>
            </button>`).join('')}
        </div>
      </div>
      <div class="admin-order-summary-grid">
        <div><i class="fas fa-clock"></i><strong>${counts.pending}</strong><span>Pending</span></div>
        <div><i class="fas fa-box"></i><strong>${counts.processing}</strong><span>Processing</span></div>
        <div><i class="fas fa-undo-alt"></i><strong>${counts.returns}</strong><span>Returns</span></div>
        <div><i class="fas fa-triangle-exclamation"></i><strong>${counts.attention}</strong><span>Needs attention</span></div>
        <div><i class="fas fa-credit-card"></i><strong>${counts.paid}</strong><span>Paid orders</span></div>
      </div>
      <div class="card">
        <div class="card-body" style="padding-bottom:0">
          <div class="flex-between" style="gap:12px;flex-wrap:wrap;margin-bottom:14px">
            <input class="form-control" id="admin-order-search" value="${esc(searchTerm)}" placeholder="Search order, customer, phone, product..." style="max-width:380px" data-csp-oninput="searchAdminOrders()" />
            <div class="text-muted text-sm">${filterStatus ? `Status: ${esc(filterStatus.replace('_',' '))}` : 'All statuses'}${viewMode ? ` · Queue: ${esc(viewMode.replace(/_/g, ' '))}` : ''}</div>
          </div>
          <div class="tabs" style="margin-bottom:0;flex-wrap:wrap">
            ${[
              { val: '',                 label: 'All' },
              { val: 'pending',          label: 'Pending' },
              { val: 'processing',       label: 'Processing' },
              { val: 'shipped',          label: 'Shipped' },
              { val: 'delivered',        label: 'Delivered' },
              { val: 'return_requested', label: '⚠ Returns' },
              { val: 'cancelled',        label: 'Cancelled' },
            ].map(s => `
              <button class="tab-btn ${filterStatus === s.val ? 'active' : ''}" data-csp-onclick="changeStatusFilter('${s.val}')"
                style="${s.val==='return_requested'?'color:#c2410c':''}">
                ${s.label}
              </button>`).join('')}
          </div>
        </div>
        <div class="admin-mobile-scroll-hint"><i class="fas fa-arrows-left-right"></i> Swipe sideways to view all columns</div>
        <div class="table-wrap admin-wide-scroll"><table class="admin-wide-table">
          <thead><tr><th>Order #</th><th>Date</th><th>Customer</th><th>Items</th><th>Total</th><th>Payment</th><th>Status</th><th>Next step</th><th>Actions</th></tr></thead>
          <tbody>
            ${visibleOrders.length ? visibleOrders.map(o => `
              <tr style="${o.status==='return_requested'?'background:#fff7ed':''}">
                <td data-label="Order #"><span class="admin-td-value"><strong>${esc(o.order_number)}</strong></span></td>
                <td data-label="Date"><span class="admin-td-value">${fmtDate(o.created_at)}</span></td>
                <td data-label="Customer">
                  <span class="admin-td-value" style="display:block">
                    <div style="font-weight:600">${esc(o.customer_name)}</div>
                    <div class="text-sm text-muted">${esc(o.customer_email)}</div>
                  </span>
                </td>
                <td data-label="Items"><span class="admin-td-value">${o.items.length} item(s)</span></td>
                <td data-label="Total"><span class="admin-td-value" style="font-weight:700">${fmt(o.total)}</span></td>
                <td data-label="Payment"><span class="admin-td-value">${statusBadge(o.payment_status)}</span></td>
                <td data-label="Status"><span class="admin-td-value">${statusBadge(o.status)}</span></td>
                <td data-label="Next step"><div class="admin-td-value">${orderFlagsHtml(o, true)}${orderNextStepHtml(o, true)}</div></td>
                <td data-label="Actions">
                  <div class="admin-td-value" style="display:flex;gap:6px;flex-wrap:wrap">
                    <button class="btn btn-sm btn-ghost" data-csp-onclick="viewOrderAdmin('${o.id}')" aria-label="View order ${o.order_number}"><i class="fas fa-eye"></i></button>
                    <button class="btn btn-sm btn-outline" data-csp-onclick="editOrderStatus('${o.id}')" aria-label="Edit order ${esc(o.order_number)} status"><i class="fas fa-edit"></i></button>
                    ${quickActionButtons(o, true)}
                    ${['pending','processing'].includes(o.status) && !['refunded','refund_pending'].includes(o.payment_status)
                      ? `<button class="btn btn-sm" style="background:var(--danger);color:#fff;border:none" data-csp-onclick="cancelOrderAdmin('${o.id}','${o.order_number}')"><i class="fas fa-ban"></i> Cancel</button>`
                      : ''}
                  </div>
                </td>
              </tr>`).join('') : '<tr><td colspan="9" class="text-center text-muted" style="padding:32px">No orders found</td></tr>'}
          </tbody>
        </table></div>
      </div>`;
  }

  window.changeStatusFilter = (s) => {
    filterStatus = s;
    viewMode = '';
    loadOrders();
  };
  window.setOrderView = (mode) => {
    viewMode = mode || '';
    renderOrders();
  };
  window.searchAdminOrders = () => {
    const input = document.getElementById('admin-order-search');
    const caret = input?.selectionStart ?? String(input?.value || '').length;
    searchTerm = (input?.value || '').toLowerCase().trim();
    renderOrders();
    const next = document.getElementById('admin-order-search');
    if (next) {
      next.focus();
      next.setSelectionRange(Math.min(caret, next.value.length), Math.min(caret, next.value.length));
    }
  };

  window.quickOrderStatus = async (id, nextStatus) => {
    const order = orders.find(o => o.id === id);
    if (!order) return;
    const labels = {
      processing: 'move this order to Processing',
      delivered: 'mark this order Delivered',
    };
    if (nextStatus === 'shipped' && !String(order.tracking_number || '').trim()) {
      toast('Add tracking before marking an order shipped.', 'warning');
      editOrderStatus(id);
      return;
    }
    if (!confirm(`Are you sure you want to ${labels[nextStatus] || 'update this order'}? This can send a customer status email.`)) return;
    try {
      await api.put(`/admin/orders/${id}`, {
        status: nextStatus,
        payment_status: order.payment_status || 'paid',
        tracking_number: order.tracking_number || '',
        notes: order.notes || '',
      });
      toast('Order updated', 'success');
      closeModal();
      await loadOrders();
    } catch (e) {
      toast(e.message || 'Could not update order', 'error');
    }
  };

  window.copyOrderValue = async (id, field) => {
    const o = orders.find(x => x.id === id);
    const value = field === 'phone' ? (o?.customer_phone || '') : (o?.customer_email || '');
    if (!value) { toast(`${field === 'phone' ? 'Phone' : 'Email'} is missing`, 'warning'); return; }
    try {
      await navigator.clipboard.writeText(value);
      toast(`${field === 'phone' ? 'Phone' : 'Email'} copied`, 'success');
    } catch {
      toast(value, 'info');
    }
  };

  window.printPackingSlip = (id) => {
    const o = orders.find(x => x.id === id);
    if (!o) return;
    printOrderDocument(o, 'packing');
  };

  window.printAdminInvoice = (id) => {
    const o = orders.find(x => x.id === id);
    if (!o) return;
    printOrderDocument(o, 'invoice');
  };

  window.openOrderEditor = (id) => {
    closeModal();
    setTimeout(() => window.editOrderStatus(id), 0);
  };

  window.sendOrderEmail = async (id, kind) => {
    const labels = {
      confirmation: 'order confirmation',
      status: 'order status update',
      review: 'review request',
    };
    const label = labels[kind] || 'order email';
    if (!confirm(`Send ${label} email for this order?`)) return;
    try {
      const res = await api.post(`/admin/orders/${id}/email/${kind}`, {});
      toast(res.message || 'Email sent', 'success');
      await loadOrders();
    } catch (e) {
      toast(e.message || 'Email could not be sent', 'error');
    }
  };

  window.viewOrderAdmin = async (id) => {
    const o = orders.find(x => x.id === id);
    if (!o) return;
    const addr = o.shipping_address;
    const totalQty = (o.items || []).reduce((s, i) => s + Number(i.qty || 0), 0);
    openModal(`
      <div class="modal-header"><h3>Order #${o.order_number}</h3><button class="modal-close" data-csp-onclick="closeModal()" aria-label="Close">×</button></div>
      <div class="modal-body">
        <div class="admin-order-detail-summary">
          <div><span>Status</span><strong>${statusBadge(o.status)}</strong></div>
          <div><span>Payment</span><strong>${statusBadge(o.payment_status)}</strong></div>
          <div><span>Items</span><strong>${totalQty}</strong></div>
          <div><span>Total</span><strong>${fmt(o.total)}</strong></div>
        </div>
        <div style="margin:12px 0 16px">${orderFlagsHtml(o)}</div>
        ${o.return_reason ? `
          <div class="admin-order-block" style="margin-bottom:16px;border-color:#fed7aa;background:#fff7ed">
            <div class="admin-order-block-title" style="color:#9a3412"><i class="fas fa-message"></i> Customer return reason</div>
            <div class="admin-order-block-body" style="white-space:pre-wrap;color:#4a3221">${esc(o.return_reason)}</div>
          </div>` : ''}
        ${cancellationHtml(o)}
        <div class="admin-order-action-panel">
          <div>
            <div class="admin-order-block-title" style="margin-bottom:6px"><i class="fas fa-list-check"></i> Recommended next step</div>
            ${orderNextStepHtml(o)}
          </div>
          ${quickActionButtons(o)}
        </div>
        <div class="grid-2 admin-order-detail-grid" style="gap:16px;margin-bottom:16px">
          ${contactHtml(o)}
          ${addressHtml(addr)}
        </div>
        <div class="admin-order-block-title" style="margin-bottom:8px"><i class="fas fa-boxes-packing"></i> Products and options</div>
        <table style="width:100%;border-collapse:collapse">
          <thead>
            <tr style="border-bottom:2px solid var(--border)">
              <th style="width:52px;padding:8px 4px"></th>
              <th style="text-align:left;padding:8px">Item</th>
              <th style="text-align:center;padding:8px;width:40px">Qty</th>
              <th style="text-align:right;padding:8px;width:70px">Price</th>
              <th style="text-align:right;padding:8px;width:70px">Total</th>
            </tr>
          </thead>
          <tbody>
            ${o.items.map(i => `
              <tr style="border-bottom:1px solid var(--border)">
                <td style="padding:10px 4px;vertical-align:top">
                  <img src="${safeMediaUrl(i.image, 'https://placehold.co/48x48/f5f5f5/999?text=?')}"
                    loading="lazy" decoding="async" width="48" height="48"
                    style="width:48px;height:48px;object-fit:cover;border-radius:8px;border:1px solid var(--border)"
                    data-csp-onerror="this.src='https://placehold.co/48x48/f5f5f5/999?text=?'" />
                </td>
                <td style="padding:10px 8px;vertical-align:top">
                  <div style="font-weight:600;margin-bottom:2px">${esc(i.name)}</div>
                  ${itemMetaHtml(i)}
                  ${i.customPrint ? `
                    <div style="margin-top:8px;padding:10px 12px;background:rgba(29,92,74,.06);border-radius:8px;border-left:3px solid var(--primary)">
                      <div style="font-size:.78rem;font-weight:700;color:var(--primary);margin-bottom:8px">
                        <i class="fas fa-print" style="margin-right:4px"></i>
                        Custom Print — ${i.customPrint.placement === 'both' ? 'Front & Back' : i.customPrint.placement === 'front' ? 'Front Only' : 'Back Only'}
                        ${i.customPrint.extra_charge ? `<span style="color:var(--secondary);margin-left:4px">(+$${Number(i.customPrint.extra_charge).toFixed(2)})</span>` : ''}
                      </div>
                      ${i.customPrint.front_images?.length ? `
                        <div style="font-size:.7rem;font-weight:700;color:var(--text-light);text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">
                          <i class="fas fa-arrow-up" style="font-size:.6rem"></i> Front Design (${i.customPrint.front_images.length} file${i.customPrint.front_images.length>1?'s':''})
                        </div>
                        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px">
                          ${i.customPrint.front_images.map((u,idx) => `
                            <div style="display:flex;flex-direction:column;align-items:center;gap:5px">
                              <a href="${safeMediaUrl(u)}" target="_blank" rel="noopener noreferrer" title="Click to view full size">
                                <img src="${safeMediaUrl(u)}"
                                  loading="lazy" decoding="async" width="80" height="80"
                                  style="width:80px;height:80px;object-fit:cover;border-radius:6px;border:2px solid var(--primary);cursor:zoom-in;display:block"
                                  data-csp-onerror="this.closest('div').style.display='none'" />
                              </a>
                              <button data-csp-onclick="downloadImg('${safeMediaUrl(u)}','front-design-${idx+1}')"
                                style="font-size:.68rem;padding:3px 8px;border:1px solid var(--primary);background:transparent;color:var(--primary);border-radius:4px;cursor:pointer;white-space:nowrap">
                                <i class="fas fa-download" style="font-size:.6rem"></i> Download
                              </button>
                            </div>`).join('')}
                        </div>` : ''}
                      ${i.customPrint.back_images?.length ? `
                        <div style="font-size:.7rem;font-weight:700;color:var(--text-light);text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">
                          <i class="fas fa-arrow-down" style="font-size:.6rem"></i> Back Design (${i.customPrint.back_images.length} file${i.customPrint.back_images.length>1?'s':''})
                        </div>
                        <div style="display:flex;gap:10px;flex-wrap:wrap">
                          ${i.customPrint.back_images.map((u,idx) => `
                            <div style="display:flex;flex-direction:column;align-items:center;gap:5px">
                              <a href="${safeMediaUrl(u)}" target="_blank" rel="noopener noreferrer" title="Click to view full size">
                                <img src="${safeMediaUrl(u)}"
                                  loading="lazy" decoding="async" width="80" height="80"
                                  style="width:80px;height:80px;object-fit:cover;border-radius:6px;border:2px solid var(--secondary);cursor:zoom-in;display:block"
                                  data-csp-onerror="this.closest('div').style.display='none'" />
                              </a>
                              <button data-csp-onclick="downloadImg('${safeMediaUrl(u)}','back-design-${idx+1}')"
                                style="font-size:.68rem;padding:3px 8px;border:1px solid var(--secondary);background:transparent;color:var(--secondary);border-radius:4px;cursor:pointer;white-space:nowrap">
                                <i class="fas fa-download" style="font-size:.6rem"></i> Download
                              </button>
                            </div>`).join('')}
                        </div>` : ''}
                    </div>` : ''}
                </td>
                <td style="padding:10px 8px;vertical-align:top;text-align:center">${i.qty}</td>
                <td style="padding:10px 8px;vertical-align:top;text-align:right">${fmt(i.price)}</td>
                <td style="padding:10px 8px;vertical-align:top;text-align:right;font-weight:700">${fmt(i.price*i.qty)}</td>
              </tr>`).join('')}
          </tbody>
        </table>
        <div class="summary-row mt-16"><span>Subtotal</span><span>${fmt(o.subtotal)}</span></div>
        ${o.discount > 0 ? `<div class="summary-row"><span>Discount (${esc(o.coupon_code)})</span><span style="color:var(--success)">-${fmt(o.discount)}</span></div>` : ''}
        <div class="summary-row"><span>Shipping</span><span>${fmt(o.shipping_charge)}</span></div>
        <div class="summary-row total"><span>Total</span><span>${fmt(o.total)}</span></div>
        ${o.notes ? `<div class="mt-16"><strong>Notes:</strong> ${esc(o.notes)}</div>` : ''}
        <div class="mt-16 flex-between">
          <span>${statusBadge(o.status)}</span>
          <span class="text-sm text-muted">Ordered ${fmtDate(o.created_at)}</span>
        </div>
        <div class="mt-16" style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-outline" data-csp-onclick="printPackingSlip('${o.id}')"><i class="fas fa-box-open"></i> Packing slip</button>
          <button class="btn btn-outline" data-csp-onclick="printAdminInvoice('${o.id}')"><i class="fas fa-file-invoice"></i> Invoice</button>
          <button class="btn btn-outline" data-csp-onclick="sendOrderEmail('${o.id}','confirmation')"><i class="fas fa-envelope"></i> Resend confirmation</button>
          <button class="btn btn-outline" data-csp-onclick="sendOrderEmail('${o.id}','status')"><i class="fas fa-paper-plane"></i> Send status</button>
          ${o.status === 'delivered' ? `<button class="btn btn-outline" data-csp-onclick="sendOrderEmail('${o.id}','review')"><i class="fas fa-star"></i> Request review</button>` : ''}
        </div>
        ${o.review_requested_at ? `<div class="text-sm text-muted mt-8"><i class="fas fa-check-circle"></i> Review request sent ${fmtDate(o.review_requested_at)}</div>` : ''}
      </div>`);
  };

  window.editOrderStatus = (id) => {
    const order = orders.find(o => o.id === id);
    if (!order) return;
    const status = order.status || 'pending';
    const payStatus = order.payment_status || 'pending';
    const tracking = order.tracking_number || '';
    const notes = order.notes || '';
    const nextStatus = {
      pending: ['processing','shipped'],
      processing: ['shipped','delivered'],
      shipped: ['delivered','return_requested'],
      delivered: ['return_requested'],
      return_requested: [],
      cancelled: [],
      return_received: [],
    };
    const statusOptions = [status, ...(nextStatus[status] || [])].filter((s, i, arr) => arr.indexOf(s) === i);
    const nextPayment = (() => {
      if (['refunded','refund_pending'].includes(payStatus)) return [payStatus];
      if (payStatus === 'paid') return ['paid'];
      const base = ['pending','paid','failed'];
      if (['cancelled','return_received'].includes(status)) base.push('refund_pending','refunded');
      return base.filter((s, i, arr) => arr.indexOf(s) === i);
    })();
    openModal(`
      <div class="modal-header"><h3>Update Order</h3><button class="modal-close" data-csp-onclick="closeModal()" aria-label="Close">×</button></div>
      <div class="modal-body">
        ${['pending','processing'].includes(status) ? `
          <div class="alert alert-warning" style="margin-bottom:14px">
            Use <strong>Cancel & Refund</strong> for cancellations so stock, bookkeeping, payment status, and customer emails stay correct.
          </div>` : ''}
        <div class="form-group"><label class="form-label">Order Status</label>
          <select class="form-control" id="upd-status">
            ${statusOptions.map(s => {
              const label = {'return_requested':'Return Requested','return_received':'Return Received'}[s] || s.charAt(0).toUpperCase()+s.slice(1);
              return `<option value="${s}" ${s===status?'selected':''}>${label}</option>`;
            }).join('')}
          </select></div>
        <div class="form-group"><label class="form-label">Payment Status</label>
          <select class="form-control" id="upd-payment">
            ${nextPayment.map(s => {
              const label = s === 'refund_pending' ? 'Refund Pending' : s.charAt(0).toUpperCase()+s.slice(1);
              return `<option value="${s}" ${s===payStatus?'selected':''}>${label}</option>`;
            }).join('')}
          </select></div>
        <div class="form-group"><label class="form-label">Tracking Number</label>
          <input class="form-control" id="upd-tracking" value="${esc(tracking)}" placeholder="Enter tracking number" /></div>
        <div class="form-group"><label class="form-label">Internal Notes</label>
          <textarea class="form-control" id="upd-notes" rows="3" placeholder="Internal note for this order">${esc(notes)}</textarea></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" data-csp-onclick="closeModal()">Cancel</button>
        ${['pending','processing'].includes(status) && !['refunded','refund_pending'].includes(payStatus) ? `
          <button class="btn" style="background:var(--danger);color:#fff;border:none" data-csp-onclick="cancelOrderAdmin('${id}','${order.order_number}')">
            <i class="fas fa-ban"></i> Cancel & Refund
          </button>` : ''}
        <button class="btn btn-primary" data-csp-onclick="updateOrderStatus('${id}')">Update Order</button>
      </div>`);
  };

  window.updateOrderStatus = async (id) => {
    try {
      await api.put(`/admin/orders/${id}`, {
        status: document.getElementById('upd-status').value,
        payment_status: document.getElementById('upd-payment').value,
        tracking_number: document.getElementById('upd-tracking').value,
        notes: document.getElementById('upd-notes').value,
      });
      toast('Order updated!', 'success'); closeModal(); await loadOrders();
    } catch (e) { toast(e.message, 'error'); }
  };

  window.cancelOrderAdmin = async (id, orderNum) => {
    if (!confirm(`Cancel order ${orderNum} and start the refund flow? This also restores stock and voids the bookkeeping sale.`)) return;
    try {
      const res = await api.post(`/orders/${id}/cancel`, {});
      toast(res.message || 'Order cancelled', 'success');
      closeModal();
      await loadOrders();
    } catch (e) {
      toast(e.message || 'Could not cancel order', 'error');
    }
  };

  // Process return — admin chooses full or 50% refund
  window.openProcessReturn = (id, orderNum, total) => {
    openModal(`
      <div class="modal-header">
        <h3><i class="fas fa-undo-alt" style="color:#c2410c;margin-right:8px"></i>Process Return — ${orderNum}</h3>
        <button class="modal-close" data-csp-onclick="closeModal()" aria-label="Close">×</button>
      </div>
      <div class="modal-body">
        <p style="margin-bottom:16px">You have received the returned package. Select the condition of the item to determine the refund amount.</p>
        <div class="grid-2" style="gap:14px">
          <div style="border:2px solid var(--primary);border-radius:10px;padding:18px;cursor:pointer;text-align:center"
            data-csp-onclick="doProcessReturn('${id}','full')" id="btn-full"
            data-csp-onmouseover="this.style.background='rgba(29,92,74,.06)'" data-csp-onmouseout="this.style.background=''">
            <i class="fas fa-check-circle" style="font-size:1.8rem;color:var(--success);margin-bottom:10px;display:block"></i>
            <div style="font-weight:800;font-size:1rem">Full Refund</div>
            <div style="font-size:.82rem;color:var(--text-light);margin-top:4px">Original packaging, unused</div>
            <div style="font-size:1.1rem;font-weight:800;color:var(--primary);margin-top:8px">${fmt(total)}</div>
          </div>
          <div style="border:2px solid #c2410c;border-radius:10px;padding:18px;cursor:pointer;text-align:center"
            data-csp-onclick="doProcessReturn('${id}','half')" id="btn-half"
            data-csp-onmouseover="this.style.background='rgba(194,65,12,.06)'" data-csp-onmouseout="this.style.background=''">
            <i class="fas fa-exclamation-circle" style="font-size:1.8rem;color:#c2410c;margin-bottom:10px;display:block"></i>
            <div style="font-weight:800;font-size:1rem">50% Refund</div>
            <div style="font-size:.82rem;color:var(--text-light);margin-top:4px">Item appears used</div>
            <div style="font-size:1.1rem;font-weight:800;color:#c2410c;margin-top:8px">${fmt(total / 2)}</div>
          </div>
        </div>
        <div style="margin-top:16px;padding:10px 14px;background:#fef9f0;border-radius:8px;font-size:.82rem;color:var(--text-light)">
          <i class="fas fa-info-circle" style="color:var(--secondary)"></i>
          The refund will be sent directly to the customer's original payment card via Stripe.
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" data-csp-onclick="closeModal()">Cancel</button>
      </div>`);
  };

  window.doProcessReturn = async (id, refundType) => {
    try {
      const res = await api.post(`/admin/orders/${id}/process-return`, { refund_type: refundType });
      toast(res.message, 'success');
      closeModal();
      await loadOrders();
    } catch (e) { toast(e.message, 'error'); }
  };

  // Download a customer-uploaded print image at original quality
  window.downloadImg = async (url, filename) => {
    try {
      url = safeMediaUrl(url);
      if (!url) throw new Error('Invalid file');
      const res = await fetch(url);
      if (!res.ok) throw new Error('File not found');
      const blob = await res.blob();
      const ext = (blob.type || 'image/png').split('/')[1].split('+')[0] || 'png';
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${filename}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
      toast('Download started!', 'success');
    } catch (e) {
      toast('Could not download image. Try right-clicking and Save Image As.', 'error');
    }
  };

  try { await loadOrders(); } catch (e) {
    if (Router.stale(_gen)) return;
    document.querySelector('.admin-content').innerHTML =
      `<div class="empty-state"><i class="fas fa-exclamation-circle"></i><h3>${esc(e.message)}</h3></div>`;
  }
});
