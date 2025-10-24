import axios from 'axios';
import { API_BASE_URL } from '../config';

// Include credentials so cookie-based sessions work in dev/prod
const api = axios.create({ baseURL: API_BASE_URL, timeout: 10000, withCredentials: true });

// Attach bearer token if present (fallback for cross-origin dev where cookies are restricted)
api.interceptors.request.use((config) => {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const t = window.localStorage.getItem('admin_token');
      if (t) {
        config.headers = config.headers || {};
        config.headers['Authorization'] = `Bearer ${t}`;
      }
    }
  } catch {}
  return config;
});

// Auth
export const login = (username, password) => api.post('/auth/login', { username, password }).then(r => r.data);
export const me = () => api.get('/auth/me').then(r => r.data);
export const logout = () => api.post('/auth/logout').then(r => r.data);

// Seminars
export const listSeminars = (scope='all') => api.get('/seminars', { params: { scope } }).then(r => r.data);
export const createSeminar = (data) => api.post('/seminars', data).then(r => r.data);
export const updateSeminar = (id, data) => api.put(`/seminars/${id}`, data).then(r => r.data);
export const deleteSeminar = (id) => api.delete(`/seminars/${id}`).then(r => r.data);
export const inviteSeminar = (id, recipients) => api.post(`/seminars/${id}/invite`, { recipients }).then(r => r.data);

// Requests
export const listRequests = (status) => api.get('/requests', { params: status ? { status } : undefined }).then(r => r.data);
export const createRequest = (data) => api.post('/requests', data).then(r => r.data);
export const updateRequest = (id, data) => api.put(`/requests/${id}`, data).then(r => r.data);
export const approveRequest = (id) => api.post(`/requests/${id}/approve`).then(r => r.data);
export const rejectRequest = (id) => api.post(`/requests/${id}/reject`).then(r => r.data);

export default api;
