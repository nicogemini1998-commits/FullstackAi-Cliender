import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Phone, PhoneOff, PhoneMissed, CheckCircle2, XCircle,
  RotateCcw, Globe, Link2, Zap, Clock as ClockIcon,
  BarChart3, Settings, LogOut, Activity, ArrowUp, ArrowDown, FileText,
} from 'lucide-react'
import { leads as leadsApi } from '../lib/api'
import { useAuth } from '../hooks/useAuth.jsx'
import Pipeline  from './Pipeline.jsx'
import Analytics from './Analytics.jsx'
import Ajustes   from './Ajustes.jsx'
import Notas     from './Notas.jsx'

/* ─── helpers ─────────────────────────────────────────── */
const parseContacts = (raw) => {
  if (!raw) return []
  if (Array.isArray(raw)) return raw
  if (typeof raw === 'string') { try { return JSON.parse(raw) } catch { return [] } }
  return []
}

const fmt = (s = '') => String(s || '').toUpperCase()

/* ─── Clock ───────────────────────────────────────────── */
function Clock() {
  const [t, setT] = useState(new Date())
  useEffect(() => { const id = setInterval(() => setT(new Date()), 1000); return () => clearInterval(id) }, [])
  return (
    <span className="font-mono text-xs tabular-nums" style={{color:'rgba(255,255,255,0.28)'}}>
      {t.toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit',second:'2-digit'})}
    </span>
  )
}

/* ─── Score Arc ───────────────────────────────────────── */
function ScoreArc({ value = 0 }) {
  const r = 20, c = 2 * Math.PI * r
  const filled = Math.min(value / 100, 1) * c
  const color = value >= 70 ? '#10b981' : value >= 40 ? '#f59e0b' : '#dc2626'
  return (
    <div className="relative flex items-center justify-center" style={{width:52,height:52}}>
      <svg width="52" height="52" className="-rotate-90" style={{position:'absolute'}}>
        <circle cx="26" cy="26" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="3"/>
        <circle cx="26" cy="26" r={r} fill="none" stroke={color} strokeWidth="3"
          strokeDasharray={`${filled} ${c}`} strokeLinecap="round"
          style={{filter:`drop-shadow(0 0 6px ${color}88)`, transition:'stroke-dasharray .6s ease'}}/>
      </svg>
      <span className="font-mono font-bold" style={{fontSize:13,color}}>{value}</span>
    </div>
  )
}

/* ─── Queue Item ──────────────────────────────────────── */
function QueueItem({ lead, idx, active, onClick }) {
  const s = lead.call_status
  const done = ['agendado','no_interest'].includes(s)
  const dotC = s==='agendado' ? '#10b981' : s==='no_interest' ? '#dc2626' : s==='no_answer' ? '#f59e0b' : '#dc2626'
  const contacts = parseContacts(lead.contacts)
  const primary = contacts.find(c=>c?.is_primary) || contacts[0]
  const hasPhone = !!(primary?.phone)

  return (
    <button
      onClick={onClick}
      className="queue-item-anim w-full text-left relative transition-all duration-150 group"
      style={{
        animationDelay: `${idx*40}ms`,
        borderBottom: '1px solid rgba(255,255,255,0.04)',
        background: active
          ? 'linear-gradient(90deg,rgba(59,130,246,0.09) 0%,rgba(220,38,38,0.03) 100%)'
          : 'transparent',
        opacity: done ? 0.48 : 1,
      }}>

      {/* Active bar */}
      {active && (
        <div className="absolute left-0 top-0 bottom-0 w-[2px] rounded-r"
          style={{background:'#3b82f6',boxShadow:'2px 0 10px rgba(59,130,246,0.4)'}}/>
      )}

      <div className="px-4 py-3.5 flex items-start gap-3">
        {/* Status dot */}
        <div className="mt-[5px] shrink-0 w-2 h-2 rounded-full"
          style={{
            background: dotC,
            boxShadow: active ? `0 0 8px ${dotC}` : 'none',
            animation: active && s==='pending' ? 'pulse-green 2s infinite' : 'none',
          }}/>

        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold truncate"
            style={{color: active ? '#fff' : 'rgba(255,255,255,0.68)'}}>
            {lead.name}
          </p>
          <p className="font-mono text-xs mt-0.5 truncate"
            style={{color:'rgba(255,255,255,0.28)'}}>
            {fmt(lead.city)} · #{String(idx+1).padStart(2,'0')}
          </p>
        </div>

        {/* Phone indicator */}
        <div className="shrink-0 flex flex-col items-end gap-1">
          {hasPhone
            ? <Phone size={10} style={{color:'#10b981'}}/>
            : <PhoneOff size={10} style={{color:'rgba(255,255,255,0.18)'}}/>
          }
          {lead.attempt_count > 0 && <RotateCcw size={9} style={{color:'#f59e0b'}}/>}
        </div>
      </div>
    </button>
  )
}

/* ─── Lead Detail ─────────────────────────────────────── */
function LeadDetail({ lead, idx, total, onStatus, onNext, onPrev }) {
  const [notes, setNotes]         = useState('')
  const [callStatus, setStatus]   = useState('pending')
  const [saving, setSaving]       = useState(false)
  const [notesSaved, setNotesSaved] = useState(false)
  const prevIdRef   = useRef(null)
  const debounceRef = useRef(null)

  // Cargar datos del lead cuando cambia
  useEffect(() => {
    if (!lead) return
    if (prevIdRef.current !== lead.assignment_id) {
      setStatus(lead.call_status || 'pending')
      setNotes(lead.notes || '')
      setNotesSaved(false)
      prevIdRef.current = lead.assignment_id
    }
  }, [lead])

  // Auto-save notas con debounce 1.5s
  useEffect(() => {
    if (!lead?.assignment_id || !notes) return
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      try {
        await leadsApi.saveNotes(lead.assignment_id, notes)
        setNotesSaved(true)
        setTimeout(() => setNotesSaved(false), 2000)
      } catch { /* silencioso */ }
    }, 1500)
    return () => clearTimeout(debounceRef.current)
  }, [notes, lead?.assignment_id])

  // Keyboard navigation — ANTES del return condicional
  useEffect(() => {
    const fn = (e) => {
      if (e.target.tagName === 'TEXTAREA') return
      if (e.key === 'ArrowDown') onNext?.()
      if (e.key === 'ArrowUp')   onPrev?.()
    }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [onNext, onPrev])

  // Return condicional DESPUÉS de todos los hooks
  if (!lead) return (
    <div className="flex-1 flex items-center justify-center"
      style={{background:'rgba(0,0,0,0.2)'}}>
      <div className="text-center" style={{color:'rgba(255,255,255,0.12)'}}>
        <Phone size={44} className="mx-auto mb-4"/>
        <p className="font-mono text-sm tracking-widest">SELECCIONA UN LEAD</p>
        <p className="text-xs mt-2" style={{color:'rgba(255,255,255,0.08)'}}>
          ← Elige de la cola o pulsa ↑↓
        </p>
      </div>
    </div>
  )

  const contacts = parseContacts(lead.contacts)
  const primary  = contacts.find(c=>c?.is_primary) || contacts[0]
  const secondary = contacts.filter(c=>!c?.is_primary).slice(0,2)
  const score    = lead.digital_score || 0

  const doStatus = async (s) => {
    if (saving) return
    setSaving(true)
    try { await onStatus(lead.assignment_id, s, notes); setStatus(s) }
    finally { setSaving(false) }
  }

  return (
    <div key={lead.assignment_id} className="flex-1 flex flex-col min-h-0 anim-scale scan-container">

      {/* ── Header ── */}
      <div className="shrink-0 px-8 pt-6 pb-4"
        style={{borderBottom:'1px solid rgba(255,255,255,0.05)',
          background:'linear-gradient(180deg,rgba(59,130,246,0.04) 0%,transparent 100%)'}}>
        <div className="flex items-start gap-5 justify-between">
          <div className="min-w-0">
            {/* Nav breadcrumb */}
            <div className="flex items-center gap-2 mb-2">
              {lead.attempt_count > 0 && (
                <span className="font-mono text-xs px-2 py-0.5 rounded"
                  style={{background:'rgba(245,158,11,.12)',color:'#f59e0b',border:'1px solid rgba(245,158,11,.2)'}}>
                  REINTENTO {lead.attempt_count+1}
                </span>
              )}
              <span className="font-mono text-xs" style={{color:'rgba(255,255,255,0.22)'}}>
                {fmt(lead.sector_tag || lead.sector)} · {fmt(lead.city)}
              </span>
            </div>

            <h1 className="text-[26px] font-bold text-white tracking-tight leading-tight mb-1">
              {lead.name}
            </h1>

            <div className="flex items-center gap-3 flex-wrap">
              <span className="font-mono text-xs" style={{color:'rgba(255,255,255,0.28)'}}>
                LEAD #{String(idx+1).padStart(3,'0')}/{String(total).padStart(3,'0')}
              </span>
              {lead.opportunity_level && (
                <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full badge-${(lead.opportunity_level||'').toLowerCase()}`}>
                  {lead.opportunity_level}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-4 shrink-0">
            {/* Keyboard hints */}
            <div className="hidden lg:flex items-center gap-1.5" style={{color:'rgba(255,255,255,0.18)'}}>
              <div className="glass-btn glass-btn-neutral px-2 py-1 text-xs !rounded-md" style={{fontSize:10}}>↑</div>
              <div className="glass-btn glass-btn-neutral px-2 py-1 text-xs !rounded-md" style={{fontSize:10}}>↓</div>
            </div>
            <ScoreArc value={score}/>
            {lead.website && (
              <a href={lead.website} target="_blank" rel="noopener noreferrer"
                className="glass-btn glass-btn-neutral flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium">
                <Globe size={11}/>Web
              </a>
            )}
          </div>
        </div>

        {/* Score bar */}
        <div className="flex items-center gap-3 mt-4">
          <div className="flex-1 h-[3px] rounded-full" style={{background:'rgba(255,255,255,0.06)'}}>
            <div className="h-full rounded-full transition-all duration-700"
              style={{
                width:`${score}%`,
                background: score>=70 ? 'linear-gradient(90deg,#10b981,#34d399)'
                          : score>=40 ? 'linear-gradient(90deg,#f59e0b,#fbbf24)'
                          : 'linear-gradient(90deg,var(--accent),var(--accent-hi))'
              }}/>
          </div>
          <span className="font-mono text-xs tabular-nums shrink-0"
            style={{color:'rgba(255,255,255,0.35)',minWidth:28}}>{score}/100</span>
        </div>
      </div>

      {/* ── Scrollable body ── */}
      <div className="flex-1 overflow-y-auto px-8 py-5 space-y-5 min-h-0">

        {/* Opening line */}
        {lead.opening_line && (
          <div className="rounded-2xl p-4"
            style={{background:'rgba(59,130,246,0.07)',border:'1px solid rgba(220,38,38,0.2)'}}>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-1.5 h-1.5 rounded-full"
                style={{background:'#3b82f6',animation:'pulse-green 1.8s infinite'}}/>
              <span className="font-mono text-xs font-bold" style={{color:'#3b82f6',letterSpacing:'0.1em'}}>
                APERTURA SUGERIDA
              </span>
            </div>
            <p className="text-sm text-white italic leading-relaxed">"{lead.opening_line}"</p>
          </div>
        )}

        {/* DM Section */}
        <div>
          <p className="font-mono text-xs mb-3 tracking-widest font-bold"
            style={{color:'rgba(255,255,255,0.22)'}}>
            DECISION MAKERS — TELÉFONO VERIFICADO APOLLO
          </p>
          <div className="grid grid-cols-3 gap-3">

            {/* DM 1 — Contacto principal con MÓVIL */}
            {primary ? (
              <div className="rounded-2xl p-4 col-span-1 relative overflow-hidden"
                style={{background:'rgba(59,130,246,0.06)',border:'1px solid rgba(59,130,246,0.22)'}}>
                <div className="absolute top-0 right-0 w-16 h-16 rounded-full -mr-6 -mt-6"
                  style={{background:'rgba(59,130,246,0.06)',filter:'blur(12px)'}}/>
                <p className="font-mono text-xs mb-2.5 font-bold"
                  style={{color:'#3b82f6',letterSpacing:'0.08em'}}>CONTACTO PRINCIPAL</p>
                <p className="font-bold text-white text-[15px] mb-0.5">{primary.name||'—'}</p>
                <p className="text-xs italic mb-3" style={{color:'rgba(255,255,255,0.4)'}}>{primary.role||'—'}</p>
                {/* Solo móvil en DM1 */}
                {primary.phone ? (
                  <a href={`tel:${primary.phone}`}
                    className="flex items-center gap-2 font-mono font-bold"
                    style={{color:'#10b981',fontSize:16}}>
                    <Phone size={14}/>{primary.phone}
                  </a>
                ) : (
                  <p className="font-mono text-xs" style={{color:'rgba(255,255,255,0.2)'}}>Sin móvil verificado</p>
                )}
                {primary.linkedin_url && (
                  <a href={primary.linkedin_url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs mt-2"
                    style={{color:'rgba(96,165,250,0.7)'}}>
                    <Link2 size={10}/>LinkedIn
                  </a>
                )}
              </div>
            ) : (
              <div className="rounded-2xl p-4 col-span-1"
                style={{background:'rgba(255,255,255,0.01)',border:'1px dashed rgba(255,255,255,0.06)'}}>
                <p className="text-xs font-mono" style={{color:'rgba(255,255,255,0.15)'}}>Sin contacto principal</p>
              </div>
            )}

            {/* DM 2 y 3 — Solo nombre y cargo relevante */}
            {[0,1].map(i => {
              const dm = secondary[i]
              return dm ? (
                <div key={i} className="rounded-2xl p-4"
                  style={{background:'rgba(255,255,255,0.025)',border:'1px solid rgba(255,255,255,0.07)'}}>
                  <p className="font-mono text-xs mb-2 font-bold"
                    style={{color:'rgba(255,255,255,0.28)',letterSpacing:'0.08em'}}>
                    DECISOR {i+2}
                  </p>
                  <p className="font-bold text-white text-sm mb-1">{dm.name||'—'}</p>
                  <p className="text-sm font-semibold" style={{color:'rgba(255,255,255,0.55)'}}>{dm.role||'—'}</p>
                  {dm.email && (
                    <p className="text-xs mt-2 truncate" style={{color:'rgba(255,255,255,0.35)'}}>{dm.email}</p>
                  )}
                </div>
              ) : (
                <div key={i} className="rounded-2xl p-4"
                  style={{background:'rgba(255,255,255,0.01)',border:'1px dashed rgba(255,255,255,0.05)'}}>
                  <p className="text-xs font-mono" style={{color:'rgba(255,255,255,0.12)'}}>Sin decisor</p>
                </div>
              )
            })}
          </div>
        </div>

        {/* Hooks CLIENDER */}
        {(lead.hook_captacion || lead.hook_crm || lead.hook_visibilidad) && (
          <div>
            <p className="font-mono text-xs mb-3 tracking-widest font-bold"
              style={{color:'rgba(255,255,255,0.22)'}}>OPORTUNIDAD HBD REVOLUTION</p>
            <div className="grid grid-cols-3 gap-3">
              {[
                {k:'hook_captacion',  label:'SALES / CRM',    color:'#10b981', cls:'opp-sales'},
                {k:'hook_crm',        label:'TECH / IA',      color:'#3b82f6', cls:'opp-tech'},
                {k:'hook_visibilidad',label:'CONTENIDO AV',   color:'#f97316', cls:'opp-av'},
              ].map(({k,label,color,cls}) => lead[k] ? (
                <div key={k} className={`${cls} rounded-2xl p-3.5`}>
                  <p className="font-mono text-xs font-bold mb-1.5" style={{color,letterSpacing:'0.06em'}}>{label}</p>
                  <p className="text-xs leading-relaxed" style={{color:'rgba(255,255,255,0.58)'}}>{lead[k]}</p>
                </div>
              ) : null)}
            </div>
          </div>
        )}

        {/* Oportunidades detalladas */}
        {(lead.opportunity_sales || lead.opportunity_tech || lead.opportunity_av) && (
          <div>
            <p className="font-mono text-xs mb-3 tracking-widest font-bold"
              style={{color:'rgba(255,255,255,0.22)'}}>OPORTUNIDADES DETALLADAS</p>
            <div className="grid grid-cols-3 gap-3">
              {[
                {d:lead.opportunity_sales, label:'SALES/CRM', color:'#10b981', cls:'opp-sales'},
                {d:lead.opportunity_tech,  label:'TECH/IA',   color:'#3b82f6', cls:'opp-tech'},
                {d:lead.opportunity_av,    label:'AV',        color:'#f97316', cls:'opp-av'},
              ].map(({d,label,color,cls}) => d ? (
                <div key={label} className={`${cls} rounded-2xl p-3.5`}>
                  <p className="font-mono text-xs font-bold mb-1.5" style={{color}}>{label}</p>
                  <p className="text-xs whitespace-pre-line leading-relaxed"
                    style={{color:'rgba(255,255,255,0.55)'}}>{d}</p>
                </div>
              ) : null)}
            </div>
          </div>
        )}

        {/* Ecosistema digital — siempre visible */}
        <div>
          <p className="font-mono text-xs mb-3 tracking-widest font-bold"
            style={{color:'rgba(255,255,255,0.22)'}}>ECOSISTEMA DIGITAL — DIAGNÓSTICO</p>
          <div className="rounded-2xl overflow-hidden"
            style={{background:'rgba(255,255,255,0.02)',border:'1px solid rgba(255,255,255,0.05)'}}>
            {[
              {label:'Presencia web',
               val: lead.presencia_web || (lead.website ? `Activa · Score ${lead.seo_score||0}/100` : 'Sin web detectada'),
               ok: !!lead.website || !!lead.presencia_web},
              {label:'Redes sociales',
               val: lead.redes_sociales || [
                 lead.social_facebook && 'Facebook',
                 lead.social_instagram && 'Instagram',
                 lead.social_linkedin && 'LinkedIn',
                 lead.social_youtube && 'YouTube',
               ].filter(Boolean).join(', ') || 'Sin redes detectadas',
               ok: !!(lead.redes_sociales || lead.social_facebook || lead.social_instagram)},
              {label:'CRM detectado',
               val: lead.has_crm || 'No detectado',
               ok: !!lead.has_crm},
              {label:'Captación leads',
               val: lead.captacion_leads || (lead.has_facebook_pixel ? 'Pixel activo · Sin funnel estructurado' : 'Sin funnel estructurado'),
               ok: !!(lead.captacion_leads || lead.has_facebook_pixel)},
              {label:'Email marketing',
               val: lead.email_marketing || 'Sin secuencias automatizadas detectadas',
               ok: !!lead.email_marketing},
              {label:'Video / Contenido',
               val: lead.video_contenido || 'Sin producción audiovisual detectada',
               ok: !!lead.video_contenido},
              {label:'SEO',
               val: lead.seo_info || (lead.seo_score ? `Score ${lead.seo_score}/100` : 'Posicionamiento básico'),
               ok: (lead.seo_score||0) >= 40},
              {label:'Oportunidad HBD',
               val: lead.oportunidad_hbd || `${lead.opportunity_level||'ALTA'} — Score ${lead.digital_score||0}/100`,
               ok: true},
            ].map(({label,val,ok})=>(
              <div key={label} className="flex items-start justify-between px-4 py-2.5 gap-4"
                style={{borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
                <span className="font-mono text-xs font-semibold shrink-0 w-36"
                  style={{color:'rgba(255,255,255,0.4)'}}>{label}</span>
                <span className="text-xs text-right leading-relaxed"
                  style={{color: ok ? '#e2e8f0' : 'rgba(255,255,255,0.4)'}}>{val}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Señales digitales reales */}
        {(lead.has_facebook_pixel || lead.has_google_ads || lead.social_facebook || lead.social_instagram) && (
          <div className="flex flex-wrap gap-2">
            {lead.has_facebook_pixel && (
              <span className="font-mono text-xs px-2.5 py-1 rounded-full"
                style={{background:'rgba(59,130,246,0.1)',color:'#60a5fa',border:'1px solid rgba(59,130,246,0.2)'}}>
                FB Pixel ✓
              </span>
            )}
            {lead.has_google_ads && (
              <span className="font-mono text-xs px-2.5 py-1 rounded-full"
                style={{background:'rgba(245,158,11,0.1)',color:'#fbbf24',border:'1px solid rgba(245,158,11,0.2)'}}>
                Google Ads ✓
              </span>
            )}
            {lead.social_facebook && (
              <a href={`https://${lead.social_facebook}`} target="_blank" rel="noopener noreferrer"
                className="font-mono text-xs px-2.5 py-1 rounded-full transition-colors"
                style={{background:'rgba(255,255,255,0.05)',color:'rgba(255,255,255,0.5)',border:'1px solid rgba(255,255,255,0.08)'}}>
                Facebook ↗
              </a>
            )}
            {lead.social_instagram && (
              <a href={`https://${lead.social_instagram}`} target="_blank" rel="noopener noreferrer"
                className="font-mono text-xs px-2.5 py-1 rounded-full transition-colors"
                style={{background:'rgba(255,255,255,0.05)',color:'rgba(255,255,255,0.5)',border:'1px solid rgba(255,255,255,0.08)'}}>
                Instagram ↗
              </a>
            )}
            {lead.social_linkedin && (
              <a href={`https://${lead.social_linkedin}`} target="_blank" rel="noopener noreferrer"
                className="font-mono text-xs px-2.5 py-1 rounded-full transition-colors"
                style={{background:'rgba(255,255,255,0.05)',color:'rgba(255,255,255,0.5)',border:'1px solid rgba(255,255,255,0.08)'}}>
                LinkedIn ↗
              </a>
            )}
          </div>
        )}

        {/* Activity log */}
        <div className="rounded-2xl p-4"
          style={{background:'rgba(0,0,0,0.5)',border:'1px solid rgba(255,255,255,0.04)',fontFamily:"'DM Mono',monospace"}}>
          <p className="text-xs mb-2.5 font-bold tracking-wider" style={{color:'rgba(255,255,255,0.22)'}}>LOG</p>
          {[
            `[SYS] Lead obtenido vía Apollo.io · fuente verified`,
            primary?.phone ? `[TEL] ${primary.phone} · disponible` : `[TEL] Sin número verificado`,
            lead.attempt_count>0 ? `[RETRY] Intento ${lead.attempt_count+1} · no contestó antes` : null,
            `[STATUS] ${callStatus === 'pending' ? 'listo para llamada' : callStatus}`,
          ].filter(Boolean).map((line,i)=>(
            <p key={i} className="text-xs leading-relaxed"
              style={{color: line.includes('disponible') ? '#10b981' : line.includes('verified') ? 'rgba(220,38,38,0.8)' : 'rgba(255,255,255,0.35)'}}>
              {line}
            </p>
          ))}
        </div>

        {/* Notes con auto-save */}
        <div style={{position:'relative'}}>
          <textarea
            value={notes}
            onChange={e => { setNotes(e.target.value); setNotesSaved(false) }}
            placeholder="Escribe tus notas aquí... se guardan automáticamente"
            rows={3}
            className="glass-input w-full px-4 py-3 text-sm resize-none"
            style={{fontFamily:"'DM Mono',monospace",paddingRight:80}}
          />
          <div style={{position:'absolute',bottom:10,right:12,
            fontFamily:"'DM Mono',monospace",fontSize:10,
            color: notesSaved ? '#10b981' : 'rgba(255,255,255,0.2)',
            transition:'color .3s ease'}}>
            {notesSaved ? '✓ guardado' : notes ? 'guardando...' : ''}
          </div>
        </div>
      </div>

      {/* ── Action bar — 3 estados centrados + LLAMAR ── */}
      <div className="shrink-0 px-8 py-4 flex items-center justify-between gap-3"
        style={{borderTop:'1px solid rgba(255,255,255,0.05)',
          background:'linear-gradient(0deg,rgba(0,0,0,0.35) 0%,transparent 100%)'}}>

        {/* Los 3 estados juntos en el centro-izquierda */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* AGENDADO — abre el link de booking + registra estado */}
          <a href="https://info.cliender.com/widget/bookings/ccl"
            target="_blank" rel="noopener noreferrer"
            onClick={()=>doStatus('agendado')}
            className="glass-btn flex items-center gap-1.5 px-4 py-2.5 text-sm font-bold"
            style={{
              background: callStatus==='agendado' ? 'rgba(16,185,129,0.28)' : 'rgba(16,185,129,0.1)',
              border:`1px solid ${callStatus==='agendado' ? 'rgba(52,211,153,0.5)' : 'rgba(16,185,129,0.22)'}`,
              color:'#34d399', textDecoration:'none',
              boxShadow: callStatus==='agendado' ? '0 0 20px rgba(16,185,129,0.3)' : 'none',
            }}>
            <CheckCircle2 size={13}/>AGENDADO
          </a>

          {/* NO CONTESTA */}
          <button onClick={()=>doStatus('no_answer')} disabled={saving}
            className="glass-btn flex items-center gap-1.5 px-4 py-2.5 text-sm font-bold"
            style={{
              background: callStatus==='no_answer' ? 'rgba(245,158,11,0.22)' : 'rgba(245,158,11,0.08)',
              border:`1px solid ${callStatus==='no_answer' ? 'rgba(251,191,36,0.45)' : 'rgba(245,158,11,0.2)'}`,
              color:'#fbbf24',
              boxShadow: callStatus==='no_answer' ? '0 0 18px rgba(245,158,11,0.25)' : 'none',
            }}>
            <PhoneMissed size={13}/>NO CONTESTA
          </button>

          {/* NO INTERESADO */}
          <button onClick={()=>doStatus('no_interest')} disabled={saving}
            className="glass-btn flex items-center gap-1.5 px-4 py-2.5 text-sm font-bold"
            style={{
              background: callStatus==='no_interest' ? 'rgba(220,38,38,0.28)' : 'rgba(220,38,38,0.1)',
              border:`1px solid ${callStatus==='no_interest' ? 'rgba(239,68,68,0.5)' : 'rgba(220,38,38,0.22)'}`,
              color:'#f87171',
              boxShadow: callStatus==='no_interest' ? '0 0 20px rgba(220,38,38,0.3)' : 'none',
            }}>
            <XCircle size={13}/>NO INTERESADO
          </button>
        </div>

        {/* LLAMAR — derecha */}
        {primary?.phone ? (
          <a href={`tel:${primary.phone}`}
            className="glass-btn glass-btn-blue flex items-center gap-2.5 px-7 py-3 text-[13px] font-bold tracking-wider">
            <Phone size={15}/>LLAMAR
          </a>
        ) : (
          <button disabled
            className="glass-btn glass-btn-neutral flex items-center gap-2.5 px-7 py-3 text-[13px] font-bold opacity-25">
            <PhoneOff size={15}/>SIN TEL
          </button>
        )}
      </div>
    </div>
  )
}

