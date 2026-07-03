// Reusable bill/receipt attachments — picker (collect files), uploader, and viewer.
const Attach = {
  // ── Picker: renders an "Add bill" area that collects File objects on the holder ──
  pickerHtml(holderId){
    return `<div class="field"><label>Bills / receipts <span class="muted small">(JPG, PNG, WEBP, or PDF — optional, 10 MB max)</span></label>
      <div id="${holderId}">
        <label class="attach-add"><i class="fa-solid fa-paperclip"></i> Add bill photo or PDF
          <input type="file" accept=".jpg,.jpeg,.png,.webp,application/pdf" multiple hidden></label>
        <div class="attach-files"></div>
      </div></div>`;
  },
  initPicker(holderId){
    const root = document.getElementById(holderId);
    if (!root) return;
    root._files = [];
    const input = root.querySelector('input[type=file]');
    const list = root.querySelector('.attach-files');
    input.onchange = () => {
      for (const f of input.files){
        if (f.size > 10 * 1024 * 1024){ toast(f.name + ' is too big (max 10 MB)', true); continue; }
        root._files.push(f);
      }
      input.value = '';
      Attach._renderChips(root, list);
    };
  },
  _renderChips(root, list){
    list.innerHTML = root._files.map((f, i) =>
      `<div class="attach-chip"><i class="fa-solid fa-${f.type.includes('pdf') ? 'file-pdf' : 'image'}"></i>
        <span>${esc(f.name)}</span><button type="button" data-rm="${i}">&times;</button></div>`).join('');
    list.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => {
      root._files.splice(Number(b.getAttribute('data-rm')), 1);
      Attach._renderChips(root, list);
    });
  },
  files(holderId){ const r = document.getElementById(holderId); return (r && r._files) || []; },

  // ── Upload collected files against a saved record ──
  async upload(parentType, parentId, files){
    for (const f of files){
      const fd = new FormData();
      fd.append('parent_type', parentType);
      fd.append('parent_id', parentId);
      fd.append('file', f);
      await API.postForm('/api/attachments', fd);
    }
  },

  // ── Viewer: thumbnails for already-saved attachments (with optional delete) ──
  fileUrl(id){ return '/api/acc/attachments/' + encodeURIComponent(id) + '/file'; },
  viewerHtml(attachments, opts){
    opts = opts || {};
    if (!attachments || !attachments.length){
      return opts.hideEmpty ? '' : `<p class="muted small">No bill attached.</p>`;
    }
    return `<div class="attach-thumbs">` + attachments.map(a => {
      const url = Attach.fileUrl(a.id);
      const isPdf = (a.mime || '').includes('pdf') || /\.pdf$/i.test(a.original_name || '');
      const rm = opts.onDelete ? `<button class="rm" data-del="${a.id}" title="Remove">&times;</button>` : '';
      const icon = isPdf ? 'file-pdf' : 'file-image';
      const label = isPdf ? 'PDF' : 'Image';
      const inner = `<span class="attach-thumb pdf"><i class="fa-solid fa-${icon}"></i>${label}</span>`;
      return `<div style="position:relative"><a class="attach-thumb pdf" href="${url}" download rel="noopener" title="Download ${esc(a.original_name || 'bill')}">${inner}</a>${rm}</div>`;
    }).join('') + `</div>`;
  },
  bindDelete(container, onDone){
    container.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
      try { await API.del('/api/attachments/' + b.getAttribute('data-del')); toast('Bill removed'); onDone && onDone(); }
      catch(e){ toast(e.message, true); }
    });
  },
};
