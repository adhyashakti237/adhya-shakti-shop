Router.register('/admin/coupons', async () => {
  if (!Auth.isStrictAdmin()) { Router.navigate(Auth.isAdmin() ? '/admin/orders' : '/admin/login'); return; }
  adminLayout('<div class="spinner"></div>', '/admin/coupons');
  const _gen = Router._gen;

  let coupons = [];

  async function load() {
    coupons = await api.get('/admin/coupons');
    if (Router.stale(_gen)) return;
    render();
  }

  function render() {
    document.querySelector('.admin-content').innerHTML = `
      <div class="admin-page-title">
        Coupons & Discounts
        <button class="btn btn-primary" data-csp-onclick="openCouponModal()"><i class="fas fa-plus"></i> Add Coupon</button>
      </div>
      <div class="card"><div class="table-wrap"><table>
        <thead><tr><th>Code</th><th>Type</th><th>Discount</th><th>Min Order</th><th>Used / Max</th><th>Expires</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>
          ${coupons.length ? coupons.map(c => `
            <tr>
              <td><strong style="font-family:monospace;font-size:1rem">${c.code}</strong></td>
              <td>${c.discount_type === 'percent' ? 'Percentage' : 'Fixed Amount'}</td>
              <td>${c.discount_type === 'percent' ? c.discount_value + '%' : fmt(c.discount_value)}</td>
              <td>${c.min_order > 0 ? fmt(c.min_order) : '-'}</td>
              <td>${c.used_count} / ${c.max_uses || '∞'}</td>
              <td>${c.expires_at ? fmtDate(c.expires_at) : 'Never'}</td>
              <td>${c.is_active ? '<span class="badge badge-success">Active</span>' : '<span class="badge badge-cancelled">Inactive</span>'}</td>
              <td><button class="btn btn-sm btn-danger" data-csp-onclick="deleteCoupon('${c.id}','${c.code}')" aria-label="Delete coupon ${c.code}"><i class="fas fa-trash"></i></button></td>
            </tr>`).join('') : '<tr><td colspan="8" class="text-center text-muted" style="padding:32px">No coupons yet</td></tr>'}
        </tbody>
      </table></div></div>`;
  }

  window.openCouponModal = () => {
    openModal(`
      <div class="modal-header"><h3>Create Coupon</h3><button class="modal-close" data-csp-onclick="closeModal()" aria-label="Close">×</button></div>
      <div class="modal-body">
        <div class="form-group"><label class="form-label">Coupon Code *</label>
          <input class="form-control" id="cp-code" placeholder="SAVE20" style="text-transform:uppercase" /></div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">Discount Type *</label>
            <select class="form-control" id="cp-type">
              <option value="percent">Percentage (%)</option>
              <option value="fixed">Fixed Amount ($)</option>
            </select></div>
          <div class="form-group"><label class="form-label">Discount Value *</label>
            <input class="form-control" id="cp-value" type="number" min="0" placeholder="20" /></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">Minimum Order ($)</label>
            <input class="form-control" id="cp-min" type="number" min="0" value="0" /></div>
          <div class="form-group"><label class="form-label">Max Uses (blank = unlimited)</label>
            <input class="form-control" id="cp-max" type="number" min="1" placeholder="100" /></div>
        </div>
        <div class="form-group"><label class="form-label">Expiry Date (optional)</label>
          <input class="form-control" id="cp-exp" type="date" /></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" data-csp-onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" data-csp-onclick="saveCoupon()">Create Coupon</button>
      </div>`);
  };

  window.saveCoupon = async () => {
    const code = document.getElementById('cp-code').value.trim().toUpperCase();
    if (!code) { toast('Coupon code is required', 'warning'); return; }
    try {
      await api.post('/admin/coupons', {
        code, discount_type: document.getElementById('cp-type').value,
        discount_value: parseFloat(document.getElementById('cp-value').value),
        min_order: parseFloat(document.getElementById('cp-min').value) || 0,
        max_uses: parseInt(document.getElementById('cp-max').value) || null,
        expires_at: document.getElementById('cp-exp').value || null,
      });
      toast('Coupon created!', 'success'); closeModal(); await load();
    } catch (e) { toast(e.message, 'error'); }
  };

  window.deleteCoupon = async (id, code) => {
    if (!confirm(`Delete coupon "${code}"?`)) return;
    try { await api.del(`/admin/coupons/${id}`); toast('Coupon deleted', 'success'); await load(); }
    catch (e) { toast(e.message, 'error'); }
  };

  try { await load(); } catch (e) {
    if (Router.stale(_gen)) return;
    document.querySelector('.admin-content').innerHTML =
      `<div class="empty-state"><i class="fas fa-exclamation-circle"></i><h3>${esc(e.message)}</h3></div>`;
  }
});
