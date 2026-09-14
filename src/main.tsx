import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router'
import { registerSW } from 'virtual:pwa-register'
import { ToastProvider } from './components/Toast'
import './index.css'
import { captureHash, getKey } from './lib/api'
import { AddPage } from './pages/AddPage'
import { ListPage } from './pages/ListPage'
import { SetupPage } from './pages/SetupPage'

captureHash()
registerSW({ immediate: true })

function RequireKey({ children }: { children: React.ReactElement }) {
  const location = useLocation()
  if (getKey()) return children
  return <Navigate to={`/setup?next=${encodeURIComponent(location.pathname + location.search)}`} replace />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <Routes>
          <Route path="/" element={<RequireKey><ListPage /></RequireKey>} />
          <Route path="/add" element={<RequireKey><AddPage /></RequireKey>} />
          <Route path="/setup" element={<SetupPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>,
)
