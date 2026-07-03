Router.register('/admin/orders', async () => {
  if (!Auth.isAdmin()) { Router.navigate('/admin/login'); return; }
  adminLayout('<div class="spinner"></div>', '/admin/orders');
  const _gen = Router._gen;

  let orders = [], filterStatus = new URLSearchParams(location.search || '').get('status') || '', searchTerm = '';
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
      return !searchTerm || haystack.includes(searchTerm);
    });
    const counts = {
      pending: orders.filter(o => o.status === 'pending').length,
      processing: orders.filter(o => o.status === 'processing').length,
      returns: orders.filter(o => o.status === 'return_requested').length,
      paid: orders.filter(o => o.payment_status === 'paid').length,
      attention: orders.filter(o => orderAttentionFlags(o).length).length,
    };
    document.querySelector('.admin-content').innerHTML = `
      <div class="admin-page-title">Orders (${visibleOrders.length}${visibleOrders.length !== orders.length ? ` of ${orders.length}` : ''})</div>
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
            <div class="text-muted text-sm">${filterStatus ? `Filtered by ${esc(filterStatus.replace('_',' '))}` : 'Showing all order statuses'}</div>
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
          <thead><tr><th>Order #</th><th>Date</th><th>Customer</th><th>Items</th><th>Total</th><th>Payment</th><th>Status</th><th>Flags</th><th>Actions</th></tr></thead>
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
                <td data-label="Flags"><span class="admin-td-value">${orderFlagsHtml(o, true) || '<span class="text-muted text-sm">None</span>'}</span></td>
                <td data-label="Actions">
                  <div class="admin-td-value" style="display:flex;gap:6px;flex-wrap:wrap">
                    <button class="btn btn-sm btn-ghost" data-csp-onclick="viewOrderAdmin('${o.id}')" aria-label="View order ${o.order_number}"><i class="fas fa-eye"></i></button>
                    <button class="btn btn-sm btn-outline" data-csp-onclick="editOrderStatus('${o.id}')" aria-label="Edit order ${esc(o.order_number)} status"><i class="fas fa-edit"></i></button>
                    ${['pending','processing'].includes(o.status) && !['refunded','refund_pending'].includes(o.payment_status)
                      ? `<button class="btn btn-sm" style="background:var(--danger);color:#fff;border:none" data-csp-onclick="cancelOrderAdmin('${o.id}','${o.order_number}')"><i class="fas fa-ban"></i> Cancel</button>`
                      : ''}
                    ${o.status==='return_requested'?`<button class="btn btn-sm" style="background:#c2410c;color:#fff;border:none" data-csp-onclick="openProcessReturn('${o.id}','${o.order_number}',${o.total})"><i class="fas fa-undo-alt"></i> Process Return</button>`:''}
                  </div>
                </td>
              </tr>`).join('') : '<tr><td colspan="9" class="text-center text-muted" style="padding:32px">No orders found</td></tr>'}
          </tbody>
        </table></div>
      </div>`;
  }

  window.changeStatusFilter = (s) => { filterStatus = s; loadOrders(); };
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
        </div>
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
