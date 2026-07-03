Router.register('/', async () => {
  const _gen = Router._gen;
  const app = document.getElementById('app');

  app.innerHTML = `<div class="page">
    <!-- Hero Slider -->
    <div id="hero-section"></div>

    <!-- Marquee -->
    <div class="marquee-wrap">
      <div class="marquee-track" id="marquee-track">
        ${Array(2).fill(['Handcrafted Jewelry','Custom Printed Clothing','New Jersey USA','Premium Quality','Unique Designs','Indian Heritage','Fast Shipping','Made with Love']).flat().map(t => `<span>${t}</span>`).join('')}
      </div>
    </div>

    <!-- Features -->
    <div class="features-strip">
      <div class="container">
        <div class="feature-item"><div class="feature-icon"><i class="fas fa-gem"></i></div><div class="feature-text"><div class="title">Handcrafted Quality</div><div class="sub">Unique jewelry & prints</div></div></div>
        <div class="feature-item"><div class="feature-icon"><i class="fas fa-headset"></i></div><div class="feature-text"><div class="title">Dedicated Support</div><div class="sub">We're here to help you</div></div></div>
        <div class="feature-item"><div class="feature-icon"><i class="fas fa-shield-alt"></i></div><div class="feature-text"><div class="title">Secure Payment</div><div class="sub">100% safe checkout</div></div></div>
        <div class="feature-item"><div class="feature-icon"><i class="fas fa-map-marker-alt"></i></div><div class="feature-text"><div class="title">Based in NJ, USA</div><div class="sub">Shipping nationwide</div></div></div>
        <div class="feature-item"><div class="feature-icon"><i class="fas fa-medal"></i></div><div class="feature-text"><div class="title">100% Satisfaction</div><div class="sub">We'll make it right</div></div></div>
      </div>
    </div>

    <!-- Social Proof Stats Bar -->
    <div id="stats-bar" style="background:var(--primary);color:#fff;padding:18px 0"></div>

    <!-- Collections Split -->
    <div class="section">
      <div class="container">
        <div class="text-center mb-16">
          <div style="font-size:.78rem;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:var(--gold);margin-bottom:8px">Our Collections</div>
          <h2 class="section-title" style="font-family:Georgia,serif">Shop by Category</h2>
          <p class="section-subtitle">Discover handcrafted jewelry and custom printed clothing — each piece tells a story</p>
        </div>
        <div id="collections-grid"><div class="spinner"></div></div>
      </div>
    </div>

    <!-- Featured Products -->
    <div class="section" style="background:var(--card)">
      <div class="container">
        <div class="flex-between mb-16">
          <div>
            <div style="font-size:.78rem;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:var(--gold);margin-bottom:6px">Handpicked For You</div>
            <h2 class="section-title" style="font-family:Georgia,serif;margin-bottom:0">Featured Products</h2>
          </div>
          <a href="/products" data-link class="btn btn-outline">View All <i class="fas fa-arrow-right"></i></a>
        </div>
        <div id="featured-products" class="grid-4"><div class="spinner"></div></div>
      </div>
    </div>

    <!-- Gifts by Occasion -->
    <div class="section">
      <div class="container">
        <div class="text-center mb-16">
          <div style="font-size:.78rem;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:var(--gold);margin-bottom:8px">Shop by Moment</div>
          <h2 class="section-title" style="font-family:Georgia,serif">Gifts for Every Occasion</h2>
          <p class="section-subtitle">Find the perfect piece for life's special moments</p>
        </div>
        <div class="occasion-grid">
          <a href="/jewelry" data-link class="occasion-card" style="background:linear-gradient(135deg,#1D5C4A,#0e2d23)">
            <div class="oc-icon">💍</div>
            <div class="oc-title">Wedding & Bridal</div>
            <div class="oc-sub">Necklaces, bangles & sets</div>
          </a>
          <a href="/jewelry" data-link class="occasion-card" style="background:linear-gradient(135deg,#b45309,#78350f)">
            <div class="oc-icon">🪔</div>
            <div class="oc-title">Diwali Picks</div>
            <div class="oc-sub">Festive jewelry & gifts</div>
          </a>
          <a href="/jewelry" data-link class="occasion-card" style="background:linear-gradient(135deg,#6b21a8,#3b0764)">
            <div class="oc-icon">🎁</div>
            <div class="oc-title">Birthday Gifts</div>
            <div class="oc-sub">Something special for her</div>
          </a>
          <a href="/custom-printing" data-link class="occasion-card" style="background:linear-gradient(135deg,#1565c0,#0d3e7a)">
            <div class="oc-icon">👕</div>
            <div class="oc-title">Custom Prints</div>
            <div class="oc-sub">Personalized for anyone</div>
          </a>
        </div>
      </div>
    </div>

    <!-- About Banner -->
    <div class="section" style="padding:0">
      <div class="about-banner-grid" style="display:grid;min-height:440px">
        <!-- Left: branded logo panel with decorative bg -->
        <div style="background:linear-gradient(145deg,#0e2d23 0%,#1D5C4A 60%,#133d31 100%);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:48px 40px;position:relative;overflow:hidden">
          <!-- Decorative rings -->
          <div style="position:absolute;width:400px;height:400px;border-radius:50%;border:1px solid rgba(196,154,34,.1);top:50%;left:50%;transform:translate(-50%,-50%)"></div>
          <div style="position:absolute;width:310px;height:310px;border-radius:50%;border:1px solid rgba(196,154,34,.2);top:50%;left:50%;transform:translate(-50%,-50%)"></div>
          <div style="position:absolute;width:220px;height:220px;border-radius:50%;border:2px solid rgba(196,154,34,.4);top:50%;left:50%;transform:translate(-50%,-50%)"></div>
          <!-- Logo centered inside smallest ring with solid white backdrop -->
          <div style="position:relative;z-index:1;width:190px;height:190px;border-radius:50%;background:#FFF8EE;box-shadow:0 0 0 6px rgba(196,154,34,.35),0 8px 32px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;">
            <img src="/images/logo-main.png" alt="Adhya Shakti Shop"
              style="width:170px;height:170px;object-fit:contain;"
              data-csp-onerror="this.outerHTML='<div style=\'font-family:Georgia,serif;text-align:center\'><div style=\'font-size:2rem;font-weight:800;color:#1D5C4A\'>Adhya</div><div style=\'font-size:2rem;font-weight:800;color:#C49A22\'>Shakti</div></div>'" />
          </div>
        </div>
        <!-- Right: story text -->
        <div style="background:#0e2d23;display:flex;flex-direction:column;justify-content:center;padding:60px 48px;border-left:1px solid rgba(255,255,255,.06)">
          <div style="font-size:.75rem;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:var(--gold);margin-bottom:16px">Our Story</div>
          <h2 style="font-size:1.85rem;font-weight:800;color:#fff;font-family:Georgia,serif;line-height:1.25;margin-bottom:16px">Crafted with Passion, Rooted in Heritage</h2>
          <p style="color:rgba(255,255,255,.78);line-height:1.85;margin-bottom:16px;font-size:.95rem">At Adhya Shakti Shop, we celebrate artistry in every form. Our handcrafted jewelry collection draws inspiration from timeless Indian heritage — each piece designed to make you feel beautiful and connected.</p>
          <p style="color:rgba(255,255,255,.78);line-height:1.85;margin-bottom:24px;font-size:.95rem">We also bring your vision to life through custom printing — <span style="color:var(--gold);font-weight:600">t-shirts, polo shirts, and hoodies</span>. Whatever you imagine, we print it. Every customization, every size, made just for you — right here in New Jersey, USA.</p>
          <a href="/about" data-link class="btn btn-primary" style="width:fit-content"><i class="fas fa-heart"></i> Our Story</a>
        </div>
      </div>
    </div>

    <!-- Testimonials -->
    <div class="section" style="background:var(--bg)">
      <div class="container">
        <div class="text-center mb-16">
          <div style="font-size:.78rem;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:var(--gold);margin-bottom:8px">Happy Customers</div>
          <h2 class="section-title" style="font-family:Georgia,serif">What They Say</h2>
        </div>
        <div class="grid-3" id="testimonials"></div>
      </div>
    </div>

    <!-- Recently Viewed -->
    <div id="recently-viewed-wrap" style="display:none">
      <div class="section" style="background:var(--card)">
        <div class="container">
          <div class="flex-between mb-16">
            <div>
              <div style="font-size:.78rem;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:var(--gold);margin-bottom:6px">Your History</div>
              <h2 class="section-title" style="font-family:Georgia,serif;margin-bottom:0">Recently Viewed</h2>
            </div>
          </div>
          <div id="recently-viewed-grid" class="grid-4"></div>
        </div>
      </div>
    </div>

    <!-- Follow Us on Instagram -->
    <div style="background:#0e2d23;padding:clamp(32px,8vw,56px) 0">
      <div class="container" style="text-align:center">
        <div style="font-size:.78rem;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:var(--gold);margin-bottom:12px">Stay Connected</div>
        <h2 style="font-size:clamp(1.4rem,6vw,1.85rem);font-weight:800;color:#fff;font-family:Georgia,serif;margin-bottom:12px">Follow Us on Instagram</h2>
        <p style="color:rgba(255,255,255,.68);max-width:440px;margin:0 auto 36px;line-height:1.8;font-size:.92rem">Discover our latest jewelry pieces and custom prints. Tag us in your photos!</p>
        <div style="display:flex;gap:20px;justify-content:center;flex-wrap:wrap">
          <a href="https://www.instagram.com/adhyashaktijewelry?igsh=MXZkbDQ2cnNhNGhrbw==" target="_blank" rel="noopener noreferrer" class="insta-card">
            <i class="fab fa-instagram" style="font-size:2.2rem;color:#e1306c"></i>
            <div>
              <div style="color:#fff;font-weight:700;font-size:.95rem">@adhyashaktijewelry</div>
              <div style="color:rgba(255,255,255,.48);font-size:.76rem;margin-top:4px">Handcrafted Jewelry</div>
            </div>
            <div style="background:linear-gradient(45deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888);color:#fff;border-radius:20px;padding:6px 18px;font-size:.8rem;font-weight:700;letter-spacing:.3px">Follow</div>
          </a>
          <a href="https://www.instagram.com/adhyashaktiprinting" target="_blank" rel="noopener noreferrer" class="insta-card">
            <i class="fab fa-instagram" style="font-size:2.2rem;color:#e1306c"></i>
            <div>
              <div style="color:#fff;font-weight:700;font-size:.95rem">@adhyashaktiprinting</div>
              <div style="color:rgba(255,255,255,.48);font-size:.76rem;margin-top:4px">Custom Printing</div>
            </div>
            <div style="background:linear-gradient(45deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888);color:#fff;border-radius:20px;padding:6px 18px;font-size:.8rem;font-weight:700;letter-spacing:.3px">Follow</div>
          </a>
        </div>
      </div>
    </div>
  </div>`;

  // Fetch all data in parallel
  const [slidersRes, statsRes, catsRes, productsRes, reviewsRes, clothingCsRes, clothingTreeRes] = await Promise.allSettled([
    api.get('/sliders'),
    api.get('/stats/public'),
    api.get('/category-tree'),
    api.get('/products?per_page=5&sort=discount'),
    api.get('/reviews/featured'),
    clothingComingSoon(),
    api.get('/category-tree'),
  ]);
  if (Router.stale(_gen)) return;
  const isClothingComingSoon = clothingCsRes.status === 'fulfilled' ? clothingCsRes.value : true;

  // Hero slider
  renderSlider(slidersRes.status === 'fulfilled' ? slidersRes.value : []);

  // Social proof stats bar
  if (statsRes.status === 'fulfilled') {
    const stats = statsRes.value;
    document.getElementById('stats-bar').innerHTML = `
      <div class="container">
        <div style="display:flex;align-items:center;justify-content:center;gap:32px;flex-wrap:wrap;text-align:center">
          <div style="display:flex;align-items:center;gap:10px">
            <i class="fas fa-box" style="font-size:1.3rem;color:rgba(255,255,255,.7)"></i>
            <span style="font-size:1.05rem;font-weight:700">${stats.orders_shipped}+</span>
            <span style="color:rgba(255,255,255,.8);font-size:.92rem">orders shipped</span>
          </div>
          <div style="width:1px;height:28px;background:rgba(255,255,255,.25)"></div>
          <div style="display:flex;align-items:center;gap:10px">
            <i class="fas fa-smile" style="font-size:1.3rem;color:rgba(255,255,255,.7)"></i>
            <span style="font-size:1.05rem;font-weight:700">${stats.happy_customers}+</span>
            <span style="color:rgba(255,255,255,.8);font-size:.92rem">happy customers</span>
          </div>
          <div style="width:1px;height:28px;background:rgba(255,255,255,.25)"></div>
          <div style="display:flex;align-items:center;gap:10px">
            <i class="fas fa-medal" style="font-size:1.3rem;color:rgba(255,255,255,.7)"></i>
            <span style="color:rgba(255,255,255,.8);font-size:.92rem">100% Satisfaction Guaranteed</span>
          </div>
        </div>
      </div>`;
  } else {
    document.getElementById('stats-bar').style.display = 'none';
  }

  // Collection panels
  const panelCfg = {
    Clothing: { label: 'Clothing',        img: '/images/panel-clothing.png', sub: 'Ready-made printed apparel for every style' },
    Custom:   { label: 'Custom Printing', img: '/images/panel-custom.png',   sub: 'Personalized items made exactly the way you want them' },
    'Custom Clothing': { label: 'Custom Clothing', img: '/images/panel-custom.png', sub: 'Custom t-shirts, polos and hoodies' },
    Jewelry:  { label: 'Jewelry',         img: '/images/hero-jewelry.png', sub: 'Handcrafted pieces inspired by Indian heritage' },
    Other:    { label: 'Other',           img: '/images/panel-custom.png', sub: 'Aprons, bags, caps, mugs, tumblers and more' },
  };
  const makePanel = (key, dest, extraStyle = '', comingSoon = false) => {
    const cfg = panelCfg[key];
    return `
      <div class="collection-panel" data-csp-onclick="Router.navigate('${dest}')" style="${extraStyle}">
        <img src="${cfg.img}" alt="${cfg.label}" loading="eager" data-csp-onerror="this.style.display='none'" />
        <div class="collection-panel-overlay">
          <div style="font-size:.68rem;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:var(--gold);margin-bottom:10px">Adhya Shakti Shop</div>
          <div style="font-size:clamp(1.6rem,7vw,2.4rem);font-weight:800;color:#fff;font-family:Georgia,serif;line-height:1.1;margin-bottom:10px;overflow-wrap:break-word;word-break:break-word">${cfg.label}</div>
          <div style="width:40px;height:3px;background:var(--gold);border-radius:2px;margin-bottom:12px"></div>
          <div style="font-size:.92rem;color:rgba(255,255,255,.82);margin-bottom:22px;line-height:1.5">${cfg.sub}</div>
          <div style="display:inline-flex;align-items:center;gap:8px;background:var(--gold);color:#1a1a1a;font-weight:700;font-size:.85rem;padding:10px 22px;border-radius:30px;width:fit-content;letter-spacing:.3px">
            ${comingSoon ? 'Coming Soon' : 'Shop Now'} &nbsp;<i class="fas ${comingSoon ? 'fa-clock' : 'fa-arrow-right'}"></i>
          </div>
        </div>
      </div>`;
  };
  const makeDynamicClothingPanel = (type, comingSoon = false, dest = '', extraStyle = '') => {
    const cfg = panelCfg[type.name] || {};
    const custom = /custom|print/i.test(type.name);
    const jewelry = /jewel/i.test(type.name);
    const img = cfg.img || (jewelry ? '/images/hero-jewelry.png' : custom ? '/images/panel-custom.png' : '/images/panel-clothing.png');
    const kids = categoryChildren(type).length;
    const sub = cfg.sub || `${kids} active categor${kids === 1 ? 'y' : 'ies'} ready to shop`;
    return `
      <div class="collection-panel" data-csp-onclick="Router.navigate('${dest || ('/products?category=' + type.id)}')" style="${extraStyle}">
        <img src="${img}" alt="${esc(type.name)}" loading="eager" data-csp-onerror="this.style.display='none'" />
        <div class="collection-panel-overlay">
          <div style="font-size:.68rem;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:var(--gold);margin-bottom:10px">Adhya Shakti Shop</div>
          <div style="font-size:clamp(1.6rem,7vw,2.4rem);font-weight:800;color:#fff;font-family:Georgia,serif;line-height:1.1;margin-bottom:10px;overflow-wrap:break-word;word-break:break-word">${esc(type.name)}</div>
          <div style="width:40px;height:3px;background:var(--gold);border-radius:2px;margin-bottom:12px"></div>
          <div style="font-size:.92rem;color:rgba(255,255,255,.82);margin-bottom:22px;line-height:1.5">${esc(sub)}</div>
          <div style="display:inline-flex;align-items:center;gap:8px;background:var(--gold);color:#1a1a1a;font-weight:700;font-size:.85rem;padding:10px 22px;border-radius:30px;width:fit-content;letter-spacing:.3px">
            ${comingSoon ? 'Coming Soon' : 'Shop Now'} &nbsp;<i class="fas ${comingSoon ? 'fa-clock' : 'fa-arrow-right'}"></i>
          </div>
        </div>
      </div>`;
  };
  if (catsRes.status === 'fulfilled') {
    const categoryTree = catsRes.value;
    const roots = activeCategoryTree(categoryTree);
    const topPanels = roots.map(t => {
      const cnt = categorySubtreeCount(t);
      const featured = /clothing|custom/i.test(t.name);
      if (cnt === 0 && !featured) return '';   // hide empty non-featured (e.g. "Other")
      const comingSoon = cnt === 0;
      const dest = comingSoon
        ? (/custom/i.test(t.name) ? '/custom-printing' : /clothing/i.test(t.name) ? '/clothing' : `/products?category=${t.id}`)
        : `/products?category=${t.id}`;
      return makeDynamicClothingPanel(t, comingSoon, dest);
    }).join('');
    document.getElementById('collections-grid').innerHTML = `
      <div class="collection-split" style="margin-bottom:24px">${topPanels}</div>`;
  } else {
    document.getElementById('collections-grid').innerHTML = '';
  }

  // Featured products — top 5 by discount
  if (productsRes.status === 'fulfilled') {
    const { products } = productsRes.value;
    document.getElementById('featured-products').innerHTML = products.length
      ? products.map(productCard).join('')
      : '<div class="empty-state" style="grid-column:1/-1"><i class="fas fa-box-open"></i><h3>Products coming soon!</h3><p>Check back shortly.</p></div>';
  } else {
    document.getElementById('featured-products').innerHTML = '<div class="empty-state" style="grid-column:1/-1"><i class="fas fa-box-open"></i><h3>Products coming soon!</h3></div>';
  }

  // Testimonials
  if (reviewsRes.status === 'fulfilled') {
    const reviews = reviewsRes.value;
    if (reviews.length) {
      document.getElementById('testimonials').innerHTML = reviews.map(r => `
        <div class="card">
          <div class="card-body">
            <div style="color:var(--gold);font-size:1rem;margin-bottom:12px">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</div>
            <p style="color:#444;line-height:1.8;margin-bottom:16px;font-style:italic">"${esc(r.comment)}"</p>
            <div style="display:flex;align-items:center;gap:10px">
              <div style="width:36px;height:36px;border-radius:50%;background:var(--primary);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:.9rem;flex-shrink:0">${esc(r.user_name[0].toUpperCase())}</div>
              <div>
                <div style="font-weight:700;font-size:.9rem">${esc(r.user_name.split(' ')[0])}</div>
                <div style="font-size:.78rem;color:var(--text-light)">${esc(r.product_name)}</div>
              </div>
            </div>
          </div>
        </div>`).join('');
    } else {
      document.getElementById('testimonials').innerHTML = `
        <div style="grid-column:1/-1;text-align:center;padding:32px 16px;color:var(--text-light)">
          <i class="fas fa-star" style="font-size:2rem;color:var(--gold);display:block;margin-bottom:12px"></i>
          <p style="margin:0">Reviews from our customers will appear here. Be the first to <a href="/products" data-link style="color:var(--primary)">shop &amp; review</a>!</p>
        </div>`;
    }
  } else {
    document.getElementById('testimonials').innerHTML = '';
  }

  // Recently viewed (localStorage)
  const rv = (() => { try { return JSON.parse(localStorage.getItem('recently_viewed') || '[]'); } catch { return []; } })();
  if (rv.length) {
    document.getElementById('recently-viewed-grid').innerHTML = rv.slice(0, 4).map(productCard).join('');
    document.getElementById('recently-viewed-wrap').style.display = '';
  }
});

