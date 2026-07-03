Router.register('/admin/users', async () => {
  if (!Auth.isStrictAdmin()) { Router.navigate(Auth.isAdmin() ? '/admin/orders' : '/admin/login'); return; }
  adminLayout('<div class="spinner"></div>', '/admin/users');
  const _gen = Router._gen;

  const strictAdmin = Auth.isStrictAdmin();
  let users = [];
  let view = 'customers';   // 'customers' | 'staff'
  let userSearch = '';
  const baseFiltered = () => view === 'staff'
    ? users.filter(u => u.role === 'admin' || u.role === 'staff')
    : users.filter(u => u.role === 'customer');
  const filtered = () => {
    const q = userSearch.trim().toLowerCase();
    const list = baseFiltered();
    if (!q) return list;
    return list.filter(u => [u.name, u.email, u.phone, u.role].some(v => String(v || '').toLowerCase().includes(q)));
  };
  window.setUserView = (v) => { view = v; renderUsers(); };
  window.searchAdminUsers = () => {
    const input = document.getElementById('admin-user-search');
    const caret = input?.selectionStart ?? String(input?.value || '').length;
    userSearch = input?.value || '';
    renderUsers();
    const next = document.getElementById('admin-user-search');
    if (next) {
      next.focus();
      next.setSelectionRange(Math.min(caret, next.value.length), Math.min(caret, next.value.length));
    }
  };

  async function loadUsers() {
    users = await api.get('/admin/users');
    if (Router.stale(_gen)) return;
    renderUsers();
  }

  function roleColor(role) {
    if (role === 'admin')  return 'var(--primary)';
    if (role === 'staff')  return 'var(--secondary)';
    return 'var(--success)';
  }

  function renderUsers() {
    document.querySelector('.admin-content').innerHTML = `
      <div class="admin-page-title" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px">
        <span>${view === 'staff' ? 'Staff' : 'Customers'} (${filtered().length})</span>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <div style="display:flex;gap:6px">
            <button class="btn btn-sm ${view==='customers'?'btn-primary':'btn-outline'}" data-csp-onclick="setUserView('customers')">Customers</button>
            <button class="btn btn-sm ${view==='staff'?'btn-primary':'btn-outline'}" data-csp-onclick="setUserView('staff')">Staff</button>
          </div>
          ${strictAdmin ? `<button class="btn btn-primary btn-sm" data-csp-onclick="openCreateUser()"><i class="fas fa-plus"></i> Add ${view==='staff'?'staff':'customer'}</button>` : ''}
        </div>
      </div>
      <div class="admin-user-toolbar">
        <label class="admin-search-wrap">
          <i class="fas fa-search"></i>
          <input class="form-control" id="admin-user-search" value="${esc(userSearch)}"
            placeholder="Search ${view === 'staff' ? 'staff by name, email, phone, role' : 'customers by name, email, phone'}"
            data-csp-oninput="searchAdminUsers()" />
        </label>
        <span class="text-muted text-sm">${filtered().length} shown from ${baseFiltered().length} ${view === 'staff' ? 'staff/admin' : 'customers'}</span>
      </div>
      <div class="card">
        <div class="admin-mobile-scroll-hint"><i class="fas fa-arrows-left-right"></i> Swipe sideways to view all columns</div>
        <div class="table-wrap admin-wide-scroll admin-users-wrap"><table class="admin-wide-table admin-users-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Phone</th>
            <th>Role</th>
            <th>Joined</th>
            ${strictAdmin ? '<th style="text-align:center">Actions</th>' : ''}
          </tr>
        </thead>
        <tbody>
          ${filtered().map(u => `
            <tr>
              <td>
                <div style="display:flex;align-items:center;gap:10px">
                  <div style="width:36px;height:36px;border-radius:50%;background:${roleColor(u.role)};color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;flex-shrink:0;font-size:.95rem">${esc((u.name || '?')[0].toUpperCase())}</div>
                  <strong>${esc(u.name)}</strong>
                </div>
              </td>
              <td>${esc(u.email)}</td>
              <td>${esc(u.phone || '-')}</td>
              <td>
                <span class="badge" style="background:${roleColor(u.role)}20;color:${roleColor(u.role)};border:1px solid ${roleColor(u.role)}40;text-transform:capitalize">
                  ${u.role === 'admin' ? '<i class="fas fa-shield-alt" style="font-size:.7rem;margin-right:3px"></i>' : u.role === 'staff' ? '<i class="fas fa-briefcase" style="font-size:.7rem;margin-right:3px"></i>' : '<i class="fas fa-user" style="font-size:.7rem;margin-right:3px"></i>'}
                  ${u.role}
                </span>
              </td>
              <td>${fmtDate(u.created_at)}</td>
              ${strictAdmin ? `
              <td>
                <div style="display:flex;gap:6px;justify-content:center">
                  <button class="btn btn-sm btn-outline" data-csp-onclick="openEditUser('${u.id}')" title="Edit user" aria-label="Edit ${esc(u.name)}"><i class="fas fa-edit"></i></button>
                  ${u.id !== Auth.getUser()?.id ? `<button class="btn btn-sm btn-ghost" data-csp-onclick="deleteUser('${u.id}')" title="Delete user" aria-label="Delete ${esc(u.name)}"><i class="fas fa-trash" style="color:var(--danger)"></i></button>` : ''}
                </div>
              </td>` : ''}
            </tr>`).join('') || `<tr><td colspan="${strictAdmin ? 6 : 5}" class="text-muted">No ${view === 'staff' ? 'staff' : 'customers'} match this search.</td></tr>`}
        </tbody>
      </table></div></div>`;
  }

  function userFormHTML(u = null) {
    const isEdit = !!u;
    return `
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Full Name *</label>
          <input class="form-control" id="uf-name" value="${esc(u?.name || '')}" placeholder="Jane Smith" />
        </div>
        <div class="form-group">
          <label class="form-label">Phone</label>
          <input class="form-control" id="uf-phone" type="tel" value="${esc(u?.phone || '')}" placeholder="(555) 555-5555" />
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Email Address *</label>
        <input class="form-control" id="uf-email" type="email" value="${esc(u?.email || '')}" placeholder="user@example.com" />
      </div>
      <div class="form-group">
        <label class="form-label">Role *</label>
        <select class="form-control" id="uf-role">
          <option value="customer" ${u?.role === 'customer' ? 'selected' : ''}>Customer</option>
          <option value="staff"    ${u?.role === 'staff'    ? 'selected' : ''}>Staff</option>
          <option value="admin"    ${u?.role === 'admin'    ? 'selected' : ''}>Admin</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">${isEdit ? 'New Password (leave blank to keep current)' : 'Password *'}</label>
        <div style="position:relative">
          <input class="form-control" id="uf-password" type="password" placeholder="${isEdit ? 'Enter new password to change it' : 'At least 8 chars, uppercase, number, symbol'}" style="padding-right:44px" />
          <button type="button" class="field-icon-btn" data-csp-onclick="const i=document.getElementById('uf-password');i.type=i.type==='password'?'text':'password'"
            style="position:absolute;right:6px;top:50%;transform:translateY(-50%)">
            <i class="fas fa-eye"></i>
          </button>
        </div>
      </div>`;
  }

  window.openCreateUser = () => {
    openModal(`
      <div class="modal-header">
        <h3><i class="fas fa-user-plus" style="color:var(--primary);margin-right:8px"></i>Add New User</h3>
        <button class="modal-close" data-csp-onclick="closeModal()" aria-label="Close">×</button>
      </div>
      <div class="modal-body">
        ${userFormHTML()}
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" data-csp-onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" data-csp-onclick="saveNewUser()"><i class="fas fa-save"></i> Create User</button>
      </div>`);
    const rs = document.getElementById('uf-role');
    if (rs) rs.value = (view === 'staff') ? 'staff' : 'customer';
  };

  window.openEditUser = (id) => {
    const u = users.find(x => x.id === id);
    if (!u) return;
    openModal(`
      <div class="modal-header">
        <h3><i class="fas fa-user-edit" style="color:var(--primary);margin-right:8px"></i>Edit User</h3>
        <button class="modal-close" data-csp-onclick="closeModal()" aria-label="Close">×</button>
      </div>
      <div class="modal-body">
        ${userFormHTML(u)}
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" data-csp-onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" data-csp-onclick="saveEditUser('${u.id}')"><i class="fas fa-save"></i> Save Changes</button>
      </div>`);
  };

  window.saveNewUser = async () => {
    const name     = document.getElementById('uf-name').value.trim();
    const email    = document.getElementById('uf-email').value.trim();
    const phone    = document.getElementById('uf-phone').value.trim();
    const role     = document.getElementById('uf-role').value;
    const password = document.getElementById('uf-password').value;
    if (!name)     { toast('Full name is required', 'warning'); return; }
    if (!email)    { toast('Email is required', 'warning'); return; }
    if (!password) { toast('Password is required', 'warning'); return; }
    if (password.length < 8) { toast('Password must be at least 8 characters', 'warning'); return; }
    try {
      await api.post('/admin/users', { name, email, phone, role, password });
      toast('User created successfully!', 'success');
      closeModal();
      await loadUsers();
    } catch (e) { toast(e.message, 'error'); }
  };

  window.saveEditUser = async (id) => {
    const name     = document.getElementById('uf-name').value.trim();
    const email    = document.getElementById('uf-email').value.trim();
    const phone    = document.getElementById('uf-phone').value.trim();
    const role     = document.getElementById('uf-role').value;
    const password = document.getElementById('uf-password').value;
    if (!name)  { toast('Full name is required', 'warning'); return; }
    if (!email) { toast('Email is required', 'warning'); return; }
    if (password && password.length < 8) { toast('Password must be at least 8 characters', 'warning'); return; }
    try {
      await api.put(`/admin/users/${id}`, { name, email, phone, role, password: password || undefined });
      toast('User updated successfully!', 'success');
      closeModal();
      await loadUsers();
    } catch (e) { toast(e.message, 'error'); }
  };

  window.deleteUser = async (id) => {
    const user = users.find(u => u.id === id);
    const name = user?.name || 'this user';
    if (!confirm(`Delete user "${name}"? This cannot be undone.`)) return;
    try {
      await api.del(`/admin/users/${id}`);
      toast('User deleted', 'success');
      await loadUsers();
    } catch (e) { toast(e.message, 'error'); }
  };

  try { await loadUsers(); } catch (e) {
    if (Router.stale(_gen)) return;
    document.querySelector('.admin-content').innerHTML =
      `<div class="empty-state"><i class="fas fa-exclamation-circle"></i><h3>${esc(e.message)}</h3></div>`;
  }
});
