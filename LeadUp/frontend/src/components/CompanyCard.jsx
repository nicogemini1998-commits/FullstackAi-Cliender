import { useState } from 'react'
import {
  Globe, Users, PhoneCall, ChevronDown, ChevronUp,
  TrendingUp, Cpu, Video, Star, ShieldCheck,
  Phone, Mail, Link2, CheckCircle2, XCircle, PhoneMissed, Clock,
} from 'lucide-react'
import { companies as companiesApi } from '../lib/api'

const LEVEL = {
  ALTA:  { cls: 'badge-alta',  dot: '#34d399' },
  MEDIA: { cls: 'badge-media', dot: '#fbbf24' },
  BAJA:  { cls: 'badge-baja',  dot: '#9ca3af' },
}

const CALL_STATUS = {
  closed:    { label: 'Cerrado',       icon: CheckCircle2, cls: 'status-closed' },
  rejected:  { label: 'Rechazado',     icon: XCircle,      cls: 'status-rejected' },
  no_answer: { label: 'Sin contestar', icon: PhoneMissed,  cls: 'status-no_answer' },
}

function ScoreArc({ value = 0 }) {
  const r = 20, c = 2 * Math.PI * r
  const filled = (value / 100) * c
  const color = value >= 70 ? '#34d399' : value >= 40 ? '#fbbf24' : '#f87171'
  return (
    <div className="relative w-12 h-12 flex items-center justify-center">
      <svg width="48" height="48" className="-rotate-90">
        <circle cx="24" cy="24" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="3"/>
        <circle cx="24" cy="24" r={r} fill="none" stroke={color} strokeWidth="3"
          strokeDasharray={`${filled} ${c}`} strokeLinecap="round"
          style={{filter:`drop-shadow(0 0 6px ${color}88)`}}/>
      </svg>
      <span className="absolute text-xs font-bold" style={{ color }}>{value}</span>
    </div>
  )
}

function EcoRow({ label, ok, value }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b" style={{borderColor:'rgba(255,255,255,0.04)'}}>
      <span className="text-xs" style={{color:'rgba(255,255,255,0.4)'}}>{label}</span>
      <span className="text-xs font-medium" style={{color: ok ? '#34d399' : 'rgba(255,255,255,0.2)'}}>
        {value}
      </span>
    </div>
  )
}

function ContactPill({ contact, primary }) {
  if (!contact) return null
  return (
    <div className="rounded-2xl p-3.5" style={{
      background: primary ? 'rgba(59,130,246,0.07)' : 'rgba(255,255,255,0.03)',
      border: `1px solid ${primary ? 'rgba(96,165,250,0.2)' : 'rgba(255,255,255,0.06)'}`,
    }}>
      <div className="flex items-center gap-1.5 mb-2">
        {primary && <Star size={10} className="text-amber-400 fill-amber-400 shrink-0"/>}
        <span className="text-xs font-semibold text-white truncate">{contact.name || '—'}</span>
      </div>
      <p className="text-xs mb-2.5 truncate" style={{color:'rgba(255,255,255,0.35)'}}>{contact.role}</p>
      <div className="space-y-1.5">
        {contact.phone && (
          <a href={`tel:${contact.phone}`} className="flex items-center gap-1.5 text-xs transition-colors"
            style={{color:'#34d399'}} onMouseOver={e=>e.currentTarget.style.color='#6ee7b7'}
            onMouseOut={e=>e.currentTarget.style.color='#34d399'}>
            <Phone size={10}/><span className="font-mono">{contact.phone}</span>
          </a>
        )}
        {contact.email && (
          <a href={`mailto:${contact.email}`} className="flex items-center gap-1.5 text-xs truncate"
            style={{color:'rgba(255,255,255,0.4)'}}>
            <Mail size={10}/><span className="truncate">{contact.email}</span>
          </a>
        )}
        {contact.linkedin_url && (
          <a href={contact.linkedin_url} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs" style={{color:'#60a5fa'}}>
            <Link2 size={10}/><span>LinkedIn</span>
          </a>
        )}
      </div>
    </div>
  )
}