/* ─── Stats strip ─────────────────────────────────────── */
function StatStrip({ stats, total }) {
  const done = (stats.closed||0)+(stats.rejected||0)+(stats.no_answer||0)
  const pct  = total > 0 ? Math.round((done/total)*100) : 0
  return (
    <div className="flex items-center gap-5">
      {[
        {label:'HOY',       val:total,           color:'rgba(255,255,255,0.55)'},
        {label:'AGENDADOS',  val:stats.closed||0,  color:'#10b981'},
        {label:'PENDIENTES',val:stats.pending||0, color:'rgba(59,130,246,0.8)'},
      ].map(({label,val,color})=>(
        <div key={label} className="flex items-center gap-1.5">
          <span className="font-mono text-xs" style={{color:'rgba(255,255,255,0.28)'}}>{label}</span>
          <strong className="font-mono" style={{color, fontSize:14, lineHeight:1}}>{val}</strong>
        </div>
      ))}
      <div className="flex items-center gap-2 ml-1 pl-4" style={{borderLeft:'1px solid rgba(255,255,255,0.06)'}}>
        <div className="w-16 h-[3px] rounded-full" style={{background:'rgba(255,255,255,0.06)'}}>
          <div className="h-full rounded-full transition-all duration-700"
            style={{width:`${pct}%`,background:'linear-gradient(90deg,var(--accent),#10b981)'}}/>
        </div>
        <span className="font-mono text-xs" style={{color:'rgba(255,255,255,0.28)'}}>{pct}%</span>
      </div>
    </div>
  )
}

