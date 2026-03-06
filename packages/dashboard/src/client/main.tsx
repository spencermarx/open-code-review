import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app'
import { ensureAuthToken } from './lib/auth'
import './styles/globals.css'

// Ensure the auth token is available before rendering.
// In production this resolves immediately (token is in window.__OCR_TOKEN__).
// In development this fetches from /auth/token once.
ensureAuthToken().then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
