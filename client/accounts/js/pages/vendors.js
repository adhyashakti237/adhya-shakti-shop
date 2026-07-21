window.Pages = window.Pages || {};

Pages.vendors = async function(){
  Layout.render('vendors', `
    <div class="page-head">
      <div><h1>Vendors</h1><div class="sub">Who you buy from &amp; how much you've spent</div></div>
      <button class="btn btn-primary btn-sm" id="addVenBtn"><i class="fa-solid fa-plus"></i> Add vendor</button>
    </div>
    <div class="card card-pad filter-card">
      <label class="filter-label">Search vendors</label>
      <div class="list-toolbar tight">
        <div class="searchbar"><i class="fa-solid fa-magnifying-glass"></i>
          <input class="input" id="venSearch" value="${esc(Vendors._q || '')}" placeholder="Company, contact, phone, email..." />
        </div>
        <button class="btn btn-sm toolbar-clear" id="venClearBtn"><i class="fa-solid fa-rotate-left"></i> Clear</button>
      </div>
    </div>
    <div id="venList"><div class="empty"><span class="spinner"></span></div></div>`);
  document.getElementById('addVenBtn').onclick = () => Vendors.openForm(null);
  document.getElementById('venSearch').oninput = e => {
    Vendors._q = e.target.value || '';
    Vendors.load(false);
  };
  document.getElementById('venClearBtn').onclick = () => {
    Vendors._q = '';
    const input = document.getElementById('venSearch');
    if (input) input.value = '';
    Vendors.load(false);
  };
  Vendors.load();
};