/* ─── Main Dashboard ──────────────────────────────────── */
export default function Dashboard() {
  const { user, logout } = useAuth()
  const isAdmin = user?.role === 'admin'

  // Nav: Analytics solo para admins
  const NAV = [
    {id:'centralita', label:'Centralita', Icon:Phone},
    {id:'pipeline',   label:'Pipeline',   Icon:BarChart3},
    {id:'notas',      label:'Notas',      Icon:FileText},
    ...(isAdmin ? [{id:'analytics', label:'Analytics', Icon:Activity}] : []),
    {id:'ajustes',    label:'Ajustes',    Icon:Settings},
  ]

  const [todayData, setTodayData]   = useState({leads:[],total:0,pending:0})
  const [stats, setStats]           = useState({})
  const [selIdx, setSelIdx]         = useState(0)
  const [view, setView]             = useState('centralita')
  const [loading, setLoading]       = useState(true)
  const [assigning, setAssigning]   = useState(false)
  const [lastAssign, setLastAssign] = useState('')
  const [mobileDetail, setMobileDetail] = useState(false) // mobile: mostrar detalle
  const [isMobile, setIsMobile]     = useState(window.innerWidth < 768)

  useEffect(() => {
    const fn = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', fn)
    return () => window.removeEventListener('resize', fn)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [lr, sr] = await Promise.all([leadsApi.today(), leadsApi.stats()])
      setTodayData(lr.data)
      setStats(sr.data)
    } catch(e) { console.error('load error', e) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const handleAssign = async () => {
    setAssigning(true)
    try {
      await leadsApi.assignNow()
      await load()
      setLastAssign(new Date().toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'}))
      setSelIdx(0)
    } catch(e) { console.error('assign error', e) }
    finally { setAssigning(false) }
  }

  const handleStatus = useCallback(async (assignmentId, status, notes) => {
    await leadsApi.updateStatus(assignmentId, status, notes)
    await load()
  }, [load])

  // Build ordered list: pending/no_answer first, then done
  const ordered = [
    ...(todayData.leads||[]).filter(l=>['pending','no_answer'].includes(l.call_status)),
    ...(todayData.leads||[]).filter(l=>['agendado','no_interest'].includes(l.call_status)),
  ]
  const selected = ordered[selIdx] || null
  const total    = ordered.length

  const goNext = useCallback(()=>{
    if(selIdx < total-1) { setSelIdx(i=>i+1); if(isMobile) setMobileDetail(true) }
  }, [selIdx,total,isMobile])
  const goPrev = useCallback(()=>{
    if(selIdx > 0) setSelIdx(i=>i-1)
    else if(isMobile) setMobileDetail(false)
  }, [selIdx,isMobile])

  const gridCols = isMobile ? '1fr' : '220px 1fr'
  const gridRows = isMobile ? '56px auto 1fr 56px' : '56px 1fr'

  return (
    <div style={{display:'grid', gridTemplateRows:gridRows, gridTemplateColumns:gridCols,
      height:'100dvh', background:'var(--bg)', overflow:'hidden'}}>

      {/* ══════════════════ TOPBAR ══════════════════ */}
      <div style={{
        gridColumn:'1/-1', borderBottom:'1px solid var(--border)',
        background:'rgba(4,4,10,0.92)', backdropFilter:'blur(24px)',
        display:'flex', alignItems:'center', padding:'0 16px', gap:12, zIndex:20}}>

        {/* Logo */}
        <div style={{display:'flex',alignItems:'center',gap:8,flexShrink:0}}>
          <div style={{width:28,height:28,borderRadius:7,
            background:'linear-gradient(135deg,rgba(59,130,246,.6),rgba(29,78,216,.4))',
            border:'1px solid rgba(96,165,250,.35)',
            display:'flex',alignItems:'center',justifyContent:'center'}}>
            <Phone size={12} color="#fff"/>
          </div>
          <span style={{fontWeight:800,fontSize:13,letterSpacing:'0.05em'}}>
            <span style={{color:'#3b82f6'}}>LEAD</span><span style={{color:'#fff'}}>UP</span>
          </span>
        </div>

        {/* Status dot — oculto en mobile */}
        {!isMobile && (
          <div style={{display:'flex',alignItems:'center',gap:8,marginLeft:16}}>
            <div style={{width:7,height:7,borderRadius:'50%',background:'#3b82f6',
              animation:'pulse-red 2s infinite',boxShadow:'0 0 6px rgba(59,130,246,0.4)'}}/>
            <span className="font-mono text-xs" style={{color:'rgba(255,255,255,0.35)'}}>
              OPTIMAL
            </span>
          </div>
        )}

        {!isMobile && <Clock/>}

        <Clock/>

        {/* Right side */}
        {/* Stats — oculto en mobile */}
        <div style={{marginLeft:'auto',display:'flex',alignItems:'center',gap:isMobile?8:16}}>
          {!isMobile && <StatStrip stats={stats} total={total}/>}
          <div style={{paddingLeft:isMobile?0:16,
            borderLeft:isMobile?'none':'1px solid rgba(255,255,255,0.06)',
            display:'flex',alignItems:'center',gap:8}}>
            {!isMobile && (
              <span className="font-mono text-xs" style={{color:'rgba(255,255,255,0.3)'}}>
                {user?.name?.toUpperCase()}
              </span>
            )}
            <button onClick={logout} className="glass-btn glass-btn-neutral" style={{padding:'6px 8px'}}>
              <LogOut size={12}/>
            </button>
          </div>
        </div>
      </div>

      {/* ══════════════════ WELCOME BANNER ══════════════════ */}
      <div style={{gridColumn:'1/-1',
        background:'linear-gradient(90deg,rgba(59,130,246,0.08) 0%,rgba(59,130,246,0.03) 100%)',
        borderBottom:'1px solid rgba(59,130,246,0.12)',
        padding:'8px 20px', display:'flex', alignItems:'center', justifyContent:'space-between',
        flexShrink:0,
        ...(isMobile ? {} : {display:'none'}) }}>
        {isMobile && (
          <>
            <div>
              <p style={{fontSize:15,fontWeight:700,color:'#fff'}}>
                Bienvenido, {user?.name} 👋
              </p>
              <p className="font-mono text-xs" style={{color:'rgba(255,255,255,0.4)'}}>
                {total} leads hoy · {stats.pending||0} pendientes
              </p>
            </div>
            <StatStrip stats={stats} total={total}/>
          </>
        )}
      </div>

      {/* Welcome banner desktop — inline en nav */}
      {/* ══════════════════ NAV (DESKTOP ONLY) ══════════════════ */}
      {!isMobile && (
      <div style={{borderRight:'1px solid var(--border)',display:'flex',flexDirection:'column',
        background:'rgba(4,4,10,0.6)',backdropFilter:'blur(20px)',zIndex:10}}>

        {/* Welcome desktop */}
        <div style={{padding:'16px 20px 0', borderBottom:'1px solid rgba(255,255,255,0.04)', marginBottom:8}}>
          <p style={{fontSize:12,fontWeight:700,color:'#fff',marginBottom:2}}>
            Hola, {user?.name} 👋
          </p>
          <p className="font-mono" style={{fontSize:10,color:'rgba(255,255,255,0.3)'}}>
            {isAdmin ? 'ADMINISTRADOR' : 'COMERCIAL'} · {new Date().toLocaleDateString('es-ES',{weekday:'short',day:'numeric',month:'short'})}
          </p>
        </div>

        <div style={{flex:1,paddingTop:8}}>
          {NAV.map(({id,label,Icon})=>(
            <button key={id}
              onClick={()=>setView(id)}
              className={view===id ? 'nav-active' : ''}
              style={{
                width:'100%', display:'flex', alignItems:'center', gap:12,
                padding:'12px 20px', fontSize:13, cursor:'pointer',
                color:'rgba(255,255,255,0.38)', background:'transparent',
                border:'none', borderRight:'2px solid transparent',
                fontFamily:'inherit', fontWeight: view===id ? 600 : 400,
                transition:'all 150ms ease',
              }}
              onMouseOver={e=>{ if(view!==id) e.currentTarget.style.color='rgba(255,255,255,0.7)' }}
              onMouseOut={e=>{ if(view!==id) e.currentTarget.style.color='rgba(255,255,255,0.38)' }}>
              <Icon size={15}/>
              {label}
            </button>
          ))}
        </div>

        {/* Assign button — admin only */}
        {user?.role === 'admin' && (
          <div style={{padding:16}}>
            <button onClick={handleAssign} disabled={assigning}
              className="glass-btn glass-btn-red"
              style={{width:'100%',padding:'10px 0',fontSize:12,fontWeight:700,
                display:'flex',alignItems:'center',justifyContent:'center',gap:8,letterSpacing:'0.05em'}}>
              {assigning
                ? <><RotateCcw size={12} style={{animation:'spin 1s linear infinite'}}/>ASIGNANDO...</>
                : <><Zap size={12}/>ASIGNAR LEADS</>
              }
            </button>
            {lastAssign && (
              <p className="font-mono text-xs text-center mt-2" style={{color:'rgba(255,255,255,0.2)'}}>
                ÚLTIMA: {lastAssign}
              </p>
            )}
          </div>
        )}
      </div>
      )} {/* end desktop nav */}

      {/* ══════════════════ CONTENT ══════════════════ */}
      <div style={{display:'flex',overflow:'hidden',minHeight:0}}>

        {view === 'centralita' && (
          <>
            {/* ── Queue ── desktop: 280px fijo | mobile: full-width o hidden */}
            <div style={{
              width: isMobile ? '100%' : 280,
              flexShrink:0, display: isMobile && mobileDetail ? 'none' : 'flex',
              flexDirection:'column',
              borderRight: isMobile ? 'none' : '1px solid var(--border)',
              background:'rgba(4,4,10,0.4)', overflow:'hidden',
            }}>
              {/* Queue header */}
              <div style={{
                padding:'12px 16px', borderBottom:'1px solid var(--border)',
                display:'flex', alignItems:'center', justifyContent:'space-between',
                flexShrink:0,
              }}>
                <span className="font-mono text-xs font-bold tracking-widest"
                  style={{color:'rgba(255,255,255,0.25)'}}>
                  COLA — {total} LEADS
                </span>
                <div style={{display:'flex',gap:4}}>
                  <button onClick={goPrev} disabled={selIdx===0}
                    className="glass-btn glass-btn-neutral" style={{padding:'4px 6px',borderRadius:6}}>
                    <ArrowUp size={11}/>
                  </button>
                  <button onClick={goNext} disabled={selIdx>=total-1}
                    className="glass-btn glass-btn-neutral" style={{padding:'4px 6px',borderRadius:6}}>
                    <ArrowDown size={11}/>
                  </button>
                </div>
              </div>

              {/* Queue list */}
              <div style={{flex:1, overflowY:'auto'}}>
                {loading ? (
                  <div style={{padding:16}}>
                    {[...Array(6)].map((_,i)=>(
                      <div key={i} style={{height:56,borderRadius:12,marginBottom:8,
                        background:'rgba(255,255,255,0.025)',animation:'pulse-green 1.6s infinite',
                        animationDelay:`${i*120}ms`}}/>
                    ))}
                  </div>
                ) : ordered.length === 0 ? (
                  <div style={{display:'flex',flexDirection:'column',alignItems:'center',
                    justifyContent:'center',height:'100%',textAlign:'center',padding:24}}>
                    <Phone size={32} style={{color:'rgba(255,255,255,0.1)',marginBottom:12}}/>
                    <p className="font-mono text-xs tracking-widest"
                      style={{color:'rgba(255,255,255,0.18)'}}>SIN LEADS HOY</p>
                    {user?.role==='admin' && (
                      <p className="text-xs mt-2" style={{color:'rgba(255,255,255,0.12)'}}>
                        Pulsa "Asignar leads"
                      </p>
                    )}
                  </div>
                ) : ordered.map((lead,i)=>(
                  <QueueItem
                    key={lead.assignment_id||lead.id}
                    lead={lead} idx={i}
                    active={i===selIdx}
                    onClick={()=>{ setSelIdx(i); if(isMobile) setMobileDetail(true) }}
                  />
                ))}
              </div>
            </div>

            {/* ── Lead Detail — mobile: full screen cuando mobileDetail=true ── */}
            <div style={{
              display: isMobile && !mobileDetail ? 'none' : 'flex',
              flex:1, flexDirection:'column', minWidth:0,
            }}>
              {/* Botón volver en mobile */}
              {isMobile && mobileDetail && (
                <button onClick={()=>setMobileDetail(false)}
                  style={{display:'flex',alignItems:'center',gap:8,padding:'10px 16px',
                    background:'rgba(255,255,255,0.03)',border:'none',
                    borderBottom:'1px solid rgba(255,255,255,0.05)',
                    color:'rgba(255,255,255,0.6)',cursor:'pointer',fontSize:13}}>
                  <ArrowDown size={14} style={{transform:'rotate(90deg)'}}/> Volver a la lista
                </button>
              )}
              <LeadDetail
                lead={selected}
                idx={selIdx}
                total={total}
                onStatus={handleStatus}
                onNext={goNext}
                onPrev={goPrev}
              />
            </div>
          </>
        )}

        {view === 'pipeline'  && <Pipeline/>}
        {view === 'notas'     && <Notas/>}
        {view === 'analytics' && (!isAdmin
          ? <div className="flex-1 flex items-center justify-center">
              <p className="font-mono text-sm" style={{color:'rgba(255,255,255,0.2)'}}>SOLO ADMINISTRADORES</p>
            </div>
          : <Analytics/>)}
        {view === 'ajustes'   && <Ajustes/>}
      </div>

      {/* ══════════════════ BOTTOM NAV MOBILE ══════════════════ */}
      {isMobile && (
        <div style={{
          gridColumn:'1/-1',
          display:'flex', alignItems:'center', justifyContent:'space-around',
          background:'rgba(4,4,10,0.95)', backdropFilter:'blur(24px)',
          borderTop:'1px solid rgba(255,255,255,0.06)', zIndex:20,
          paddingBottom:'env(safe-area-inset-bottom)',
        }}>
          {NAV.map(({id,label,Icon})=>(
            <button key={id} onClick={()=>{ setView(id); setMobileDetail(false) }}
              style={{
                flex:1, display:'flex', flexDirection:'column', alignItems:'center',
                gap:3, padding:'10px 4px', background:'transparent', border:'none',
                cursor:'pointer', transition:'all 150ms ease',
                color: view===id ? '#3b82f6' : 'rgba(255,255,255,0.35)',
              }}>
              <Icon size={18}/>
              <span style={{fontSize:10,fontFamily:"'DM Mono',monospace",fontWeight:view===id?700:400}}>
                {label}
              </span>
              {view===id && (
                <div style={{width:4,height:4,borderRadius:'50%',background:'#3b82f6',
                  boxShadow:'0 0 6px rgba(59,130,246,0.6)'}}/>
              )}
            </button>
          ))}
          {isAdmin && (
            <button onClick={handleAssign} disabled={assigning}
              style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',
                gap:3,padding:'10px 4px',background:'transparent',border:'none',cursor:'pointer',
                color: assigning ? 'rgba(255,255,255,0.3)' : 'rgba(59,130,246,0.8)'}}>
              {assigning ? <RotateCcw size={18} style={{animation:'spin 1s linear infinite'}}/> : <Zap size={18}/>}
              <span style={{fontSize:10,fontFamily:"'DM Mono',monospace"}}>Asignar</span>
            </button>
          )}
        </div>
      )}

      <style>{`@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}
