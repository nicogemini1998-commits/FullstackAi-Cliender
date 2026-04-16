# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the project

This project requires **two processes running simultaneously** — both must be active for the app to work:

```bash
# Terminal 1 — Backend (Express + socket.io + KIE AI proxy)
npm run server        # node server.js → listens on :3001

# Terminal 2 — Frontend (Vite dev server)
npm run dev           # → http://localhost:5173 (port may increment if busy)
```

```bash
npm run build         # Production build
npm run lint          # ESLint
```

After `npm install`, if the terminal PTY fails on macOS (Node 24+), run:
```bash
npm rebuild node-pty-prebuilt-multiarch
```

## Architecture

**Single-file frontend, dual-process system.**

```
src/App.jsx       — Entire UI: all node components, design system, canvas logic
src/index.css     — Global styles: Liquid Glass CSS classes, edge/handle animations
src/main.jsx      — Entry point, global CSS imports
server.js         — Express backend: KIE AI proxy, file upload, download proxy, PTY terminal
.env              — KIE_API_KEY (never commit)
```

### Frontend (`src/App.jsx`)

All components live in one file. Key sections in order:

1. **Constants** — `SERVER`, `SPRING` easing, `C` color tokens, `QTY` quantities, `IMAGE_MODELS`, `VIDEO_MODELS`
2. **Hooks** — `useUpload` (KIE file upload), `usePoll` (task polling loop)
3. **UI primitives** — `Seg` (segmented control), `DropZone` (file upload area), `Tog` (toggle), `Rule` (section divider), `Shell` (Double-Bezel node wrapper), `Head` (node header), `GenBtn` (liquid glass generate button)
4. **Node components** — `TerminalNode`, `ImageNode`, `ResultImageNode`, `VideoNode`
5. **`nodeTypes`** — declared outside `App` component to prevent re-registration on each render (ReactFlow requirement)
6. **`App`** — canvas state, `addNode`, `deleteNode`, floating toolbar

### Canvas system (`@xyflow/react` v12)

- Each node has `style: { width, height }` on creation — required by @xyflow/react v12 for explicit sizing
- Custom nodes use `position: relative; width: 100%; height: 100%` as their root div
- `nowheel nopan nodrag` CSS classes on scrollable content inside nodes — prevents ReactFlow from capturing those events
- `useReactFlow()` is available inside node components; `ImageNode` uses `getNode(id)` + `addNodes()` to place `ResultImageNode`s to the right of the parent

### ResultImageNode flow

When `ImageNode` generates qty > 1 images, it calls `useReactFlow().addNodes()` directly to create `ResultImageNode` instances positioned in a grid (4 columns, 200×200px, 16px gap) starting at `parentX + parentWidth + 40`.

### Backend (`server.js`)

All routes are in a single file. Key logic:

- **`POST /api/generate`** — routes to KIE AI. Veo3 uses a separate endpoint (`/veo/generate`); all other models use `/jobs/createTask`. Kling auto-switches to `kling-2.6/image-to-video` when `refImages` is present.
- **`GET /api/task/:taskId`** — polling. TaskIDs starting with `veo` are routed to `/veo/record-info` (uses `successFlag: 0|1|2|3`); all others use `/jobs/recordInfo` (uses `state: waiting|generating|success|fail`).
- **`POST /api/upload`** — proxies multipart file upload to `https://kieai.redpandaai.co/api/file-stream-upload`
- **`GET /api/download`** — download proxy to avoid CORS on KIE AI CDN URLs
- **Socket.io** — each `connection` event spawns a new PTY process (zsh → bash fallback); process is killed on `disconnect`

### KIE AI API patterns

- **Standard models**: `POST https://api.kie.ai/api/v1/jobs/createTask` → `{ taskId }` → poll `GET /jobs/recordInfo?taskId=`
- **Veo3**: `POST /veo/generate` → `{ taskId: "veo_task_..." }` → poll `GET /veo/record-info?taskId=`
- **File upload**: `POST https://kieai.redpandaai.co/api/file-stream-upload` → returns `{ data.fileUrl }`
- `buildInput(model, params)` in server.js handles model-specific parameter mapping (each model has different field names for aspect ratio, duration, etc.)

### Design system

CSS classes in `src/index.css`:
- `.glass-btn` + `.glass-btn-violet` / `.glass-btn-blue` / `.glass-btn-neutral` — Liquid Glass button effect with `backdrop-filter: blur(24px) saturate(1.8)`, specular `::before`, rim `::after`
- `Shell` component in App.jsx implements the Double-Bezel node architecture (outer gradient ring + inner `rgba(5,5,10,0.96)` core)
- `SPRING = 'cubic-bezier(0.32,0.72,0,1)'` — all transitions use this easing

### Adding a new model

1. Add entry to `IMAGE_MODELS` or `VIDEO_MODELS` in `App.jsx` with `id`, `label`, `ar` (aspect ratios), `res`/`dur`
2. Add `buildInput` branch in `server.js` mapping the model's specific parameter names
3. If the model uses a non-standard KIE AI endpoint, add routing logic in `POST /api/generate` and `GET /api/task/:taskId`
