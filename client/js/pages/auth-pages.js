Router.register('/login', () => {
  if (Auth.isLoggedIn()) { if (Auth.isAdmin()) { location.href = '/admin'; } else { Router.navigate('/dashboard'); } return; }
  document.getElementById('app').innerHTML = `
    <div class="auth-wrap">
      <div class="auth-card">
        <div class="auth-logo"><h1 style="font-family:Georgia,serif;color:var(--primary)">Adhya <span style="color:var(--secondary)">Shakti</span></h1><p>Welcome back! Sign in to your account</p></div>
        <form data-csp-onsubmit="doLogin(event)">
          <div class="form-group">
            <label class="form-label">Email</label>
            <input class="form-control" id="login-email" type="email" placeholder="you@example.com" required />
          </div>
          <div class="form-group">
            <label class="form-label">Password</label>
            <input class="form-control" id="login-password" type="password" placeholder="••••••••" required />
          </div>
          <button class="btn btn-primary btn-block btn-lg" id="login-btn">Sign In</button>
          <div style="text-align:center;margin-top:12px"><a href="/forgot-password" data-link style="font-size:.85rem;color:var(--primary)">Forgot your password?</a></div>
        </form>
        <div class="auth-divider"><span>New here?</span></div>
        <a href="/register" data-link class="btn btn-ghost btn-block">Create an Account</a>
      </div>
    </div>`;

  window.doLogin = async (e) => {
    e.preventDefault();
    const btn = document.getElementById('login-btn');
    btn.disabled = true; btn.textContent = 'Signing in...';
    try {
      const res = await api.post('/auth/login', {
        email: document.getElementById('login-email').value,
        password: document.getElementById('login-password').value,
        portal: 'customer',
      });
      Auth.login(res.token, res.user);
      toast(`Welcome back, ${res.user.name}!`, 'success');
      Router.navigate('/dashboard');
    } catch (e) { toast(e.message, 'error'); btn.disabled = false; btn.textContent = 'Sign In'; }
  };
});

