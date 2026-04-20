import { useState, useEffect } from 'react'
import { useAuth } from '../hooks/useAuth.jsx'
import api from '../lib/api'

/* ── helpers ────────────────────────────────────────────── */
const clr = v => v >= 30 ? '#10b981' : v >= 15 ? '#f59e0b' : '#ef4444'

function Arc({ value = 0, size = 56, stroke = 3.5 }) {
  const r = (size/2) - stroke
  const c = 2 * Math.PI * r
  const fill = Math.min(value/100,1)*c
  const color = clr(value)
  return (
    <div style={{position:'relative',width:size,height:size,display:'flex',alignItems:'center',justifyContent:'center'}}>
      <svg width={size} height={size} style={{position:'absolute',transform:'rotate(-90deg)'}}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={stroke}/>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={`${fill} ${c}`} strokeLinecap="round"
          style={{filter:`drop-shadow(0 0 5px ${color}88)`,transition:'stroke-dasharray .6s ease'}}/>
      </svg>
      <span style={{fontSize:size*0.22,fontWeight:700,fontFamily:"'DM Mono',monospace",color}}>{value}%</span>
    </div>
  )
}

function HBar({ value, max, color, height=6 }) {
  const pct = max > 0 ? Math.min(Math.round(value/max*100),100) : 0
  return (
    <div style={{height,borderRadius:height,background:'rgba(255,255,255,0.05)',overflow:'hidden'}}>
      <div style={{height:'100%',borderRadius:height,width:`${pct}%`,background:color,
        transition:'width .7s cubic-bezier(0.32,0.72,0,1)'}}/>
    </div>
  )
}

function KPI({ label, value, color = '#fff', sub, big }) {
  return (
    <div style={{background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.06)',
      borderRadius:16,padding:'16px 18px'}}>
      <p style={{fontFamily:"'DM Mono',monospace",fontSize:10,color:'rgba(255,255,255,0.3)',
        letterSpacing:'0.1em',marginBottom:8}}>{label}</p>
      <p style={{fontSize:big?36:28,fontWeight:800,fontFamily:"'DM Mono',monospace",color,lineHeight:1}}>
        {value}
      </p>
      {sub && <p style={{fontSize:11,color:'rgba(255,255,255,0.35)',marginTop:6}}>{sub}</p>}
    </div>
  )
}

function UserCard({ u, rank }) {
  const pct = u.conversion
  const color = clr(pct)
  const llamadas = u.llamadas
  const maxBar = Math.max(u.total, 1)
  const isAdmin = u.role === 'admin'

  return (
    <div style={{
      background: rank === 1
        ? 'linear-gradient(135deg,rgba(59,130,246,0.08),rgba(16,185,129,0.05))'
        : 'rgba(255,255,255,0.025)',
      border: rank === 1 ? '1px solid rgba(59,130,246,0.2)' : '1px solid rgba(255,255,255,0.06)',
      borderRadius:16, padding:'18px 20px',
      position:'relative', overflow:'hidden',
    }}>
      {rank === 1 && (
        <div style={{position:'absolute',top:12,right:12,fontSize:10,fontFamily:"'DM Mono',monospace",
          color:'#f59e0b',background:'rgba(245,158,11,0.12)',border:'1px solid rgba(245,158,11,0.2)',
          padding:'2px 8px',borderRadius:999}}>TOP</div>
      )}

      {/* Header */}
      <div style={{display:'flex',alignItems:'center',gap:14,marginBottom:14}}>
        <div style={{width:40,height:40,borderRadius:'50%',flexShrink:0,
          background:`linear-gradient(135deg,${color}33,${color}11)`,
          border:`2px solid ${color}44`,
          display:'flex',alignItems:'center',justifyContent:'center',
          fontSize:16,fontWeight:800,color}}>
          {u.name[0]}
        </div>
        <div style={{flex:1,minWidth:0}}>
          <p style={{fontSize:15,fontWeight:700,color:'#fff',marginBottom:2}}>
            {u.name}
            {isAdmin && <span style={{fontSize:10,marginLeft:6,color:'#60a5fa',
              fontFamily:"'DM Mono',monospace",background:'rgba(59,130,246,0.1)',
              border:'1px solid rgba(59,130,246,0.2)',padding:'1px 6px',borderRadius:4}}>ADMIN</span>}
          </p>
          <p style={{fontSize:11,fontFamily:"'DM Mono',monospace",color:'rgba(255,255,255,0.3)'}}>
            {u.hoy} leads hoy · {llamadas} llamadas
          </p>
        </div>
        <Arc value={pct} size={52}/>
      </div>

      {/* Stats grid */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8,marginBottom:12}}>
        {[
          {label:'CERRADOS',  v:u.cerrados,    color:'#10b981'},
          {label:'NO COGE',   v:u.no_coge,     color:'#ef4444'},
          {label:'NO CONTESTA',v:u.no_contesta,color:'#f59e0b'},
        ].map(({label,v,color:c})=>(
          <div key={label} style={{background:`${c}10`,border:`1px solid ${c}20`,
            borderRadius:10,padding:'8px 10px',textAlign:'center'}}>
            <p style={{fontSize:20,fontWeight:800,fontFamily:"'DM Mono',monospace",color:c,lineHeight:1}}>{v}</p>
            <p style={{fontSize:9,fontFamily:"'DM Mono',monospace",color:'rgba(255,255,255,0.3)',
              marginTop:3,letterSpacing:'0.06em'}}>{label}</p>
          </div>
        ))}
      </div>

      {/* Progress bar */}
      <div style={{marginBottom:4}}>
        <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
          <span style={{fontSize:10,fontFamily:"'DM Mono',monospace",color:'rgba(255,255,255,0.3)'}}>
            PROGRESO — {llamadas}/{u.total} llamadas
          </span>
          <span style={{fontSize:10,fontFamily:"'DM Mono',monospace",color}}>{pct}% conversión</span>
        </div>
        <HBar value={llamadas} max={maxBar} color={`linear-gradient(90deg,#3b82f6,${color})`} height={5}/>
      </div>
    </div>
  )
}

