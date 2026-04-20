import { useState, useEffect, useCallback } from 'react'
import {
  TrendingUp, CheckCircle2, XCircle, PhoneMissed, Clock,
  RefreshCw, LogOut, Loader2, Zap, ChevronLeft, ChevronRight,
  Phone, Users, BarChart3,
} from 'lucide-react'
import CompanyCard from '../components/CompanyCard'
import CompanyModal from '../components/CompanyModal'
import { leads as leadsApi, admin } from '../lib/api'
import { useAuth } from '../hooks/useAuth.jsx'

const STATUS_CONFIG = {
  total:     { label: 'Total hoy',      color: '#60a5fa', bg: 'rgba(59,130,246,0.12)'   },
  pending:   { label: 'Pendientes',     color: '#f59e0b', bg: 'rgba(245,158,11,0.12)'   },
  closed:    { label: 'Cerrados',       color: '#34d399', bg: 'rgba(16,185,129,0.12)'   },
  rejected:  { label: 'No interesados', color: '#f87171', bg: 'rgba(239,68,68,0.12)'    },
  no_answer: { label: 'Sin contestar',  color: '#9ca3af', bg: 'rgba(107,114,128,0.12)'  },
}

function ProgressBar({ stats }) {
  const total = stats.total || 1
  const done  = (stats.closed || 0) + (stats.rejected || 0) + (stats.no_answer || 0)
  const pct   = Math.round((done / total) * 100)
  return (
    <div className="glass-card p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-white">Progreso del día</span>
        <span className="text-sm font-bold" style={{color:'#34d399'}}>{pct}%</span>
      </div>
      <div className="h-2 rounded-full overflow-hidden" style={{background:'rgba(255,255,255,0.06)'}}>
        <div className="h-full rounded-full transition-all duration-500"
          style={{width:`${pct}%`, background:'linear-gradient(90deg,#3b82f6,#34d399)'}}/>
      </div>
      <div className="flex items-center justify-between mt-3 text-xs" style={{color:'rgba(255,255,255,0.4)'}}>
        <span>{done} llamadas realizadas</span>
        <span>{(stats.pending || 0)} pendientes</span>
      </div>
    </div>
  )
}

function StatPill({ value, label, color, bg }) {
  return (
    <div className="flex flex-col items-center py-3 px-4 rounded-2xl" style={{background:bg, border:`1px solid ${color}25`}}>
      <span className="text-2xl font-bold" style={{color}}>{value ?? 0}</span>
      <span className="text-xs mt-0.5" style={{color:'rgba(255,255,255,0.4)'}}>{label}</span>
    </div>
  )
}

