import { useState, useEffect, useRef, useCallback } from 'react'
import {
  ReactFlow, Background, Controls, MiniMap,
  useNodesState, useEdgesState, addEdge,
  Handle, Position, NodeResizer, useReactFlow,
  getBezierPath, useNodes, BaseEdge,
} from '@xyflow/react'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import { io } from 'socket.io-client'
import {
  X, Terminal as TerminalIcon, Image as ImageIcon, Video,
  Loader2, AlertCircle, Download, Plus, ChevronDown, ChevronUp,
  LayoutTemplate, Trash2, Save, FolderOpen, Check,
  ChevronRight, Palette, Pencil, Play, Shuffle, FolderPlus, StickyNote,
  Bot, Send, RefreshCw, Sparkles,
} from 'lucide-react'

const SERVER = import.meta.env.PROD ? '' : 'http://localhost:3001'
const SPRING = 'cubic-bezier(0.32,0.72,0,1)'

// ── EventBus — comunicación entre nodos sin acoplamiento ──────────────────────
const Bus = {
  _: {},
  on(e, cb) { (this._[e] ??= []).push(cb); return () => this.off(e, cb) },
  off(e, cb) { this._[e] = this._[e]?.filter(l => l !== cb) },
  emit(e, d) { this._[e]?.forEach(cb => cb(d)) },
}
// Quitar ANSI codes del output del terminal para parsear texto limpio
const stripAnsi = s => s.replace(/\x1B\[[0-9;?]*[a-zA-Z]/g, '').replace(/\r/g, '')


const C = { terminal: '#10b981', image: '#60a5fa', video: '#a78bfa', result: '#e879f9' }

// ── Handle badges — icon-in-a-badge style (Freepik) ───────────────────────────
const enc = s => encodeURIComponent(s)
const svgBg = (pathD, color) =>
  `url("data:image/svg+xml,${enc(`<svg xmlns='http://www.w3.org/2000/svg' width='11' height='11' viewBox='0 0 24 24' fill='none' stroke='${color}' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'>${pathD}</svg>`)}")`

const IP = {
  terminal: "<polyline points='4 17 10 11 4 5'/><line x1='12' y1='19' x2='20' y2='19'/>",
  image:    "<rect x='3' y='3' width='18' height='18' rx='2'/><circle cx='8.5' cy='8.5' r='1.5'/><polyline points='21 15 16 10 5 21'/>",
  video:    "<polygon points='23 7 16 12 23 17 23 7'/><rect x='1' y='5' width='15' height='14' rx='2'/>",
  result:   "<circle cx='12' cy='12' r='9'/><polyline points='9 12 11 14 15 10'/>",
}

const mkHandle = (side, color, iconKey) => ({
  width: 26, height: 26, borderRadius: 8,
  background: `rgba(6,6,12,0.94) ${svgBg(IP[iconKey]||IP.image, color)} center/11px no-repeat`,
  border: `1px solid ${color}45`,
  boxShadow: `0 0 10px ${color}25, inset 0 1px 0 rgba(255,255,255,0.08)`,
  cursor: 'crosshair',
  ...(side==='left' ? {left:-13} : {right:-13}),
})

// ── Gradient Edge — Freepik style ─────────────────────────────────────────────
const GradientEdge = ({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, source, target }) => {
  const nodes = useNodes()
  const srcType = nodes.find(n=>n.id===source)?.type || 'image'
  const tgtType = nodes.find(n=>n.id===target)?.type || 'video'
  const sc = C[srcType] || '#6b7280'
  const tc = C[tgtType] || '#6b7280'
  const [path] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition })
  const gid = `grad-${id}`

  return (
    <g>
      <defs>
        <linearGradient id={gid} gradientUnits="userSpaceOnUse"
          x1={sourceX} y1={sourceY} x2={targetX} y2={targetY}>
          <stop offset="0%"   stopColor={sc} stopOpacity="0.85"/>
          <stop offset="100%" stopColor={tc} stopOpacity="0.85"/>
        </linearGradient>
        <filter id={`glow-${id}`} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="2.5" result="blur"/>
          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      {/* Glow halo */}
      <path d={path} fill="none" stroke={tc} strokeWidth={5} opacity={0.06} strokeLinecap="round"/>
      {/* Animated dashed gradient line */}
      <path d={path} fill="none"
        stroke={`url(#${gid})`}
        strokeWidth={1.4}
        strokeDasharray="7 5"
        strokeLinecap="round"
        filter={`url(#glow-${id})`}
        style={{ animation:'flow-dash 1.8s linear infinite' }}
      />
    </g>
  )
}
const edgeTypes = { gradient: GradientEdge }

const QTY = [1,2,4,6,8,10,12,14,16,18,20]

const IMAGE_MODELS = [
  { id:'nano-banana-2',            label:'Nano Banana 2',   ar:['1:1','4:5','16:9','9:16','4:3','3:2'],        res:['1K','2K','4K'] },
  { id:'nano-banana-pro',          label:'Nano Banana Pro', ar:['1:1','4:5','2:3','3:2','3:4','4:3','16:9','9:16'], res:['1K','2K','4K'], imgInput:true, maxImg:10 },
  { id:'flux-2/pro-text-to-image', label:'Flux-2 Pro',      ar:['1:1','4:5','4:3','3:4','16:9','9:16','3:2'],  res:['1K','2K'] },
  { id:'flux-2/flex-text-to-image',label:'Flux-2 Flex',     ar:['1:1','4:5','4:3','3:4','16:9','9:16','3:2'],  res:['1K','2K'] },
  { id:'ideogram/v3-text-to-image',label:'Ideogram v3',     ar:['1:1','4:5','4:3','3:4','16:9','9:16'],        res:[] },
  { id:'qwen/text-to-image',       label:'Qwen',             ar:['1:1','4:5','4:3','16:9','9:16'],             res:[] },
  { id:'grok-imagine/text-to-image',label:'Grok Imagine',   ar:['1:1','4:5','16:9','9:16'],                   res:[] },
]

const VIDEO_MODELS = [
  { id:'veo3_fast',              label:'Veo3 Fast',   ar:['16:9','9:16','4:5'],                    dur:['5','10','15','20'], sImg:true,  maxImg:3 },
  { id:'veo3',                   label:'Veo3 Quality',ar:['16:9','9:16','4:5'],                    dur:['5','10','15','20'], sImg:true,  maxImg:3 },
  { id:'bytedance/seedance-2',   label:'Seedance 2',  ar:['16:9','9:16','1:1','4:3','4:5'],        dur:['5','8','10','15'],  sImg:true,  maxImg:10, sAud:true, maxAud:10 },
  { id:'seedance-2-krea',        label:'Seedance 2 - KREA', ar:['16:9','9:16','1:1','4:3','4:5'],  dur:['5','8','10','15'],  sImg:true,  maxImg:10, sAud:true, maxAud:10 },
  { id:'kling-2.6/text-to-video',label:'Kling 2.6',  ar:['1:1','16:9','9:16','4:5'],              dur:['5','10'],           sImg:true,  maxImg:1 },
  { id:'wan/2-7-text-to-video',  label:'WAN 2.7',     ar:['16:9','9:16','1:1','4:3','3:4','4:5'], dur:['5','10','15'] },
  { id:'sora-2-text-to-video',   label:'Sora-2',      ar:['16:9','9:16','4:5'],                    dur:['10'] },
]

// ══════════════════════════════════════════════════════════════════════════════
// ── Lightbox — previsualización fullscreen ────────────────────────────────────
const Lightbox = ({ item, onClose }) => {
  useEffect(() => {
    const fn = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [onClose])

  return (
    <div style={{
      position:'fixed',inset:0,zIndex:2000,
      background:'rgba(0,0,0,0.92)',backdropFilter:'blur(28px) saturate(1.2)',
      display:'flex',alignItems:'center',justifyContent:'center',
      animation:'fadeIn 180ms ease',
    }} onClick={onClose}>
      <style>{`@keyframes fadeIn{from{opacity:0}to{opacity:1}}`}</style>

      <div onClick={e => e.stopPropagation()} style={{position:'relative',maxWidth:'92vw',maxHeight:'92vh',display:'flex',alignItems:'center',justifyContent:'center'}}>
        {item.type === 'video' ? (
          <video src={item.url} controls autoPlay
            style={{maxWidth:'92vw',maxHeight:'88vh',borderRadius:16,outline:'none',
              boxShadow:'0 32px 80px rgba(0,0,0,0.8)'}}/>
        ) : (
          <img src={item.url} alt="preview"
            style={{maxWidth:'92vw',maxHeight:'88vh',borderRadius:16,objectFit:'contain',
              boxShadow:'0 32px 80px rgba(0,0,0,0.8)'}}/>
        )}

        {/* Barra de acciones */}
        <div style={{
          position:'absolute',bottom:16,left:'50%',transform:'translateX(-50%)',
          display:'flex',gap:8,
          background:'rgba(5,5,12,0.8)',backdropFilter:'blur(24px)',
          border:'1px solid rgba(255,255,255,0.1)',borderRadius:999,
          padding:'6px 12px',
        }}>
          <button onClick={() => downloadFile(item.url, item.type==='video'?'mp4':'jpg')}
            style={{display:'flex',alignItems:'center',gap:5,
              background:'transparent',border:'none',cursor:'pointer',
              color:'rgba(255,255,255,0.7)',fontSize:12,fontWeight:500,
              padding:'4px 10px',borderRadius:999,
              transition:`all 200ms ${SPRING}`}}
            onMouseEnter={e=>{e.currentTarget.style.background='rgba(255,255,255,0.08)';e.currentTarget.style.color='white'}}
            onMouseLeave={e=>{e.currentTarget.style.background='transparent';e.currentTarget.style.color='rgba(255,255,255,0.7)'}}>
            <Download style={{width:14,height:14}}/> Descargar
          </button>
        </div>

        {/* Cerrar */}
        <button onClick={onClose}
          style={{
            position:'absolute',top:12,right:12,
            width:32,height:32,borderRadius:'50%',cursor:'pointer',
            background:'rgba(5,5,12,0.75)',backdropFilter:'blur(16px)',
            border:'1px solid rgba(255,255,255,0.12)',
            display:'flex',alignItems:'center',justifyContent:'center',
            color:'rgba(255,255,255,0.6)',
          }}
          onMouseEnter={e=>e.currentTarget.style.color='white'}
          onMouseLeave={e=>e.currentTarget.style.color='rgba(255,255,255,0.6)'}>
          <X style={{width:14,height:14}}/>
        </button>
      </div>
    </div>
  )
}

// ── API helper — añade token automáticamente ──────────────────────────────────
const apiFetch = (path, opts = {}) => {
  const token = localStorage.getItem('fai_token')
  return fetch(path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...opts.headers },
  })
}

// ── Template System — API persistence ────────────────────────────────────────
const tmplLoad = (tpl, setNodes, setEdges, deleteNodeFn, replace = true) => {
  const map = {}
  const newNodes = (tpl.nodes || []).map(n => {
    const nid = `${n.type}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    map[n.id] = nid
    return { ...n, id: nid, data: { ...n.data, onDelete: () => deleteNodeFn(nid) } }
  })
  const newEdges = (tpl.edges || []).map(e => ({
    id: `e-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    source: map[e.source] || e.source,
    target: map[e.target] || e.target,
    type: 'gradient',
  }))
  if (replace) { setNodes(newNodes); setEdges(newEdges) }
  else { setNodes(n => [...n, ...newNodes]); setEdges(e => [...e, ...newEdges]) }
}


// ── Upload hook ────────────────────────────────────────────────────────────────
const useUpload = () => {
  const [busy, setBusy] = useState(false)
  const [uploadErr, setUploadErr] = useState(null)

  const upload = async (file) => {
    setBusy(true); setUploadErr(null)
    try {
      const fd = new FormData(); fd.append('file', file)
      const r = await fetch(`${SERVER}/api/upload`, { method:'POST', body:fd })
      const j = await r.json()
      // Soportar varios formatos de respuesta KIE AI
      const url = j.data?.fileUrl || j.data?.downloadUrl || j.data?.url || j.fileUrl || j.url
      if (url) return { url, name:file.name, type:file.type }
      setUploadErr(j.error || j.msg || 'Upload fallido')
      return null
    } catch(e) {
      setUploadErr(e.message || 'Error de conexión')
      return null
    } finally { setBusy(false) }
  }
  return { upload, busy, uploadErr }
}

const downloadFile = (url, ext) => {
  const a = document.createElement('a')
  a.href = `${SERVER}/api/download?url=${encodeURIComponent(url)}&filename=cliender-${Date.now()}.${ext}`
  a.click()
}

// ── Design primitives ──────────────────────────────────────────────────────────
const Seg = ({ opts, val, set, c='violet' }) => {
  const selBg = { violet:'rgba(139,92,246,0.38)', blue:'rgba(59,130,246,0.36)', emerald:'rgba(16,185,129,0.32)' }
  const selBorder = { violet:'rgba(167,139,250,0.4)', blue:'rgba(96,165,250,0.38)', emerald:'rgba(52,211,153,0.35)' }
  const selColor = 'rgba(255,255,255,0.95)'
  return (
    <div className="flex flex-wrap gap-1">
      {opts.map(o => (
        <button key={o} onClick={() => set(o)}
          style={{
            transition:`all 220ms ${SPRING}`,
            borderRadius: 999,
            ...(val===o ? {
              background: selBg[c]||selBg.violet,
              border:`1px solid ${selBorder[c]||selBorder.violet}`,
              color: selColor,
              backdropFilter:'blur(16px) saturate(1.6)',
              boxShadow:`inset 0 1px 0 rgba(255,255,255,0.2), 0 2px 8px rgba(0,0,0,0.25)`,
            } : {
              background:'rgba(255,255,255,0.04)',
              border:'1px solid rgba(255,255,255,0.07)',
              color:'rgba(255,255,255,0.38)',
            })
          }}
          className="flex-1 min-w-fit text-xs py-1.5 px-2 font-medium hover:!text-white/70 hover:!bg-white/8">
          {o}
        </button>
      ))}
    </div>
  )
}

