// Tiny fetch wrapper — uses the shared shop HttpOnly session cookie, parses JSON, routes 401s to login.
// In the merged app, all bookkeeping endpoints live under /api/acc/*, while auth
// stays on the shop's /api/auth/*. accPath() maps the page calls accordingly.
function accPath(p){
  if (p.startsWith('/api/auth/')) return p;   // shop auth (shared)
  if (p.startsWith('/api/acc/')) return p;
  if (p.startsWith('/api/')) return '/api/acc/' + p.slice(5);
  return p;
}

const API = {
  CSRF_COOKIE: 'adhya_csrf',
  CSRF_HEADER: 'X-CSRF-Token',
  _csrf: null,
  _csrfPromise: null,

  cookie(name){
    return document.cookie
      .split('; ')
      .find(row => row.startsWith(name + '='))
      ?.split('=')
      .slice(1)
      .join('=') || '';
  },
  unsafe(method){ return !['GET', 'HEAD', 'OPTIONS'].includes(String(method || 'GET').toUpperCase()); },
  clearCsrf(){
    API._csrf = null;
    API._csrfPromise = null;
    document.cookie = API.CSRF_COOKIE + '=; Max-Age=0; path=/; SameSite=Lax';
  },
  async csrf(){
    const cookieToken = decodeURIComponent(API.cookie(API.CSRF_COOKIE));
    if (cookieToken) {
      API._csrf = cookieToken;
      return API._csrf;
    }
    if (!API._csrfPromise) {
      API._csrfPromise = fetch('/api/auth/csrf', { credentials: 'same-origin' })
        .then(async res => {
          const data = await res.json().catch(() => ({}));
          if (!res.ok || !data.csrf_token) throw new Error(data.error || 'Security token could not be created');
          API._csrf = data.csrf_token;
          return API._csrf;
        })
        .finally(() => { API._csrfPromise = null; });
    }
    return API._csrfPromise;
  },
  token(){ return ''; },
  setAuth(tokenOrUser, maybeUser){
    const user = maybeUser || tokenOrUser;
    localStorage.removeItem('token');
    localStorage.setItem('user', JSON.stringify(user));
  },
  clear(){ localStorage.removeItem('token'); localStorage.removeItem('user'); },

  async req(method, path, body, isForm){
    const headers = {};
    localStorage.removeItem('token');
    if (API.unsafe(method)) headers[API.CSRF_HEADER] = await API.csrf();
    const opts = { method, headers, credentials: 'same-origin' };
    if (body !== undefined && body !== null){
      if (isForm){ opts.body = body; }
      else { headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
    }
    let res;
    try { res = await fetch(accPath(path), opts); }
    catch(e){ throw new Error('Network error — is the server running?'); }
    let data = null;
    try { data = await res.json(); } catch(e){}
    if (res.status === 403 && /security check failed/i.test((data && data.error) || '')) API.clearCsrf();
    if (res.status === 401){ Auth.logout(); throw new Error((data && data.error) || 'Please log in'); }
    if (res.status === 403){ throw new Error((data && data.error) || 'You don’t have access to that'); }
    if (!res.ok){ throw new Error((data && data.error) || ('Something went wrong (' + res.status + ')')); }
    return data;
  },
  get(p){ return API.req('GET', p); },
  post(p, b){ return API.req('POST', p, b); },
  put(p, b){ return API.req('PUT', p, b); },
  del(p){ return API.req('DELETE', p); },
  postForm(p, form){ return API.req('POST', p, form, true); },
};
