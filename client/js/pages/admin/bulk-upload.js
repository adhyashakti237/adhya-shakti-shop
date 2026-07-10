Router.register('/admin/bulk-upload', async () => {
  if (!Auth.isStrictAdmin()) { Router.navigate(Auth.isAdmin() ? '/admin/products' : '/admin/login'); return; }
  adminLayout('<div class="spinner"></div>', '/admin/bulk-upload');
  const _gen = Router._gen;

  let categoryTree = { categories: [] };
  let categories = [];
  let preview = null;
  let importMode = 'create_update';

  function catChildren(node) { return (node && (node.children || node.categories)) || []; }
  function flattenCategories(tree) {
    const out = [];
    const walk = (node, path = []) => {
      if (!node || node.is_active === 0) return;
      const names = path.concat(node.name);
      out.push({ ...node, path_names: names, path_label: names.join(' / ') });
      catChildren(node).forEach(child => walk(child, names));
    };
    ((tree && (tree.categories || tree.types)) || []).forEach(root => walk(root));
    return out;
  }
  function formatBytes(bytes) {
    const n = Number(bytes || 0);
    if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
    if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${n} B`;
  }
  function selectedFileName(id) {
    const f = document.getElementById(id)?.files?.[0];
    return f ? `${f.name} (${formatBytes(f.size)})` : 'No file selected';
  }
  function categoryOptions() {
    const preferred = categories.find(c => /jewelry/i.test(c.name));
    const selectedId = preferred?.id || '';
    return ['<option value="">Select category</option>'].concat(
      categories.map(c => `<option value="${c.id}" ${selectedId === c.id ? 'selected' : ''}>${esc(c.path_label || c.name)}</option>`)
    ).join('');
  }
  function statusBadgeText(status) {
    const map = {
      ready: '<span class="badge badge-success">Ready</span>',
      existing: '<span class="badge badge-pending">Exists</span>',
      error: '<span class="badge badge-cancelled">Fix needed</span>',
    };
    return map[status] || esc(status || '-');
  }
  function csvCell(value) {
    const text = String(value ?? '').replace(/\r?\n/g, ' ').trim();
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }
  function downloadCsv(filename, rows) {
    const csv = rows.map(row => row.map(csvCell).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 800);
  }
  function renderPreview() {
    const box = document.getElementById('bulk-preview');
    if (!box) return;
    if (!preview) {
      box.innerHTML = `
        <div class="bulk-upload-empty">
          <i class="fas fa-file-circle-check"></i>
          <h3>Preview appears here</h3>
          <p>Upload the Excel file and an image ZIP. Nothing is imported until you review and click Commit Import.</p>
        </div>`;
      return;
    }
    const s = preview.summary || {};
    const hasImportable = Number(s.ready || 0) > 0 || Number(s.existing || 0) > 0;
    const errorRows = (preview.rows || []).filter(r => (r.errors || []).length);
    box.innerHTML = `
      <div class="bulk-summary-grid">
        <div class="bulk-summary-card"><span>Total rows</span><strong>${Number(s.rows || 0)}</strong></div>
        <div class="bulk-summary-card good"><span>New products</span><strong>${Number(s.ready || 0)}</strong></div>
        <div class="bulk-summary-card warn"><span>Existing</span><strong>${Number(s.existing || 0)}</strong></div>
        <div class="bulk-summary-card ${s.errors ? 'bad' : ''}"><span>Errors</span><strong>${Number(s.errors || 0)}</strong></div>
        <div class="bulk-summary-card"><span>Images found</span><strong>${Number(s.images || 0)}</strong></div>
      </div>
      ${preview.warnings?.length ? `<div class="alert alert-warning">${preview.warnings.map(esc).join('<br>')}</div>` : ''}
      <div class="bulk-commit-row">
        <div class="bulk-mode-box">
          <label class="form-label">Commit mode</label>
          <select class="form-control" id="bulk-mode">
            <option value="create_update" ${importMode === 'create_update' ? 'selected' : ''}>Create new products + refresh existing images</option>
            <option value="update_price_images" ${importMode === 'update_price_images' ? 'selected' : ''}>Update existing price/images only</option>
          </select>
          <label class="bulk-check" style="margin-top:8px">
            <input type="checkbox" id="bulk-update-images" checked ${importMode === 'update_price_images' ? 'disabled' : ''} />
            <span>Update image URLs if a product already exists</span>
          </label>
        </div>
        <button class="btn btn-outline" data-csp-onclick="downloadBulkErrors()" ${errorRows.length ? '' : 'disabled'}>
          <i class="fas fa-file-csv"></i> Download errors CSV
        </button>
        <button class="btn btn-primary" id="bulk-commit-btn" data-csp-onclick="commitBulkProducts()" ${hasImportable ? '' : 'disabled'}>
          <i class="fas fa-database"></i> Commit Import
        </button>
      </div>
      <div class="table-wrap bulk-preview-table">
        <table>
          <thead><tr><th>Row</th><th>Product</th><th>Price</th><th>Stock</th><th>Images</th><th>Status</th><th>Notes</th></tr></thead>
          <tbody>
            ${(preview.rows || []).map(r => `
              <tr class="bulk-row-${esc(r.status)}">
                <td>${r.row}</td>
                <td><strong>${esc(r.name || '-')}</strong>${r.sku ? `<div class="text-sm text-muted">SKU: ${esc(r.sku)}</div>` : ''}</td>
                <td>${r.price ? fmt(r.price) : '-'}</td>
                <td>${Number(r.stock || 0)}</td>
                <td>
                  <div class="bulk-thumb-row">
                    ${(r.thumbs || []).map((src, i) => `<img src="${esc(src)}" alt="Preview ${i + 1}" loading="lazy" decoding="async" width="44" height="44" />`).join('')}
                    <span>${Number(r.images || 0)}</span>
                  </div>
                </td>
                <td>${statusBadgeText(r.status)}</td>
                <td>
                  ${(r.errors || []).length ? `<span style="color:var(--danger)">${r.errors.map(esc).join('<br>')}</span>` : ''}
                  ${(r.warnings || []).length ? `<div style="color:#b7791f">${r.warnings.map(esc).join('<br>')}</div>` : ''}
                  ${!(r.errors || []).length && !(r.warnings || []).length ? 'Ready to import.' : ''}
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
    document.getElementById('bulk-mode')?.addEventListener('change', (event) => {
      importMode = event.target.value || 'create_update';
      renderPreview();
    });
    if (typeof enhanceAdminTables === 'function') enhanceAdminTables(box);
  }
  function renderPage() {
    document.querySelector('.admin-content').innerHTML = `
      <div class="admin-page-title">
        Bulk Product Upload
        <a href="/admin/products" data-link class="btn btn-ghost"><i class="fas fa-arrow-left"></i> Products</a>
      </div>
      <div class="bulk-upload-page">
        <div class="bulk-upload-panel">
          <div class="bulk-upload-head">
            <div>
              <h2>Excel + image ZIP importer</h2>
              <p>Preview first, then import. Images are optimized and saved with secure upload filenames automatically.</p>
            </div>
            <span class="bulk-safe-pill"><i class="fas fa-shield-alt"></i> Admin only</span>
          </div>
          <div class="bulk-upload-grid">
            <div class="bulk-file-card">
              <label class="form-label">Excel file (.xlsx)</label>
              <input class="form-control" type="file" id="bulk-sheet" accept=".xlsx,.xlsm" />
              <div class="text-sm text-muted" id="bulk-sheet-name">${selectedFileName('bulk-sheet')}</div>
            </div>
            <div class="bulk-file-card">
              <label class="form-label">Images ZIP (.zip)</label>
              <input class="form-control" type="file" id="bulk-images" accept=".zip" />
              <div class="text-sm text-muted" id="bulk-images-name">${selectedFileName('bulk-images')}</div>
            </div>
            <div class="bulk-file-card">
              <label class="form-label">Import category</label>
              <select class="form-control" id="bulk-category">${categoryOptions()}</select>
              <div class="text-sm text-muted">Usually choose Jewelry, Clothing, Custom Clothing, or Other.</div>
            </div>
            <div class="bulk-file-card">
              <label class="form-label">Stock setting</label>
              <label class="bulk-check bulk-check-box">
                <input type="checkbox" id="bulk-force-zero" checked />
                <span>Keep stock at 0 after import</span>
              </label>
              <label class="bulk-check bulk-check-box" style="margin-top:8px">
                <input type="checkbox" id="bulk-use-stock" />
                <span>Import stock from Excel only for this approved upload</span>
              </label>
              <div class="text-sm text-muted">Recommended so inventory/purchases can be added from bookkeeping later.</div>
            </div>
          </div>
          <div class="bulk-help">
            <strong>Excel columns supported:</strong>
            <span>name</span><span>price</span><span>compare_price</span><span>sku</span><span>stock</span><span>description</span><span>image_filename_1</span><span>image_filename_2</span><span>image_filename_3</span><span>is_bestseller</span>
          </div>
          <div class="bulk-actions">
            <button class="btn btn-primary" id="bulk-preview-btn" data-csp-onclick="previewBulkProducts()">
              <i class="fas fa-magnifying-glass-chart"></i> Preview Import
            </button>
            <button class="btn btn-ghost" data-csp-onclick="resetBulkUpload()">
              <i class="fas fa-rotate-left"></i> Reset
            </button>
          </div>
          <div class="bulk-live-checklist">
            <strong>Live test after upload</strong>
            <span>Preview one small Excel+ZIP first.</span>
            <span>Confirm thumbnails, duplicates, and errors.</span>
            <span>Commit only after backup name appears.</span>
            <span>Open Products and check imported images.</span>
          </div>
        </div>
        <div class="card">
          <div class="card-header">Preview & Import</div>
          <div class="card-body" id="bulk-preview"></div>
        </div>
      </div>`;
    document.getElementById('bulk-sheet')?.addEventListener('change', () => {
      document.getElementById('bulk-sheet-name').textContent = selectedFileName('bulk-sheet');
    });
    document.getElementById('bulk-images')?.addEventListener('change', () => {
      document.getElementById('bulk-images-name').textContent = selectedFileName('bulk-images');
    });
    document.getElementById('bulk-use-stock')?.addEventListener('change', (event) => {
      if (event.target.checked) {
        const ok = confirm('Import stock from Excel only if this upload is approved for stock changes. Continue?');
        if (!ok) {
          event.target.checked = false;
          document.getElementById('bulk-force-zero').checked = true;
          return;
        }
        document.getElementById('bulk-force-zero').checked = false;
      } else {
        document.getElementById('bulk-force-zero').checked = true;
      }
    });
    document.getElementById('bulk-force-zero')?.addEventListener('change', (event) => {
      if (!event.target.checked) {
        const ok = confirm('Import stock from Excel only if this upload is approved for stock changes. Continue?');
        if (!ok) {
          event.target.checked = true;
          document.getElementById('bulk-use-stock').checked = false;
          return;
        }
      }
      document.getElementById('bulk-use-stock').checked = !event.target.checked;
    });
    renderPreview();
  }

  window.previewBulkProducts = async () => {
    const sheet = document.getElementById('bulk-sheet')?.files?.[0];
    const images = document.getElementById('bulk-images')?.files?.[0];
    const categoryId = document.getElementById('bulk-category')?.value;
    if (!sheet) { toast('Please select the Excel file', 'warning'); return; }
    if (!images) { toast('Please select the images ZIP file', 'warning'); return; }
    if (!categoryId) { toast('Please select a category', 'warning'); return; }
    const btn = document.getElementById('bulk-preview-btn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Reading files...';
    preview = null;
    renderPreview();
    try {
      const fd = new FormData();
      fd.append('sheet', sheet);
      fd.append('images_zip', images);
      fd.append('category_id', categoryId);
      const useStock = document.getElementById('bulk-use-stock')?.checked;
      fd.append('force_stock_zero', useStock ? 'false' : 'true');
      preview = await api.form('/admin/bulk-products/preview', fd);
      toast('Preview ready', preview.summary?.errors ? 'warning' : 'success');
      renderPreview();
    } catch (e) {
      toast(e.message, 'error', 5000);
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-magnifying-glass-chart"></i> Preview Import';
    }
  };

  window.commitBulkProducts = async () => {
    if (!preview?.job_id) { toast('Run preview first', 'warning'); return; }
    if (!confirm('Commit this import now? A database backup will be created first.')) return;
    const btn = document.getElementById('bulk-commit-btn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Importing...';
    try {
      const res = await api.post('/admin/bulk-products/commit', {
        job_id: preview.job_id,
        mode: document.getElementById('bulk-mode')?.value || importMode || 'create_update',
        update_existing_images: document.getElementById('bulk-update-images')?.checked ? true : false,
      });
      toast(`Imported ${res.imported}, updated ${res.updated_price_images || res.updated_images}`, 'success', 5000);
      document.getElementById('bulk-preview').insertAdjacentHTML('afterbegin', `
        <div class="alert alert-success">
          <strong>Import complete.</strong>
          New products: ${Number(res.imported || 0)} · Price/image updates: ${Number(res.updated_price_images || 0)} · Image refreshes: ${Number(res.updated_images || 0)} · Skipped: ${Number(res.skipped_existing || 0)}<br>
          Backup: ${esc(res.backup || '-')}
        </div>`);
    } catch (e) {
      toast(e.message, 'error', 7000);
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-database"></i> Commit Import';
    }
  };

  window.resetBulkUpload = () => {
    preview = null;
    importMode = 'create_update';
    renderPage();
  };

  window.downloadBulkErrors = () => {
    if (!preview) return;
    const rows = [['row', 'name', 'sku', 'status', 'errors', 'warnings']];
    (preview.rows || []).forEach(r => {
      if ((r.errors || []).length || (r.warnings || []).length) {
        rows.push([
          r.row,
          r.name || '',
          r.sku || '',
          r.status || '',
          (r.errors || []).join('; '),
          (r.warnings || []).join('; '),
        ]);
      }
    });
    if (rows.length === 1) { toast('No errors or warnings to download', 'info'); return; }
    downloadCsv(`bulk_import_review_${new Date().toISOString().slice(0, 10)}.csv`, rows);
  };

  try {
    categoryTree = await api.get('/category-tree');
    if (Router.stale(_gen)) return;
    categories = flattenCategories(categoryTree);
    renderPage();
  } catch (e) {
    if (Router.stale(_gen)) return;
    document.querySelector('.admin-content').innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-circle"></i><h3>${esc(e.message)}</h3><p>Could not load categories.</p></div>`;
  }
});
