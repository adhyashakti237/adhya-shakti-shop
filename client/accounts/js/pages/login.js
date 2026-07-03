window.Pages = window.Pages || {};

Pages.login = function(){
  document.getElementById('app').innerHTML = `
    <div class="center-card">
      <div class="card card-pad login-card">
        <div class="login-logo">
          <div class="mark">Adhya <b>Shakti</b></div>
          <small>Accounts &amp; Inventory</small>
        </div>
        <div id="loginErr" class="form-err" style="display:none"></div>
        <form id="loginForm" novalidate>
          <div class="field">
            <label>Email</label>
            <input class="input" type="email" id="email" autocomplete="username" placeholder="you@adhyashakti.com" required>
          </div>
          <div class="field">
            <label>Password</label>
            <input class="input" type="password" id="password" autocomplete="current-password" placeholder="••••••••" required>
          </div>
          <button class="btn btn-primary btn-block" type="submit" id="loginBtn">Log in</button>
        </form>
      </div>
    </div>`;

  document.getElementById('loginForm').onsubmit = async e => {
    e.preventDefault();
    const btn = document.getElementById('loginBtn');
    const err = document.getElementById('loginErr');
    err.style.display = 'none';
    btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>';
    try {
      await Auth.login(document.getElementById('email').value.trim(), document.getElementById('password').value);
      Router.navigate('/');
    } catch(ex){
      err.textContent = ex.message;
      err.style.display = 'block';
      btn.disabled = false; btn.textContent = 'Log in';
    }
  };
};
