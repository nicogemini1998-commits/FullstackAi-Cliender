import { Component } from 'react'
import { AuthProvider, useAuth } from './hooks/useAuth.jsx'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'

class ErrorBoundary extends Component {
  state = { error: null }
  static getDerivedStateFromError(e) { return { error: e } }
  render() {
    if (this.state.error) return (
      <div className="min-h-screen flex items-center justify-center px-6" style={{background:'#050508'}}>
        <div className="glass-card p-8 max-w-md text-center">
          <p className="text-lg font-bold text-white mb-2">Error inesperado</p>
          <p className="text-sm mb-4" style={{color:'rgba(255,255,255,0.45)'}}>
            {this.state.error?.message || 'Error de renderizado'}
          </p>
          <button onClick={() => { this.setState({error:null}); window.location.reload() }}
            className="glass-btn glass-btn-blue px-5 py-2.5 text-sm font-semibold">
            Recargar
          </button>
        </div>
      </div>
    )
    return this.props.children
  }
}

function AppInner() {
  const { user, loading } = useAuth()
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{background:'#050508'}}>
      <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"/>
    </div>
  )
  return user ? <Dashboard /> : <Login />
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <AppInner />
      </AuthProvider>
    </ErrorBoundary>
  )
}
