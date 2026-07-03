// ── Shared helpers, layout chrome, toast & modal ──────────────────────────────
function money(n){
  const v = Number(n || 0);
  const sign = v < 0 ? '-' : '';
  return sign + '$' + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function money0(n){
  const v = Number(n || 0);
  return (v < 0 ? '-' : '') + '$' + Math.abs(v).toLocaleString('en-US', { maximumFractionDigits: 0 });
}
function esc(s){
  return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
function fmtDate(s){
  if (!s) return '';
  const d = new Date(s.length <= 10 ? s + 'T00:00:00' : s);
  if (isNaN(d)) return s;
  return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
}
function todayStr(){ return new Date().toISOString().slice(0, 10); }
function monthLabel(m){
  const [y, mo] = (m || todayStr().slice(0,7)).split('-');
  return new Date(y, Number(mo) - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}
function accCategoryChildren(node){ return (node && (node.children || node.categories)) || []; }
function accBuildCategoryTree(rows){
  const nodes = {}, roots = [];
  (rows || []).forEach(r => { nodes[r.id] = { ...r, children: [] }; });
  Object.values(nodes).forEach(n => {
    const parent = nodes[n.parent_id];
    if (parent) parent.children.push(n);
    else roots.push(n);
  });
  return roots;
}
function accCategoryOptionsFromRows(rows, selectedId, includeInactive){
  const roots = accBuildCategoryTree(rows);
  const opts = ['<option value="">Select category</option>'];
  const walk = (node, depth, path) => {
    if (!includeInactive && node.is_active === 0 && node.id !== selectedId) return;
    const label = path.concat(node.name).join(' / ');
    opts.push(`<option value="${node.id}" ${selectedId === node.id ? 'selected' : ''}>${esc(label)}</option>`);
    accCategoryChildren(node).forEach(child => walk(child, depth + 1, path.concat(node.name)));
  };
  roots.forEach(root => walk(root, 0, []));
  return opts.join('');
}

// ── Toast ─────────────────────────────────────────────────────────────────────
function toast(msg, isErr){
  let t = document.querySelector('.toast');
  if (!t){ t = document.createElement('div'); t.className = 'toast'; document.body.appendChild(t); }
  t.textContent = msg;
  t.className = 'toast' + (isErr ? ' err' : '');
  requestAnimationFrame(() => t.classList.add('show'));
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove('show'), 2600);
}

// ── Modal ─────────────────────────────────────────────────────────────────────
const Modal = {
  open(title, bodyHtml, footHtml){
    Modal.close();
    const bg = document.createElement('div');
    bg.className = 'modal-bg';
    bg.innerHTML = `<div class="modal" role="dialog" aria-modal="true">
        <div class="modal-head"><h2>${esc(title)}</h2>
          <button class="icon-btn" style="background:#eee;color:#555" data-close aria-label="Close"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="modal-body">${bodyHtml}</div>
        ${footHtml ? `<div class="modal-foot">${footHtml}</div>` : ''}
      </div>`;
    bg.addEventListener('click', e => { if (e.target === bg || e.target.closest('[data-close]')) Modal.close(); });
    document.body.appendChild(bg);
    document.body.style.overflow = 'hidden';
    return bg;
  },
  close(){
    const bg = document.querySelector('.modal-bg');
    if (bg) bg.remove();
    document.body.style.overflow = '';
  }
};

// ── Navigation ────────────────────────────────────────────────────────────────
// Bookkeeping sections (admin + staff both get full access; customers never reach here).
const NAV = [
  { key:'home',      label:'Dashboard', icon:'fa-gauge-high',       path:'/' },
  { key:'sales',     label:'Sales',     icon:'fa-receipt',          path:'/sales' },
  { key:'purchases', label:'Purchases', icon:'fa-truck-ramp-box',   path:'/purchases' },
  { key:'inventory', label:'Inventory', icon:'fa-boxes-stacked',    path:'/inventory' },
  { key:'vendors',   label:'Vendors',   icon:'fa-people-group',     path:'/vendors' },
  { key:'expenses',  label:'Expenses',  icon:'fa-money-bill-wave',  path:'/expenses' },
  { key:'reports',   label:'Reports',   icon:'fa-chart-line',       path:'/reports' },
];
// Links back into the main shop admin (full-page nav — different app).
const SHOP_LINKS = [
  { label:'Shop dashboard', icon:'fa-gauge',        href:'/admin' },
  { label:'Products',       icon:'fa-box',          href:'/admin/products' },
  { label:'Orders',         icon:'fa-shopping-bag', href:'/admin/orders' },
];

// True when this app is running inside the admin panel's iframe (embedded mode).
const ACC_EMBED = (function(){ try { return window.self !== window.top; } catch(e){ return true; } })();

// ── Layout shell ──────────────────────────────────────────────────────────────
const Layout = {
  render(activeKey, innerHtml){
    // Embedded inside the admin shell → render only the content; the admin sidebar is the nav.
    if (ACC_EMBED){
      document.getElementById('app').innerHTML = `<div class="shell embed"><main class="content">${innerHtml}</main></div>`;
      return;
    }
    const link = n => `<a href="${n.path}" data-link class="nav-link${n.key === activeKey ? ' active' : ''}">
        <i class="fa-solid ${n.icon}"></i><span>${n.label}</span></a>`;
    const shopLink = s => `<a href="${s.href}" class="nav-link"><i class="fa-solid ${s.icon}"></i><span>${s.label}</span></a>`;

    document.getElementById('app').innerHTML = `
      <div class="shell">
        <header class="topbar">
          <div class="brand">Adhya <b>Shakti</b><small>ACCOUNTS &amp; BOOKKEEPING</small></div>
          <div class="topbar-actions">
            <a href="/admin" class="icon-btn" title="Back to shop admin"><i class="fa-solid fa-store"></i></a>
            <button class="icon-btn" id="acctBtn" aria-label="Account menu"><i class="fa-solid fa-user"></i></button>
          </div>
        </header>

        <nav class="navscroll">${NAV.map(link).join('')}</nav>

        <div class="layout">
          <nav class="sidebar">
            <div class="sb-label">Bookkeeping</div>
            ${NAV.map(link).join('')}
            <div class="sb-label">Shop</div>
            ${SHOP_LINKS.map(shopLink).join('')}
            <div class="sb-sep"></div>
            <a href="#" class="nav-link" id="navChangePw"><i class="fa-solid fa-key"></i><span>Change password</span></a>
            <a href="#" class="nav-link" id="navLogout"><i class="fa-solid fa-right-from-bracket"></i><span>Log out</span></a>
          </nav>
          <main class="content">${innerHtml}</main>
        </div>
      </div>`;

    document.getElementById('acctBtn').onclick = Layout.accountMenu;
    const cp = document.getElementById('navChangePw'); if (cp) cp.onclick = e => { e.preventDefault(); Layout.changePassword(); };
    const lo = document.getElementById('navLogout');   if (lo) lo.onclick = e => { e.preventDefault(); Auth.logout(); };
  },

  accountMenu(){
    const u = Auth.user() || {};
    const roleLabel = u.role === 'admin' ? 'Admin (owner)' : 'Staff';
    Modal.open('Account', `
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:18px">
        <div class="ri-ico" style="width:46px;height:46px;border-radius:50%"><i class="fa-solid fa-user"></i></div>
        <div><div style="font-weight:600">${esc(u.name || '')}</div>
          <div class="small muted">${esc(u.email || '')} · ${roleLabel}</div></div>
      </div>
      <a href="/admin" class="btn btn-block"><i class="fa-solid fa-store"></i> Back to shop admin</a>
      <button class="btn btn-block mt8" id="mChangePw"><i class="fa-solid fa-key"></i> Change password</button>
      <button class="btn btn-block btn-danger mt8" id="mLogout"><i class="fa-solid fa-right-from-bracket"></i> Log out</button>
    `);
    document.getElementById('mChangePw').onclick = () => { Modal.close(); Layout.changePassword(); };
    document.getElementById('mLogout').onclick = () => Auth.logout();
  },

  changePassword(){
    Modal.open('Change password', `
      <div id="pwErr" class="form-err" style="display:none"></div>
      <div class="field"><label>Current password</label><input class="input" type="password" id="pwCur"></div>
      <div class="field"><label>New password</label><input class="input" type="password" id="pwNew">
        <div class="hint">At least 6 characters.</div></div>
    `, `<button class="btn" data-close>Cancel</button><button class="btn btn-primary" id="pwSave">Save</button>`);
    document.getElementById('pwSave').onclick = async () => {
      const err = document.getElementById('pwErr');
      err.style.display = 'none';
      try {
        await API.post('/api/auth/change-password', {
          current_password: document.getElementById('pwCur').value,
          new_password: document.getElementById('pwNew').value,
        });
        Modal.close(); toast('Password changed — please log in again');
        setTimeout(() => Auth.logout(), 900);
      } catch(e){ err.textContent = e.message; err.style.display = 'block'; }
    };
  },
};

// Cached meta (currency, categories, payment methods) for forms.
const Meta = {
  data: null,
  async load(){ if (!Meta.data){ try { Meta.data = await API.get('/api/meta'); } catch(e){ Meta.data = {}; } } return Meta.data; },
};

// ── Vendor picker (optional) — used on Purchase & Expense forms ────────────────
const VendorPicker = {
  _vendors: [],
  async load(){ try { VendorPicker._vendors = (await API.get('/api/acc/vendors')).vendors; } catch(e){ VendorPicker._vendors = []; } return VendorPicker._vendors; },
  html(selectedId){
    const opts = ['<option value="">— none —</option>']
      .concat(VendorPicker._vendors.map(v => `<option value="${v.id}" ${selectedId === v.id ? 'selected' : ''}>${esc(v.name)}</option>`))
      .concat(['<option value="__add">+ New vendor…</option>']).join('');
    return `<div class="field"><label>Vendor <span class="muted small">(optional)</span></label>
      <select id="vendorSel">${opts}</select>
      <input class="input" id="vendorNew" placeholder="New vendor name" style="display:none;margin-top:8px">
      <div id="vendorInfo" class="hint"></div></div>`;
  },
  bind(){
    const sel = document.getElementById('vendorSel');
    if (!sel) return;
    const neu = document.getElementById('vendorNew');
    const info = document.getElementById('vendorInfo');
    const update = () => {
      neu.style.display = sel.value === '__add' ? 'block' : 'none';
      const v = VendorPicker._vendors.find(x => x.id === sel.value);
      info.textContent = v ? [v.phone, v.email].filter(Boolean).join(' · ') : '';
    };
    sel.onchange = update; update();
  },
  async resolve(){  // returns a vendor_id (creating a new vendor if one was typed), or null
    const sel = document.getElementById('vendorSel');
    if (!sel) return null;
    if (sel.value === '__add'){
      const name = (document.getElementById('vendorNew').value || '').trim();
      if (!name) return null;
      const d = await API.post('/api/acc/vendors', { name });
      return d.vendor.id;
    }
    return sel.value || null;
  },
};

// ── Customer picker (mandatory, searchable) — used on the Sales form ───────────
const CustomerPicker = {
  _selected: null,
  html(selected){
    CustomerPicker._selected = selected && selected.id ? selected : null;
    const sel = CustomerPicker._selected;
    return `<div class="field"><label>Customer *</label>
      <div id="custSelected" style="${sel ? '' : 'display:none'}">
        <span class="cust-chip"><i class="fa-solid fa-user"></i><span id="custChipName">${esc(sel ? sel.name : '')}</span>
          <button type="button" id="custClear" aria-label="Clear">&times;</button></span>
      </div>
      <div id="custSearchArea" style="${sel ? 'display:none' : ''}">
        <div class="searchbar"><i class="fa-solid fa-magnifying-glass"></i>
          <input class="input" id="custSearch" placeholder="Search name, email or phone…" autocomplete="off"></div>
        <div id="custResults" class="cust-results"></div>
        <button type="button" class="btn btn-sm btn-block" id="custAddToggle" style="margin-top:6px"><i class="fa-solid fa-user-plus"></i> Add new customer</button>
        <div id="custNew" style="display:none;margin-top:8px">
          <div class="row-2"><input class="input" id="cf_first" placeholder="First name *"><input class="input" id="cf_last" placeholder="Last name *"></div>
          <div class="row-2" style="margin-top:8px"><input class="input" id="cf_email" type="email" placeholder="Email *"><input class="input" id="cf_phone" placeholder="Phone *"></div>
        </div>
      </div></div>`;
  },
  bind(){
    const search = document.getElementById('custSearch');
    if (!search) return;
    const results = document.getElementById('custResults');
    let timer;
    search.oninput = () => {
      clearTimeout(timer);
      const q = search.value.trim();
      timer = setTimeout(async () => {
        if (!q){ results.innerHTML = ''; return; }
        let list = [];
        try { list = (await API.get('/api/acc/customers?q=' + encodeURIComponent(q))).customers; } catch(e){}
        results.innerHTML = list.map(c => `<div class="cust-result" data-id="${c.id}" data-name="${esc(c.name)}">
          <strong>${esc(c.name)}</strong><span class="muted small"> · ${esc(c.email || c.phone || '')}</span></div>`).join('')
          || `<div class="cust-result muted small">No match — use "Add new customer" below.</div>`;
        results.querySelectorAll('[data-id]').forEach(r => r.onclick = () =>
          CustomerPicker.select({ id: r.getAttribute('data-id'), name: r.getAttribute('data-name') }));
      }, 220);
    };
    const clr = document.getElementById('custClear');
    if (clr) clr.onclick = () => { CustomerPicker._selected = null;
      document.getElementById('custSelected').style.display = 'none';
      document.getElementById('custSearchArea').style.display = ''; };
    document.getElementById('custAddToggle').onclick = () => {
      const n = document.getElementById('custNew');
      n.style.display = n.style.display === 'none' ? 'block' : 'none';
      results.innerHTML = '';
    };
  },
  select(c){
    CustomerPicker._selected = c;
    document.getElementById('custChipName').textContent = c.name;
    document.getElementById('custSelected').style.display = '';
    document.getElementById('custSearchArea').style.display = 'none';
  },
  // Returns { id, name } or throws an Error if invalid/missing (sale customer is mandatory).
  async resolve(){
    if (CustomerPicker._selected) return CustomerPicker._selected;
    const newBox = document.getElementById('custNew');
    if (newBox && newBox.style.display !== 'none'){
      const first = document.getElementById('cf_first').value.trim();
      const last = document.getElementById('cf_last').value.trim();
      const email = document.getElementById('cf_email').value.trim();
      const phone = document.getElementById('cf_phone').value.trim();
      if (!(first && last && email && phone))
        throw new Error('New customer needs first name, last name, email and phone');
      const d = await API.post('/api/acc/customers', { first_name: first, last_name: last, email, phone });
      return d.customer;
    }
    throw new Error('Please select or add a customer');
  },
};
