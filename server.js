import 'dotenv/config'
import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import cors from 'cors'
import pty from 'node-pty-prebuilt-multiarch'
import multer from 'multer'
import { watchFile, readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import pg from 'pg'

const { Pool } = pg
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } })

const app = express()
app.use(cors())
app.use(express.json())

const httpServer = createServer(app)
const io = new Server(httpServer, { cors: { origin: '*' } })

const KIE_KEY = process.env.KIE_API_KEY
const KIE_BASE = 'https://api.kie.ai/api/v1'
const JWT_SECRET = process.env.JWT_SECRET || 'fullstackai_secret_key'

// ─── PostgreSQL pool ──────────────────────────────────────────────────────────
const db = new Pool({
  host:     process.env.DB_HOST     || '127.0.0.1',
  port:     process.env.DB_PORT     || 5432,
  database: process.env.DB_NAME     || 'fullstackai',
  user:     process.env.DB_USER     || 'fai_user',
  password: process.env.DB_PASSWORD || 'fai_db_2024_secure',
  max: 10,
})
let dbReady = false
db.connect()
  .then(() => { dbReady = true; console.log('🗄️  PostgreSQL conectado') })
  .catch(e => console.error('⚠️  PostgreSQL no disponible (modo local sin DB):', e.message))

// ─── Auth middleware ──────────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  const auth = req.headers.authorization
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'No autorizado' })
  try {
    req.user = jwt.verify(auth.slice(7), JWT_SECRET)
    next()
  } catch {
    res.status(401).json({ error: 'Token inválido o expirado' })
  }
}

// ─── POST /api/auth/login ─────────────────────────────────────────────────────
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body
  if (!username || !password) return res.status(400).json({ error: 'Faltan credenciales' })

  // Modo local sin DB — acepta cualquier usuario (desarrollo)
  if (!dbReady) {
    const token = jwt.sign({ id: 'local', username: username.trim(), role: 'admin' }, JWT_SECRET, { expiresIn: '30d' })
    return res.json({ token, username: username.trim(), role: 'admin' })
  }

  try {
    const { rows } = await db.query(
      'SELECT id, username, password_hash, role FROM users WHERE username=$1 AND active=true',
      [username.toLowerCase().trim()]
    )
    if (!rows.length) return res.status(401).json({ error: 'Usuario o contraseña incorrectos' })
    const user = rows[0]
    const ok = await bcrypt.compare(password, user.password_hash)
    if (!ok) return res.status(401).json({ error: 'Usuario o contraseña incorrectos' })
    await db.query('UPDATE users SET last_login=NOW() WHERE id=$1', [user.id])
    const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '30d' })
    res.json({ token, username: user.username, role: user.role })
  } catch (e) {
    console.error('Login error:', e.message)
    res.status(500).json({ error: 'Error del servidor' })
  }
})

// ─── GET /api/auth/verify ─────────────────────────────────────────────────────
app.get('/api/auth/verify', requireAuth, (req, res) => {
  res.json({ ok: true, username: req.user.username, role: req.user.role })
})

// ─── GET /api/users (solo admin) ─────────────────────────────────────────────
app.get('/api/users', requireAuth, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Sin permisos' })
  const { rows } = await db.query(
    'SELECT id, username, email, role, active, created_at, last_login FROM users ORDER BY role, username'
  )
  res.json(rows)
})

