import { AuthProvider, useAuth } from './hooks/useAuth.jsx'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'

function AppInner() {
  const { user, loading } = useAuth()
  if (loading) return (
    <div className="min-h-screen bg-[#0a1628] flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )
  return user ? <Dashboard /> : <Login />
}

export default function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  )
}
