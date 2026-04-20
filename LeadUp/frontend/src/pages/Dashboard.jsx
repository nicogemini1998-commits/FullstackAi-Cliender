import { useState, useEffect, useCallback } from 'react'
import {
  Phone, PhoneOff, PhoneMissed, CheckCircle2, XCircle,
  Clock, RotateCcw, ChevronRight, Globe, Link2,
  TrendingUp, Cpu, Video, Star, Zap,
  BarChart3, Settings, LogOut, Activity,
  Users, Mail,
} from 'lucide-react'
import { leads as leadsApi, admin } from '../lib/api'
import { useAuth } from '../hooks/useAuth.jsx'

/* ── helpers ── */
const parseContacts = (raw) => {
  if (!raw) return []
  if (Array.isArray(raw)) return raw
  try { return JSON.parse(raw) } catch { return [] }
}

function ScoreBar({ value = 0 }) {
  const color = value >= 70 ? '#34d399' : value >= 40 ? '#fbbf24' : 'var(--accent)'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1 rounded-full" style={{background:'rgba(255,255,255,0.07)'}}>
        <div className="h-full rounded-full transition-all duration-700"
          style={{width:`${value}%`, background:color}}/>
      </div>
      <span className="font-mono text-xs tabular-nums" style={{color, minWidth:30}}>{value}</span>
    </div>
  )
}

/* ── Queue item ── */
function QueueItem({ lead, active, idx, onClick }) {
  const status = lead.call_status
  const isDone = ['closed','rejected'].includes(status)
  const dotColor = status === 'closed' ? '#34d399' : status === 'rejected' ? '#f87171' : status === 'no_answer' ? '#fbbf24' : 'var(--accent)'
  return (
    <button onClick={onClick} className="w-full text-left px-4 py-3.5 transition-all duration-150 relative"
      style={{
        borderBottom:'1px solid rgba(255,255,255,0.04)',
        background: active ? 'rgba(220,38,38,0.07)' : 'transparent',
        opacity: isDone ? 0.5 : 1,
      }}>
      {active && <div className="absolute left-0 top-0 bottom-0 w-0.5" style={{background:'var(--accent)'}}/>}
      <div className="flex items-start gap-2.5">
        <div className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0"
          style={{background:dotColor, boxShadow: active ? `0 0 6px ${dotColor}` : 'none'}}/>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold truncate" style={{color: active ? '#fff' : 'rgba(255,255,255,0.7)'}}>
            {lead.name}
          </p>
          <p className="text-xs font-mono mt-0.5 truncate" style={{color:'rgba(255,255,255,0.3)'}}>
            {(lead.city||'').toUpperCase()} · #{String(idx+1).padStart(2,'0')}
          </p>
        </div>
        {lead.attempt_count > 0 && (
          <RotateCcw size={10} style={{color:'#fbbf24', marginTop:2, flexShrink:0}}/>
        )}
      </div>
    </button>
  )
}

