import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import 'xterm/css/xterm.css'
import '@xyflow/react/dist/style.css'
import App from './App.jsx'

// StrictMode removed — causes double-mount which creates duplicate Claude sessions
createRoot(document.getElementById('root')).render(<App />)
