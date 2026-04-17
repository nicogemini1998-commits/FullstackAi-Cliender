import { useState, useEffect } from 'react'
import {
  X, Globe, Phone, Mail, Link2, Star, TrendingUp, Cpu, Video,
  ChevronLeft, ChevronRight, PhoneCall, CheckCircle2, XCircle,
  PhoneMissed, Clock, ExternalLink,
} from 'lucide-react'
import { companies as companiesApi } from '../lib/api'

const CALL_STATUS = {
  closed:    { label: 'Cliente contactado', icon: CheckCircle2, cls: 'status-closed' },
  rejected:  { label: 'No lo coge',         icon: XCircle,      cls: 'status-rejected' },
  no_answer: { label: 'Sin contestar',      icon: PhoneMissed,  cls: 'status-no_answer' },
  pending:   { label: 'Pendiente llamar',   icon: Clock,        cls: 'status-pending' },
}

const LEVEL = {
  ALTA:  { cls: 'badge-alta',  dot: '#34d399' },
  MEDIA: { cls: 'badge-media', dot: '#fbbf24' },
  BAJA:  { cls: 'badge-baja',  dot: '#9ca3af' },
}

function ScoreArc({ value = 0 }) {
  const r = 22, c = 2 * Math.PI * r
  const filled = (value / 100) * c
  const color = value >= 70 ? '#34d399' : value >= 40 ? '#fbbf24' : '#f87171'
  return (
    <div className="relative w-14 h-14 flex items-center justify-center">
      <svg width="56" height="56" className="-rotate-90">
        <circle cx="28" cy="28" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="3.5"/>
        <circle cx="28" cy="28" r={r} fill="none" stroke={color} strokeWidth="3.5"
          strokeDasharray={`${filled} ${c}`} strokeLinecap="round"
          style={{filter:`drop-shadow(0 0 8px ${color}88)`}}/>
      </svg>
      <span className="absolute text-sm font-bold" style={{color}}>{value}</span>
    </div>
  )
}

function EcoRow({ label, value, highlight }) {
  return (
    <div className="grid grid-cols-[140px,1fr] gap-3 py-2.5 border-b" style={{borderColor:'rgba(255,255,255,0.05)'}}>
      <span className="text-xs font-semibold" style={{color:'rgba(255,255,255,0.5)'}}>{label}</span>
      <span className="text-xs" style={{color: highlight ? '#34d399' : 'rgba(255,255,255,0.65)'}}>{value || '—'}</span>
    </div>
  )
}

