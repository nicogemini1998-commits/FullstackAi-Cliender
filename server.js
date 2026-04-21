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

const KIE_KEY       = process.env.KIE_API_KEY
const KIE_BASE      = 'https://api.kie.ai/api/v1'
const JWT_SECRET    = process.env.JWT_SECRET || 'fullstackai_secret_key'
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY
const FREEPIK_KEY   = process.env.FREEPIK_API_KEY
const FREEPIK_BASE  = process.env.FREEPIK_BASE || 'https://api.freepik.com/v1'

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
  .then(async () => {
    dbReady = true
    console.log('🗄️  PostgreSQL conectado')
    await initSchema()
  })
  .catch(e => console.error('⚠️  PostgreSQL no disponible (modo local sin DB):', e.message))

async function initSchema() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS agents (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      system_prompt TEXT NOT NULL,
      model TEXT DEFAULT 'claude-haiku-4-5-20251001',
      max_tokens INTEGER DEFAULT 2000,
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS user_canvas (
      user_id TEXT PRIMARY KEY,
      nodes JSONB DEFAULT '[]',
      edges JSONB DEFAULT '[]',
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `)
  // Agente /shaq por defecto si no existe
  const { rowCount } = await db.query("SELECT 1 FROM agents WHERE name='/shaq' LIMIT 1")
  if (!rowCount) {
    await db.query(`
      INSERT INTO agents (name, description, system_prompt, model, max_tokens)
      VALUES ($1, $2, $3, $4, $5)
    `, [
      '/shaq',
      'Agente creativo UGC — crea campañas de imagen y video automáticamente',
      `Eres /shaq, un agente creativo especializado en campañas visuales UGC y marketing de producto.
Cuando el usuario pide crear imágenes o videos, SIEMPRE responde con JSON válido en este formato exacto:
{"reply": "tu explicación al usuario", "actions": [...]}

Acciones disponibles:
- Imagen: {"type":"create_image","prompt":"...","model":"nano-banana-pro","qty":5,"ar":"9:16"}
- Video:  {"type":"create_video","prompt":"...","model":"kling-2.6/text-to-video","ar":"16:9","duration":5}

Modelos de imagen: nano-banana-pro, nano-banana-2, flux-2/pro-text-to-image, ideogram/v3-text-to-image
Modelos de video:  kling-2.6/text-to-video, wan/2-7-text-to-video, sora-2-text-to-video
Aspect ratios imagen: 1:1, 4:5, 9:16, 16:9, 4:3, 3:2
Aspect ratios video:  16:9, 9:16, 1:1

Si el usuario NO pide crear contenido, responde con: {"reply":"tu respuesta","actions":[]}

Especialidades:
- Campañas UGC (User Generated Content)
- Ángulos de producto variados
- Prompts para contenido viral en redes sociales
- Adaptación de estilo por plataforma (TikTok, Instagram, YouTube)

IMPORTANTE: Cuando el usuario pida N imágenes de un producto, distribuye en varias acciones de 5-10 imágenes c/u con prompts variados (ángulos, escenarios, estilos distintos).`,
      'claude-haiku-4-5-20251001',
      3000
    ])
    console.log('🤖 Agente /shaq creado por defecto')
  }
}

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
// ─── PLANTILLAS ───────────────────────────────────────────────────────────────
// GET: propias + globales (admin). Incluye flag is_global + can_edit
app.get('/api/templates', requireAuth, async (req, res) => {
  if (!dbReady) return res.json([])
  const isAdmin = req.user.role === 'admin'
  // Globales (creadas por admins) + propias
  const { rows } = await db.query(`
    SELECT id, name, nodes, edges, thumbnail, created_at, updated_at,
           is_global, user_id,
           (user_id = $1 OR (is_global AND $2)) AS can_edit
    FROM templates
    WHERE user_id = $1 OR is_global = true
    ORDER BY is_global DESC, updated_at DESC
  `, [req.user.id, isAdmin])
  res.json(rows)
})

// POST: cualquier usuario crea la suya. Admin puede marcarla global
app.post('/api/templates', requireAuth, async (req, res) => {
  if (!dbReady) return res.status(503).json({ error: 'DB no disponible' })
  const { name, nodes, edges, is_global } = req.body
  if (!name) return res.status(400).json({ error: 'Nombre requerido' })
  const global = req.user.role === 'admin' ? !!is_global : false
  const { rows } = await db.query(
    'INSERT INTO templates(user_id,name,nodes,edges,is_global) VALUES($1,$2,$3,$4,$5) RETURNING *',
    [req.user.id, name, JSON.stringify(nodes||[]), JSON.stringify(edges||[]), global]
  )
  res.json(rows[0])
})

// PUT: solo propias. Admin puede editar sus globales también
app.put('/api/templates/:id', requireAuth, async (req, res) => {
  if (!dbReady) return res.status(503).json({ error: 'DB no disponible' })
  const { name, nodes, edges } = req.body
  const isAdmin = req.user.role === 'admin'
  // Admin edita sus propias. Usuario solo las suyas (no globales)
  const { rows } = await db.query(`
    UPDATE templates SET
      name  = COALESCE($1, name),
      nodes = COALESCE($2, nodes),
      edges = COALESCE($3, edges)
    WHERE id = $4
      AND user_id = $5
      AND (is_global = false OR $6)
    RETURNING *
  `, [name, nodes?JSON.stringify(nodes):null, edges?JSON.stringify(edges):null, req.params.id, req.user.id, isAdmin])
  if (!rows.length) return res.status(403).json({ error: 'Sin permisos o no encontrada' })
  res.json(rows[0])
})

// DELETE: solo propias. Admin puede borrar sus globales
app.delete('/api/templates/:id', requireAuth, async (req, res) => {
  if (!dbReady) return res.json({ ok: true })
  const isAdmin = req.user.role === 'admin'
  const { rowCount } = await db.query(
    'DELETE FROM templates WHERE id=$1 AND user_id=$2 AND (is_global=false OR $3)',
    [req.params.id, req.user.id, isAdmin]
  )
  if (!rowCount) return res.status(403).json({ error: 'Sin permisos' })
  res.json({ ok: true })
})

// ─── ESTILOS ──────────────────────────────────────────────────────────────────
app.get('/api/styles', requireAuth, async (req, res) => {
  if (!dbReady) return res.json([])
  const isAdmin = req.user.role === 'admin'
  const { rows } = await db.query(`
    SELECT id, name, images, created_at, is_global, user_id,
           (user_id = $1 OR (is_global AND $2)) AS can_edit
    FROM styles
    WHERE user_id = $1 OR is_global = true
    ORDER BY is_global DESC, name ASC
  `, [req.user.id, isAdmin])
  res.json(rows)
})

app.post('/api/styles', requireAuth, async (req, res) => {
  if (!dbReady) return res.status(503).json({ error: 'DB no disponible' })
  const { name, images, is_global } = req.body
  if (!name) return res.status(400).json({ error: 'Nombre requerido' })
  const global = req.user.role === 'admin' ? !!is_global : false
  const { rows } = await db.query(
    'INSERT INTO styles(user_id,name,images,is_global) VALUES($1,$2,$3,$4) RETURNING *',
    [req.user.id, name, JSON.stringify(images||[]), global]
  )
  res.json(rows[0])
})

app.put('/api/styles/:id', requireAuth, async (req, res) => {
  if (!dbReady) return res.status(503).json({ error: 'DB no disponible' })
  const { name, images } = req.body
  const isAdmin = req.user.role === 'admin'
  const { rows } = await db.query(`
    UPDATE styles SET
      name   = COALESCE($1, name),
      images = COALESCE($2, images)
    WHERE id = $3
      AND user_id = $4
      AND (is_global = false OR $5)
    RETURNING *
  `, [name, images?JSON.stringify(images):null, req.params.id, req.user.id, isAdmin])
  if (!rows.length) return res.status(403).json({ error: 'Sin permisos o no encontrado' })
  res.json(rows[0])
})

app.delete('/api/styles/:id', requireAuth, async (req, res) => {
  if (!dbReady) return res.json({ ok: true })
  const isAdmin = req.user.role === 'admin'
  const { rowCount } = await db.query(
    'DELETE FROM styles WHERE id=$1 AND user_id=$2 AND (is_global=false OR $3)',
    [req.params.id, req.user.id, isAdmin]
  )
  if (!rowCount) return res.status(403).json({ error: 'Sin permisos' })
  res.json({ ok: true })
})

// ─── AGENTES ──────────────────────────────────────────────────────────────────
// GET: lista agentes activos (todos los usuarios autenticados)
app.get('/api/agents', requireAuth, async (req, res) => {
  if (!dbReady) return res.json([])
  const { rows } = await db.query(
    'SELECT id, name, description, model, max_tokens, is_active FROM agents WHERE is_active=true ORDER BY name'
  )
  res.json(rows)
})

// POST: crear agente (solo admin)
app.post('/api/agents', requireAuth, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Solo admins pueden crear agentes' })
  if (!dbReady) return res.status(503).json({ error: 'DB no disponible' })
  const { name, description, system_prompt, model, max_tokens } = req.body
  if (!name || !system_prompt) return res.status(400).json({ error: 'name y system_prompt requeridos' })
  const { rows } = await db.query(
    'INSERT INTO agents(name,description,system_prompt,model,max_tokens) VALUES($1,$2,$3,$4,$5) RETURNING *',
    [name, description||'', system_prompt, model||'claude-haiku-4-5-20251001', max_tokens||2000]
  )
  res.json(rows[0])
})

// PUT: editar agente (solo admin)
app.put('/api/agents/:id', requireAuth, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Solo admins' })
  if (!dbReady) return res.status(503).json({ error: 'DB no disponible' })
  const { name, description, system_prompt, model, max_tokens, is_active } = req.body
  const { rows } = await db.query(`
    UPDATE agents SET
      name=COALESCE($1,name), description=COALESCE($2,description),
      system_prompt=COALESCE($3,system_prompt), model=COALESCE($4,model),
      max_tokens=COALESCE($5,max_tokens), is_active=COALESCE($6,is_active)
    WHERE id=$7 RETURNING *`,
    [name,description,system_prompt,model,max_tokens,is_active,req.params.id]
  )
  if (!rows.length) return res.status(404).json({ error: 'No encontrado' })
  res.json(rows[0])
})

// DELETE: borrar agente (solo admin)
app.delete('/api/agents/:id', requireAuth, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Solo admins' })
  if (!dbReady) return res.json({ ok: true })
  await db.query('DELETE FROM agents WHERE id=$1', [req.params.id])
  res.json({ ok: true })
})

// POST /api/agent/run — ejecutar agente con mensaje del usuario
app.post('/api/agent/run', requireAuth, async (req, res) => {
  const { agentId, message, history = [] } = req.body
  if (!message) return res.status(400).json({ error: 'message requerido' })
  if (!ANTHROPIC_KEY) return res.status(503).json({ error: 'ANTHROPIC_API_KEY no configurada' })

  let agent = null
  if (dbReady && agentId) {
    const { rows } = await db.query('SELECT * FROM agents WHERE id=$1 AND is_active=true', [agentId])
    agent = rows[0] || null
  }

  const systemPrompt = agent?.system_prompt ||
    'Eres un asistente creativo. Responde siempre en JSON: {"reply":"...","actions":[]}'

  const model  = agent?.model     || 'claude-haiku-4-5-20251001'
  const tokens = agent?.max_tokens || 2000

  // Construir historial de mensajes para Claude
  const messages = [
    ...history.slice(-10).map(h => ({ role: h.role, content: h.content })),
    { role: 'user', content: message }
  ]

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key':         ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'content-type':      'application/json',
      },
      body: JSON.stringify({ model, max_tokens: tokens, system: systemPrompt, messages }),
    })
    const data = await r.json()
    if (!r.ok) return res.status(500).json({ error: data.error?.message || 'Error Claude API' })

    const rawText = data.content?.[0]?.text || ''

    // Intentar parsear JSON si el agente lo devuelve
    let reply = rawText
    let actions = []
    try {
      const jsonStart = rawText.indexOf('{')
      const jsonEnd   = rawText.lastIndexOf('}')
      if (jsonStart !== -1 && jsonEnd !== -1) {
        const parsed = JSON.parse(rawText.slice(jsonStart, jsonEnd + 1))
        reply   = parsed.reply   || rawText
        actions = parsed.actions || []
      }
    } catch { /* respuesta de texto plano — ok */ }

    res.json({ reply, actions, model, agentName: agent?.name || 'Asistente' })
  } catch (err) {
    console.error('Agent run error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ─── CANVAS — auto-save/load por usuario ─────────────────────────────────────
app.get('/api/canvas', requireAuth, async (req, res) => {
  if (!dbReady) return res.json({ nodes: [], edges: [] })
  const { rows } = await db.query('SELECT nodes, edges FROM user_canvas WHERE user_id=$1', [req.user.id])
  if (!rows.length) return res.json({ nodes: [], edges: [] })
  res.json({ nodes: rows[0].nodes, edges: rows[0].edges })
})

app.post('/api/canvas', requireAuth, async (req, res) => {
  if (!dbReady) return res.json({ ok: true })
  const { nodes, edges } = req.body
  await db.query(`
    INSERT INTO user_canvas(user_id, nodes, edges, updated_at)
    VALUES($1,$2,$3,NOW())
    ON CONFLICT(user_id) DO UPDATE SET nodes=$2, edges=$3, updated_at=NOW()
  `, [req.user.id, JSON.stringify(nodes||[]), JSON.stringify(edges||[])])
  res.json({ ok: true })
})

// ─── Freepik API — generación de imágenes ────────────────────────────────────
app.post('/api/freepik/generate', requireAuth, async (req, res) => {
  if (!FREEPIK_KEY) return res.status(503).json({ error: 'FREEPIK_API_KEY no configurada' })
  const { prompt, model = 'flux-schnell', aspect_ratio = '1:1', num_images = 1, style } = req.body
  if (!prompt) return res.status(400).json({ error: 'prompt requerido' })

  const body = { prompt, num_images, image: { size: aspect_ratio } }
  if (style) body.styling = { style }

  const endpoint = model.includes('mystic') ? '/ai/mystic' : '/ai/text-to-image'
  try {
    const r = await fetch(`${FREEPIK_BASE}${endpoint}`, {
      method: 'POST',
      headers: { 'x-freepik-api-key': FREEPIK_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await r.json()
    if (!r.ok) return res.status(r.status).json({ error: data.message || 'Error Freepik' })
    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/freepik/task/:taskId — polling estado Freepik
app.get('/api/freepik/task/:taskId', requireAuth, async (req, res) => {
  if (!FREEPIK_KEY) return res.status(503).json({ error: 'FREEPIK_API_KEY no configurada' })
  try {
    const r = await fetch(`${FREEPIK_BASE}/ai/mystic/${req.params.taskId}`, {
      headers: { 'x-freepik-api-key': FREEPIK_KEY },
    })
    const data = await r.json()
    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── Mapeo de parámetros por modelo ───────────────────────────────────────────
function buildInput(model, { prompt, aspectRatio, resolution, duration, refImages = [], refVideos = [], refAudios = [], extra = {} }) {
  const imgs = refImages.filter(Boolean)
  const vids = refVideos.filter(Boolean)
  const auds = refAudios.filter(Boolean)

  // ── Imágenes ──────────────────────────────────────────────────────────────

  if (model === 'flux-2/pro-text-to-image' || model === 'flux-2/flex-text-to-image') {
    const input = { prompt, aspect_ratio: aspectRatio || '1:1', resolution: resolution || '1K' }
    if (imgs.length) input.image_url = imgs[0]          // Flux: imagen de referencia única
    return input
  }

  if (model === 'ideogram/v3-text-to-image') {
    const sizes = { '1:1': 'square_hd', '4:3': 'landscape_4_3', '3:4': 'portrait_4_3', '16:9': 'landscape_16_9', '9:16': 'portrait_16_9' }
    const input = { prompt, image_size: sizes[aspectRatio] || 'square_hd', rendering_speed: 'BALANCED', expand_prompt: true }
    if (imgs.length) input.image_url = imgs[0]          // Ideogram: imagen de referencia
    return input
  }

  if (model === 'grok-imagine/text-to-image') {
    const input = { prompt }
    if (imgs.length) input.image_url = imgs[0]          // Grok: imagen de referencia
    return input
  }

  if (model === 'qwen/text-to-image') {
    const sizes = { '1:1': 'square_hd', '4:3': 'landscape_4_3', '16:9': 'landscape_16_9', '9:16': 'portrait_16_9' }
    const input = { prompt, image_size: sizes[aspectRatio] || 'square_hd', num_inference_steps: 30 }
    if (imgs.length) input.image_url = imgs[0]          // Qwen: imagen de referencia
    return input
  }

  if (model === 'nano-banana-2') {
    const input = { prompt, aspect_ratio: aspectRatio || '1:1', resolution: resolution || '1K' }
    if (imgs.length) input.image_url = imgs[0]          // Nano Banana 2: imagen de referencia
    return input
  }

  if (model === 'nano-banana-pro') {
    const input = { prompt, aspect_ratio: aspectRatio || '1:1', resolution: resolution || '1K' }
    if (imgs.length) input.image_input = imgs           // Nano Banana Pro: múltiples imágenes
    return input
  }

  // ── Videos ────────────────────────────────────────────────────────────────

  if (model === 'kling-2.6/text-to-video') {
    if (imgs.length) {
      // i2v mode: imagen → video
      return { prompt, image_urls: imgs.slice(0, 1), sound: false, duration: String(duration || 5) }
    }
    return { prompt, aspect_ratio: aspectRatio || '16:9', duration: Number(duration) || 5, sound: false }
  }

  if (model === 'wan/2-7-text-to-video') {
    const input = { prompt, ratio: aspectRatio || '16:9', resolution: '1080p', duration: Number(duration) || 5, prompt_extend: true }
    if (imgs.length) input.image_url = imgs[0]          // WAN: primer fotograma de referencia
    if (vids.length) input.video_url = vids[0]          // WAN: vídeo de referencia
    return input
  }

  if (model === 'sora-2-text-to-video') {
    const map = { '16:9': 'landscape', '9:16': 'portrait' }
    const input = { prompt, aspect_ratio: map[aspectRatio] || 'landscape', n_frames: 10 }
    if (imgs.length) input.image_url = imgs[0]          // Sora-2: imagen de referencia
    return input
  }

  if (model === 'bytedance/seedance-2' || model === 'seedance-2-krea') {
    const input = {
      prompt,
      aspect_ratio: aspectRatio || '16:9',
      duration: Number(duration) || 5,
      web_search: !!(extra?.webSearch),
      nsfw_checker: !!(extra?.nsfwCheck),
    }
    if (extra?.returnLastFrame) input.return_last_frame = true

    const hasVisual = imgs.length || vids.length  // imagen o vídeo
    if (hasVisual) {
      // i2v mode — requiere imagen o vídeo. Audio opcional.
      if (imgs.length) input.reference_image_urls = imgs
      if (vids.length) input.reference_video_urls = vids
      if (auds.length) {
        input.reference_audio_urls = auds
        input.generate_audio = false
      } else {
        input.generate_audio = true   // KIE genera audio automáticamente
      }
    } else {
      // Solo texto (o audio solo — KIE no acepta audio sin visual)
      // Audio sin imagen/vídeo → ignorar audio, solo text-to-video
      input.generate_audio = !!(extra?.generateAudio)
    }
    return input
  }

  // Fallback genérico — pasa refs si las hay
  const fallback = { prompt }
  if (imgs.length) fallback.image_url = imgs[0]
  if (vids.length) fallback.video_url = vids[0]
  if (auds.length) fallback.audio_url = auds[0]
  return fallback
}

// ─── KIE AI: crear tarea ───────────────────────────────────────────────────────
app.post('/api/generate', async (req, res) => {
  let { model, prompt, aspectRatio, resolution, duration, refImages = [], refVideos = [], refAudios = [] } = req.body
  const imgs  = refImages.filter(Boolean)
  const vids  = refVideos.filter(Boolean)
  const auds  = refAudios.filter(Boolean)
  console.log(`🎬 generate → model:${model} imgs:${imgs.length} vids:${vids.length} auds:${auds.length}`)
  if (imgs.length) console.log(`   imgURLs: ${JSON.stringify(imgs)}`)
  if (vids.length) console.log(`   vidURLs: ${JSON.stringify(vids)}`)
  if (auds.length) console.log(`   audURLs: ${JSON.stringify(auds)}`)

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
      if (json.code !== 200 && !json.data?.taskId && !json.taskId) {
        return res.json({ code: json.code || 422, msg: json.msg || 'Error en Veo3' })
      }
      if (json.code === 200 && json.data?.taskId) return res.json(json)
      if (json.data?.taskId) return res.json({ code: 200, data: { taskId: json.data.taskId }, msg: 'Task created' })
      if (json.taskId)       return res.json({ code: 200, data: { taskId: json.taskId }, msg: 'Task created' })
      return res.json({ code: 422, msg: json.msg || 'Sin taskId en respuesta Veo3' })
    }

    // KREA models — usa API de KREA en lugar de KIE
    if (model.includes('-krea')) {
      const KREA_API_KEY = process.env.KREA_API_KEY
      const KREA_BASE = process.env.KREA_BASE || 'https://api.kreaai.com/api/v1'
      if (!KREA_API_KEY) {
        return res.status(400).json({ code: 400, msg: 'KREA_API_KEY no configurada' })
      }

      const input = buildInput(model, {
        prompt, aspectRatio, resolution, duration, refImages, refVideos, refAudios,
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
      prompt, aspectRatio, resolution, duration, refImages, refVideos, refAudios,
      extra: req.body.extra || {},
    })

    const r = await fetch(`${KIE_BASE}/jobs/createTask`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${KIE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: effectiveModel, input }),
    })
    const json = await r.json()
    console.log(`KIE (${effectiveModel}) create →`, JSON.stringify(json).slice(0, 300))
    // Si KIE devuelve error, pasarlo directamente al frontend
    if (json.code !== 200 && !json.data?.taskId && !json.taskId) {
      return res.json({ code: json.code || 422, msg: json.msg || 'Error en KIE AI' })
    }
    if (json.code === 200 && json.data?.taskId) return res.json(json)
    if (json.data?.taskId) return res.json({ code: 200, data: { taskId: json.data.taskId }, msg: 'Task created' })
    if (json.taskId)       return res.json({ code: 200, data: { taskId: json.taskId }, msg: 'Task created' })
    res.json({ code: 422, msg: json.msg || 'Sin taskId en respuesta' })
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