const DropZone = ({ files, onAdd, onRemove, accept, hint, max=10 }) => {
  const ref = useRef()
  const { upload, busy, uploadErr } = useUpload()

  const onChange = async e => {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    e.target.value = ''
    for (const f of files) {
      const r = await upload(f)
      if (r) onAdd(r)
    }
  }

  return (
    <div style={{borderRadius:14,border:'1px solid rgba(255,255,255,0.07)',background:'rgba(255,255,255,0.02)',padding:'10px'}}>
      <div className="flex flex-wrap gap-2">
        {files.map((f,i) => (
          <div key={i} className="relative group w-14 h-14 flex-shrink-0">
            {f.type?.startsWith('image')
              ? <img src={f.url} style={{width:'100%',height:'100%',borderRadius:10,objectFit:'cover',border:'1px solid rgba(255,255,255,0.1)'}}/>
              : <div style={{width:'100%',height:'100%',borderRadius:10,background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.1)',display:'flex',alignItems:'center',justifyContent:'center'}}>
                  <span style={{color:'rgba(255,255,255,0.5)',fontSize:10,fontWeight:700,textTransform:'uppercase'}}>
                    {f.name.split('.').pop()}
                  </span>
                </div>}
            <button onClick={()=>onRemove(i)}
              style={{position:'absolute',top:-4,right:-4,width:16,height:16,borderRadius:'50%',
                background:'#ef4444',border:'none',cursor:'pointer',display:'none',
                alignItems:'center',justifyContent:'center'}}
              className="group-hover:!flex">
              <X style={{width:9,height:9,color:'white'}}/>
            </button>
          </div>
        ))}
        {files.length < max && (
          <button onClick={()=>ref.current?.click()}
            className="glass-btn glass-btn-neutral"
            style={{width:56,height:56,borderRadius:12,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
            {busy
              ? <Loader2 style={{width:16,height:16,color:'rgba(255,255,255,0.4)'}} className="animate-spin"/>
              : <Plus style={{width:18,height:18,color:'rgba(255,255,255,0.35)'}}/>
            }
          </button>
        )}
      </div>

      {/* Error visible */}
      {uploadErr && (
        <div style={{display:'flex',alignItems:'center',gap:5,marginTop:8,
          color:'rgba(248,113,113,0.9)',fontSize:10,
          background:'rgba(239,68,68,0.08)',border:'1px solid rgba(239,68,68,0.2)',
          borderRadius:8,padding:'4px 8px'}}>
          <AlertCircle style={{width:10,height:10,flexShrink:0}}/>
          {uploadErr}
        </div>
      )}

      {hint && !uploadErr && (
        <p style={{fontSize:10,color:'rgba(255,255,255,0.2)',marginTop:7,lineHeight:1.5}}>{hint}</p>
      )}
      <input ref={ref} type="file" accept={accept} multiple className="hidden" onChange={onChange}/>
    </div>
  )
}

const Tog = ({ val, set }) => (
  <button onClick={()=>set(!val)}
    style={{
      position:'relative', width:30, height:17, borderRadius:999, flexShrink:0,
      background: val ? 'rgba(167,139,250,0.7)' : 'rgba(255,255,255,0.08)',
      border: val ? '1px solid rgba(167,139,250,0.5)' : '1px solid rgba(255,255,255,0.1)',
      cursor:'pointer',
      transition:`background 220ms ${SPRING}, border-color 220ms ${SPRING}`,
      boxShadow: val ? '0 0 8px rgba(167,139,250,0.3)' : 'none',
    }}>
    <span style={{
      position:'absolute', top:2,
      left: val ? 13 : 2,
      width:13, height:13, borderRadius:'50%',
      background: val ? 'white' : 'rgba(255,255,255,0.5)',
      boxShadow:'0 1px 3px rgba(0,0,0,0.35)',
      transition:`left 220ms ${SPRING}, background 220ms ${SPRING}`,
    }}/>
  </button>
)

// Fila del reference: dot + label izq | control der
const NRow = ({ dot='rgba(255,255,255,0.25)', label, children, last, onClick }) => (
  <div onClick={onClick}
    style={{
      display:'flex',alignItems:'center',justifyContent:'space-between',
      padding:'8px 14px',minHeight:37,
      borderBottom: last?'none':'1px solid rgba(255,255,255,0.04)',
      cursor:onClick?'pointer':undefined,
      transition:onClick?`background 150ms ${SPRING}`:undefined,
    }}
    onMouseEnter={onClick?e=>{e.currentTarget.style.background='rgba(255,255,255,0.02)'}:undefined}
    onMouseLeave={onClick?e=>{e.currentTarget.style.background='transparent'}:undefined}>
    <span style={{display:'flex',alignItems:'center',gap:7}}>
      <span style={{width:5,height:5,borderRadius:'50%',background:dot,flexShrink:0}}/>
      <span style={{fontSize:11.5,color:'rgba(255,255,255,0.42)',fontWeight:450,letterSpacing:'0.005em'}}>{label}</span>
    </span>
    <span style={{display:'flex',alignItems:'center',gap:5}}>{children}</span>
  </div>
)

// Select inline compacto
const ISel = ({ val, set, opts }) => (
  <div style={{position:'relative',display:'inline-flex',alignItems:'center'}}>
    <select value={val} onChange={e=>set(e.target.value)}
      style={{appearance:'none',background:'rgba(255,255,255,0.06)',color:'rgba(255,255,255,0.78)',
        fontSize:11,fontWeight:500,borderRadius:7,padding:'3px 22px 3px 8px',
        border:'1px solid rgba(255,255,255,0.08)',outline:'none',cursor:'pointer',
        fontFamily:'Plus Jakarta Sans,sans-serif',transition:`all 150ms ${SPRING}`}}>
      {opts.map(o=><option key={o} value={o}>{o}</option>)}
    </select>
    <ChevronDown style={{position:'absolute',right:6,top:'50%',transform:'translateY(-50%)',
      width:9,height:9,color:'rgba(255,255,255,0.35)',pointerEvents:'none'}}/>
  </div>
)

const Rule = ({ label }) => (
  <div className="flex items-center gap-2">
    <div className="flex-1 h-px bg-white/[0.05]"/>
    <span className="text-[10px] font-semibold text-white/20 uppercase tracking-widest">{label}</span>
    <div className="flex-1 h-px bg-white/[0.05]"/>
  </div>
)

// ── Node shell — borderless flat card ─────────────────────────────────────────
const R = '1.1rem'
const Shell = ({ children, hex, minW=300, minH=280, handles }) => (
  <div style={{position:'relative',width:'100%',height:'100%'}}>
    <NodeResizer minWidth={minW} minHeight={minH}/>
    {handles}
    <div style={{
      position:'absolute',inset:0,borderRadius:R,
      background:'rgba(9,9,14,0.98)',
      overflow:'hidden',display:'flex',flexDirection:'column',
      // Sombra sutil en lugar de borde visible
      boxShadow:`0 0 0 1px rgba(255,255,255,0.04), 0 12px 40px rgba(0,0,0,0.55), 0 0 16px ${hex}08`,
    }}>
      {children}
    </div>
  </div>
)

const Head = ({ icon, title, hex, onClose, right }) => (
  <div style={{
    display:'flex',alignItems:'center',justifyContent:'space-between',
    padding:'8px 11px',borderBottom:'1px solid rgba(255,255,255,0.05)',flexShrink:0,
  }}>
    <div style={{display:'flex',alignItems:'center',gap:6}}>
      <span style={{width:5,height:5,borderRadius:'50%',background:hex,flexShrink:0,boxShadow:`0 0 5px ${hex}90`}}/>
      <span style={{fontSize:10,fontWeight:700,color:'rgba(255,255,255,0.55)',letterSpacing:'0.08em',textTransform:'uppercase'}}>{title}</span>
    </div>
    <div style={{display:'flex',alignItems:'center',gap:5}}>
      {right}
      <button onClick={onClose}
        style={{width:20,height:20,borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',
          cursor:'pointer',background:'transparent',border:'none',color:'rgba(255,255,255,0.18)',
          transition:`all 180ms ${SPRING}`}}
        onMouseEnter={e=>{e.currentTarget.style.background='rgba(255,255,255,0.07)';e.currentTarget.style.color='rgba(255,255,255,0.8)'}}
        onMouseLeave={e=>{e.currentTarget.style.background='transparent';e.currentTarget.style.color='rgba(255,255,255,0.18)'}}>
        <X style={{width:10,height:10}}/>
      </button>
    </div>
  </div>
)

const Lbl = ({ children }) => (
  <span style={{display:'block',fontSize:11,fontWeight:500,color:'rgba(255,255,255,0.35)',marginBottom:6,letterSpacing:'0.03em'}}>
    {children}
  </span>
)

const ErrBox = ({ msg }) => (
  <div className="flex items-center gap-1.5 text-red-300 text-xs bg-red-500/10 border border-red-500/20 rounded-lg px-2.5 py-2">
    <AlertCircle className="w-3 h-3 flex-shrink-0"/>{msg}
  </div>
)

const GenBtn = ({ onClick, disabled, busy, label, color='violet' }) => (
  <button
    onClick={onClick} disabled={disabled}
    className={`glass-btn ${color==='blue'?'glass-btn-blue':'glass-btn-violet'} w-full text-xs font-semibold py-2.5 px-4 flex items-center justify-center gap-2`}>
    {busy && <Loader2 className="w-3.5 h-3.5 animate-spin"/>}{label}
  </button>
)

// ── Polling helper ─────────────────────────────────────────────────────────────
const usePoll = (delay=3500) => {
  const refs = useRef([])
  useEffect(() => () => refs.current.forEach(clearTimeout), [])

  const poll = useCallback((taskId, onSuccess, onFail, onProgress) => {
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`${SERVER}/api/task/${taskId}`)
        const json = await r.json()
        const d = json.data
        if (!d) { onFail('Respuesta inválida'); return }
        onProgress?.(d.progress||0)
        if (d.state==='success') {
          const res = JSON.parse(d.resultJson||'{}')
          onSuccess(res.resultUrls?.[0]||res.resultObject)
        } else if (d.state==='fail') {
          onFail(d.failMsg||'Generación fallida')
        } else { poll(taskId, onSuccess, onFail, onProgress) }
      } catch { onFail('Error consultando tarea') }
    }, delay)
    refs.current.push(t)
  }, [delay])

  return poll
}

// ══════════════════════════════════════════════════════════════════════════════
// ── TerminalNode
// ══════════════════════════════════════════════════════════════════════════════
// Extrae el primer objeto JSON de un string (ignora texto alrededor)
const extractJsonObj = (str) => {
  const s = str.indexOf('{')
  if (s === -1) return null
  let depth = 0, i = s
  for (; i < str.length; i++) {
    if (str[i] === '{') depth++
    else if (str[i] === '}') { depth--; if (depth === 0) break }
  }
  if (depth !== 0) return null // JSON incompleto
  try { return JSON.parse(str.slice(s, i + 1)) } catch { return null }
}

const TerminalNode = ({ id, data }) => {
  const termRef  = useRef(null)
  const termInst = useRef(null)
  const fitRef   = useRef(null)
  const sockRef  = useRef(null)
  const bufRef   = useRef('')
  const [status, setStatus] = useState('idle') // idle | trying | connected
  const [copied, setCopied] = useState(false)

  const termHandles = <>
    <Handle type="target" position={Position.Left}  style={mkHandle('left',  C.terminal,'terminal')}/>
    <Handle type="source" position={Position.Right} style={mkHandle('right', C.terminal,'terminal')}/>
  </>

  // Crear socket UNA sola vez al montar
  useEffect(() => {
    const sock = io(SERVER || window.location.origin, { autoConnect: false, timeout: 4000 })
    sockRef.current = sock

    sock.on('connect', () => setStatus('connected'))
    sock.on('connect_error', () => setStatus('idle'))
    sock.on('disconnect', () => setStatus('idle'))

    sock.on('terminal:data', d => {
      termInst.current?.write(d)
      bufRef.current = (bufRef.current + stripAnsi(d)).slice(-12000)
      const buf = bufRef.current
      const gm = buf.match(/GENERATE:\s*([^\r\n]+)[\r\n]/)
      if (gm) { bufRef.current = buf.slice(buf.indexOf(gm[0]) + gm[0].length); Bus.emit('workflow:prompt', { sourceId: id, prompt: gm[1].trim(), auto: true }); return }
      const mIdx = buf.lastIndexOf('CLIENDER_BATCH:')
      if (mIdx !== -1) { const p = extractJsonObj(buf.slice(mIdx + 15)); if (p?.prompts?.length) { bufRef.current = ''; Bus.emit('workflow:batch', { sourceId: id, ...p, auto: true }) } }
    })
    sock.on('workflow:fromFile', p => { if (p?.prompts?.length) Bus.emit('workflow:batch', { sourceId: id, ...p, auto: true }) })

    // Intentar conectar automáticamente al montar
    sock.connect()
    setStatus('trying')

    return () => { sock.disconnect(); sockRef.current = null; termInst.current?.dispose(); termInst.current = null }
  }, [id])

  // Inicializar xterm CUANDO el div esté en el DOM Y estado sea connected
  useEffect(() => {
    if (status !== 'connected' || !termRef.current || termInst.current) return
    const sock = sockRef.current
    const t = new Terminal({
      cursorBlink: true, scrollback: 5000,
      theme: { background: 'transparent', foreground: '#86efac', cursor: '#10b981', cursorAccent: '#050508' },
      fontSize: 13, fontFamily: 'JetBrains Mono,Menlo,monospace',
    })
    const fit = new FitAddon()
    t.loadAddon(fit)
    t.open(termRef.current)
    try { fit.fit() } catch (e) { console.warn('FitAddon fit error:', e.message) }
    termInst.current = t; fitRef.current = fit
    t.onData(inp => sock?.emit('terminal:input', inp))
    t.attachCustomKeyEventHandler(e => {
      if (e.type !== 'keydown') return true
      if (e.ctrlKey && e.shiftKey && e.code === 'KeyC') { const s = t.getSelection(); if(s) navigator.clipboard.writeText(s).then(()=>{setCopied(true);setTimeout(()=>setCopied(false),1400)}).catch(()=>{}); return false }
      if (e.ctrlKey && e.shiftKey && e.code === 'KeyV') { navigator.clipboard.readText().then(tx=>{if(tx)sock?.emit('terminal:input',tx)}).catch(()=>{}); return false }
      return true
    })
    t.onSelectionChange(() => { const s = t.getSelection(); if(s) navigator.clipboard.writeText(s).catch(()=>{}) })
  }, [status])

  // ResizeObserver para ajustar tamaño
  useEffect(() => {
    const el = termRef.current; if (!el) return
    const obs = new ResizeObserver(() => {
      try { fitRef.current?.fit(); const t = termInst.current, s = sockRef.current; if(t&&s) s.emit('terminal:resize', {cols:t.cols, rows:t.rows}) } catch(_) {}
    })
    obs.observe(el); return () => obs.disconnect()
  }, [status])

  const handleActivar = () => {
    setStatus('trying')
    sockRef.current?.connect()
  }

  return (
    <Shell hex={C.terminal} minW={320} minH={260} handles={termHandles}>
      {/* Top bar */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',
        padding:'8px 10px',borderBottom:'1px solid rgba(255,255,255,0.05)',flexShrink:0}}>
        <div style={{display:'flex',alignItems:'center',gap:6}}>
          <span style={{
            width:7,height:7,borderRadius:'50%',flexShrink:0,
            background: status==='connected' ? C.terminal : 'rgba(255,255,255,0.15)',
            boxShadow: status==='connected' ? `0 0 7px ${C.terminal}` : 'none',
            transition:`all 400ms ${SPRING}`,
          }}/>
          <span style={{fontSize:11,fontWeight:600,color: status==='connected' ? `${C.terminal}CC` : 'rgba(255,255,255,0.3)'}}>
            {status==='connected' ? 'Terminal activa' : status==='trying' ? 'Conectando…' : 'Terminal'}
          </span>
        </div>
        <button onClick={()=>data?.onDelete?.()}
          style={{width:20,height:20,borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',
            cursor:'pointer',background:'transparent',border:'none',color:'rgba(255,255,255,0.2)',transition:`all 180ms ${SPRING}`}}
          onMouseEnter={e=>{e.currentTarget.style.background='rgba(255,255,255,0.07)';e.currentTarget.style.color='rgba(255,255,255,0.8)'}}
          onMouseLeave={e=>{e.currentTarget.style.background='transparent';e.currentTarget.style.color='rgba(255,255,255,0.2)'}}>
          <X style={{width:10,height:10}}/>
        </button>
      </div>

      {/* Pantalla activar — solo cuando no conectado */}
      {status !== 'connected' && (
        <div style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:14,padding:'20px'}}>
          <div style={{width:46,height:46,borderRadius:14,display:'flex',alignItems:'center',justifyContent:'center',
            background:`${C.terminal}10`,border:`1px solid ${C.terminal}25`}}>
            <TerminalIcon style={{width:20,height:20,color:`${C.terminal}99`}}/>
          </div>
          <div style={{textAlign:'center',fontSize:12,color:'rgba(255,255,255,0.35)',lineHeight:1.6}}>
            {status==='trying' ? 'Conectando con tu ordenador…' : 'Terminal local de tu ordenador'}
          </div>
          <button onClick={handleActivar} disabled={status==='trying'}
            style={{display:'flex',alignItems:'center',gap:7,cursor:status==='trying'?'wait':'pointer',
              background:`${C.terminal}18`,border:`1px solid ${C.terminal}40`,
              borderRadius:999,padding:'10px 22px',
              fontSize:12,fontWeight:600,color:C.terminal,
              transition:`all 200ms ${SPRING}`,
              opacity: status==='trying' ? 0.6 : 1,
              boxShadow:`0 0 20px ${C.terminal}15`,
            }}>
            {status==='trying'
              ? <><Loader2 style={{width:12,height:12}} className="animate-spin"/> Conectando…</>
              : <><Play style={{width:11,height:11,fill:'currentColor'}}/> Activar terminal</>
            }
          </button>
        </div>
      )}

      {/* Terminal xterm — siempre en DOM cuando conectado para que ref funcione */}
      <div ref={termRef}
        className="nowheel nopan nodrag"
        style={{
          flex: status==='connected' ? 1 : 0,
          display: status==='connected' ? 'block' : 'none',
          background:'rgba(0,0,0,0.35)',overflow:'hidden',
          contain:'layout paint',willChange:'transform',
        }}
      />

      {/* Footer */}
      {status==='connected' && (
        <div style={{padding:'4px 14px',borderTop:'1px solid rgba(255,255,255,0.04)',display:'flex',justifyContent:'space-between',flexShrink:0}}>
          {copied && <span style={{fontSize:9,color:C.terminal,fontFamily:'monospace'}}>copiado</span>}
          <span style={{fontSize:9,color:'rgba(255,255,255,0.15)',fontFamily:'monospace',marginLeft:'auto'}}>⌃⇧C copiar · ⌃⇧V pegar</span>
        </div>
      )}
    </Shell>
  )
}


// ══════════════════════════════════════════════════════════════════════════════
// ── ResultImageNode  (nodo de resultado individual)
// ══════════════════════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════════════════════
// ── GalleryNode — nodo galería para múltiples imágenes generadas
// ══════════════════════════════════════════════════════════════════════════════
// ── GalleryCell — celda individual con hover state propio ────────────────────
const GalleryCell = ({ url, index, onDownload, onPreview }) => {
  const [hov, setHov] = useState(false)
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        aspectRatio:'1', borderRadius:9, overflow:'hidden', position:'relative',
        background: url ? '#0a0a12' : 'rgba(255,255,255,0.025)',
        transition:`box-shadow 250ms ${SPRING}`,
        boxShadow: hov && url ? '0 0 0 1.5px rgba(96,165,250,0.4)' : 'none',
      }}>
      {url ? (
        <>
          <img src={url}
            onClick={() => onPreview?.(url)}
            style={{width:'100%',height:'100%',objectFit:'cover',display:'block',cursor:'zoom-in',
              transition:`transform 400ms ${SPRING}`,
              transform: hov ? 'scale(1.04)' : 'scale(1)'}}/>
          {/* Overlay */}
          <div style={{
            position:'absolute',inset:0,
            background: hov ? 'rgba(0,0,0,0.48)' : 'rgba(0,0,0,0)',
            transition:`background 280ms ${SPRING}`,
            display:'flex',alignItems:'center',justifyContent:'center',
            pointerEvents:'none',
          }}>
            <button onClick={()=>onDownload(url)}
              style={{
                pointerEvents:'auto',
                width:34,height:34,borderRadius:'50%',cursor:'pointer',
                background:'rgba(255,255,255,0.14)',backdropFilter:'blur(16px)',
                border:'1px solid rgba(255,255,255,0.22)',
                display:'flex',alignItems:'center',justifyContent:'center',color:'white',
                opacity: hov ? 1 : 0,
                transform: hov ? 'scale(1)' : 'scale(0.75)',
                transition:`opacity 250ms ${SPRING}, transform 250ms ${SPRING}`,
              }}>
              <Download style={{width:13,height:13}}/>
            </button>
          </div>
          {/* Index pill */}
          <span style={{
            position:'absolute',bottom:5,left:5,
            fontSize:8,fontWeight:700,color:'rgba(255,255,255,0.5)',
            background:'rgba(0,0,0,0.6)',backdropFilter:'blur(8px)',
            padding:'1px 5px',borderRadius:4,letterSpacing:'0.05em',
            opacity: hov ? 1 : 0,
            transition:`opacity 200ms ${SPRING}`,
          }}>#{index+1}</span>
        </>
      ) : (
        <div className="cell-loading" style={{
          width:'100%',height:'100%',
          background:`linear-gradient(135deg,rgba(255,255,255,0.02) 0%,rgba(96,165,250,0.04) 100%)`,
          display:'flex',alignItems:'center',justifyContent:'center',
        }}>
          <Loader2 style={{width:14,height:14,color:C.image,opacity:0.35}} className="animate-spin"/>
        </div>
      )}
    </div>
  )
}