function BarChart({ data, valueKey, labelKey, color, title }) {
  const max = Math.max(...data.map(d=>d[valueKey]), 1)
  return (
    <div style={{background:'rgba(255,255,255,0.02)',border:'1px solid rgba(255,255,255,0.05)',
      borderRadius:16,padding:'18px 20px'}}>
      <p style={{fontFamily:"'DM Mono',monospace",fontSize:10,color:'rgba(255,255,255,0.3)',
        letterSpacing:'0.1em',marginBottom:16}}>{title}</p>
      <div style={{display:'flex',flexDirection:'column',gap:10}}>
        {data.map(d=>(
          <div key={d[labelKey]} style={{display:'flex',alignItems:'center',gap:10}}>
            <span style={{fontSize:11,fontWeight:600,color:'rgba(255,255,255,0.7)',
              minWidth:130,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
              {d[labelKey]}
            </span>
            <div style={{flex:1}}>
              <HBar value={d[valueKey]} max={max} color={color} height={7}/>
            </div>
            <span style={{fontSize:11,fontFamily:"'DM Mono',monospace",
              color:'rgba(255,255,255,0.4)',minWidth:24,textAlign:'right'}}>
              {d[valueKey]}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function Analytics() {
  const { user } = useAuth()
  const [data, setData]     = useState(null)
  const [days, setDays]     = useState(7)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api.get(`/admin/analytics?days=${days}`)
      .then(r => setData(r.data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [days])

  if (loading) return (
    <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div style={{width:28,height:28,borderRadius:'50%',
        border:'2px solid rgba(59,130,246,0.6)',borderTopColor:'transparent',
        animation:'spin 0.8s linear infinite'}}/>
    </div>
  )

  if (!data) return null

  const g = data.global
  const convColor = clr(g.conversion_global)
  const ranked = [...(data.por_usuario||[])].sort((a,b)=>b.conversion-a.conversion)

  return (
    <div style={{flex:1,overflowY:'auto',padding:'20px 24px',
      fontFamily:"'Plus Jakarta Sans',system-ui,sans-serif"}}>
      <div style={{maxWidth:900,margin:'0 auto'}}>

        {/* Header */}
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:24}}>
          <div>
            <h2 style={{fontSize:20,fontWeight:800,color:'#fff',marginBottom:4}}>Analytics</h2>
            <p style={{fontSize:11,fontFamily:"'DM Mono',monospace",color:'rgba(255,255,255,0.3)'}}>
              {user?.name?.toUpperCase()} · {new Date().toLocaleDateString('es-ES',
                {weekday:'long',day:'numeric',month:'long'})}
            </p>
          </div>
          {/* Period selector */}
          <div style={{display:'flex',gap:6}}>
            {[1,7,30].map(d=>(
              <button key={d} onClick={()=>setDays(d)}
                style={{
                  padding:'6px 14px',fontSize:11,fontFamily:"'DM Mono',monospace",
                  fontWeight:days===d?700:400,cursor:'pointer',borderRadius:8,
                  background: days===d ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.04)',
                  border: days===d ? '1px solid rgba(96,165,250,0.3)' : '1px solid rgba(255,255,255,0.08)',
                  color: days===d ? '#60a5fa' : 'rgba(255,255,255,0.4)',
                }}>
                {d===1?'HOY':d===7?'7D':'30D'}
              </button>
            ))}
          </div>
        </div>

        {/* KPI Strip */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(130px,1fr))',gap:12,marginBottom:24}}>
          <KPI label="ASIGNACIONES"  value={g.total_asignaciones} big/>
          <KPI label="LLAMADAS"      value={g.llamadas_realizadas} color="#3b82f6"/>
          <KPI label="CERRADOS"      value={g.cerrados}  color="#10b981"/>
          <KPI label="NO COGE"       value={g.no_coge}   color="#ef4444"/>
          <KPI label="NO CONTESTA"   value={g.no_contesta} color="#f59e0b"/>
          <KPI label="PENDIENTES"    value={g.pendientes} color="rgba(255,255,255,0.5)"/>
        </div>

        {/* Conversión global */}
        <div style={{
          display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginBottom:24,
        }}>
          <div style={{background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.06)',
            borderRadius:16,padding:'20px 24px',display:'flex',alignItems:'center',gap:20}}>
            <Arc value={g.conversion_global} size={72} stroke={5}/>
            <div>
              <p style={{fontSize:11,fontFamily:"'DM Mono',monospace",
                color:'rgba(255,255,255,0.3)',marginBottom:6,letterSpacing:'0.1em'}}>
                TASA DE CONVERSIÓN GLOBAL
              </p>
              <p style={{fontSize:28,fontWeight:800,color:convColor,lineHeight:1}}>
                {g.conversion_global}%
              </p>
              <p style={{fontSize:12,color:'rgba(255,255,255,0.4)',marginTop:4}}>
                {g.cerrados} cerrados de {g.llamadas_realizadas} llamadas
              </p>
            </div>
          </div>

          {/* Evolución diaria simple */}
          <div style={{background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.06)',
            borderRadius:16,padding:'20px 24px'}}>
            <p style={{fontSize:10,fontFamily:"'DM Mono',monospace",color:'rgba(255,255,255,0.3)',
              letterSpacing:'0.1em',marginBottom:16}}>EVOLUCIÓN DIARIA</p>
            <div style={{display:'flex',alignItems:'flex-end',gap:6,height:60}}>
              {(data.diario||[]).length === 0 ? (
                <p style={{fontSize:12,color:'rgba(255,255,255,0.2)'}}>Sin datos aún</p>
              ) : (data.diario||[]).map((d,i)=>{
                const maxD = Math.max(...(data.diario||[]).map(x=>x.total),1)
                const h = Math.max(Math.round((d.total/maxD)*56),4)
                const hc = d.cerrados>0 ? Math.max(Math.round((d.cerrados/d.total)*h),2) : 0
                return (
                  <div key={i} title={`${d.dia}: ${d.total} leads, ${d.cerrados} cerrados`}
                    style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:1}}>
                    <div style={{width:'100%',position:'relative',height:h}}>
                      <div style={{position:'absolute',bottom:0,width:'100%',height:'100%',
                        background:'rgba(59,130,246,0.25)',borderRadius:'4px 4px 0 0'}}/>
                      {hc>0 && <div style={{position:'absolute',bottom:0,width:'100%',height:hc,
                        background:'#10b981',borderRadius:'4px 4px 0 0',
                        boxShadow:'0 0 6px rgba(16,185,129,0.4)'}}/>}
                    </div>
                    <span style={{fontSize:8,fontFamily:"'DM Mono',monospace",
                      color:'rgba(255,255,255,0.2)',letterSpacing:'0.02em'}}>
                      {d.dia.slice(5)}
                    </span>
                  </div>
                )
              })}
            </div>
            <div style={{display:'flex',gap:16,marginTop:12}}>
              <div style={{display:'flex',alignItems:'center',gap:5}}>
                <div style={{width:8,height:8,borderRadius:2,background:'rgba(59,130,246,0.4)'}}/>
                <span style={{fontSize:10,color:'rgba(255,255,255,0.3)',fontFamily:"'DM Mono',monospace"}}>Total</span>
              </div>
              <div style={{display:'flex',alignItems:'center',gap:5}}>
                <div style={{width:8,height:8,borderRadius:2,background:'#10b981'}}/>
                <span style={{fontSize:10,color:'rgba(255,255,255,0.3)',fontFamily:"'DM Mono',monospace"}}>Cerrados</span>
              </div>
            </div>
          </div>
        </div>

        {/* Rendimiento por usuario */}
        <div style={{marginBottom:24}}>
          <p style={{fontSize:10,fontFamily:"'DM Mono',monospace",color:'rgba(255,255,255,0.3)',
            letterSpacing:'0.1em',marginBottom:14}}>RENDIMIENTO POR USUARIO</p>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))',gap:12}}>
            {ranked.map((u,i)=>(
              <UserCard key={u.name} u={u} rank={i+1}/>
            ))}
          </div>
        </div>

        {/* Sectores + Ciudades */}
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginBottom:16}}>
          <BarChart
            data={data.sectores||[]}
            valueKey="n" labelKey="sector"
            color="linear-gradient(90deg,rgba(59,130,246,0.6),rgba(59,130,246,0.3))"
            title="LEADS POR SECTOR"/>
          <BarChart
            data={data.ciudades||[]}
            valueKey="n" labelKey="city"
            color="linear-gradient(90deg,rgba(16,185,129,0.6),rgba(16,185,129,0.3))"
            title="LEADS POR CIUDAD"/>
        </div>

      </div>
      <style>{`@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}
