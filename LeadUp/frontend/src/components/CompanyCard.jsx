import { useState } from 'react'
import {
  Globe, Users, BarChart3, PhoneCall, ChevronDown, ChevronUp,
  TrendingUp, Cpu, Video, Star, CheckCircle2, XCircle, PhoneMissed,
  ShieldCheck,
} from 'lucide-react'
import ContactBadge from './ContactBadge'
import StatusBar from './StatusBar'
import { companies as companiesApi } from '../lib/api'

const LEVEL_CLS = { ALTA: 'badge-alta', MEDIA: 'badge-media', BAJA: 'badge-baja' }

function ScoreRing({ value = 0 }) {
  const r = 18, c = 2 * Math.PI * r
  const dash = (value / 100) * c
  const color = value >= 70 ? '#10b981' : value >= 40 ? '#f59e0b' : '#ef4444'
  return (
    <div className="relative w-12 h-12 flex items-center justify-center">
      <svg width="48" height="48" className="-rotate-90">
        <circle cx="24" cy="24" r={r} fill="none" stroke="#1a3a6b" strokeWidth="3" />
        <circle cx="24" cy="24" r={r} fill="none" stroke={color} strokeWidth="3"
          strokeDasharray={`${dash} ${c}`} strokeLinecap="round" />
      </svg>
      <span className="absolute text-xs font-bold" style={{ color }}>{value}</span>
    </div>
  )
}

function EcosystemRow({ label, value, positive }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-white/5 last:border-0">
      <span className="text-xs text-slate-400">{label}</span>
      <span className={`text-xs font-medium ${positive ? 'text-emerald-400' : 'text-slate-500'}`}>
        {value || (positive ? '✓' : '✗')}
      </span>
    </div>
  )
}

