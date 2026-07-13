Router.register('/clothing', async () => {
  const _gen = Router._gen;
  // Clothing opens automatically once it has live products; until then, show the
  // Coming Soon landing with the email-capture signup.
  const comingSoon = await clothingComingSoon();
  if (Router.stale(_gen)) return;
  if (!comingSoon) {
    // Clothing is live — show the admin-managed category hierarchy as a real
    // landing page (a card per branch) instead of dumping into a flat list.
    let tree = { categories: [] };
    try { tree = await api.get('/category-tree'); } catch {}
    if (Router.stale(_gen)) return;
    const clothing = activeCategoryTree(tree).find(c => (c.name || '').toLowerCase() === 'clothing');
    if (!clothing) { Router.navigate('/products'); return; }
    const branches = categoryChildren(clothing).filter(b => categorySubtreeCount(b) > 0);
    const total = categorySubtreeCount(clothing);

    const branchCard = (b) => {
      const kids = categoryChildren(b).filter(k => categorySubtreeCount(k) > 0);
      const count = categorySubtreeCount(b);
      return `
        <div class="card" style="padding:22px 20px">
          <a href="/products?category=${encodeURIComponent(b.id)}" data-link
             style="display:flex;align-items:center;gap:14px;color:inherit">
            <span style="width:52px;height:52px;border-radius:50%;background:var(--primary-light);display:flex;align-items:center;justify-content:center;flex-shrink:0">
              <i class="fas ${categoryIcon(b.name)}" style="font-size:1.25rem;color:var(--primary)"></i>
            </span>
            <span style="min-width:0">
              <span style="display:block;font-family:Georgia,serif;font-size:1.15rem;font-weight:700">${esc(b.name)} <i class="fas fa-arrow-right" style="font-size:.7rem;opacity:.55;margin-left:4px"></i></span>
              <span style="display:block;font-size:.82rem;color:var(--text-light)">${count} item${count === 1 ? '' : 's'}</span>
            </span>
          </a>
          ${kids.length ? `
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px">
            ${kids.slice(0, 6).map(k => `
              <a href="/products?category=${encodeURIComponent(k.id)}" data-link
                 style="font-size:.8rem;padding:5px 12px;border:1px solid var(--border);border-radius:20px;color:var(--text);background:var(--bg-soft)">${esc(k.name)}</a>`).join('')}
          </div>` : ''}
        </div>`;
    };

    document.getElementById('app').innerHTML = `
      <div class="page"><div class="container section">
        <div class="breadcrumb" style="margin-bottom:18px"><a href="/" data-link>Home</a> / <span>Clothing</span></div>
        <div style="display:flex;align-items:flex-end;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:26px">
          <div>
            <div style="color:var(--gold);font-size:.78rem;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin-bottom:6px">Shop</div>
            <h1 style="font-family:Georgia,serif;font-size:clamp(1.8rem,4vw,2.4rem);margin-bottom:6px">Clothing</h1>
            <p style="color:var(--text-light)">${total} item${total === 1 ? '' : 's'} available now.</p>
          </div>
          <a href="/products?category=${encodeURIComponent(clothing.id)}" data-link class="btn btn-primary"><i class="fas fa-tshirt"></i> Shop All Clothing</a>
        </div>
        ${branches.length ? `
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:18px;margin-bottom:38px">
          ${branches.map(branchCard).join('')}
        </div>` : ''}
        <h2 style="font-family:Georgia,serif;font-size:1.35rem;margin-bottom:16px">New In Clothing</h2>
        <div id="clothing-live-rail" class="grid-4 merch-grid"><div class="spinner"></div></div>
      </div></div>`;

    try {
      const res = await api.get(`/products?category=${encodeURIComponent(clothing.id)}&per_page=8&sort=newest`);
      if (Router.stale(_gen)) return;
      const rail = document.getElementById('clothing-live-rail');
      if (rail) rail.innerHTML = (res.products || []).map(productCard).join('')
        || '<p style="grid-column:1/-1;color:var(--text-light)">New arrivals are on the way.</p>';
    } catch {
      const rail = document.getElementById('clothing-live-rail');
      if (rail) rail.innerHTML = '<p style="grid-column:1/-1;color:var(--text-light)">Could not load products. <a href="/products" data-link>Browse all products</a>.</p>';
    }
    return;
  }

  const previewItems = [
    { icon: 'fa-tshirt', name: 'T-Shirts',    desc: 'Soft, breathable everyday tees in a range of fits and colors.' },
    { icon: 'fa-tshirt', name: 'Polo Shirts', desc: 'Smart-casual polos, perfect for work or weekend.' },
    { icon: 'fa-tshirt', name: 'Hoodies',     desc: 'Cozy, durable hoodies built to last through every season.' },
  ];
  document.getElementById('app').innerHTML = `
    <div class="static-page">
      <div style="text-align:center;padding:16px 0 40px">
        <div style="display:inline-block;background:var(--primary-light);color:var(--primary);font-size:.75rem;font-weight:700;letter-spacing:2px;text-transform:uppercase;padding:6px 18px;border-radius:20px;margin-bottom:20px">Coming Soon</div>
        <h1 style="font-family:Georgia,serif;font-size:clamp(1.8rem,4vw,2.6rem);margin-bottom:14px"><i class="fas fa-tshirt" style="color:var(--primary);margin-right:10px"></i>Custom-Printed Clothing Is On Its Way</h1>
        <p class="lead" style="max-width:560px;margin:0 auto 32px">We've ordered our printing equipment and we're setting it up now — no exact date yet, but it won't be long. Subscribe and get <strong>10% off your first order</strong>; we'll email you the moment it launches.</p>
        <div style="max-width:440px;margin:0 auto">
          <div id="clothing-cs-form" style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center">
            <input type="email" id="clothing-cs-email" placeholder="your@email.com" class="form-control" style="flex:1;min-width:200px" />
            <button data-csp-onclick="clothingSignup()" class="btn btn-primary"><i class="fas fa-tag"></i> Get 10% Off</button>
          </div>
          <div id="clothing-cs-msg" style="margin-top:10px;font-size:.88rem"></div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:24px;margin-top:8px">
        ${previewItems.map(p => `
          <div class="card" style="text-align:center;padding:32px 20px;position:relative;overflow:hidden">
            <div style="position:absolute;top:14px;right:14px;background:var(--gold);color:#fff;font-size:.65rem;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;padding:3px 10px;border-radius:20px">Soon</div>
            <div style="width:64px;height:64px;border-radius:50%;background:var(--primary-light);display:flex;align-items:center;justify-content:center;margin:0 auto 16px">
              <i class="fas ${p.icon}" style="font-size:1.6rem;color:var(--primary)"></i>
            </div>
            <h3 style="font-family:Georgia,serif;margin-bottom:10px">${p.name}</h3>
            <p style="color:var(--text-light);font-size:.9rem;line-height:1.7">${p.desc}</p>
          </div>`).join('')}
      </div>
      <div style="text-align:center;margin-top:48px;padding:32px;background:var(--bg-soft);border-radius:16px">
        <h3 style="font-family:Georgia,serif;margin-bottom:10px">Can't Wait? Shop What's Available Now</h3>
        <p style="color:var(--text-light);margin-bottom:20px">Our handcrafted jewelry collection is ready to ship today.</p>
        <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap">
          <a href="/jewelry" data-link class="btn btn-primary"><i class="fas fa-gem"></i> Shop Jewelry</a>
          <a href="/custom-printing" data-link class="btn btn-outline"><i class="fas fa-print"></i> Custom Printing Info</a>
        </div>
      </div>
    </div>`;

  window.clothingSignup = async () => {
    const input = document.getElementById('clothing-cs-email');
    const msg   = document.getElementById('clothing-cs-msg');
    const email = input.value.trim();
    if (!email || !email.includes('@')) { input.style.borderColor = '#f87171'; input.focus(); return; }
    input.style.borderColor = '';
    document.getElementById('clothing-cs-form').querySelectorAll('input,button').forEach(el => el.disabled = true);
    try {
      const res = await api.post('/newsletter/subscribe', { email });
      document.getElementById('clothing-cs-form').style.display = 'none';
      msg.innerHTML = `<div style="color:var(--primary);font-weight:600"><i class="fas fa-check-circle" style="margin-right:6px"></i>${esc(res.message || 'You are subscribed.')} We will also notify you when clothing launches.</div>`;
    } catch (err) {
      msg.innerHTML = `<div style="color:#f87171">${esc(err.message || 'Something went wrong. Please try again.')}</div>`;
      document.getElementById('clothing-cs-form').querySelectorAll('input,button').forEach(el => el.disabled = false);
    }
  };
});

