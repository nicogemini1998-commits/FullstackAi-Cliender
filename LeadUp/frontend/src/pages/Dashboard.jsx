import { useState, useEffect, useCallback } from 'react'
import {
  TrendingUp, CheckCircle2, XCircle, PhoneMissed, Clock,
  Search, RefreshCw, LogOut, Loader2, Zap, SlidersHorizontal,
} from 'lucide-react'
import CompanyCard from '../components/CompanyCard'
import { companies as companiesApi, admin } from '../lib/api'
import { useAuth } from '../hooks/useAuth.jsx'

function StatCard({ icon: Icon, label, value, accent }) {
  return (
    <div className="glass-card p-4 flex items-center gap-3.5">
      <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
        style={{background:accent.bg, border:`1px solid ${accent.border}`,
          boxShadow:`0 4px 16px ${accent.glow}`}}>
        <Icon size={16} style={{color:accent.color}}/>
      </div>
      <div>
        <p className="text-xl font-bold text-white leading-none">{value ?? '—'}</p>
        <p className="text-xs mt-0.5" style={{color:'rgba(255,255,255,0.3)'}}>{label}</p>
      </div>
    </div>
  )
}

const STATS_CONFIG = [
  { key:'total',     label:'Total fichas',    icon:Clock,        accent:{bg:'rgba(59,130,246,0.12)',   border:'rgba(96,165,250,0.2)',   color:'#60a5fa', glow:'rgba(59,130,246,0.2)'}},
  { key:'closed',    label:'Cerrados',         icon:CheckCircle2, accent:{bg:'rgba(16,185,129,0.12)',   border:'rgba(52,211,153,0.2)',   color:'#34d399', glow:'rgba(16,185,129,0.2)'}},
  { key:'rejected',  label:'Rechazados',       icon:XCircle,      accent:{bg:'rgba(239,68,68,0.12)',    border:'rgba(248,113,113,0.2)',  color:'#f87171', glow:'rgba(239,68,68,0.2)'}},
  { key:'no_answer', label:'Sin contestar',    icon:PhoneMissed,  accent:{bg:'rgba(107,114,128,0.12)', border:'rgba(156,163,175,0.2)', color:'#9ca3af', glow:'rgba(107,114,128,0.2)'}},
]