Router.register('/register', () => {
  if (Auth.isLoggedIn()) { Router.navigate('/dashboard'); return; }
  document.getElementById('app').innerHTML = `
    <div class="auth-wrap">
      <div class="auth-card">
        <div class="auth-logo"><h1 style="font-family:Georgia,serif;color:var(--primary)">Adhya <span style="color:var(--secondary)">Shakti</span></h1><p>Create your account to start shopping</p></div>
        <div class="alert alert-info" style="margin-bottom:16px">
          Create an account and we will email your one-time 10% first-order code automatically.
        </div>
        <form data-csp-onsubmit="doRegister(event)">
          <div class="form-group">
            <label class="form-label">Full Name</label>
            <input class="form-control" id="reg-name" placeholder="John Doe" required />
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Email</label>
              <input class="form-control" id="reg-email" type="email" placeholder="you@example.com" required />
            </div>
            <div class="form-group">
              <label class="form-label">Phone</label>
              <input class="form-control" id="reg-phone" type="tel" placeholder="(555) 555-5555" />
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Password</label>
            <input class="form-control" id="reg-password" type="password" placeholder="Min. 8 characters" required minlength="8" data-csp-oninput="updatePwStrength(this.value)" data-csp-onfocus="document.getElementById('pw-strength').style.display='block'" />
            <div id="pw-strength" style="display:none;margin-top:8px;padding:10px 12px;background:var(--bg);border-radius:8px;border:1px solid var(--border)">
              <div id="pw-c1" class="pw-check"><i class="fas fa-times-circle"></i> At least 8 characters</div>
              <div id="pw-c2" class="pw-check"><i class="fas fa-times-circle"></i> Uppercase letter (A–Z)</div>
              <div id="pw-c3" class="pw-check"><i class="fas fa-times-circle"></i> Lowercase letter (a–z)</div>
              <div id="pw-c4" class="pw-check"><i class="fas fa-times-circle"></i> Number (0–9)</div>
              <div id="pw-c5" class="pw-check"><i class="fas fa-times-circle"></i> Special character (!@#$…)</div>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Confirm Password</label>
            <input class="form-control" id="reg-confirm" type="password" placeholder="Repeat password" required />
          </div>
          <button class="btn btn-primary btn-block btn-lg" id="reg-btn">Create Account</button>
        </form>
        <div class="auth-divider"><span>Already have an account?</span></div>
        <a href="/login" data-link class="btn btn-ghost btn-block">Sign In</a>
      </div>
    </div>`;

  window.updatePwStrength = (pw) => {
    const checks = [
      { id: 'pw-c1', pass: pw.length >= 8 },
      { id: 'pw-c2', pass: /[A-Z]/.test(pw) },
      { id: 'pw-c3', pass: /[a-z]/.test(pw) },
      { id: 'pw-c4', pass: /[0-9]/.test(pw) },
      { id: 'pw-c5', pass: /[^A-Za-z0-9]/.test(pw) },
    ];
    checks.forEach(({ id, pass }) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.className = `pw-check ${pass ? 'pass' : 'fail'}`;
      el.querySelector('i').className = pass ? 'fas fa-check-circle' : 'fas fa-times-circle';
    });
  };

  window.doRegister = async (e) => {
    e.preventDefault();
    const pw = document.getElementById('reg-password').value;
    if (pw.length < 8) { toast('Password must be at least 8 characters', 'warning'); return; }
    if (!/[A-Z]/.test(pw)) { toast('Password must contain at least one uppercase letter', 'warning'); return; }
    if (!/[a-z]/.test(pw)) { toast('Password must contain at least one lowercase letter', 'warning'); return; }
    if (!/[0-9]/.test(pw)) { toast('Password must contain at least one number', 'warning'); return; }
    if (!/[^A-Za-z0-9]/.test(pw)) { toast('Password must contain at least one special character (e.g. !@#$)', 'warning'); return; }
    if (pw !== document.getElementById('reg-confirm').value) {
      toast('Passwords do not match', 'warning'); return;
    }
    const btn = document.getElementById('reg-btn');
    btn.disabled = true; btn.textContent = 'Creating account...';
    try {
      const res = await api.post('/auth/register', {
        name: document.getElementById('reg-name').value,
        email: document.getElementById('reg-email').value,
        phone: document.getElementById('reg-phone').value,
        password: document.getElementById('reg-password').value,
      });
      Auth.login(res.token, res.user);
      toast(res.welcome_discount?.emailed ? 'Account created. Your WELCOME10 first-order code was emailed to you.' : 'Account created successfully!', 'success');
      Router.navigate('/dashboard');
    } catch (e) { toast(e.message, 'error'); btn.disabled = false; btn.textContent = 'Create Account'; }
  };
});

Router.register('/forgot-password', () => {
  document.getElementById('app').innerHTML = `
    <div class="auth-wrap">
      <div class="auth-card">
        <div class="auth-logo"><h1 style="font-family:Georgia,serif;color:var(--primary)">Adhya <span style="color:var(--secondary)">Shakti</span></h1><p>Reset your password</p></div>
        <form data-csp-onsubmit="doForgotPassword(event)">
          <div class="form-group">
            <label class="form-label">Email Address</label>
            <input class="form-control" id="fp-email" type="email" placeholder="you@example.com" required />
            <div style="font-size:.8rem;color:var(--text-light);margin-top:6px">Enter the email you registered with and we'll send a reset link.</div>
          </div>
          <button class="btn btn-primary btn-block btn-lg" id="fp-btn">Send Reset Link</button>
        </form>
        <div class="auth-divider"><span>Remembered it?</span></div>
        <a href="/login" data-link class="btn btn-ghost btn-block">Back to Sign In</a>
      </div>
    </div>`;

  window.doForgotPassword = async (e) => {
    e.preventDefault();
    const btn = document.getElementById('fp-btn');
    btn.disabled = true; btn.textContent = 'Sending...';
    try {
      const res = await api.post('/auth/forgot-password', { email: document.getElementById('fp-email').value });
      toast(res.message, 'success');
      document.getElementById('fp-email').value = '';
    } catch (err) {
      toast(err.message || 'Something went wrong. Please try again.', 'error');
    } finally {
      btn.disabled = false; btn.textContent = 'Send Reset Link';
    }
  };
});