// ─── PLANTILLAS ───────────────────────────────────────────────────────────────
app.get('/api/templates',    requireAuth, async (req, res) => {
  if (!dbReady) return res.json([])
  const { rows } = await db.query('SELECT id, name, nodes, edges, thumbnail, created_at, updated_at FROM templates WHERE user_id=$1 ORDER BY updated_at DESC', [req.user.id])
  res.json(rows)
})
app.post('/api/templates',   requireAuth, async (req, res) => {
  if (!dbReady) return res.status(503).json({ error: 'DB no disponible en modo local' })
  const { name, nodes, edges } = req.body
  if (!name) return res.status(400).json({ error: 'Nombre requerido' })
  const { rows } = await db.query('INSERT INTO templates(user_id,name,nodes,edges) VALUES($1,$2,$3,$4) RETURNING *', [req.user.id, name, JSON.stringify(nodes||[]), JSON.stringify(edges||[])])
  res.json(rows[0])
})
app.put('/api/templates/:id', requireAuth, async (req, res) => {
  if (!dbReady) return res.status(503).json({ error: 'DB no disponible en modo local' })
  const { name, nodes, edges } = req.body
  const { rows } = await db.query('UPDATE templates SET name=COALESCE($1,name), nodes=COALESCE($2,nodes), edges=COALESCE($3,edges) WHERE id=$4 AND user_id=$5 RETURNING *', [name, nodes?JSON.stringify(nodes):null, edges?JSON.stringify(edges):null, req.params.id, req.user.id])
  if (!rows.length) return res.status(404).json({ error: 'No encontrada' })
  res.json(rows[0])
})
app.delete('/api/templates/:id', requireAuth, async (req, res) => {
  if (!dbReady) return res.json({ ok: true })
  await db.query('DELETE FROM templates WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id])
  res.json({ ok: true })
})

// ─── ESTILOS ──────────────────────────────────────────────────────────────────
app.get('/api/styles',    requireAuth, async (req, res) => {
  if (!dbReady) return res.json([])
  const { rows } = await db.query('SELECT id, name, images, created_at FROM styles WHERE user_id=$1 ORDER BY name', [req.user.id])
  res.json(rows)
})
app.post('/api/styles',   requireAuth, async (req, res) => {
  if (!dbReady) return res.status(503).json({ error: 'DB no disponible en modo local' })
  const { name, images } = req.body
  if (!name) return res.status(400).json({ error: 'Nombre requerido' })
  const { rows } = await db.query('INSERT INTO styles(user_id,name,images) VALUES($1,$2,$3) RETURNING *', [req.user.id, name, JSON.stringify(images||[])])
  res.json(rows[0])
})
app.put('/api/styles/:id', requireAuth, async (req, res) => {
  if (!dbReady) return res.status(503).json({ error: 'DB no disponible en modo local' })
  const { name, images } = req.body
  const { rows } = await db.query('UPDATE styles SET name=COALESCE($1,name), images=COALESCE($2,images) WHERE id=$3 AND user_id=$4 RETURNING *', [name, images?JSON.stringify(images):null, req.params.id, req.user.id])
  if (!rows.length) return res.status(404).json({ error: 'No encontrado' })
  res.json(rows[0])
})
app.delete('/api/styles/:id', requireAuth, async (req, res) => {
  if (!dbReady) return res.json({ ok: true })
  await db.query('DELETE FROM styles WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id])
  res.json({ ok: true })
})

// ─── Mapeo de parámetros por modelo ───────────────────────────────────────────
function buildInput(model, { prompt, aspectRatio, resolution, duration, refImages = [], refAudios = [], extra = {} }) {
  const imgs = refImages.filter(Boolean)
  const auds = refAudios.filter(Boolean)

  if (model === 'flux-2/pro-text-to-image' || model === 'flux-2/flex-text-to-image') {
    return { prompt, aspect_ratio: aspectRatio || '1:1', resolution: resolution || '1K' }
  }
  if (model === 'ideogram/v3-text-to-image') {
    const sizes = { '1:1': 'square_hd', '4:3': 'landscape_4_3', '3:4': 'portrait_4_3', '16:9': 'landscape_16_9', '9:16': 'portrait_16_9' }
    return { prompt, image_size: sizes[aspectRatio] || 'square_hd', rendering_speed: 'BALANCED', expand_prompt: true }
  }
  if (model === 'grok-imagine/text-to-image') return { prompt }
  if (model === 'qwen/text-to-image') {
    const sizes = { '1:1': 'square_hd', '4:3': 'landscape_4_3', '16:9': 'landscape_16_9', '9:16': 'portrait_16_9' }
    return { prompt, image_size: sizes[aspectRatio] || 'square_hd', num_inference_steps: 30 }
  }
  if (model === 'nano-banana-2') {
    return { prompt, aspect_ratio: aspectRatio || '1:1', resolution: resolution || '1K' }
  }
  if (model === 'nano-banana-pro') {
    const input = { prompt, aspect_ratio: aspectRatio || '1:1', resolution: resolution || '1K' }
    if (imgs.length) input.image_input = imgs
    return input
  }

  // ── Videos ──
  if (model === 'kling-2.6/text-to-video') {
    // Si hay imagen de referencia → cambiar a image-to-video
    if (imgs.length) {
      return { prompt, image_urls: imgs.slice(0, 1), sound: false, duration: String(duration || 5) }
    }
    return { prompt, aspect_ratio: aspectRatio || '16:9', duration: Number(duration) || 5, sound: false }
  }
  if (model === 'wan/2-7-text-to-video') {
    return { prompt, ratio: aspectRatio || '16:9', resolution: '1080p', duration: Number(duration) || 5, prompt_extend: true }
  }
  if (model === 'sora-2-text-to-video') {
    const map = { '16:9': 'landscape', '9:16': 'portrait' }
    return { prompt, aspect_ratio: map[aspectRatio] || 'landscape', n_frames: 10 }
  }
  if (model === 'bytedance/seedance-2' || model === 'seedance-2-krea') {
    const input = {
      prompt,
      aspect_ratio: aspectRatio || '16:9',
      duration: Number(duration) || 5,
      web_search: !!(extra?.webSearch),
      generate_audio: !!(extra?.generateAudio),
      nsfw_checker: !!(extra?.nsfwCheck),
    }
    if (extra?.returnLastFrame) input.return_last_frame = true
    if (imgs.length) input.reference_image_urls = imgs
    if (auds.length) input.reference_audio_urls = auds
    return input
  }

  return { prompt }
}

// ─── KIE AI: crear tarea ───────────────────────────────────────────────────────
app.post('/api/generate', async (req, res) => {
  let { model, prompt, aspectRatio, resolution, duration, refImages = [], refAudios = [] } = req.body
  const imgs = refImages.filter(Boolean)

  try {
    // Veo3 — endpoint diferente
    if (['veo3', 'veo3_fast', 'veo3_lite'].includes(model)) {
      const body = {
        prompt,
        model,
        aspect_ratio: aspectRatio || '16:9',
        generationType: 'TEXT_2_VIDEO',
        enableTranslation: true,
      }
      if (imgs.length) {
        body.imageUrls = imgs
        body.generationType = 'REFERENCE_2_VIDEO'
      }
      const r = await fetch(`${KIE_BASE}/veo/generate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${KIE_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await r.json()
      console.log('Veo3 create →', JSON.stringify(json).slice(0, 300))
      // Normalizar respuesta Veo3 al formato esperado
      if (json.code === 200 && json.data?.taskId) {
        return res.json(json)
      } else if (json.data?.taskId) {
        return res.json({ code: 200, data: { taskId: json.data.taskId }, msg: 'Task created' })
      } else if (json.taskId) {
        return res.json({ code: 200, data: { taskId: json.taskId }, msg: 'Task created' })
      }
      return res.json({ code: 500, msg: 'Respuesta inválida de Veo3' })
    }

    // KREA models — usa API de KREA en lugar de KIE
    if (model.includes('-krea')) {
      const KREA_API_KEY = process.env.KREA_API_KEY
      const KREA_BASE = process.env.KREA_BASE || 'https://api.kreaai.com/api/v1'
      if (!KREA_API_KEY) {
        return res.status(400).json({ code: 400, msg: 'KREA_API_KEY no configurada' })
      }

      const input = buildInput(model, {
        prompt, aspectRatio, resolution, duration, refImages, refAudios,
        extra: req.body.extra || {},
      })
      const modelName = model.replace('-krea', '')

      const r = await fetch(`${KREA_BASE}/jobs/createTask`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${KREA_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: modelName, input }),
      })
      const json = await r.json()
      console.log(`KREA (${model}) create →`, JSON.stringify(json))
      // Preponer "krea_" al taskId para identificarlo después en polling
      if (json.data?.taskId) json.data.taskId = `krea_${json.data.taskId}`
      return res.json(json)
    }

    // Kling: cambiar a image-to-video si hay imagen de referencia
    const effectiveModel = (model === 'kling-2.6/text-to-video' && imgs.length)
      ? 'kling-2.6/image-to-video'
      : model

    const input = buildInput(effectiveModel === 'kling-2.6/image-to-video' ? 'kling-2.6/text-to-video' : model, {
      prompt, aspectRatio, resolution, duration, refImages, refAudios,
      extra: req.body.extra || {},
    })

    const r = await fetch(`${KIE_BASE}/jobs/createTask`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${KIE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: effectiveModel, input }),
    })
    const json = await r.json()
    console.log(`KIE (${effectiveModel}) create →`, JSON.stringify(json).slice(0, 300))
    // Normalizar respuesta de KIE al formato esperado
    if (json.code === 200 && json.data?.taskId) {
      return res.json(json)
    } else if (json.data?.taskId) {
      return res.json({ code: 200, data: { taskId: json.data.taskId }, msg: 'Task created' })
    } else if (json.taskId) {
      return res.json({ code: 200, data: { taskId: json.taskId }, msg: 'Task created' })
    }
    res.json({ code: 500, msg: 'Respuesta inválida del servidor' })
  } catch (err) {
    res.status(500).json({ code: 500, msg: err.message })
  }
})

// ─── KIE AI: consultar tarea ──────────────────────────────────────────────────
app.get('/api/task/:taskId', async (req, res) => {
  const { taskId } = req.params
  try {
    // KREA models — polling con API de KREA
    if (taskId.startsWith('krea_')) {
      const KREA_API_KEY = process.env.KREA_API_KEY
      const KREA_BASE = process.env.KREA_BASE || 'https://api.kreaai.com/api/v1'
      if (!KREA_API_KEY) {
        return res.status(400).json({ code: 400, msg: 'KREA_API_KEY no configurada' })
      }

      const realTaskId = taskId.replace('krea_', '')
      const r = await fetch(`${KREA_BASE}/jobs/recordInfo?taskId=${realTaskId}`, {
        headers: { Authorization: `Bearer ${KREA_API_KEY}` },
      })
      const json = await r.json()
      console.log(`KREA poll (${taskId}) →`, JSON.stringify(json).slice(0, 300))
      return res.json(json)
    }

    if (taskId.startsWith('veo')) {
      const r = await fetch(`${KIE_BASE}/veo/record-info?taskId=${taskId}`, {
        headers: { Authorization: `Bearer ${KIE_KEY}` },
      })
      const json = await r.json()
      console.log('Veo3 poll →', JSON.stringify(json).slice(0, 300))
      const d = json.data || {}
      if (d.successFlag === 1) {
        // resultUrls puede ser: string URL, JSON string de array, o array directo
        let urls = []
        try {
          const parsed = JSON.parse(d.resultUrls)
          urls = Array.isArray(parsed) ? parsed : [parsed]
        } catch {
          if (d.resultUrls) urls = [d.resultUrls]
        }
        if (!urls.length && d.resultUrl) urls = [d.resultUrl]
        return res.json({ code: 200, data: { state: 'success', resultJson: JSON.stringify({ resultUrls: urls }) } })
      }
      if (d.successFlag === 2 || d.successFlag === 3) {
        return res.json({ code: 200, data: { state: 'fail', failMsg: d.failMsg || 'Generación fallida' } })
      }
      return res.json({ code: 200, data: { state: 'generating', progress: d.progress || 0 } })
    }

    const r = await fetch(`${KIE_BASE}/jobs/recordInfo?taskId=${taskId}`, {
      headers: { Authorization: `Bearer ${KIE_KEY}` },
    })
    const json = await r.json()
    console.log(`KIE poll (${taskId}) →`, JSON.stringify(json).slice(0, 300))
    // Normalizar respuesta KIE al formato esperado por frontend
    if (json.code === 200) {
      return res.json(json)
    }
    // KIE devuelve state: waiting|generating|success|fail
    const d = json.data || {}
    if (d.state === 'success') {
      return res.json({ code: 200, data: { state: 'success', resultJson: JSON.stringify(d) } })
    }
    if (d.state === 'fail') {
      return res.json({ code: 200, data: { state: 'fail', failMsg: d.failMsg || 'Generación fallida' } })
    }
    return res.json({ code: 200, data: { state: 'generating', progress: d.progress || 0 } })
  } catch (err) {
    res.status(500).json({ code: 500, msg: err.message })
  }
})

// ─── Upload de archivos → KIE AI file storage ─────────────────────────────────
app.post('/api/upload', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No se recibió archivo' })
  console.log(`📁 Upload: ${req.file.originalname} (${(req.file.size/1024).toFixed(1)}KB, ${req.file.mimetype})`)
  try {
    const formData = new FormData()
    const blob = new Blob([req.file.buffer], { type: req.file.mimetype })
    formData.append('file', blob, req.file.originalname)
    formData.append('uploadPath', 'cliender/references')
    const r = await fetch('https://kieai.redpandaai.co/api/file-stream-upload', {
      method: 'POST',
      headers: { Authorization: `Bearer ${KIE_KEY}` },
      body: formData,
    })
    console.log(`📁 KIE response status: ${r.status}`)
    const text = await r.text()
    console.log('📁 KIE response body:', text.slice(0, 300))

    let json
    try {
      json = JSON.parse(text)
    } catch (e) {
      console.error('📁 JSON parse error:', e.message)
      return res.status(500).json({ error: `Respuesta inválida: ${text.slice(0, 100)}` })
    }

    console.log('📁 Upload response:', JSON.stringify(json).slice(0, 200))
    // Normalizar respuesta — exponer fileUrl en data independientemente del formato
    if (json.success && json.data) {
      const url = json.data.fileUrl || json.data.downloadUrl || json.data.url
      res.json({ success: true, data: { ...json.data, fileUrl: url } })
    } else if (json.data?.fileUrl || json.fileUrl) {
      res.json({ success: true, data: { fileUrl: json.data?.fileUrl || json.fileUrl } })
    } else {
      console.error('📁 No fileUrl en respuesta:', json)
      res.json(json)
    }
  } catch (err) {
    console.error('📁 Upload error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ─── Descarga proxy (evita bloqueos CORS) ─────────────────────────────────────
app.get('/api/download', async (req, res) => {
  const { url, filename } = req.query
  if (!url) return res.status(400).json({ error: 'url requerida' })
  try {
    const r = await fetch(decodeURIComponent(url))
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    const contentType = r.headers.get('content-type') || 'application/octet-stream'
    res.setHeader('Content-Type', contentType)
    res.setHeader('Content-Disposition', `attachment; filename="${filename || 'cliender-download'}"`)
    const buffer = await r.arrayBuffer()
    res.send(Buffer.from(buffer))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── Terminal PTY por socket ───────────────────────────────────────────────────
io.on('connection', (socket) => {
  let shell = null
  for (const s of [process.env.SHELL, '/bin/zsh', '/bin/bash'].filter(Boolean)) {
    try {
      shell = pty.spawn(s, [], {
        name: 'xterm-256color',
        cols: 80, rows: 24,
        cwd: process.env.HOME || '/tmp',
        env: { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor' },
      })
      console.log(`✅ Terminal → ${s}`)
      break
    } catch (e) { console.error(`⚠️  ${s}: ${e.message}`) }
  }

  if (!shell) {
    socket.emit('terminal:data', '\r\n\x1b[31m[Error: no se pudo iniciar la terminal]\x1b[0m\r\n')
    return
  }

  shell.onData((data) => socket.emit('terminal:data', data))
  shell.onExit(() => socket.emit('terminal:data', '\r\n\x1b[33m[proceso terminado]\x1b[0m\r\n'))
  socket.on('terminal:input', (data) => shell.write(data))
  socket.on('terminal:resize', ({ cols, rows }) => { try { shell.resize(cols, rows) } catch (_) {} })
  socket.on('disconnect', () => { try { shell.kill() } catch (_) {} })
})

// ─── File-based workflow trigger (/tmp/cliender-workflow.json) ────────────────
const WF_FILE = join(tmpdir(), 'cliender-workflow.json')
if (!existsSync(WF_FILE)) { try { writeFileSync(WF_FILE, '{}') } catch {} }

watchFile(WF_FILE, { interval: 400 }, () => {
  try {
    const raw = readFileSync(WF_FILE, 'utf8').trim()
    if (!raw || raw === '{}') return
    const data = JSON.parse(raw)
    if (!Array.isArray(data.prompts) || !data.prompts.length) return
    io.emit('workflow:fromFile', data)
    writeFileSync(WF_FILE, '{}')
    console.log(`⚡ Workflow file trigger: ${data.prompts.length} prompts`)
  } catch (e) { console.error('Workflow parse error:', e.message) }
})

httpServer.listen(3001, () => {
  console.log('🚀 Cliender OS Server → http://localhost:3001')
  console.log(`🔑 KIE AI: ${KIE_KEY ? '✅ API key configurada' : '❌ falta KIE_API_KEY en .env'}`)
  console.log(`⚡ Workflow file: ${WF_FILE}`)
})
