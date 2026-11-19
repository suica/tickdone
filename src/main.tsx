import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
// after every other style sheet: touch-screen hit areas override the base sizes
import './touch.css'
import { hideLaunchScreen } from './launch'
import { startPwa } from './pwa'

startPwa()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

requestAnimationFrame(() => requestAnimationFrame(hideLaunchScreen))