function renderSlider(sliders) {
  const fallback = [
    { title: 'Handcrafted Jewelry', subtitle: 'Timeless pieces inspired by Indian heritage — crafted for the modern woman', link: '/products' },
    { title: 'Custom Printed Clothing', subtitle: 'Wear your story. Premium quality prints on every garment', link: '/products' },
    { title: 'New Arrivals', subtitle: 'Fresh designs added regularly — be the first to shop', link: '/products' },
  ];
  const data = sliders.length ? sliders : fallback;
  const bgs = [
    '/images/hero-jewelry.png',
    '/images/hero-clothing.png',
    '/images/hero-combined.png',
  ];

  document.getElementById('hero-section').innerHTML = `
    <div class="hero-slider">
      <div class="slider-track" id="slider-track">
        ${data.map((s, i) => `
          <div class="slide" style="background:none;padding:0;position:relative">
            <img src="${s.image_url || bgs[i % bgs.length]}" alt="${s.title}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover" loading="${i===0?'eager':'lazy'}" data-csp-onerror="this.style.background='linear-gradient(135deg,#1D5C4A,#0e2d23)';this.style.display='none'" />
            <div style="position:absolute;inset:0;background:linear-gradient(to right,rgba(14,45,35,.88) 0%,rgba(14,45,35,.55) 55%,rgba(14,45,35,.1) 100%)"></div>
            <div style="position:relative;z-index:1;height:100%;display:flex;align-items:center;padding:0 clamp(16px,5vw,80px)">
              <div style="max-width:560px">
                <div class="slide-label">Adhya Shakti Shop</div>
                <h1 class="slide-title" style="font-family:Georgia,serif">${s.title || 'Welcome to Adhya Shakti'}</h1>
                <p class="slide-subtitle">${s.subtitle || ''}</p>
                <div style="display:flex;gap:12px;flex-wrap:wrap">
                  <a href="${s.link || '/products'}" data-link class="btn btn-primary btn-lg">Shop Now <i class="fas fa-arrow-right"></i></a>
                  <a href="/about" data-link class="btn btn-lg" style="background:rgba(255,255,255,.15);color:#fff;border:2px solid rgba(255,255,255,.4);-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px)">Our Story</a>
                </div>
              </div>
            </div>
          </div>`).join('')}
      </div>
      <button class="slider-arrow prev" id="slider-prev" aria-label="Previous slide"><i class="fas fa-chevron-left"></i></button>
      <button class="slider-arrow next" id="slider-next" aria-label="Next slide"><i class="fas fa-chevron-right"></i></button>
      <div class="slider-dots">${data.map((_, i) => `<button class="slider-dot ${i===0?'active':''}" data-index="${i}"></button>`).join('')}</div>
    </div>`;

  let cur = 0;
  const goSlide = (n) => {
    cur = (n + data.length) % data.length;
    document.getElementById('slider-track').style.transform = `translateX(-${cur * 100}%)`;
    document.querySelectorAll('.slider-dot').forEach((d, i) => d.classList.toggle('active', i === cur));
  };
  const slideBy = (d) => goSlide(cur + d);
  document.getElementById('slider-prev').addEventListener('click', () => slideBy(-1));
  document.getElementById('slider-next').addEventListener('click', () => slideBy(1));
  document.querySelectorAll('.slider-dot').forEach(btn =>
    btn.addEventListener('click', () => goSlide(+btn.dataset.index))
  );

  // Touch-swipe support
  const track = document.getElementById('slider-track');
  let touchStartX = 0, touchDeltaX = 0, dragging = false;
  track.addEventListener('touchstart', e => {
    touchStartX = e.touches[0].clientX; dragging = true;
    track.style.transition = 'none';
    clearInterval(auto);
  }, { passive: true });
  track.addEventListener('touchmove', e => {
    if (!dragging) return;
    touchDeltaX = e.touches[0].clientX - touchStartX;
    track.style.transform = `translateX(calc(-${cur * 100}% + ${touchDeltaX}px))`;
  }, { passive: true });
  track.addEventListener('touchend', () => {
    dragging = false;
    track.style.transition = '';
    if (Math.abs(touchDeltaX) > 40) slideBy(touchDeltaX < 0 ? 1 : -1);
    else goSlide(cur);
    touchDeltaX = 0;
    if (!document.getElementById('slider-track')) return;
    auto = setInterval(() => {
      if (!document.getElementById('slider-track')) { clearInterval(auto); return; }
      slideBy(1);
    }, 5000);
  });

  let auto = setInterval(() => {
    // Guard: stop the interval if the slider element is gone (user navigated away)
    if (!document.getElementById('slider-track')) { clearInterval(auto); return; }
    slideBy(1);
  }, 5000);
  document.getElementById('hero-section').addEventListener('mouseenter', () => clearInterval(auto));
  document.getElementById('hero-section').addEventListener('mouseleave', () => {
    if (!document.getElementById('slider-track')) return;
    auto = setInterval(() => {
      if (!document.getElementById('slider-track')) { clearInterval(auto); return; }
      slideBy(1);
    }, 5000);
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.getElementById('slider-track')) return;
    if (document.hidden) {
      clearInterval(auto);
    } else {
      auto = setInterval(() => {
        if (!document.getElementById('slider-track')) { clearInterval(auto); return; }
        slideBy(1);
      }, 5000);
    }
  });
}