Router.register('/custom-printing', async () => {
  const _gen = Router._gen;
  const comingSoon = await customComingSoon();
  if (Router.stale(_gen)) return;
  document.getElementById('app').innerHTML = `
    <div class="static-page">
      ${comingSoon ? `
      <div style="text-align:center;padding:8px 0 32px;border-bottom:2px solid var(--border);margin-bottom:32px">
        <div style="display:inline-block;background:var(--primary-light);color:var(--primary);font-size:.75rem;font-weight:700;letter-spacing:2px;text-transform:uppercase;padding:6px 18px;border-radius:20px;margin-bottom:18px">Coming Soon</div>
        <h1 style="font-family:Georgia,serif;font-size:clamp(1.8rem,4vw,2.4rem);margin-bottom:14px"><i class="fas fa-print" style="color:var(--primary);margin-right:10px"></i>Custom Printing Is On Its Way</h1>
        <p class="lead" style="max-width:560px;margin:0 auto 28px">We've ordered our printing equipment and we're setting it up now — no exact date yet, but it won't be long. Subscribe and get <strong>10% off your first order</strong>; we'll email you the moment it's ready.</p>
        <div style="max-width:440px;margin:0 auto">
          <div id="print-cs-form" style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center">
            <input type="email" id="print-cs-email" placeholder="your@email.com" class="form-control" style="flex:1;min-width:200px" />
            <button data-csp-onclick="customPrintSignup()" class="btn btn-primary"><i class="fas fa-tag"></i> Get 10% Off</button>
          </div>
          <div id="print-cs-msg" style="margin-top:10px;font-size:.88rem"></div>
        </div>
      </div>
      <div style="text-align:center;font-size:.78rem;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:var(--text-light);margin-bottom:24px">Preview — Here's What's Coming</div>
      ` : `
      <h1><i class="fas fa-print" style="color:var(--primary);margin-right:10px"></i>Custom Printing</h1>
      <p class="lead">Bring your ideas to life. We print on t-shirts, polo shirts, and hoodies — right here in New Jersey, USA.</p>
      `}

      <!-- Bulk Pricing Table -->
      <div style="margin:36px 0">
        <div style="font-size:.78rem;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:var(--gold);margin-bottom:8px">Pricing</div>
        <h2 style="font-family:Georgia,serif;margin-bottom:4px">Bulk Pricing</h2>
        <p style="color:var(--text-light);font-size:.92rem;margin-bottom:20px">The more you order, the more you save. Prices shown are per item.</p>
        <div class="mobile-table-wrap">
          <table class="mobile-card-table" style="width:100%;border-collapse:collapse;font-size:.9rem">
            <thead>
              <tr style="background:var(--primary);color:#fff">
                <th style="padding:12px 18px;text-align:left">Quantity</th>
                <th style="padding:12px 18px;text-align:left">T-Shirts / Polo Shirts / Hoodies</th>
                <th style="padding:12px 18px;text-align:left">Savings</th>
              </tr>
            </thead>
            <tbody>
              <tr style="border-bottom:1px solid var(--border)">
                <td data-label="Quantity" style="padding:12px 18px;font-weight:700">1 item</td>
                <td data-label="Item price" style="padding:12px 18px">Standard price</td>
                <td data-label="Savings" style="padding:12px 18px;color:var(--text-light)">—</td>
              </tr>
              <tr style="border-bottom:1px solid var(--border);background:var(--bg)">
                <td data-label="Quantity" style="padding:12px 18px;font-weight:700">6–11 items</td>
                <td data-label="Item price" style="padding:12px 18px">~10% off list</td>
                <td data-label="Savings" style="padding:12px 18px;color:var(--success);font-weight:700">Save ~10%</td>
              </tr>
              <tr style="border-bottom:1px solid var(--border)">
                <td data-label="Quantity" style="padding:12px 18px;font-weight:700">12–23 items</td>
                <td data-label="Item price" style="padding:12px 18px">~18% off list</td>
                <td data-label="Savings" style="padding:12px 18px;color:var(--success);font-weight:700">Save ~18%</td>
              </tr>
              <tr style="border-bottom:1px solid var(--border);background:var(--bg)">
                <td data-label="Quantity" style="padding:12px 18px;font-weight:700">24–47 items</td>
                <td data-label="Item price" style="padding:12px 18px">~25% off list</td>
                <td data-label="Savings" style="padding:12px 18px;color:var(--success);font-weight:700">Save ~25%</td>
              </tr>
              <tr>
                <td data-label="Quantity" style="padding:12px 18px;font-weight:700">48+ items</td>
                <td data-label="Item price" style="padding:12px 18px;font-weight:700;color:var(--primary)">Best rate</td>
                <td data-label="Savings" style="padding:12px 18px;color:var(--success);font-weight:700">Save 30%+</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p style="font-size:.82rem;color:var(--text-light);margin-top:12px"><i class="fas fa-info-circle" style="color:var(--primary);margin-right:5px"></i>Exact pricing depends on garment type, print size, and number of colors. <a href="/bulk-orders" data-link>Request a custom quote</a> for precise figures.</p>
      </div>

      <!-- What we print on -->
      <h2 style="font-family:Georgia,serif;margin-bottom:16px">What We Print On</h2>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:14px;margin-bottom:36px">
        ${['T-Shirts','Polo Shirts','Hoodies'].map(item => `
          <div style="background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:14px;text-align:center;font-size:.88rem;font-weight:600">
            <i class="fas fa-check" style="color:var(--primary);margin-right:6px"></i>${item}
          </div>`).join('')}
      </div>

      <!-- Upload specs -->
      <h2 style="font-family:Georgia,serif;margin-bottom:10px">Artwork Requirements</h2>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;margin-bottom:36px">
        <div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:10px;padding:18px">
          <div style="font-weight:700;color:#0369a1;margin-bottom:8px"><i class="fas fa-file-image" style="margin-right:6px"></i>Accepted Formats</div>
          <p style="font-size:.88rem;color:#374151">JPG, PNG, WebP<br><span style="color:#6b7280;font-size:.82rem">Clear image with transparent background preferred</span></p>
        </div>
        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:18px">
          <div style="font-weight:700;color:#15803d;margin-bottom:8px"><i class="fas fa-tachometer-alt" style="margin-right:6px"></i>Resolution</div>
          <p style="font-size:.88rem;color:#374151">Minimum <strong>150 DPI</strong><br><span style="color:#6b7280;font-size:.82rem">300 DPI recommended for best quality</span></p>
        </div>
        <div style="background:#fefce8;border:1px solid #fde68a;border-radius:10px;padding:18px">
          <div style="font-weight:700;color:#a16207;margin-bottom:8px"><i class="fas fa-vector-square" style="margin-right:6px"></i>Print Area</div>
          <p style="font-size:.88rem;color:#374151">Up to <strong>12″ × 16″</strong><br><span style="color:#6b7280;font-size:.82rem">Front and/or back placement available</span></p>
        </div>
        <div style="background:#fdf4ff;border:1px solid #e9d5ff;border-radius:10px;padding:18px">
          <div style="font-weight:700;color:#7e22ce;margin-bottom:8px"><i class="fas fa-weight-hanging" style="margin-right:6px"></i>File Size</div>
          <p style="font-size:.88rem;color:#374151">Max <strong>6 MB</strong> per file<br><span style="color:#6b7280;font-size:.82rem">Up to 3 images per print side</span></p>
        </div>
      </div>

      <!-- CTA -->
      <div style="background:var(--primary);color:#fff;border-radius:14px;padding:32px;text-align:center">
        <h3 style="font-family:Georgia,serif;font-size:1.5rem;margin-bottom:8px;color:#fff">${comingSoon ? 'Custom Printing Is Coming Soon' : 'Ready to create something amazing?'}</h3>
        <p style="color:rgba(255,255,255,.82);margin-bottom:20px">${comingSoon ? "Can't wait? Our handcrafted jewelry collection is ready to ship today." : 'Browse our printable products and upload your design right on the product page.'}</p>
        <div style="display:flex;gap:14px;justify-content:center;flex-wrap:wrap">
          ${comingSoon
            ? `<a href="/jewelry" data-link class="btn" style="background:#fff;color:var(--primary);font-weight:700"><i class="fas fa-gem"></i> Shop Jewelry</a>`
            : `<a href="/products" data-link class="btn" style="background:#fff;color:var(--primary);font-weight:700">Browse Products</a>`}
          <a href="/bulk-orders" data-link class="btn" style="background:transparent;color:#fff;border:2px solid rgba(255,255,255,.5)">Request Bulk Quote</a>
        </div>
      </div>
    </div>`;

  if (comingSoon) {
    window.customPrintSignup = async () => {
      const input = document.getElementById('print-cs-email');
      const msg   = document.getElementById('print-cs-msg');
      const email = input.value.trim();
      if (!email || !email.includes('@')) { input.style.borderColor = '#f87171'; input.focus(); return; }
      input.style.borderColor = '';
      document.getElementById('print-cs-form').querySelectorAll('input,button').forEach(el => el.disabled = true);
      try {
        const res = await api.post('/newsletter/subscribe', { email });
        document.getElementById('print-cs-form').style.display = 'none';
        msg.innerHTML = `<div style="color:var(--primary);font-weight:600"><i class="fas fa-check-circle" style="margin-right:6px"></i>${esc(res.message || 'You are subscribed.')} We will also notify you when custom printing launches.</div>`;
      } catch (err) {
        msg.innerHTML = `<div style="color:#f87171">${esc(err.message || 'Something went wrong. Please try again.')}</div>`;
        document.getElementById('print-cs-form').querySelectorAll('input,button').forEach(el => el.disabled = false);
      }
    };
  }
});

