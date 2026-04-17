import { CheckCircle2, XCircle, PhoneMissed, Clock } from 'lucide-react'

const STATUS = {
  closed:    { label: 'Cerrado',         icon: CheckCircle2,  cls: 'status-closed' },
  rejected:  { label: 'Rechazado',       icon: XCircle,       cls: 'status-rejected' },
  no_answer: { label: 'Sin contestar',   icon: PhoneMissed,   cls: 'status-no_answer' },
  pending:   { label: 'Pendiente',       icon: Clock,         cls: 'status-pending' },
}

export default function StatusBar({ status, onChange, companyId, contacts = [] }) {
  const current = STATUS[status] || STATUS.pending
  const Icon = current.icon

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${current.cls}`}>
        <Icon size={12} />
        {current.label}
      </span>

      {onChange && (
        <div className="flex items-center gap-1">
          {['closed', 'rejected', 'no_answer'].map(s => {
            const opt = STATUS[s]
            const Ic = opt.icon
            return (
              <button
                key={s}
                onClick={() => onChange(s)}
                className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md border transition-all
                  ${status === s
                    ? opt.cls
                    : 'bg-white/5 border-white/10 text-slate-400 hover:border-white/20 hover:text-white'}`}
              >
                <Ic size={11} />
                {opt.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