export default function Dashboard() {
  const { user, logout } = useAuth()
  const [todayData, setTodayData] = useState({ leads: [], total: 0, pending: 0 })
  const [stats, setStats]         = useState({})
  const [loading, setLoading]     = useState(true)
  const [modalIdx, setModalIdx]   = useState(null)
  const [triggering, setTriggering] = useState(false)
  const [msg, setMsg]             = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [lr, sr] = await Promise.all([leadsApi.today(), leadsApi.stats()])
      setTodayData(lr.data)
      setStats(sr.data)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const handleAssignNow = async () => {
    setTriggering(true); setMsg('')
    try {
      await leadsApi.assignNow()
      setMsg('✅ Leads asignados')
      load()
    } catch { setMsg('❌ Error al asignar') }
    finally { setTriggering(false) }
  }

  const handleStatusChange = useCallback(async (assignmentId, status, notes = '') => {
    try {
      await leadsApi.updateStatus(assignmentId, status, notes)
      load()
    } catch (e) { console.error(e) }
  }, [load])

  const list = todayData.leads || []

  // Filtrar leads: primero pending y no_answer, luego los demás
  const pending  = list.filter(l => ['pending', 'no_answer'].includes(l.call_status))
  const done     = list.filter(l => ['closed', 'rejected'].includes(l.call_status))
  const ordered  = [...pending, ...done]

  return (
    <div className="min-h-screen">

      {/* ── Navbar ── */}
      <header className="sticky top-0 z-20"
        style={{background:'rgba(5,5,8,0.85)', backdropFilter:'blur(20px)',
          borderBottom:'1px solid rgba(255,255,255,0.05)'}}>
        <div className="max-w-6xl mx-auto px-5 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{background:'linear-gradient(135deg,rgba(59,130,246,0.5),rgba(29,78,216,0.35))',
                border:'1px solid rgba(96,165,250,0.3)',
                boxShadow:'inset 0 1px 0 rgba(255,255,255,0.2),0 4px 16px rgba(37,99,235,0.25)'}}>
              <TrendingUp size={14} className="text-white"/>
            </div>
            <span className="font-bold text-white text-sm tracking-tight">LeadUp</span>
            <span className="text-xs px-2 py-0.5 rounded-full hidden sm:inline"
              style={{background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.08)',color:'rgba(255,255,255,0.35)'}}>
              CRM
            </span>
          </div>
          <div className="flex items-center gap-2.5">
            <span className="text-xs hidden sm:block" style={{color:'rgba(255,255,255,0.35)'}}>
              {user?.name}
            </span>
            {user?.role === 'admin' && (
              <button onClick={handleAssignNow} disabled={triggering}
                className="glass-btn glass-btn-blue flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium">
                {triggering ? <Loader2 size={12} className="animate-spin"/> : <Zap size={12}/>}
                {triggering ? 'Asignando...' : 'Asignar leads'}
              </button>
            )}
            <button onClick={load} className="glass-btn glass-btn-neutral p-1.5">
              <RefreshCw size={13}/>
            </button>
            <button onClick={logout} className="glass-btn glass-btn-neutral flex items-center gap-1.5 px-2.5 py-1.5 text-xs">
              <LogOut size={12}/>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-5 py-5 space-y-4">

        {msg && (
          <div className="text-sm px-4 py-2.5 rounded-2xl"
            style={{background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.07)',color:'rgba(255,255,255,0.6)'}}>
            {msg}
          </div>
        )}

        {/* ── Stats + progreso ── */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {Object.entries(STATUS_CONFIG).map(([k, cfg]) => (
            <StatPill key={k} value={stats[k]} label={cfg.label} color={cfg.color} bg={cfg.bg}/>
          ))}
        </div>

        <ProgressBar stats={stats}/>

        {/* ── Lista leads del día ── */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="flex flex-col items-center gap-3">
              <Loader2 size={28} className="animate-spin" style={{color:'rgba(96,165,250,0.6)'}}/>
              <p className="text-sm" style={{color:'rgba(255,255,255,0.25)'}}>Cargando tu cola de hoy...</p>
            </div>
          </div>
        ) : ordered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center glass-card">
            <Phone size={36} className="mb-4 opacity-20 text-white"/>
            <p className="text-sm font-medium text-white mb-1">Sin leads asignados hoy</p>
            {user?.role === 'admin' && (
              <p className="text-xs mt-1" style={{color:'rgba(255,255,255,0.3)'}}>
                Pulsa "Asignar leads" para generar la cola de hoy
              </p>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {ordered.map((lead, i) => (
              <CompanyCard
                key={lead.assignment_id || lead.id}
                company={{...lead, last_call_status: lead.call_status}}
                cardIndex={i + 1}
                onClick={() => setModalIdx(i)}
                assignmentId={lead.assignment_id}
                isRetry={lead.attempt_count > 0}
              />
            ))}
          </div>
        )}
      </main>

      {/* ── Modal ── */}
      {modalIdx !== null && ordered[modalIdx] && (
        <CompanyModal
          company={{...ordered[modalIdx], last_call_status: ordered[modalIdx].call_status}}
          cardIndex={modalIdx + 1}
          total={ordered.length}
          assignmentId={ordered[modalIdx].assignment_id}
          hasPrev={modalIdx > 0}
          hasNext={modalIdx < ordered.length - 1}
          onClose={() => setModalIdx(null)}
          onPrev={() => setModalIdx(v => v - 1)}
          onNext={() => setModalIdx(v => v + 1)}
          onStatusChange={(assignmentId, status, notes) => {
            handleStatusChange(assignmentId, status, notes)
          }}
        />
      )}
    </div>
  )
}
