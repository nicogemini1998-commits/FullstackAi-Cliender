import axios from 'axios'

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:8002/api'

const api = axios.create({ baseURL: BASE })

api.interceptors.request.use(cfg => {
  const token = localStorage.getItem('lu_token')
  if (token) cfg.headers.Authorization = `Bearer ${token}`
  return cfg
})

api.interceptors.response.use(
  r => r,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('lu_token')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export const auth = {
  login: (email, password) => api.post('/auth/login', { email, password }),
  me:    () => api.get('/auth/me'),
}

export const leads = {
  today:       ()               => api.get('/leads/today'),
  stats:       ()               => api.get('/leads/today/stats'),
  updateStatus:(id, status, notes) => api.patch(`/leads/${id}/status`, { status, notes }),
  assignNow:   ()               => api.post('/leads/assign-now'),
}

export const companies = {
  list:        (params)         => api.get('/companies', { params }),
  get:         (id)             => api.get(`/companies/${id}`),
  stats:       ()               => api.get('/companies/stats'),
  updateStatus:(id, status, notes, contact_id) =>
    api.patch(`/companies/${id}/status`, { status, notes, contact_id }),
}

export const admin = {
  triggerEnrichment: (sector, city, qty) =>
    api.post('/admin/trigger-enrichment', { sector, city, qty }),
}

export default api
