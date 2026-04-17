import {
  Globe, Users, PhoneCall, TrendingUp, Star,
  CheckCircle2, XCircle, PhoneMissed, Clock, ChevronRight,
} from 'lucide-react'

const LEVEL = {
  ALTA:  { cls: 'badge-alta',  dot: '#34d399' },
  MEDIA: { cls: 'badge-media', dot: '#fbbf24' },
  BAJA:  { cls: 'badge-baja',  dot: '#9ca3af' },
}

const STATUS_INFO = {
  closed:    { label: 'Cliente contactado', cls: 'status-closed',    icon: CheckCircle2 },
  rejected:  { label: 'No lo coge',         cls: 'status-rejected',  icon: XCircle },
  no_answer: { label: 'Lo coge',            cls: 'status-no_answer', icon: PhoneMissed },
  pending:   { label: 'Pendiente llamar',   cls: 'status-pending',   icon: Clock },
}

function ScorePill({ value = 0 }) {
  const color = value >= 70 ? '#34d399' : value >= 40 ? '#fbbf24' : '#f87171'
  const bg    = value >= 70 ? 'rgba(16,185,129,0.12)' : value >= 40 ? 'rgba(245,158,11,0.12)' : 'rgba(239,68,68,0.12)'
  return (
    <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{color, background:bg}}>
      {value}/100
    </span>
  )
}

export default function CompanyCard({ company, cardIndex, onClick }) {
  const lvl    = LEVEL[company.opportunity_level]
  const status = STATUS_INFO[company.last_call_status] || STATUS_INFO.pending
  const StatusIcon = status.icon
  const primary = company.contacts?.find(c => c.is_primary) || company.contacts?.[0]

  return (
    <button onClick={() => onClick(company)}
      className="glass-card w-full text-left group"
      style={{transition:'all 220ms cubic-bezier(0.32,0.72,0,1)'}}>

      {/* ── Header ── */}
      <div className="px-5 pt-4 pb-3"
        style={{borderBottom:'1px solid rgba(255,255,255,0.04)',
          background:'linear-gradient(180deg,rgba(255,255,255,0.03) 0%,transparent 100%)'}}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-0.5">
              <h3 className="text-sm font-bold text-white truncate group-hover:text-blue-300 transition-colors">
                {company.name}
              </h3>
              {lvl && (
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${lvl.cls}`}>
                  {company.opportunity_level}
                </span>
              )}
            </div>
            <p className="text-xs truncate" style={{color:'rgba(255,255,255,0.3)'}}>
              {[company.city, company.sector, company.employee_count && `${company.employee_count} prof.`]
                .filter(Boolean).join(' · ')}
            </p>
          </div>
          <ChevronRight size={14} className="shrink-0 mt-0.5 opacity-30 group-hover:opacity-70 transition-opacity"/>
        </div>
      </div>

      {/* ── KPIs ── */}
      <div className="grid grid-cols-4 divide-x px-0"
        style={{borderBottom:'1px solid rgba(255,255,255,0.04)', borderColor:'rgba(255,255,255,0.04)'}}>
        <div className="flex flex-col items-center py-3 gap-0.5" style={{borderColor:'rgba(255,255,255,0.04)'}}>
          <span className="text-sm font-bold text-white">{company.employee_count || '—'}</span>
          <span className="text-xs" style={{color:'rgba(255,255,255,0.25)'}}>Prof.</span>
        </div>
        <div className="flex flex-col items-center py-3 gap-0.5" style={{borderColor:'rgba(255,255,255,0.04)'}}>
          <ScorePill value={company.digital_score || 0}/>
          <span className="text-xs" style={{color:'rgba(255,255,255,0.25)'}}>Digital</span>
        </div>
        <div className="flex flex-col items-center py-3 gap-0.5" style={{borderColor:'rgba(255,255,255,0.04)'}}>
          <span className="text-xs font-semibold text-white truncate px-1">{company.has_crm || 'No'}</span>
          <span className="text-xs" style={{color:'rgba(255,255,255,0.25)'}}>CRM</span>
        </div>
        <div className="flex flex-col items-center py-3 gap-0.5" style={{borderColor:'rgba(255,255,255,0.04)'}}>
          <span className="text-sm font-bold text-white">
            {company.contact_count || company.contacts?.length || 0}
          </span>
          <span className="text-xs" style={{color:'rgba(255,255,255,0.25)'}}>DMs</span>
        </div>
      </div>

      {/* ── Info rápida ── */}
      <div className="px-5 py-3 flex items-center justify-between gap-3">
        {/* Resumen */}
        <p className="text-xs line-clamp-2 flex-1" style={{color:'rgba(255,255,255,0.4)'}}>
          {company.summary || 'Sin resumen disponible'}
        </p>

        {/* Status + teléfono */}
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <span className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full ${status.cls}`}>
            <StatusIcon size={10}/>
            {status.label}
          </span>
          {primary?.phone && (
            <span className="text-xs font-mono" style={{color:'rgba(52,211,153,0.7)'}}>
              📞 {primary.phone}
            </span>
          )}
        </div>
      </div>
    </button>
  )
}
