import { useState, useEffect } from 'react'
import { leads as leadsApi } from '../lib/api'
import { useAuth } from '../hooks/useAuth.jsx'
import api from '../lib/api'

function Metric({ label, value, color, sub }) {
  return (
    <div className="rounded-2xl p-4" style={{background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.06)'}}>
      <p className="font-mono text-xs mb-2 tracking-widest" style={{color:'rgba(255,255,255,0.28)'}}>{label}</p>
      <p className="text-3xl font-bold font-mono tabular-nums" style={{color}}>{value}</p>
      {sub && <p className="font-mono text-xs mt-1.5" style={{color:'rgba(255,255,255,0.3)'}}>{sub}</p>}
    </div>
  )
}

function Bar({ label, value, max, color, sub }) {
  const pct = max > 0 ? Math.round((value/max)*100) : 0
  return (
    <div className="mb-4">
      <div className="flex justify-between mb-1.5">
        <span className="text-sm font-semibold text-white">{label}</span>
        <span className="font-mono text-sm tabular-nums" style={{color}}>{value}</span>
      </div>
      <div className="h-2 rounded-full" style={{background:'rgba(255,255,255,0.06)'}}>
        <div className="h-full rounded-full transition-all duration-700"
          style={{width:`${pct}%`, background:color}}/>
      </div>
      {sub && <p className="font-mono text-xs mt-1" style={{color:'rgba(255,255,255,0.3)'}}>{sub}</p>}
    </div>
  )
}

async function fetchAllUsersStats() {
  const USERS = [
    {name:'Nicolas', email:'nicolas@cliender.com'},
    {name:'Toni',    email:'toni@cliender.com'},
    {name:'Dan',     email:'dan@cliender.com'},
    {name:'Ethan',   email:'ethan@cliender.com'},
    {name:'Ruben',   email:'ruben@cliender.com'},
  ]
  // Obtener stats globales desde el endpoint de stats (filtra por user en el backend)
  // Como admins, usamos el endpoint de companies/stats global
  try {
    const r = await api.get('/companies/stats')
    return r.data
  } catch { return {} }
}

export default function Analytics() {
  const { user } = useAuth()
  const isAdmin  = user?.role === 'admin'
  const [stats, setStats]   = useState({})
  const [today, setToday]   = useState({ leads:[] })
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

  // Sectores del día
  const bySector = {}
  ;(today.leads||[]).forEach(l => {
    const s = l.sector_tag || l.sector || 'otro'
    bySector[s] = (bySector[s]||0) + 1
  })
  const sectors = Object.entries(bySector).sort((a,b)=>b[1]-a[1]).slice(0,5)

  // Rendimiento simulado por comercial (admin ve esto)
  const comerciales = [
    {name:'Ethan', total:12, closed:3, rejected:2, no_answer:4},
    {name:'Ruben', total:7,  closed:1, rejected:1, no_answer:2},
  ]

  if (loading) return (
    <div className="flex-1 flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"/>
    </div>
  )

  return (
    <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-6">
      <div className="max-w-3xl mx-auto space-y-5">

        <div>
          <h2 className="text-lg font-bold text-white mb-1">Analytics</h2>
          <p className="font-mono text-xs" style={{color:'rgba(255,255,255,0.3)'}}>
            {user?.name?.toUpperCase()} · {isAdmin ? 'ADMIN' : 'COMERCIAL'} · {new Date().toLocaleDateString('es-ES')}
          </p>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Metric label="TOTAL HOY"     value={total}    color="#fff"     sub="leads asignados"/>
          <Metric label="LLAMADAS"      value={called}   color="#3b82f6"  sub="realizadas"/>
          <Metric label="CERRADOS"      value={closed}   color="#10b981"  sub={`${convRate}% tasa`}/>
          <Metric label="PENDIENTES"    value={pending}  color="#f59e0b"  sub="por llamar"/>
        </div>

        {/* Conversión */}
        <div className="rounded-2xl p-5" style={{background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.06)'}}>
          <p className="font-mono text-xs mb-3 tracking-widest" style={{color:'rgba(255,255,255,0.28)'}}>TASA DE CONVERSIÓN</p>
          <div className="flex items-end gap-3 mb-3">
            <span className="text-5xl font-bold font-mono" style={{color: convRate>=30 ? '#10b981' : convRate>=15 ? '#f59e0b' : '#ef4444'}}>
              {convRate}%
            </span>
            <span className="text-sm mb-1" style={{color:'rgba(255,255,255,0.4)'}}>
              {closed} cerrados de {called} llamadas
            </span>
          </div>
          <div className="h-2 rounded-full" style={{background:'rgba(255,255,255,0.06)'}}>
            <div className="h-full rounded-full transition-all duration-1000"
              style={{width:`${convRate}%`, background:'linear-gradient(90deg,#3b82f6,#10b981)'}}/>
          </div>
        </div>

        {/* Desglose estados */}
        <div className="rounded-2xl p-5" style={{background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.06)'}}>
          <p className="font-mono text-xs mb-4 tracking-widest" style={{color:'rgba(255,255,255,0.28)'}}>DESGLOSE</p>
          <Bar label="Pendientes"   value={pending}  max={maxVal} color="#3b82f6"/>
          <Bar label="Cerrados"     value={closed}   max={maxVal} color="#10b981"/>
          <Bar label="No lo coge"   value={rejected} max={maxVal} color="#ef4444"/>
          <Bar label="No contesta"  value={noAnswer} max={maxVal} color="#f59e0b"/>
        </div>

        {/* ADMIN ONLY: rendimiento por comercial */}
        {isAdmin && (
          <div className="rounded-2xl p-5" style={{background:'rgba(59,130,246,0.04)',border:'1px solid rgba(59,130,246,0.15)'}}>
            <p className="font-mono text-xs mb-4 tracking-widest font-bold" style={{color:'rgba(96,165,250,0.7)'}}>
              RENDIMIENTO POR COMERCIAL — SOLO ADMINS
            </p>
            <div className="space-y-4">
              {comerciales.map(c => {
                const callsMade  = c.closed + c.rejected + c.no_answer
                const rate       = callsMade > 0 ? Math.round((c.closed/callsMade)*100) : 0
                const rateColor  = rate >= 30 ? '#10b981' : rate >= 15 ? '#f59e0b' : '#ef4444'
                return (
                  <div key={c.name} className="rounded-xl p-4"
                    style={{background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.06)'}}>
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <p className="font-bold text-white text-sm">{c.name}</p>
                        <p className="font-mono text-xs" style={{color:'rgba(255,255,255,0.3)'}}>
                          {callsMade}/{c.total} llamadas · {c.total - callsMade} pendientes
                        </p>
                      </div>
                      <div className="text-right">
                        <span className="text-2xl font-bold font-mono" style={{color:rateColor}}>{rate}%</span>
                        <p className="font-mono text-xs" style={{color:'rgba(255,255,255,0.3)'}}>conversión</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      {[
                        {label:'Cerrados',    v:c.closed,    color:'#10b981'},
                        {label:'No coge',     v:c.rejected,  color:'#ef4444'},
                        {label:'No contesta', v:c.no_answer, color:'#f59e0b'},
                      ].map(({label,v,color})=>(
                        <div key={label} className="rounded-lg p-2"
                          style={{background:`${color}11`,border:`1px solid ${color}22`}}>
                          <p className="text-lg font-bold font-mono" style={{color}}>{v}</p>
                          <p className="font-mono text-xs" style={{color:'rgba(255,255,255,0.35)'}}>{label}</p>
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 h-1.5 rounded-full" style={{background:'rgba(255,255,255,0.06)'}}>
                      <div className="h-full rounded-full"
                        style={{width:`${Math.round((callsMade/Math.max(c.total,1))*100)}%`,
                          background:'linear-gradient(90deg,#3b82f6,#10b981)'}}/>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Sectores */}
        {sectors.length > 0 && (
          <div className="rounded-2xl p-5" style={{background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.06)'}}>
            <p className="font-mono text-xs mb-4 tracking-widest" style={{color:'rgba(255,255,255,0.28)'}}>LEADS POR SECTOR HOY</p>
            {sectors.map(([s,n]) => (
              <Bar key={s} label={s.charAt(0).toUpperCase()+s.slice(1)} value={n} max={sectors[0][1]} color="#3b82f6"/>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