Router.register('/about', () => {
  document.getElementById('app').innerHTML = `
    <div class="page">
      <!-- Hero -->
      <div style="background:linear-gradient(135deg,#1D5C4A,#0e2d23);padding:80px 0 72px;text-align:center;position:relative;overflow:hidden">
        <div style="position:absolute;width:480px;height:480px;border-radius:50%;border:1px solid rgba(196,154,34,.08);top:50%;left:50%;transform:translate(-50%,-50%);pointer-events:none"></div>
        <div style="position:absolute;width:360px;height:360px;border-radius:50%;border:1px solid rgba(196,154,34,.14);top:50%;left:50%;transform:translate(-50%,-50%);pointer-events:none"></div>
        <div class="container" style="position:relative;z-index:1">
          <div style="font-size:.78rem;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:var(--gold);margin-bottom:12px">About Us</div>
          <h1 style="font-size:2.6rem;font-weight:800;color:#fff;font-family:Georgia,serif;margin-bottom:16px;line-height:1.2">Crafted with Passion,<br>Rooted in Heritage</h1>
          <p style="color:rgba(255,255,255,.78);font-size:1rem;max-width:520px;margin:0 auto">Bringing handcrafted jewelry and custom-printed clothing to homes across the United States — right from New Jersey.</p>
        </div>
      </div>

      <!-- Values strip -->
      <div class="features-strip features-strip-4">
        <div class="container">
          <div class="feature-item"><div class="feature-icon"><i class="fas fa-gem"></i></div><div class="feature-text"><div class="title">Handcrafted Quality</div><div class="sub">Every piece made with care</div></div></div>
          <div class="feature-item"><div class="feature-icon"><i class="fas fa-heart"></i></div><div class="feature-text"><div class="title">Made with Love</div><div class="sub">Heritage &amp; passion in every item</div></div></div>
          <div class="feature-item"><div class="feature-icon"><i class="fas fa-map-marker-alt"></i></div><div class="feature-text"><div class="title">New Jersey, USA</div><div class="sub">Shipping nationwide</div></div></div>
          <div class="feature-item"><div class="feature-icon"><i class="fas fa-medal"></i></div><div class="feature-text"><div class="title">100% Satisfaction</div><div class="sub">We stand behind every order</div></div></div>
        </div>
      </div>

      <!-- Our Story -->
      <div class="section">
        <div class="container">
          <div class="grid-2" style="gap:64px;align-items:center">
            <div>
              <div style="font-size:.78rem;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:var(--gold);margin-bottom:12px">Our Story</div>
              <h2 style="font-family:Georgia,serif;font-size:2rem;font-weight:800;margin-bottom:20px;line-height:1.25">Born from a Passion for Artistry &amp; Culture</h2>
              <p style="color:#555;line-height:1.9;margin-bottom:16px">Born from a deep love of Indian artistry and a dream to share it with the world, Adhya Shakti Shop was founded in New Jersey in 2026. The name <em>Adhya Shakti</em> — Sanskrit for "The First Power" or "The Original Energy" — reflects our belief that beauty, creativity, and self-expression are the most fundamental human forces.</p>
              <p style="color:#555;line-height:1.9;margin-bottom:16px">We hand-select exquisite jewelry inspired by centuries of Indian craftsmanship, and we help you wear your story through custom-printed clothing made just for you. Every piece we offer is chosen with intention, crafted with care, and sent with love — straight from our heart in New Jersey to yours.</p>
              <p style="color:#555;line-height:1.9;margin-bottom:24px">What started as a passion project quickly became a community. Today, we're proud to serve customers across the United States, bringing a piece of heritage and artistry into every home we touch.</p>
              <a href="/products" data-link class="btn btn-primary"><i class="fas fa-shopping-bag"></i> Shop Our Collection</a>
            </div>
            <div style="text-align:center">
              <div style="width:280px;height:280px;border-radius:50%;background:linear-gradient(145deg,#0e2d23,#1D5C4A);display:flex;align-items:center;justify-content:center;margin:0 auto;box-shadow:0 24px 64px rgba(14,45,35,.3),0 0 0 8px rgba(196,154,34,.15)">
                <img src="/images/logo-main.png" alt="Adhya Shakti Shop"
                  style="width:240px;height:240px;object-fit:contain"
                  data-csp-onerror="this.outerHTML='<div style=\\'text-align:center\\'><div style=\\'font-family:Georgia,serif;font-size:2rem;font-weight:800;color:var(--gold)\\'>Adhya</div><div style=\\'font-family:Georgia,serif;font-size:2rem;font-weight:800;color:#fff\\'>Shakti</div></div>'" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Custom Printing section -->
      <div class="section" style="background:var(--card)">
        <div class="container">
          <div class="grid-2" style="gap:64px;align-items:center">
            <div style="background:linear-gradient(135deg,#1D5C4A,#0e2d23);border-radius:20px;padding:40px;display:flex;align-items:center;justify-content:center;min-height:220px">
              <div style="text-align:center">
                <i class="fas fa-print" style="font-size:3rem;color:var(--gold);margin-bottom:16px;display:block"></i>
                <div style="font-size:.78rem;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:rgba(255,255,255,.6)">Custom Printing</div>
                <div style="font-family:Georgia,serif;font-size:1.4rem;font-weight:800;color:#fff;margin-top:8px">Your Vision, Our Craft</div>
              </div>
            </div>
            <div>
              <div style="font-size:.78rem;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:var(--gold);margin-bottom:12px">Custom Printing</div>
              <h2 style="font-family:Georgia,serif;font-size:2rem;font-weight:800;margin-bottom:20px;line-height:1.25">We Bring Your Vision to Life</h2>
              <p style="color:#555;line-height:1.9;margin-bottom:16px">From t-shirts and polo shirts to hoodies — if you can imagine it, we can print it. We work with individuals, businesses, schools, and organizations of all sizes.</p>
              <ul style="color:#555;line-height:2.2;padding-left:20px;margin-bottom:24px">
                <li>T-Shirts, Polo Shirts, Hoodies</li>
                <li>Bulk &amp; corporate pricing available</li>
                <li>Premium materials, vibrant prints</li>
              </ul>
              <div style="display:flex;gap:12px;flex-wrap:wrap">
                <a href="/custom-printing" data-link class="btn btn-primary"><i class="fas fa-print"></i> Custom Printing</a>
                <a href="/bulk-orders" data-link class="btn btn-outline"><i class="fas fa-boxes"></i> Bulk Orders</a>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Why Choose Us -->
      <div class="section">
        <div class="container">
          <div class="text-center mb-16">
            <div style="font-size:.78rem;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:var(--gold);margin-bottom:8px">Why Adhya Shakti</div>
            <h2 class="section-title" style="font-family:Georgia,serif">Why Customers Choose Us</h2>
          </div>
          <div class="grid-3" style="gap:24px">
            ${[
              { icon:'fa-gem', title:'Heritage-Inspired Jewelry', text:'Each jewelry piece is carefully designed with motifs drawn from Indian artistic traditions — making them meaningful and timeless.' },
              { icon:'fa-check-circle', title:'Quality Guaranteed', text:'We source premium materials and check every order before shipment. Not happy? We make it right — no questions asked.' },
              { icon:'fa-shipping-fast', title:'Nationwide Shipping', text:'We ship everywhere in the United States. Orders process in 1–3 business days with tracking provided automatically.' },
              { icon:'fa-headset', title:'Real Human Support', text:'Questions? Reach us by email or WhatsApp. We\'re a small team and every customer message gets a personal reply.' },
              { icon:'fa-lock', title:'Secure Checkout', text:'All payments are encrypted and processed by Stripe. We never store your card details — your data stays safe.' },
              { icon:'fa-heart', title:'Made with Love', text:'We genuinely care about what we make. Every order is packed by hand and sent with the goal of making your day a little brighter.' },
            ].map(it => `
              <div class="card" style="text-align:center">
                <div class="card-body">
                  <div style="width:56px;height:56px;border-radius:50%;background:rgba(29,92,74,.1);display:flex;align-items:center;justify-content:center;margin:0 auto 16px;font-size:1.3rem;color:var(--primary)">
                    <i class="fas ${it.icon}"></i>
                  </div>
                  <h3 style="font-size:1rem;font-weight:700;margin-bottom:10px">${it.title}</h3>
                  <p style="color:var(--text-light);font-size:.9rem;line-height:1.8">${it.text}</p>
                </div>
              </div>`).join('')}
          </div>
        </div>
      </div>

      <!-- CTA -->
      <div class="section" style="background:var(--primary);color:#fff;padding:60px 0">
        <div class="container text-center">
          <h2 style="font-size:1.85rem;font-weight:800;color:#fff;font-family:Georgia,serif;margin-bottom:12px">Ready to Explore?</h2>
          <p style="color:rgba(255,255,255,.8);margin-bottom:28px;max-width:460px;margin-left:auto;margin-right:auto">Browse our handcrafted jewelry, custom printing options, or reach out — we'd love to hear from you.</p>
          <div style="display:flex;gap:14px;justify-content:center;flex-wrap:wrap;margin-bottom:32px">
            <a href="/products" data-link class="btn btn-lg" style="background:#fff;color:var(--primary);font-weight:700"><i class="fas fa-shopping-bag"></i> Browse Products</a>
            <a href="/contact" data-link class="btn btn-lg" style="background:transparent;color:#fff;border:2px solid rgba(255,255,255,.5)"><i class="fas fa-envelope"></i> Get in Touch</a>
          </div>
          <div style="display:flex;gap:24px;justify-content:center;flex-wrap:wrap">
            <a href="https://www.instagram.com/adhyashaktijewelry?igsh=MXZkbDQ2cnNhNGhrbw==" target="_blank" rel="noopener" style="color:rgba(255,255,255,.75);font-size:.88rem;display:inline-flex;align-items:center;gap:6px;text-decoration:none">
              <i class="fab fa-instagram"></i>@adhyashaktijewelry
            </a>
            <a href="https://www.instagram.com/adhyashaktiprinting" target="_blank" rel="noopener" style="color:rgba(255,255,255,.75);font-size:.88rem;display:inline-flex;align-items:center;gap:6px;text-decoration:none">
              <i class="fab fa-instagram"></i>@adhyashaktiprinting
            </a>
            <a href="https://wa.me/c/18483363769" target="_blank" rel="noopener" style="color:rgba(255,255,255,.75);font-size:.88rem;display:inline-flex;align-items:center;gap:6px;text-decoration:none">
              <i class="fab fa-whatsapp"></i>WhatsApp Catalog
            </a>
          </div>
        </div>
      </div>
    </div>`;
});

