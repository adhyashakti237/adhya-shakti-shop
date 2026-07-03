Router.register('/admin/login', () => {
  if (Auth.isLoggedIn() && Auth.isAdmin()) { Router.navigate('/admin'); return; }

  document.getElementById('app').innerHTML = `
    <div class="auth-wrap">
      <div class="auth-card">
        <div class="auth-logo">
          <h1 style="font-family:Georgia,serif;color:var(--primary)">Adhya <span style="color:var(--secondary)">Shakti</span></h1>
          <p>Staff &amp; Admin Sign In</p>
        </div>
        <form data-csp-onsubmit="doAdminLogin(event)">
          <div class="form-group">
            <label class="form-label">Email</label>
            <input class="form-control" id="admin-login-email" type="email" placeholder="you@example.com" required />
          </div>
          <div class="form-group">
            <label class="form-label">Password</label>
            <input class="form-control" id="admin-login-password" type="password" placeholder="••••••••" required />
          </div>
          <button class="btn btn-primary btn-block btn-lg" id="admin-login-btn">Sign In</button>
        </form>
      </div>
    </div>`;

  window.doAdminLogin = async (e) => {
    e.preventDefault();
    const btn = document.getElementById('admin-login-btn');
    btn.disabled = true; btn.textContent = 'Signing in...';
    try {
      const res = await api.post('/auth/login', {
        email: document.getElementById('admin-login-email').value,
        password: document.getElementById('admin-login-password').value,
        portal: 'staff',
      });
      Auth.login(res.token, res.user);
      toast(`Welcome back, ${res.user.name}!`, 'success');
      Router.navigate('/admin');
    } catch (err) { toast(err.message, 'error'); btn.disabled = false; btn.textContent = 'Sign In'; }
  };
});
