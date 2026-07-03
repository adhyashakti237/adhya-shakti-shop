const Cart = {
  _text(value, max = 160) {
    return String(value ?? '').replace(/[<>"'`]/g, '').trim().slice(0, max);
  },
  _media(value) {
    if (typeof safeMediaUrl === 'function') return safeMediaUrl(value);
    const url = String(value || '').trim();
    return url.startsWith('/uploads/') || url.startsWith('/images/') ? url : '';
  },
  _cleanPrint(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const placement = ['front', 'back', 'both'].includes(raw.placement) ? raw.placement : '';
    if (!placement) return null;
    const cleanList = (list) => Array.isArray(list)
      ? list.map(u => this._media(u)).filter(Boolean).slice(0, 3)
      : [];
    const front = cleanList(raw.front_images);
    const back = cleanList(raw.back_images);
    return {
      placement,
      front_images: front,
      back_images: back,
      extra_charge: placement === 'both' ? 8.99 : 0,
    };
  },
  _cleanItem(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const id = this._text(raw.id, 80);
    if (!id) return null;
    const variation = this._text(raw.variation, 80);
    const customPrint = this._cleanPrint(raw.customPrint);
    const qty = Math.max(1, Math.min(99, parseInt(raw.qty, 10) || 1));
    const basePrice = Number(raw.price);
    const price = Number.isFinite(basePrice) && basePrice > 0 ? Math.min(basePrice, 10000) : 0;
    const key = this._text(raw.key || `${id}-${variation || 'default'}`, 180) || id;
    return {
      key,
      id,
      name: this._text(raw.name, 180) || 'Product',
      price,
      image: this._media(raw.image),
      qty,
      variation,
      customPrint,
    };
  },
  get() {
    try {
      const raw = JSON.parse(localStorage.getItem('cart')) || [];
      if (!Array.isArray(raw)) return [];
      return raw.map(item => this._cleanItem(item)).filter(Boolean).slice(0, 50);
    } catch { return []; }
  },
  save(items) { localStorage.setItem('cart', JSON.stringify(items)); this.updateBadge(); },
  add(product, qty = 1, variation = null, customPrint = null) {
    const items = this.get();
    // Custom print items are always unique (different uploaded images)
    const key = customPrint
      ? `${product.id}-${variation || ''}-${Date.now()}`
      : (variation ? `${product.id}-${variation}` : product.id);
    const productPrice = Number(product.price) || 0;
    const price = customPrint ? (productPrice + (Number(customPrint.extra_charge) || 0)) : productPrice;
    const idx = customPrint ? -1 : items.findIndex(i => i.key === key);
    if (idx >= 0) items[idx].qty = Math.min(99, items[idx].qty + qty);
    else {
      const cleaned = this._cleanItem({ key, id: product.id, name: product.name, price,
        image: (product.images || [])[0] || '', qty, variation, customPrint });
      if (cleaned) items.push(cleaned);
    }
    this.save(items);
    toast('Added to cart!', 'success');
  },
  remove(key) { this.save(this.get().filter(i => i.key !== key)); },
  updateQty(key, qty) {
    const items = this.get();
    const idx = items.findIndex(i => i.key === key);
    if (idx >= 0) { if (qty <= 0) items.splice(idx, 1); else items[idx].qty = qty; }
    this.save(items);
  },
  clear() { localStorage.removeItem('cart'); this.updateBadge(); },
  total() { return this.get().reduce((s, i) => s + i.price * i.qty, 0); },
  count() { return this.get().reduce((s, i) => s + i.qty, 0); },
  updateBadge() {
    const el = document.querySelector('.cart-count');
    if (el) { const c = this.count(); el.textContent = c; el.style.display = c ? 'flex' : 'none'; }
  }
};

window.Cart = Cart;