// ── GalleryNode — nodo galería foto-first ─────────────────────────────────────
const GalleryNode = ({ id, data }) => {
  const { deleteElements } = useReactFlow()
  const { images = [], total = 1, modelLabel = '' } = data
  const loaded  = images.length
  const allDone = loaded >= total
  const [hov, setHov] = useState(false)

  const cols = total <= 4 ? 2 : total <= 9 ? 3 : 4

  const handles = <>
    <Handle type="target" position={Position.Left}  style={mkHandle('left',  C.image,'image')}/>
    <Handle type="source" position={Position.Right} style={mkHandle('right', C.image,'image')}/>
  </>

  const downloadAll = () =>
    images.forEach((url, i) => setTimeout(() => downloadFile(url, 'jpg'), i*80))

  return (
    <Shell hex={C.image} minW={200} minH={160} handles={handles}>
      {/* Grid foto-first — sin header, las fotos son todo */}
      <div
        className="nowheel nopan"
        onMouseEnter={()=>setHov(true)}
        onMouseLeave={()=>setHov(false)}
        style={{
          flex:1, position:'relative', padding:4, overflow:'hidden',
          display:'grid',
          gridTemplateColumns:`repeat(${cols}, 1fr)`,
          gap:3, alignContent:'start',
        }}>

        {Array.from({length:total},(_,i) => (
          <GalleryCell
            key={i}
            url={images[i]}
            index={i}
            onDownload={url=>downloadFile(url,'jpg')}
            onPreview={url=>Bus.emit('openLightbox',{url,type:'image'})}
          />
        ))}

        {/* Badge flotante bottom-left */}
        <div style={{
          position:'absolute', bottom:9, left:9,
          display:'flex', alignItems:'center', gap:5,
          background:'rgba(5,5,12,0.82)',
          backdropFilter:'blur(20px) saturate(1.5)',
          borderRadius:999, padding:'4px 10px',
          border:'1px solid rgba(255,255,255,0.09)',
          boxShadow:'0 2px 12px rgba(0,0,0,0.5)',
          pointerEvents: allDone ? 'auto' : 'none',
          transition:`opacity 200ms ${SPRING}`,
        }}>
          <span style={{width:5,height:5,borderRadius:'50%',background:C.image,
            boxShadow:`0 0 6px ${C.image}`,flexShrink:0}}/>
          {modelLabel && (
            <span style={{fontSize:9,fontWeight:700,color:'rgba(255,255,255,0.55)',
              letterSpacing:'0.06em',textTransform:'uppercase'}}>
              {modelLabel}
            </span>
          )}
          <span style={{fontSize:9,color:`${C.image}AA`,fontWeight:600}}>
            {loaded}/{total}
          </span>
          {allDone && loaded > 0 && (
            <button onClick={downloadAll}
              style={{display:'flex',alignItems:'center',justifyContent:'center',
                width:16,height:16,borderRadius:'50%',cursor:'pointer',
                background:'transparent',border:'none',
                color:'rgba(96,165,250,0.6)',
                transition:`color 180ms ${SPRING}`}}
              onMouseEnter={e=>e.currentTarget.style.color='rgba(96,165,250,1)'}
              onMouseLeave={e=>e.currentTarget.style.color='rgba(96,165,250,0.6)'}
              title="Descargar todas">
              <Download style={{width:9,height:9}}/>
            </button>
          )}
        </div>

        {/* Botón cerrar top-right flotante */}
        <button
          onClick={() => deleteElements({ nodes:[{id}] })}
          style={{
            position:'absolute', top:9, right:9,
            width:22, height:22, borderRadius:'50%',
            background:'rgba(5,5,12,0.75)',backdropFilter:'blur(16px)',
            border:'1px solid rgba(255,255,255,0.09)',
            display:'flex',alignItems:'center',justifyContent:'center',
            cursor:'pointer', color:'rgba(255,255,255,0.45)',
            opacity: hov ? 1 : 0,
            transition:`opacity 200ms ${SPRING}, color 150ms ease`,
          }}
          onMouseEnter={e=>e.currentTarget.style.color='rgba(255,255,255,0.9)'}
          onMouseLeave={e=>e.currentTarget.style.color='rgba(255,255,255,0.45)'}>
          <X style={{width:10,height:10}}/>
        </button>
      </div>

      {/* Barra de progreso — solo visible mientras carga */}
      <div style={{
        height:2,background:'rgba(255,255,255,0.03)',flexShrink:0,
        borderRadius:'0 0 calc(1.25rem - 1px) calc(1.25rem - 1px)',
        overflow:'hidden',
      }}>
        <div style={{
          height:'100%',
          width:`${(loaded/total)*100}%`,
          background:`linear-gradient(90deg,${C.image}60,${C.image}CC)`,
          transition:`width 500ms ${SPRING}`,
          borderRadius:1,
        }}/>
      </div>
    </Shell>
  )
}

