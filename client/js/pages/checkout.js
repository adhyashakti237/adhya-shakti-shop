Router.register('/checkout', async () => {
  const _gen = Router._gen;
  const app = document.getElementById('app');
  const cartItems = Cart.get();
  if (!cartItems.length) { Router.navigate('/cart'); return; }
  app.innerHTML = `
    <div class="container section">
      <div class="checkout-loading-card">
        <div class="spinner"></div>
        <h2>Checking your cart</h2>
        <p>We are confirming current prices, stock, selected options, and coupon details before payment.</p>
      </div>
    </div>`;
  const user = Auth.getUser();
  const savedCouponCode = (sessionStorage.getItem('cart_coupon_code') || '').trim().toUpperCase();

  function orderItemsPayloadFrom(list) {
    return (list || []).map(i => ({
      id: i.id,
      qty: i.qty,
      variation: i.variation,
      customPrint: i.customPrint || null,
    }));
  }

  async function validateCheckoutCart(couponCode = '') {
    return api.post('/cart/validate', {
      items: orderItemsPayloadFrom(cartItems),
      coupon_code: couponCode,
      customer_email: document.getElementById('co-email')?.value.trim() || user?.email || '',
    });
  }

  function showCheckoutBlocked(message) {
    app.innerHTML = `
      <div class="container section">
        <div class="checkout-blocked-card">
          <div class="checkout-blocked-icon"><i class="fas fa-triangle-exclamation"></i></div>
          <h1>Review your cart first</h1>
          <p>${esc(message || 'Something in your cart needs attention before checkout.')}</p>
          <div class="checkout-blocked-actions">
            <a href="/cart" data-link class="btn btn-primary"><i class="fas fa-shopping-cart"></i> Review Cart</a>
            <a href="/products" data-link class="btn btn-outline"><i class="fas fa-store"></i> Continue Shopping</a>
          </div>
          <div class="checkout-safe-note"><i class="fas fa-lock"></i> No payment was attempted.</div>
        </div>
      </div>`;
  }

  let preflight;
  let preflightNotice = '';
  try {
    if (savedCouponCode) {
      try {
        preflight = await validateCheckoutCart(savedCouponCode);
      } catch (couponErr) {
        sessionStorage.removeItem('cart_coupon_code');
        preflightNotice = `${savedCouponCode} could not be applied: ${couponErr.message}. You can enter a different coupon below.`;
        preflight = await validateCheckoutCart('');
      }
    } else {
      preflight = await validateCheckoutCart('');
    }
  } catch (err) {
    if (!Router.stale(_gen)) showCheckoutBlocked(err.message);
    return;
  }
  if (Router.stale(_gen)) return;

  const items = (preflight.items || []).map((serverItem, idx) => ({
    ...(cartItems[idx] || {}),
    ...serverItem,
    key: cartItems[idx]?.key || `${serverItem.id}-${serverItem.variation || 'default'}`,
  }));
  const subtotal = Number(preflight.subtotal || 0);
  const shipping = Number(preflight.shipping || 0);
  let discount = Number(preflight.discount || 0);
  let appliedCoupon = preflight.coupon_code || null;
  let checkoutSubmitting = false;
  let cardComplete = false;

  function getTotal() { return subtotal - discount + shipping; }
  function customPrintLabel(customPrint) {
    if (!customPrint) return '';
    if (customPrint.placement === 'both') return 'Front & Back custom print';
    if (customPrint.placement === 'front') return 'Front custom print';
    if (customPrint.placement === 'back') return 'Back custom print';
    return 'Custom print';
  }
  function checkoutItemMeta(i) {
    const chips = [];
    if (i.variation) {
      const pieces = String(i.variation).split('/').map(s => s.trim()).filter(Boolean);
      if (pieces[0]) chips.push(`<span><i class="fas fa-palette"></i> Color: ${esc(pieces[0])}</span>`);
      if (pieces[1]) chips.push(`<span><i class="fas fa-ruler"></i> Size: ${esc(pieces[1])}</span>`);
      if (pieces.length < 2) chips.push(`<span><i class="fas fa-tag"></i> ${esc(i.variation)}</span>`);
    }
    if (i.customPrint) chips.push(`<span><i class="fas fa-print"></i> ${esc(customPrintLabel(i.customPrint))}</span>`);
    chips.push(`<span><i class="fas fa-layer-group"></i> Qty: ${Number(i.qty || 0)}</span>`);
    return `<div class="checkout-item-meta">${chips.join('')}</div>`;
  }
  function showCheckoutMessage(message, type = 'error') {
    const box = document.getElementById('checkout-message');
    if (!box) return;
    box.className = `alert ${type === 'warning' ? 'alert-warning' : type === 'info' ? 'alert-info' : 'alert-error'}`;
    box.innerHTML = message;
    box.style.display = 'block';
  }
  function hideCheckoutMessage() {
    const box = document.getElementById('checkout-message');
    if (box) {
      box.style.display = 'none';
      box.innerHTML = '';
    }
  }
  function orderItemsPayload() {
    return items.map(i => ({
      id: i.id,
      qty: i.qty,
      variation: i.variation,
      customPrint: i.customPrint || null,
    }));
  }
  function checkoutShippingAddress() {
    return {
      line1:    document.getElementById('co-address').value.trim(),
      city:     document.getElementById('co-city').value.trim(),
      state:    document.getElementById('co-state').value,
      pin:      document.getElementById('co-pin').value.trim(),
      landmark: document.getElementById('co-landmark').value.trim(),
    };
  }

  app.innerHTML = `
    <div class="page">
      <div class="container" style="padding-top:24px">
        <div class="breadcrumb"><a href="/" data-link>Home</a><span class="sep">/</span><a href="/cart" data-link>Cart</a><span class="sep">/</span><span>Checkout</span></div>
        <h1 style="font-size:1.75rem;font-weight:800;margin:16px 0 24px">Checkout</h1>
        <div class="checkout-layout">
          <div>
            <div class="checkout-trust-strip">
              <div><i class="fas fa-lock"></i><strong>Secure payment</strong><span>Stripe encrypted card processing</span></div>
              <div><i class="fas fa-box-open"></i><strong>Order checked</strong><span>Stock and total verified before charge</span></div>
              <div><i class="fas fa-envelope"></i><strong>Need help?</strong><span>contact@adhyashaktishop.com</span></div>
            </div>
            <div id="checkout-message" class="alert alert-error" style="display:none;margin-bottom:16px"></div>
            ${preflightNotice ? `<div class="alert alert-warning" style="margin-bottom:16px"><strong>Coupon not applied.</strong> ${esc(preflightNotice)}</div>` : ''}
            <div class="checkout-confidence-note">
              <i class="fas fa-shield-halved"></i>
              <div>
                <strong>Before your card is charged, we verify your cart, coupon, stock, and selected options.</strong>
                <span>If anything changed, checkout will stop and ask you to review the cart first.</span>
              </div>
            </div>
            <div class="card mb-16">
              <div class="card-header">Shipping Information</div>
              <div class="card-body">
                <div class="form-row">
                  <div class="form-group">
                    <label class="form-label">Full Name *</label>
                    <input class="form-control" id="co-name" value="${esc(user?.name || '')}" placeholder="Enter full name" autocomplete="shipping name" />
                  </div>
                  <div class="form-group">
                    <label class="form-label">Phone *</label>
                    <input class="form-control" id="co-phone" type="tel" placeholder="(555) 555-5555" autocomplete="shipping tel" inputmode="tel" />
                  </div>
                </div>
                <div class="form-group">
                  <label class="form-label">Email *</label>
                  <input class="form-control" id="co-email" type="email" value="${esc(user?.email || '')}" placeholder="email@example.com" autocomplete="email" inputmode="email" autocapitalize="none" spellcheck="false" />
                </div>
                <div class="form-group">
                  <label class="form-label">Street Address *</label>
                  <input class="form-control" id="co-address" placeholder="123 Main St, Apt 4B" autocomplete="shipping street-address" />
                </div>
                <div class="form-row">
                  <div class="form-group">
                    <label class="form-label">City *</label>
                    <input class="form-control" id="co-city" placeholder="City" autocomplete="shipping address-level2" />
                  </div>
                  <div class="form-group">
                    <label class="form-label">State *</label>
                    <select class="form-control" id="co-state" autocomplete="shipping address-level1">
                      <option value="">Select State</option>
                      <option>Alabama</option><option>Alaska</option><option>Arizona</option>
                      <option>Arkansas</option><option>California</option><option>Colorado</option>
                      <option>Connecticut</option><option>Delaware</option><option>Florida</option>
                      <option>Georgia</option><option>Hawaii</option><option>Idaho</option>
                      <option>Illinois</option><option>Indiana</option><option>Iowa</option>
                      <option>Kansas</option><option>Kentucky</option><option>Louisiana</option>
                      <option>Maine</option><option>Maryland</option><option>Massachusetts</option>
                      <option>Michigan</option><option>Minnesota</option><option>Mississippi</option>
                      <option>Missouri</option><option>Montana</option><option>Nebraska</option>
                      <option>Nevada</option><option>New Hampshire</option><option>New Jersey</option>
                      <option>New Mexico</option><option>New York</option><option>North Carolina</option>
                      <option>North Dakota</option><option>Ohio</option><option>Oklahoma</option>
                      <option>Oregon</option><option>Pennsylvania</option><option>Rhode Island</option>
                      <option>South Carolina</option><option>South Dakota</option><option>Tennessee</option>
                      <option>Texas</option><option>Utah</option><option>Vermont</option>
                      <option>Virginia</option><option>Washington</option><option>Washington D.C.</option>
                      <option>West Virginia</option><option>Wisconsin</option><option>Wyoming</option>
                    </select>
                  </div>
                </div>
                <div class="form-row">
                  <div class="form-group">
                    <label class="form-label">ZIP Code *</label>
                    <input class="form-control" id="co-pin" placeholder="07001" maxlength="5" autocomplete="shipping postal-code" inputmode="numeric" pattern="[0-9]*" />
                  </div>
                  <div class="form-group">
                    <label class="form-label">Apt / Suite / Unit</label>
                    <input class="form-control" id="co-landmark" placeholder="Apt 4B (optional)" autocomplete="shipping address-line2" />
                  </div>
                </div>
                <div class="form-group">
                  <label class="form-label">Order Notes</label>
                  <textarea class="form-control" id="co-notes" placeholder="Any special instructions..." autocomplete="off" maxlength="1000"></textarea>
                </div>
                ${user ? `
                <label class="checkout-save-address">
                  <input type="checkbox" id="co-save-profile" checked />
                  <span><strong>Save these shipping details to my profile</strong><small>Next checkout can fill them automatically.</small></span>
                </label>` : ''}
              </div>
            </div>
            <div class="card">
              <div class="card-header">
                <div style="display:flex;align-items:center;justify-content:space-between">
                  <span>Payment Information</span>
                  <div style="display:flex;gap:6px;align-items:center">
                    <span style="font-size:.68rem;font-weight:800;border:1px solid var(--border);border-radius:4px;padding:2px 6px;background:#fff;color:#1f3b7a;letter-spacing:.03em">VISA</span>
                    <span style="font-size:.68rem;font-weight:800;border:1px solid var(--border);border-radius:4px;padding:2px 6px;background:#fff;color:#b45309;letter-spacing:.03em">MC</span>
                    <span style="font-size:.68rem;font-weight:800;border:1px solid var(--border);border-radius:4px;padding:2px 6px;background:#fff;color:#166534;letter-spacing:.03em">AMEX</span>
                  </div>
                </div>
              </div>
              <div class="card-body">
                <div class="form-group">
                  <label class="form-label">Card Number, Expiry &amp; CVC</label>
                  <div id="stripe-card-element"
                    style="border:1px solid var(--border);border-radius:8px;padding:14px 12px;background:#fff;transition:border-color .2s">
                  </div>
                  <div id="stripe-card-error" style="color:var(--danger);font-size:.82rem;margin-top:6px;min-height:20px"></div>
                </div>
                <div style="display:flex;align-items:center;gap:6px;margin-top:4px;font-size:.8rem;color:var(--text-light)">
                  <i class="fas fa-lock" style="color:var(--primary)"></i>
                  256-bit SSL encrypted &amp; secured by <strong style="color:var(--primary);margin-left:2px">Stripe</strong>. We never see or store your card details.
                </div>
                <div class="alert alert-info" style="margin-top:14px">
                  Your order total and stock are checked again securely before the payment is completed.
                </div>
              </div>
            </div>
          </div>
          <div>
            <div class="order-summary" style="position:sticky;top:calc(var(--nav-h) + 16px)">
              <h3 style="font-size:1.1rem;font-weight:700;margin-bottom:16px">Order Summary</h3>
              <div style="max-height:200px;overflow-y:auto;margin-bottom:16px">
                ${items.map(i => `
                  <div class="checkout-summary-item">
                    <img src="${safeMediaUrl(i.image, 'https://placehold.co/52x52/f5f5f5/999?text=?')}" alt="${esc(i.name)}" loading="lazy" decoding="async" width="52" height="52" data-csp-onerror="this.src='https://placehold.co/52x52/f5f5f5/999?text=?'" />
                    <div style="flex:1;font-size:.88rem">
                      <div style="font-weight:600">${esc(i.name)}</div>
                      ${checkoutItemMeta(i)}
                    </div>
                    <div style="font-weight:600;font-size:.9rem">${fmt(i.price*i.qty)}</div>
                  </div>`).join('')}
              </div>
              <div class="coupon-row mb-16">
                <input class="form-control" id="coupon-input" placeholder="Coupon code" value="${esc(appliedCoupon || '')}" autocomplete="off" autocapitalize="characters" spellcheck="false" />
                <button class="btn btn-outline" data-csp-onclick="applyCoupon()">Apply</button>
              </div>
              <div id="coupon-msg">${discount > 0 ? `<div class="badge badge-success mb-8"><i class="fas fa-tag"></i> Coupon applied! You save ${fmt(discount)}</div>` : ''}</div>
              <div class="summary-row"><span>Subtotal</span><span>${fmt(subtotal)}</span></div>
              <div class="summary-row" id="discount-row" style="${discount > 0 ? 'display:flex' : 'display:none'}"><span>Discount</span><span id="discount-val" style="color:var(--success)">${discount > 0 ? `-${fmt(discount)}` : ''}</span></div>
              <div class="summary-row"><span>Shipping</span><span>${shipping === 0 ? '<span style="color:var(--success)">FREE</span>' : fmt(shipping)}</span></div>
              <div class="summary-row total"><span>Total</span><span id="total-display" style="color:var(--primary)">${fmt(getTotal())}</span></div>
              <div class="alert alert-info" style="margin-top:14px;margin-bottom:0">
                <strong>Ships from New Jersey.</strong><br>
                Most orders ship within 2–3 business days. Custom print timelines may vary by artwork and quantity.
              </div>
              <button class="btn btn-primary btn-block btn-lg mt-16" id="place-order-btn" data-csp-onclick="placeOrder()">
                <i class="fas fa-check-circle"></i> Place Order
              </button>
              <div class="text-center text-sm text-muted mt-8"><i class="fas fa-shield-alt"></i> Secure Encrypted Checkout</div>
            </div>
          </div>
        </div>
      </div>
    </div>`;


  // ── Pre-fill shipping from saved profile, then last order if needed ─────
  if (user) {
    const set = (id, val, overwrite = false) => { const el = document.getElementById(id); if (el && val && (overwrite || !el.value)) el.value = val; };
    const stateAliases = {
      AL:'Alabama', AK:'Alaska', AZ:'Arizona', AR:'Arkansas', CA:'California', CO:'Colorado', CT:'Connecticut', DE:'Delaware',
      FL:'Florida', GA:'Georgia', HI:'Hawaii', ID:'Idaho', IL:'Illinois', IN:'Indiana', IA:'Iowa', KS:'Kansas', KY:'Kentucky',
      LA:'Louisiana', ME:'Maine', MD:'Maryland', MA:'Massachusetts', MI:'Michigan', MN:'Minnesota', MS:'Mississippi', MO:'Missouri',
      MT:'Montana', NE:'Nebraska', NV:'Nevada', NH:'New Hampshire', NJ:'New Jersey', NM:'New Mexico', NY:'New York',
      NC:'North Carolina', ND:'North Dakota', OH:'Ohio', OK:'Oklahoma', OR:'Oregon', PA:'Pennsylvania', RI:'Rhode Island',
      SC:'South Carolina', SD:'South Dakota', TN:'Tennessee', TX:'Texas', UT:'Utah', VT:'Vermont', VA:'Virginia',
      WA:'Washington', DC:'Washington D.C.', WV:'West Virginia', WI:'Wisconsin', WY:'Wyoming',
    };
    const setState = (val, overwrite = false) => {
      const stEl = document.getElementById('co-state');
      if (stEl && val && (overwrite || !stEl.value)) {
        const wanted = stateAliases[String(val).trim().toUpperCase()] || String(val).trim();
        const opt = [...stEl.options].find(o => o.value === wanted || o.text === wanted || o.value.toLowerCase() === wanted.toLowerCase() || o.text.toLowerCase() === wanted.toLowerCase());
        if (opt) stEl.value = opt.value;
      }
    };
    api.get('/auth/me').then(profile => {
      let addr = {};
      try { addr = profile.address ? JSON.parse(profile.address || '{}') : {}; } catch { addr = {}; }
      set('co-name', profile.name, true);
      set('co-phone', profile.phone);
      set('co-address', addr.line1);
      set('co-city', addr.city);
      set('co-pin', addr.pin || addr.zip);
      set('co-landmark', addr.landmark);
      setState(addr.state);
    }).catch(() => {});
    api.get('/orders/my').then(orders => {
      if (!orders.length) return;
      const last = orders[0];
      const addr = last.shipping_address || {};
      set('co-phone',   last.customer_phone);
      set('co-address', addr.line1);
      set('co-city',    addr.city);
      set('co-pin',     addr.pin || addr.zip);
      set('co-landmark', addr.landmark);
      setState(addr.state);
    }).catch(() => {});
  }

  // ── Initialize Stripe Elements ───────────────────────────────────────────
  let stripeInstance = null;
  let cardElement = null;

  async function initStripe() {
    try {
      const { publishable_key } = await api.get('/stripe-key');
      if (Router.stale(_gen)) return;
      stripeInstance = Stripe(publishable_key);
      const elements = stripeInstance.elements({
        fonts: [{ cssSrc: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500&display=swap' }],
      });
      cardElement = elements.create('card', {
        style: {
          base: {
            fontFamily: 'Inter, system-ui, sans-serif',
            fontSize: '15px',
            color: '#1a1a1a',
            '::placeholder': { color: '#9ca3af' },
            iconColor: '#1D5C4A',
          },
          invalid: { color: '#dc2626', iconColor: '#dc2626' },
        },
        hidePostalCode: true,
      });
      cardElement.mount('#stripe-card-element');
      cardElement.on('change', (e) => {
        cardComplete = !!e.complete;
        const errEl = document.getElementById('stripe-card-error');
        if (errEl) errEl.textContent = e.error ? e.error.message : '';
        const el = document.getElementById('stripe-card-element');
        if (el) el.style.borderColor = e.error ? 'var(--danger)' : e.complete ? 'var(--primary)' : 'var(--border)';
      });
    } catch (err) {
      console.error('Stripe init failed', err);
      const errEl = document.getElementById('stripe-card-error');
      if (errEl) errEl.textContent = 'Payment form could not load. Please refresh the page or contact us if it continues.';
      const btn = document.getElementById('place-order-btn');
      if (btn) btn.disabled = true;
    }
  }
  initStripe();

  // Real-time onblur field validation
  function markInvalid(id, msg) {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.borderColor = 'var(--danger)';
    let err = el.parentNode.querySelector('.field-err');
    if (!err) {
      err = document.createElement('div');
      err.className = 'field-err';
      err.style.cssText = 'color:var(--danger);font-size:.78rem;margin-top:4px';
      el.parentNode.appendChild(err);
    }
    err.textContent = msg;
  }
  function markValid(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.borderColor = '';
    const err = el.parentNode.querySelector('.field-err');
    if (err) err.remove();
  }
  const blurRules = [
    { id: 'co-name',    check: v => v ? null : 'Full name is required' },
    { id: 'co-email',   check: v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? null : 'Valid email address required' },
    { id: 'co-phone',   check: v => /^\+?[\d\s\-().]{7,15}$/.test(v) ? null : 'Enter a valid phone number (digits only)' },
    { id: 'co-address', check: v => v ? null : 'Street address is required' },
    { id: 'co-city',    check: v => v ? null : 'City is required' },
    { id: 'co-pin',     check: v => /^\d{5}$/.test(v) ? null : 'Enter a valid 5-digit ZIP code' },
  ];
  blurRules.forEach(({ id, check }) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('blur', () => {
      const err = check(el.value.trim());
      err ? markInvalid(id, err) : markValid(id);
    });
    el.addEventListener('input', () => {
      if (el.style.borderColor && !check(el.value.trim())) markValid(id);
    });
  });
  const stateEl = document.getElementById('co-state');
  if (stateEl) {
    stateEl.addEventListener('blur', () => {
      stateEl.value ? markValid('co-state') : markInvalid('co-state', 'Please select a state');
    });
  }

  window.applyCoupon = async () => {
    const code = document.getElementById('coupon-input').value.trim().toUpperCase();
    if (!code) return;
    const applyBtn = document.querySelector('.coupon-row .btn-outline');
    if (applyBtn) { applyBtn.disabled = true; applyBtn.textContent = 'Applying...'; }
    try {
      const validation = await api.post('/cart/validate', {
        items: orderItemsPayload(),
        coupon_code: code,
        customer_email: document.getElementById('co-email')?.value.trim() || user?.email || '',
      });
      if (Math.abs(Number(validation.subtotal || 0) - subtotal) > 0.02) {
        throw new Error('Your cart changed. Please return to the cart and review it before checkout.');
      }
      discount = Number(validation.discount || 0);
      appliedCoupon = validation.coupon_code || code;
      sessionStorage.setItem('cart_coupon_code', appliedCoupon);
      document.getElementById('coupon-msg').innerHTML = `<div class="badge badge-success mb-8"><i class="fas fa-tag"></i> Coupon applied! You save ${fmt(discount)}</div>`;
      document.getElementById('discount-row').style.display = 'flex';
      document.getElementById('discount-val').textContent = `-${fmt(discount)}`;
      document.getElementById('total-display').textContent = fmt(getTotal());
      toast('Coupon applied!', 'success');
    } catch (e) {
      sessionStorage.removeItem('cart_coupon_code');
      document.getElementById('coupon-msg').innerHTML = `<div class="text-sm" style="color:var(--danger)">${esc(e.message)}</div>`;
    } finally {
      if (applyBtn) { applyBtn.disabled = false; applyBtn.textContent = 'Apply'; }
    }
  };
  document.getElementById('coupon-input')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      window.applyCoupon();
    }
  });

  window.placeOrder = async () => {
    if (checkoutSubmitting) {
      toast('Your order is already being processed. Please wait.', 'info');
      return;
    }
    hideCheckoutMessage();
    checkoutSubmitting = true;
    const btn = document.getElementById('place-order-btn');
    const unlockCheckout = (label = '<i class="fas fa-check-circle"></i> Place Order') => {
      checkoutSubmitting = false;
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = label;
      }
    };
    // 1 ── Validate shipping fields
    const fields = { 'co-name': 'Name', 'co-email': 'Email', 'co-phone': 'Phone', 'co-address': 'Street Address', 'co-city': 'City', 'co-state': 'State', 'co-pin': 'ZIP Code' };
    for (const [id, label] of Object.entries(fields)) {
      if (!document.getElementById(id)?.value.trim()) {
        markInvalid(id, `${label} is required`);
        document.getElementById(id)?.focus();
        showCheckoutMessage(`<strong>${label} is required.</strong> Please complete the highlighted field before placing your order.`, 'warning');
        toast(`${label} is required`, 'warning');
        unlockCheckout();
        return;
      }
    }
    if (!/^\d{5}$/.test(document.getElementById('co-pin').value.trim())) {
      markInvalid('co-pin', 'Enter a valid 5-digit ZIP code');
      showCheckoutMessage('<strong>ZIP code looks incorrect.</strong> Please enter a valid 5-digit US ZIP code.', 'warning');
      toast('Please enter a valid 5-digit ZIP code.', 'warning'); unlockCheckout(); return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(document.getElementById('co-email').value.trim())) {
      markInvalid('co-email', 'Valid email address required');
      document.getElementById('co-email').focus();
      showCheckoutMessage('<strong>Email address looks incorrect.</strong> We need a valid email for your order confirmation and receipt.', 'warning');
      toast('Please enter a valid email address.', 'warning'); unlockCheckout(); return;
    }
    if (!/^\+?[\d\s\-().]{7,15}$/.test(document.getElementById('co-phone').value.trim())) {
      markInvalid('co-phone', 'Enter a valid phone number');
      document.getElementById('co-phone').focus();
      showCheckoutMessage('<strong>Phone number looks incorrect.</strong> Please enter a reachable phone number for delivery questions.', 'warning');
      toast('Please enter a valid phone number.', 'warning'); unlockCheckout(); return;
    }
    if (!stripeInstance || !cardElement) {
      showCheckoutMessage('<strong>Payment form is not ready.</strong> Please refresh this page. If it continues, email contact@adhyashaktishop.com.', 'error');
      toast('Payment system not ready. Please refresh the page.', 'error'); unlockCheckout(); return;
    }
    if (!cardComplete) {
      const errEl = document.getElementById('stripe-card-error');
      if (errEl) errEl.textContent = 'Please complete your card number, expiry date, and CVC.';
      showCheckoutMessage('<strong>Card details are incomplete.</strong> Please complete the card number, expiry date, and CVC.', 'warning');
      toast('Please complete your card details.', 'warning'); unlockCheckout(); return;
    }

    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verifying Cart...';
    document.getElementById('stripe-card-error').textContent = '';
    let paymentCompleted = false;

    try {
      // 2 ── Re-check cart before payment setup, so stale stock/coupons stop before card processing.
      const freshValidation = await api.post('/cart/validate', {
        items: orderItemsPayload(),
        coupon_code: appliedCoupon || '',
        customer_email: document.getElementById('co-email')?.value.trim() || user?.email || '',
      });
      if (Math.abs(Number(freshValidation.total || 0) - getTotal()) > 0.02) {
        document.getElementById('total-display').textContent = fmt(freshValidation.total || 0);
        throw new Error('Your cart total changed. Please return to the cart and review it before payment.');
      }

      // 3 ── Create PaymentIntent from the server-calculated cart total
      const intentData = await api.post('/create-payment-intent', {
        items: orderItemsPayload(),
        coupon_code: appliedCoupon || '',
        customer_name:  document.getElementById('co-name').value,
        customer_email: document.getElementById('co-email').value.trim(),
        customer_phone: document.getElementById('co-phone').value.trim(),
        shipping_address: checkoutShippingAddress(),
      });
      const client_secret = intentData.client_secret;
      if (Math.abs(Number(intentData.total || 0) - getTotal()) > 0.02) {
        document.getElementById('total-display').textContent = fmt(intentData.total);
        throw new Error('Your cart total changed. Please review checkout and try again.');
      }

      // 4 ── Confirm card payment via Stripe (this charges the card)
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing Payment...';
      const { paymentIntent, error } = await stripeInstance.confirmCardPayment(client_secret, {
        payment_method: {
          card: cardElement,
          billing_details: {
            name:  document.getElementById('co-name').value.trim(),
            email: document.getElementById('co-email').value.trim(),
            phone: document.getElementById('co-phone').value.trim(),
            address: {
              line1:       document.getElementById('co-address').value.trim(),
              city:        document.getElementById('co-city').value.trim(),
              state:       document.getElementById('co-state').value,
              postal_code: document.getElementById('co-pin').value.trim(),
              country:     'US',
            },
          },
        },
      });

      if (error) {
        // Card declined, wrong CVC, expired, etc.
        document.getElementById('stripe-card-error').textContent = error.message;
        showCheckoutMessage(`<strong>Payment could not be completed.</strong> ${esc(error.message || 'Please check your card details and try again.')}`, 'error');
        toast(error.message, 'error');
        unlockCheckout();
        return;
      }

      // Guard: only proceed if Stripe confirms the payment actually succeeded
      if (paymentIntent.status !== 'succeeded') {
        document.getElementById('stripe-card-error').textContent = 'Payment is still processing. Please wait a moment then check My Orders.';
        showCheckoutMessage('<strong>Payment is still processing.</strong> Please wait a moment, then check My Orders before trying again.', 'info');
        unlockCheckout();
        return;
      }
      paymentCompleted = true;

      // 5 ── Payment succeeded — save order to database
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving Order...';
      const payload = {
        customer_name:    document.getElementById('co-name').value.trim(),
        customer_email:   document.getElementById('co-email').value.trim(),
        customer_phone:   document.getElementById('co-phone').value.trim(),
        shipping_address: checkoutShippingAddress(),
        items: orderItemsPayload(),
        subtotal,
        shipping_charge:    shipping,
        coupon_code:        appliedCoupon || '',
        payment_method:     'card',
        payment_intent_id:  paymentIntent.id,
        notes: document.getElementById('co-notes').value,
      };

      const res = await api.post('/orders', payload);
      if (user && document.getElementById('co-save-profile')?.checked) {
        api.put('/user/profile', {
          name: payload.customer_name,
          phone: payload.customer_phone,
          address: payload.shipping_address,
        }).catch(() => {});
      }
      Cart.clear();
      sessionStorage.removeItem('cart_coupon_code');
      Router.navigate(`/order-success?order=${res.order_number}&total=${res.total}`);

    } catch (e) {
      if (paymentCompleted) {
        checkoutSubmitting = true;
        if (btn) {
          btn.disabled = true;
          btn.innerHTML = '<i class="fas fa-headset"></i> Check My Orders or Contact Support';
        }
        showCheckoutMessage(`<strong>Payment may have completed, so do not submit again from this page.</strong> ${esc(e.message || 'Please check My Orders. If the order is not visible, contact contact@adhyashaktishop.com with your email and checkout time.')}`, 'error');
        toast('Payment was processed but the order confirmation needs review. Please check My Orders or contact support.', 'error', 7000);
        return;
      }
      showCheckoutMessage(`<strong>Checkout stopped safely.</strong> ${esc(e.message || 'Something went wrong. Please try again.')}`, 'error');
      toast(e.message || 'Something went wrong. Please try again.', 'error');
      unlockCheckout();
    }
  };
  if (savedCouponCode && !appliedCoupon) setTimeout(() => window.applyCoupon(), 0);
});

