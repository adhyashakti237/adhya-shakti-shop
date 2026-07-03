window.Pages = window.Pages || {};

Pages.expenses = async function(){
  Expenses._month = Expenses._month || todayStr().slice(0, 7);
  Layout.render('expenses', `
    <div class="page-head">
      <div><h1>Expenses</h1><div class="sub">Money going out</div></div>
      <button class="btn btn-primary btn-sm" id="addExpBtn"><i class="fa-solid fa-plus"></i> Add</button>
    </div>
    <div class="monthsel">
      <i class="fa-solid fa-calendar muted"></i>
      <input class="input" type="month" id="expMonth" value="${Expenses._month}">
    </div>
    <div id="expList"><div class="empty"><span class="spinner"></span></div></div>`);

  document.getElementById('addExpBtn').onclick = () => Expenses.openForm(null);
  document.getElementById('expMonth').onchange = e => { Expenses._month = e.target.value; Expenses.load(); };
  Expenses.load();
};

const Expenses = {
  _month: null,

  async load(){
    const box = document.getElementById('expList');
    if (!box) return;
    let expenses = [];
    try { expenses = (await API.get('/api/expenses?month=' + Expenses._month)).expenses; }
    catch(e){ box.innerHTML = `<div class="empty"><p>${esc(e.message)}</p></div>`; return; }

    if (!expenses.length){
      box.innerHTML = `<div class="card"><div class="empty">
        <i class="fa-solid fa-money-bill-wave"></i><p>No expenses this month</p>
        <p class="small">Tap “Add” to record money going out.</p></div></div>`;
      return;
    }
    const total = expenses.reduce((a, e) => a + (e.amount || 0), 0);
    box.innerHTML = `
      <div class="tile out" style="margin-bottom:12px"><div class="lbl">${expenses.length} expense${expenses.length>1?'s':''} this month</div>
        <div class="val">${money(total)}</div></div>
      <div class="card">${expenses.map(Expenses.row).join('')}</div>`;
    box.querySelectorAll('[data-exp]').forEach(r => r.onclick = () => Expenses.openDetail(r.getAttribute('data-exp')));
  },

  row(e){
    const clip = e.attachment_count ? `<i class="fa-solid fa-paperclip clip" title="${e.attachment_count} bill(s)"></i>` : '';
    const title = e.payee || e.category || 'Expense';
    const sub = [e.category, fmtDate(e.expense_date), e.payment_method].filter(Boolean).map(esc).join(' · ');
    return `<div class="row-item" data-exp="${e.id}" style="cursor:pointer">
      <div class="ri-ico" style="background:var(--red-l);color:var(--red)"><i class="fa-solid fa-money-bill-wave"></i></div>
      <div class="ri-main"><div class="ri-title">${esc(title)}</div><div class="ri-sub">${sub}</div></div>
      <div style="text-align:right">${clip} <span class="ri-amt amt-out">−${money(e.amount)}</span></div>
    </div>`;
  },

  async openForm(exp){
    const isEdit = !!exp;
    const meta = await Meta.load();
    await VendorPicker.load();
    const cats = meta.expense_categories || ['Other'];
    const pays = meta.payment_methods || ['Cash','Card'];
    Modal.open(isEdit ? 'Edit expense' : 'Add expense', `
      <div id="expErr" class="form-err" style="display:none"></div>
      <div class="row-2">
        <div class="field"><label>Date</label>
          <input class="input" type="date" id="e_date" value="${(exp && exp.expense_date) || todayStr()}"></div>
        <div class="field"><label>Amount *</label>
          <input class="input" type="number" min="0" step="0.01" id="e_amount" value="${(exp && exp.amount) || ''}" placeholder="0.00"></div>
      </div>
      <div class="field"><label>Category</label>
        <select id="e_cat">${cats.map(c => `<option ${exp && exp.category === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></div>
      <div class="row-2">
        <div class="field"><label>Paid by <span class="muted small">(optional)</span></label>
          <input class="input" id="e_payee" value="${esc((exp && exp.payee) || '')}" placeholder="Who paid"></div>
        <div class="field"><label>Payment method</label>
          <select id="e_pay">${pays.map(p => `<option ${exp && exp.payment_method === p ? 'selected' : ''}>${esc(p)}</option>`).join('')}</select></div>
      </div>
      ${VendorPicker.html(exp && exp.vendor_id)}
      <div class="field"><label>Notes <span class="muted small">(optional)</span></label>
        <textarea id="e_notes" placeholder="optional">${esc((exp && exp.notes) || '')}</textarea></div>
      ${Attach.pickerHtml('expAttach')}
    `, `
      ${isEdit ? '<button class="btn btn-danger" id="expDelete"><i class="fa-solid fa-trash"></i></button>' : ''}
      <button class="btn" data-close>Cancel</button>
      <button class="btn btn-primary" id="expSave">${isEdit ? 'Save' : 'Add expense'}</button>`);

    Attach.initPicker('expAttach');
    VendorPicker.bind();
    document.getElementById('expSave').onclick = () => Expenses.save(isEdit ? exp.id : null);
    if (isEdit) document.getElementById('expDelete').onclick = () => Expenses.confirmDelete(exp.id);
  },

  async save(eid){
    const err = document.getElementById('expErr');
    err.style.display = 'none';
    const amount = Number(document.getElementById('e_amount').value) || 0;
    if (amount <= 0){ err.textContent = 'Enter an amount greater than zero'; err.style.display = 'block'; return; }
    const btn = document.getElementById('expSave');
    btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>';
    try {
      const vendor_id = await VendorPicker.resolve();
      const payload = {
        expense_date: document.getElementById('e_date').value || todayStr(),
        amount,
        category: document.getElementById('e_cat').value,
        payee: document.getElementById('e_payee').value.trim(),
        payment_method: document.getElementById('e_pay').value,
        notes: document.getElementById('e_notes').value.trim(),
        vendor_id,
      };
      const res = eid ? await API.put('/api/expenses/' + eid, payload) : await API.post('/api/expenses', payload);
      const files = Attach.files('expAttach');
      if (files.length) await Attach.upload('expense', res.expense.id, files);
      Modal.close(); toast(eid ? 'Expense updated' : 'Expense added');
      Expenses.load();
    } catch(ex){ err.textContent = ex.message; err.style.display = 'block'; btn.disabled = false; btn.textContent = eid ? 'Save' : 'Add expense'; }
  },

  async openDetail(id){
    let e;
    try { e = (await API.get('/api/expenses/' + id)).expense; } catch(ex){ toast(ex.message, true); return; }
    Modal.open('Expense details', `
      <div class="kv"><span class="k">Date</span><span class="v">${fmtDate(e.expense_date)}</span></div>
      <div class="kv"><span class="k">Amount</span><span class="v" style="font-size:16px;color:var(--red)">−${money(e.amount)}</span></div>
      <div class="kv"><span class="k">Category</span><span class="v">${esc(e.category || '—')}</span></div>
      <div class="kv"><span class="k">Paid by</span><span class="v">${esc(e.payee || '—')}</span></div>
      ${e.vendor_name ? `<div class="kv"><span class="k">Vendor</span><span class="v">${esc(e.vendor_name)}</span></div>` : ''}
      <div class="kv"><span class="k">Payment method</span><span class="v">${esc(e.payment_method || '—')}</span></div>
      ${e.notes ? `<div class="kv"><span class="k">Notes</span><span class="v" style="font-weight:400">${esc(e.notes)}</span></div>` : ''}
      <div style="margin-top:14px"><label style="font-size:13px;font-weight:500;color:var(--muted)">Bills</label>
        <div id="expBills">${Attach.viewerHtml(e.attachments)}</div></div>
    `, `<button class="btn btn-danger btn-sm" id="eDel"><i class="fa-solid fa-trash"></i></button>
        <button class="btn" id="eEdit"><i class="fa-solid fa-pen"></i> Edit</button>
        <button class="btn btn-primary" data-close>Done</button>`);
    Attach.bindDelete(document.getElementById('expBills'), () => Expenses.openDetail(id));
    document.getElementById('eEdit').onclick = () => { Modal.close(); Expenses.openForm(e); };
    document.getElementById('eDel').onclick = () => Expenses.confirmDelete(id);
  },

  confirmDelete(id){
    Modal.open('Delete expense?', `<p class="muted">This expense and any attached bills will be removed.</p>`,
      `<button class="btn" data-close>Cancel</button><button class="btn btn-danger" id="delYes">Delete</button>`);
    document.getElementById('delYes').onclick = async () => {
      try { await API.del('/api/expenses/' + id); Modal.close(); toast('Expense deleted'); Expenses.load(); }
      catch(e){ toast(e.message, true); }
    };
  },
};