export default function Dashboard() {
  const { user, logout } = useAuth()
  const [list, setList]           = useState([])
  const [stats, setStats]         = useState({})
  const [loading, setLoading]     = useState(true)
  const [page, setPage]           = useState(1)
  const [total, setTotal]         = useState(0)
  const [search, setSearch]       = useState('')
  const [opportunity, setOpportunity] = useState('')
  const [triggering, setTriggering] = useState(false)
  const [trigMsg, setTrigMsg]     = useState('')
  const LIMIT = 12

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [lr, sr] = await Promise.all([
        companiesApi.list({ page, limit: LIMIT, search: search || undefined, opportunity: opportunity || undefined }),
        companiesApi.stats(),
      ])
      setList(lr.data.data); setTotal(lr.data.total); setStats(sr.data)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [page, search, opportunity])

  useEffect(() => { load() }, [load])

  const triggerEnrichment = async () => {
    setTriggering(true); setTrigMsg('')
    try {
      const r = await admin.triggerEnrichment('restaurantes', 'Madrid', 10)
      setTrigMsg(`✅ ${r.data.saved ?? 0} fichas guardadas`)
      load()
    } catch { setTrigMsg('❌ Error al lanzar enriquecimiento') }
    finally { setTriggering(false) }
  }

  const pages = Math.ceil(total / LIMIT)

  return (
    <div className="min-h-screen">

      {/* ── Navbar ── */}
      <header className="sticky top-0 z-20"
        style={{background:'rgba(5,5,8,0.8)', backdropFilter:'blur(20px)',
          borderBottom:'1px solid rgba(255,255,255,0.05)'}}>
        <div className="max-w-7xl mx-auto px-5 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{background:'linear-gradient(135deg,rgba(59,130,246,0.5),rgba(29,78,216,0.35))',
                border:'1px solid rgba(96,165,250,0.3)',
                boxShadow:'inset 0 1px 0 rgba(255,255,255,0.2), 0 4px 16px rgba(37,99,235,0.25)'}}>
              <TrendingUp size={14} className="text-white"/>
            </div>
            <span className="font-bold text-white text-sm tracking-tight">LeadUp</span>
            <span className="text-xs px-2 py-0.5 rounded-full hidden sm:inline"
              style={{background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.08)',
                color:'rgba(255,255,255,0.4)'}}>
              CRM
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs hidden sm:block" style={{color:'rgba(255,255,255,0.3)'}}>
              {user?.name || user?.email}
            </span>
            <button onClick={logout}
              className="glass-btn glass-btn-neutral flex items-center gap-1.5 text-xs px-3 py-1.5">
              <LogOut size={12}/>Salir
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-5 py-6 space-y-5">

        {/* ── Stats ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {STATS_CONFIG.map(s => (
            <StatCard key={s.key} icon={s.icon} label={s.label} value={stats[s.key]} accent={s.accent}/>
          ))}
        </div>

        {/* ── Toolbar ── */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={13} className="absolute left-3.5 top-1/2 -translate-y-1/2"
              style={{color:'rgba(255,255,255,0.25)'}}/>
            <input value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}
              placeholder="Buscar empresa o ciudad..."
              className="glass-input w-full pl-9 pr-4 py-2.5 text-sm"/>
          </div>

          <div className="relative">
            <SlidersHorizontal size={13} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{color:'rgba(255,255,255,0.25)'}}/>
            <select value={opportunity} onChange={e => { setOpportunity(e.target.value); setPage(1) }}
              className="glass-input pl-8 pr-4 py-2.5 text-sm appearance-none cursor-pointer"
              style={{minWidth:'170px'}}>
              <option value="">Todas</option>
              <option value="ALTA">Oportunidad ALTA</option>
              <option value="MEDIA">Oportunidad MEDIA</option>
              <option value="BAJA">Oportunidad BAJA</option>
            </select>
          </div>

          <button onClick={load}
            className="glass-btn glass-btn-neutral p-2.5">
            <RefreshCw size={14}/>
          </button>

          {user?.role === 'admin' && (
            <button onClick={triggerEnrichment} disabled={triggering}
              className="glass-btn glass-btn-blue flex items-center gap-2 px-4 py-2.5 text-sm font-semibold">
              {triggering ? <Loader2 size={13} className="animate-spin"/> : <Zap size={13}/>}
              {triggering ? 'Enriqueciendo...' : 'Enriquecer ahora'}
            </button>
          )}
        </div>

        {/* Mensaje trigger */}
        {trigMsg && (
          <div className="text-sm px-4 py-3 rounded-2xl"
            style={{background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)',
              color:'rgba(255,255,255,0.6)'}}>
            {trigMsg}
          </div>
        )}

        {/* ── Grid fichas ── */}
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="flex flex-col items-center gap-3">
              <Loader2 size={28} className="animate-spin" style={{color:'rgba(96,165,250,0.6)'}}/>
              <p className="text-sm" style={{color:'rgba(255,255,255,0.25)'}}>Cargando fichas...</p>
            </div>
          </div>
        ) : list.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-16 h-16 rounded-2xl mb-4 flex items-center justify-center"
              style={{background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.07)'}}>
              <TrendingUp size={28} style={{color:'rgba(255,255,255,0.15)'}}/>
            </div>
            <p className="text-sm font-medium text-white mb-1">Sin fichas todavía</p>
            {user?.role === 'admin' && (
              <p className="text-xs" style={{color:'rgba(255,255,255,0.3)'}}>
                Pulsa "Enriquecer ahora" para generar las primeras fichas
              </p>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {list.map((company, i) => (
              <CompanyCard key={company.id} company={company}
                cardIndex={(page-1)*LIMIT+i+1} onStatusChange={load}/>
            ))}
          </div>
        )}

        {/* ── Paginación ── */}
        {pages > 1 && (
          <div className="flex items-center justify-center gap-2 pt-2">
            <button disabled={page===1} onClick={() => setPage(p => p-1)}
              className="glass-btn glass-btn-neutral px-4 py-2 text-xs disabled:opacity-30">
              ← Anterior
            </button>
            <span className="text-xs px-3" style={{color:'rgba(255,255,255,0.3)'}}>{page} / {pages}</span>
            <button disabled={page===pages} onClick={() => setPage(p => p+1)}
              className="glass-btn glass-btn-neutral px-4 py-2 text-xs disabled:opacity-30">
              Siguiente →
            </button>
          </div>
        )}
      </main>
    </div>
  )
}
