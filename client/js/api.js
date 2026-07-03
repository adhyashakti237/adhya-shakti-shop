const API_BASE = '/api';
const CSRF_COOKIE = 'adhya_csrf';
const CSRF_HEADER = 'X-CSRF-Token';
let csrfToken = null;
let csrfPromise = null;

function readCookie(name) {
  return document.cookie
    .split('; ')
    .find(row => row.startsWith(name + '='))
    ?.split('=')
    .slice(1)
    .join('=') || '';
}

function isUnsafeMethod(method) {
  return !['GET', 'HEAD', 'OPTIONS'].includes(String(method || 'GET').toUpperCase());
}

async function getCsrfToken() {
  const cookieToken = decodeURIComponent(readCookie(CSRF_COOKIE));
  if (cookieToken) {
    csrfToken = cookieToken;
    return csrfToken;
  }
  if (!csrfPromise) {
    csrfPromise = fetch(`${API_BASE}/auth/csrf`, { credentials: 'same-origin' })
      .then(async res => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.csrf_token) throw new Error(data.error || 'Security token could not be created');
        csrfToken = data.csrf_token;
        return csrfToken;
      })
      .finally(() => { csrfPromise = null; });
  }
  return csrfPromise;
}

function clearCsrfToken() {
  csrfToken = null;
  csrfPromise = null;
  document.cookie = `${CSRF_COOKIE}=; Max-Age=0; path=/; SameSite=Lax`;
}

async function apiFetch(path, options = {}) {
  localStorage.removeItem('token');
  const retryingCsrf = !!options._retriedCsrf;
  const fetchOptions = { ...options };
  delete fetchOptions._retriedCsrf;
  const method = String(options.method || 'GET').toUpperCase();
  const headers = { 'Content-Type': 'application/json', ...fetchOptions.headers };
  if (isUnsafeMethod(method)) headers[CSRF_HEADER] = await getCsrfToken();
  const res = await fetch(`${API_BASE}${path}`, { ...fetchOptions, headers, credentials: 'same-origin' });
  let data;
  try { data = await res.json(); } catch { data = {}; }
  if (res.status === 403 && /security check failed/i.test(data.error || '')) {
    clearCsrfToken();
    if (isUnsafeMethod(method) && !retryingCsrf) {
      return apiFetch(path, { ...fetchOptions, _retriedCsrf: true });
    }
  }
  // Cookie session expired or was invalidated by a password change elsewhere.
  if (res.status === 401 && /session expired|invalid token|token required/i.test(data.error || '')) {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    if (typeof Router !== 'undefined' && !location.pathname.includes('login')) {
      Router.navigate(location.pathname.startsWith('/admin') ? '/admin/login' : '/login');
    }
  }
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

const api = {
  get: (path) => apiFetch(path),
  post: (path, body) => apiFetch(path, { method: 'POST', body: JSON.stringify(body) }),
  put: (path, body) => apiFetch(path, { method: 'PUT', body: JSON.stringify(body) }),
  del: (path) => apiFetch(path, { method: 'DELETE' }),

  form: async (path, formData) => {
    localStorage.removeItem('token');
    const csrf = await getCsrfToken();
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { [CSRF_HEADER]: csrf },
      body: formData,
      credentials: 'same-origin'
    });
    let data;
    try { data = await res.json(); } catch { data = {}; }
    if (res.status === 403 && /security check failed/i.test(data.error || '')) clearCsrfToken();
    if (res.status === 401 && /session expired|invalid token|token required/i.test(data.error || '')) {
      localStorage.removeItem('user');
      if (typeof Router !== 'undefined' && !location.pathname.includes('login')) {
        Router.navigate(location.pathname.startsWith('/admin') ? '/admin/login' : '/login');
      }
    }
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  },

  upload: async (file) => {
    localStorage.removeItem('token');
    const fd = new FormData();
    fd.append('file', file);
    const csrf = await getCsrfToken();
    const res = await fetch(`${API_BASE}/upload`, {
      method: 'POST',
      headers: { [CSRF_HEADER]: csrf },
      body: fd,
      credentials: 'same-origin'
    });
    let data;
    try { data = await res.json(); } catch { data = {}; }
    if (res.status === 403 && /security check failed/i.test(data.error || '')) clearCsrfToken();
    if (res.status === 401 && /session expired|invalid token|token required/i.test(data.error || '')) {
      localStorage.removeItem('user');
      if (typeof Router !== 'undefined' && !location.pathname.includes('login')) {
        Router.navigate(location.pathname.startsWith('/admin') ? '/admin/login' : '/login');
      }
    }
    if (!res.ok) throw new Error(data.error || `Upload failed (${res.status})`);
    return data;
  }
};