export default function CompanyCard({ company, cardIndex, onStatusChange }) {
  const [expanded, setExpanded] = useState(false)
  const [callStatus, setCallStatus] = useState(company.last_call_status || null)
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const primary = company.contacts?.find(c => c.is_primary) || company.contacts?.[0]
  const secondary = company.contacts?.filter(c => !c.is_primary).slice(0, 2) || []

  const handleStatus = async (status) => {
    setSaving(true)
    try {
      await companiesApi.updateStatus(company.id, status, notes, primary?.id)
      setCallStatus(status)
      onStatusChange?.(company.id, status)
    } catch (e) {
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  const seoLabel = s => s >= 70 ? 'Bueno' : s >= 40 ? 'Medio' : 'Bajo'

  return (
    <div className="bg-[#0f2040] border border-white/5 rounded-2xl overflow-hidden hover:border-white/10 transition-all duration-200">

      {/* ── Header azul marino ── */}
      <div className="bg-gradient-to-r from-[#0a1628] to-[#0f2040] border-b border-white/5 px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base font-bold text-white truncate">{company.name}</h3>
              {company.opportunity_level && (
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${LEVEL_CLS[company.opportunity_level] || ''}`}>
                  {company.opportunity_level}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 mt-1 text-xs text-slate-400 flex-wrap">
              {company.city && <span>📍 {company.city}</span>}
              {company.sector && <span>• {company.sector}</span>}
              {company.website && (
                <a href={company.website} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 text-blue-400 hover:text-blue-300 transition-colors">
                  <Globe size={11} />
                  <span className="truncate max-w-[140px]">{company.website.replace(/https?:\/\//, '')}</span>
                </a>
              )}
            </div>
          </div>
          <span className="text-xs text-slate-600 shrink-0 font-mono">#{cardIndex}</span>
        </div>

        {/* GMB rating */}
        {company.gmb_rating && (
          <div className="flex items-center gap-1 mt-2">
            {[...Array(5)].map((_, i) => (
              <Star key={i} size={11}
                className={i < Math.round(company.gmb_rating) ? 'text-amber-400 fill-amber-400' : 'text-slate-600'} />
            ))}
            <span className="text-xs text-slate-400 ml-1">
              {company.gmb_rating?.toFixed(1)} ({company.gmb_reviews} reseñas)
            </span>
          </div>
        )}
      </div>

      {/* ── KPIs ── */}
      <div className="grid grid-cols-4 divide-x divide-white/5 border-b border-white/5">
        {[
          { label: 'Profesionales', value: company.employee_count || '—', icon: Users },
          { label: 'Score Digital', value: <ScoreRing value={company.digital_score || 0} />, raw: true },
          { label: 'CRM', value: company.has_crm || 'No detectado', icon: ShieldCheck },
          { label: 'Decisores', value: company.contact_count || company.contacts?.length || '—', icon: PhoneCall },
        ].map(({ label, value, icon: Ic, raw }) => (
          <div key={label} className="flex flex-col items-center py-3 px-2 gap-1">
            <span className="text-xs text-slate-500">{label}</span>
            {raw ? value : (
              <div className="flex items-center gap-1">
                {Ic && <Ic size={13} className="text-blue-400 shrink-0" />}
                <span className="text-sm font-semibold text-white truncate">{value}</span>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="p-5 space-y-4">
        {/* ── Resumen ── */}
        {company.summary && (
          <p className="text-sm text-slate-300 leading-relaxed">{company.summary}</p>
        )}

        {/* ── Decision Makers ── */}
        {(primary || secondary.length > 0) && (
          <div>
            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
              Decision Makers
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {primary && <ContactBadge contact={primary} primary />}
              {secondary.map((c, i) => <ContactBadge key={i} contact={c} />)}
            </div>
          </div>
        )}

        {/* ── Oportunidades ── */}
        {(company.opportunity_sales || company.opportunity_tech || company.opportunity_av) && (
          <div>
            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
              Oportunidades
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {company.opportunity_sales && (
                <div className="rounded-lg p-3 bg-emerald-500/5 border border-emerald-500/20">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <TrendingUp size={13} className="text-emerald-400" />
                    <span className="text-xs font-semibold text-emerald-400">Sales / CRM</span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">{company.opportunity_sales}</p>
                </div>
              )}
              {company.opportunity_tech && (
                <div className="rounded-lg p-3 bg-blue-500/5 border border-blue-500/20">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Cpu size={13} className="text-blue-400" />
                    <span className="text-xs font-semibold text-blue-400">Tech / IA</span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">{company.opportunity_tech}</p>
                </div>
              )}
              {company.opportunity_av && (
                <div className="rounded-lg p-3 bg-orange-500/5 border border-orange-500/20">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Video size={13} className="text-orange-400" />
                    <span className="text-xs font-semibold text-orange-400">Contenido AV</span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">{company.opportunity_av}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Ecosistema Digital (expandible) ── */}
        <button
          onClick={() => setExpanded(v => !v)}
          className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors w-full"
        >
          {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          Ecosistema digital
        </button>

        {expanded && (
          <div className="bg-[#0a1628] rounded-xl p-4 border border-white/5">
            <div className="grid grid-cols-2 gap-x-8">
              <div>
                <EcosystemRow label="Presencia web"       value={company.website ? 'Sí' : 'No'}   positive={!!company.website} />
                <EcosystemRow label="CRM detectado"       value={company.has_crm || 'No'}          positive={!!company.has_crm} />
                <EcosystemRow label="Facebook Pixel"      positive={company.has_facebook_pixel}    value={company.has_facebook_pixel ? 'Activo' : 'No'} />
                <EcosystemRow label="Google Ads"          positive={company.has_google_ads}        value={company.has_google_ads ? 'Activo' : 'No'} />
              </div>
              <div>
                <EcosystemRow label="SEO Score"           value={`${company.seo_score || 0}/100 — ${seoLabel(company.seo_score || 0)}`} positive={(company.seo_score || 0) >= 40} />
                <EcosystemRow label="Facebook"            value={company.social_facebook ? '✓' : '✗'} positive={!!company.social_facebook} />
                <EcosystemRow label="LinkedIn"            value={company.social_linkedin ? '✓' : '✗'} positive={!!company.social_linkedin} />
                <EcosystemRow label="Instagram"           value={company.social_instagram ? '✓' : '✗'} positive={!!company.social_instagram} />
              </div>
            </div>
          </div>
        )}

        {/* ── Estado de llamada ── */}
        <div className="pt-2 border-t border-white/5">
          <StatusBar status={callStatus} onChange={handleStatus} companyId={company.id} />
          {callStatus && (
            <textarea
              placeholder="Notas de la llamada..."
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              className="mt-2 w-full bg-[#0a1628] border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-300 placeholder-slate-600 resize-none focus:outline-none focus:border-blue-500/50 transition-colors"
            />
          )}
        </div>
      </div>

      {/* ── Footer ── */}
      <div className="px-5 py-2.5 border-t border-white/5 flex items-center justify-between">
        <span className="text-xs text-slate-600 font-medium">{company.name}</span>
        <span className="text-xs text-slate-700 font-mono">Ficha #{cardIndex}</span>
      </div>
    </div>
  )
}
