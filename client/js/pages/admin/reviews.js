Router.register('/admin/reviews', async () => {
  if (!Auth.isAdmin()) { Router.navigate('/admin/login'); return; }
  adminLayout('<div class="spinner"></div>', '/admin/reviews');
  const _gen = Router._gen;

  let reviews = [];

  function stars(n) {
    return Array.from({ length: 5 }, (_, i) =>
      `<i class="fas fa-star" style="color:${i < n ? 'var(--gold)' : 'var(--border)'};font-size:.75rem"></i>`
    ).join('');
  }

  function render() {
    document.querySelector('.admin-content').innerHTML = `
      <div class="admin-page-title" style="display:flex;align-items:center;justify-content:space-between">
        <span>Reviews (${reviews.length})</span>
      </div>
      ${reviews.length ? `
        <div class="card"><div class="table-wrap"><table>
          <thead><tr>
            <th>Customer</th>
            <th>Product</th>
            <th>Rating</th>
            <th>Comment</th>
            <th>Date</th>
            <th style="text-align:center">Action</th>
          </tr></thead>
          <tbody>
            ${reviews.map(r => `
              <tr id="rev-row-${r.id}">
                <td>
                  <div style="font-weight:600;font-size:.9rem">${esc(r.user_name)}</div>
                  <div style="font-size:.75rem;color:var(--text-light)">${esc(r.user_email)}</div>
                </td>
                <td style="font-size:.88rem">${esc(r.product_name)}</td>
                <td><div style="white-space:nowrap">${stars(r.rating)}</div></td>
                <td style="max-width:340px;font-size:.88rem;color:var(--text-light)">${r.comment ? esc(r.comment).substring(0, 120) + (r.comment.length > 120 ? '…' : '') : '<em>No comment</em>'}</td>
                <td style="white-space:nowrap;font-size:.82rem;color:var(--text-light)">${fmtDate(r.created_at)}</td>
                <td style="text-align:center">
                  <button class="btn btn-sm btn-ghost" style="color:var(--danger)"
                    data-csp-onclick="deleteReview('${r.id}')">
                    <i class="fas fa-trash"></i>
                  </button>
                </td>
              </tr>`).join('')}
          </tbody>
        </table></div></div>` :
        `<div class="empty-state"><i class="fas fa-star"></i><h3>No reviews yet</h3><p>Customer reviews will appear here once orders are delivered.</p></div>`}`;
  }

  window.deleteReview = async (id) => {
    if (!confirm('Delete this review? This cannot be undone.')) return;
    try {
      await api.del(`/admin/reviews/${id}`);
      reviews = reviews.filter(r => r.id !== id);
      const row = document.getElementById(`rev-row-${id}`);
      if (row) row.remove();
      const title = document.querySelector('.admin-page-title span');
      if (title) title.textContent = `Reviews (${reviews.length})`;
      toast('Review deleted.', 'success');
    } catch (err) { toast(err.message, 'error'); }
  };

  try {
    reviews = await api.get('/admin/reviews');
    if (Router.stale(_gen)) return;
    render();
  } catch (err) {
    if (Router.stale(_gen)) return;
    document.querySelector('.admin-content').innerHTML =
      `<div class="empty-state"><i class="fas fa-exclamation-circle"></i><h3>${esc(err.message)}</h3></div>`;
  }
});
