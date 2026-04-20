import { useState, useEffect } from 'react'
import { leads as leadsApi } from '../lib/api'
import { useAuth } from '../hooks/useAuth.jsx'
import { TrendingUp, Phone, CheckCircle2, XCircle, PhoneMissed, Clock } from 'lucide-react'

function Metric({ label, value, color, sub }) {
  return (
    <div className="rounded-2xl p-5" style={{background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.06)'}}>
      <p className="font-mono text-xs mb-2 tracking-widest" style={{color:'rgba(255,255,255,0.28)'}}>{label}</p>
      <p className="text-4xl font-bold font-mono tabular-nums" style={{color}}>{value}</p>
      {sub && <p className="font-mono text-xs mt-2" style={{color:'rgba(255,255,255,0.3)'}}>{sub}</p>}
    </div>
  )
}

function Bar({ label, value, max, color }) {
  const pct = max > 0 ? Math.round((value/max)*100) : 0
  return (
    <div className="mb-3">
      <div className="flex justify-between mb-1">
        <span className="text-xs font-semibold text-white">{label}</span>
        <span className="font-mono text-xs tabular-nums" style={{color}}>{value}</span>
      </div>
      <div className="h-1.5 rounded-full" style={{background:'rgba(255,255,255,0.06)'}}>
        <div className="h-full rounded-full transition-all duration-700"
          style={{width:`${pct}%`,background:color}}/>
      </div>
    </div>
  )
}

export default function Analytics() {
  const { user } = useAuth()
  const [stats, setStats] = useState({})
  const [today, setToday] = useState({ leads:[] })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([leadsApi.stats(), leadsApi.today()])
      .then(([sr, lr]) => { setStats(sr.data); setToday(lr.data) })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const total    = stats.total || 0
  const closed   = stats.closed || 0
  const rejected = stats.rejected || 0
  const noAnswer = stats.no_answer || 0
  const pending  = stats.pending || 0
  const called   = closed + rejected + noAnswer
  const convRate = called > 0 ? Math.round((closed/called)*100) : 0
  const maxVal   = Math.max(closed, rejected, noAnswer, pending, 1)

  // Sector breakdown from today's leads
  const bySector = {}
  ;(today.leads||[]).forEach(l => {
    const s = l.sector_tag || l.sector || 'otro'
    bySector[s] = (bySector[s]||0) + 1
  })
  const sectors = Object.entries(bySector).sort((a,b)=>b[1]-a[1]).slice(0,5)

  if (loading) return (
    <div className="flex-1 flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"/>
    </div>
  )

  return (
    <div className="flex-1 overflow-y-auto px-8 py-6">
      <div className="max-w-3xl mx-auto space-y-6">

        <div>
          <h2 className="text-lg font-bold text-white mb-1">Analytics del Día</h2>
          <p className="font-mono text-xs" style={{color:'rgba(255,255,255,0.3)'}}>
            {user?.name?.toUpperCase()} · {new Date().toLocaleDateString('es-ES')}
          </p>
        </div>

        {/* KPI grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Metric label="TOTAL HOY"     value={total}    color="#fff"     sub="leads asignados"/>
          <Metric label="LLAMADAS"      value={called}   color="#3b82f6"  sub="realizadas"/>
          <Metric label="CERRADOS"      value={closed}   color="#10b981"  sub={`${convRate}% tasa`}/>
          <Metric label="PENDIENTES"    value={pending}  color="#f59e0b"  sub="por llamar"/>
        </div>

        {/* Conversion rate */}
        <div className="rounded-2xl p-5" style={{background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.06)'}}>
          <p className="font-mono text-xs mb-3 tracking-widest" style={{color:'rgba(255,255,255,0.28)'}}>TASA DE CONVERSIÓN</p>
          <div className="flex items-end gap-3">
            <span className="text-5xl font-bold font-mono" style={{color: convRate>=30 ? '#10b981' : convRate>=15 ? '#f59e0b' : '#ef4444'}}>
              {convRate}%
            </span>
            <span className="text-sm mb-1" style={{color:'rgba(255,255,255,0.4)'}}>
              {closed} cerrados de {called} llamadas
            </span>
          </div>
          <div className="mt-3 h-2 rounded-full" style={{background:'rgba(255,255,255,0.06)'}}>
            <div className="h-full rounded-full transition-all duration-1000"
              style={{width:`${convRate}%`,background:'linear-gradient(90deg,#3b82f6,#10b981)'}}/>
          </div>
        </div>

        {/* Status breakdown */}
        <div className="rounded-2xl p-5" style={{background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.06)'}}>
          <p className="font-mono text-xs mb-4 tracking-widest" style={{color:'rgba(255,255,255,0.28)'}}>DESGLOSE DE ESTADOS</p>
          <Bar label="Pendiente"    value={pending}  max={maxVal} color="#3b82f6"/>
          <Bar label="Cerrado"      value={closed}   max={maxVal} color="#10b981"/>
          <Bar label="No lo coge"   value={rejected} max={maxVal} color="#ef4444"/>
          <Bar label="No contesta"  value={noAnswer} max={maxVal} color="#f59e0b"/>
        </div>

        {/* Sector breakdown */}
        {sectors.length > 0 && (
          <div className="rounded-2xl p-5" style={{background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.06)'}}>
            <p className="font-mono text-xs mb-4 tracking-widest" style={{color:'rgba(255,255,255,0.28)'}}>LEADS POR SECTOR</p>
            {sectors.map(([s,n]) => (
              <Bar key={s} label={s.toUpperCase()} value={n} max={sectors[0][1]} color="#3b82f6"/>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
