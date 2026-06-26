const BASE = '';

function getToken() {
  return localStorage.getItem('token');
}

function authHeaders() {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${getToken()}`
  };
}

async function request(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: authHeaders(),
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json();
  if (res.status === 401) {
    localStorage.removeItem('token');
    localStorage.removeItem('agencyName');
    window.location.href = '/login';
    return;
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