export default function CompanyCard({ company, cardIndex, onStatusChange }) {
  const [expanded, setExpanded] = useState(false)
  const [callStatus, setCallStatus] = useState(company.last_call_status || null)
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const primary   = company.contacts?.find(c => c.is_primary) || company.contacts?.[0]
  const secondary = company.contacts?.filter(c => !c.is_primary).slice(0, 2) || []
  const lvl       = LEVEL[company.opportunity_level]
  const seoLabel  = s => s >= 70 ? 'Bueno' : s >= 40 ? 'Medio' : 'Bajo'

  const handleStatus = async status => {
    setSaving(true)
    try {
      await companiesApi.updateStatus(company.id, status, notes, primary?.id)
      setCallStatus(status); onStatusChange?.(company.id, status)
    } finally { setSaving(false) }
  }

  return (
    <div className="glass-card overflow-hidden flex flex-col">

      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="px-5 pt-5 pb-4" style={{
        background:'linear-gradient(180deg, rgba(255,255,255,0.04) 0%, transparent 100%)',
        borderBottom:'1px solid rgba(255,255,255,0.05)'
      }}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <h3 className="text-base font-bold text-white truncate">{company.name}</h3>
              {lvl && (
                <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full ${lvl.cls}`}>
                  <span className="w-1.5 h-1.5 rounded-full" style={{background:lvl.dot}}/>
                  {company.opportunity_level}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2.5 text-xs flex-wrap" style={{color:'rgba(255,255,255,0.35)'}}>
              {company.city && <span>📍 {company.city}</span>}
              {company.sector && <span>· {company.sector}</span>}
              {company.website && (
                <a href={company.website} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 transition-colors"
                  style={{color:'rgba(96,165,250,0.7)'}}
                  onMouseOver={e=>e.currentTarget.style.color='#60a5fa'}
                  onMouseOut={e=>e.currentTarget.style.color='rgba(96,165,250,0.7)'}>
                  <Globe size={10}/>
                  <span className="truncate max-w-[120px]">{company.website.replace(/https?:\/\//,'')}</span>
                </a>
              )}
            </div>
            {company.gmb_rating && (
              <div className="flex items-center gap-1 mt-1.5">
                {[...Array(5)].map((_,i) => (
                  <Star key={i} size={10}
                    className={i < Math.round(company.gmb_rating) ? 'text-amber-400 fill-amber-400' : ''}
                    style={i >= Math.round(company.gmb_rating) ? {color:'rgba(255,255,255,0.1)'} : {}}/>
                ))}
                <span className="text-xs ml-1" style={{color:'rgba(255,255,255,0.3)'}}>
                  {company.gmb_rating?.toFixed(1)} ({company.gmb_reviews})
                </span>
              </div>
            )}
          </div>
          <span className="text-xs font-mono shrink-0" style={{color:'rgba(255,255,255,0.12)'}}>#{cardIndex}</span>
        </div>
      </div>

      {/* ── KPIs ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-4 divide-x" style={{borderBottom:'1px solid rgba(255,255,255,0.05)', borderColor:'rgba(255,255,255,0.05)'}}>
        {[
          { label: 'Profesionales', val: company.employee_count || '—', icon: Users },
          { label: 'Score',         val: null,                          score: company.digital_score || 0 },
          { label: 'CRM',           val: company.has_crm || 'No',       icon: ShieldCheck },
          { label: 'Decisores',     val: company.contact_count || company.contacts?.length || '—', icon: PhoneCall },
        ].map(({ label, val, icon: Ic, score }) => (
          <div key={label} className="flex flex-col items-center py-3 px-1 gap-0.5" style={{borderColor:'rgba(255,255,255,0.05)'}}>
            <span className="text-xs" style={{color:'rgba(255,255,255,0.3)'}}>{label}</span>
            {score !== undefined
              ? <ScoreArc value={score}/>
              : <div className="flex items-center gap-1">
                  {Ic && <Ic size={12} style={{color:'rgba(96,165,250,0.6)'}} className="shrink-0"/>}
                  <span className="text-sm font-semibold text-white truncate max-w-[60px]">{val}</span>
                </div>
            }
          </div>
        ))}
      </div>

      <div className="p-5 flex flex-col gap-4 flex-1">

        {/* ── Resumen ── */}
        {company.summary && (
          <p className="text-sm leading-relaxed" style={{color:'rgba(255,255,255,0.55)'}}>{company.summary}</p>
        )}

        {/* ── Decision Makers ── */}
        {(primary || secondary.length > 0) && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest mb-2.5"
              style={{color:'rgba(255,255,255,0.25)'}}>Decision Makers</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {primary && <ContactPill contact={primary} primary/>}
              {secondary.map((c,i) => <ContactPill key={i} contact={c}/>)}
            </div>
          </div>
        )}

        {/* ── Oportunidades ── */}
        {(company.opportunity_sales || company.opportunity_tech || company.opportunity_av) && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest mb-2.5"
              style={{color:'rgba(255,255,255,0.25)'}}>Oportunidades</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {company.opportunity_sales && (
                <div className="opp-sales rounded-2xl p-3.5">
                  <div className="flex items-center gap-1.5 mb-2">
                    <TrendingUp size={13} style={{color:'#34d399'}}/>
                    <span className="text-xs font-semibold" style={{color:'#34d399'}}>Sales / CRM</span>
                  </div>
                  <p className="text-xs leading-relaxed" style={{color:'rgba(255,255,255,0.5)'}}>{company.opportunity_sales}</p>
                </div>
              )}
              {company.opportunity_tech && (
                <div className="opp-tech rounded-2xl p-3.5">
                  <div className="flex items-center gap-1.5 mb-2">
                    <Cpu size={13} style={{color:'#60a5fa'}}/>
                    <span className="text-xs font-semibold" style={{color:'#60a5fa'}}>Tech / IA</span>
                  </div>
                  <p className="text-xs leading-relaxed" style={{color:'rgba(255,255,255,0.5)'}}>{company.opportunity_tech}</p>
                </div>
              )}
              {company.opportunity_av && (
                <div className="opp-av rounded-2xl p-3.5">
                  <div className="flex items-center gap-1.5 mb-2">
                    <Video size={13} style={{color:'#fb923c'}}/>
                    <span className="text-xs font-semibold" style={{color:'#fb923c'}}>Contenido AV</span>
                  </div>
                  <p className="text-xs leading-relaxed" style={{color:'rgba(255,255,255,0.5)'}}>{company.opportunity_av}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Ecosistema (expandible) ── */}
        <button onClick={() => setExpanded(v => !v)}
          className="flex items-center gap-1.5 text-xs transition-colors w-fit"
          style={{color:'rgba(255,255,255,0.25)'}}
          onMouseOver={e=>e.currentTarget.style.color='rgba(255,255,255,0.55)'}
          onMouseOut={e=>e.currentTarget.style.color='rgba(255,255,255,0.25)'}>
          {expanded ? <ChevronUp size={12}/> : <ChevronDown size={12}/>}
          Ecosistema digital
        </button>

        {expanded && (
          <div className="rounded-2xl p-4" style={{background:'rgba(255,255,255,0.02)', border:'1px solid rgba(255,255,255,0.05)'}}>
            <div className="grid grid-cols-2 gap-x-6">
              <div>
                <EcoRow label="Presencia web"  ok={!!company.website}            value={company.website ? 'Sí' : 'No'}/>
                <EcoRow label="CRM detectado"  ok={!!company.has_crm}            value={company.has_crm || 'No'}/>
                <EcoRow label="Facebook Pixel" ok={company.has_facebook_pixel}   value={company.has_facebook_pixel ? 'Activo' : 'No'}/>
                <EcoRow label="Google Ads"     ok={company.has_google_ads}       value={company.has_google_ads ? 'Activo' : 'No'}/>
              </div>
              <div>
                <EcoRow label="SEO" ok={(company.seo_score||0)>=40} value={`${company.seo_score||0}/100 · ${seoLabel(company.seo_score||0)}`}/>
                <EcoRow label="Facebook"  ok={!!company.social_facebook}  value={company.social_facebook  ? '✓ Activo' : '—'}/>
                <EcoRow label="LinkedIn"  ok={!!company.social_linkedin}  value={company.social_linkedin  ? '✓ Activo' : '—'}/>
                <EcoRow label="Instagram" ok={!!company.social_instagram} value={company.social_instagram ? '✓ Activo' : '—'}/>
              </div>
            </div>
          </div>
        )}

        {/* ── Estado llamada ── */}
        <div className="pt-3" style={{borderTop:'1px solid rgba(255,255,255,0.05)'}}>
          <div className="flex flex-wrap items-center gap-1.5 mb-2">
            {callStatus ? (
              <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1 rounded-full ${CALL_STATUS[callStatus]?.cls}`}>
                {callStatus === 'closed' ? <CheckCircle2 size={11}/> : callStatus === 'rejected' ? <XCircle size={11}/> : <PhoneMissed size={11}/>}
                {CALL_STATUS[callStatus]?.label}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1 rounded-full status-pending">
                <Clock size={11}/>Pendiente
              </span>
            )}
            {Object.entries(CALL_STATUS).map(([s, { label, icon: Ic, cls }]) => (
              <button key={s} onClick={() => handleStatus(s)} disabled={saving}
                className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full transition-all ${
                  callStatus === s ? cls : ''
                }`}
                style={callStatus !== s ? {
                  background:'rgba(255,255,255,0.05)',
                  border:'1px solid rgba(255,255,255,0.08)',
                  color:'rgba(255,255,255,0.4)'
                } : {}}>
                <Ic size={10}/>{label}
              </button>
            ))}
          </div>
          {callStatus && (
            <textarea value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Notas de la llamada..." rows={2}
              className="glass-input w-full px-3.5 py-2.5 text-xs resize-none"/>
          )}
        </div>
      </div>

      {/* ── Footer ── */}
      <div className="px-5 py-2.5 flex items-center justify-between"
        style={{borderTop:'1px solid rgba(255,255,255,0.04)'}}>
        <span className="text-xs font-medium" style={{color:'rgba(255,255,255,0.2)'}}>{company.name}</span>
        <span className="text-xs font-mono" style={{color:'rgba(255,255,255,0.1)'}}>Ficha #{cardIndex}</span>
      </div>
    </div>
  )
}
