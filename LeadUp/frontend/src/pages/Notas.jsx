import { useState, useEffect } from 'react'
import { useAuth } from '../hooks/useAuth.jsx'
import http from '../lib/api'
import {
  FileText, Phone, Globe, CheckCircle2, PhoneMissed,
  XCircle, Clock, Calendar, Search, ChevronDown, ChevronUp, Trash2,
} from 'lucide-react'

const STATUS = {
  agendado:    { label:'Agendado',      color:'#10b981', bg:'rgba(16,185,129,0.1)',  Icon:CheckCircle2 },
  no_interest: { label:'No interesado', color:'#ef4444', bg:'rgba(239,68,68,0.1)',   Icon:XCircle },
  no_answer:   { label:'No contesta',   color:'#f59e0b', bg:'rgba(245,158,11,0.1)',  Icon:PhoneMissed },
  pending:     { label:'Pendiente',     color:'#3b82f6', bg:'rgba(59,130,246,0.1)',  Icon:Clock },
  closed:      { label:'Agendado',      color:'#10b981', bg:'rgba(16,185,129,0.1)',  Icon:CheckCircle2 },
}

function NoteCard({ note, expanded, onToggle, onDelete }) {
  const s = STATUS[note.call_status] || STATUS.pending
  const SIcon = s.Icon
  const dateStr = new Date(note.assigned_date).toLocaleDateString('es-ES', {
    weekday:'short', day:'numeric', month:'short',
  })

  return (
    <div
      onClick={onToggle}
      className="glass-card cursor-pointer transition-all duration-200"
      style={{
        borderRadius:16,
        borderColor: expanded ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.06)',
        boxShadow: expanded ? '0 8px 32px rgba(0,0,0,0.3)' : 'none',
      }}>

      {/* Header siempre visible */}
      <div className="flex items-start gap-4 p-4">
        {/* Inicial empresa */}
        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 font-bold text-sm"
          style={{background:'rgba(59,130,246,0.12)',border:'1px solid rgba(59,130,246,0.2)',color:'#60a5fa'}}>
          {(note.company_name||'?')[0].toUpperCase()}
        </div>

        <div className="flex-1 min-w-0">
          {/* Empresa + sector */}
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <p className="font-bold text-white text-sm">{note.company_name}</p>
            {note.sector && (
              <span className="font-mono text-xs px-2 py-0.5 rounded-full"
                style={{background:'rgba(59,130,246,0.08)',color:'rgba(96,165,250,0.7)',
                  border:'1px solid rgba(59,130,246,0.15)'}}>
                {note.sector}
              </span>
            )}
          </div>

          {/* DM + ciudad */}
          <p className="text-xs" style={{color:'rgba(255,255,255,0.4)'}}>
            {note.dm_name && <>{note.dm_name} · </>}{note.city}
          </p>

          {/* Preview nota */}
          {!expanded && (
            <p className="text-xs mt-1.5 line-clamp-1 font-mono italic"
              style={{color:'rgba(255,255,255,0.55)'}}>
              "{note.notes}"
            </p>
          )}
        </div>

        {/* Right: status + fecha + toggle + borrar */}
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full"
            style={{background:s.bg,color:s.color,border:`1px solid ${s.color}25`}}>
            <SIcon size={10}/>{s.label}
          </span>
          <div className="flex items-center gap-1.5" style={{color:'rgba(255,255,255,0.3)'}}>
            <Calendar size={10}/>
            <span className="font-mono text-xs">{dateStr}</span>
          </div>
          <div className="flex items-center gap-2">
            {/* Borrar nota */}
            <button
              onClick={e=>{ e.stopPropagation(); onDelete(note.assignment_id) }}
              title="Eliminar nota"
              style={{background:'none',border:'none',cursor:'pointer',padding:4,
                color:'rgba(239,68,68,0.4)',transition:'color .15s ease'}}
              onMouseOver={e=>e.currentTarget.style.color='#ef4444'}
              onMouseOut={e=>e.currentTarget.style.color='rgba(239,68,68,0.4)'}>
              <Trash2 size={13}/>
            </button>
            <div style={{color:'rgba(255,255,255,0.2)'}}>
              {expanded ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}
            </div>
          </div>
        </div>
      </div>

      {/* Contenido expandido */}
      {expanded && (
        <div style={{borderTop:'1px solid rgba(255,255,255,0.05)'}}>

          {/* Nota completa */}
          <div className="px-4 py-4">
            <p className="font-mono text-xs mb-2 font-bold tracking-widest"
              style={{color:'rgba(255,255,255,0.28)'}}>NOTA DE LLAMADA</p>
            <div className="rounded-xl px-4 py-3"
              style={{background:'rgba(0,0,0,0.3)',border:'1px solid rgba(255,255,255,0.05)'}}>
              <p className="text-sm leading-relaxed font-mono"
                style={{color:'rgba(255,255,255,0.75)',whiteSpace:'pre-wrap'}}>
                {note.notes}
              </p>
            </div>
          </div>

          {/* Datos contacto */}
          <div className="px-4 pb-4 grid grid-cols-2 gap-3">
            {note.dm_phone && (
              <a href={`tel:${note.dm_phone}`}
                className="flex items-center gap-2 rounded-xl px-3 py-2.5 transition-all"
                style={{background:'rgba(16,185,129,0.08)',border:'1px solid rgba(16,185,129,0.2)'}}
                onClick={e=>e.stopPropagation()}>
                <Phone size={13} style={{color:'#10b981',flexShrink:0}}/>
                <span className="font-mono text-sm font-bold" style={{color:'#10b981'}}>
                  {note.dm_phone}
                </span>
              </a>
            )}
            {note.website && (
              <a href={note.website} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-xl px-3 py-2.5 transition-all"
                style={{background:'rgba(59,130,246,0.08)',border:'1px solid rgba(59,130,246,0.2)'}}
                onClick={e=>e.stopPropagation()}>
                <Globe size={13} style={{color:'#60a5fa',flexShrink:0}}/>
                <span className="text-xs truncate" style={{color:'#60a5fa'}}>
                  {note.website.replace(/https?:\/\//,'')}
                </span>
              </a>
            )}
            {note.dm_email && (
              <div className="col-span-2 flex items-center gap-2 rounded-xl px-3 py-2"
                style={{background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.06)'}}>
                <span className="text-xs" style={{color:'rgba(255,255,255,0.3)'}}>Email:</span>
                <span className="text-xs" style={{color:'rgba(255,255,255,0.6)'}}>{note.dm_email}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default function Notas() {
  const { user } = useAuth()
  const [notes, setNotes]       = useState([])
  const [filtered, setFiltered] = useState([])
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState('')
  const [expanded, setExpanded] = useState(null)
  const [filter, setFilter]     = useState('all')

  const loadNotes = () => {
    http.get('/notes/')
      .then(r => setNotes(r.data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  useEffect(() => { loadNotes() }, [])

  const handleDelete = async (assignmentId) => {
    if (!window.confirm('¿Eliminar esta nota?')) return
    try {
      await http.delete(`/notes/${assignmentId}`)
      setNotes(prev => prev.filter(n => n.assignment_id !== assignmentId))
      if (expanded === assignmentId) setExpanded(null)
    } catch { alert('Error al eliminar') }
  }

  useEffect(() => {
    let result = notes
    if (search) {
      const q = search.toLowerCase()
      result = result.filter(n =>
        n.company_name?.toLowerCase().includes(q) ||
        n.notes?.toLowerCase().includes(q) ||
        n.dm_name?.toLowerCase().includes(q)
      )
    }
    if (filter !== 'all') {
      result = result.filter(n => n.call_status === filter)
    }
    setFiltered(result)
  }, [search, filter, notes])

  const filters = [
    {key:'all',         label:`Todas (${notes.length})`},
    {key:'agendado',    label:'Agendados'},
    {key:'no_answer',   label:'No contesta'},
    {key:'no_interest', label:'No interesado'},
    {key:'pending',     label:'Pendiente'},
  ]

  return (
    <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>

      {/* Header fijo */}
      <div style={{padding:'20px 24px 16px',borderBottom:'1px solid rgba(255,255,255,0.05)',flexShrink:0}}>
        <div className="flex items-center justify-between gap-4 mb-4">
          <div>
            <h2 className="text-lg font-bold text-white">Mis Notas</h2>
            <p className="font-mono text-xs" style={{color:'rgba(255,255,255,0.3)'}}>
              {user?.name?.toUpperCase()} · {filtered.length} notas
            </p>
          </div>
          <div className="flex items-center gap-1.5 font-mono text-xs">
            <FileText size={14} style={{color:'rgba(255,255,255,0.3)'}}/>
            <span style={{color:'rgba(255,255,255,0.3)'}}>{notes.length} total</span>
          </div>
        </div>

        {/* Búsqueda */}
        <div style={{position:'relative',marginBottom:12}}>
          <Search size={13} style={{position:'absolute',left:12,top:'50%',
            transform:'translateY(-50%)',color:'rgba(255,255,255,0.25)',pointerEvents:'none'}}/>
          <input
            value={search}
            onChange={e=>setSearch(e.target.value)}
            placeholder="Buscar empresa, nota o contacto..."
            className="glass-input w-full text-sm"
            style={{paddingLeft:36,paddingRight:16,paddingTop:10,paddingBottom:10}}
          />
        </div>

        {/* Filtros */}
        <div className="flex gap-2 flex-wrap">
          {filters.map(f=>(
            <button key={f.key} onClick={()=>setFilter(f.key)}
              className="font-mono text-xs px-3 py-1.5 rounded-full transition-all"
              style={{
                background: filter===f.key ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.04)',
                border: filter===f.key ? '1px solid rgba(96,165,250,0.3)' : '1px solid rgba(255,255,255,0.08)',
                color: filter===f.key ? '#60a5fa' : 'rgba(255,255,255,0.4)',
                cursor:'pointer',
              }}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Lista scrollable */}
      <div style={{flex:1,overflowY:'auto',padding:'16px 24px'}}>
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"/>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
              style={{background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.06)'}}>
              <FileText size={28} style={{color:'rgba(255,255,255,0.15)'}}/>
            </div>
            <p className="font-semibold text-white mb-1">Sin notas aún</p>
            <p className="text-sm" style={{color:'rgba(255,255,255,0.35)'}}>
              {search ? 'Sin resultados para esa búsqueda' : 'Las notas que escribas aparecerán aquí'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(n => (
              <NoteCard
                key={n.assignment_id}
                note={n}
                expanded={expanded === n.assignment_id}
                onToggle={() => setExpanded(
                  expanded === n.assignment_id ? null : n.assignment_id
                )}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
