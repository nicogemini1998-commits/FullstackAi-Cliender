import { useState, useEffect, createContext, useContext } from 'react'
import { auth } from '../lib/api'

const AuthCtx = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('lu_token')
    if (!token) {
      // Auto-login con credenciales demo (solo en desarrollo)
      const email = import.meta.env.VITE_DEMO_EMAIL || 'toni@cliender.com'
      const password = import.meta.env.VITE_DEMO_PASSWORD || 'Master123'
      auth.login(email, password)
        .then(r => {
          localStorage.setItem('lu_token', r.data.token)
          setUser({ email: r.data.email || email, name: r.data.name, role: r.data.role })
          setLoading(false)
        })
        .catch(() => setLoading(false))
      return
    }
    auth.me()
      .then(r => setUser(r.data))
      .catch(() => localStorage.removeItem('lu_token'))
      .finally(() => setLoading(false))
  }, [])

  const login = async (email, password) => {
    const { data } = await auth.login(email, password)
    localStorage.setItem('lu_token', data.token)
    setUser({ email, name: data.name, role: data.role })
    return data
  }

  const logout = () => {
    localStorage.removeItem('lu_token')
    setUser(null)
  }

  return <AuthCtx.Provider value={{ user, loading, login, logout }}>{children}</AuthCtx.Provider>
}

export const useAuth = () => useContext(AuthCtx)
