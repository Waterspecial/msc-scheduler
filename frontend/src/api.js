const BASE = '/api';

function getToken() {
  return localStorage.getItem('token');
}

function authHeaders(hasBody = false) {
  const headers = { 'Authorization': `Bearer ${getToken()}` };
  if (hasBody) headers['Content-Type'] = 'application/json';
  return headers;
}

async function request(method, path, body) {
  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers: authHeaders(!!body),
      body: body ? JSON.stringify(body) : undefined
    });
  } catch {
    throw new Error('Cannot reach server. Is the backend running on port 3001?');
  }

  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error(`Server returned non-JSON response (status ${res.status})`);
  }

  if (res.status === 401) {
    localStorage.removeItem('token');
    localStorage.removeItem('agencyName');
    window.location.href = '/login';
    throw new Error('Session expired. Please log in again.');
  }
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export const api = {
  register: (name, email, password) => request('POST', '/agencies/register', { name, email, password }),
  login:    (email, password)        => request('POST', '/auth/login',        { email, password }),

  getWorkers:      ()         => request('GET',    '/workers'),
  createWorker:    (body)     => request('POST',   '/workers', body),
  updateWorker:    (id, body) => request('PUT',    `/workers/${id}`, body),
  deleteWorker:    (id)       => request('DELETE', `/workers/${id}`),
  addAvailability: (id, body) => request('POST',   `/workers/${id}/availability`, body),

  getShifts:   ()         => request('GET',    '/shifts'),
  createShift: (body)     => request('POST',   '/shifts', body),
  updateShift: (id, body) => request('PUT',    `/shifts/${id}`, body),
  deleteShift: (id)       => request('DELETE', `/shifts/${id}`),

  generateSchedule: (algorithm) => request('POST', '/schedule/generate', { algorithm }),
  getSchedule:      (id)        => request('GET',  `/schedule/${id}`),
  getMetrics:       (id)        => request('GET',  `/schedule/${id}/metrics`),
};
