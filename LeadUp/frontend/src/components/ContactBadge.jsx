import { Phone, Mail, Link2, Star } from 'lucide-react'

export default function ContactBadge({ contact, primary = false }) {
  if (!contact) return null

  return (
    <div className={`rounded-lg p-3 ${primary
      ? 'bg-[#0a1628] border border-blue-500/30'
      : 'bg-[#0a1628] border border-white/5'}`}>

      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            {primary && <Star size={11} className="text-amber-400 fill-amber-400 shrink-0" />}
            <span className="text-xs font-semibold text-white truncate">{contact.name || '—'}</span>
          </div>
          <span className="text-xs text-slate-400 truncate block">{contact.role || '—'}</span>
        </div>
      </div>

      <div className="space-y-1">
        {contact.phone && (
          <a
            href={`tel:${contact.phone}`}
            className="flex items-center gap-1.5 text-xs text-emerald-400 hover:text-emerald-300 transition-colors"
          >
            <Phone size={11} />
            <span className="font-mono">{contact.phone}</span>
          </a>
        )}
        {contact.email && (
          <a
            href={`mailto:${contact.email}`}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-300 transition-colors truncate"
          >
            <Mail size={11} />
            <span className="truncate">{contact.email}</span>
          </a>
        )}
        {contact.linkedin_url && (
          <a
            href={contact.linkedin_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 transition-colors"
          >
            <Link2 size={11} />
            <span>LinkedIn</span>
          </a>
        )}
      </div>
    </div>
  )
}