Router.register('/contact', () => {
  document.getElementById('app').innerHTML = `
    <div class="static-page">
      <h1>Contact Us</h1>
      <p class="lead">Need help with an order, product, return, or custom request? Send the details once and we will reply within 1-2 business days.</p>
      <div class="support-choice-grid">
        <a href="/track-order" data-link class="support-choice-card">
          <i class="fas fa-location-dot"></i>
          <strong>Track an order</strong>
          <span>Use your order number and checkout email.</span>
        </a>
        <a href="/refund" data-link class="support-choice-card">
          <i class="fas fa-rotate-left"></i>
          <strong>Returns & refunds</strong>
          <span>Check cancellation, return, and exchange rules.</span>
        </a>
        <a href="/bulk-orders" data-link class="support-choice-card">
          <i class="fas fa-boxes-stacked"></i>
          <strong>Bulk quote</strong>
          <span>For 10+ pieces, teams, events, or business orders.</span>
        </a>
      </div>
      <div class="grid-2 mt-24">
        <div>
          <h2>Get in Touch</h2>
          <form data-csp-onsubmit="submitContact(event)" style="margin-top:16px">
            <div class="form-group"><label class="form-label">Your Name</label><input class="form-control" id="ct-name" placeholder="Jane Smith" autocomplete="name" required /></div>
            <div class="form-group"><label class="form-label">Email Address</label><input class="form-control" id="ct-email" type="email" placeholder="you@example.com" autocomplete="email" inputmode="email" autocapitalize="none" spellcheck="false" required /></div>
            <div class="form-group"><label class="form-label">Phone (optional)</label><input class="form-control" id="ct-phone" type="tel" placeholder="(555) 555-5555" autocomplete="tel" inputmode="tel" /></div>
            <div class="form-group">
              <label class="form-label">Inquiry Type</label>
              <select class="form-control" id="ct-inquiry">
                <option value="General Inquiry">General Inquiry</option>
                <option value="Jewelry Order">Jewelry Order</option>
                <option value="Custom Printing">Custom Printing</option>
                <option value="Bulk Order">Bulk Order</option>
                <option value="Shipping">Shipping</option>
                <option value="Return / Exchange">Return / Exchange</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div class="form-group"><label class="form-label">Order Number <span id="ct-order-note" class="text-muted">(optional)</span></label><input class="form-control" id="ct-order" placeholder="e.g. ORD20260608ABC123" autocomplete="off" autocapitalize="characters" spellcheck="false" /></div>
            <div class="form-group"><label class="form-label">Message</label><textarea class="form-control" id="ct-msg" rows="5" maxlength="2000" placeholder="Tell us what happened, what product/order this is about, and what help you need." required></textarea><div class="form-hint">Please do not include card numbers, passwords, or private information.</div></div>
            <input type="text" id="ct-honeypot" name="website" style="display:none" tabindex="-1" autocomplete="off" />
            <button class="btn btn-primary" type="submit"><i class="fas fa-paper-plane"></i> Send Message</button>
            <div id="ct-result" style="margin-top:14px"></div>
          </form>
        </div>
        <div>
          <h2>Contact Information</h2>
          <div style="margin-top:16px;display:flex;flex-direction:column;gap:20px">
            <div style="display:flex;gap:14px;align-items:flex-start">
              <div style="width:44px;height:44px;background:rgba(29,92,74,.1);border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;color:var(--primary)"><i class="fas fa-map-marker-alt"></i></div>
              <div><strong>Location</strong><p style="margin-top:4px"><a href="https://www.google.com/maps/search/?api=1&query=New+Jersey+USA" target="_blank" rel="noopener">New Jersey, USA</a></p></div>
            </div>
            <div style="display:flex;gap:14px;align-items:flex-start">
              <div style="width:44px;height:44px;background:rgba(29,92,74,.1);border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;color:var(--primary)"><i class="fas fa-envelope"></i></div>
              <div><strong>Email</strong><p style="margin-top:4px"><a href="mailto:contact@adhyashaktishop.com">contact@adhyashaktishop.com</a></p></div>
            </div>
            <div style="display:flex;gap:14px;align-items:flex-start">
              <div style="width:44px;height:44px;background:rgba(25,184,78,.1);border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;color:var(--success)"><i class="fab fa-whatsapp"></i></div>
              <div><strong>WhatsApp</strong><p style="margin-top:4px"><a href="https://wa.me/c/18483363769" target="_blank" rel="noopener">View Our Product Catalog</a></p></div>
            </div>
          </div>
          <div class="support-expectation-card">
            <h3>What to include</h3>
            <ul>
              <li>Order number if your message is about an order</li>
              <li>Photos for damaged, wrong, or defective items</li>
              <li>Product name, size, color, and quantity for custom work</li>
            </ul>
          </div>
        </div>
      </div>
    </div>`;
  window.updateContactHelp = () => {
    const type = document.getElementById('ct-inquiry')?.value || '';
    const note = document.getElementById('ct-order-note');
    const msg = document.getElementById('ct-msg');
    const orderRelated = ['Jewelry Order', 'Shipping', 'Return / Exchange'].includes(type);
    if (note) note.textContent = orderRelated ? '(recommended)' : '(optional)';
    if (msg && !msg.value) {
      msg.placeholder = orderRelated
        ? 'Please include your order number, product name, and what help you need.'
        : type === 'Bulk Order'
          ? 'Tell us the product, quantity, timeline, sizes/colors, and design idea.'
          : 'Tell us what you need help with.';
    }
  };
  document.getElementById('ct-inquiry')?.addEventListener('change', window.updateContactHelp);
  window.updateContactHelp();
  window.submitContact = async (e) => {
    e.preventDefault();
    const form = e.target?.closest?.('form') || document.querySelector('form[data-csp-onsubmit="submitContact(event)"]');
    const btn = form?.querySelector('button[type=submit]');
    const result = document.getElementById('ct-result');
    if (!btn || btn.disabled) return;
    const msg = (document.getElementById('ct-msg')?.value || '').trim();
    if (msg.length < 10) {
      toast('Please add a little more detail so we can help properly.', 'warning');
      document.getElementById('ct-msg')?.focus();
      return;
    }
    btn.disabled = true; btn.textContent = 'Sending...';
    try {
      const res = await api.post('/contact', {
        name:         document.getElementById('ct-name').value,
        email:        document.getElementById('ct-email').value,
        phone:        document.getElementById('ct-phone').value,
        inquiry_type: document.getElementById('ct-inquiry').value,
        order_number: document.getElementById('ct-order').value,
        message:      document.getElementById('ct-msg').value,
        website:      document.getElementById('ct-honeypot').value,
      });
      toast('Message sent! We will get back to you within 1–2 business days.', 'success');
      if (result) result.innerHTML = `<div class="alert alert-success"><strong>Message received.</strong><br>We emailed you a confirmation and will reply within 1-2 business days.${res.reference ? `<br>Reference: <strong>${esc(res.reference)}</strong>` : ''}</div>`;
      form?.reset();
      window.updateContactHelp();
    } catch (err) {
      const message = err.message || 'Could not send message. Please email us directly at contact@adhyashaktishop.com';
      toast(message, 'error');
      if (result) result.innerHTML = `<div class="alert alert-error"><strong>Could not send.</strong><br>${esc(message)}<br>Email us directly at contact@adhyashaktishop.com.</div>`;
    } finally {
      btn.disabled = false; btn.innerHTML = '<i class="fas fa-paper-plane"></i> Send Message';
    }
  };
});

