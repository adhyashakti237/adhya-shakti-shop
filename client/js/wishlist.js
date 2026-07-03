const Wishlist = {
  _key: 'wishlist',
  _syncing: false,
  _syncedUserId: '',

  _text(value, max = 180) {
    return String(value ?? '').replace(/[<>"'`]/g, '').trim().slice(0, max);
  },
  _media(value) {
    if (typeof safeMediaUrl === 'function') return safeMediaUrl(value);
    const url = String(value || '').trim();
    return url.startsWith('/uploads/') || url.startsWith('/images/') ? url : '';
  },
  _cleanItem(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const id = this._text(raw.id || raw.product_id, 80);
    if (!id) return null;
    const price = Number(raw.price);
    const compare = Number(raw.compare_price);
    return {
      id,
      name: this._text(raw.name, 180) || 'Product',
      price: Number.isFinite(price) && price > 0 ? Math.min(price, 10000) : 0,
      compare_price: Number.isFinite(compare) && compare > 0 ? Math.min(compare, 10000) : 0,
      image: this._media(raw.image || (raw.images || [])[0] || ''),
    };
  },
  payloadAttr(raw) {
    const cleaned = this._cleanItem(raw) || {};
    return encodeURIComponent(JSON.stringify(cleaned));
  },
  payloadFromButton(btn) {
    try {
      if (btn?.dataset?.wpEnc) return this._cleanItem(JSON.parse(decodeURIComponent(btn.dataset.wpEnc)));
      if (btn?.dataset?.wp) return this._cleanItem(JSON.parse(btn.dataset.wp));
    } catch {}
    return null;
  },
  get() {
    try {
      const raw = JSON.parse(localStorage.getItem(this._key) || '[]');
      if (!Array.isArray(raw)) return [];
      return raw.map(item => this._cleanItem(item)).filter(Boolean).slice(0, 100);
    } catch { return []; }
  },
  save(items) {
    const cleaned = [];
    const seen = new Set();
    (Array.isArray(items) ? items : []).forEach(item => {
      const c = this._cleanItem(item);
      if (c && !seen.has(c.id)) {
        seen.add(c.id);
        cleaned.push(c);
      }
    });
    localStorage.setItem(this._key, JSON.stringify(cleaned.slice(0, 100)));
    this.updateUI();
  },
  has(id) { return this.get().some(i => String(i.id) === String(id)); },

  add(p, { silent = false, syncServer = true } = {}) {
    const cleaned = this._cleanItem(p);
    if (!cleaned) return false;
    if (!this.has(cleaned.id)) {
      const items = this.get();
      items.unshift(cleaned);
      this.save(items);
      if (!silent) toast('Added to wishlist', 'success');
    }
    if (syncServer) this.pushAdd(cleaned.id);
    return true;
  },
  remove(id, { silent = false, syncServer = true } = {}) {
    const productId = this._text(id, 80);
    this.save(this.get().filter(i => String(i.id) !== String(productId)));
    if (syncServer) this.pushRemove(productId);
    if (!silent) toast('Removed from wishlist', 'info');
    return false;
  },
  toggle(p) {
    const cleaned = this._cleanItem(p);
    if (!cleaned) return false;
    return this.has(cleaned.id) ? this.remove(cleaned.id) : this.add(cleaned);
  },
  async toggleSynced(p) {
    const cleaned = this._cleanItem(p);
    if (!cleaned) return { ok: false, saved: this.has(cleaned?.id), error: 'Could not save this product. Please refresh and try again.' };
    const wasSaved = this.has(cleaned.id);
    const before = this.get();

    if (wasSaved) {
      this.remove(cleaned.id, { silent: true, syncServer: false });
      if (Auth?.isLoggedIn?.() && !Auth.isAdmin?.()) {
        const ok = await this.pushRemove(cleaned.id);
        if (!ok) {
          this.save(before);
          return { ok: false, saved: true, error: 'Could not update your wishlist. Please try again.' };
        }
      }
      toast('Removed from wishlist', 'info');
      return { ok: true, saved: false };
    }

    this.add(cleaned, { silent: true, syncServer: false });
    if (Auth?.isLoggedIn?.() && !Auth.isAdmin?.()) {
      const ok = await this.pushAdd(cleaned.id);
      if (!ok) {
        this.save(before);
        return { ok: false, saved: false, error: 'Could not save to your account wishlist. Please try again.' };
      }
    }
    toast('Added to wishlist', 'success');
    return { ok: true, saved: true };
  },

  async pushAdd(productId) {
    if (!Auth?.isLoggedIn?.() || Auth.isAdmin?.()) return true;
    try { await api.post('/wishlist', { product_id: productId }); return true; }
    catch (err) { console.warn('Wishlist sync add failed:', err.message); return false; }
  },
  async pushRemove(productId) {
    if (!Auth?.isLoggedIn?.() || Auth.isAdmin?.()) return true;
    try { await api.del('/wishlist/' + encodeURIComponent(productId)); return true; }
    catch (err) { console.warn('Wishlist sync remove failed:', err.message); return false; }
  },
  async syncFromServer({ mergeLocal = true } = {}) {
    const user = Auth?.getUser?.();
    if (!user || Auth.isAdmin?.() || this._syncing) return this.get();
    this._syncing = true;
    try {
      const localItems = this.get();
      if (mergeLocal && localItems.length) {
        await Promise.allSettled(localItems.map(item => api.post('/wishlist', { product_id: item.id })));
      }
      const data = await api.get('/wishlist');
      this.save(data.items || []);
      this._syncedUserId = user.id || '';
      return this.get();
    } catch (err) {
      console.warn('Wishlist sync failed:', err.message);
      return this.get();
    } finally {
      this._syncing = false;
    }
  },
  init() {
    if (Auth?.isLoggedIn?.() && !Auth.isAdmin?.()) {
      this.syncFromServer({ mergeLocal: true });
    }
    this.updateUI();
  },

  // Called from product card heart button
  async toggleCard(btn) {
    const p = this.payloadFromButton(btn);
    if (!p) {
      toast('Could not save this product. Please refresh and try again.', 'error');
      return;
    }
    btn.disabled = true;
    const result = await this.toggleSynced(p);
    const saved = result.saved;
    btn.classList.toggle('wishlisted', saved);
    btn.setAttribute('aria-label', saved ? 'Remove from wishlist' : 'Add to wishlist');
    btn.disabled = false;
    if (!result.ok) toast(result.error, 'error');
  },

  // Called from product detail page heart button
  async toggleDetail() {
    const btn = document.getElementById('wishlist-btn');
    if (!btn) return;
    const p = this.payloadFromButton(btn);
    if (!p) {
      toast('Could not save this product. Please refresh and try again.', 'error');
      return;
    }
    btn.disabled = true;
    const result = await this.toggleSynced(p);
    const saved = result.saved;
    btn.classList.toggle('wishlisted', saved);
    btn.setAttribute('aria-label', saved ? 'Remove from wishlist' : 'Save to wishlist');
    const lbl = document.getElementById('wish-label');
    if (lbl) lbl.textContent = saved ? 'Saved' : 'Save';
    btn.disabled = false;
    if (!result.ok) toast(result.error, 'error');
  },

  count() { return this.get().length; },
  clear() {
    const ids = this.get().map(i => i.id);
    localStorage.removeItem(this._key);
    this.updateUI();
    if (Auth?.isLoggedIn?.() && !Auth.isAdmin?.()) {
      ids.forEach(id => this.pushRemove(id));
    }
  },

  updateUI() {
    const n = this.count();
    document.querySelectorAll('.wishlist-count').forEach(el => {
      el.textContent = n;
      el.style.display = n ? 'flex' : 'none';
    });
    document.querySelectorAll('[data-wid]').forEach(btn => {
      btn.classList.toggle('wishlisted', this.has(btn.dataset.wid));
    });
  },
};

window.Wishlist = Wishlist;
