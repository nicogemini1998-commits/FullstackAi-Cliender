#!/usr/bin/env node
/**
 * FullStackAI — Setup del servidor local (una sola vez)
 * Compatible con macOS, Windows y Linux.
 * Usa pm2 para arrancar automáticamente con el ordenador.
 */

import { execSync, spawn } from 'child_process'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { existsSync } from 'fs'
import os from 'os'

const DIR = dirname(dirname(fileURLToPath(import.meta.url)))
const platform = os.platform()

const run = cmd => {
  try { return execSync(cmd, { stdio: 'inherit', cwd: DIR }) }
  catch { return null }
}

const check = cmd => {
  try { execSync(cmd, { stdio: 'pipe' }); return true }
  catch { return false }
}

console.log('\n🚀 FullStackAI — Instalando servidor local\n')
console.log(`   Sistema: ${platform} (${os.arch()})`)
console.log(`   Proyecto: ${DIR}\n`)

// 1. Verificar / instalar pm2
if (!check('pm2 --version')) {
  console.log('📦 Instalando pm2 globalmente...')
  run('npm install -g pm2')
}

// 2. Arrancar el servidor con pm2
console.log('⚡ Arrancando servidor...')
run(`pm2 delete fullstackai-server 2>/dev/null || true`)
run(`pm2 start server.js --name fullstackai-server --cwd "${DIR}"`)

// 3. Configurar autostart según plataforma
console.log('\n🔧 Configurando inicio automático...')

if (platform === 'win32') {
  // Windows: Task Scheduler via pm2
  console.log('   Windows detectado — usando pm2-windows-startup...')
  run('npm install -g pm2-windows-startup')
  run('pm2-startup install')
} else {
  // macOS / Linux: pm2 startup
  const startupResult = execSync('pm2 startup', { cwd: DIR, encoding: 'utf8' })
  // pm2 startup imprime el comando sudo que hay que ejecutar
  const match = startupResult.match(/sudo\s+env[^\n]+/)
  if (match) {
    console.log('\n⚠️  Ejecuta este comando para finalizar (copia y pega):')
    console.log('\n   \x1b[36m' + match[0] + '\x1b[0m\n')
    console.log('   Luego vuelve y el servidor arrancará automáticamente.')
  }
}

run('pm2 save')

// 4. Verificar que está corriendo
setTimeout(() => {
  const running = check('curl -s http://localhost:3001/socket.io/?EIO=4&transport=polling')
  if (running) {
    console.log('\n✅ Servidor activo en localhost:3001')
    console.log('   La terminal del canvas ya funciona.')
    console.log('   Desde ahora arrancará sola al encender el ordenador.\n')
  } else {
    console.log('\n✅ Servidor instalado. Puede tardar unos segundos en estar listo.')
    console.log('   Abre el nodo Terminal en el canvas.\n')
  }
}, 2000)
