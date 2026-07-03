const Auth = {
  getUser() {
    try { return JSON.parse(localStorage.getItem('user')); } catch { return null; }
  },
  getToken() { return null; },
  isLoggedIn() { return !!this.getUser(); },
  isAdmin() { const u = this.getUser(); return u && (u.role === 'admin' || u.role === 'staff'); },
  isStrictAdmin() { const u = this.getUser(); return u && u.role === 'admin'; },
  isStaff() { const u = this.getUser(); return u && u.role === 'staff'; },
  login(tokenOrUser, maybeUser) {
    const user = maybeUser || tokenOrUser;
    localStorage.removeItem('token');
    localStorage.setItem('user', JSON.stringify(user));
    localStorage.setItem('welcome_popup_dismissed', '1');
    try { window.Wishlist?.syncFromServer?.({ mergeLocal: true }); } catch {}
  },
  logout() {
    try { api.post('/auth/logout', {}).catch(() => {}); } catch {}
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('wishlist');
    try { window.Wishlist?.updateUI?.(); } catch {}
    Router.navigate(location.pathname.startsWith('/admin') ? '/admin/login' : '/login');
  }
};

window.Auth = Auth;