/* ── Lead Detail ── */
function LeadDetail({ lead, onStatus, total, idx }) {
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [callStatus, setCallStatus] = useState(lead?.call_status || 'pending')

  useEffect(() => { setCallStatus(lead?.call_status || 'pending'); setNotes('') }, [lead?.assignment_id])

  if (!lead) return (
    <div className="flex-1 flex items-center justify-center" style={{color:'rgba(255,255,255,0.15)'}}>
      <div className="text-center">
        <Phone size={40} className="mx-auto mb-3 opacity-20"/>
        <p className="text-sm">Selecciona un lead de la cola</p>
      </div>
    </div>
  )

  const contacts = parseContacts(lead.contacts)
  const primary  = contacts.find(c => c?.is_primary) || contacts[0]
  const secondary = contacts.filter(c => !c?.is_primary).slice(0,2)

  const handleStatus = async (s) => {
    setSaving(true)
    try {
      await onStatus(lead.assignment_id, s, notes)
      setCallStatus(s)
    } finally { setSaving(false) }
  }

  const score = lead.digital_score || 0
  const scoreColor = score >= 70 ? '#34d399' : score >= 40 ? '#fbbf24' : 'var(--accent)'

  return (
    <div className="flex-1 flex flex-col overflow-hidden fade-in" key={lead.assignment_id}>

      {/* ── Header ── */}
      <div className="px-8 pt-6 pb-5 shrink-0"
        style={{borderBottom:'1px solid rgba(255,255,255,0.05)'}}>
        <div className="flex items-start justify-between gap-6">
          <div>
            <div className="flex items-center gap-3 mb-1 flex-wrap">
              <h1 className="text-2xl font-bold text-white tracking-tight">{lead.name}</h1>
              {lead.opportunity_level && (
                <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full badge-${(lead.opportunity_level||'').toLowerCase()}`}>
                  {lead.opportunity_level}
                </span>
              )}
              {lead.attempt_count > 0 && (
                <span className="text-xs px-2 py-0.5 rounded-full font-mono"
                  style={{background:'rgba(251,191,36,0.1)',color:'#fbbf24',border:'1px solid rgba(251,191,36,0.2)'}}>
                  INTENTO {lead.attempt_count + 1}
                </span>
              )}
            </div>
            <p className="font-mono text-xs" style={{color:'rgba(255,255,255,0.3)'}}>
              LEAD #{String(idx+1).padStart(3,'0')} / {String(total).padStart(3,'0')} &nbsp;·&nbsp;
              {(lead.sector_tag || lead.sector || '').toUpperCase()} &nbsp;·&nbsp;
              {(lead.city || '').toUpperCase()}
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {lead.website && (
              <a href={lead.website} target="_blank" rel="noopener noreferrer"
                className="glass-btn glass-btn-neutral flex items-center gap-1.5 px-3 py-1.5 text-xs">
                <Globe size={11}/>Web
              </a>
            )}
            <div className="text-right">
              <div className="text-2xl font-bold font-mono" style={{color:scoreColor}}>{score}</div>
              <div className="text-xs font-mono" style={{color:'rgba(255,255,255,0.3)'}}>SCORE</div>
            </div>
          </div>
        </div>
        <div className="mt-3">
          <ScoreBar value={score}/>
        </div>
      </div>

      {/* ── Scrollable content ── */}
      <div className="flex-1 overflow-y-auto px-8 py-5 space-y-5">

        {/* Opening line */}
        {lead.opening_line && (
          <div className="rounded-xl p-4"
            style={{background:'rgba(220,38,38,0.06)',border:'1px solid rgba(220,38,38,0.18)'}}>
            <div className="flex items-center gap-2 mb-2">
              <Zap size={12} style={{color:'var(--accent)'}}/>
              <span className="font-mono text-xs font-bold" style={{color:'var(--accent)'}}>APERTURA SUGERIDA</span>
            </div>
            <p className="text-sm text-white italic leading-relaxed">"{lead.opening_line}"</p>
          </div>
        )}

        {/* Contacts */}
        <div>
          <p className="font-mono text-xs font-bold mb-3 tracking-widest"
            style={{color:'rgba(255,255,255,0.25)'}}>CONTACTO PRINCIPAL</p>
          <div className="grid grid-cols-3 gap-3">
            {/* Primary */}
            {primary && (
              <div className="rounded-xl p-4 col-span-1"
                style={{background:'rgba(220,38,38,0.05)',border:'1px solid rgba(220,38,38,0.2)'}}>
                <p className="font-mono text-xs mb-2" style={{color:'var(--accent)'}}>DECISOR PRINCIPAL</p>
                <p className="font-bold text-white text-sm">{primary.name || '—'}</p>
                <p className="text-xs mb-3" style={{color:'rgba(255,255,255,0.4)'}}>{primary.role || '—'}</p>
                {primary.phone && (
                  <a href={`tel:${primary.phone}`}
                    className="flex items-center gap-2 text-base font-bold font-mono transition-colors"
                    style={{color:'#34d399'}}
                    onMouseOver={e=>e.currentTarget.style.color='#6ee7b7'}
                    onMouseOut={e=>e.currentTarget.style.color='#34d399'}>
                    <Phone size={14}/>{primary.phone}
                  </a>
                )}
                {!primary.phone && (
                  <p className="text-xs font-mono" style={{color:'rgba(255,255,255,0.2)'}}>Sin teléfono</p>
                )}
                {primary.email && (
                  <p className="text-xs mt-1.5 truncate" style={{color:'rgba(255,255,255,0.35)'}}>{primary.email}</p>
                )}
                {primary.linkedin_url && (
                  <a href={primary.linkedin_url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs mt-1.5" style={{color:'rgba(96,165,250,0.7)'}}>
                    <Link2 size={10}/>LinkedIn
                  </a>
                )}
              </div>
            )}
            {secondary.slice(0,2).map((c,i) => (
              <div key={i} className="rounded-xl p-4"
                style={{background:'rgba(255,255,255,0.02)',border:'1px solid rgba(255,255,255,0.06)'}}>
                <p className="font-mono text-xs mb-2" style={{color:'rgba(255,255,255,0.3)'}}>DECISOR {i+2}</p>
                <p className="font-bold text-white text-sm">{c?.name||'—'}</p>
                <p className="text-xs mb-2" style={{color:'rgba(255,255,255,0.4)'}}>{c?.role||'—'}</p>
                {c?.phone && (
                  <a href={`tel:${c.phone}`} className="flex items-center gap-1.5 text-xs font-mono"
                    style={{color:'#34d399'}}><Phone size={10}/>{c.phone}</a>
                )}
                {c?.email && <p className="text-xs mt-1 truncate" style={{color:'rgba(255,255,255,0.35)'}}>{c.email}</p>}
              </div>
            ))}
            {Array.from({length:Math.max(0,2-secondary.length)}).map((_,i)=>(
              <div key={`ph${i}`} className="rounded-xl p-4"
                style={{background:'rgba(255,255,255,0.01)',border:'1px dashed rgba(255,255,255,0.05)'}}>
                <p className="text-xs font-mono" style={{color:'rgba(255,255,255,0.12)'}}>Sin decisor secundario</p>
              </div>
            ))}
          </div>
        </div>

        {/* Hooks CLIENDER */}
        {(lead.hook_captacion || lead.hook_crm || lead.hook_visibilidad) && (
          <div>
            <p className="font-mono text-xs font-bold mb-3 tracking-widest"
              style={{color:'rgba(255,255,255,0.25)'}}>OPORTUNIDAD CLIENDER</p>
            <div className="grid grid-cols-3 gap-3">
              {lead.hook_captacion && (
                <div className="opp-sales rounded-xl p-3.5">
                  <p className="font-mono text-xs font-bold mb-1.5" style={{color:'#34d399'}}>CAPTACION</p>
                  <p className="text-xs leading-relaxed" style={{color:'rgba(255,255,255,0.55)'}}>{lead.hook_captacion}</p>
                </div>
              )}
              {lead.hook_crm && (
                <div className="opp-tech rounded-xl p-3.5">
                  <p className="font-mono text-xs font-bold mb-1.5" style={{color:'#60a5fa'}}>CRM/COMERCIAL</p>
                  <p className="text-xs leading-relaxed" style={{color:'rgba(255,255,255,0.55)'}}>{lead.hook_crm}</p>
                </div>
              )}
              {lead.hook_visibilidad && (
                <div className="opp-av rounded-xl p-3.5">
                  <p className="font-mono text-xs font-bold mb-1.5" style={{color:'#fb923c'}}>VISIBILIDAD</p>
                  <p className="text-xs leading-relaxed" style={{color:'rgba(255,255,255,0.55)'}}>{lead.hook_visibilidad}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Resumen / oportunidades si no hay hooks */}
        {!lead.hook_captacion && lead.summary && (
          <div className="rounded-xl p-4"
            style={{background:'rgba(255,255,255,0.02)',border:'1px solid rgba(255,255,255,0.05)'}}>
            <p className="font-mono text-xs mb-2" style={{color:'rgba(255,255,255,0.3)'}}>RESUMEN</p>
            <p className="text-sm leading-relaxed" style={{color:'rgba(255,255,255,0.6)'}}>{lead.summary}</p>
          </div>
        )}

        {/* Oportunidades */}
        {(lead.opportunity_sales || lead.opportunity_tech || lead.opportunity_av) && (
          <div>
            <p className="font-mono text-xs font-bold mb-3 tracking-widest" style={{color:'rgba(255,255,255,0.25)'}}>OPORTUNIDADES</p>
            <div className="grid grid-cols-3 gap-3">
              {[
                {d:lead.opportunity_sales,label:'SALES/CRM',color:'#34d399',cls:'opp-sales'},
                {d:lead.opportunity_tech, label:'TECH/IA',  color:'#60a5fa',cls:'opp-tech'},
                {d:lead.opportunity_av,   label:'AV',       color:'#fb923c',cls:'opp-av'},
              ].map(({d,label,color,cls})=> d ? (
                <div key={label} className={`${cls} rounded-xl p-3.5`}>
                  <p className="font-mono text-xs font-bold mb-1.5" style={{color}}>{label}</p>
                  <p className="text-xs leading-relaxed whitespace-pre-line" style={{color:'rgba(255,255,255,0.55)'}}>{d}</p>
                </div>
              ) : null)}
            </div>
          </div>
        )}

        {/* Activity log */}
        <div className="rounded-xl p-4 font-mono text-xs"
          style={{background:'rgba(0,0,0,0.4)',border:'1px solid rgba(255,255,255,0.04)'}}>
          <p style={{color:'rgba(255,255,255,0.25)'}} className="mb-2">ACTIVIDAD</p>
          <p style={{color:'rgba(255,255,255,0.4)'}}>
            [SYS] Lead obtenido vía Apollo.io · fuente: <span style={{color:'var(--accent)'}}>verified</span>
          </p>
          {primary?.phone && (
            <p style={{color:'rgba(255,255,255,0.4)'}}>
              [TEL] {primary.phone} · <span style={{color:'#34d399'}}>disponible</span>
            </p>
          )}
          {lead.attempt_count > 0 && (
            <p style={{color:'rgba(255,255,255,0.4)'}}>
              [RETRY] Intento {lead.attempt_count+1} · no contestó anteriormente
            </p>
          )}
          <p style={{color:'rgba(255,255,255,0.4)'}}>
            [STATUS] <span style={{color:'var(--accent)'}}>listo para llamada</span>
          </p>
        </div>

        {/* Notes */}
        <textarea value={notes} onChange={e=>setNotes(e.target.value)}
          placeholder="Notas de la llamada..."
          rows={2}
          className="glass-input w-full px-4 py-3 text-sm resize-none"
          style={{fontFamily:"'DM Mono',monospace"}}/>
      </div>

      {/* ── Action bar ── */}
      <div className="px-8 py-4 shrink-0 flex items-center justify-between gap-3"
        style={{borderTop:'1px solid rgba(255,255,255,0.05)',
          background:'linear-gradient(0deg,rgba(0,0,0,0.3) 0%,transparent 100%)'}}>
        <div className="flex items-center gap-2">
          <button onClick={()=>handleStatus('pending')} disabled={saving}
            className="glass-btn glass-btn-neutral px-4 py-2 text-xs font-semibold"
            style={callStatus==='pending'?{borderColor:'rgba(220,38,38,0.35)',color:'rgba(239,68,68,0.8)'}:{}}>
            <Clock size={11} className="inline mr-1"/>Pendiente
          </button>
          <button onClick={()=>handleStatus('closed')} disabled={saving}
            className="glass-btn glass-btn-green px-4 py-2 text-xs font-semibold">
            <CheckCircle2 size={11} className="inline mr-1"/>Cerrado
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={()=>handleStatus('rejected')} disabled={saving}
            className="glass-btn px-4 py-2.5 text-sm font-bold"
            style={{background:callStatus==='rejected'?'rgba(220,38,38,0.25)':'rgba(220,38,38,0.1)',
              border:`1px solid ${callStatus==='rejected'?'rgba(239,68,68,0.5)':'rgba(220,38,38,0.2)'}`,
              color:'#f87171'}}>
            NO LO COGE
          </button>
          <button onClick={()=>handleStatus('no_answer')} disabled={saving}
            className="glass-btn px-4 py-2.5 text-sm font-bold"
            style={{background:callStatus==='no_answer'?'rgba(251,191,36,0.2)':'rgba(251,191,36,0.08)',
              border:`1px solid ${callStatus==='no_answer'?'rgba(251,191,36,0.4)':'rgba(251,191,36,0.2)'}`,
              color:'#fbbf24'}}>
            NO CONTESTA
          </button>
        </div>
        {primary?.phone ? (
          <a href={`tel:${primary.phone}`}
            className="glass-btn glass-btn-red flex items-center gap-2.5 px-6 py-3 text-sm font-bold tracking-wide">
            <Phone size={16}/>LLAMAR
          </a>
        ) : (
          <button disabled className="glass-btn glass-btn-neutral flex items-center gap-2.5 px-6 py-3 text-sm font-bold opacity-30">
            <PhoneOff size={16}/>SIN TEL
          </button>
        )}
      </div>
    </div>
  )
}

/* ── Main Dashboard ── */
export default function Dashboard() {
  const { user, logout } = useAuth()
  const [todayData, setTodayData]   = useState({ leads:[], total:0, pending:0 })
  const [stats, setStats]           = useState({})
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [loading, setLoading]       = useState(true)
  const [activeView, setActiveView] = useState('centralita')
  const [assigning, setAssigning]   = useState(false)
  const [now, setNow]               = useState(new Date())

  // Clock
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t) }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [lr, sr] = await Promise.all([leadsApi.today(), leadsApi.stats()])
      setTodayData(lr.data)
      setStats(sr.data)
      setSelectedIdx(0)
    } catch(e) { console.error(e) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const handleAssign = async () => {
    setAssigning(true)
    try { await leadsApi.assignNow(); await load() }
    finally { setAssigning(false) }
  }

  const handleStatus = useCallback(async (assignmentId, status, notes) => {
    await leadsApi.updateStatus(assignmentId, status, notes)
    await load()
  }, [load])

  const ordered = [
    ...(todayData.leads||[]).filter(l=>['pending','no_answer'].includes(l.call_status)),
    ...(todayData.leads||[]).filter(l=>['closed','rejected'].includes(l.call_status)),
  ]
  const selected = ordered[selectedIdx] || null
  const total    = ordered.length
  const pct      = total > 0 ? Math.round(((stats.closed||0)+(stats.rejected||0)+(stats.no_answer||0))/total*100) : 0

  const NAV = [
    { id:'centralita', label:'Centralita',  icon: Phone },
    { id:'pipeline',   label:'Pipeline',    icon: BarChart3 },
    { id:'analytics',  label:'Analytics',   icon: Activity },
    { id:'ajustes',    label:'Ajustes',     icon: Settings },
  ]

  return (
    <div className="flex flex-col" style={{height:'100dvh', background:'#050508'}}>

      {/* ── TOPBAR ── */}
      <div className="shrink-0 flex items-center gap-4 px-6"
        style={{height:56, borderBottom:'1px solid rgba(255,255,255,0.05)',
          background:'rgba(5,5,8,0.9)', backdropFilter:'blur(20px)', zIndex:20}}>
        {/* Logo */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{background:'linear-gradient(135deg,rgba(220,38,38,0.6),rgba(185,28,28,0.4))',
              border:'1px solid rgba(239,68,68,0.3)',boxShadow:'inset 0 1px 0 rgba(255,255,255,0.15),0 4px 12px rgba(220,38,38,0.25)'}}>
            <Phone size={13} className="text-white"/>
          </div>
          <span className="font-bold text-sm tracking-tight">
            <span style={{color:'var(--accent)'}}>LEAD</span>
            <span className="text-white">UP</span>
          </span>
        </div>

        {/* Status pulse */}
        <div className="flex items-center gap-2 ml-8 font-mono text-xs" style={{color:'rgba(255,255,255,0.4)'}}>
          <div className="w-2 h-2 rounded-full" style={{background:'var(--accent)',animation:'accent-pulse 2s infinite',boxShadow:'0 0 6px var(--accent)'}}/>
          SYSTEM &nbsp;<strong style={{color:'#fff'}}>OPTIMAL</strong>
        </div>

        {/* Clock */}
        <div className="font-mono text-xs ml-4" style={{color:'rgba(255,255,255,0.25)'}}>
          {now.toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit',second:'2-digit'})}
        </div>

        {/* Stats strip */}
        <div className="ml-auto flex items-center gap-5">
          {[
            {label:'HOY',   val:stats.total||0,     color:'rgba(255,255,255,0.6)'},
            {label:'CERRADOS', val:stats.closed||0,  color:'#34d399'},
            {label:'PENDIENTES',val:stats.pending||0,color:'rgba(220,38,38,0.8)'},
          ].map(({label,val,color})=>(
            <div key={label} className="flex items-center gap-1.5 font-mono text-xs">
              <span style={{color:'rgba(255,255,255,0.3)'}}>{label}</span>
              <strong style={{color, fontSize:14}}>{val}</strong>
            </div>
          ))}

          {/* Progress */}
          <div className="flex items-center gap-2 ml-2">
            <div className="w-20 h-1 rounded-full" style={{background:'rgba(255,255,255,0.06)'}}>
              <div className="h-full rounded-full transition-all duration-700"
                style={{width:`${pct}%`,background:'linear-gradient(90deg,var(--accent),#34d399)'}}/>
            </div>
            <span className="font-mono text-xs" style={{color:'rgba(255,255,255,0.35)'}}>{pct}%</span>
          </div>

          {/* User + logout */}
          <div className="flex items-center gap-2 ml-2 pl-4"
            style={{borderLeft:'1px solid rgba(255,255,255,0.06)'}}>
            <span className="text-xs hidden sm:block" style={{color:'rgba(255,255,255,0.3)'}}>{user?.name}</span>
            <button onClick={logout}
              className="glass-btn glass-btn-neutral p-1.5">
              <LogOut size={12}/>
            </button>
          </div>
        </div>
      </div>

      {/* ── BODY ── */}
      <div className="flex flex-1 min-h-0">

        {/* ── NAV (220px) ── */}
        <nav className="shrink-0 flex flex-col" style={{width:220,borderRight:'1px solid rgba(255,255,255,0.05)'}}>
          <div className="flex-1 py-4">
            {NAV.map(({id,label,icon:Icon})=>(
              <button key={id} onClick={()=>setActiveView(id)}
                className="w-full flex items-center gap-3 px-5 py-3 text-sm transition-all duration-150"
                style={{
                  color: activeView===id ? 'var(--accent)' : 'rgba(255,255,255,0.4)',
                  background: activeView===id ? 'linear-gradient(90deg,rgba(220,38,38,0.06) 0%,transparent 100%)' : 'transparent',
                  borderRight: activeView===id ? '2px solid var(--accent)' : '2px solid transparent',
                  fontWeight: activeView===id ? 600 : 400,
                }}>
                <Icon size={15}/>
                {label}
              </button>
            ))}
          </div>

          {/* Assign button */}
          {user?.role === 'admin' && (
            <div className="p-4">
              <button onClick={handleAssign} disabled={assigning}
                className="glass-btn glass-btn-red w-full flex items-center justify-center gap-2 py-2.5 text-xs font-bold">
                {assigning ? <span className="animate-spin"><RotateCcw size={12}/></span> : <Zap size={12}/>}
                {assigning ? 'Asignando...' : 'Asignar leads'}
              </button>
            </div>
          )}
        </nav>

        {/* ── CENTRALITA VIEW ── */}
        {activeView === 'centralita' && (
          <>
            {/* Lead queue (280px) */}
            <div className="shrink-0 flex flex-col overflow-hidden"
              style={{width:280, borderRight:'1px solid rgba(255,255,255,0.05)'}}>
              <div className="px-4 py-3 shrink-0"
                style={{borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
                <p className="font-mono text-xs font-bold" style={{color:'rgba(255,255,255,0.3)'}}>
                  COLA HOY &nbsp;·&nbsp; {total} LEADS
                </p>
              </div>
              <div className="flex-1 overflow-y-auto">
                {loading ? (
                  <div className="p-4 space-y-3">
                    {[...Array(6)].map((_,i)=>(
                      <div key={i} className="h-12 rounded-xl animate-pulse"
                        style={{background:'rgba(255,255,255,0.03)'}}/>
                    ))}
                  </div>
                ) : ordered.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center p-6">
                    <Phone size={28} style={{color:'rgba(255,255,255,0.1)'}} className="mb-3"/>
                    <p className="text-xs font-mono" style={{color:'rgba(255,255,255,0.2)'}}>SIN LEADS HOY</p>
                    {user?.role==='admin' && (
                      <p className="text-xs mt-2" style={{color:'rgba(255,255,255,0.15)'}}>
                        Pulsa "Asignar leads"
                      </p>
                    )}
                  </div>
                ) : (
                  ordered.map((lead,i)=>(
                    <QueueItem key={lead.assignment_id||lead.id}
                      lead={lead} idx={i} active={i===selectedIdx}
                      onClick={()=>setSelectedIdx(i)}/>
                  ))
                )}
              </div>
            </div>

            {/* Lead detail */}
            <LeadDetail
              lead={selected}
              onStatus={handleStatus}
              total={total}
              idx={selectedIdx}
            />
          </>
        )}

        {/* ── PIPELINE VIEW placeholder ── */}
        {activeView === 'pipeline' && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <BarChart3 size={40} style={{color:'rgba(255,255,255,0.08)'}} className="mx-auto mb-3"/>
              <p className="text-sm font-mono" style={{color:'rgba(255,255,255,0.2)'}}>PIPELINE — PRÓXIMAMENTE</p>
            </div>
          </div>
        )}

        {/* ── ANALYTICS placeholder ── */}
        {activeView === 'analytics' && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <Activity size={40} style={{color:'rgba(255,255,255,0.08)'}} className="mx-auto mb-3"/>
              <p className="text-sm font-mono" style={{color:'rgba(255,255,255,0.2)'}}>ANALYTICS — PRÓXIMAMENTE</p>
            </div>
          </div>
        )}

        {/* ── AJUSTES placeholder ── */}
        {activeView === 'ajustes' && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <Settings size={40} style={{color:'rgba(255,255,255,0.08)'}} className="mx-auto mb-3"/>
              <p className="text-sm font-mono" style={{color:'rgba(255,255,255,0.2)'}}>AJUSTES — PRÓXIMAMENTE</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