Router.register('/terms', () => {
  document.getElementById('app').innerHTML = `
    <div class="static-page">
      <h1>Terms & Conditions</h1>
      <p class="lead">Last updated: June 2026. Please read these terms carefully before using Adhya Shakti Shop.</p>
      <h2>1. Acceptance of Terms</h2>
      <p>By accessing and using Adhya Shakti Shop, you agree to be bound by these Terms and Conditions. If you do not agree, please do not use our platform.</p>
      <h2>2. Use of the Website</h2>
      <p>You must be 18 years or older to make purchases on Adhya Shakti Shop. You agree to provide accurate, current, and complete information during registration and checkout.</p>
      <h2>3. Product Information</h2>
      <p>We strive to provide accurate product descriptions and images. However, we do not warrant that product descriptions or other content on our website is accurate, complete, or error-free. Colors may vary slightly due to screen calibration.</p>
      <h2>4. Pricing</h2>
      <p>All prices are listed in US Dollars (USD). Applicable sales tax may be added at checkout depending on your state. We reserve the right to change prices at any time without prior notice.</p>
      <h2>5. Order Acceptance</h2>
      <p>Your order constitutes an offer to purchase. We reserve the right to refuse or cancel any order for any reason including unavailability, errors in product or pricing information, or suspected fraud.</p>
      <h2>6. Shipping & Returns</h2>
      <p>We ship within the United States only. Orders are processed within 1–3 business days. Delivery times vary by location. Free shipping is available on orders of $49 or more.</p>
      <p>You may cancel an order before it ships for a full refund. After shipment, return requests must be submitted within 7 business days of delivery. Items returned in unworn, unaltered condition with original packaging receive a full refund; items showing clear signs of use receive a 50% refund. Return shipping costs are the customer's responsibility unless the item is defective or incorrect. Custom printed clothing is non-returnable except for defects or errors on our part, which must be reported within 7 days of delivery with a photo. See our full <a href="/refund" data-link>Refund & Returns Policy</a> for complete details.</p>
      <h2>7. Intellectual Property</h2>
      <p>All content on Adhya Shakti Shop including text, graphics, logos, and images is the property of Adhya Shakti Shop and protected by applicable intellectual property laws.</p>
      <h2>8. Limitation of Liability</h2>
      <p>Adhya Shakti Shop shall not be liable for any indirect, incidental, special, or consequential damages arising out of your use of the website or purchase of products.</p>
      <h2>9. Governing Law</h2>
      <p>These terms are governed by the laws of the State of New Jersey, USA. Any disputes shall be subject to the exclusive jurisdiction of the courts in New Jersey.</p>
    </div>`;
});

Router.register('/privacy', () => {
  document.getElementById('app').innerHTML = `
    <div class="static-page">
      <h1>Privacy Policy</h1>
      <p class="lead">Last updated: June 2026. Your privacy is important to us. This policy explains how we collect and use your information.</p>
      <h2>1. Information We Collect</h2>
      <p>We collect information you provide directly to us, including your full name, email address, US phone number, US shipping address, and payment information when you make a purchase.</p>
      <h2>2. How We Use Your Information</h2>
      <ul>
        <li>To process and fulfill your orders</li>
        <li>To send order confirmations and shipping updates</li>
        <li>To respond to your inquiries and customer service requests</li>
        <li>To send promotional communications (with your consent)</li>
        <li>To improve our website and services</li>
      </ul>
      <h2>3. Information Sharing</h2>
      <p>We do not sell, trade, or rent your personal information to third parties. We may share your information with trusted service providers (such as payment processors and shipping carriers) who assist us in operating our business, subject to confidentiality agreements.</p>
      <h2>4. Data Security</h2>
      <p>We implement appropriate security measures to protect your personal information from unauthorized access, use, or disclosure. All payment information is encrypted using SSL technology.</p>
      <h2>5. Cookies</h2>
      <p>We use cookies to enhance your experience on our website. You can set your browser to refuse cookies, though this may affect the functionality of the website.</p>
      <h2>6. Your Rights</h2>
      <p>You have the right to access, correct, or delete your personal information. To exercise these rights, please contact us at <a href="mailto:contact@adhyashaktishop.com">contact@adhyashaktishop.com</a>.</p>
      <h2>7. Contact Us</h2>
      <p>If you have questions about this Privacy Policy, please contact us at <a href="mailto:contact@adhyashaktishop.com">contact@adhyashaktishop.com</a>.</p>
    </div>`;
});

Router.register('/refund', () => {
  document.getElementById('app').innerHTML = `
    <div class="static-page">
      <h1>Return, Refund & Cancel Policy</h1>
      <p class="lead">Last updated: June 2026. We stand behind every order. Please read carefully — policies differ by situation.</p>

      <!-- Quick summary cards -->
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;margin:28px 0">
        <div style="border:2px solid var(--primary);border-radius:12px;padding:20px">
          <div style="font-size:1.3rem;margin-bottom:6px">🚫➡💳</div>
          <h3 style="color:var(--primary);margin-bottom:6px;font-size:1rem">Cancel Before Shipment</h3>
          <p style="font-size:.88rem;color:var(--text-light)"><strong style="color:var(--text)">Full refund</strong> automatically to your card. Available while order is Pending or Processing.</p>
        </div>
        <div style="border:2px solid #c2410c;border-radius:12px;padding:20px">
          <div style="font-size:1.3rem;margin-bottom:6px">📦↩</div>
          <h3 style="color:#c2410c;margin-bottom:6px;font-size:1rem">Return After Shipment</h3>
          <p style="font-size:.88rem;color:var(--text-light)">Ship back within <strong style="color:var(--text)">7 business days</strong>. Full refund if unworn/unaltered; 50% if visibly used. Return shipping cost depends on reason.</p>
        </div>
        <div style="border:2px solid var(--primary);border-radius:12px;padding:20px">
          <div style="font-size:1.3rem;margin-bottom:6px">💍</div>
          <h3 style="color:var(--primary);margin-bottom:6px;font-size:1rem">Jewelry</h3>
          <p style="font-size:.88rem;color:var(--text-light)"><strong style="color:var(--text)">15-day return window</strong> from delivery. Unused, original packaging.</p>
        </div>
        <div style="border:2px solid var(--secondary);border-radius:12px;padding:20px">
          <div style="font-size:1.3rem;margin-bottom:6px">👕</div>
          <h3 style="color:var(--secondary);margin-bottom:6px;font-size:1rem">Custom Clothing</h3>
          <p style="font-size:.88rem;color:var(--text-light)"><strong style="color:var(--text)">No general returns</strong> on custom prints. Defective/wrong items always covered.</p>
        </div>
      </div>

      <h2>❌ Order Cancellation</h2>
      <h3>Before the order is shipped (Pending / Processing)</h3>
      <p>You can cancel your order directly from your account dashboard at any time while the order status is <strong>Pending</strong> or <strong>Processing</strong>.</p>
      <ul>
        <li>Go to <strong>My Account → My Orders → View Order → Cancel Order</strong></li>
        <li>Cancellation is instant and automatic</li>
        <li><strong>Full refund</strong> will be issued to your original payment card within <strong>5–7 business days</strong></li>
        <li>No questions asked — no forms to fill out</li>
      </ul>

      <h3>After the order has shipped (Shipped / Delivered)</h3>
      <p>Once an order is shipped, it cannot be cancelled directly. You will need to submit a <strong>Return Request</strong> instead (see below).</p>

      <h2>↩ Returns — Shipped or Delivered Orders</h2>
      <p>If you wish to return an item after it has been shipped or delivered, follow these steps:</p>
      <ol>
        <li>Go to <strong>My Account → My Orders → View Order → Request Return</strong></li>
        <li>We will email you our return shipping address within 1–2 business days</li>
        <li>Ship the item back within <strong>7 business days</strong> of submitting your return request</li>
        <li>Once we receive and inspect the package, your refund is processed within <strong>5–7 business days</strong></li>
      </ol>

      <h3>Who pays return shipping?</h3>
      <div class="grid-2" style="gap:14px;margin:14px 0 20px">
        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:14px 16px">
          <div style="font-weight:800;color:#166534;margin-bottom:5px;font-size:.92rem">We pay return shipping if:</div>
          <ul style="font-size:.88rem;color:#374151;padding-left:16px;line-height:1.7">
            <li>Item arrived defective or damaged</li>
            <li>Wrong item was sent</li>
            <li>Item does not match the product description</li>
          </ul>
        </div>
        <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:14px 16px">
          <div style="font-weight:800;color:#374151;margin-bottom:5px;font-size:.92rem">Customer pays return shipping if:</div>
          <ul style="font-size:.88rem;color:#374151;padding-left:16px;line-height:1.7">
            <li>Changed your mind</li>
            <li>Ordered wrong size or color</li>
            <li>Item no longer needed</li>
          </ul>
        </div>
      </div>

      <h3>Refund amount — based on item condition when received:</h3>
      <div class="grid-2" style="gap:14px;margin:14px 0">
        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:16px">
          <div style="font-weight:800;color:#166534;margin-bottom:8px">✅ Full Refund (100%)</div>
          <ul style="font-size:.88rem;color:#374151;padding-left:16px;line-height:1.8">
            <li>Item in original packaging</li>
            <li>All tags still attached</li>
            <li>Not worn, washed, or altered</li>
            <li>No odors, stains, or damage</li>
          </ul>
          <p style="font-size:.82rem;color:#166534;margin-top:10px;font-style:italic">Note: Trying on clothing to check the fit is not considered "worn." We assess fairly.</p>
        </div>
        <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;padding:16px">
          <div style="font-weight:800;color:#c2410c;margin-bottom:8px">⚠️ 50% Refund</div>
          <p style="font-size:.82rem;color:#6b7280;margin-bottom:8px">The item shows clear signs of actual use, specifically:</p>
          <ul style="font-size:.88rem;color:#374151;padding-left:16px;line-height:1.8">
            <li>Item has been worn outside the home</li>
            <li>Item has been washed or ironed</li>
            <li>Visible stains, odors, or body marks</li>
            <li>Tags have been removed</li>
            <li>Item has been altered or modified</li>
          </ul>
        </div>
      </div>
      <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:12px 16px;font-size:.85rem;color:#6b7280;margin-top:4px">
        <i class="fas fa-info-circle" style="color:var(--secondary)"></i>
        Item condition is assessed by our team with photos taken upon receiving the package. If you disagree with our assessment, you may contact us within <strong>48 hours of our decision</strong> to request a review. We are committed to being fair.
      </div>

      <h2>💍 Jewelry — Return Policy</h2>
      <p>Jewelry can be returned within <strong>15 days of the delivery date</strong>, provided:</p>
      <ul>
        <li>The item has <strong>not been worn outside the home</strong> — trying on to check fit is acceptable</li>
        <li>No visible signs of wear: no scratches from use, no bent clasps, no tarnishing from skin contact</li>
        <li>Returned in original packaging with all tags and any included pouches or boxes intact</li>
        <li>Item has not been resized, repaired, or altered in any way</li>
        <li>Not a sale, clearance, or final-sale item</li>
      </ul>
      <p style="font-size:.9rem;color:var(--text-light);margin-top:8px">The 15-day window begins from the date your tracking shows the package was delivered — not the date of purchase.</p>

      <h2>👕 Custom Printed Clothing — Return Policy</h2>
      <p>Custom printed items are <strong>made specifically for you</strong> and cannot be returned for general reasons. However, we fully cover:</p>
      <ul>
        <li>Print is defective, faded, peeling, or cracked</li>
        <li>Wrong size or color was sent due to our error</li>
        <li>Item arrived damaged or with a manufacturing defect</li>
      </ul>
      <p>Contact us within <strong>7 days of delivery</strong> with a clear photo of the issue. We will send a replacement or issue a full refund. <em>(We extended this from 48 hours because we understand items are sometimes gifts or not opened immediately.)</em></p>

      <div style="background:#f0f9f4;border-left:4px solid var(--primary);border-radius:4px;padding:16px 20px;margin:24px 0">
        <strong>🔄 One Free Size Exchange (Clothing)</strong><br>
        <span style="font-size:.92rem">If you ordered the wrong size, we offer <strong>one free size exchange</strong> per order — contact us within <strong>7 days of delivery</strong>, item must be unworn and unaltered, subject to stock availability.</span>
      </div>

      <h2>📋 Quick Reference</h2>
      <div class="mobile-table-wrap">
        <table class="mobile-card-table" style="width:100%;border-collapse:collapse;font-size:.88rem;margin-top:8px">
          <thead>
            <tr style="background:var(--primary);color:#fff">
              <th style="padding:10px 14px;text-align:left">Situation</th>
              <th style="padding:10px 14px;text-align:left">Window</th>
              <th style="padding:10px 14px;text-align:left">Condition</th>
              <th style="padding:10px 14px;text-align:left">Refund</th>
            </tr>
          </thead>
          <tbody>
            <tr style="border-bottom:1px solid var(--border)">
              <td data-label="Situation" style="padding:10px 14px">Cancel (not shipped yet)</td>
              <td data-label="Window" style="padding:10px 14px">Anytime</td>
              <td data-label="Condition" style="padding:10px 14px">Order still Pending/Processing</td>
              <td data-label="Refund" style="padding:10px 14px"><strong style="color:var(--success)">100% to card</strong></td>
            </tr>
            <tr style="border-bottom:1px solid var(--border);background:var(--bg)">
              <td data-label="Situation" style="padding:10px 14px">Return — unworn, tags on, original packaging</td>
              <td data-label="Window" style="padding:10px 14px">7 business days from request</td>
              <td data-label="Condition" style="padding:10px 14px">Customer pays return shipping</td>
              <td data-label="Refund" style="padding:10px 14px"><strong style="color:var(--success)">100% to card</strong></td>
            </tr>
            <tr style="border-bottom:1px solid var(--border)">
              <td data-label="Situation" style="padding:10px 14px">Return — worn, washed, stained, or tags removed</td>
              <td data-label="Window" style="padding:10px 14px">7 business days from request</td>
              <td data-label="Condition" style="padding:10px 14px">Customer pays return shipping</td>
              <td data-label="Refund" style="padding:10px 14px"><strong style="color:#c2410c">50% to card</strong></td>
            </tr>
            <tr style="border-bottom:1px solid var(--border);background:var(--bg)">
              <td data-label="Situation" style="padding:10px 14px">Jewelry return</td>
              <td data-label="Window" style="padding:10px 14px">15 days from delivery date</td>
              <td data-label="Condition" style="padding:10px 14px">Not worn outside home, original packaging</td>
              <td data-label="Refund" style="padding:10px 14px"><strong style="color:var(--success)">100% to card</strong></td>
            </tr>
            <tr style="border-bottom:1px solid var(--border)">
              <td data-label="Situation" style="padding:10px 14px">Custom printed clothing</td>
              <td data-label="Window" style="padding:10px 14px">No general returns</td>
              <td data-label="Condition" style="padding:10px 14px">Defective / wrong item only</td>
              <td data-label="Refund" style="padding:10px 14px">Replacement or full refund</td>
            </tr>
            <tr style="border-bottom:1px solid var(--border);background:var(--bg)">
              <td data-label="Situation" style="padding:10px 14px">Size exchange (clothing)</td>
              <td data-label="Window" style="padding:10px 14px">7 days from delivery</td>
              <td data-label="Condition" style="padding:10px 14px">Unworn, subject to stock availability</td>
              <td data-label="Refund" style="padding:10px 14px">Exchange only (1 per order)</td>
            </tr>
            <tr>
              <td data-label="Situation" style="padding:10px 14px">Defective, damaged, or wrong item</td>
              <td data-label="Window" style="padding:10px 14px"><strong>7 days of delivery</strong></td>
              <td data-label="Condition" style="padding:10px 14px">Photo required — we pay return shipping</td>
              <td data-label="Refund" style="padding:10px 14px">Replacement or full refund</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>📬 Need Help?</h2>
      <p>Questions about a return, refund, or cancellation?<br><br>
      <strong>Email:</strong> <a href="mailto:contact@adhyashaktishop.com">contact@adhyashaktishop.com</a><br>
      <strong>Location:</strong> New Jersey, USA<br>
      <strong>Response time:</strong> Within 1–2 business days</p>
    </div>`;
});

