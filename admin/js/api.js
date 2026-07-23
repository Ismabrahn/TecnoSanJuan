import { getSession, clearSession } from './auth.js';

const API_BASE = 'https://tecno-san-juan-production.cuatrinismaelabrahan.workers.dev';

function getToken() {
  const session = getSession();
  return session?.access_token || null;
}

async function apiRequest(method, path, body = null) {
  const token = getToken();
  if (!token) {
    clearSession();
    window.location.href = 'login.html';
    throw new Error('Sesión no válida');
  }

  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const res = await fetch(`${API_BASE}${path}`, options);

  if (res.status === 401) {
    clearSession();
    window.location.href = 'login.html';
    throw new Error('Sesión expirada');
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: 'Error de conexión' }));
    throw new Error(err.message || `Error: ${res.status}`);
  }

  return res.json();
}

export function adminGetAll(resource, search = '') {
  const params = search ? `?search=${encodeURIComponent(search)}` : '';
  return apiRequest('GET', `/api/admin/${resource}${params}`);
}

export function adminGetOne(resource, id) {
  return apiRequest('GET', `/api/admin/${resource}/${id}`);
}

export function adminCreate(resource, data) {
  return apiRequest('POST', `/api/admin/${resource}`, data);
}

export function adminUpdate(resource, id, data) {
  return apiRequest('PUT', `/api/admin/${resource}/${id}`, data);
}

export function adminDelete(resource, id) {
  return apiRequest('DELETE', `/api/admin/${resource}/${id}`);
}