Router.register('/reset-password', (params) => {
  const token = params.token || '';
  if (!token) { Router.navigate('/forgot-password'); return; }
  document.getElementById('app').innerHTML = `
    <div class="auth-wrap">
      <div class="auth-card">
        <div class="auth-logo"><h1 style="font-family:Georgia,serif;color:var(--primary)">Adhya <span style="color:var(--secondary)">Shakti</span></h1><p>Set a new password</p></div>
        <form data-csp-onsubmit="doResetPassword(event)">
          <div class="form-group">
            <label class="form-label">New Password</label>
            <input class="form-control" id="rp-password" type="password" placeholder="Min. 8 characters" required minlength="8" data-csp-oninput="updateRpStrength(this.value)" data-csp-onfocus="document.getElementById('rp-strength').style.display='block'" />
            <div id="rp-strength" style="display:none;margin-top:8px;padding:10px 12px;background:var(--bg);border-radius:8px;border:1px solid var(--border)">
              <div id="rp-c1" class="pw-check"><i class="fas fa-times-circle"></i> At least 8 characters</div>
              <div id="rp-c2" class="pw-check"><i class="fas fa-times-circle"></i> Uppercase letter (A–Z)</div>
              <div id="rp-c3" class="pw-check"><i class="fas fa-times-circle"></i> Lowercase letter (a–z)</div>
              <div id="rp-c4" class="pw-check"><i class="fas fa-times-circle"></i> Number (0–9)</div>
              <div id="rp-c5" class="pw-check"><i class="fas fa-times-circle"></i> Special character (!@#$…)</div>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Confirm New Password</label>
            <input class="form-control" id="rp-confirm" type="password" placeholder="Repeat new password" required />
          </div>
          <button class="btn btn-primary btn-block btn-lg" id="rp-btn">Update Password</button>
        </form>
      </div>
    </div>`;

  window.updateRpStrength = (pw) => {
    const checks = [
      { id: 'rp-c1', pass: pw.length >= 8 },
      { id: 'rp-c2', pass: /[A-Z]/.test(pw) },
      { id: 'rp-c3', pass: /[a-z]/.test(pw) },
      { id: 'rp-c4', pass: /[0-9]/.test(pw) },
      { id: 'rp-c5', pass: /[^A-Za-z0-9]/.test(pw) },
    ];
    checks.forEach(({ id, pass }) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.className = `pw-check ${pass ? 'pass' : 'fail'}`;
      el.querySelector('i').className = pass ? 'fas fa-check-circle' : 'fas fa-times-circle';
    });
  };

  window.doResetPassword = async (e) => {
    e.preventDefault();
    const _gen = Router._gen;
    const pw = document.getElementById('rp-password').value;
    if (pw.length < 8) { toast('Password must be at least 8 characters', 'warning'); return; }
    if (!/[A-Z]/.test(pw)) { toast('Password must contain at least one uppercase letter', 'warning'); return; }
    if (!/[a-z]/.test(pw)) { toast('Password must contain at least one lowercase letter', 'warning'); return; }
    if (!/[0-9]/.test(pw)) { toast('Password must contain at least one number', 'warning'); return; }
    if (!/[^A-Za-z0-9]/.test(pw)) { toast('Password must contain at least one special character (e.g. !@#$)', 'warning'); return; }
    if (pw !== document.getElementById('rp-confirm').value) { toast('Passwords do not match', 'warning'); return; }
    const btn = document.getElementById('rp-btn');
    btn.disabled = true; btn.textContent = 'Updating...';
    try {
      const res = await api.post('/auth/reset-password', { token, password: pw });
      if (Router.stale(_gen)) return;
      toast(res.message, 'success');
      setTimeout(() => { if (!Router.stale(_gen)) Router.navigate('/login'); }, 1800);
    } catch (err) {
      if (Router.stale(_gen)) return;
      toast(err.message || 'Reset failed. Please request a new link.', 'error');
      btn.disabled = false; btn.textContent = 'Update Password';
    }
  };
});