Router.register('/faq', () => {
  const faqs = [
    { q: 'Where are you located?', a: 'We are based in New Jersey, USA and ship nationwide across the United States.' },
    { q: 'How long does shipping take?', a: 'Orders are processed within 1–3 business days. Delivery typically takes 3–7 business days depending on your location. You will receive a tracking number once your order ships.' },
    { q: 'Do you offer free shipping?', a: 'Yes! We offer free shipping on all orders of $49 or more. Orders below $49 have a flat shipping rate applied at checkout.' },
    { q: 'Can I cancel my order?', a: 'You can cancel your order any time before it ships. Go to My Account → My Orders → View Order → Cancel Order. Orders that have already shipped cannot be cancelled — you would need to request a return instead.' },
    { q: 'What is your return policy?', a: 'Most items can be returned within 7 business days of submitting a return request. Items must be unworn and in original packaging for a full refund. Jewelry has a 15-day return window. Custom printed clothing is non-returnable except for defects. See our full Refund Policy for details.' },
    { q: 'How do I track my order?', a: 'Visit our Track Order page and enter your order number and the email address used at checkout. You can also log in to your account to view live order status.' },
    { q: 'What products can you custom print?', a: 'We print on t-shirts, polo shirts, and hoodies. If you have something specific in mind, contact us!' },
    { q: 'How do bulk orders work?', a: 'For orders of 10+ pieces, we offer special pricing. Fill out our Bulk Order form with your requirements and we will get back to you with a custom quote within 1–2 business days.' },
    { q: 'What payment methods do you accept?', a: 'We accept all major US credit and debit cards (Visa, Mastercard, American Express, Discover) processed securely through Stripe. We do not accept cash, checks, or payment apps.' },
    { q: 'Is my payment information secure?', a: 'Absolutely. All payment information is encrypted using SSL technology and processed securely through Stripe. We never store your card details on our servers.' },
    { q: 'I received a wrong or defective item — what do I do?', a: 'We\'re sorry to hear that! Contact us at contact@adhyashaktishop.com within 7 days of delivery with a clear photo of the issue. We will send a replacement or issue a full refund, no questions asked.' },
    { q: 'Do you offer size exchanges?', a: 'Yes! We offer one free size exchange per order on clothing items. Contact us within 7 days of delivery with the item unworn and unaltered, subject to stock availability.' },
    { q: 'Can I buy jewelry and custom print items in the same order?', a: 'Yes! You can add items from any of our collections to your cart and check out in a single order. Both will be shipped together.' },
    { q: 'How do I contact customer support?', a: 'Email us at contact@adhyashaktishop.com or reach us on WhatsApp via our product catalog link. We respond within 1–2 business days.' },
  ];
  document.getElementById('app').innerHTML = `
    <div class="static-page">
      <h1>Frequently Asked Questions</h1>
      <p class="lead">Got a question? We've got answers. If you don't see what you're looking for, <a href="/contact" data-link>contact us</a>.</p>
      <div class="faq-search-box">
        <i class="fas fa-search"></i>
        <input id="faq-search" class="form-control" placeholder="Search shipping, returns, bulk orders, payment..." data-csp-oninput="filterFaqs()" />
      </div>
      <div style="margin-top:32px;display:flex;flex-direction:column;gap:0">
        ${faqs.map((f, i) => `
          <div class="faq-item" data-faq="${esc(`${f.q} ${f.a}`.toLowerCase())}" style="border-bottom:1px solid var(--border)">
            <button data-csp-onclick="toggleFaq(${i})" id="faq-btn-${i}" aria-expanded="false" aria-controls="faq-body-${i}" style="width:100%;text-align:left;background:none;border:none;cursor:pointer;padding:20px 0;display:flex;justify-content:space-between;align-items:center;gap:16px">
              <span style="font-weight:700;font-size:1rem;color:var(--text)">${f.q}</span>
              <i id="faq-icon-${i}" class="fas fa-chevron-down" style="color:var(--primary);flex-shrink:0;transition:transform .25s"></i>
            </button>
            <div id="faq-body-${i}" role="region" aria-labelledby="faq-btn-${i}" style="display:none;padding-bottom:18px;color:var(--text-light);line-height:1.8">${f.a}</div>
          </div>`).join('')}
      </div>
      <div id="faq-empty" class="empty-state" style="display:none;margin-top:24px"><i class="fas fa-circle-question"></i><h3>No matching answer found</h3><p>Send us a message and we will help directly.</p><a href="/contact" data-link class="btn btn-primary">Contact Us</a></div>
    </div>`;
  window.filterFaqs = () => {
    const q = (document.getElementById('faq-search')?.value || '').toLowerCase().trim();
    let shown = 0;
    document.querySelectorAll('.faq-item').forEach(item => {
      const match = !q || item.dataset.faq.includes(q);
      item.style.display = match ? '' : 'none';
      if (match) shown++;
    });
    const empty = document.getElementById('faq-empty');
    if (empty) empty.style.display = shown ? 'none' : '';
  };
  window.toggleFaq = (i) => {
    const body = document.getElementById(`faq-body-${i}`);
    const icon = document.getElementById(`faq-icon-${i}`);
    const btn  = document.getElementById(`faq-btn-${i}`);
    const open = body.style.display === 'block';
    body.style.display = open ? 'none' : 'block';
    icon.style.transform = open ? '' : 'rotate(180deg)';
    btn.setAttribute('aria-expanded', open ? 'false' : 'true');
  };
  const faqSchema = document.createElement('script');
  faqSchema.type = 'application/ld+json';
  faqSchema.textContent = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map(f => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  });
  document.head.appendChild(faqSchema);
});

