import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './hooks/useTheme' // aplica tema salvo antes do primeiro render
import App from './App.tsx'
import { useAppInfoStore } from './store/appInfoStore'

// Carrega informações públicas do app (nome configurável, idioma).
// Fire-and-forget: o store tem default pra renderizar enquanto carrega.
void useAppInfoStore.getState().load()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
