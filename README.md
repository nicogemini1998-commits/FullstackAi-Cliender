# 🎨 Cliender OS — Canvas Infinito de Agentes

Prototipo funcional de un **lienzo infinito** para orquestar agentes de IA y herramientas multimedia, inspirado en **Freepik Spaces** y **ComfyUI**.

## 🚀 Quick Start

```bash
# El servidor ya está ejecutándose en:
http://localhost:5174

# Si necesitas reiniciar:
npm run dev
```

## 📦 Stack Tecnológico

- **React 19** + **Vite 8** — Frontend rápido y moderno
- **@xyflow/react** — Canvas infinito con nodos y conexiones
- **xterm.js** — Terminal embebida en nodos
- **socket.io-client** — Comunicación real-time (listo para backend)
- **Tailwind CSS** — Estilos oscuros y modernos
- **lucide-react** — Iconos vectoriales

## 🎯 Componentes Funcionales

### Terminal Node 🖥️
- Terminal completa embebida con tema verde
- Texto simulado con efecto de escritura
- Socket.io conectado a `localhost:3001`
- Redimensionable y arrastrables
- Zoom automático al redimensionar

### Image Node 🖼️
- Selector de modelo IA (Flux.1, SDXL, Kandinsky)
- Selector de resolución (2K, 4K)
- Textarea para prompts
- Simulación de generación (2s)
- Preview con imagen placeholder

### Video Node 🎬
- Selector de modelo IA (Gen-3, Kling, Sora-mock)
- Selector de duración (5s, 10s)
- Textarea para prompts
- Simulación de generación (3s)
- Preview con ícono de video

## 🎮 Cómo Usar

1. **Abre el navegador:** `http://localhost:5174`
2. **Añade nodos:** Usa el toolbar centrado arriba (Terminal, Imagen, Video)
3. **Interactúa:**
   - Arrastra nodos por el canvas
   - Redimensiona desde las esquinas
   - Conecta nodos arrastrando los handles (puntos laterales)
   - Cierra nodos con el botón X
4. **Canvas:**
   - Scroll para zoom
   - Arrastra con middle-mouse o espacio para paneo
   - Mira la MiniMap en la esquina inferior izquierda

## 📁 Estructura de Archivos

```
FullStackAI/
├── src/
│   ├── App.jsx              ← Componente principal (TODO)
│   ├── main.jsx             ← Entry point con imports CSS
│   └── index.css            ← Tailwind + overrides
├── tailwind.config.js       ← Configuración Tailwind
├── vite.config.js           ← Configuración Vite
├── package.json             ← Dependencias
└── README.md                ← Este archivo
```

## ⚙️ Instalación (ya completada)

```bash
npm install
npm run dev
```

## 🔗 Próximos Pasos

Para **conectar un backend real**:

1. Crea un servidor socket.io en `localhost:3001`
2. Emite eventos `agent:output`:
   ```javascript
   socket.emit('agent:output', { text: 'Tu mensaje aquí' })
   ```
3. El terminal recibirá y mostrará automáticamente los mensajes

## 🛠️ Scripts Disponibles

```bash
npm run dev      # Iniciar servidor de desarrollo
npm run build    # Compilar para producción
npm run preview  # Ver build de producción
```

## 📝 Notas Técnicas

- **xterm + FitAddon**: Implementado con `requestAnimationFrame` para sincronización correcta
- **nodeTypes**: Declarado fuera del componente App para evitar re-registro
- **Socket.io**: `autoConnect: false` para desarrollo sin backend
- **Tailwind v3**: Usar versión 3.4.17 (no v4, que cambió completamente)

## 🎨 Estética

- Fondo oscuro: `bg-gray-950`
- Nodos: `rounded-xl bg-gray-900/80 backdrop-blur-sm border border-gray-700`
- Botones azules: Image Node
- Botones púrpura: Video Node
- Grid de puntos para orientación

## 💡 Tips

- Los nodos se crean en posiciones **aleatorias** para evitar solapamiento
- Los headers incluyen **iconos de lucide-react** para mejor UX
- Los formularios tienen **validación visual** en hover
- Las **conexiones** son completamente funcionales y persistentes durante la sesión

---

**Construido con ❤️ por Nicolas + Claude Haiku**
