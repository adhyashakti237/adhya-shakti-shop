// Initialize the app
Router.init();
Cart.updateBadge();
Wishlist.init?.();

// Back to top button
(function() {
  const btn = document.createElement('button');
  btn.className = 'back-to-top';
  btn.setAttribute('aria-label', 'Back to top');
  btn.innerHTML = '<i class="fas fa-chevron-up"></i>';
  btn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  document.body.appendChild(btn);
  window.addEventListener('scroll', () => btn.classList.toggle('visible', window.scrollY > 400), { passive: true });
})();

// WhatsApp floating button
(function() {
  const wa = document.createElement('a');
  wa.href = 'https://wa.me/18483363769';
  wa.target = '_blank';
  wa.rel = 'noopener noreferrer';
  wa.setAttribute('aria-label', 'Chat with us on WhatsApp');
  wa.className = 'whatsapp-float';
  wa.innerHTML = '<i class="fab fa-whatsapp"></i>';
  document.body.appendChild(wa);
})();

// Guest welcome popup. Logged-in customers are handled by server-side account state.
function shouldShowWelcomePopup() {
  return !Auth.isLoggedIn()
    && !sessionStorage.getItem('popup_shown')
    && !localStorage.getItem('welcome_popup_dismissed');
}

if (shouldShowWelcomePopup()) {
  setTimeout(() => {
    if (!shouldShowWelcomePopup()) return;
    sessionStorage.setItem('popup_shown', '1');
    const overlay = document.createElement('div');
    overlay.id = 'email-popup-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px';
    overlay.innerHTML = `
      <div style="background:#fff;border-radius:16px;max-width:440px;width:100%;overflow:hidden;box-shadow:0 24px 64px rgba(0,0,0,.25);position:relative">
        <div style="background:linear-gradient(135deg,#1D5C4A,#0e2d23);padding:28px 28px 20px;text-align:center">
          <button id="popup-close" style="position:absolute;top:12px;right:14px;background:rgba(255,255,255,.15);border:none;color:#fff;width:28px;height:28px;border-radius:50%;cursor:pointer;font-size:1rem;display:flex;align-items:center;justify-content:center" aria-label="Close">&times;</button>
          <div style="font-size:1.8rem;margin-bottom:6px"><i class="fas fa-tag"></i></div>
          <h2 style="color:#fff;font-family:Georgia,serif;font-size:1.4rem;margin-bottom:6px">Get 10% Off Your First Order</h2>
          <p style="color:rgba(255,255,255,.8);font-size:.9rem">Enter your email and we'll send your one-time first-order code.</p>
        </div>
        <div style="padding:24px 28px">
          <div id="popup-form">
            <div style="display:flex;gap:8px;margin-bottom:10px">
              <input id="popup-email" type="email" placeholder="your@email.com" style="flex:1;min-width:0;padding:10px 14px;border:1.5px solid var(--border);border-radius:8px;font-size:.92rem;outline:none" />
              <button id="popup-btn" style="background:var(--primary);color:#fff;border:none;border-radius:8px;padding:10px 18px;font-weight:700;cursor:pointer;white-space:nowrap">Get Code</button>
            </div>
            <p style="font-size:.75rem;color:var(--text-light);text-align:center;margin:0">No spam, ever. Unsubscribe anytime.</p>
          </div>
          <div id="popup-success" style="display:none;text-align:center;padding:8px 0">
            <div style="font-size:2.4rem;margin-bottom:12px"><i class="fas fa-envelope-open-text" style="color:var(--primary)"></i></div>
            <div style="font-weight:700;font-size:1.05rem;color:var(--primary);margin-bottom:8px">Check your inbox!</div>
            <p id="popup-success-message" style="font-size:.88rem;color:var(--text-light);line-height:1.6">We've emailed your first-order 10% off code to<br><strong id="popup-sent-to" style="color:var(--text)"></strong></p>
            <button id="popup-got-it" style="margin-top:16px;background:var(--primary);color:#fff;border:none;border-radius:8px;padding:9px 24px;font-weight:700;cursor:pointer">Got it</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    function dismissWelcomePopup() {
      localStorage.setItem('welcome_popup_dismissed', '1');
      document.getElementById('email-popup-overlay')?.remove();
    }
    overlay.addEventListener('click', e => { if (e.target === overlay) dismissWelcomePopup(); });
    document.getElementById('popup-close')?.addEventListener('click', dismissWelcomePopup);
    document.getElementById('popup-got-it')?.addEventListener('click', dismissWelcomePopup);

    // Focus trap
    const focusable = [...overlay.querySelectorAll('a,button,input,textarea,select,[tabindex]:not([tabindex="-1"])')].filter(el => !el.disabled);
    const first = focusable[0];
    const last  = focusable[focusable.length - 1];
    setTimeout(() => first?.focus(), 50);
    overlay.addEventListener('keydown', e => {
      if (e.key === 'Escape') { dismissWelcomePopup(); return; }
      if (e.key !== 'Tab') return;
      if (e.shiftKey ? document.activeElement === first : document.activeElement === last) {
        e.preventDefault();
        (e.shiftKey ? last : first)?.focus();
      }
    });

    window.submitPopupEmail = async () => {
      const emailInput = document.getElementById('popup-email');
      const email = emailInput.value.trim();
      if (!email || !email.includes('@')) {
        emailInput.style.borderColor = '#f87171';
        emailInput.focus();
        return;
      }
      const btn = document.getElementById('popup-btn');
      btn.disabled = true; btn.textContent = 'Sending...';
      try {
        const res = await api.post('/newsletter/subscribe', { email });
        localStorage.setItem('welcome_popup_dismissed', '1');
        document.getElementById('popup-sent-to').textContent = email;
        const msg = document.getElementById('popup-success-message');
        if (msg && res?.message) msg.innerHTML = `${esc(res.message)}<br><strong id="popup-sent-to" style="color:var(--text)">${esc(email)}</strong>`;
        document.getElementById('popup-form').style.display = 'none';
        document.getElementById('popup-success').style.display = 'block';
      } catch {
        btn.disabled = false; btn.textContent = 'Get Code';
        emailInput.style.borderColor = '#f87171';
        if (!emailInput.parentNode.querySelector('.popup-err')) {
          const e = document.createElement('div');
          e.className = 'popup-err';
          e.style.cssText = 'color:#f87171;font-size:.78rem;margin-top:4px';
          e.textContent = 'Something went wrong. Please try again.';
          emailInput.parentNode.appendChild(e);
        }
      }
    };
    document.getElementById('popup-btn')?.addEventListener('click', window.submitPopupEmail);
    document.getElementById('popup-email')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        window.submitPopupEmail();
      }
    });
  }, 8000);
}