Router.register('/track-order', () => {
  document.getElementById('app').innerHTML = `
    <div class="static-page" style="max-width:600px">
      <h1><i class="fas fa-search" style="color:var(--primary);margin-right:10px"></i>Track Your Order</h1>
      <p class="lead">Enter your order number and the email address used at checkout to see your order status.</p>
      <div class="card mt-24">
        <div class="card-body">
          <form data-csp-onsubmit="doTrackOrder(event)">
            <div class="form-group">
              <label class="form-label">Order Number</label>
              <input class="form-control" id="to-num" placeholder="e.g. AS-1001" autocomplete="off" autocapitalize="characters" spellcheck="false" required />
            </div>
            <div class="form-group">
              <label class="form-label">Email Address</label>
              <input class="form-control" id="to-email" type="email" placeholder="The email used when placing the order" autocomplete="email" inputmode="email" autocapitalize="none" spellcheck="false" required />
            </div>
            <button class="btn btn-primary" type="submit" id="to-btn"><i class="fas fa-search"></i> Track Order</button>
          </form>
        </div>
      </div>
      <div id="to-result" style="margin-top:24px"></div>
    </div>`;

  window.doTrackOrder = async (e) => {
    e.preventDefault();
    const btn = document.getElementById('to-btn');
    btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Searching...';
    const result = document.getElementById('to-result');
    result.innerHTML = '';
    try {
      const order = await api.post('/orders/track', {
        order_number: document.getElementById('to-num').value,
        email:        document.getElementById('to-email').value,
      });
      const statusColor = { pending:'#d97706', processing:'#2563eb', shipped:'#7c3aed', delivered:'#16a34a', cancelled:'#dc2626', return_requested:'#c2410c', return_received:'#2563eb', refunded:'#16a34a' };
      const col = statusColor[order.status] || '#666';
      const addr = order.shipping_address || {};
      const statusText = {
        pending: 'We received your order and it is waiting for review.',
        processing: 'Your order is being prepared.',
        shipped: order.tracking_number ? 'Your package is on the way. Tracking may take time to update after the carrier scan.' : 'Your order is marked shipped. Tracking will appear when available.',
        delivered: 'The carrier marked this order delivered.',
        cancelled: 'This order was cancelled. Refund timing depends on your bank.',
        return_requested: 'Return request received. Please ship the package back within 7 business days.',
        return_received: 'Returned package received. Refund review is in progress.',
        refunded: 'Refund has been issued to the original payment method.',
      }[order.status] || 'Status update available.';
      result.innerHTML = `
        <div class="card track-result-card">
          <div class="card-header flex-between">
            <span style="font-weight:700">Order <span style="color:var(--primary)">${esc(order.order_number || '')}</span></span>
            <span style="background:${col}20;color:${col};padding:4px 12px;border-radius:20px;font-size:.82rem;font-weight:700;text-transform:capitalize">${esc(order.status || '')}</span>
          </div>
          <div class="card-body" style="display:flex;flex-direction:column;gap:14px">
            ${typeof accountOrderTimeline === 'function' ? accountOrderTimeline(order.status) : ''}
            <div class="alert alert-info" style="margin:0"><strong>${esc(order.status.replace(/_/g,' '))}:</strong> ${esc(statusText)} Need help? Contact contact@adhyashaktishop.com with your order number.</div>
            ${typeof accountOrderTrackingPanel === 'function' ? accountOrderTrackingPanel(order) : ''}
            ${typeof accountReturnReasonHtml === 'function' ? accountReturnReasonHtml(order) : ''}
            ${typeof accountCancellationDetailsHtml === 'function' ? accountCancellationDetailsHtml(order) : ''}
            <div class="grid-2" style="gap:12px;font-size:.9rem">
              <div><span style="color:var(--text-light)">Placed on</span><br><strong>${new Date(order.created_at).toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'})}</strong></div>
              <div><span style="color:var(--text-light)">Total</span><br><strong>${fmt(order.total)}</strong></div>
              <div><span style="color:var(--text-light)">Customer</span><br><strong>${esc(order.customer_name)}</strong></div>
              ${order.tracking_number ? `<div><span style="color:var(--text-light)">Tracking #</span><br><a href="https://tools.usps.com/go/TrackConfirmAction?tLabels=${encodeURIComponent(order.tracking_number)}" target="_blank" rel="noopener" style="font-weight:700;color:var(--primary)">${esc(order.tracking_number)} <i class="fas fa-external-link-alt" style="font-size:.7rem"></i></a></div>` : ''}
            </div>
            ${(addr.line1 || addr.address) ? `<div style="font-size:.88rem;color:var(--text-light)"><i class="fas fa-map-marker-alt" style="margin-right:6px;color:var(--primary)"></i>${esc([addr.line1 || addr.address, addr.landmark, addr.city, addr.state, addr.pin || addr.zip].filter(Boolean).join(', '))}</div>` : ''}
            <div>
              <div style="font-weight:700;margin-bottom:10px">Items</div>
              ${(order.items || []).map(it => `
                <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);font-size:.9rem">
                  <span>${esc(it.name)}${it.variation ? ` <span style="color:var(--text-light)">(${esc(it.variation)})</span>` : ''} × ${Number(it.qty || it.quantity) || 0}</span>
                  <span>${fmt((it.price || 0) * (it.qty || it.quantity || 0))}</span>
                </div>`).join('')}
            </div>
            ${typeof accountOrderSupportStrip === 'function' ? accountOrderSupportStrip(order) : ''}
          </div>
        </div>`;
    } catch (err) {
      result.innerHTML = `<div class="card" style="border-color:#fca5a5"><div class="card-body" style="color:#dc2626"><i class="fas fa-exclamation-circle" style="margin-right:8px"></i>${esc(err.message || 'No order found. Please check your order number and email address.')}</div></div>`;
    } finally {
      btn.disabled = false; btn.innerHTML = '<i class="fas fa-search"></i> Track Order';
    }
  };
});

Router.register('/coming-soon', () => {
  const products = [
    { icon: 'fa-coffee',     name: 'Custom Tumblers',   desc: 'Stainless steel tumblers with your design printed full-wrap. Perfect for the daily commute or as gifts.' },
    { icon: 'fa-mug-hot',    name: 'Custom Mugs',       desc: 'Classic 11 oz ceramic mugs with vibrant photo-quality prints. Great for the office or a warm morning.' },
    { icon: 'fa-shopping-bag', name: 'Tote Bags',       desc: 'Durable canvas tote bags with custom prints. Eco-friendly, stylish, and spacious for everyday use.' },
    { icon: 'fa-user-tie',   name: 'Custom Aprons',     desc: 'High-quality aprons with your logo or artwork. Perfect for restaurants, chefs, or home cooks who love style.' },
  ];
  document.getElementById('app').innerHTML = `
    <div class="static-page">
      <div style="text-align:center;padding:16px 0 40px">
        <div style="display:inline-block;background:var(--primary-light);color:var(--primary);font-size:.75rem;font-weight:700;letter-spacing:2px;text-transform:uppercase;padding:6px 18px;border-radius:20px;margin-bottom:20px">Coming Soon</div>
        <h1 style="font-family:Georgia,serif;font-size:clamp(1.8rem,4vw,2.6rem);margin-bottom:14px">More Products Are on the Way</h1>
        <p class="lead" style="max-width:560px;margin:0 auto 32px">Subscribe to our newsletter — get <strong>10% off your first order</strong> and be the first to hear when new products drop.</p>
        <div style="max-width:440px;margin:0 auto">
          <div id="cs-form" style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center">
            <input type="email" id="cs-email" placeholder="your@email.com" class="form-control" style="flex:1;min-width:200px" />
            <button data-csp-onclick="csSignup()" class="btn btn-primary"><i class="fas fa-tag"></i> Get 10% Off</button>
          </div>
          <div id="cs-msg" style="margin-top:10px;font-size:.88rem"></div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:24px;margin-top:8px">
        ${products.map(p => `
          <div class="card" style="text-align:center;padding:32px 20px;position:relative;overflow:hidden">
            <div style="position:absolute;top:14px;right:14px;background:var(--gold);color:#fff;font-size:.65rem;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;padding:3px 10px;border-radius:20px">Soon</div>
            <div style="width:64px;height:64px;border-radius:50%;background:var(--primary-light);display:flex;align-items:center;justify-content:center;margin:0 auto 16px">
              <i class="fas ${p.icon}" style="font-size:1.6rem;color:var(--primary)"></i>
            </div>
            <h3 style="font-family:Georgia,serif;margin-bottom:10px">${p.name}</h3>
            <p style="color:var(--text-light);font-size:.9rem;line-height:1.7">${p.desc}</p>
          </div>`).join('')}
      </div>
      <div style="text-align:center;margin-top:48px;padding:32px;background:var(--bg-soft);border-radius:16px">
        <h3 style="font-family:Georgia,serif;margin-bottom:10px">Can't Wait? Shop What's Available Now</h3>
        <p style="color:var(--text-light);margin-bottom:20px">We have beautiful jewelry and custom-printed clothing ready to ship today.</p>
        <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap">
          <a href="/jewelry" data-link class="btn btn-primary"><i class="fas fa-gem"></i> Shop Jewelry</a>
          <a href="/clothing" data-link class="btn btn-outline"><i class="fas fa-tshirt"></i> Shop Clothing</a>
          <a href="/custom-printing" data-link class="btn btn-ghost"><i class="fas fa-print"></i> Custom Printing</a>
        </div>
      </div>
    </div>`;

  window.csSignup = async () => {
    const input = document.getElementById('cs-email');
    const msg   = document.getElementById('cs-msg');
    const email = input.value.trim();
    if (!email || !email.includes('@')) { input.style.borderColor = '#f87171'; input.focus(); return; }
    input.style.borderColor = '';
    document.getElementById('cs-form').querySelectorAll('input,button').forEach(el => el.disabled = true);
    try {
      const res = await api.post('/newsletter/subscribe', { email });
      document.getElementById('cs-form').style.display = 'none';
      msg.innerHTML = `<div style="color:var(--primary);font-weight:600"><i class="fas fa-check-circle" style="margin-right:6px"></i>${esc(res.message || 'You are subscribed.')} We will also notify you when new products launch.</div>`;
    } catch (err) {
      msg.innerHTML = `<div style="color:#f87171">${esc(err.message || 'Something went wrong. Please try again.')}</div>`;
      document.getElementById('cs-form').querySelectorAll('input,button').forEach(el => el.disabled = false);
    }
  };
});

Router.register('/bulk-orders', () => {
  document.getElementById('app').innerHTML = `
    <div class="static-page">
      <h1><i class="fas fa-boxes" style="color:var(--primary);margin-right:10px"></i>Bulk Order Inquiry</h1>
      <p class="lead">Need 10 or more pieces? We offer special pricing for bulk and corporate orders. Fill out the form below and we'll get back to you with a custom quote within 1–2 business days.</p>
      <div class="bulk-order-grid">
        <div>
          <form data-csp-onsubmit="submitBulkOrder(event)">
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Your Name *</label>
                <input class="form-control" id="bo-name" placeholder="Jane Smith" autocomplete="name" required />
              </div>
              <div class="form-group">
                <label class="form-label">Business / Organization</label>
                <input class="form-control" id="bo-biz" placeholder="Optional" autocomplete="organization" />
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Email Address *</label>
                <input class="form-control" id="bo-email" type="email" placeholder="you@example.com" autocomplete="email" inputmode="email" autocapitalize="none" spellcheck="false" required />
              </div>
              <div class="form-group">
                <label class="form-label">Phone</label>
                <input class="form-control" id="bo-phone" type="tel" placeholder="(555) 555-5555" autocomplete="tel" inputmode="tel" />
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Product Type</label>
                <select class="form-control" id="bo-product">
                  <option value="">Select a product...</option>
                  <option>T-Shirts</option>
                  <option>Polo Shirts</option>
                  <option>Hoodies</option>
                  <option>Mixed / Multiple Products</option>
                  <option>Other</option>
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">Estimated Quantity</label>
                <input class="form-control" id="bo-qty" placeholder="e.g. 50 pieces" inputmode="numeric" />
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">Needed By (date)</label>
              <input class="form-control" id="bo-date" type="date" />
            </div>
            <div class="form-group">
              <label class="form-label">Additional Details</label>
              <textarea class="form-control" id="bo-msg" rows="4" placeholder="Describe your design idea, colors, sizes needed, or any other requirements..."></textarea>
            </div>
            <input type="text" id="bo-honeypot" name="website" style="display:none" tabindex="-1" autocomplete="off" />
            <button class="btn btn-primary btn-lg" type="submit" id="bo-btn"><i class="fas fa-paper-plane"></i> Submit Inquiry</button>
            <div id="bo-result" style="margin-top:14px"></div>
          </form>
        </div>
        <div>
          <div class="card" style="margin-bottom:20px">
            <div class="card-body">
              <h3 style="margin-bottom:12px;font-family:Georgia,serif">Why Bulk Order With Us?</h3>
              <ul style="line-height:2;color:var(--text-light)">
                <li><i class="fas fa-check" style="color:var(--primary);margin-right:8px"></i>Special pricing for 10+ pieces</li>
                <li><i class="fas fa-check" style="color:var(--primary);margin-right:8px"></i>Custom designs and branding</li>
                <li><i class="fas fa-check" style="color:var(--primary);margin-right:8px"></i>Mixed sizes and colors in one order</li>
                <li><i class="fas fa-check" style="color:var(--primary);margin-right:8px"></i>Premium quality guaranteed</li>
                <li><i class="fas fa-check" style="color:var(--primary);margin-right:8px"></i>Fast turnaround from NJ</li>
                <li><i class="fas fa-check" style="color:var(--primary);margin-right:8px"></i>Nationwide shipping</li>
              </ul>
            </div>
          </div>
          <div class="card">
            <div class="card-body">
              <h3 style="margin-bottom:12px;font-family:Georgia,serif">Get in Touch Directly</h3>
              <p style="color:var(--text-light);font-size:.92rem;line-height:1.8">Prefer to talk it over?</p>
              <a href="mailto:contact@adhyashaktishop.com" style="display:flex;align-items:center;gap:10px;color:var(--primary);font-weight:600;margin-top:10px"><i class="fas fa-envelope"></i>contact@adhyashaktishop.com</a>
              <a href="https://wa.me/c/18483363769" target="_blank" rel="noopener" style="display:flex;align-items:center;gap:10px;color:#16a34a;font-weight:600;margin-top:10px"><i class="fab fa-whatsapp"></i>WhatsApp Catalog</a>
            </div>
          </div>
        </div>
      </div>
    </div>`;

  window.submitBulkOrder = async (e) => {
    e.preventDefault();
    if (window._bulkOrderSubmitting) return;
    window._bulkOrderSubmitting = true;
    const form = e.target?.closest?.('form') || document.querySelector('form[data-csp-onsubmit="submitBulkOrder(event)"]');
    const btn = document.getElementById('bo-btn');
    const result = document.getElementById('bo-result');
    const now = Date.now();
    if (window._bulkOrderSuccessAt && now - window._bulkOrderSuccessAt < 5000) {
      window._bulkOrderSubmitting = false;
      return;
    }
    btn.disabled = true; btn.textContent = 'Submitting...';
    if (result) result.innerHTML = '';
    try {
      const res = await api.post('/bulk-order', {
        name:          document.getElementById('bo-name').value,
        business_name: document.getElementById('bo-biz').value,
        email:         document.getElementById('bo-email').value,
        phone:         document.getElementById('bo-phone').value,
        product_type:  document.getElementById('bo-product').value,
        quantity:      document.getElementById('bo-qty').value,
        needed_by:     document.getElementById('bo-date').value,
        message:       document.getElementById('bo-msg').value,
        website:       document.getElementById('bo-honeypot').value,
      });
      window._bulkOrderSuccessAt = Date.now();
      toast('Inquiry submitted! We will get back to you within 1–2 business days.', 'success');
      if (result) {
        result.innerHTML = `<div class="alert alert-info"><strong>Inquiry submitted.</strong><br>We will get back to you within 1–2 business days.${res.reference ? `<br>Reference: <strong>${esc(res.reference)}</strong>` : ''}</div>`;
      }
      form?.reset();
    } catch (err) {
      if (window._bulkOrderSuccessAt && Date.now() - window._bulkOrderSuccessAt < 5000) return;
      toast('Could not submit. Please email us at contact@adhyashaktishop.com', 'error');
      if (result) {
        result.innerHTML = '<div class="alert alert-error"><strong>Could not submit.</strong><br>Please email us at contact@adhyashaktishop.com.</div>';
      }
    } finally {
      window._bulkOrderSubmitting = false;
      btn.disabled = false; btn.innerHTML = '<i class="fas fa-paper-plane"></i> Submit Inquiry';
    }
  };
});
