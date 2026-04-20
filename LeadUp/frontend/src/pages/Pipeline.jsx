import { useState, useEffect } from 'react'
import { Phone, CheckCircle2, XCircle, PhoneMissed, Clock, RotateCcw, Globe } from 'lucide-react'
import { leads as leadsApi } from '../lib/api'

const COLS = [
  { key:'pending',   label:'PENDIENTE',       color:'#3b82f6', bg:'rgba(59,130,246,0.08)',  border:'rgba(59,130,246,0.2)',  Icon:Clock },
  { key:'no_answer', label:'NO CONTESTA',      color:'#f59e0b', bg:'rgba(245,158,11,0.08)',  border:'rgba(245,158,11,0.2)',  Icon:PhoneMissed },
  { key:'no_interest',  label:'NO INTERESADO',       color:'#ef4444', bg:'rgba(239,68,68,0.08)',   border:'rgba(239,68,68,0.2)',   Icon:XCircle },
  { key:'agendado',    label:'AGENDADO',          color:'#10b981', bg:'rgba(16,185,129,0.08)',  border:'rgba(16,185,129,0.2)',  Icon:CheckCircle2 },
]

function LeadCard({ lead, onStatus }) {
  const contacts = lead.contacts || []
  const arr = Array.isArray(contacts) ? contacts : (() => { try { return JSON.parse(contacts) } catch { return [] } })()
  const p = arr.find(c=>c?.is_primary) || arr[0]

  return (
    <div className="rounded-xl p-3 mb-2 transition-all duration-150 hover:scale-[1.01]"
      style={{background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.06)'}}>
      <p className="text-xs font-bold text-white truncate mb-0.5">{lead.name}</p>
      <p className="font-mono text-xs truncate" style={{color:'rgba(255,255,255,0.3)'}}>
        {(lead.city||'').toUpperCase()} · {(lead.sector_tag||lead.sector||'').toUpperCase()}
      </p>
      {p?.phone && (
        <p className="font-mono text-xs mt-1.5" style={{color:'#10b981'}}>{p.phone}</p>
      )}
      {lead.notes && (
        <p className="text-xs mt-1.5 italic line-clamp-2" style={{color:'rgba(255,255,255,0.35)'}}>{lead.notes}</p>
      )}
      {lead.attempt_count > 0 && (
        <div className="flex items-center gap-1 mt-1.5">
          <RotateCcw size={9} style={{color:'#f59e0b'}}/>
          <span className="font-mono text-xs" style={{color:'#f59e0b'}}>intento {lead.attempt_count+1}</span>
        </div>
      )}
    </div>
  )
}

export default function Pipeline() {
  const [data, setData] = useState({ leads:[] })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    leadsApi.today()
      .then(r => setData(r.data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const byStatus = (key) => (data.leads||[]).filter(l => l.call_status === key)

  if (loading) return (
    <div className="flex-1 flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"/>
    </div>
  )

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-8 pt-6 pb-4 shrink-0" style={{borderBottom:'1px solid rgba(255,255,255,0.05)'}}>
        <h2 className="text-lg font-bold text-white">Pipeline del Día</h2>
        <p className="font-mono text-xs mt-1" style={{color:'rgba(255,255,255,0.3)'}}>
          {data.total || 0} LEADS ASIGNADOS HOY
        </p>
      </div>

      <div className="flex-1 overflow-x-auto overflow-y-hidden">
        <div className="flex gap-4 p-6 h-full min-w-max">
          {COLS.map(({ key, label, color, bg, border, Icon }) => {
            const items = byStatus(key)
            return (
              <div key={key} className="flex flex-col" style={{width:260}}>
                {/* Column header */}
                <div className="flex items-center justify-between px-3 py-2.5 rounded-xl mb-3"
                  style={{background:bg, border:`1px solid ${border}`}}>
                  <div className="flex items-center gap-2">
                    <Icon size={13} style={{color}}/>
                    <span className="font-mono text-xs font-bold" style={{color, letterSpacing:'0.06em'}}>
                      {label}
                    </span>
                  </div>
                  <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-full"
                    style={{background:`${color}22`, color}}>
                    {items.length}
                  </span>
                </div>

                {/* Cards */}
                <div className="flex-1 overflow-y-auto pr-1">
                  {items.length === 0 ? (
                    <div className="flex items-center justify-center h-20 rounded-xl"
                      style={{border:'1px dashed rgba(255,255,255,0.06)'}}>
                      <span className="font-mono text-xs" style={{color:'rgba(255,255,255,0.15)'}}>vacío</span>
                    </div>
                  ) : items.map(l => <LeadCard key={l.assignment_id||l.id} lead={l}/>)}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
