Router.register('/cart', async () => {
  const _gen = Router._gen;
  const app = document.getElementById('app');
  let cartCoupon = { code: (sessionStorage.getItem('cart_coupon_code') || '').trim().toUpperCase(), discount: 0 };
  let welcomeStatus = null;
  if (Auth.isLoggedIn() && !Auth.isAdmin()) {
    try { welcomeStatus = await api.get('/welcome-discount/status'); } catch {}
    if (Router.stale(_gen)) return;
  }
  const saveCouponCode = (code) => {
    if (code) sessionStorage.setItem('cart_coupon_code', code);
    else sessionStorage.removeItem('cart_coupon_code');
  };
  const welcomeCartOffer = () => {
    if (!welcomeStatus?.available || cartCoupon.discount > 0) return '';
    return `
      <div style="background:linear-gradient(90deg,rgba(29,92,74,.07),rgba(196,154,34,.08));border:1px solid rgba(29,92,74,.22);border-radius:10px;padding:13px 14px;margin-bottom:14px">
        <div style="font-weight:800;color:var(--primary);font-size:.9rem;margin-bottom:4px"><i class="fas fa-tag"></i> First-order code available</div>
        <div style="font-size:.82rem;color:var(--text-light);line-height:1.45;margin-bottom:10px">Use <strong style="color:var(--text)">${esc(welcomeStatus.code || 'WELCOME10')}</strong> for 10% off this first order.</div>
        <button class="btn btn-primary btn-sm" id="apply-welcome-cart" type="button"><i class="fas fa-check"></i> Apply code</button>
      </div>`;
  };
  function cartOptionMeta(i) {
    const chips = [];
    if (i.variation) {
      const pieces = String(i.variation).split('/').map(s => s.trim()).filter(Boolean);
      if (pieces[0]) chips.push(`<span><i class="fas fa-palette"></i> Color: ${esc(pieces[0])}</span>`);
      if (pieces[1]) chips.push(`<span><i class="fas fa-ruler"></i> Size: ${esc(pieces[1])}</span>`);
      if (pieces.length < 2) chips.push(`<span><i class="fas fa-tag"></i> ${esc(i.variation)}</span>`);
    }
    if (i.customPrint) {
      const label = i.customPrint.placement === 'both' ? 'Front & Back custom print' : i.customPrint.placement === 'front' ? 'Front custom print' : 'Back custom print';
      chips.push(`<span><i class="fas fa-print"></i> ${esc(label)}</span>`);
    }
    return chips.length ? `<div class="cart-option-pills">${chips.join('')}</div>` : '';
  }

  function renderCart() {
    const items = Cart.get();

    if (!items.length) {
      app.innerHTML = `<div class="container section">
        <div class="cart-empty-pro">
          <div class="cart-empty-icon"><i class="fas fa-shopping-cart"></i></div>
          <h1>Your cart is empty</h1>
          <p>Choose a product, select the available color and size if needed, then add it here for secure checkout.</p>
          <div class="cart-empty-actions">
            <a href="/products" data-link class="btn btn-primary"><i class="fas fa-store"></i> Browse Products</a>
            <a href="/jewelry" data-link class="btn btn-outline"><i class="fas fa-gem"></i> Jewelry</a>
            <a href="/wishlist" data-link class="btn btn-outline"><i class="fas fa-heart"></i> Wishlist</a>
          </div>
          <div class="cart-empty-trust">
            <span><i class="fas fa-lock"></i> Secure checkout</span>
            <span><i class="fas fa-truck"></i> Free shipping over $49</span>
            <span><i class="fas fa-envelope"></i> Support before and after purchase</span>
          </div>
        </div>
      </div>`;
      return;
    }

    const subtotal = Cart.total();
    const shipping = subtotal >= 49 ? 0 : 7.99;
    const discount = cartCoupon.discount;
    const total = Math.max(0, subtotal + shipping - discount);

    app.innerHTML = `
      <div class="page">
        <div class="container" style="padding-top:24px">
          <div class="breadcrumb"><a href="/" data-link>Home</a><span class="sep">/</span><span>Cart</span></div>
          <h1 style="font-size:1.75rem;font-weight:800;margin:16px 0 24px">Shopping Cart (${items.length} items)</h1>
          <div class="cart-layout">
            <div class="card">
              <div id="cart-items">
                ${items.map(i => `
                  <div class="cart-item">
                    <img class="cart-item-img" src="${safeMediaUrl(i.image, 'https://placehold.co/80x80/f5f5f5/999?text=?')}" alt="${esc(i.name)}" loading="lazy" decoding="async" width="80" height="80" data-csp-onerror="this.src='https://placehold.co/80x80/f5f5f5/999?text=?'" />
                    <div class="cart-item-info">
                      <div class="cart-item-name">${esc(i.name)}</div>
                      ${cartOptionMeta(i)}
                      ${i.customPrint ? `
                        <div style="margin-top:6px;padding:8px 10px;background:rgba(29,92,74,.06);border-radius:6px;border-left:3px solid var(--primary)">
                          <div style="font-size:.78rem;font-weight:700;color:var(--primary);margin-bottom:4px">
                            <i class="fas fa-print" style="margin-right:4px"></i>Custom Print — ${i.customPrint.placement === 'both' ? 'Front & Back (+$8.99)' : i.customPrint.placement === 'front' ? 'Front Only' : 'Back Only'}
                          </div>
                          <div style="display:flex;gap:4px;flex-wrap:wrap">
                            ${[...(i.customPrint.front_images||[]), ...(i.customPrint.back_images||[])].map(url =>
                              safeMediaUrl(url) ? `<img src="${safeMediaUrl(url)}" alt="Custom print design upload" loading="lazy" decoding="async" width="40" height="40" style="width:40px;height:40px;object-fit:cover;border-radius:4px;border:1px solid var(--border)" />` : ''
                            ).join('')}
                          </div>
                        </div>` : ''}
                      <div class="cart-item-price">${fmt(i.price)}</div>
                      <div class="qty-control">
                        <button class="qty-btn" data-cart-action="dec" data-cart-key="${esc(i.key)}">−</button>
                        <input class="qty-val" type="number" min="1" max="99" value="${i.qty}" data-cart-action="qty" data-cart-key="${esc(i.key)}" />
                        <button class="qty-btn" data-cart-action="inc" data-cart-key="${esc(i.key)}">+</button>
                      </div>
                    </div>
                    <div style="text-align:right">
                      <div style="font-weight:700;margin-bottom:12px">${fmt(i.price * i.qty)}</div>
                      <button class="btn btn-ghost btn-sm" data-cart-action="remove" data-cart-key="${esc(i.key)}" aria-label="Remove ${esc(i.name)} from cart"><i class="fas fa-trash" style="color:var(--danger)"></i></button>
                    </div>
                  </div>`).join('')}
                <div style="padding:16px;display:flex;justify-content:space-between">
                  <a href="/products" data-link class="btn btn-ghost btn-sm"><i class="fas fa-arrow-left"></i> Continue Shopping</a>
                  <button class="btn btn-ghost btn-sm" data-csp-onclick="confirmClearCart()"><i class="fas fa-trash"></i> Clear Cart</button>
                </div>
              </div>
            </div>
            <div class="order-summary">
              ${welcomeCartOffer()}
              ${shipping > 0 ? `
              <div style="background:var(--bg);border-radius:10px;padding:14px 16px;margin-bottom:20px;border:1px solid var(--border)">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;font-size:.85rem">
                  <span style="font-weight:600"><i class="fas fa-shipping-fast" style="color:var(--primary);margin-right:6px"></i>Free Shipping Progress</span>
                  <span style="color:var(--text-light)">${fmt(subtotal)} / $49.00</span>
                </div>
                <div style="background:var(--border);border-radius:99px;height:8px;overflow:hidden">
                  <div style="background:linear-gradient(90deg,var(--primary),var(--secondary));height:100%;width:${Math.min(100,(subtotal/49*100)).toFixed(0)}%;border-radius:99px;transition:width .3s"></div>
                </div>
                <div style="margin-top:8px;font-size:.82rem;color:var(--text-light)">Add <strong style="color:var(--primary)">${fmt(49-subtotal)}</strong> more to unlock free shipping!</div>
              </div>` : `
              <div style="background:linear-gradient(90deg,rgba(29,92,74,.06),rgba(196,154,34,.06));border:1px solid rgba(29,92,74,.18);border-radius:10px;padding:12px 16px;margin-bottom:20px;display:flex;align-items:center;gap:10px">
                <i class="fas fa-check-circle" style="color:var(--primary);font-size:1.2rem;flex-shrink:0"></i>
                <div>
                  <div style="font-weight:700;font-size:.88rem;color:var(--primary)">You've unlocked free shipping!</div>
                  <div style="font-size:.78rem;color:var(--text-light)">Your order qualifies for FREE delivery</div>
                </div>
              </div>`}
              <h3 style="font-size:1.1rem;font-weight:700;margin-bottom:20px">Order Summary</h3>
              <div class="summary-row"><span>Subtotal (${items.reduce((s,i)=>s+i.qty,0)} items)</span><span>${fmt(subtotal)}</span></div>
              <div class="summary-row"><span>Shipping</span><span>${shipping === 0 ? '<span style="color:var(--success)">FREE</span>' : fmt(shipping)}</span></div>
              ${discount > 0 ? `
              <div class="summary-row" style="color:var(--success)">
                <span>Discount <button data-csp-onclick="removeCartCoupon()" style="background:none;border:none;color:var(--danger);cursor:pointer;font-size:.78rem;padding:0 4px;vertical-align:middle" title="Remove coupon">×</button></span>
                <span>−${fmt(discount)}</span>
              </div>` : ''}
              <div class="summary-row total"><span>Total</span><span style="color:var(--primary)">${fmt(total)}</span></div>
              ${discount === 0 ? `
              <div style="margin-top:14px">
                <div style="display:flex;gap:8px">
                  <input class="form-control" id="cart-coupon-input" placeholder="Coupon code" style="flex:1;min-width:0;font-size:.88rem;text-transform:uppercase" value="${esc(cartCoupon.code)}" />
                  <button class="btn btn-outline btn-sm" data-csp-onclick="applyCartCoupon()" style="white-space:nowrap">Apply</button>
                </div>
                <div id="cart-coupon-msg" style="min-height:18px;margin-top:5px;font-size:.82rem"></div>
              </div>` : `
              <div style="margin-top:8px;font-size:.82rem;color:var(--success)"><i class="fas fa-tag" style="margin-right:4px"></i>Coupon <strong>${cartCoupon.code}</strong> applied!</div>`}
              <a href="/checkout" data-link class="btn btn-primary btn-block btn-lg mt-16"><i class="fas fa-lock"></i> Proceed to Checkout</a>
              <div class="text-center text-sm text-muted mt-16"><i class="fas fa-shield-alt"></i> Secure Checkout</div>
            </div>
          </div>
        </div>
      </div>`;
    document.getElementById('cart-items')?.addEventListener('click', handleCartClick);
    document.getElementById('cart-items')?.addEventListener('change', handleCartChange);
    document.getElementById('apply-welcome-cart')?.addEventListener('click', () => {
      const input = document.getElementById('cart-coupon-input');
      if (input) input.value = welcomeStatus?.code || 'WELCOME10';
      window.applyCartCoupon();
    });
  }
  window.renderCart = renderCart;

  function handleCartClick(e) {
    const btn = e.target.closest('[data-cart-action]');
    if (!btn) return;
    const action = btn.dataset.cartAction;
    const key = btn.dataset.cartKey || '';
    const item = Cart.get().find(i => i.key === key);
    if (!item) return;
    if (action === 'inc') Cart.updateQty(key, item.qty + 1);
    if (action === 'dec') Cart.updateQty(key, item.qty - 1);
    if (action === 'remove') Cart.remove(key);
    renderCart();
  }

  function handleCartChange(e) {
    const input = e.target.closest('[data-cart-action="qty"]');
    if (!input) return;
    const qty = Math.max(1, Math.min(99, parseInt(input.value, 10) || 1));
    Cart.updateQty(input.dataset.cartKey || '', qty);
    renderCart();
  }

  window.applyCartCoupon = async () => {
    const input = document.getElementById('cart-coupon-input');
    const code = (input?.value || '').trim().toUpperCase();
    if (!code) return;
    const msg = document.getElementById('cart-coupon-msg');
    const btn = input?.nextElementSibling;
    if (btn) { btn.disabled = true; btn.textContent = 'Checking...'; }
    try {
      const subtotal = Cart.total();
      const coupon = await api.post('/coupons/validate', {
        code,
        subtotal,
        customer_email: Auth.getUser()?.email || '',
      });
      if (Router.stale(_gen)) return;
      let disc = coupon.discount_type === 'percent'
        ? (subtotal * coupon.discount_value) / 100
        : coupon.discount_value;
      disc = Math.min(disc, subtotal);
      cartCoupon = { code, discount: disc };
      saveCouponCode(code);
      renderCart();
    } catch (e) {
      cartCoupon = { code: '', discount: 0 };
      saveCouponCode('');
      if (msg) msg.innerHTML = `<span style="color:var(--danger)">${esc(e.message)}</span>`;
      if (btn) { btn.disabled = false; btn.textContent = 'Apply'; }
    }
  };

  window.removeCartCoupon = () => {
    cartCoupon = { code: '', discount: 0 };
    saveCouponCode('');
    renderCart();
  };

  window.confirmClearCart = () => {
    const overlay = openModal(`
      <div style="padding:24px;max-width:320px">
        <h3 style="margin-bottom:8px">Clear Cart?</h3>
        <p style="color:var(--text-light);margin-bottom:20px">This removes every product, selected size/color, custom print upload, and coupon from your cart.</p>
        <div style="display:flex;gap:10px;justify-content:flex-end">
          <button class="btn btn-ghost" data-csp-onclick="closeModal()">Cancel</button>
          <button class="btn" style="background:var(--danger);color:#fff" data-csp-onclick="Cart.clear();closeModal();removeCartCoupon()">Clear Cart</button>
        </div>
      </div>`);
    const btns = overlay.querySelectorAll('button');
    setTimeout(() => btns[btns.length - 1]?.focus(), 50);
  };
  renderCart();
  if (cartCoupon.code && !cartCoupon.discount) setTimeout(() => window.applyCartCoupon(), 0);
});
