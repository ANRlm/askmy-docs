import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { AuthProvider } from './hooks/useAuth'
import { CommandPaletteProvider } from './hooks/useCommandPalette'
import ErrorBoundary from './components/ui/ErrorBoundary'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <CommandPaletteProvider>
          <App />
        </CommandPaletteProvider>
      </AuthProvider>
    </ErrorBoundary>
  </React.StrictMode>
)
