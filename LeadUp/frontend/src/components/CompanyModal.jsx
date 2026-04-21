import { useState, useEffect } from 'react'
import {
  X, Globe, Phone, Link2, Star,
  TrendingUp, Cpu, Video, ExternalLink,
  ChevronLeft, ChevronRight, CheckCircle2, XCircle, PhoneMissed, Clock,
  Zap, RotateCcw,
} from 'lucide-react'

const CALL_STATUS = {
  closed:    { label: 'Cerrado',       icon: CheckCircle2, cls: 'status-closed' },
  rejected:  { label: 'No interesado', icon: XCircle,      cls: 'status-rejected' },
  no_answer: { label: 'No contestó',   icon: PhoneMissed,  cls: 'status-no_answer' },
  pending:   { label: 'Pendiente',     icon: Clock,        cls: 'status-pending' },
}
const LEVEL = {
  ALTA:  { cls: 'badge-alta',  dot: '#34d399' },
  MEDIA: { cls: 'badge-media', dot: '#fbbf24' },
  BAJA:  { cls: 'badge-baja',  dot: '#9ca3af' },
}

function ScoreArc({ value = 0 }) {
  const r = 22, c = 2 * Math.PI * r, filled = (value / 100) * c
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

function EcoRow({ label, value, ok }) {
  return (
    <div className="grid grid-cols-[130px,1fr] gap-2 py-2 border-b" style={{borderColor:'rgba(255,255,255,0.05)'}}>
      <span className="text-xs font-semibold" style={{color:'rgba(255,255,255,0.4)'}}>{label}</span>
      <span className="text-xs" style={{color: ok ? '#34d399' : 'rgba(255,255,255,0.6)'}}>{value || '—'}</span>
    </div>
  )
}

export default function CompanyModal({
  company, onClose, onPrev, onNext, hasPrev, hasNext,
  cardIndex, total, assignmentId, onStatusChange,
}) {
  const [callStatus, setCallStatus] = useState(company?.call_status || company?.last_call_status || null)
  const [notes, setNotes]           = useState('')
  const [saving, setSaving]         = useState(false)

  useEffect(() => {
    setCallStatus(company?.call_status || company?.last_call_status || null)
    setNotes('')
  }, [company?.id])

  useEffect(() => {
    const fn = e => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight' && hasNext) onNext()
      if (e.key === 'ArrowLeft'  && hasPrev) onPrev()
    }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [hasNext, hasPrev])

  if (!company) return null

  const primary   = company.contacts?.find(c => c.is_primary) || company.contacts?.[0]
  const secondary = company.contacts?.filter(c => !c.is_primary).slice(0, 2) || []
  const lvl       = LEVEL[company.opportunity_level]
  const status    = CALL_STATUS[callStatus] || CALL_STATUS.pending

  const handleStatus = async s => {
    setSaving(true)
    try {
      if (onStatusChange) await onStatusChange(assignmentId, s, notes)
      setCallStatus(s)
    } finally { setSaving(false) }
  }

  // Parsear hook fields (pueden venir como JSON o como texto en summary)
  const hookCaptacion  = company.hook_captacion
  const hookCrm        = company.hook_crm
  const hookVisibilidad = company.hook_visibilidad
  const openingLine    = company.opening_line

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto py-4 px-3"
      style={{background:'rgba(0,0,0,0.82)', backdropFilter:'blur(8px)'}}
      onClick={e => e.target === e.currentTarget && onClose()}>

      <div className="relative w-full max-w-3xl"
        style={{background:'linear-gradient(135deg,rgba(12,18,36,0.99),rgba(5,5,12,0.99))',
          border:'1px solid rgba(255,255,255,0.08)', borderRadius:'24px',
          boxShadow:'0 40px 120px rgba(0,0,0,0.75)'}}>

        {/* Top bar */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3"
          style={{borderBottom:'1px solid rgba(255,255,255,0.05)'}}>
          <div className="flex items-center gap-2">
            <button disabled={!hasPrev} onClick={onPrev}
              className="glass-btn glass-btn-neutral p-1.5 disabled:opacity-20">
              <ChevronLeft size={14}/>
            </button>
            <span className="text-xs" style={{color:'rgba(255,255,255,0.3)'}}>{cardIndex}/{total}</span>
            <button disabled={!hasNext} onClick={onNext}
              className="glass-btn glass-btn-neutral p-1.5 disabled:opacity-20">
              <ChevronRight size={14}/>
            </button>
          </div>
          <div className="flex items-center gap-2">
            {company.attempt_count > 0 && (
              <span className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full"
                style={{background:'rgba(245,158,11,0.12)',border:'1px solid rgba(245,158,11,0.25)',color:'#fbbf24'}}>
                <RotateCcw size={10}/>Intento {company.attempt_count + 1}
              </span>
            )}
            <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1 rounded-full ${status.cls}`}>
              <status.icon size={11}/>{status.label}
            </span>
            <button onClick={onClose} className="glass-btn glass-btn-neutral p-1.5">
              <X size={14}/>
            </button>
          </div>
        </div>

        {/* Header empresa */}
        <div className="px-6 py-5"
          style={{background:'linear-gradient(180deg,rgba(59,130,246,0.07) 0%,transparent 100%)',
            borderBottom:'1px solid rgba(255,255,255,0.05)'}}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2.5 flex-wrap mb-1">
                <h2 className="text-2xl font-bold text-white tracking-tight">{company.name}</h2>
                {lvl && (
                  <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${lvl.cls}`}>
                    {company.opportunity_level}
                  </span>
                )}
              </div>
              <p className="text-sm" style={{color:'rgba(255,255,255,0.4)'}}>
                {[company.city, company.employee_count && `${company.employee_count} prof.`,
                  company.sector || company.sector_tag].filter(Boolean).join(' · ')}
              </p>
              {company.website && (
                <a href={company.website} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm mt-1 transition-colors"
                  style={{color:'rgba(96,165,250,0.8)'}}>
                  <Globe size={12}/>{company.website.replace(/https?:\/\//,'')}
                  <ExternalLink size={10}/>
                </a>
              )}
              {company.gmb_rating && (
                <div className="flex items-center gap-1 mt-1.5">
                  {[...Array(5)].map((_,i) => (
                    <Star key={i} size={11}
                      className={i < Math.round(company.gmb_rating) ? 'text-amber-400 fill-amber-400' : ''}
                      style={i >= Math.round(company.gmb_rating) ? {color:'rgba(255,255,255,0.1)'} : {}}/>
                  ))}
                  <span className="text-xs ml-1" style={{color:'rgba(255,255,255,0.3)'}}>
                    {company.gmb_rating?.toFixed(1)} ({company.gmb_reviews} reseñas)
                  </span>
                </div>
              )}
            </div>
            <ScoreArc value={company.digital_score || 0}/>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-4 divide-x"
          style={{borderBottom:'1px solid rgba(255,255,255,0.05)', borderColor:'rgba(255,255,255,0.05)'}}>
          {[
            { label:'PROFESIONALES',  val: company.employee_count || '—' },
            { label:'SCORE DIGITAL',  val: `${company.digital_score||0}/100` },
            { label:'CRM',            val: company.has_crm || 'No detectado' },
            { label:'DECISORES',      val: `${company.contacts?.length || 0} DMs` },
          ].map(({ label, val }) => (
            <div key={label} className="flex flex-col items-center py-4 gap-1" style={{borderColor:'rgba(255,255,255,0.05)'}}>
              <span className="text-xl font-bold text-white">{val}</span>
              <span className="text-xs tracking-wider" style={{color:'rgba(255,255,255,0.25)'}}>{label}</span>
            </div>
          ))}
        </div>

        <div className="px-6 py-5 space-y-5">

          {/* ═══ ESTRATEGIA DE ATAQUE — sección principal ═══ */}
          <div className="rounded-2xl overflow-hidden"
            style={{background:'linear-gradient(135deg,rgba(59,130,246,0.1),rgba(16,185,129,0.06))',
              border:'1px solid rgba(96,165,250,0.25)'}}>
            <div className="px-4 py-3 flex items-center gap-2"
              style={{borderBottom:'1px solid rgba(255,255,255,0.06)',
                background:'rgba(59,130,246,0.08)'}}>
              <Zap size={14} style={{color:'#60a5fa'}}/>
              <span className="text-xs font-bold tracking-widest uppercase" style={{color:'#60a5fa'}}>
                Estrategia de Ataque
              </span>
            </div>

            {/* Línea de apertura */}
            {openingLine && (
              <div className="px-4 py-3" style={{borderBottom:'1px solid rgba(255,255,255,0.05)'}}>
                <p className="text-xs font-semibold mb-1 uppercase tracking-wider" style={{color:'rgba(255,255,255,0.3)'}}>Apertura recomendada</p>
                <p className="text-sm font-medium text-white italic">"{openingLine}"</p>
              </div>
            )}

            {/* Oportunidades detalladas */}
            {(company.opportunity_sales || company.opportunity_tech || company.opportunity_av) ? (
              <div className="grid grid-cols-3 divide-x" style={{borderColor:'rgba(255,255,255,0.05)'}}>
                {company.opportunity_sales ? (
                  <div className="p-4">
                    <div className="flex items-center gap-1.5 mb-2">
                      <TrendingUp size={13} style={{color:'#34d399'}}/>
                      <span className="text-xs font-bold" style={{color:'#34d399'}}>SALES / CRM</span>
                    </div>
                    <p className="text-xs leading-relaxed whitespace-pre-line" style={{color:'rgba(255,255,255,0.65)'}}>{company.opportunity_sales}</p>
                  </div>
                ) : (
                  <div className="p-4 flex items-center justify-center">
                    <p className="text-xs" style={{color:'rgba(255,255,255,0.15)'}}>Sin datos</p>
                  </div>
                )}
                {company.opportunity_tech ? (
                  <div className="p-4" style={{borderColor:'rgba(255,255,255,0.05)'}}>
                    <div className="flex items-center gap-1.5 mb-2">
                      <Cpu size={13} style={{color:'#60a5fa'}}/>
                      <span className="text-xs font-bold" style={{color:'#60a5fa'}}>TECH / IA</span>
                    </div>
                    <p className="text-xs leading-relaxed whitespace-pre-line" style={{color:'rgba(255,255,255,0.65)'}}>{company.opportunity_tech}</p>
                  </div>
                ) : (
                  <div className="p-4 flex items-center justify-center" style={{borderColor:'rgba(255,255,255,0.05)'}}>
                    <p className="text-xs" style={{color:'rgba(255,255,255,0.15)'}}>Sin datos</p>
                  </div>
                )}
                {company.opportunity_av ? (
                  <div className="p-4" style={{borderColor:'rgba(255,255,255,0.05)'}}>
                    <div className="flex items-center gap-1.5 mb-2">
                      <Video size={13} style={{color:'#fb923c'}}/>
                      <span className="text-xs font-bold" style={{color:'#fb923c'}}>CONTENIDO AV</span>
                    </div>
                    <p className="text-xs leading-relaxed whitespace-pre-line" style={{color:'rgba(255,255,255,0.65)'}}>{company.opportunity_av}</p>
                  </div>
                ) : (
                  <div className="p-4 flex items-center justify-center" style={{borderColor:'rgba(255,255,255,0.05)'}}>
                    <p className="text-xs" style={{color:'rgba(255,255,255,0.15)'}}>Sin datos</p>
                  </div>
                )}
              </div>
            ) : (
              /* Hooks como fallback si no hay opportunity_* */
              (hookCaptacion || hookCrm || hookVisibilidad) ? (
                <div className="grid grid-cols-3 divide-x" style={{borderColor:'rgba(255,255,255,0.05)'}}>
                  {[
                    { val: hookCaptacion, label: 'CAPTACIÓN',    icon: TrendingUp, color:'#34d399' },
                    { val: hookCrm,       label: 'CRM',          icon: Cpu,        color:'#60a5fa' },
                    { val: hookVisibilidad,label:'VISIBILIDAD',  icon: Video,      color:'#fb923c' },
                  ].map(({ val, label, icon: Icon, color }) => (
                    <div key={label} className="p-4" style={{borderColor:'rgba(255,255,255,0.05)'}}>
                      <div className="flex items-center gap-1.5 mb-2">
                        <Icon size={13} style={{color}}/>
                        <span className="text-xs font-bold" style={{color}}>{label}</span>
                      </div>
                      <p className="text-xs leading-relaxed" style={{color:'rgba(255,255,255,0.65)'}}>{val || '—'}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-4">
                  <p className="text-sm" style={{color:'rgba(255,255,255,0.55)'}}>{company.summary || 'Sin análisis de oportunidad disponible.'}</p>
                </div>
              )
            )}
          </div>

          {/* Decision Makers */}
          {(primary || secondary.length > 0) && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-bold uppercase tracking-widest" style={{color:'rgba(255,255,255,0.3)'}}>
                  Decision Makers
                </h3>
                <div className="flex items-center gap-2">
                  {company.website && (
                    <a href={company.website} target="_blank" rel="noopener noreferrer"
                      className="glass-btn glass-btn-neutral flex items-center gap-1.5 px-3 py-1.5 text-xs">
                      <Globe size={11}/>Web
                    </a>
                  )}
                  {company.social_linkedin && (
                    <a href={`https://${company.social_linkedin.replace(/^https?:\/\//,'')}`}
                      target="_blank" rel="noopener noreferrer"
                      className="glass-btn glass-btn-blue flex items-center gap-1.5 px-3 py-1.5 text-xs">
                      <Link2 size={11}/>LinkedIn empresa
                    </a>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {primary && (
                  <div className="rounded-2xl p-4"
                    style={{background:'rgba(59,130,246,0.07)', border:'1px solid rgba(96,165,250,0.2)'}}>
                    <p className="text-xs font-bold uppercase tracking-wider mb-1" style={{color:'rgba(96,165,250,0.7)'}}>
                      Decisor Principal
                    </p>
                    <p className="font-bold text-white text-sm">{primary.name}</p>
                    <p className="text-xs italic mb-2" style={{color:'rgba(255,255,255,0.4)'}}>{primary.role}</p>
                    {primary.email && <p className="text-xs mb-1.5" style={{color:'rgba(255,255,255,0.4)'}}>{primary.email}</p>}
                    {primary.phone && (
                      <a href={`tel:${primary.phone}`}
                        className="inline-flex items-center gap-1.5 text-sm font-bold" style={{color:'#34d399'}}>
                        <Phone size={13}/>{primary.phone}
                      </a>
                    )}
                    <a href={primary.linkedin_url || `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent((primary.name||'') + ' ' + (company.name||''))}`}
                      target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs mt-2"
                      style={{color: primary.linkedin_url ? 'rgba(96,165,250,0.9)' : 'rgba(96,165,250,0.45)'}}>
                      <Link2 size={10}/>
                      {primary.linkedin_url ? 'LinkedIn' : 'Buscar en LinkedIn →'}
                    </a>
                  </div>
                )}
                {secondary.slice(0,2).map((c,i) => (
                  <div key={i} className="rounded-2xl p-4"
                    style={{background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.06)'}}>
                    <p className="text-xs font-bold uppercase tracking-wider mb-1" style={{color:'rgba(255,255,255,0.3)'}}>Alto Cargo {i+2}</p>
                    <p className="font-bold text-white text-sm">{c.name}</p>
                    <p className="text-xs italic mb-2" style={{color:'rgba(255,255,255,0.4)'}}>{c.role}</p>
                    {c.email && <p className="text-xs mb-1" style={{color:'rgba(255,255,255,0.4)'}}>{c.email}</p>}
                    {c.phone && (
                      <a href={`tel:${c.phone}`} className="flex items-center gap-1.5 text-xs mt-1" style={{color:'#34d399'}}>
                        <Phone size={10}/>{c.phone}
                      </a>
                    )}
                    <a href={c.linkedin_url || `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent((c.name||'') + ' ' + (company.name||''))}`}
                      target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs mt-2"
                      style={{color: c.linkedin_url ? 'rgba(96,165,250,0.9)' : 'rgba(96,165,250,0.45)'}}>
                      <Link2 size={10}/>
                      {c.linkedin_url ? 'LinkedIn' : 'Buscar en LinkedIn →'}
                    </a>
                  </div>
                ))}
                {Array.from({length: Math.max(0, 2-secondary.length)}).map((_,i) => (
                  <div key={`ph${i}`} className="rounded-2xl p-4"
                    style={{background:'rgba(255,255,255,0.01)', border:'1px dashed rgba(255,255,255,0.05)'}}>
                    <p className="text-xs" style={{color:'rgba(255,255,255,0.15)'}}>Sin alto cargo</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Ecosistema digital */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-widest mb-2" style={{color:'rgba(255,255,255,0.3)'}}>
              Ecosistema Digital
            </h3>
            <div className="rounded-2xl overflow-hidden"
              style={{background:'rgba(255,255,255,0.02)', border:'1px solid rgba(255,255,255,0.05)'}}>
              <div className="px-4 pt-1 pb-2 grid grid-cols-2 gap-x-6">
                <div>
                  <EcoRow label="Presencia web"     ok={!!company.website}           value={company.website ? 'Sí' : 'No'}/>
                  <EcoRow label="CRM detectado"     ok={!!company.has_crm}           value={company.has_crm || 'No'}/>
                  <EcoRow label="Facebook Pixel"    ok={company.has_facebook_pixel}  value={company.has_facebook_pixel ? 'Activo':'No'}/>
                  <EcoRow label="Google Ads"        ok={company.has_google_ads}      value={company.has_google_ads ? 'Activo':'No'}/>
                </div>
                <div>
                  <EcoRow label="Redes sociales"   value={company.redes_sociales} ok={!!company.redes_sociales}/>
                  <EcoRow label="Captación leads"  value={company.captacion_leads} ok={!!company.captacion_leads}/>
                  <EcoRow label="Email marketing"  value={company.email_marketing} ok={!!company.email_marketing}/>
                  <EcoRow label="SEO"              value={company.seo_info || (company.seo_score ? `${company.seo_score}/100` : null)} ok={(company.seo_score||0)>=40}/>
                </div>
              </div>
            </div>
          </div>

          <textarea value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="Notas de la llamada..." rows={2}
            className="glass-input w-full px-4 py-3 text-sm resize-none"/>
        </div>

        {/* Footer botones acción */}
        <div className="px-6 py-4 flex items-center justify-between gap-3"
          style={{borderTop:'1px solid rgba(255,255,255,0.06)',
            background:'linear-gradient(0deg,rgba(0,0,0,0.25),transparent)'}}>
          <div className="flex items-center gap-2">
            <button onClick={() => handleStatus('pending')} disabled={saving}
              className="glass-btn px-3 py-2 text-xs font-semibold"
              style={callStatus==='pending' ? {background:'rgba(59,130,246,0.2)',border:'1px solid rgba(96,165,250,0.4)',color:'#60a5fa'} :
                {background:'rgba(239,68,68,0.1)',border:'1px solid rgba(239,68,68,0.25)',color:'#f87171'}}>
              <Clock size={11} className="inline mr-1"/>Pendiente
            </button>
            <button onClick={() => handleStatus('closed')} disabled={saving}
              className="glass-btn px-3 py-2 text-xs font-semibold"
              style={callStatus==='closed' ? {background:'rgba(16,185,129,0.25)',border:'1px solid rgba(52,211,153,0.5)',color:'#34d399'} :
                {background:'rgba(16,185,129,0.08)',border:'1px solid rgba(16,185,129,0.2)',color:'#34d399'}}>
              <CheckCircle2 size={11} className="inline mr-1"/>Cerrado
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button onClick={() => handleStatus('rejected')} disabled={saving}
              className="glass-btn px-4 py-2.5 text-sm font-bold"
              style={{background: callStatus==='rejected' ? 'rgba(239,68,68,0.28)':'rgba(239,68,68,0.1)',
                border:`1px solid ${callStatus==='rejected' ? 'rgba(239,68,68,0.5)':'rgba(239,68,68,0.25)'}`,color:'#f87171'}}>
              NO LO COGE
            </button>
            <button onClick={() => handleStatus('no_answer')} disabled={saving}
              className="glass-btn px-4 py-2.5 text-sm font-bold"
              style={{background: callStatus==='no_answer' ? 'rgba(245,158,11,0.25)':'rgba(245,158,11,0.1)',
                border:`1px solid ${callStatus==='no_answer' ? 'rgba(245,158,11,0.5)':'rgba(245,158,11,0.25)'}`,color:'#fbbf24'}}>
              NO CONTESTA
            </button>
          </div>

          {primary?.phone ? (
            <a href={`tel:${primary.phone}`}
              className="glass-btn glass-btn-green flex items-center gap-2 px-5 py-3 text-sm font-bold">
              <Phone size={16}/>Llamar
            </a>
          ) : (
            <button disabled className="glass-btn glass-btn-neutral flex items-center gap-2 px-5 py-3 text-sm font-bold opacity-30">
              <Phone size={16}/>Sin tel.
            </button>
          )}
        </div>

        <div className="px-6 pb-3 flex items-center justify-between"
          style={{borderTop:'1px solid rgba(255,255,255,0.03)'}}>
          <span className="text-xs" style={{color:'rgba(255,255,255,0.15)'}}>{company.name}</span>
          <span className="text-xs font-mono" style={{color:'rgba(255,255,255,0.1)'}}>{cardIndex}/{total}</span>
        </div>
      </div>
    </div>
  )
}