export default function CompanyModal({ company, onClose, onPrev, onNext, hasPrev, hasNext, cardIndex, total }) {
  const [callStatus, setCallStatus]   = useState(company?.last_call_status || null)
  const [notes, setNotes]             = useState('')
  const [saving, setSaving]           = useState(false)
  const [detail, setDetail]           = useState(null)

  // Cargar ficha completa (con todos los campos)
  useEffect(() => {
    if (!company) return
    companiesApi.get(company.id).then(r => setDetail(r.data)).catch(() => setDetail(company))
    setCallStatus(company.last_call_status || null)
    setNotes('')
  }, [company?.id])

  useEffect(() => {
    const onKey = e => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight' && hasNext) onNext()
      if (e.key === 'ArrowLeft' && hasPrev) onPrev()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [hasNext, hasPrev])

  const data = detail || company
  if (!data) return null

  const primary   = data.contacts?.find(c => c.is_primary) || data.contacts?.[0]
  const secondary = data.contacts?.filter(c => !c.is_primary).slice(0, 2) || []
  const lvl       = LEVEL[data.opportunity_level]
  const status    = CALL_STATUS[callStatus] || CALL_STATUS.pending

  const handleStatus = async s => {
    setSaving(true)
    try {
      await companiesApi.updateStatus(data.id, s, notes, primary?.id)
      setCallStatus(s)
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto py-6 px-4"
      style={{background:'rgba(0,0,0,0.8)', backdropFilter:'blur(8px)'}}
      onClick={e => e.target === e.currentTarget && onClose()}>

      <div className="relative w-full max-w-3xl"
        style={{
          background:'linear-gradient(135deg,rgba(15,20,40,0.98),rgba(5,5,12,0.99))',
          border:'1px solid rgba(255,255,255,0.08)',
          borderRadius:'24px',
          boxShadow:'0 40px 120px rgba(0,0,0,0.7)',
        }}>

        {/* ── Top bar: navegación + cerrar ── */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3"
          style={{borderBottom:'1px solid rgba(255,255,255,0.05)'}}>
          <div className="flex items-center gap-2">
            <button disabled={!hasPrev} onClick={onPrev}
              className="glass-btn glass-btn-neutral p-1.5 disabled:opacity-20">
              <ChevronLeft size={14}/>
            </button>
            <span className="text-xs" style={{color:'rgba(255,255,255,0.3)'}}>
              {cardIndex} / {total}
            </span>
            <button disabled={!hasNext} onClick={onNext}
              className="glass-btn glass-btn-neutral p-1.5 disabled:opacity-20">
              <ChevronRight size={14}/>
            </button>
          </div>
          <div className="flex items-center gap-2">
            {/* Status badge */}
            <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1 rounded-full ${status.cls}`}>
              <status.icon size={11}/>
              {status.label}
            </span>
            <button onClick={onClose}
              className="glass-btn glass-btn-neutral p-1.5">
              <X size={14}/>
            </button>
          </div>
        </div>

        {/* ── Header empresa ── */}
        <div className="px-6 py-5"
          style={{background:'linear-gradient(180deg,rgba(59,130,246,0.08) 0%,transparent 100%)',
            borderBottom:'1px solid rgba(255,255,255,0.05)'}}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2.5 flex-wrap mb-1">
                <h2 className="text-2xl font-bold text-white tracking-tight">{data.name}</h2>
                {lvl && (
                  <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${lvl.cls}`}>
                    {data.opportunity_level}
                  </span>
                )}
              </div>
              <p className="text-sm" style={{color:'rgba(255,255,255,0.45)'}}>
                {[data.city, data.employee_count && `${data.employee_count} profesionales`, data.sector]
                  .filter(Boolean).join(' · ')}
              </p>
              {data.website && (
                <a href={data.website} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm mt-1 transition-colors"
                  style={{color:'rgba(96,165,250,0.8)'}}>
                  <Globe size={12}/>{data.website.replace(/https?:\/\//,'')}
                  <ExternalLink size={10}/>
                </a>
              )}
            </div>
            <ScoreArc value={data.digital_score || 0}/>
          </div>

          {/* Valoración GMB */}
          {data.gmb_rating && (
            <div className="flex items-center gap-1.5 mt-3">
              {[...Array(5)].map((_,i) => (
                <Star key={i} size={12}
                  className={i < Math.round(data.gmb_rating) ? 'text-amber-400 fill-amber-400' : ''}
                  style={i >= Math.round(data.gmb_rating) ? {color:'rgba(255,255,255,0.1)'} : {}}/>
              ))}
              <span className="text-xs ml-1" style={{color:'rgba(255,255,255,0.35)'}}>
                {data.gmb_rating?.toFixed(1)} ({data.gmb_reviews} reseñas Google)
              </span>
            </div>
          )}
        </div>

        {/* ── KPIs ── */}
        <div className="grid grid-cols-4 divide-x" style={{
          borderBottom:'1px solid rgba(255,255,255,0.05)',
          borderColor:'rgba(255,255,255,0.05)'}}>
          {[
            { label:'PROFESIONALES',    val: data.employee_count || '—' },
            { label:'MADUREZ DIGITAL',  val: `${data.digital_score || 0}/100` },
            { label:'CRM',              val: data.has_crm || 'No detectado' },
            { label:'DECISORES',        val: `${(data.contacts?.length || 0)} DMs` },
          ].map(({ label, val }) => (
            <div key={label} className="flex flex-col items-center py-4 gap-1"
              style={{borderColor:'rgba(255,255,255,0.05)'}}>
              <span className="text-xl font-bold"
                style={{color: label==='MADUREZ DIGITAL' ? (data.digital_score>=70?'#34d399':data.digital_score>=40?'#fbbf24':'#f87171') : 'white'}}>
                {val}
              </span>
              <span className="text-xs tracking-wider" style={{color:'rgba(255,255,255,0.3)'}}>{label}</span>
            </div>
          ))}
        </div>

        <div className="px-6 py-5 space-y-6">

          {/* ── Resumen ── */}
          {data.summary && (
            <p className="text-sm leading-relaxed" style={{color:'rgba(255,255,255,0.6)'}}>{data.summary}</p>
          )}

          {/* ── Decision Makers ── */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold uppercase tracking-widest"
                style={{color:'rgba(255,255,255,0.35)'}}>
                Decision Makers — Teléfono Móvil Verificado
              </h3>
              <div className="flex items-center gap-2">
                {data.website && (
                  <a href={data.website} target="_blank" rel="noopener noreferrer"
                    className="glass-btn glass-btn-neutral flex items-center gap-1.5 px-3 py-1.5 text-xs">
                    <Globe size={11}/>Web
                  </a>
                )}
                {data.social_linkedin && (
                  <a href={data.social_linkedin} target="_blank" rel="noopener noreferrer"
                    className="glass-btn glass-btn-blue flex items-center gap-1.5 px-3 py-1.5 text-xs">
                    <Link2 size={11}/>LinkedIn
                  </a>
                )}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              {/* Contacto principal */}
              {primary && (
                <div className="rounded-2xl p-4 col-span-1"
                  style={{background:'rgba(59,130,246,0.07)', border:'1px solid rgba(96,165,250,0.2)'}}>
                  <p className="text-xs font-bold uppercase tracking-wider mb-0.5"
                    style={{color:'rgba(96,165,250,0.7)'}}>Contacto principal · Móvil Apollo</p>
                  <p className="font-bold text-white text-sm">{primary.name}</p>
                  <p className="text-xs italic mb-2" style={{color:'rgba(255,255,255,0.4)'}}>{primary.role}</p>
                  {primary.email && <p className="text-xs mb-1.5" style={{color:'rgba(255,255,255,0.4)'}}>{primary.email}</p>}
                  {primary.phone && (
                    <a href={`tel:${primary.phone}`}
                      className="inline-flex items-center gap-1.5 text-sm font-bold transition-colors"
                      style={{color:'#34d399'}}>
                      <Phone size={13}/>{primary.phone}
                    </a>
                  )}
                  {primary.phone && (
                    <p className="text-xs mt-1" style={{color:'rgba(52,211,153,0.6)'}}>
                      ✓ Móvil personal verificado — Apollo.io
                    </p>
                  )}
                  {primary.linkedin_url && (
                    <a href={primary.linkedin_url} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs mt-1.5 transition-colors"
                      style={{color:'rgba(96,165,250,0.7)'}}>
                      <Link2 size={10}/>LinkedIn
                    </a>
                  )}
                </div>
              )}

              {/* Decisores secundarios */}
              {secondary.slice(0,2).map((c, i) => (
                <div key={i} className="rounded-2xl p-4"
                  style={{background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.06)'}}>
                  <p className="text-xs font-bold uppercase tracking-wider mb-0.5"
                    style={{color:'rgba(255,255,255,0.3)'}}>Decisor secundario</p>
                  <p className="font-bold text-white text-sm">{c.name}</p>
                  <p className="text-xs italic mb-2" style={{color:'rgba(255,255,255,0.4)'}}>{c.role}</p>
                  {c.email && <p className="text-xs" style={{color:'rgba(255,255,255,0.4)'}}>{c.email}</p>}
                  {c.phone && (
                    <a href={`tel:${c.phone}`} className="inline-flex items-center gap-1.5 text-xs mt-1"
                      style={{color:'#34d399'}}>
                      <Phone size={10}/>{c.phone}
                    </a>
                  )}
                </div>
              ))}

              {/* Placeholder si hay menos de 3 */}
              {Array.from({length: Math.max(0, 2 - secondary.length)}).map((_, i) => (
                <div key={`ph-${i}`} className="rounded-2xl p-4"
                  style={{background:'rgba(255,255,255,0.01)', border:'1px dashed rgba(255,255,255,0.05)'}}>
                  <p className="text-xs" style={{color:'rgba(255,255,255,0.15)'}}>Sin decisor secundario</p>
                </div>
              ))}
            </div>
          </div>

          {/* ── Ecosistema Digital ── */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-widest mb-3"
              style={{color:'rgba(255,255,255,0.35)'}}>Ecosistema Digital — Diagnóstico</h3>
            <div className="rounded-2xl overflow-hidden"
              style={{background:'rgba(255,255,255,0.02)', border:'1px solid rgba(255,255,255,0.05)'}}>
              <div className="px-4 pt-1 pb-2">
                <EcoRow label="Presencia web"     value={data.seo_score ? `Score ${data.seo_score}/100` : '—'} highlight={data.seo_score>=60}/>
                <EcoRow label="Redes sociales"    value={data.redes_sociales || [data.social_facebook && 'Facebook', data.social_instagram && 'Instagram', data.social_linkedin && 'LinkedIn'].filter(Boolean).join(', ') || 'Sin datos'}/>
                <EcoRow label="CRM detectado"     value={data.has_crm || 'No detectado'} highlight={!!data.has_crm}/>
                <EcoRow label="Captación leads"   value={data.captacion_leads || (data.has_facebook_pixel ? 'Pixel activo' : 'Sin funnel estructurado')}/>
                <EcoRow label="Email marketing"   value={data.email_marketing || 'Sin datos'}/>
                <EcoRow label="Video / Contenido" value={data.video_contenido || 'Sin producción audiovisual'}/>
                <EcoRow label="SEO"               value={data.seo_info || (data.seo_score ? `Score ${data.seo_score}/100` : 'Sin estrategia')}/>
                <EcoRow label="Oportunidad"       value={data.oportunidad_hbd || `${data.opportunity_level || 'ALTA'} — Score ${data.digital_score || 0}/100`} highlight/>
              </div>
            </div>
          </div>

          {/* ── Oportunidades ── */}
          {(data.opportunity_sales || data.opportunity_tech || data.opportunity_av) && (
            <div>
              <h3 className="text-xs font-bold uppercase tracking-widest mb-3"
                style={{color:'rgba(255,255,255,0.35)'}}>Oportunidades</h3>
              <div className="grid grid-cols-3 gap-3">
                {data.opportunity_sales && (
                  <div className="opp-sales rounded-2xl p-4">
                    <div className="flex items-center gap-1.5 mb-2">
                      <TrendingUp size={13} style={{color:'#34d399'}}/>
                      <span className="text-xs font-bold" style={{color:'#34d399'}}>SALES / CRM</span>
                    </div>
                    <p className="text-xs leading-relaxed whitespace-pre-line" style={{color:'rgba(255,255,255,0.55)'}}>
                      {data.opportunity_sales}
                    </p>
                  </div>
                )}
                {data.opportunity_tech && (
                  <div className="opp-tech rounded-2xl p-4">
                    <div className="flex items-center gap-1.5 mb-2">
                      <Cpu size={13} style={{color:'#60a5fa'}}/>
                      <span className="text-xs font-bold" style={{color:'#60a5fa'}}>TECH / IA</span>
                    </div>
                    <p className="text-xs leading-relaxed whitespace-pre-line" style={{color:'rgba(255,255,255,0.55)'}}>
                      {data.opportunity_tech}
                    </p>
                  </div>
                )}
                {data.opportunity_av && (
                  <div className="opp-av rounded-2xl p-4">
                    <div className="flex items-center gap-1.5 mb-2">
                      <Video size={13} style={{color:'#fb923c'}}/>
                      <span className="text-xs font-bold" style={{color:'#fb923c'}}>CONTENIDO AV</span>
                    </div>
                    <p className="text-xs leading-relaxed whitespace-pre-line" style={{color:'rgba(255,255,255,0.55)'}}>
                      {data.opportunity_av}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Notas ── */}
          <textarea value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="Notas de la llamada..."
            rows={2}
            className="glass-input w-full px-4 py-3 text-sm resize-none"/>
        </div>

        {/* ── Footer: botones de acción ── */}
        <div className="px-6 py-5 flex items-center justify-between gap-3"
          style={{borderTop:'1px solid rgba(255,255,255,0.06)',
            background:'linear-gradient(0deg,rgba(0,0,0,0.3),transparent)'}}>

          {/* Izquierda: estados */}
          <div className="flex items-center gap-2">
            <button onClick={() => handleStatus('pending')} disabled={saving}
              className={`glass-btn px-3 py-2 text-xs font-semibold transition-all ${callStatus==='pending' ? 'glass-btn-neutral' : ''}`}
              style={callStatus!=='pending' ? {background:'rgba(239,68,68,0.12)', border:'1px solid rgba(239,68,68,0.3)', color:'#f87171'} : {}}>
              Pendiente llamar
            </button>
            <button onClick={() => handleStatus('closed')} disabled={saving}
              className={`glass-btn px-3 py-2 text-xs font-semibold ${callStatus==='closed' ? 'glass-btn-green' : ''}`}
              style={callStatus!=='closed' ? {background:'rgba(16,185,129,0.1)', border:'1px solid rgba(16,185,129,0.25)', color:'#34d399'} : {}}>
              Cliente contactado
            </button>
          </div>

          {/* Centro: NO LO COGE / LO COGE */}
          <div className="flex items-center gap-2">
            <button onClick={() => handleStatus('rejected')} disabled={saving}
              className="glass-btn px-4 py-2.5 text-sm font-bold"
              style={{
                background: callStatus==='rejected' ? 'rgba(239,68,68,0.3)' : 'rgba(239,68,68,0.15)',
                border:`1px solid ${callStatus==='rejected' ? 'rgba(239,68,68,0.6)' : 'rgba(239,68,68,0.3)'}`,
                color:'#f87171',
                boxShadow: callStatus==='rejected' ? '0 0 20px rgba(239,68,68,0.3)' : 'none',
              }}>
              NO LO COGE
            </button>
            <button onClick={() => handleStatus('no_answer')} disabled={saving}
              className="glass-btn px-4 py-2.5 text-sm font-bold"
              style={{
                background: callStatus==='no_answer' ? 'rgba(16,185,129,0.3)' : 'rgba(16,185,129,0.12)',
                border:`1px solid ${callStatus==='no_answer' ? 'rgba(16,185,129,0.6)' : 'rgba(16,185,129,0.3)'}`,
                color:'#34d399',
                boxShadow: callStatus==='no_answer' ? '0 0 20px rgba(16,185,129,0.3)' : 'none',
              }}>
              LO COGE
            </button>
          </div>

          {/* Derecha: Llamar */}
          {primary?.phone ? (
            <a href={`tel:${primary.phone}`}
              className="glass-btn glass-btn-green flex items-center gap-2 px-5 py-3 text-sm font-bold">
              <Phone size={16}/>Llamar
            </a>
          ) : (
            <button disabled
              className="glass-btn glass-btn-neutral flex items-center gap-2 px-5 py-3 text-sm font-bold opacity-30">
              <Phone size={16}/>Sin teléfono
            </button>
          )}
        </div>

        {/* Footer info */}
        <div className="px-6 pb-3 flex items-center justify-between"
          style={{borderTop:'1px solid rgba(255,255,255,0.03)'}}>
          <span className="text-xs" style={{color:'rgba(255,255,255,0.15)'}}>{data.name}</span>
          <span className="text-xs font-mono" style={{color:'rgba(255,255,255,0.1)'}}>
            {cardIndex}/{total}
          </span>
        </div>
      </div>
    </div>
  )
}
