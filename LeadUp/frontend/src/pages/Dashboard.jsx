import { useState, useEffect, useCallback } from 'react'
import {
  TrendingUp, CheckCircle2, XCircle, PhoneMissed, Clock,
  Search, Filter, RefreshCw, LogOut, Loader2, Zap,
} from 'lucide-react'
import CompanyCard from '../components/CompanyCard'
import { companies as companiesApi, admin } from '../lib/api'
import { useAuth } from '../hooks/useAuth'

function StatCard({ icon: Icon, label, value, color }) {
  return (
    <div className="bg-[#0f2040] border border-white/5 rounded-xl p-4 flex items-center gap-3">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${color}`}>
        <Icon size={16} className="text-white" />
      </div>
      <div>
        <p className="text-xl font-bold text-white leading-none">{value ?? '—'}</p>
        <p className="text-xs text-slate-500 mt-0.5">{label}</p>
      </div>
    </div>
  )
}

export default function Dashboard() {
  const { user, logout } = useAuth()
  const [list, setList] = useState([])
  const [stats, setStats] = useState({})
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [search, setSearch] = useState('')
  const [opportunity, setOpportunity] = useState('')
  const [triggering, setTriggering] = useState(false)
  const [trigMsg, setTrigMsg] = useState('')

  const LIMIT = 12

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [listRes, statsRes] = await Promise.all([
        companiesApi.list({ page, limit: LIMIT, search: search || undefined, opportunity: opportunity || undefined }),
        companiesApi.stats(),
      ])
      setList(listRes.data.data)
      setTotal(listRes.data.total)
      setStats(statsRes.data)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [page, search, opportunity])

  useEffect(() => { load() }, [load])

  const triggerEnrichment = async () => {
    setTriggering(true)
    setTrigMsg('')
    try {
      const r = await admin.triggerEnrichment('restaurantes', 'Madrid', 10)
      setTrigMsg(`✅ Enriquecimiento completado — ${r.data.saved} fichas guardadas`)
      load()
    } catch (e) {
      setTrigMsg('❌ Error al lanzar enriquecimiento')
    } finally {
      setTriggering(false)
    }
  }

  const pages = Math.ceil(total / LIMIT)

  return (
    <div className="min-h-screen bg-[#0a1628]">
      {/* ── Navbar ── */}
      <header className="border-b border-white/5 bg-[#0f2040]/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-5 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center">
              <TrendingUp size={14} className="text-white" />
            </div>
            <span className="font-bold text-white text-sm tracking-tight">LeadUp CRM</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-400 hidden sm:block">{user?.name || user?.email}</span>
            <button onClick={logout}
              className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors">
              <LogOut size={13} />
              Salir
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-5 py-6 space-y-6">

        {/* ── Stats ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard icon={Clock}         label="Total fichas"   value={stats.total}     color="bg-blue-600" />
          <StatCard icon={CheckCircle2}  label="Cerrados"       value={stats.closed}    color="bg-emerald-600" />
          <StatCard icon={XCircle}       label="Rechazados"     value={stats.rejected}  color="bg-red-600" />
          <StatCard icon={PhoneMissed}   label="Sin contestar"  value={stats.no_answer} color="bg-slate-600" />
        </div>

        {/* ── Toolbar ── */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }}
              placeholder="Buscar empresa o ciudad..."
              className="w-full bg-[#0f2040] border border-white/8 rounded-lg pl-9 pr-4 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50 transition-colors"
            />
          </div>

          {/* Opportunity filter */}
          <select
            value={opportunity}
            onChange={e => { setOpportunity(e.target.value); setPage(1) }}
            className="bg-[#0f2040] border border-white/8 rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-blue-500/50"
          >
            <option value="">Todas las oportunidades</option>
            <option value="ALTA">ALTA</option>
            <option value="MEDIA">MEDIA</option>
            <option value="BAJA">BAJA</option>
          </select>

          <button onClick={load}
            className="p-2 bg-[#0f2040] border border-white/8 rounded-lg text-slate-400 hover:text-white transition-colors">
            <RefreshCw size={15} />
          </button>

          {user?.role === 'admin' && (
            <button
              onClick={triggerEnrichment}
              disabled={triggering}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              {triggering ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
              {triggering ? 'Enriqueciendo...' : 'Enriquecer ahora'}
            </button>
          )}
        </div>

        {trigMsg && (
          <p className="text-sm text-slate-300 bg-[#0f2040] border border-white/8 rounded-lg px-4 py-2">
            {trigMsg}
          </p>
        )}

        {/* ── Cards grid ── */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={24} className="animate-spin text-blue-400" />
          </div>
        ) : list.length === 0 ? (
          <div className="text-center py-20 text-slate-500">
            <TrendingUp size={32} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">No hay fichas todavía.</p>
            {user?.role === 'admin' && (
              <p className="text-xs mt-1">Pulsa "Enriquecer ahora" para generar las primeras fichas.</p>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {list.map((company, i) => (
              <CompanyCard
                key={company.id}
                company={company}
                cardIndex={(page - 1) * LIMIT + i + 1}
                onStatusChange={() => load()}
              />
            ))}
          </div>
        )}

        {/* ── Pagination ── */}
        {pages > 1 && (
          <div className="flex items-center justify-center gap-2">
            <button
              disabled={page === 1}
              onClick={() => setPage(p => p - 1)}
              className="px-3 py-1.5 text-xs bg-[#0f2040] border border-white/8 rounded-lg text-slate-400 hover:text-white disabled:opacity-30 transition-colors"
            >
              ← Anterior
            </button>
            <span className="text-xs text-slate-500">{page} / {pages}</span>
            <button
              disabled={page === pages}
              onClick={() => setPage(p => p + 1)}
              className="px-3 py-1.5 text-xs bg-[#0f2040] border border-white/8 rounded-lg text-slate-400 hover:text-white disabled:opacity-30 transition-colors"
            >
              Siguiente →
            </button>
          </div>
        )}
      </main>
    </div>
  )
}
