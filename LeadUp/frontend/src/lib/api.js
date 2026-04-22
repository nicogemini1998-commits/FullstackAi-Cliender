import axios from 'axios'

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:8002/api'

const http = axios.create({ baseURL: BASE })

http.interceptors.request.use(cfg => {
  const token = localStorage.getItem('lu_token')
  if (token) cfg.headers.Authorization = `Bearer ${token}`
  return cfg
})

http.interceptors.response.use(
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
  login: (email, password) => http.post('/auth/login', { email, password }),
  me:    () => http.get('/auth/me'),
}

export const leadsAPI = {
  today:        ()                   => http.get('/leads/today'),
  stats:        ()                   => http.get('/leads/today/stats'),
  updateStatus: (id, status, notes)  => http.patch(`/leads/${id}/status`, { status, notes }),
  saveNotes:    (id, notes)          => http.patch(`/leads/${id}/notes`, { notes }),
  assignNow:    ()                   => http.post('/leads/assign-now'),
  requestMore:  ()                   => http.post('/leads/request-more'),
}

export const companies = {
  list:         (params)             => http.get('/companies', { params }),
  get:          (id)                 => http.get(`/companies/${id}`),
  stats:        ()                   => http.get('/companies/stats'),
  updateStatus: (id, status, notes, contact_id) =>
    http.patch(`/companies/${id}/status`, { status, notes, contact_id }),
}

export const admin = {
  triggerEnrichment: (sector, city, qty) =>
    http.post('/admin/trigger-enrichment', { sector, city, qty }),
  analytics: (days) => http.get(`/admin/analytics?days=${days}`),
  toggleLeadSearch: (enabled) =>
    http.patch('/admin/lead-search-toggle', { enabled }),
}

export { http as default }
