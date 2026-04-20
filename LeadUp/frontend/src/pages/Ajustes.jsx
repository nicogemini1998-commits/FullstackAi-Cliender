import { useState } from 'react'
import { useAuth } from '../hooks/useAuth.jsx'
import { leads as leadsApi } from '../lib/api'
import { User, Shield, Zap, CheckCircle2 } from 'lucide-react'

const USERS = [
  { name:'Nicolas', email:'nicolas@cliender.com', role:'admin',      pwd:'Master123' },
  { name:'Ruben',   email:'ruben@cliender.com',   role:'commercial', pwd:'Cliender123' },
  { name:'Ethan',   email:'ethan@cliender.com',   role:'commercial', pwd:'Cliender123' },
  { name:'Toni',    email:'toni@cliender.com',    role:'commercial', pwd:'Cliender123' },
]

const SECTORS = [
  'Reformas y construcción',
  'Clínicas estética/dental',
  'Academias y formación',
  'Inmobiliarias',
  'Concesionarios',
  'Gimnasios',
  'Seguros',
  'Abogados / Despachos',
]

export default function Ajustes() {
  const { user } = useAuth()
  const isAdmin  = user?.role === 'admin'
  const [assigning, setAssigning] = useState(false)
  const [done, setDone]           = useState('')

  const assign = async () => {
    setAssigning(true); setDone('')
    try {
      await leadsApi.assignNow()
      setDone('Leads asignados correctamente')
    } catch { setDone('Error al asignar') }
    finally { setAssigning(false) }
  }

  return (
    <div className="flex-1 overflow-y-auto px-8 py-6">
      <div className="max-w-2xl mx-auto space-y-6">

        <div>
          <h2 className="text-lg font-bold text-white mb-1">Ajustes</h2>
          <p className="font-mono text-xs" style={{color:'rgba(255,255,255,0.3)'}}>
            {user?.name?.toUpperCase()} · {user?.role?.toUpperCase()}
          </p>
        </div>

        {/* Mi perfil */}
        <div className="rounded-2xl p-5" style={{background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.06)'}}>
          <div className="flex items-center gap-2 mb-4">
            <User size={14} style={{color:'#3b82f6'}}/>
            <p className="font-mono text-xs font-bold tracking-widest" style={{color:'rgba(255,255,255,0.5)'}}>MI PERFIL</p>
          </div>
          {[
            {label:'Nombre', val:user?.name},
            {label:'Email',  val:user?.email},
            {label:'Rol',    val:user?.role === 'admin' ? 'Administrador' : 'Comercial'},
          ].map(({label,val})=>(
            <div key={label} className="flex items-center justify-between py-2.5"
              style={{borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
              <span className="font-mono text-xs" style={{color:'rgba(255,255,255,0.35)'}}>{label}</span>
              <span className="text-sm font-medium text-white">{val}</span>
            </div>
          ))}
        </div>

        {/* Admin: usuarios */}
        {isAdmin && (
          <div className="rounded-2xl p-5" style={{background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.06)'}}>
            <div className="flex items-center gap-2 mb-4">
              <Shield size={14} style={{color:'#3b82f6'}}/>
              <p className="font-mono text-xs font-bold tracking-widest" style={{color:'rgba(255,255,255,0.5)'}}>USUARIOS DEL EQUIPO</p>
            </div>
            <div className="space-y-2">
              {USERS.map(u=>(
                <div key={u.email} className="flex items-center justify-between px-3 py-2.5 rounded-xl"
                  style={{background:'rgba(255,255,255,0.02)',border:'1px solid rgba(255,255,255,0.05)'}}>
                  <div>
                    <p className="text-sm font-semibold text-white">{u.name}</p>
                    <p className="font-mono text-xs" style={{color:'rgba(255,255,255,0.35)'}}>{u.email}</p>
                  </div>
                  <div className="text-right">
                    <span className="font-mono text-xs px-2 py-0.5 rounded-full"
                      style={{
                        background: u.role==='admin' ? 'rgba(59,130,246,0.12)' : 'rgba(16,185,129,0.1)',
                        color: u.role==='admin' ? '#60a5fa' : '#34d399',
                        border: `1px solid ${u.role==='admin' ? 'rgba(59,130,246,0.25)' : 'rgba(16,185,129,0.2)'}`,
                      }}>
                      {u.role === 'admin' ? 'Admin' : 'Comercial'}
                    </span>
                    <p className="font-mono text-xs mt-1" style={{color:'rgba(255,255,255,0.2)'}}>pwd: {u.pwd}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Admin: operaciones */}
        {isAdmin && (
          <div className="rounded-2xl p-5" style={{background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.06)'}}>
            <div className="flex items-center gap-2 mb-4">
              <Zap size={14} style={{color:'#3b82f6'}}/>
              <p className="font-mono text-xs font-bold tracking-widest" style={{color:'rgba(255,255,255,0.5)'}}>OPERACIONES</p>
            </div>
            <div className="space-y-3">
              <div>
                <p className="text-sm font-semibold text-white mb-1">Asignación manual de leads</p>
                <p className="text-xs mb-3" style={{color:'rgba(255,255,255,0.4)'}}>
                  Asigna 12 leads nuevos con teléfono verificado a cada comercial.
                  El scheduler lo hace automáticamente cada día a las 8:00.
                </p>
                <button onClick={assign} disabled={assigning}
                  className="glass-btn glass-btn-blue flex items-center gap-2 px-5 py-2.5 text-sm font-semibold">
                  {assigning ? 'Asignando...' : <><Zap size={13}/>Asignar leads ahora</>}
                </button>
                {done && (
                  <p className="flex items-center gap-1.5 mt-2 text-xs" style={{color:'#10b981'}}>
                    <CheckCircle2 size={12}/>{done}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Sectores activos */}
        <div className="rounded-2xl p-5" style={{background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.06)'}}>
          <p className="font-mono text-xs font-bold tracking-widest mb-4" style={{color:'rgba(255,255,255,0.5)'}}>
            SECTORES ACTIVOS
          </p>
          <div className="grid grid-cols-2 gap-2">
            {SECTORS.map(s=>(
              <div key={s} className="flex items-center gap-2 px-3 py-2 rounded-lg"
                style={{background:'rgba(59,130,246,0.06)',border:'1px solid rgba(59,130,246,0.15)'}}>
                <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{background:'#3b82f6'}}/>
                <span className="text-xs" style={{color:'rgba(255,255,255,0.65)'}}>{s}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Info sistema */}
        <div className="rounded-2xl p-5 font-mono"
          style={{background:'rgba(0,0,0,0.3)',border:'1px solid rgba(255,255,255,0.04)'}}>
          <p className="text-xs mb-3 tracking-widest font-bold" style={{color:'rgba(255,255,255,0.22)'}}>SISTEMA</p>
          {[
            ['API Leads',     'Apollo.io · verificado'],
            ['Análisis',      'Claude Haiku · activo'],
            ['Scheduler',     '08:00 Madrid · automático'],
            ['Reintentos',    'No contesta → +3 días'],
            ['Leads/usuario', '12 por día con teléfono'],
          ].map(([k,v])=>(
            <p key={k} className="text-xs mb-1" style={{color:'rgba(255,255,255,0.35)'}}>
              {k.padEnd(20,' ')} <span style={{color:'rgba(255,255,255,0.6)'}}>{v}</span>
            </p>
          ))}
        </div>

      </div>
    </div>
  )
}
