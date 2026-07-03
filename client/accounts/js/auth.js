const Auth = {
  user(){
    try { return JSON.parse(localStorage.getItem('user')); }   // shared shop user
    catch(e){ return null; }
  },
  isLoggedIn(){ return !!Auth.user(); },
  role(){ const u = Auth.user(); return u ? u.role : null; },
  isAdmin(){ return Auth.role() === 'admin'; },
  // Bookkeeping is back-office only — customers must never be here.
  isStaffOrAdmin(){ return Auth.role() === 'admin' || Auth.role() === 'staff'; },

  async login(email, password){
    const d = await API.post('/api/auth/login', { email, password, portal: 'staff' });
    API.setAuth(d.user);
    return d.user;
  },
  logout(){
    try { API.post('/api/auth/logout', {}).catch(() => {}); } catch(e){}
    API.clear();
    // Hand back to the shop's admin login.
    location.href = '/admin';
  },
};
