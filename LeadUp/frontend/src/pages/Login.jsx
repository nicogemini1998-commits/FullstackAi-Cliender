import { useState } from 'react'
import { useAuth } from '../hooks/useAuth.jsx'
import { Loader2, ArrowRight } from 'lucide-react'
import logo from '../assets/logo.png'

export default function Login() {
  const { login } = useAuth()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  const submit = async e => {
    e.preventDefault()
    setError(''); setLoading(true)
    try { await login(email, password) }
    catch (err) { setError(err.response?.data?.detail || 'Credenciales incorrectas') }
    finally { setLoading(false) }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="flex flex-col items-center mb-10">
          <img src={logo} alt="LeadUp" className="w-16 h-16 rounded-2xl mb-4 object-cover"
            style={{boxShadow:'0 8px 32px rgba(37,99,235,0.3)'}}/>
          <h1 className="text-2xl font-bold text-white tracking-tight">LeadUp</h1>
          <p className="text-sm mt-1" style={{color:'rgba(255,255,255,0.35)'}}>Panel de llamadas comerciales</p>
        </div>

        {/* Card */}
        <div className="glass-card p-7"
          style={{boxShadow:'0 20px 60px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.08)'}}>

          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium mb-2" style={{color:'rgba(255,255,255,0.4)'}}>
                Email
              </label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                required placeholder="comercial@cliender.com"
                className="glass-input w-full px-4 py-3 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium mb-2" style={{color:'rgba(255,255,255,0.4)'}}>
                Contraseña
              </label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                required placeholder="••••••••"
                className="glass-input w-full px-4 py-3 text-sm" />
            </div>

            {error && (
              <div className="text-xs px-4 py-3 rounded-xl"
                style={{background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.2)', color:'#f87171'}}>
                {error}
              </div>
            )}

            <button type="submit" disabled={loading}
              className="glass-btn glass-btn-blue w-full py-3 text-sm font-semibold flex items-center justify-center gap-2 mt-2">
              {loading ? <Loader2 size={15} className="animate-spin" /> : <ArrowRight size={15} />}
              {loading ? 'Entrando...' : 'Entrar al panel'}
            </button>
          </form>
        </div>

        <p className="text-center text-xs mt-8" style={{color:'rgba(255,255,255,0.15)'}}>
          FullStackAI × Cliender — {new Date().getFullYear()}
        </p>
      </div>
    </div>
  )
}
