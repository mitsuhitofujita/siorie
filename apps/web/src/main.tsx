import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
// Self-hosted rounded display face (chrome text only, so the Latin subset is
// enough). No runtime CDN — the app is served single-origin from Cloud Run.
import '@fontsource/zen-maru-gothic/latin-400.css'
import '@fontsource/zen-maru-gothic/latin-500.css'
import '@fontsource/zen-maru-gothic/latin-700.css'
import './index.css'
import App from './App.tsx'
import { AuthProvider } from '@/lib/auth'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
