// Admin panel builds its own full-page layout (see adminLayout in dashboard.js) —
// it doesn't use the customer site's navbar/footer, so these are no-ops here.
function renderNavbar() {}
function renderFooter() {}

function openModal(html) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `<div class="modal">${html}</div>`;
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
  return overlay;
}

function closeModal() { document.querySelector('.modal-overlay')?.remove(); }

function enhanceAdminTables(root = document) {
  root.querySelectorAll('.admin-content .table-wrap table:not([data-admin-cardified])').forEach(table => {
    const labels = Array.from(table.querySelectorAll('thead th')).map(th =>
      (th.textContent || '').replace(/\s+/g, ' ').trim()
    );
    if (!labels.length) return;
    table.dataset.adminCardified = '1';
    table.classList.add('admin-card-table');
    table.querySelectorAll('tbody tr').forEach(row => {
      Array.from(row.children).forEach((cell, i) => {
        if (cell.tagName !== 'TD') return;
        if (cell.colSpan > 1) {
          cell.classList.add('admin-card-full-cell');
          return;
        }
        cell.dataset.label = labels[i] || '';
        if (cell.querySelector(':scope > .admin-td-value')) return;
        const value = document.createElement('span');
        value.className = 'admin-td-value';
        while (cell.firstChild) value.appendChild(cell.firstChild);
        cell.appendChild(value);
      });
    });
  });
}

const adminTableObserver = new MutationObserver(mutations => {
  if (mutations.some(m => m.addedNodes.length)) enhanceAdminTables(document);
});

document.addEventListener('DOMContentLoaded', () => {
  enhanceAdminTables(document);
  const app = document.getElementById('app');
  if (app) adminTableObserver.observe(app, { childList: true, subtree: true });
});