Router.register('/order-success', (params) => {
  const orderNumber = String(params.order || '').trim();
  const total = parseFloat(params.total) || 0;
  document.getElementById('app').innerHTML = `
    <div class="container section order-success-wrap">
      <div class="order-success-card">
        <div class="order-success-icon"><i class="fas fa-check"></i></div>
        <div class="order-success-kicker">Payment received</div>
        <h1>Order placed successfully</h1>
        <p>Thank you for your purchase. We emailed your confirmation and will update you as the order moves through processing and shipping.</p>

        <div class="order-success-summary">
          <div><span>Order number</span><strong>${esc(orderNumber)}</strong></div>
          <div><span>Total paid</span><strong>${fmt(total)}</strong></div>
          <div><span>Payment</span><strong class="success-text">Paid</strong></div>
          <div><span>Status</span><strong>Pending review</strong></div>
        </div>

        <div class="order-success-next">
          <div><i class="fas fa-envelope"></i><span>Confirmation email sent to the checkout email address.</span></div>
          <div><i class="fas fa-box-open"></i><span>Most orders move to processing within 1-2 business days.</span></div>
          <div><i class="fas fa-truck"></i><span>Tracking will appear when the package is ready with the carrier.</span></div>
        </div>

        <div class="order-success-actions">
          <a href="/dashboard/orders" data-link class="btn btn-primary"><i class="fas fa-box"></i> View My Orders</a>
          <a href="/track-order" data-link class="btn btn-outline"><i class="fas fa-location-dot"></i> Track by Order #</a>
          <a href="/products" data-link class="btn btn-ghost"><i class="fas fa-store"></i> Continue Shopping</a>
        </div>

        <div class="checkout-safe-note"><i class="fas fa-headset"></i> Need help? Email contact@adhyashaktishop.com with order ${esc(orderNumber)}.</div>
      </div>
    </div>`;
});