const Vendors = {
  _q: '',
  _all: null,
  async load(refresh = true){
    const box = document.getElementById('venList');
    if (!box) return;
    let vendors = [];
    try {
      if (refresh || !Vendors._all) Vendors._all = (await API.get('/api/acc/vendors')).vendors;
      vendors = Vendors._all || [];
    }
    catch(e){ box.innerHTML = `<div class="empty"><p>${esc(e.message)}</p></div>`; return; }
    const q = String(Vendors._q || '').trim().toLowerCase();
    if (q) vendors = vendors.filter(v => [v.name, v.contact_name, v.phone, v.email, v.address].some(x => String(x || '').toLowerCase().includes(q)));
    if (!vendors.length){
      box.innerHTML = `<div class="card"><div class="empty">
        <i class="fa-solid fa-people-group"></i><p>No vendors yet</p>
        <p class="small">${q ? 'No vendors match this search.' : 'Add a vendor, then tag them on a purchase or expense.'}</p></div></div>`;
      return;
    }
    box.innerHTML = `
      <div class="list-meta"><span>${vendors.length} vendor${vendors.length === 1 ? '' : 's'} shown</span>${q ? `<b>Search: ${esc(q)}</b>` : '<b>All vendors</b>'}</div>
      <div class="card">${vendors.map(Vendors.row).join('')}</div>`;
    box.querySelectorAll('[data-ven]').forEach(r => r.onclick = () => Vendors.openDetail(r.getAttribute('data-ven')));
  },

  row(v){
    const sub = [v.contact_name, v.phone, v.email].filter(Boolean).map(esc).join(' · ');
    return `<div class="row-item" data-ven="${v.id}" style="cursor:pointer">
      <div class="ri-ico"><i class="fa-solid fa-building-store"></i></div>
      <div class="ri-main"><div class="ri-title">${esc(v.name)}</div>${sub ? `<div class="ri-sub">${sub}</div>` : ''}</div>
      <div style="text-align:right"><div class="ri-amt amt-out">${money(v.total_spent)}</div>
        <div class="ri-sub">total spent</div></div>
    </div>`;
  },

  openForm(ven){
    const isEdit = !!ven;
    Modal.open(isEdit ? 'Edit vendor' : 'Add vendor', `
      <div id="venErr" class="form-err" style="display:none"></div>
      <div class="field"><label>Vendor company name *</label>
        <input class="input" id="v_name" value="${esc((ven && ven.name) || '')}" placeholder="e.g. Mumbai Wholesale"></div>
      <div class="field"><label>Vendor contact name <span class="muted small">(optional)</span></label>
        <input class="input" id="v_contact" value="${esc((ven && ven.contact_name) || '')}" placeholder="Person you deal with"></div>
      <div class="row-2">
        <div class="field"><label>Phone</label><input class="input" id="v_phone" value="${esc((ven && ven.phone) || '')}"></div>
        <div class="field"><label>Email</label><input class="input" id="v_email" value="${esc((ven && ven.email) || '')}"></div>
      </div>
      <div class="field"><label>Address</label><input class="input" id="v_addr" value="${esc((ven && ven.address) || '')}"></div>
      <div class="field"><label>Notes <span class="muted small">(what they supply, terms…)</span></label>
        <textarea id="v_notes" placeholder="optional">${esc((ven && ven.notes) || '')}</textarea></div>
    `, `
      ${isEdit ? '<button class="btn btn-danger" id="venDelete"><i class="fa-solid fa-trash"></i></button>' : ''}
      <button class="btn" data-close>Cancel</button>
      <button class="btn btn-primary" id="venSave">${isEdit ? 'Save' : 'Add vendor'}</button>`);
    document.getElementById('venSave').onclick = () => Vendors.save(isEdit ? ven.id : null);
    if (isEdit) document.getElementById('venDelete').onclick = () => Vendors.confirmDelete(ven.id);
  },

  async save(vid){
    const err = document.getElementById('venErr');
    err.style.display = 'none';
    const payload = {
      name: document.getElementById('v_name').value.trim(),
      contact_name: document.getElementById('v_contact').value.trim(),
      phone: document.getElementById('v_phone').value.trim(),
      email: document.getElementById('v_email').value.trim(),
      address: document.getElementById('v_addr').value.trim(),
      notes: document.getElementById('v_notes').value.trim(),
    };
    if (!payload.name){ err.textContent = 'Please enter a vendor company name'; err.style.display = 'block'; return; }
    const btn = document.getElementById('venSave');
    btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>';
    try {
      if (vid) await API.put('/api/acc/vendors/' + vid, payload);
      else await API.post('/api/acc/vendors', payload);
      Vendors._all = null;
      Modal.close(); toast(vid ? 'Vendor saved' : 'Vendor added'); Vendors.load();
    } catch(ex){ err.textContent = ex.message; err.style.display = 'block'; btn.disabled = false; btn.textContent = vid ? 'Save' : 'Add vendor'; }
  },

  async openDetail(id){
    let v;
    try { v = (await API.get('/api/acc/vendors/' + id)).vendor; } catch(e){ toast(e.message, true); return; }
    const purRows = (v.purchases || []).map(p => {
      const items = (p.items || []).map(it => `${esc(it.name)} ×${fmtQty(it.qty)}`).join(', ');
      const clip = p.attachment_count ? ' <i class="fa-solid fa-paperclip clip"></i>' : '';
      return `<tr><td>${fmtDate(p.purchase_date)}</td><td>${items || '—'}${clip}</td><td class="r">${money(p.total)}</td></tr>`;
    }).join('') || `<tr><td colspan="3" class="muted small">No purchases</td></tr>`;
    const expRows = (v.expenses || []).map(e => {
      const clip = e.attachment_count ? ' <i class="fa-solid fa-paperclip clip"></i>' : '';
      return `<tr><td>${fmtDate(e.expense_date)}</td><td>${esc(e.category || '—')}${clip}</td><td class="r">${money(e.amount)}</td></tr>`;
    }).join('') || `<tr><td colspan="3" class="muted small">No expenses</td></tr>`;
    const contact = [v.contact_name && ('Contact: ' + v.contact_name), v.phone, v.email, v.address].filter(Boolean).map(esc).join(' · ');
    Modal.open(v.name, `
      ${contact ? `<p class="muted small" style="margin-bottom:6px">${contact}</p>` : ''}
      ${v.notes ? `<p class="small" style="margin-bottom:12px">${esc(v.notes)}</p>` : ''}
      <div class="grid grid-2" style="margin-bottom:14px">
        <div class="tile out"><div class="lbl">Total spent</div><div class="val">${money(v.total_spent)}</div></div>
        <div class="tile"><div class="lbl">Purchases / Expenses</div><div class="val" style="font-size:15px">${money(v.purchase_total)} / ${money(v.expense_total)}</div></div>
      </div>
      <h3 style="font-size:14px;font-weight:600;margin:8px 0 4px">Purchases</h3>
      <table class="dtable"><thead><tr><th>Date</th><th>Items</th><th class="r">Total</th></tr></thead><tbody>${purRows}</tbody></table>
      <h3 style="font-size:14px;font-weight:600;margin:14px 0 4px">Expenses</h3>
      <table class="dtable"><thead><tr><th>Date</th><th>Category</th><th class="r">Amount</th></tr></thead><tbody>${expRows}</tbody></table>
    `, `<button class="btn btn-danger btn-sm" id="vDel"><i class="fa-solid fa-trash"></i></button>
        <button class="btn" id="vEdit"><i class="fa-solid fa-pen"></i> Edit</button>
        <button class="btn btn-primary" data-close>Done</button>`);
    document.getElementById('vEdit').onclick = () => { Modal.close(); Vendors.openForm(v); };
    document.getElementById('vDel').onclick = () => Vendors.confirmDelete(id);
  },

  confirmDelete(id){
    Modal.open('Remove vendor?', `<p class="muted">The vendor is removed. Their past purchases and expenses stay in your books — they're just no longer tagged to a vendor.</p>`,
      `<button class="btn" data-close>Cancel</button><button class="btn btn-danger" id="delYes">Remove</button>`);
    document.getElementById('delYes').onclick = async () => {
      try { await API.del('/api/acc/vendors/' + id); Vendors._all = null; Modal.close(); toast('Vendor removed'); Vendors.load(); }
      catch(e){ toast(e.message, true); }
    };
  },
};