const ResultImageNode = ({ id, data }) => {
  const { deleteElements } = useReactFlow()
  const [hov, setHov] = useState(false)

  const handles = <>
    <Handle type="target" position={Position.Left}  style={mkHandle('left',  C.image,'image')}/>
    <Handle type="source" position={Position.Right} style={mkHandle('right', C.image,'image')}/>
  </>

  return (
    <Shell hex={C.image} minW={160} minH={160} handles={handles}>
      <div
        onMouseEnter={()=>setHov(true)}
        onMouseLeave={()=>setHov(false)}
        style={{flex:1, position:'relative', overflow:'hidden'}}>

        {data.url ? (
          <>
            <img src={data.url}
              style={{
                width:'100%',height:'100%',objectFit:'cover',display:'block',
                transform: hov ? 'scale(1.04)' : 'scale(1)',
                transition:`transform 450ms ${SPRING}`,
              }}/>
            {/* Hover overlay */}
            <div style={{
              position:'absolute',inset:0,
              background: hov ? 'rgba(0,0,0,0.46)' : 'rgba(0,0,0,0)',
              transition:`background 280ms ${SPRING}`,
              display:'flex',alignItems:'center',justifyContent:'center',
            }}>
              <button onClick={()=>downloadFile(data.url,'jpg')}
                style={{
                  width:38,height:38,borderRadius:'50%',cursor:'pointer',
                  background:'rgba(255,255,255,0.13)',backdropFilter:'blur(20px)',
                  border:'1px solid rgba(255,255,255,0.2)',
                  display:'flex',alignItems:'center',justifyContent:'center',color:'white',
                  opacity: hov ? 1 : 0,
                  transform: hov ? 'scale(1)' : 'scale(0.7)',
                  transition:`opacity 260ms ${SPRING}, transform 260ms ${SPRING}`,
                  active:'scale(0.95)',
                }}>
                <Download style={{width:15,height:15}}/>
              </button>
            </div>
            {/* Close — top right */}
            <button onClick={()=>deleteElements({nodes:[{id}]})}
              style={{
                position:'absolute',top:8,right:8,
                width:22,height:22,borderRadius:'50%',cursor:'pointer',
                background:'rgba(5,5,12,0.72)',backdropFilter:'blur(16px)',
                border:'1px solid rgba(255,255,255,0.1)',
                display:'flex',alignItems:'center',justifyContent:'center',
                color:'rgba(255,255,255,0.5)',
                opacity: hov ? 1 : 0,
                transition:`opacity 200ms ${SPRING}`,
              }}
              onMouseEnter={e=>e.currentTarget.style.color='white'}
              onMouseLeave={e=>e.currentTarget.style.color='rgba(255,255,255,0.5)'}>
              <X style={{width:10,height:10}}/>
            </button>
          </>
        ) : (
          <div className="cell-loading" style={{
            width:'100%',height:'100%',
            display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:8,
            background:`linear-gradient(135deg,rgba(255,255,255,0.02),rgba(96,165,250,0.04))`,
          }}>
            <Loader2 style={{width:18,height:18,color:C.image,opacity:0.4}} className="animate-spin"/>
            <span style={{fontSize:10,color:'rgba(255,255,255,0.2)'}}>generando…</span>
          </div>
        )}
      </div>
    </Shell>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// ── ImageNode
// ══════════════════════════════════════════════════════════════════════════════
const ImageNode = ({ id, data }) => {
  const { getNode, addNodes, setNodes } = useReactFlow()
  const [mIdx, setMIdx]   = useState(0)
  const [prompt, setPrompt] = useState('')
  const [ar, setAr]       = useState('1:1')
  const [res, setRes]     = useState('1K')
  const [qty, setQty]     = useState(1)
  const [imgIn, setImgIn]           = useState([])
  const [busy, setBusy]             = useState(false)
  const [done, setDone]             = useState(0)
  const [singleUrl, setSingleUrl]   = useState(null)
  const [err, setErr]               = useState(null)
  // Estado del panel Krea-style
  const [openSettings, setOpenSettings]   = useState(false)
  const [selectedStyleId, setSelStyle]    = useState(null)
  const [nodeStyles, setNodeStyles]       = useState([])
  const [seed, setSeed]                   = useState('aleatorio')
  const [rawMode, setRawMode]             = useState(false)
  const poll  = usePoll(3000)
  const model = IMAGE_MODELS[mIdx]

  // Cargar estilos desde DB al montar
  useEffect(()=>{
    apiFetch('/api/styles').then(r=>r.ok?r.json():[]).then(d=>setNodeStyles(d)).catch(()=>{})
  },[])

  // Re-sincronizar cuando StylesPanel emite actualización
  useEffect(()=>{ const u=Bus.on('styles:updated', d=>{ if(Array.isArray(d)) setNodeStyles(d) }); return u },[])

  // Cuando se selecciona un estilo, sus imágenes se usan como imgIn
  useEffect(()=>{
    if (!selectedStyleId) { if(model.imgInput) return; setImgIn([]); return }
    const style = nodeStyles.find(s=>s.id===selectedStyleId)
    setImgIn(style?.images||[])
  },[selectedStyleId, nodeStyles])

  useEffect(()=>{ setAr(model.ar[0]); setRes(model.res[0]||'1K'); setImgIn([]); setSingleUrl(null); setErr(null) },[mIdx])

  // Reaccionar a prompt / autoTrigger entrante desde terminal
  useEffect(()=>{
    if (!data.incomingPrompt && !data.autoTrigger) return
    const p     = data.incomingPrompt || prompt
    const batch = data.batchPrompts   || null
    const auto  = data.autoTrigger    || false
    // Limpiar flags inmediatamente
    setNodes(nds=>nds.map(n=>n.id===id?{...n,data:{...n.data,
      incomingPrompt:null, autoTrigger:false, batchPrompts:null
    }}:n))
    if (p) setPrompt(p)
    if (auto && p) {
      // Pasar el prompt directamente — no depender del state async
      setTimeout(()=>handleGenerateWithBatch(batch, p), 300)
    }
  },[data.incomingPrompt, data.autoTrigger])

  const handleGenerateWithBatch = async (batchPrompts, overridePrompt) => {
    const basePrompt = overridePrompt || prompt
    const prompts = batchPrompts?.length ? batchPrompts : (basePrompt ? [basePrompt] : [])
    if (!prompts[0]?.trim()||busy) return
    setBusy(true); setErr(null); setDone(0); setSingleUrl(null)

    const thisNode = getNode(id)
    const pos = thisNode?.position || { x:0, y:0 }
    const ph  = thisNode?.measured?.height || 400
    const pw  = thisNode?.measured?.width  || 320
    const effectiveQty = prompts.length

    let galleryId = null
    if (effectiveQty > 1) {
      const cols = effectiveQty <= 4 ? 2 : effectiveQty <= 9 ? 3 : 4
      const rows = Math.ceil(effectiveQty / cols)
      const cell = 130, gap = 6, pad = 20, hdr = 38, pb = 6
      const gW   = cols * cell + (cols - 1) * gap + pad
      const gH   = hdr + rows * cell + (rows - 1) * gap + pad + pb
      galleryId  = `gallery-${Date.now()}`
      addNodes({ id: galleryId, type: 'galleryNode',
        position: { x: pos.x + pw + 60, y: pos.y + ph/2 - gH/2 },
        style: { width: gW, height: gH },
        data: { images: [], total: effectiveQty, modelLabel: model.label },
      })
    }

    let completed = 0
    try {
      await Promise.all(prompts.map((p, i) => (async()=>{
        const r = await fetch(`${SERVER}/api/generate`,{
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ model:model.id, prompt:p, aspectRatio:ar, resolution:res,
            refImages: imgIn.map(f=>f.url) }),
        })
        const json = await r.json()
        if (json.code!==200) { completed++; setDone(completed); if(completed>=effectiveQty) setBusy(false); return }
        poll(json.data.taskId,
          url => {
            completed++; setDone(completed)
            if (effectiveQty===1) { setSingleUrl(url); setBusy(false) }
            else {
              setNodes(nds=>nds.map(n=>n.id===galleryId?{...n,data:{...n.data,images:[...(n.data.images||[]),url]}}:n))
              if (completed>=effectiveQty) setBusy(false)
            }
          },
          msg=>{setErr(msg);setBusy(false)}
        )
      })()))
    } catch(e){ setErr(e.message); setBusy(false) }
  }

  const handleGenerate = () => handleGenerateWithBatch(null)

  const _handleGenerateOLD = async () => {
    if (!prompt.trim()||busy) return
    setBusy(true); setErr(null); setDone(0); setSingleUrl(null)

    const thisNode = getNode(id)
    const pos = thisNode?.position || { x:0, y:0 }
    const ph  = thisNode?.measured?.height || 400
    const pw  = thisNode?.measured?.width  || 320

    // ── Para qty > 1: crear UNA galería y rellenarla progresivamente ──────────
    let galleryId = null
    if (qty > 1) {
      const cols = qty <= 4 ? 2 : qty <= 9 ? 3 : 4
      const rows = Math.ceil(qty / cols)
      const cell = 130, gap = 6, pad = 20, hdr = 38, pb = 6
      const gW   = cols * cell + (cols - 1) * gap + pad
      const gH   = hdr + rows * cell + (rows - 1) * gap + pad + pb
      galleryId  = `gallery-${Date.now()}`

      addNodes({
        id: galleryId, type: 'galleryNode',
        position: { x: pos.x + pw + 60, y: pos.y + ph/2 - gH/2 },
        style: { width: gW, height: gH },
        data: { images: [], total: qty, modelLabel: model.label },
      })
    }

    let completed = 0
    try {
      await Promise.all(Array.from({length:qty},(_,i) => (async()=>{
        const r = await fetch(`${SERVER}/api/generate`,{
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ model:model.id, prompt, aspectRatio:ar, resolution:res,
            refImages: imgIn.map(f=>f.url) }),
        })
        const json = await r.json()
        if (json.code!==200) {
          completed++; setDone(completed)
          if (completed >= qty) setBusy(false)
          return
        }
        poll(json.data.taskId,
          url => {
            completed++; setDone(completed)
            if (qty === 1) {
              setSingleUrl(url); setBusy(false)
            } else {
              // Inyectar imagen en la galería
              setNodes(nds => nds.map(n =>
                n.id === galleryId
                  ? { ...n, data: { ...n.data, images: [...(n.data.images||[]), url] } }
                  : n
              ))
              if (completed >= qty) setBusy(false)
            }
          },
          msg => { setErr(msg); setBusy(false) }
        )
      })()))
    } catch(e){ setErr(e.message); setBusy(false) }
  }

  const handles = <>
    <Handle type="target" position={Position.Left}  style={mkHandle('left',  C.image,'image')}/>
    <Handle type="source" position={Position.Right} style={mkHandle('right', C.image,'image')}/>
  </>

  const selStyle = nodeStyles.find(s=>s.id===selectedStyleId)

  // Botón estilo compacto
  const SmBtn = ({ onClick, children, style:sx }) => (
    <button onClick={onClick}
      style={{display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',
        background:'rgba(255,255,255,0.06)',border:'1px solid rgba(255,255,255,0.08)',
        borderRadius:6,padding:'3px 7px',fontSize:10,fontWeight:500,
        color:'rgba(255,255,255,0.55)',transition:`all 150ms ${SPRING}`, ...sx}}>
      {children}
    </button>
  )

  return (
    <Shell hex={C.image} minW={280} minH={380} handles={handles}>
      {/* ── Top bar: Run + model + close */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',
        padding:'8px 10px 8px 10px',borderBottom:'1px solid rgba(255,255,255,0.05)',flexShrink:0}}>
        <button onClick={handleGenerate} disabled={busy||!prompt.trim()}
          style={{display:'flex',alignItems:'center',gap:5,cursor:'pointer',
            background: busy?'rgba(59,130,246,0.15)':'rgba(59,130,246,0.12)',
            border:`1px solid rgba(59,130,246,${busy?'0.35':'0.22'})`,
            borderRadius:999,padding:'4px 9px',
            color:'rgba(255,255,255,0.8)',fontSize:11,fontWeight:600,
            transition:`all 200ms ${SPRING}`}}>
          {busy
            ? <><Loader2 style={{width:9,height:9}} className="animate-spin"/> {done}/{qty}</>
            : <><Play style={{width:9,height:9,fill:'currentColor'}}/> Ejecutar nodo</>
          }
        </button>
        <span style={{fontSize:11,color:'rgba(255,255,255,0.35)',fontWeight:500}}>{model.label}</span>
        <button onClick={()=>data?.onDelete?.()}
          style={{width:20,height:20,borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',
            cursor:'pointer',background:'transparent',border:'none',color:'rgba(255,255,255,0.2)',
            transition:`all 180ms ${SPRING}`}}
          onMouseEnter={e=>{e.currentTarget.style.background='rgba(255,255,255,0.07)';e.currentTarget.style.color='rgba(255,255,255,0.8)'}}
          onMouseLeave={e=>{e.currentTarget.style.background='transparent';e.currentTarget.style.color='rgba(255,255,255,0.2)'}}>
          <X style={{width:10,height:10}}/>
        </button>
      </div>

      {/* ── Preview area */}
      <div style={{flexShrink:0,background:'rgba(0,0,0,0.25)',position:'relative',
        borderBottom:'1px solid rgba(255,255,255,0.04)',minHeight:160,overflow:'hidden'}}>
        {singleUrl ? (
          <div className="group" style={{position:'relative',cursor:'zoom-in'}}
            onClick={()=>Bus.emit('openLightbox',{url:singleUrl,type:'image'})}>
            <img src={singleUrl} style={{width:'100%',display:'block',objectFit:'cover'}}/>
            <div style={{position:'absolute',inset:0,background:'rgba(0,0,0,0)',transition:`background 250ms ${SPRING}`}}
              onMouseEnter={e=>e.currentTarget.style.background='rgba(0,0,0,0.4)'}
              onMouseLeave={e=>e.currentTarget.style.background='rgba(0,0,0,0)'}>
              <button onClick={e=>{e.stopPropagation();downloadFile(singleUrl,'jpg')}}
                style={{position:'absolute',bottom:8,right:8,width:28,height:28,borderRadius:'50%',
                  cursor:'pointer',background:'rgba(0,0,0,0.6)',backdropFilter:'blur(12px)',
                  border:'1px solid rgba(255,255,255,0.12)',display:'flex',alignItems:'center',
                  justifyContent:'center',color:'white',opacity:0,transition:`opacity 200ms ${SPRING}`}}
                onMouseEnter={e=>e.currentTarget.style.opacity='1'}
                onMouseLeave={e=>e.currentTarget.style.opacity='0'}>
                <Download style={{width:11,height:11}}/>
              </button>
            </div>
          </div>
        ) : (
          <div style={{height:160,display:'flex',flexDirection:'column',alignItems:'center',
            justifyContent:'center',gap:7,color:'rgba(255,255,255,0.12)'}}>
            {busy
              ? <><Loader2 style={{width:18,height:18,color:`${C.image}80`}} className="animate-spin"/>
                  <span style={{fontSize:10.5,color:`${C.image}80`}}>Generando en KIE AI…</span></>
              : <><ImageIcon style={{width:20,height:20,opacity:0.18}}/>
                  <span style={{fontSize:10.5}}>Tu imagen aparecerá aquí</span></>
            }
          </div>
        )}
      </div>

      {/* Scrollable content */}
      <div style={{flex:1,overflow:'auto',display:'flex',flexDirection:'column'}} className="nowheel nopan">

        {/* Tipo indicator */}
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',
          padding:'7px 14px',borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
          <div style={{position:'relative',display:'inline-flex',alignItems:'center'}}>
            <select value={mIdx} onChange={e=>setMIdx(Number(e.target.value))}
              style={{appearance:'none',background:'transparent',color:'rgba(255,255,255,0.55)',
                fontSize:11,fontWeight:500,borderRadius:7,padding:'2px 18px 2px 0px',
                border:'none',outline:'none',cursor:'pointer',
                fontFamily:'Plus Jakarta Sans,sans-serif',maxWidth:130}}>
              {IMAGE_MODELS.map((m,i)=><option key={m.id} value={i}>{m.label}</option>)}
            </select>
            <ChevronDown style={{position:'absolute',right:0,top:'50%',transform:'translateY(-50%)',
              width:9,height:9,color:'rgba(255,255,255,0.25)',pointerEvents:'none'}}/>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:6}}>
            <span style={{fontSize:11,color:'rgba(255,255,255,0.32)',fontWeight:450}}>Imagen</span>
            <span style={{width:7,height:7,borderRadius:'50%',background:C.image,
              boxShadow:`0 0 7px ${C.image}`}}/>
          </div>
        </div>

        {/* Prompt */}
        <div style={{borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'8px 14px 5px'}}>
            <span style={{display:'flex',alignItems:'center',gap:7}}>
              <span style={{width:5,height:5,borderRadius:'50%',background:'#eab308'}}/>
              <span style={{fontSize:11.5,color:'rgba(255,255,255,0.42)',fontWeight:450}}>Prompt</span>
            </span>
            <Pencil style={{width:10,height:10,color:'rgba(255,255,255,0.18)'}}/>
          </div>
          <textarea value={prompt} onChange={e=>setPrompt(e.target.value)}
            placeholder="Describe la imagen con detalle…"
            rows={3}
            style={{width:'100%',background:'transparent',color:'rgba(255,255,255,0.8)',
              fontSize:12,lineHeight:1.7,resize:'none',border:'none',outline:'none',
              padding:'4px 14px 10px',fontFamily:'Plus Jakarta Sans,sans-serif'}}
            className="placeholder-white/20 nowheel nopan nodrag"/>
        </div>

        {err && <div style={{padding:'0 10px 8px'}}><ErrBox msg={err}/></div>}

        {/* Escenarios collapsible */}
        <NRow dot="rgba(255,255,255,0.2)" label="Escenarios" last={!openSettings}
          onClick={()=>setOpenSettings(v=>!v)}>
          <ChevronRight style={{width:12,height:12,color:'rgba(255,255,255,0.3)',
            transform:openSettings?'rotate(90deg)':'rotate(0deg)',transition:`transform 200ms ${SPRING}`}}/>
        </NRow>

        {openSettings && (
          <div style={{borderTop:'1px solid rgba(255,255,255,0.04)'}}>
            {/* qty>1 progress */}
            {qty>1 && busy && (
              <div style={{padding:'8px 14px',display:'flex',alignItems:'center',gap:7,
                borderBottom:'1px solid rgba(255,255,255,0.04)',
                color:`${C.image}99`,fontSize:11}}>
                <Loader2 style={{width:12,height:12}} className="animate-spin"/>
                {done}/{qty} imágenes procesando…
              </div>
            )}

            {/* Estilo */}
            <NRow dot={C.image} label="Estilo">
              {selStyle ? (
                <div style={{display:'flex',alignItems:'center',gap:5}}>
                  <span style={{fontSize:11,color:'rgba(255,255,255,0.7)',maxWidth:90,
                    overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{selStyle.name}</span>
                  <button onClick={()=>setSelStyle(null)}
                    style={{width:14,height:14,borderRadius:'50%',background:'rgba(255,255,255,0.08)',
                      border:'none',cursor:'pointer',color:'rgba(255,255,255,0.4)',
                      display:'flex',alignItems:'center',justifyContent:'center'}}>
                    <X style={{width:8,height:8}}/>
                  </button>
                </div>
              ) : (
                <button onClick={()=>Bus.emit('openStylesPanel',true)}
                  style={{fontSize:10,color:`${C.image}CC`,background:`${C.image}12`,
                    border:`1px solid ${C.image}20`,borderRadius:6,padding:'3px 8px',cursor:'pointer',
                    fontFamily:'Plus Jakarta Sans,sans-serif'}}>
                  Seleccionar →
                </button>
              )}
            </NRow>

            {/* Thumbnails del estilo */}
            {selStyle?.images?.length>0 && (
              <div style={{padding:'4px 14px 8px',display:'flex',gap:4,flexWrap:'wrap',
                borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
                {selStyle.images.slice(0,6).map((img,i)=>(
                  <img key={i} src={img.url} style={{width:24,height:24,borderRadius:4,objectFit:'cover',
                    border:'1px solid rgba(255,255,255,0.08)'}}/>
                ))}
                {selStyle.images.length>6&&<span style={{fontSize:10,color:'rgba(255,255,255,0.3)',alignSelf:'center'}}>+{selStyle.images.length-6}</span>}
              </div>
            )}

            {/* Imágenes de referencia — siempre disponible */}
            <div style={{padding:'8px 14px',borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:6}}>
                <span style={{fontSize:10,fontWeight:600,color:'rgba(255,255,255,0.45)',letterSpacing:'0.04em'}}>
                  IMAGEN DE REFERENCIA {imgIn.length>0 && <span style={{color:C.image,marginLeft:4}}>{imgIn.length}</span>}
                </span>
                {imgIn.length>0 && (
                  <button onClick={()=>setImgIn([])}
                    style={{fontSize:9,color:'rgba(255,255,255,0.3)',background:'none',border:'none',cursor:'pointer',padding:'2px 4px'}}>
                    limpiar
                  </button>
                )}
              </div>

              {/* Previews de imgs ya subidas */}
              {imgIn.length>0 && (
                <div style={{display:'flex',gap:5,flexWrap:'wrap',marginBottom:6}}>
                  {imgIn.map((f,i)=>(
                    <div key={i} style={{position:'relative',width:44,height:44,borderRadius:7,overflow:'hidden',
                      border:`1px solid ${C.image}40`,flexShrink:0}}>
                      <img src={f.url} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}}/>
                      <button onClick={()=>setImgIn(v=>v.filter((_,j)=>j!==i))}
                        style={{position:'absolute',top:2,right:2,width:14,height:14,borderRadius:'50%',
                          background:'rgba(0,0,0,0.75)',border:'none',cursor:'pointer',
                          display:'flex',alignItems:'center',justifyContent:'center',padding:0}}>
                        <X style={{width:8,height:8,color:'#fff'}}/>
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <DropZone files={[]} onAdd={f=>setImgIn(v=>[...v,f])} onRemove={()=>{}}
                accept="image/jpeg,image/png,image/webp" hint="JPEG · PNG · WebP · máx 30MB" max={model.maxImg||10}/>
            </div>

            {/* Crudo */}
            <NRow dot="rgba(255,255,255,0.25)" label="Crudo">
              <Tog val={rawMode} set={setRawMode}/>
            </NRow>

            {/* Semilla */}
            <NRow dot="rgba(255,255,255,0.25)" label="Semilla">
              <div style={{display:'flex',alignItems:'center',gap:5}}>
                <input value={seed} onChange={e=>setSeed(e.target.value)}
                  style={{width:68,background:'rgba(255,255,255,0.05)',color:'rgba(255,255,255,0.7)',
                    fontSize:10.5,borderRadius:6,padding:'3px 8px',
                    border:'1px solid rgba(255,255,255,0.07)',outline:'none',
                    fontFamily:'Plus Jakarta Sans,sans-serif'}}/>
                <button onClick={()=>setSeed('aleatorio')}
                  title="Semilla aleatoria"
                  style={{width:20,height:20,borderRadius:5,cursor:'pointer',display:'flex',
                    alignItems:'center',justifyContent:'center',
                    background:'rgba(255,255,255,0.06)',border:'1px solid rgba(255,255,255,0.08)',color:'rgba(255,255,255,0.45)'}}>
                  <Shuffle style={{width:9,height:9}}/>
                </button>
              </div>
            </NRow>

            {/* Relación de aspecto */}
            <NRow dot="rgba(255,255,255,0.25)" label="Relación de aspecto">
              <ISel val={ar} set={setAr} opts={model.ar}/>
            </NRow>

            {/* Resolución */}
            {model.res.length>0 && (
              <NRow dot="rgba(255,255,255,0.25)" label="Resolución">
                <ISel val={res} set={setRes} opts={model.res}/>
              </NRow>
            )}

            {/* Cantidad */}
            <NRow dot="rgba(255,255,255,0.25)" label="Cantidad" last>
              <div style={{display:'flex',alignItems:'center',gap:5}}>
                <button onClick={()=>setQty(q=>Math.max(1,q%2===0?q-2:q-1))} disabled={qty<=1}
                  style={{width:20,height:20,borderRadius:5,cursor:'pointer',
                    background:'rgba(255,255,255,0.06)',border:'1px solid rgba(255,255,255,0.08)',
                    color:'rgba(255,255,255,0.6)',fontSize:14,display:'flex',alignItems:'center',justifyContent:'center',
                    fontFamily:'monospace',lineHeight:1}}>−</button>
                <span style={{fontSize:12,color:'rgba(255,255,255,0.8)',minWidth:20,textAlign:'center',fontWeight:600}}>{qty}</span>
                <button onClick={()=>setQty(q=>Math.min(20,q===1?2:q+2))} disabled={qty>=20}
                  style={{width:20,height:20,borderRadius:5,cursor:'pointer',
                    background:'rgba(255,255,255,0.06)',border:'1px solid rgba(255,255,255,0.08)',
                    color:'rgba(255,255,255,0.6)',fontSize:14,display:'flex',alignItems:'center',justifyContent:'center',
                    fontFamily:'monospace',lineHeight:1}}>+</button>
              </div>
            </NRow>
          </div>
        )}
      </div>
    </Shell>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// ── VideoNode
// ══════════════════════════════════════════════════════════════════════════════
const VideoNode = ({ id, data }) => {
  const { setNodes } = useReactFlow()
  const [mIdx,  setMIdx]  = useState(0)
  const [prompt,setPrompt]= useState('')
  const [ar,    setAr]    = useState('16:9')
  const [res,   setRes]   = useState('720p')
  const [dur,   setDur]   = useState('5')
  const [kf,    setKf]    = useState([])
  const [rv,    setRv]    = useState([])
  const [ra,    setRa]    = useState([])
  const [genAudio, setGenAudio]   = useState(true)
  const [retLast,  setRetLast]    = useState(false)
  const [webSearch,setWebSearch]  = useState(false)
  const [nsfw,     setNsfw]       = useState(true)
  const [busy,  setBusy]  = useState(false)
  const [prog,  setProg]  = useState(0)
  const [videoUrl,setVideoUrl]= useState(null)
  const [err,   setErr]   = useState(null)
  const [openScenarios, setOpenScenarios] = useState(false)
  const poll = usePoll(5000)
  const m = VIDEO_MODELS[mIdx]

  useEffect(()=>{ setAr(m.ar[0]); setDur(m.dur[0]||'5'); setKf([]); setRv([]); setRa([]); setVideoUrl(null); setErr(null) },[mIdx])

  // Reaccionar a prompt desde terminal conectada
  useEffect(()=>{
    if (data.incomingPrompt) {
      setPrompt(data.incomingPrompt)
      setNodes(nds=>nds.map(n=>n.id===id?{...n,data:{...n.data,incomingPrompt:null}}:n))
    }
  },[data.incomingPrompt])

  const handleGenerate = async () => {
    if (!prompt.trim()||busy) return
    setBusy(true); setErr(null); setVideoUrl(null); setProg(0)
    try {
      const r = await fetch(`${SERVER}/api/generate`,{
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ model:m.id, prompt, aspectRatio:ar, resolution:res, duration:dur,
          refImages:kf.map(f=>f.url),
          refVideos:rv.map(f=>f.url),
          refAudios:ra.map(f=>f.url),
          extra:{ generateAudio:genAudio, returnLastFrame:retLast, webSearch, nsfwCheck:nsfw } }),
      })
      const json = await r.json()
      if (json.code!==200) throw new Error(json.msg||'Error al crear tarea')
      poll(json.data.taskId,
        url=>{ setVideoUrl(url); setBusy(false); setProg(100) },
        msg=>{ setErr(msg); setBusy(false) },
        p=>setProg(p)
      )
    } catch(e){ setErr(e.message); setBusy(false) }
  }

  const vidHandles = <>
    <Handle type="target" position={Position.Left}  style={mkHandle('left',  C.video,'video')}/>
    <Handle type="source" position={Position.Right} style={mkHandle('right', C.video,'video')}/>
  </>

  return (
    <Shell hex={C.video} minW={300} minH={380} handles={vidHandles}>
      {/* ── Top bar */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',
        padding:'8px 10px',borderBottom:'1px solid rgba(255,255,255,0.05)',flexShrink:0}}>
        <button onClick={handleGenerate} disabled={busy||!prompt.trim()}
          style={{display:'flex',alignItems:'center',gap:5,cursor:'pointer',
            background:busy?'rgba(167,139,250,0.15)':'rgba(167,139,250,0.12)',
            border:`1px solid rgba(167,139,250,${busy?'0.35':'0.22'})`,
            borderRadius:999,padding:'4px 9px',color:'rgba(255,255,255,0.8)',fontSize:11,fontWeight:600,
            transition:`all 200ms ${SPRING}`}}>
          {busy
            ? <><Loader2 style={{width:9,height:9}} className="animate-spin"/> {prog>0?`${prog}%`:'…'}</>
            : <><Play style={{width:9,height:9,fill:'currentColor',color:C.video}}/> Ejecutar nodo</>}
        </button>
        <span style={{fontSize:11,color:'rgba(255,255,255,0.35)',fontWeight:500}}>{m.label}</span>
        <button onClick={()=>data?.onDelete?.()}
          style={{width:20,height:20,borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',
            cursor:'pointer',background:'transparent',border:'none',color:'rgba(255,255,255,0.2)',transition:`all 180ms ${SPRING}`}}
          onMouseEnter={e=>{e.currentTarget.style.background='rgba(255,255,255,0.07)';e.currentTarget.style.color='rgba(255,255,255,0.8)'}}
          onMouseLeave={e=>{e.currentTarget.style.background='transparent';e.currentTarget.style.color='rgba(255,255,255,0.2)'}}>
          <X style={{width:10,height:10}}/>
        </button>
      </div>

      {/* ── Preview area */}
      <div style={{flexShrink:0,background:'rgba(0,0,0,0.25)',position:'relative',
        borderBottom:'1px solid rgba(255,255,255,0.04)',minHeight:140,overflow:'hidden'}}>
        {videoUrl ? (
          <div style={{position:'relative',cursor:'zoom-in'}} onClick={()=>Bus.emit('openLightbox',{url:videoUrl,type:'video'})}>
            <video src={videoUrl} controls style={{width:'100%',display:'block'}} onClick={e=>e.stopPropagation()}/>
            <div style={{position:'absolute',top:8,right:8,background:'rgba(5,5,12,0.7)',
              backdropFilter:'blur(12px)',border:'1px solid rgba(255,255,255,0.1)',
              borderRadius:7,padding:'3px 8px',fontSize:9,fontWeight:600,
              color:'rgba(255,255,255,0.5)',pointerEvents:'none',letterSpacing:'0.06em'}}>EXPANDIR</div>
            <button onClick={e=>{e.stopPropagation();downloadFile(videoUrl,'mp4')}}
              style={{position:'absolute',bottom:8,right:8,width:28,height:28,borderRadius:'50%',cursor:'pointer',
                background:'rgba(0,0,0,0.6)',backdropFilter:'blur(12px)',border:'1px solid rgba(255,255,255,0.12)',
                display:'flex',alignItems:'center',justifyContent:'center',color:'white'}}>
              <Download style={{width:11,height:11}}/>
            </button>
          </div>
        ) : (
          <div style={{height:140,display:'flex',flexDirection:'column',alignItems:'center',
            justifyContent:'center',gap:7,color:'rgba(255,255,255,0.12)'}}>
            {busy
              ? <><Loader2 style={{width:18,height:18,color:`${C.video}80`}} className="animate-spin"/>
                  <span style={{fontSize:10.5,color:`${C.video}80`}}>Generando en KIE AI…</span></>
              : <><Video style={{width:20,height:20,opacity:0.18}}/>
                  <span style={{fontSize:10.5}}>Tu video aparecerá aquí</span></>}
          </div>
        )}
      </div>

      {/* Scrollable */}
      <div style={{flex:1,overflow:'auto',display:'flex',flexDirection:'column'}} className="nowheel nopan">
        {/* Tipo + Modelo */}
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',
          padding:'7px 14px',borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
          <div style={{position:'relative',display:'inline-flex',alignItems:'center'}}>
            <select value={mIdx} onChange={e=>setMIdx(Number(e.target.value))}
              style={{appearance:'none',background:'transparent',color:'rgba(255,255,255,0.55)',
                fontSize:11,fontWeight:500,borderRadius:7,padding:'2px 18px 2px 0px',
                border:'none',outline:'none',cursor:'pointer',
                fontFamily:'Plus Jakarta Sans,sans-serif',maxWidth:130}}>
              {VIDEO_MODELS.map((v,i)=><option key={v.id} value={i}>{v.label}</option>)}
            </select>
            <ChevronDown style={{position:'absolute',right:0,top:'50%',transform:'translateY(-50%)',
              width:9,height:9,color:'rgba(255,255,255,0.25)',pointerEvents:'none'}}/>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:6}}>
            <span style={{fontSize:11,color:'rgba(255,255,255,0.32)',fontWeight:450}}>Video</span>
            <span style={{width:7,height:7,borderRadius:'50%',background:C.video,boxShadow:`0 0 7px ${C.video}`}}/>
          </div>
        </div>

        {/* Prompt */}
        <div style={{borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'8px 14px 5px'}}>
            <span style={{display:'flex',alignItems:'center',gap:7}}>
              <span style={{width:5,height:5,borderRadius:'50%',background:'#eab308'}}/>
              <span style={{fontSize:11.5,color:'rgba(255,255,255,0.42)',fontWeight:450}}>Prompt</span>
            </span>
            <Pencil style={{width:10,height:10,color:'rgba(255,255,255,0.18)'}}/>
          </div>
          <textarea value={prompt} onChange={e=>setPrompt(e.target.value)}
            placeholder="Describe el video, movimientos y estilo…" rows={4}
            style={{width:'100%',background:'transparent',color:'rgba(255,255,255,0.8)',
              fontSize:12,lineHeight:1.7,resize:'none',border:'none',outline:'none',
              padding:'4px 14px 10px',fontFamily:'Plus Jakarta Sans,sans-serif'}}
            className="placeholder-white/20 nowheel nopan nodrag"/>
        </div>

        {err && <div style={{padding:'0 10px 8px'}}><ErrBox msg={err}/></div>}

        {/* ── Escenarios collapsible */}
        <NRow dot="rgba(255,255,255,0.2)" label="Escenarios" last={!openScenarios}
          onClick={()=>setOpenScenarios(v=>!v)}>
          <ChevronRight style={{width:12,height:12,color:'rgba(255,255,255,0.3)',
            transform:openScenarios?'rotate(90deg)':'rotate(0deg)',transition:`transform 200ms ${SPRING}`}}/>
        </NRow>

        {openScenarios && (
          <div style={{borderTop:'1px solid rgba(255,255,255,0.04)'}}>
            {/* Relación */}
            <NRow dot="rgba(255,255,255,0.25)" label="Relación de aspecto">
              <ISel val={ar} set={setAr} opts={m.ar}/>
            </NRow>
            {/* Duración */}
            {m.dur.length>0 && (
              <NRow dot="rgba(255,255,255,0.25)" label="Duración">
                <ISel val={dur+'s'} set={v=>setDur(v.replace('s',''))} opts={m.dur.map(d=>d+'s')}/>
              </NRow>
            )}
            {/* Resolución */}
            <NRow dot="rgba(255,255,255,0.25)" label="Resolución">
              <ISel val={res} set={setRes} opts={['480p','720p','1080p']}/>
            </NRow>
            {/* Fotogramas */}
            <div style={{padding:'8px 14px',borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
              <span style={{fontSize:10,color:'rgba(255,255,255,0.35)',display:'block',marginBottom:6}}>Fotogramas clave</span>
              <DropZone files={kf} onAdd={f=>setKf(k=>[...k,f])} onRemove={i=>setKf(k=>k.filter((_,j)=>j!==i))}
                accept="image/jpeg,image/png,image/webp,image/bmp" hint="JPG, PNG, WEBP · Máx 20MB" max={6}/>
            </div>
            {/* Videos ref */}
            <div style={{padding:'8px 14px',borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
              <span style={{fontSize:10,color:'rgba(255,255,255,0.35)',display:'block',marginBottom:6}}>Vídeos de referencia</span>
              <DropZone files={rv} onAdd={f=>setRv(v=>[...v,f])} onRemove={i=>setRv(v=>v.filter((_,j)=>j!==i))}
                accept="video/mp4,video/webm,video/quicktime" hint="MP4, WebM, MOV · Máx 50MB" max={6}/>
            </div>
            {/* Audio ref */}
            <div style={{padding:'8px 14px',borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
              <span style={{fontSize:10,color:'rgba(255,255,255,0.35)',display:'block',marginBottom:6}}>Audio de referencia</span>
              <DropZone files={ra} onAdd={f=>setRa(a=>[...a,f])} onRemove={i=>setRa(a=>a.filter((_,j)=>j!==i))}
                accept="audio/wav,audio/flac,audio/ogg,audio/mpeg,audio/mp4" hint="WAV, MP3, M4A · Máx 10MB" max={6}/>
            </div>
            {/* Opciones */}
            <NRow dot="rgba(255,255,255,0.25)" label="Audio sincronizado"><Tog val={genAudio} set={setGenAudio}/></NRow>
            <NRow dot="rgba(255,255,255,0.25)" label="Retornar último fotograma"><Tog val={retLast} set={setRetLast}/></NRow>
            <NRow dot="rgba(255,255,255,0.25)" label="Búsqueda en línea"><Tog val={webSearch} set={setWebSearch}/></NRow>
            <NRow dot="rgba(255,255,255,0.25)" label="Verificar contenido" last><Tog val={nsfw} set={setNsfw}/></NRow>
          </div>
        )}
      </div>
    </Shell>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// ── TemplateCard
// ══════════════════════════════════════════════════════════════════════════════
const TemplateCard = ({ tpl, onLoad, onDelete, canDelete }) => {
  const [confirm, setConfirm] = useState(false)
  const date = new Date(tpl.created_at || tpl.createdAt).toLocaleDateString('es-ES',{day:'numeric',month:'short'})
  const nodes = Array.isArray(tpl.nodes) ? tpl.nodes : []
  const counts = nodes.reduce((a,n)=>{ a[n.type]=(a[n.type]||0)+1; return a },{})
  const dot = (color, label, count) => count ? (
    <span key={label} style={{
      display:'inline-flex',alignItems:'center',gap:3,
      fontSize:10,fontWeight:600,color:'rgba(255,255,255,0.7)',
      background:`${color}18`,border:`1px solid ${color}30`,
      padding:'2px 7px',borderRadius:999,
    }}>{label} {count}</span>
  ) : null

  const handleDelete = () => {
    if (confirm) onDelete(tpl.id)
    else { setConfirm(true); setTimeout(()=>setConfirm(false),3000) }
  }

  const isGlobal = tpl.is_global

  return (
    <div className="tpl-card" style={{
      background: isGlobal ? 'rgba(167,139,250,0.06)' : 'rgba(255,255,255,0.025)',
      border: `1px solid ${isGlobal ? 'rgba(167,139,250,0.2)' : 'rgba(255,255,255,0.07)'}`,
      borderRadius:16, padding:'12px 14px',
      position:'relative', overflow:'hidden',
      transition:`all 200ms ${SPRING}`,
    }}>
      {/* Pin glow top-right para globales */}
      {isGlobal && (
        <div style={{
          position:'absolute',top:-18,right:-18,width:60,height:60,borderRadius:'50%',
          background:'radial-gradient(circle,rgba(167,139,250,0.18) 0%,transparent 70%)',
          pointerEvents:'none',
        }}/>
      )}

      {/* Name + fecha + pin */}
      <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:7,gap:8}}>
        <div style={{display:'flex',alignItems:'center',gap:6,flex:1,minWidth:0}}>
          {isGlobal && (
            <span style={{
              fontSize:9,fontWeight:700,letterSpacing:'0.06em',textTransform:'uppercase',
              color:'#a78bfa',background:'rgba(167,139,250,0.15)',border:'1px solid rgba(167,139,250,0.25)',
              padding:'2px 6px',borderRadius:6,flexShrink:0,
            }}>📌 Fija</span>
          )}
          <span style={{fontSize:13,fontWeight:600,color:'rgba(255,255,255,0.88)',lineHeight:1.3,wordBreak:'break-word'}}>
            {tpl.name}
          </span>
        </div>
        <span style={{fontSize:10,color:'rgba(255,255,255,0.2)',flexShrink:0,marginTop:2}}>{date}</span>
      </div>

      {/* Node type badges */}
      <div style={{display:'flex',flexWrap:'wrap',gap:4,marginBottom:10}}>
        {dot(C.terminal,'Terminal',counts.terminal)}
        {dot(C.image,'Imagen',counts.image)}
        {dot(C.video,'Video',counts.video)}
        {dot(C.result,'Resultado',counts.resultImage)}
        {dot(C.image,'Galería',counts.galleryNode)}
        {!nodes.length && <span style={{fontSize:11,color:'rgba(255,255,255,0.2)',fontStyle:'italic'}}>Canvas vacío</span>}
      </div>

      {/* Actions */}
      <div style={{display:'flex',gap:5}}>
        <button onClick={()=>onLoad(tpl,true)}
          className={`glass-btn ${isGlobal?'glass-btn-violet':'glass-btn-violet'}`}
          style={{flex:1,padding:'6px 8px',fontSize:11,fontWeight:600,display:'flex',alignItems:'center',justifyContent:'center',gap:4}}>
          <FolderOpen style={{width:11,height:11}}/> Cargar
        </button>
        <button onClick={()=>onLoad(tpl,false)}
          className="glass-btn glass-btn-neutral"
          style={{flex:1,padding:'6px 8px',fontSize:11,display:'flex',alignItems:'center',justifyContent:'center',gap:4}}>
          <Plus style={{width:11,height:11}}/> Añadir
        </button>
        {canDelete && (
          <button onClick={handleDelete}
            className="glass-btn glass-btn-neutral"
            style={{padding:'6px 10px',fontSize:11,color:confirm?'#f87171':'rgba(255,255,255,0.4)',
              borderColor:confirm?'rgba(248,113,113,0.3)':undefined,
              transition:`all 200ms ${SPRING}`}}>
            {confirm ? '¿Seguro?' : <Trash2 style={{width:12,height:12}}/>}
          </button>
        )}
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// ── TemplatesPanel
// ══════════════════════════════════════════════════════════════════════════════
const TemplatesPanel = ({ onClose, nodes, edges, setNodes, setEdges, deleteNode, isAdmin }) => {
  const [templates, setTemplates] = useState([])
  const [name, setName]           = useState('')
  const [saved, setSaved]         = useState(false)
  const [loading, setLoading]     = useState(true)

  const refresh = async () => {
    const r = await apiFetch('/api/templates')
    if (r.ok) { const d = await r.json(); setTemplates(d) }
  }

  useEffect(() => { refresh().finally(() => setLoading(false)) }, [])

  const handleSave = async (global = false) => {
    const safeName = name.trim() || `Canvas ${new Date().toLocaleDateString('es-ES',{day:'numeric',month:'short',year:'numeric'})}`
    const safeNodes = nodes.map(({ data, ...rest }) => { const { onDelete, ...safe } = data||{}; return { ...rest, data: safe } })
    await apiFetch('/api/templates', { method:'POST', body: JSON.stringify({ name: safeName, nodes: safeNodes, edges, is_global: global }) })
    setName(''); setSaved(true); setTimeout(() => setSaved(false), 2000)
    await refresh()
  }

  const handleDelete = async id => {
    await apiFetch(`/api/templates/${id}`, { method:'DELETE' })
    await refresh()
  }

  const handleLoad = (tpl, replace) => { tmplLoad(tpl, setNodes, setEdges, deleteNode, replace); if (replace) onClose() }

  const fixed    = templates.filter(t => t.is_global)
  const personal = templates.filter(t => !t.is_global)

  const SectionHeader = ({ label, count, color = '#a78bfa', icon }) => (
    <div style={{
      display:'flex',alignItems:'center',gap:7,
      padding:'8px 4px 6px',marginBottom:4,
    }}>
      <span style={{fontSize:13}}>{icon}</span>
      <span style={{fontSize:11,fontWeight:700,letterSpacing:'0.06em',textTransform:'uppercase',
        color, opacity:0.9}}>{label}</span>
      {count > 0 && (
        <span style={{fontSize:10,fontWeight:700,color,background:`${color}18`,
          border:`1px solid ${color}28`,padding:'1px 6px',borderRadius:999}}>{count}</span>
      )}
      <div style={{flex:1,height:1,background:`${color}20`,borderRadius:1}}/>
    </div>
  )

  return (
    <div className="templates-panel" style={{
      position:'fixed',top:0,right:0,bottom:0,width:300,zIndex:200,
      background:'rgba(5,5,10,0.96)',backdropFilter:'blur(48px) saturate(1.6)',
      WebkitBackdropFilter:'blur(48px) saturate(1.6)',
      borderLeft:'1px solid rgba(255,255,255,0.08)',
      display:'flex',flexDirection:'column',
      boxShadow:'-12px 0 60px rgba(0,0,0,0.6)',
    }}>
      {/* Header */}
      <div style={{
        padding:'16px 18px',borderBottom:'1px solid rgba(255,255,255,0.07)',
        display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0,
        background:'linear-gradient(180deg,rgba(167,139,250,0.07) 0%,transparent 100%)',
      }}>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <LayoutTemplate style={{width:15,height:15,color:'#a78bfa'}}/>
          <span style={{fontSize:14,fontWeight:700,color:'rgba(255,255,255,0.9)',letterSpacing:'-0.02em'}}>
            Plantillas
          </span>
          {templates.length>0 && (
            <span style={{fontSize:11,background:'rgba(167,139,250,0.18)',color:'#a78bfa',
              padding:'2px 7px',borderRadius:999,fontWeight:600}}>{templates.length}</span>
          )}
        </div>
        <button onClick={onClose}
          style={{width:28,height:28,borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',
            background:'transparent',border:'none',cursor:'pointer',color:'rgba(255,255,255,0.3)',
            transition:`all 200ms ${SPRING}`}}
          onMouseEnter={e=>{e.currentTarget.style.background='rgba(255,255,255,0.08)';e.currentTarget.style.color='rgba(255,255,255,0.9)'}}
          onMouseLeave={e=>{e.currentTarget.style.background='transparent';e.currentTarget.style.color='rgba(255,255,255,0.3)'}}>
          <X style={{width:14,height:14}}/>
        </button>
      </div>

      {/* Guardar */}
      <div style={{padding:'12px 14px',borderBottom:'1px solid rgba(255,255,255,0.06)',flexShrink:0}}>
        <input
          value={name}
          onChange={e=>setName(e.target.value)}
          onKeyDown={e=>e.key==='Enter'&&handleSave(false)}
          placeholder={nodes.length ? `Nombre (${nodes.length} nodo${nodes.length!==1?'s':''})` : 'Añade nodos al canvas'}
          style={{
            width:'100%',boxSizing:'border-box',
            background:'rgba(255,255,255,0.04)',color:'rgba(255,255,255,0.8)',
            fontSize:12,borderRadius:10,padding:'8px 12px',marginBottom:8,
            border:'1px solid rgba(255,255,255,0.08)',outline:'none',
            fontFamily:'Plus Jakarta Sans,sans-serif',
            transition:`border-color 200ms ${SPRING}`,
          }}
          onFocus={e=>e.target.style.borderColor='rgba(167,139,250,0.4)'}
          onBlur={e=>e.target.style.borderColor='rgba(255,255,255,0.08)'}
        />

        {/* Botones guardar */}
        {isAdmin ? (
          <div style={{display:'flex',gap:6}}>
            {/* Personal */}
            <button onClick={()=>handleSave(false)} disabled={!nodes.length}
              className="glass-btn glass-btn-neutral"
              style={{flex:1,padding:'7px 8px',fontSize:11,fontWeight:600,
                display:'flex',alignItems:'center',justifyContent:'center',gap:5}}>
              {saved ? <Check style={{width:11,height:11}}/> : <Save style={{width:11,height:11}}/>}
              Personal
            </button>
            {/* Fijar para todos */}
            <button onClick={()=>handleSave(true)} disabled={!nodes.length}
              className="glass-btn glass-btn-violet"
              style={{flex:1,padding:'7px 8px',fontSize:11,fontWeight:600,
                display:'flex',alignItems:'center',justifyContent:'center',gap:5}}>
              <span style={{fontSize:12}}>📌</span> Fijar para todos
            </button>
          </div>
        ) : (
          <button onClick={()=>handleSave(false)} disabled={!nodes.length}
            className="glass-btn glass-btn-violet"
            style={{width:'100%',padding:'8px',fontSize:12,fontWeight:600,
              display:'flex',alignItems:'center',justifyContent:'center',gap:6}}>
            {saved ? <><Check style={{width:13,height:13}}/> Guardado</> : <><Save style={{width:13,height:13}}/> Guardar plantilla</>}
          </button>
        )}
      </div>

      {/* Lista dividida en secciones */}
      <div style={{flex:1,overflowY:'auto',padding:'12px 10px'}}>
        {loading ? (
          <div style={{textAlign:'center',padding:'48px 24px',color:'rgba(255,255,255,0.18)'}}>
            <Loader2 style={{width:24,height:24,opacity:0.3,margin:'0 auto 12px'}} className="animate-spin"/>
          </div>
        ) : templates.length === 0 ? (
          <div style={{textAlign:'center',padding:'48px 24px',color:'rgba(255,255,255,0.18)'}}>
            <LayoutTemplate style={{width:36,height:36,opacity:0.15,margin:'0 auto 12px'}}/>
            <p style={{fontSize:13,lineHeight:1.5}}>Crea un canvas y guárdalo como plantilla para reutilizarlo</p>
          </div>
        ) : (
          <>
            {/* Sección Fijadas */}
            {fixed.length > 0 && (
              <div style={{marginBottom:16}}>
                <SectionHeader label="Fijadas" count={fixed.length} color="#a78bfa" icon="📌"/>
                <div style={{display:'flex',flexDirection:'column',gap:7}}>
                  {fixed.map(tpl => (
                    <TemplateCard key={tpl.id} tpl={tpl} onLoad={handleLoad} onDelete={handleDelete}
                      canDelete={isAdmin && String(tpl.user_id) === String(tpl.user_id)}/>
                  ))}
                </div>
              </div>
            )}

            {/* Sección Personal */}
            {personal.length > 0 && (
              <div>
                <SectionHeader label="Mis plantillas" count={personal.length} color="#60a5fa" icon="🗂️"/>
                <div style={{display:'flex',flexDirection:'column',gap:7}}>
                  {personal.map(tpl => (
                    <TemplateCard key={tpl.id} tpl={tpl} onLoad={handleLoad} onDelete={handleDelete} canDelete/>
                  ))}
                </div>
              </div>
            )}

            {/* Si solo hay fijadas y nada personal */}
            {fixed.length > 0 && personal.length === 0 && (
              <div style={{textAlign:'center',marginTop:16,padding:'16px',
                background:'rgba(255,255,255,0.02)',borderRadius:12,
                border:'1px dashed rgba(255,255,255,0.06)'}}>
                <p style={{fontSize:11,color:'rgba(255,255,255,0.2)',lineHeight:1.5}}>
                  Guarda tu propio canvas para verlo aquí
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ── nodeTypes ──────────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
// ── StylesPanel — carpetas de imágenes de referencia
// ══════════════════════════════════════════════════════════════════════════════
const StyleFolder = ({ folder, onAddImg, onDelImg, onDel, onSelect, isSelected, canDelete, canEdit }) => {
  const isGlobal = folder.is_global
  return (
    <div className="tpl-card" style={{
      background: isGlobal
        ? (isSelected ? 'rgba(96,165,250,0.08)' : 'rgba(96,165,250,0.04)')
        : (isSelected ? 'rgba(96,165,250,0.06)' : 'rgba(255,255,255,0.025)'),
      border:`1px solid rgba(${isSelected?'96,165,250':'255,255,255'},${isGlobal?'0.18':isSelected?'0.18':'0.07'})`,
      borderRadius:16, overflow:'hidden',
      position:'relative',
      transition:`all 200ms ${SPRING}`,
    }}>
      {/* Glow fijado */}
      {isGlobal && (
        <div style={{
          position:'absolute',top:-20,right:-20,width:70,height:70,borderRadius:'50%',
          background:'radial-gradient(circle,rgba(96,165,250,0.15) 0%,transparent 70%)',
          pointerEvents:'none',
        }}/>
      )}

      {/* Header */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 12px 8px'}}>
        <div style={{display:'flex',alignItems:'center',gap:6,flex:1,minWidth:0}}>
          {isGlobal
            ? <span style={{fontSize:9,fontWeight:700,letterSpacing:'0.06em',textTransform:'uppercase',
                color:'#60a5fa',background:'rgba(96,165,250,0.15)',border:'1px solid rgba(96,165,250,0.25)',
                padding:'2px 6px',borderRadius:6,flexShrink:0}}>📌 Fijo</span>
            : <span style={{fontSize:14,flexShrink:0}}>📁</span>
          }
          <span style={{fontSize:12,fontWeight:600,color:'rgba(255,255,255,0.85)',
            overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{folder.name}</span>
          <span style={{fontSize:10,color:'rgba(255,255,255,0.25)',flexShrink:0}}>({(folder.images||[]).length})</span>
        </div>
        {canDelete && (
          <button onClick={onDel}
            style={{width:18,height:18,borderRadius:'50%',background:'rgba(255,255,255,0.05)',
              border:'none',cursor:'pointer',color:'rgba(255,255,255,0.3)',flexShrink:0,
              display:'flex',alignItems:'center',justifyContent:'center',
              transition:`all 150ms ${SPRING}`}}
            onMouseEnter={e=>{e.currentTarget.style.background='rgba(239,68,68,0.2)';e.currentTarget.style.color='#f87171'}}
            onMouseLeave={e=>{e.currentTarget.style.background='rgba(255,255,255,0.05)';e.currentTarget.style.color='rgba(255,255,255,0.3)'}}>
            <X style={{width:9,height:9}}/>
          </button>
        )}
      </div>

      {/* Images grid */}
      <div style={{padding:'0 10px 10px',display:'flex',flexWrap:'wrap',gap:4}}>
        {(folder.images||[]).map((img,i)=>(
          <div key={i} className="group" style={{position:'relative',width:40,height:40,flexShrink:0}}>
            <img src={img.url} style={{width:'100%',height:'100%',borderRadius:7,objectFit:'cover',border:'1px solid rgba(255,255,255,0.08)'}}/>
            {canEdit && (
              <button onClick={()=>onDelImg(i)}
                style={{position:'absolute',top:-3,right:-3,width:13,height:13,borderRadius:'50%',
                  background:'#ef4444',border:'none',cursor:'pointer',display:'none',alignItems:'center',justifyContent:'center'}}
                className="group-hover:!flex">
                <X style={{width:8,height:8,color:'white'}}/>
              </button>
            )}
          </div>
        ))}
        {canEdit && <StyleAddBtn folderId={folder.id} onAdd={onAddImg}/>}
      </div>

      {/* Apply button */}
      <div style={{padding:'0 10px 10px'}}>
        <button onClick={onSelect}
          className={`glass-btn ${isSelected?'glass-btn-blue':'glass-btn-neutral'}`}
          style={{width:'100%',padding:'6px',fontSize:11,fontWeight:600,display:'flex',alignItems:'center',justifyContent:'center',gap:5}}>
          {isSelected ? <><Check style={{width:10,height:10}}/> Aplicado</> : <><Palette style={{width:10,height:10}}/> Aplicar</>}
        </button>
      </div>
    </div>
  )
}

const StyleAddBtn = ({ folderId, onAdd }) => {
  const ref = useRef()
  const { upload, busy } = useUpload()
  const onChange = async e => {
    const f = e.target.files[0]; if(!f) return; e.target.value=''
    const r = await upload(f); if(r) onAdd(folderId, r)
  }
  return (
    <>
      <button onClick={()=>ref.current?.click()}
        style={{width:40,height:40,borderRadius:7,border:'1px dashed rgba(255,255,255,0.12)',
          background:'rgba(255,255,255,0.02)',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',
          color:'rgba(255,255,255,0.25)',transition:`all 200ms ${SPRING}`}}
        onMouseEnter={e=>{e.currentTarget.style.borderColor='rgba(96,165,250,0.4)';e.currentTarget.style.color=C.image}}
        onMouseLeave={e=>{e.currentTarget.style.borderColor='rgba(255,255,255,0.12)';e.currentTarget.style.color='rgba(255,255,255,0.25)'}}>
        {busy?<Loader2 style={{width:12,height:12}} className="animate-spin"/>:<Plus style={{width:14,height:14}}/>}
      </button>
      <input ref={ref} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={onChange}/>
    </>
  )
}

const StylesPanel = ({ onClose, onSelectStyle, selectedStyleId, isAdmin }) => {
  const [styles, setStyles]   = useState([])
  const [newName, setNewName] = useState('')
  const [loading, setLoading] = useState(true)

  const refresh = async () => {
    const r = await apiFetch('/api/styles')
    if (r.ok) { const d = await r.json(); setStyles(d); Bus.emit('styles:updated', d) }
  }

  useEffect(() => { refresh().finally(() => setLoading(false)) }, [])

  const createFolder = async (global = false) => {
    const name = newName.trim() || `Estilo ${styles.length + 1}`
    await apiFetch('/api/styles', { method:'POST', body: JSON.stringify({ name, images:[], is_global: global }) })
    setNewName(''); await refresh()
  }

  const handleAddImg = async (folderId, img) => {
    const folder = styles.find(s => s.id === folderId)
    if (!folder) return
    const images = [...(folder.images || []), img]
    await apiFetch(`/api/styles/${folderId}`, { method:'PUT', body: JSON.stringify({ images }) })
    await refresh()
  }

  const handleDelImg = async (folderId, idx) => {
    const folder = styles.find(s => s.id === folderId)
    if (!folder) return
    const images = (folder.images || []).filter((_, i) => i !== idx)
    await apiFetch(`/api/styles/${folderId}`, { method:'PUT', body: JSON.stringify({ images }) })
    await refresh()
  }

  const handleDel = async (folderId) => {
    await apiFetch(`/api/styles/${folderId}`, { method:'DELETE' })
    if (selectedStyleId === folderId) onSelectStyle(null)
    await refresh()
  }

  const fixed    = styles.filter(s => s.is_global)
  const personal = styles.filter(s => !s.is_global)

  const SectionHeader = ({ label, count, color, icon }) => (
    <div style={{display:'flex',alignItems:'center',gap:7,padding:'8px 4px 6px',marginBottom:4}}>
      <span style={{fontSize:13}}>{icon}</span>
      <span style={{fontSize:11,fontWeight:700,letterSpacing:'0.06em',textTransform:'uppercase',color,opacity:0.9}}>{label}</span>
      {count > 0 && (
        <span style={{fontSize:10,fontWeight:700,color,background:`${color}18`,
          border:`1px solid ${color}28`,padding:'1px 6px',borderRadius:999}}>{count}</span>
      )}
      <div style={{flex:1,height:1,background:`${color}20`,borderRadius:1}}/>
    </div>
  )

  return (
    <div className="templates-panel" style={{
      position:'fixed',top:0,right:0,bottom:0,width:300,zIndex:200,
      background:'rgba(5,5,10,0.96)',backdropFilter:'blur(48px) saturate(1.6)',
      WebkitBackdropFilter:'blur(48px) saturate(1.6)',
      borderLeft:'1px solid rgba(255,255,255,0.08)',
      display:'flex',flexDirection:'column',
      boxShadow:'-12px 0 60px rgba(0,0,0,0.6)',
    }}>
      {/* Header */}
      <div style={{padding:'16px 18px',borderBottom:'1px solid rgba(255,255,255,0.07)',
        display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0,
        background:'linear-gradient(180deg,rgba(96,165,250,0.07) 0%,transparent 100%)'}}>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <Palette style={{width:15,height:15,color:C.image}}/>
          <span style={{fontSize:14,fontWeight:700,color:'rgba(255,255,255,0.9)',letterSpacing:'-0.02em'}}>Estilos</span>
          {styles.length>0 && <span style={{fontSize:11,background:'rgba(96,165,250,0.18)',color:C.image,
            padding:'2px 7px',borderRadius:999,fontWeight:600}}>{styles.length}</span>}
        </div>
        <button onClick={onClose}
          style={{width:28,height:28,borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',
            cursor:'pointer',background:'transparent',border:'none',color:'rgba(255,255,255,0.3)',transition:`all 200ms ${SPRING}`}}
          onMouseEnter={e=>{e.currentTarget.style.background='rgba(255,255,255,0.08)';e.currentTarget.style.color='rgba(255,255,255,0.9)'}}
          onMouseLeave={e=>{e.currentTarget.style.background='transparent';e.currentTarget.style.color='rgba(255,255,255,0.3)'}}>
          <X style={{width:14,height:14}}/>
        </button>
      </div>

      {/* Crear estilo */}
      <div style={{padding:'12px 14px',borderBottom:'1px solid rgba(255,255,255,0.06)',flexShrink:0}}>
        <input value={newName} onChange={e=>setNewName(e.target.value)}
          onKeyDown={e=>e.key==='Enter'&&createFolder(false)}
          placeholder="Nombre del estilo…"
          style={{width:'100%',boxSizing:'border-box',
            background:'rgba(255,255,255,0.04)',color:'rgba(255,255,255,0.8)',fontSize:12,
            borderRadius:10,padding:'8px 12px',marginBottom:8,
            border:'1px solid rgba(255,255,255,0.08)',outline:'none',
            fontFamily:'Plus Jakarta Sans,sans-serif',transition:`border-color 200ms ${SPRING}`}}
          onFocus={e=>e.target.style.borderColor='rgba(96,165,250,0.4)'}
          onBlur={e=>e.target.style.borderColor='rgba(255,255,255,0.08)'}/>

        {isAdmin ? (
          <div style={{display:'flex',gap:6}}>
            <button onClick={()=>createFolder(false)} className="glass-btn glass-btn-neutral"
              style={{flex:1,padding:'7px 8px',fontSize:11,fontWeight:600,
                display:'flex',alignItems:'center',justifyContent:'center',gap:5}}>
              <FolderPlus style={{width:11,height:11}}/> Personal
            </button>
            <button onClick={()=>createFolder(true)} className="glass-btn glass-btn-blue"
              style={{flex:1,padding:'7px 8px',fontSize:11,fontWeight:600,
                display:'flex',alignItems:'center',justifyContent:'center',gap:5}}>
              <span style={{fontSize:12}}>📌</span> Fijar para todos
            </button>
          </div>
        ) : (
          <button onClick={()=>createFolder(false)} className="glass-btn glass-btn-blue"
            style={{width:'100%',padding:'8px',fontSize:12,fontWeight:600,
              display:'flex',alignItems:'center',justifyContent:'center',gap:6}}>
            <FolderPlus style={{width:13,height:13}}/> Crear estilo
          </button>
        )}
      </div>

      {/* Lista dividida */}
      <div style={{flex:1,overflowY:'auto',padding:'12px 10px'}}>
        {loading ? (
          <div style={{textAlign:'center',padding:'48px 24px',color:'rgba(255,255,255,0.18)'}}>
            <Loader2 style={{width:24,height:24,opacity:0.3,margin:'0 auto 12px'}} className="animate-spin"/>
          </div>
        ) : styles.length === 0 ? (
          <div style={{textAlign:'center',padding:'48px 24px',color:'rgba(255,255,255,0.18)'}}>
            <Palette style={{width:36,height:36,opacity:0.15,margin:'0 auto 12px'}}/>
            <p style={{fontSize:13,lineHeight:1.5}}>Crea carpetas de estilos y añade imágenes de referencia</p>
          </div>
        ) : (
          <>
            {fixed.length > 0 && (
              <div style={{marginBottom:16}}>
                <SectionHeader label="Fijados" count={fixed.length} color="#60a5fa" icon="📌"/>
                <div style={{display:'flex',flexDirection:'column',gap:7}}>
                  {fixed.map(folder=>(
                    <StyleFolder key={folder.id} folder={folder}
                      isSelected={selectedStyleId===folder.id}
                      onAddImg={(fid,img)=>handleAddImg(fid,img)}
                      onDelImg={i=>handleDelImg(folder.id,i)}
                      onDel={()=>handleDel(folder.id)}
                      onSelect={()=>onSelectStyle(selectedStyleId===folder.id?null:folder.id)}
                      canDelete={isAdmin} canEdit={isAdmin}/>
                  ))}
                </div>
              </div>
            )}

            {personal.length > 0 && (
              <div>
                <SectionHeader label="Mis estilos" count={personal.length} color="#a78bfa" icon="🎨"/>
                <div style={{display:'flex',flexDirection:'column',gap:7}}>
                  {personal.map(folder=>(
                    <StyleFolder key={folder.id} folder={folder}
                      isSelected={selectedStyleId===folder.id}
                      onAddImg={(fid,img)=>handleAddImg(fid,img)}
                      onDelImg={i=>handleDelImg(folder.id,i)}
                      onDel={()=>handleDel(folder.id)}
                      onSelect={()=>onSelectStyle(selectedStyleId===folder.id?null:folder.id)}
                      canDelete canEdit/>
                  ))}
                </div>
              </div>
            )}

            {fixed.length > 0 && personal.length === 0 && (
              <div style={{textAlign:'center',marginTop:16,padding:'16px',
                background:'rgba(255,255,255,0.02)',borderRadius:12,
                border:'1px dashed rgba(255,255,255,0.06)'}}>
                <p style={{fontSize:11,color:'rgba(255,255,255,0.2)',lineHeight:1.5}}>
                  Crea tu propio estilo para verlo aquí
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// ── PromptListNode — lista de prompts para generación en lote
// ══════════════════════════════════════════════════════════════════════════════
const C_PLIST = '#34d399' // verde esmeralda

const PromptListNode = ({ id, data }) => {
  const { setNodes, getEdges, getNode } = useReactFlow()
  const [prompts, setPrompts] = useState(data.prompts || [])
  const [busy, setBusy]       = useState(false)
  const [done, setDone]       = useState(0)

  // Recibir prompts del terminal via data
  useEffect(() => {
    if (!data.incomingPrompts?.length) return
    setPrompts(data.incomingPrompts)
    setNodes(nds => nds.map(n => n.id === id
      ? { ...n, data: { ...n.data, incomingPrompts: null } } : n))
  }, [data.incomingPrompts])

  // Sincronizar prompts en data para que los edges los lean
  useEffect(() => {
    setNodes(nds => nds.map(n => n.id === id
      ? { ...n, data: { ...n.data, prompts } } : n))
  }, [prompts])

  const handleRun = () => {
    if (!prompts.length || busy) return
    // Buscar ImageNodes conectados por el lado derecho (source)
    const targets = getEdges()
      .filter(e => e.source === id)
      .map(e => getNode(e.target))
      .filter(n => n?.type === 'image')
    if (!targets.length) return
    setBusy(true); setDone(0)
    targets.forEach(target => {
      setNodes(nds => nds.map(n => n.id === target.id
        ? { ...n, data: { ...n.data,
            batchPrompts: prompts,
            autoTrigger: true,
            incomingPrompt: prompts[0],
          }}
        : n))
    })
    // Reset busy tras delay estimado
    setTimeout(() => { setBusy(false); setDone(prompts.length) }, 1000)
  }

  const handles = <>
    <Handle type="target" position={Position.Left}  style={mkHandle('left',  C_PLIST,'terminal')}/>
    <Handle type="source" position={Position.Right} style={mkHandle('right', C_PLIST,'image')}/>
  </>

  return (
    <div style={{
      position:'relative', width:'100%', height:'100%',
      background:'rgba(4,10,8,0.97)',
      border:`1px solid ${C_PLIST}22`,
      borderRadius:16,
      display:'flex', flexDirection:'column',
      overflow:'hidden',
      boxShadow:`0 0 0 1px ${C_PLIST}10, inset 0 1px 0 rgba(255,255,255,0.04)`,
    }}>
      <NodeResizer minWidth={260} minHeight={180} color={C_PLIST} handleStyle={{width:8,height:8,borderRadius:3}}/>
      {handles}

      {/* Header */}
      <div style={{
        display:'flex', alignItems:'center', justifyContent:'space-between',
        padding:'9px 12px 8px',
        borderBottom:`1px solid ${C_PLIST}15`,
        flexShrink:0,
        background:`linear-gradient(180deg,${C_PLIST}08 0%,transparent 100%)`,
      }}>
        <div style={{display:'flex',alignItems:'center',gap:7}}>
          <span style={{width:6,height:6,borderRadius:'50%',background:C_PLIST,boxShadow:`0 0 8px ${C_PLIST}`,flexShrink:0}}/>
          <span style={{fontSize:11,fontWeight:700,color:`${C_PLIST}CC`,letterSpacing:'0.04em',fontFamily:'Plus Jakarta Sans,sans-serif'}}>
            LISTA DE PROMPTS
          </span>
          {prompts.length > 0 && (
            <span style={{
              fontSize:10,fontWeight:700,
              background:`${C_PLIST}18`,border:`1px solid ${C_PLIST}30`,
              color:C_PLIST,padding:'1px 7px',borderRadius:999,
            }}>{prompts.length}</span>
          )}
        </div>
        <div style={{display:'flex',alignItems:'center',gap:6}}>
          {/* Botón ejecutar */}
          <button onClick={handleRun} disabled={!prompts.length || busy}
            style={{
              display:'flex',alignItems:'center',gap:5,cursor:'pointer',
              background: busy ? `${C_PLIST}20` : `${C_PLIST}18`,
              border:`1px solid ${C_PLIST}${busy?'50':'30'}`,
              borderRadius:999, padding:'3px 9px',
              color: busy ? C_PLIST : `${C_PLIST}BB`,
              fontSize:10.5, fontWeight:600,
              transition:`all 200ms ${SPRING}`,
              fontFamily:'Plus Jakarta Sans,sans-serif',
              opacity: !prompts.length ? 0.4 : 1,
            }}>
            {busy
              ? <><Loader2 style={{width:9,height:9}} className="animate-spin"/> Generando…</>
              : <><Play style={{width:9,height:9,fill:'currentColor'}}/> Ejecutar</>
            }
          </button>
          <button onClick={() => data?.onDelete?.()}
            style={{width:18,height:18,borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',
              cursor:'pointer',background:'transparent',border:'none',color:'rgba(255,255,255,0.15)',transition:`all 180ms ${SPRING}`}}
            onMouseEnter={e=>{e.currentTarget.style.background='rgba(255,255,255,0.07)';e.currentTarget.style.color='rgba(255,255,255,0.7)'}}
            onMouseLeave={e=>{e.currentTarget.style.background='transparent';e.currentTarget.style.color='rgba(255,255,255,0.15)'}}>
            <X style={{width:9,height:9}}/>
          </button>
        </div>
      </div>

      {/* Lista de prompts */}
      <div style={{flex:1,overflowY:'auto',padding:'8px 0'}} className="nowheel nopan">
        {prompts.length === 0 ? (
          <div style={{
            display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',
            height:'100%',gap:8,color:'rgba(255,255,255,0.12)',padding:'16px',
          }}>
            <span style={{fontSize:22,opacity:0.2}}>⌘</span>
            <span style={{fontSize:11,textAlign:'center',lineHeight:1.6}}>
              Conecta un Terminal para recibir prompts automáticamente
            </span>
          </div>
        ) : prompts.map((p, i) => (
          <div key={i} style={{
            display:'flex', gap:10, alignItems:'flex-start',
            padding:'7px 12px',
            borderBottom: i < prompts.length-1 ? `1px solid rgba(255,255,255,0.04)` : 'none',
            transition:`background 150ms ${SPRING}`,
          }}
            onMouseEnter={e=>e.currentTarget.style.background='rgba(52,211,153,0.04)'}
            onMouseLeave={e=>e.currentTarget.style.background='transparent'}
          >
            <span style={{
              flexShrink:0, width:18, height:18, borderRadius:6,
              background:`${C_PLIST}15`, border:`1px solid ${C_PLIST}25`,
              display:'flex',alignItems:'center',justifyContent:'center',
              fontSize:9, fontWeight:700, color:`${C_PLIST}99`,
              fontFamily:'monospace', marginTop:1,
            }}>{i+1}</span>
            <span style={{
              fontSize:11.5, color:'rgba(255,255,255,0.72)', lineHeight:1.6,
              fontFamily:'Plus Jakarta Sans,sans-serif', wordBreak:'break-word',
            }}>{p}</span>
            <button onClick={() => setPrompts(ps => ps.filter((_,j)=>j!==i))}
              style={{flexShrink:0,width:14,height:14,borderRadius:4,display:'flex',alignItems:'center',
                justifyContent:'center',cursor:'pointer',background:'transparent',border:'none',
                color:'rgba(255,255,255,0.15)',marginTop:2,transition:`color 150ms ${SPRING}`}}
              onMouseEnter={e=>e.currentTarget.style.color='rgba(239,68,68,0.7)'}
              onMouseLeave={e=>e.currentTarget.style.color='rgba(255,255,255,0.15)'}>
              <X style={{width:8,height:8}}/>
            </button>
          </div>
        ))}
      </div>

      {/* Footer — estado + añadir prompt manual */}
      <div style={{
        borderTop:`1px solid ${C_PLIST}15`, padding:'8px 10px',
        flexShrink:0, display:'flex', gap:6, alignItems:'center',
      }}>
        {done > 0 && !busy && (
          <span style={{fontSize:10,color:`${C_PLIST}80`,fontWeight:600,flexShrink:0}}>
            ✓ {done}
          </span>
        )}
        <input
          placeholder="Añadir prompt…"
          onKeyDown={e=>{
            if(e.key==='Enter' && e.currentTarget.value.trim()){
              setPrompts(ps=>[...ps, e.currentTarget.value.trim()])
              e.currentTarget.value=''
            }
          }}
          style={{
            flex:1, background:'rgba(255,255,255,0.04)',
            border:`1px solid ${C_PLIST}20`, borderRadius:8,
            padding:'6px 10px', fontSize:11, color:'rgba(255,255,255,0.7)',
            outline:'none', fontFamily:'Plus Jakarta Sans,sans-serif',
          }}
          className="nowheel nopan"
          onFocus={e=>e.target.style.borderColor=`${C_PLIST}50`}
          onBlur={e=>e.target.style.borderColor=`${C_PLIST}20`}
        />
        <button
          onClick={()=>setPrompts([])}
          disabled={!prompts.length}
          title="Limpiar lista"
          style={{width:28,height:28,borderRadius:8,display:'flex',alignItems:'center',justifyContent:'center',
            cursor:'pointer',background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.08)',
            color:'rgba(255,255,255,0.3)',opacity:prompts.length?1:0.4,transition:`all 150ms ${SPRING}`}}
          onMouseEnter={e=>{ if(prompts.length) e.currentTarget.style.background='rgba(239,68,68,0.1)' }}
          onMouseLeave={e=>e.currentTarget.style.background='rgba(255,255,255,0.04)'}>
          <Trash2 style={{width:11,height:11}}/>
        </button>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// ── NoteNode — post-it de texto libre
// ══════════════════════════════════════════════════════════════════════════════
const C_NOTE = '#fde047'
const NoteNode = ({ id, data }) => {
  const { setNodes } = useReactFlow()
  const [text, setText] = useState(data.text || '')
  const noteHandles = <>
    <Handle type="target" position={Position.Left}  style={mkHandle('left',  C_NOTE,'result')}/>
    <Handle type="source" position={Position.Right} style={mkHandle('right', C_NOTE,'result')}/>
  </>
  return (
    <div style={{
      position:'relative', width:'100%', height:'100%',
      background:'rgba(253,224,71,0.045)',
      border:'1px solid rgba(253,224,71,0.14)',
      borderRadius:14,
      display:'flex', flexDirection:'column',
      overflow:'hidden',
    }}>
      <NodeResizer minWidth={180} minHeight={120} color={C_NOTE} handleStyle={{width:8,height:8,borderRadius:3}}/>
      {noteHandles}
      {/* Header */}
      <div style={{
        display:'flex', alignItems:'center', justifyContent:'space-between',
        padding:'7px 10px 6px',
        borderBottom:'1px solid rgba(253,224,71,0.08)',
        flexShrink:0,
      }}>
        <span style={{display:'flex',alignItems:'center',gap:6}}>
          <StickyNote style={{width:11,height:11,color:`${C_NOTE}99`}}/>
          <span style={{fontSize:10.5,fontWeight:600,color:`${C_NOTE}80`,letterSpacing:'0.03em',fontFamily:'Plus Jakarta Sans,sans-serif'}}>NOTA</span>
        </span>
        <button onClick={()=>data?.onDelete?.()}
          style={{width:18,height:18,borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',
            cursor:'pointer',background:'transparent',border:'none',color:'rgba(255,255,255,0.15)',
            transition:`all 180ms ${SPRING}`}}
          onMouseEnter={e=>{e.currentTarget.style.background='rgba(255,255,255,0.07)';e.currentTarget.style.color='rgba(255,255,255,0.7)'}}
          onMouseLeave={e=>{e.currentTarget.style.background='transparent';e.currentTarget.style.color='rgba(255,255,255,0.15)'}}>
          <X style={{width:9,height:9}}/>
        </button>
      </div>
      {/* Textarea */}
      <textarea
        value={text}
        onChange={e=>{
          setText(e.target.value)
          setNodes(nds=>nds.map(n=>n.id===id?{...n,data:{...n.data,text:e.target.value}}:n))
        }}
        placeholder="Escribe tu nota aquí…"
        style={{
          flex:1, width:'100%', background:'transparent',
          color:'rgba(253,224,71,0.75)', fontSize:12, lineHeight:1.65,
          resize:'none', border:'none', outline:'none',
          padding:'10px 12px',
          fontFamily:'Plus Jakarta Sans,sans-serif',
        }}
        className="nowheel nopan nodrag placeholder-yellow-300/20"
      />
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// ── TextNode — editor de texto enriquecido (solo admin)
// ══════════════════════════════════════════════════════════════════════════════
const C_TEXT  = '#60a5fa'
const C_AGENT = '#a78bfa'

const TextNode = ({ id, data }) => {
  const { addNodes, addEdges, getNode } = useReactFlow()
  const token = localStorage.getItem('fai_token')
  const authH = token ? { Authorization: `Bearer ${token}` } : {}

  const [agents, setAgents]        = useState([])
  const [selectedAgent, setSel]    = useState(null)
  const [showAgentMenu, setAgMenu] = useState(false)
  const [messages, setMessages]    = useState([])
  const [input, setInput]          = useState('')
  const [running, setRunning]      = useState(false)
  const chatRef                    = useRef(null)

  useEffect(() => {
    fetch(`${SERVER}/api/agents`, { headers: authH })
      .then(r => r.ok ? r.json() : [])
      .then(list => { setAgents(list); if (list.length) setSel(list[0]) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight
  }, [messages])

  const executeActions = (actions, sourceId) => {
    const srcNode = getNode(sourceId)
    const bx = (srcNode?.position?.x || 0) + (srcNode?.measured?.width || 380) + 60
    const by = (srcNode?.position?.y || 0)
    const newNodes = [], newEdges = []
    actions.forEach((act, i) => {
      const nid = `agent-${Date.now()}-${i}`
      if (act.type === 'create_image') {
        newNodes.push({ id:nid, type:'image', position:{x:bx, y:by+i*310},
          style:{width:340,height:300},
          data:{ label:`Imagen — ${selectedAgent?.name||'Agente'}`,
            autoPrompt:act.prompt, autoModel:act.model||'nano-banana-pro',
            autoQty:act.qty||4, autoAr:act.ar||'1:1' } })
        newEdges.push({ id:`e-${sourceId}-${nid}`, source:sourceId, target:nid, type:'gradient' })
      }
      if (act.type === 'create_video') {
        newNodes.push({ id:nid, type:'video', position:{x:bx, y:by+i*330},
          style:{width:340,height:320},
          data:{ label:`Video — ${selectedAgent?.name||'Agente'}`,
            autoPrompt:act.prompt, autoModel:act.model||'kling-2.6/text-to-video',
            autoAr:act.ar||'16:9', autoDuration:act.duration||5 } })
        newEdges.push({ id:`e-${sourceId}-${nid}`, source:sourceId, target:nid, type:'gradient' })
      }
    })
    if (newNodes.length) {
      addNodes(newNodes); addEdges(newEdges)
      setTimeout(() => newNodes.forEach(n => Bus.emit('agent:auto-execute', { nodeId:n.id, ...n.data })), 400)
    }
  }

  const send = async () => {
    const msg = input.trim()
    if (!msg || running) return
    setInput(''); setRunning(true)
    setMessages(prev => [...prev, { role:'user', content:msg }])
    try {
      const history = messages.slice(-10).map(m => ({ role: m.role==='agent'?'assistant':'user', content:m.content }))
      const r = await fetch(`${SERVER}/api/agent/run`, {
        method:'POST', headers:{ 'Content-Type':'application/json', ...authH },
        body: JSON.stringify({ agentId:selectedAgent?.id, message:msg, history }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error||'Error')
      setMessages(prev => [...prev, { role:'agent', content:d.reply, actions:d.actions||[] }])
      if (d.actions?.length) executeActions(d.actions, id)
    } catch(err) {
      setMessages(prev => [...prev, { role:'agent', content:`Error: ${err.message}`, actions:[] }])
    } finally { setRunning(false) }
  }

  const textHandles = <>
    <Handle type="target" position={Position.Left}  style={mkHandle('left',  C_AGENT,'image')}/>
    <Handle type="source" position={Position.Right} style={mkHandle('right', C_AGENT,'image')}/>
  </>

  return (
    <Shell hex={C_AGENT} minW={360} minH={440} handles={textHandles}>
      {/* Header */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',
        padding:'8px 10px 8px 12px',borderBottom:'1px solid rgba(255,255,255,0.05)',flexShrink:0}}>
        <div style={{display:'flex',alignItems:'center',gap:7}}>
          <div style={{width:22,height:22,borderRadius:7,background:`${C_AGENT}22`,border:`1px solid ${C_AGENT}40`,
            display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
            <Bot size={12} color={C_AGENT}/>
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:1}}>
            <span style={{fontSize:12,fontWeight:700,color:'rgba(255,255,255,0.85)',letterSpacing:'-0.01em'}}>
              Agente IA
            </span>
            {selectedAgent && (
              <span style={{fontSize:9,color:C_AGENT,opacity:0.7,letterSpacing:'0.04em',fontFamily:'monospace'}}>
                {selectedAgent.model} · max {selectedAgent.max_tokens}tk
              </span>
            )}
          </div>
        </div>
        <button onClick={()=>data?.onDelete?.()}
          style={{width:20,height:20,borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',
            cursor:'pointer',background:'transparent',border:'none',color:'rgba(255,255,255,0.2)',transition:`all 180ms ${SPRING}`}}
          onMouseEnter={e=>{e.currentTarget.style.background='rgba(255,255,255,0.07)';e.currentTarget.style.color='rgba(255,255,255,0.8)'}}
          onMouseLeave={e=>{e.currentTarget.style.background='transparent';e.currentTarget.style.color='rgba(255,255,255,0.2)'}}>
          <X style={{width:10,height:10}}/>
        </button>
      </div>

      {/* Selector de agente */}
      <div className="nowheel nopan nodrag" style={{padding:'7px 10px',borderBottom:'1px solid rgba(255,255,255,0.05)',flexShrink:0,position:'relative'}}>
        <button onClick={()=>setAgMenu(v=>!v)} style={{
          width:'100%',display:'flex',alignItems:'center',justifyContent:'space-between',
          padding:'6px 10px',borderRadius:8,border:`1px solid ${C_AGENT}30`,
          background:`${C_AGENT}12`,cursor:'pointer',color:'rgba(255,255,255,0.8)',
          fontSize:12,fontWeight:600,transition:`all 150ms ${SPRING}`}}>
          <span style={{display:'flex',alignItems:'center',gap:7}}>
            <Sparkles size={11} color={C_AGENT}/>
            {selectedAgent ? selectedAgent.name : 'Selecciona un agente…'}
          </span>
          <ChevronDown size={12} style={{opacity:0.5,transform:showAgentMenu?'rotate(180deg)':'none',transition:'transform 200ms'}}/>
        </button>
        {showAgentMenu && agents.length > 0 && (
          <div style={{position:'absolute',top:'calc(100% + 2px)',left:10,right:10,zIndex:200,
            background:'rgba(8,8,16,0.98)',backdropFilter:'blur(20px)',
            border:'1px solid rgba(255,255,255,0.1)',borderRadius:10,
            padding:4,boxShadow:'0 12px 40px rgba(0,0,0,0.7)'}}>
            {agents.map(ag=>(
              <button key={ag.id} onClick={()=>{setSel(ag);setAgMenu(false)}} style={{
                display:'flex',flexDirection:'column',width:'100%',textAlign:'left',
                padding:'8px 10px',borderRadius:7,border:'none',cursor:'pointer',
                background:selectedAgent?.id===ag.id?`${C_AGENT}18`:'transparent',
                transition:`all 120ms ${SPRING}`}}
                onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,0.06)'}
                onMouseLeave={e=>e.currentTarget.style.background=selectedAgent?.id===ag.id?`${C_AGENT}18`:'transparent'}>
                <span style={{fontSize:12,fontWeight:700,color:selectedAgent?.id===ag.id?C_AGENT:'rgba(255,255,255,0.8)'}}>{ag.name}</span>
                {ag.description&&<span style={{fontSize:10,color:'rgba(255,255,255,0.35)',marginTop:2}}>{ag.description}</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Chat messages */}
      <div ref={chatRef} className="nowheel nopan nodrag" onClick={()=>setAgMenu(false)}
        style={{flex:1,overflowY:'auto',padding:'10px',display:'flex',flexDirection:'column',gap:8,minHeight:160}}>
        {messages.length===0&&(
          <div style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',
            color:'rgba(255,255,255,0.18)',gap:8,textAlign:'center',padding:'20px 10px'}}>
            <Bot size={28} style={{opacity:0.25}}/>
            <p style={{fontSize:11,lineHeight:1.6,maxWidth:220,margin:0,whiteSpace:'pre-line'}}>
              {selectedAgent?`${selectedAgent.name} listo.\nPídele crear imágenes, videos o campañas.`:'Selecciona un agente para comenzar.'}
            </p>
          </div>
        )}
        {messages.map((m,i)=>(
          <div key={i} style={{display:'flex',flexDirection:'column',alignItems:m.role==='user'?'flex-end':'flex-start'}}>
            <div style={{maxWidth:'88%',padding:'8px 12px',
              borderRadius:m.role==='user'?'14px 14px 4px 14px':'14px 14px 14px 4px',
              background:m.role==='user'?`linear-gradient(135deg,${C_AGENT}50,${C_AGENT}30)`:'rgba(255,255,255,0.06)',
              border:m.role==='user'?`1px solid ${C_AGENT}40`:'1px solid rgba(255,255,255,0.08)',
              fontSize:12,lineHeight:1.6,color:'rgba(255,255,255,0.88)',wordBreak:'break-word'}}>
              {m.content}
            </div>
            {m.actions?.length>0&&(
              <div style={{marginTop:4,fontSize:10,color:C_AGENT,display:'flex',alignItems:'center',gap:4}}>
                <Sparkles size={9}/>{m.actions.length} nodo{m.actions.length>1?'s':''} creado{m.actions.length>1?'s':''}
              </div>
            )}
          </div>
        ))}
        {running&&(
          <div style={{display:'flex',alignItems:'center',gap:8,padding:'6px 12px',
            background:'rgba(255,255,255,0.04)',borderRadius:12,maxWidth:'60%',
            border:'1px solid rgba(255,255,255,0.06)'}}>
            <Loader2 size={12} style={{animation:'spin 1s linear infinite',color:C_AGENT}}/>
            <span style={{fontSize:11,color:'rgba(255,255,255,0.4)'}}>{selectedAgent?.name||'Agente'} pensando…</span>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="nowheel nopan nodrag" style={{padding:'8px 10px',borderTop:'1px solid rgba(255,255,255,0.05)',
        display:'flex',gap:6,flexShrink:0,alignItems:'flex-end'}}>
        <textarea value={input} onChange={e=>setInput(e.target.value)}
          onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send()}}}
          placeholder={selectedAgent?`Escríbele a ${selectedAgent.name}… (Enter para enviar)`:'Selecciona un agente…'}
          disabled={!selectedAgent||running} rows={2}
          style={{flex:1,background:'rgba(255,255,255,0.05)',border:`1px solid ${C_AGENT}30`,
            borderRadius:10,padding:'8px 10px',color:'rgba(255,255,255,0.85)',
            fontSize:12,lineHeight:1.5,resize:'none',outline:'none',
            fontFamily:'Plus Jakarta Sans,sans-serif',caretColor:C_AGENT,
            transition:`border-color 150ms ${SPRING}`}}
          onFocus={e=>e.target.style.borderColor=`${C_AGENT}70`}
          onBlur={e=>e.target.style.borderColor=`${C_AGENT}30`}/>
        <button onClick={send} disabled={!selectedAgent||!input.trim()||running} style={{
          width:34,height:34,borderRadius:10,border:'none',cursor:'pointer',
          background:(!selectedAgent||!input.trim()||running)?'rgba(255,255,255,0.06)':C_AGENT,
          display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,
          transition:`all 150ms ${SPRING}`}}>
          {running
            ?<Loader2 size={14} style={{animation:'spin 1s linear infinite',color:'#fff'}}/>
            :<Send size={14} color={!selectedAgent||!input.trim()?'rgba(255,255,255,0.3)':'#fff'}/>}
        </button>
      </div>
      <style>{`@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
    </Shell>
  )
}

const nodeTypes = {
  terminal:    TerminalNode,
  text:        TextNode,
  image:       ImageNode,
  video:       VideoNode,
  resultImage: ResultImageNode,
  galleryNode: GalleryNode,
  note:        NoteNode,
  promptList:  PromptListNode,
}

const edgeOpts = { type:'gradient' }

// ══════════════════════════════════════════════════════════════════════════════
// ── App
// ══════════════════════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════════════════════
// ── LoginScreen
// ══════════════════════════════════════════════════════════════════════════════
function LoginScreen({ onLogin }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)

  const handleSubmit = async e => {
    e.preventDefault()
    if (!username.trim() || !password.trim()) return
    setLoading(true); setError('')
    try {
      const r = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      })
      const d = await r.json()
      if (!r.ok) { setError(d.error || 'Error al iniciar sesión'); return }
      localStorage.setItem('fai_token', d.token)
      localStorage.setItem('fai_user',  d.username)
      localStorage.setItem('fai_role',  d.role || 'user')
      onLogin(d.username, d.role || 'user')
    } catch {
      setError('No se pudo conectar al servidor')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      width:'100vw', height:'100vh',
      background:'#080810',
      display:'flex', alignItems:'center', justifyContent:'center',
      fontFamily:'Plus Jakarta Sans,sans-serif',
    }}>
      {/* Glow de fondo */}
      <div style={{
        position:'fixed', top:'30%', left:'50%', transform:'translate(-50%,-50%)',
        width:500, height:500, borderRadius:'50%',
        background:'radial-gradient(circle, rgba(96,165,250,0.06) 0%, transparent 70%)',
        pointerEvents:'none',
      }}/>

      <div style={{
        width:340,
        background:'linear-gradient(135deg,rgba(255,255,255,0.07) 0%,rgba(255,255,255,0.03) 100%)',
        border:'1px solid rgba(255,255,255,0.1)',
        borderRadius:24,
        padding:'36px 32px 32px',
        backdropFilter:'blur(40px)',
        boxShadow:'0 24px 80px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.12)',
      }}>
        {/* Logo / título */}
        <div style={{textAlign:'center', marginBottom:28}}>
          <div style={{
            display:'inline-flex', alignItems:'center', justifyContent:'center',
            width:44, height:44, borderRadius:14,
            background:'linear-gradient(135deg,rgba(96,165,250,0.2),rgba(167,139,250,0.2))',
            border:'1px solid rgba(96,165,250,0.25)',
            marginBottom:14,
          }}>
            <ImageIcon style={{width:20,height:20,color:'rgba(96,165,250,0.9)'}}/>
          </div>
          <div style={{fontSize:18,fontWeight:700,color:'rgba(255,255,255,0.92)',letterSpacing:'-0.02em'}}>
            FullStackAI
          </div>
          <div style={{fontSize:12,color:'rgba(255,255,255,0.3)',marginTop:4}}>
            Acceso restringido · Cliender
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Usuario */}
          <div style={{marginBottom:12}}>
            <label style={{fontSize:11,color:'rgba(255,255,255,0.4)',display:'block',marginBottom:5,fontWeight:500}}>
              Usuario
            </label>
            <input
              type="text" value={username} onChange={e=>setUsername(e.target.value)}
              autoComplete="username" autoFocus
              placeholder="tu usuario"
              style={{
                width:'100%', background:'rgba(255,255,255,0.06)',
                border:'1px solid rgba(255,255,255,0.1)', borderRadius:10,
                padding:'10px 12px', fontSize:13, color:'rgba(255,255,255,0.85)',
                outline:'none', boxSizing:'border-box',
                fontFamily:'Plus Jakarta Sans,sans-serif',
                transition:`border-color 200ms ${SPRING}`,
              }}
              onFocus={e=>e.target.style.borderColor='rgba(96,165,250,0.5)'}
              onBlur={e=>e.target.style.borderColor='rgba(255,255,255,0.1)'}
            />
          </div>

          {/* Contraseña */}
          <div style={{marginBottom:20}}>
            <label style={{fontSize:11,color:'rgba(255,255,255,0.4)',display:'block',marginBottom:5,fontWeight:500}}>
              Contraseña
            </label>
            <input
              type="password" value={password} onChange={e=>setPassword(e.target.value)}
              autoComplete="current-password"
              placeholder="••••••••"
              style={{
                width:'100%', background:'rgba(255,255,255,0.06)',
                border:'1px solid rgba(255,255,255,0.1)', borderRadius:10,
                padding:'10px 12px', fontSize:13, color:'rgba(255,255,255,0.85)',
                outline:'none', boxSizing:'border-box',
                fontFamily:'Plus Jakarta Sans,sans-serif',
                transition:`border-color 200ms ${SPRING}`,
              }}
              onFocus={e=>e.target.style.borderColor='rgba(96,165,250,0.5)'}
              onBlur={e=>e.target.style.borderColor='rgba(255,255,255,0.1)'}
            />
          </div>

          {/* Error */}
          {error && (
            <div style={{
              display:'flex', alignItems:'center', gap:7,
              background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.25)',
              borderRadius:8, padding:'8px 12px', marginBottom:14,
              fontSize:12, color:'rgba(239,68,68,0.9)',
            }}>
              <AlertCircle style={{width:13,height:13,flexShrink:0}}/>
              {error}
            </div>
          )}

          {/* Botón */}
          <button type="submit" disabled={loading || !username.trim() || !password.trim()}
            style={{
              width:'100%', padding:'11px',
              background: loading
                ? 'rgba(96,165,250,0.15)'
                : 'linear-gradient(135deg,rgba(96,165,250,0.25),rgba(167,139,250,0.2))',
              border:'1px solid rgba(96,165,250,0.35)',
              borderRadius:10, cursor: loading ? 'wait' : 'pointer',
              fontSize:13, fontWeight:600, color:'rgba(255,255,255,0.9)',
              display:'flex', alignItems:'center', justifyContent:'center', gap:7,
              transition:`all 200ms ${SPRING}`,
              fontFamily:'Plus Jakarta Sans,sans-serif',
            }}
            onMouseEnter={e=>{ if(!loading) e.currentTarget.style.background='linear-gradient(135deg,rgba(96,165,250,0.35),rgba(167,139,250,0.3))' }}
            onMouseLeave={e=>{ if(!loading) e.currentTarget.style.background='linear-gradient(135deg,rgba(96,165,250,0.25),rgba(167,139,250,0.2))' }}>
            {loading
              ? <><Loader2 style={{width:14,height:14}} className="animate-spin"/> Verificando…</>
              : 'Entrar →'
            }
          </button>
        </form>
      </div>
    </div>
  )
}

export default function App() {
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [authUser, setAuthUser] = useState(() => {
    const token = localStorage.getItem('fai_token')
    const user  = localStorage.getItem('fai_user')
    return (token && user) ? user : null
  })
  const [authRole, setAuthRole] = useState(() => localStorage.getItem('fai_role') || 'user')
  const isAdmin = authRole === 'admin'
  const rfRef = useRef(null)  // ReactFlow instance → getViewport()
  const [showTemplates, setShowTemplates] = useState(false)
  const [showStyles, setShowStyles]       = useState(false)
  const [globalStyleId, setGlobalStyleId] = useState(null)
  const [clearConfirm, setClearConfirm]   = useState(false)
  const [lightboxItem, setLightboxItem]   = useState(null)

  // ── Auto-save canvas cada 30s + restore al login ─────────────────────────
  useEffect(() => {
    const token = localStorage.getItem('fai_token')
    if (!token) return
    // Cargar canvas guardado
    fetch(`${SERVER}/api/canvas`, { headers:{ Authorization:`Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.nodes?.length) {
          const del = nid => setNodes(nds => nds.filter(n => n.id !== nid))
          tmplLoad({ nodes: d.nodes, edges: d.edges || [] }, setNodes, setEdges, del, true)
        }
      })
      .catch(() => {})
  }, [authUser])

  useEffect(() => {
    const token = localStorage.getItem('fai_token')
    if (!token || !nodes.length) return
    const timer = setTimeout(() => {
      fetch(`${SERVER}/api/canvas`, {
        method:'POST', headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${token}` },
        body: JSON.stringify({ nodes, edges }),
      }).catch(() => {})
    }, 2000)
    return () => clearTimeout(timer)
  }, [nodes, edges])

  // ── Lightbox listener global ──────────────────────────────────────────────
  useEffect(() => Bus.on('openLightbox', setLightboxItem), [])

  // ── StylesPanel listener (nodos pueden pedirlo) ───────────────────────────
  useEffect(() => Bus.on('openStylesPanel', ()=>setShowStyles(true)), [])

  // ── Workflow automation — terminal → promptList / image / video ────────────
  useEffect(() => {
    const injectPrompt = (sourceId, prompt, batchPrompts, auto) => {
      const outEdges = edges.filter(e => e.source === sourceId)
      if (!outEdges.length) return

      setNodes(nds => nds.map(n => {
        if (!outEdges.find(e => e.target === n.id)) return n

        // PromptListNode — recibe el batch completo
        if (n.type === 'promptList') {
          const prompts = batchPrompts?.length ? batchPrompts : (prompt ? [prompt] : [])
          return { ...n, data: { ...n.data, incomingPrompts: prompts } }
        }

        // ImageNode / VideoNode conectados directamente (sin PromptList)
        if (n.type === 'image' || n.type === 'video') {
          return { ...n, data: { ...n.data,
            incomingPrompt: prompt,
            batchPrompts: batchPrompts || null,
            autoTrigger: auto ? true : undefined,
          }}
        }

        return n
      }))
    }
    const onPrompt = ({ sourceId, prompt, auto }) => injectPrompt(sourceId, prompt, null, auto)
    const onBatch  = ({ sourceId, prompts, auto }) => injectPrompt(sourceId, prompts?.[0] || '', prompts, auto)
    const u1 = Bus.on('workflow:prompt', onPrompt)
    const u2 = Bus.on('workflow:batch',  onBatch)
    return () => { u1(); u2() }
  }, [edges, setNodes])

  const newCanvas = useCallback(() => {
    if (!nodes.length) return
    if (clearConfirm) {
      setNodes([]); setEdges([]); setClearConfirm(false)
    } else {
      setClearConfirm(true)
      setTimeout(() => setClearConfirm(false), 3000)
    }
  }, [nodes.length, clearConfirm, setNodes, setEdges])

  const deleteNode = useCallback(id => setNodes(n=>n.filter(x=>x.id!==id)),[setNodes])

  const addNode = useCallback((type, w, h) => {
    const id = `${type}-${Date.now()}`
    // Abrir en el centro del viewport actual
    const vp = rfRef.current?.getViewport() || { x:0, y:0, zoom:1 }
    const cx = (window.innerWidth/2  - vp.x) / vp.zoom
    const cy = (window.innerHeight/2 - vp.y) / vp.zoom
    // Pequeño offset aleatorio para que múltiples nodos no se apilen exactos
    const jitter = () => (Math.random()-0.5)*60
    setNodes(n=>[...n,{
      id, type,
      position:{ x: cx - w/2 + jitter(), y: cy - h/2 + jitter() },
      style:{ width:w, height:h },
      data:{ onDelete:()=>deleteNode(id) },
    }])
  },[setNodes,deleteNode])

  const onConnect = useCallback(c=>setEdges(e=>addEdge({...c,...edgeOpts},e)),[setEdges])

  const btnBase = { display:'flex',alignItems:'center',gap:6,fontSize:12,fontWeight:500,
    padding:'6px 14px',borderRadius:999,cursor:'pointer',border:'none',
    color:'rgba(255,255,255,0.65)',background:'transparent',
    transition:`all 250ms ${SPRING}`,letterSpacing:'-0.01em',fontFamily:'Plus Jakarta Sans,sans-serif' }

  // Verificar token al montar — solo invalida en 401 explícito, no en errores de red
  useEffect(() => {
    const token = localStorage.getItem('fai_token')
    if (!token) return
    fetch('/api/auth/verify', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => {
        if (r.status === 401) {
          localStorage.removeItem('fai_token')
          localStorage.removeItem('fai_user')
          setAuthUser(null)
        }
      })
      .catch(() => { /* error de red — mantener sesión */ })
  }, [])

  if (!authUser) return <LoginScreen onLogin={(u, role) => { setAuthUser(u); setAuthRole(role) }} />

  return (
    <div style={{width:'100vw',height:'100vh',background:'#080810'}}>
      <ReactFlow
        nodes={nodes} edges={edges}
        onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        defaultEdgeOptions={edgeOpts}
        connectionRadius={50}
        onInit={inst => { rfRef.current = inst }}
        fitView
        zoomOnScroll={true}
        zoomActivationKeyCode="Control"
        panOnScroll={true}
        panOnScrollMode="vertical"
        panActivationKeyCode="Space"
        nodeDragThreshold={8}
        noDragClassName="nodrag"
        onWheel={e => {
          if (e.shiftKey) {
            e.preventDefault()
            const vp = rfRef.current?.getViewport()
            if (!vp) return
            rfRef.current.setViewport(
              { x: vp.x - e.deltaY, y: vp.y, zoom: vp.zoom },
              { duration: 0 }
            )
          }
        }}
      >
        <Background variant="dots" gap={28} size={0.8} color="rgba(255,255,255,0.05)"/>
        <Controls className="!bg-transparent !border-0 !shadow-none"/>
        <MiniMap position="bottom-left"
          style={{backgroundColor:'rgba(5,5,8,0.7)',border:'1px solid rgba(255,255,255,0.06)',borderRadius:12}}
          className="opacity-50 hover:opacity-100 transition-opacity"/>
      </ReactFlow>

      {/* Floating toolbar — Liquid Glass Pill */}
      <div style={{
        position:'fixed',top:20,left:'50%',transform:'translateX(-50%)',zIndex:50,
        display:'flex',alignItems:'center',gap:4,
        background:'linear-gradient(135deg,rgba(255,255,255,0.09) 0%,rgba(255,255,255,0.05) 100%)',
        backdropFilter:'blur(40px) saturate(1.8)',
        WebkitBackdropFilter:'blur(40px) saturate(1.8)',
        border:'1px solid rgba(255,255,255,0.13)',
        borderRadius:999,
        padding:'5px 8px',
        boxShadow:'inset 0 1px 0 rgba(255,255,255,0.18), inset 0 -1px 0 rgba(0,0,0,0.15), 0 8px 40px rgba(0,0,0,0.55), 0 2px 8px rgba(0,0,0,0.3)',
      }}>
        {[
          { label:'Nota',     type:'note',       w:240, h:180, hex:C_NOTE },
          ...(isAdmin ? [
            { label:'Terminal', type:'terminal', w:380, h:260, hex:C.terminal },
            { label:'Texto',    type:'text',     w:360, h:280, hex:C_TEXT },
          ] : []),
          { label:'Prompts',  type:'promptList', w:300, h:360, hex:C_PLIST },
          { label:'Imagen',   type:'image',      w:320, h:520, hex:C.image },
          { label:'Video',    type:'video',      w:380, h:740, hex:C.video },
        ].map((item,i) => (
          <span key={item.type} style={{display:'flex',alignItems:'center'}}>
            {i>0 && <span style={{width:1,height:14,background:'rgba(255,255,255,0.1)',margin:'0 2px'}}/>}
            <button
              className="glass-btn glass-btn-neutral"
              style={{padding:'6px 14px',fontSize:12,fontWeight:500,
                letterSpacing:'-0.01em',display:'flex',alignItems:'center',gap:6,
                color:`${item.hex}CC`}}
              onClick={()=>addNode(item.type,item.w,item.h)}>
              {item.type==='note'       && <StickyNote   style={{width:13,height:13}}/>}
              {item.type==='terminal'   && <TerminalIcon style={{width:13,height:13}}/>}
              {item.type==='promptList' && <LayoutTemplate style={{width:13,height:13}}/>}
              {item.type==='image'      && <ImageIcon    style={{width:13,height:13}}/>}
              {item.type==='video'      && <Video        style={{width:13,height:13}}/>}
              {item.label}
            </button>
          </span>
        ))}

        {/* Plantillas */}
        <span style={{width:1,height:14,background:'rgba(255,255,255,0.1)',margin:'0 2px'}}/>
        <button
          className="glass-btn glass-btn-neutral"
          style={{padding:'6px 12px',fontSize:12,fontWeight:500,
            letterSpacing:'-0.01em',display:'flex',alignItems:'center',gap:6,
            color: showTemplates ? '#a78bfa' : 'rgba(167,139,250,0.65)',
            background: showTemplates ? 'rgba(139,92,246,0.12)' : undefined,
          }}
          onClick={()=>setShowTemplates(v=>!v)}>
          <LayoutTemplate style={{width:13,height:13}}/>
          Plantillas
        </button>

        {/* Estilos */}
        <span style={{width:1,height:14,background:'rgba(255,255,255,0.1)',margin:'0 2px'}}/>
        <button
          className="glass-btn glass-btn-neutral"
          style={{padding:'6px 12px',fontSize:12,fontWeight:500,
            letterSpacing:'-0.01em',display:'flex',alignItems:'center',gap:6,
            color: showStyles ? C.image : 'rgba(96,165,250,0.65)',
            background: showStyles ? 'rgba(59,130,246,0.12)' : undefined,
          }}
          onClick={()=>setShowStyles(v=>!v)}>
          <Palette style={{width:13,height:13}}/>
          Estilos
        </button>

        {/* Separador + usuario + logout */}
        <span style={{width:1,height:14,background:'rgba(255,255,255,0.1)',margin:'0 2px'}}/>
        <span style={{fontSize:11,color:'rgba(255,255,255,0.28)',padding:'0 4px 0 6px',fontWeight:500}}>
          {authUser}
        </span>
        <button
          className="glass-btn glass-btn-neutral"
          title="Cerrar sesión"
          style={{padding:'6px 10px',fontSize:12,color:'rgba(239,68,68,0.7)'}}
          onClick={() => {
            localStorage.removeItem('fai_token')
            localStorage.removeItem('fai_user')
            setAuthUser(null)
          }}>
          <X style={{width:12,height:12}}/>
        </button>
      </div>

      {/* Nuevo canvas — botón flotante esquina inferior derecha */}
      <button
        onClick={newCanvas}
        disabled={!nodes.length}
        title={clearConfirm ? 'Click de nuevo para confirmar' : 'Nuevo canvas'}
        style={{
          position:'fixed', bottom:24, right:24, zIndex:50,
          width: clearConfirm ? 'auto' : 40, height:40,
          padding: clearConfirm ? '0 14px' : 0,
          borderRadius:999,
          display:'flex',alignItems:'center',justifyContent:'center',gap:6,
          background: clearConfirm
            ? 'linear-gradient(135deg,rgba(239,68,68,0.35),rgba(185,28,28,0.25))'
            : 'linear-gradient(135deg,rgba(255,255,255,0.08),rgba(255,255,255,0.04))',
          backdropFilter:'blur(20px) saturate(1.6)',
          WebkitBackdropFilter:'blur(20px) saturate(1.6)',
          border: clearConfirm ? '1px solid rgba(239,68,68,0.35)' : '1px solid rgba(255,255,255,0.10)',
          boxShadow: clearConfirm
            ? 'inset 0 1px 0 rgba(255,255,255,0.12), 0 4px 20px rgba(239,68,68,0.2)'
            : 'inset 0 1px 0 rgba(255,255,255,0.12), 0 4px 16px rgba(0,0,0,0.4)',
          cursor: nodes.length ? 'pointer' : 'default',
          opacity: nodes.length ? 1 : 0.3,
          transition:`all 280ms ${SPRING}`,
          color: clearConfirm ? 'rgba(252,165,165,0.9)' : 'rgba(255,255,255,0.5)',
          fontSize:11, fontWeight:600,
          overflow:'hidden',
          whiteSpace:'nowrap',
        }}>
        {clearConfirm
          ? <><X style={{width:11,height:11}}/> Limpiar canvas</>
          : <Plus style={{width:16,height:16}}/>
        }
      </button>

      {/* Panel de plantillas */}
      {showTemplates && (
        <TemplatesPanel
          onClose={()=>setShowTemplates(false)}
          nodes={nodes}
          edges={edges}
          setNodes={setNodes}
          setEdges={setEdges}
          deleteNode={deleteNode}
          isAdmin={isAdmin}
        />
      )}

      {/* Backdrop semitransparente cuando el panel está abierto */}
      {showTemplates && (
        <div
          onClick={()=>setShowTemplates(false)}
          style={{position:'fixed',inset:0,zIndex:190,background:'rgba(0,0,0,0.3)',backdropFilter:'blur(2px)',
            transition:`opacity 300ms ${SPRING}`}}
        />
      )}

      {/* Panel Estilos */}
      {showStyles && (
        <>
          <StylesPanel
            onClose={()=>setShowStyles(false)}
            onSelectStyle={id=>{ setGlobalStyleId(id) }}
            selectedStyleId={globalStyleId}
            isAdmin={isAdmin}
          />
          <div onClick={()=>setShowStyles(false)}
            style={{position:'fixed',inset:0,zIndex:190,background:'rgba(0,0,0,0.3)',backdropFilter:'blur(2px)'}}/>
        </>
      )}

      {/* Lightbox global */}
      {lightboxItem && (
        <Lightbox item={lightboxItem} onClose={()=>setLightboxItem(null)}/>
      )}
    </div>
  )
}
