import React, { createContext, useContext, useState, useCallback, useRef } from 'react'
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react'

type ToastType = 'success' | 'error' | 'info'

interface Toast {
  id: string
  message: string
  type: ToastType
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType) => void
}

const ToastContext = createContext<ToastContextValue>({ toast: () => {} })

export function useToast() {
  return useContext(ToastContext)
}

let toastSeq = 0

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
    const timer = timers.current.get(id)
    if (timer) { clearTimeout(timer); timers.current.delete(id) }
  }, [])

  const toast = useCallback((message: string, type: ToastType = 'info') => {
    const id = String(++toastSeq)
    setToasts((prev) => [...prev.slice(-4), { id, message, type }])
    const timer = setTimeout(() => dismiss(id), 3800)
    timers.current.set(id, timer)
  }, [dismiss])

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  const config = {
    success: {
      icon: <CheckCircle className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--success)' }} />,
      border: 'var(--success)',
      bg: 'var(--success-bg)',
    },
    error: {
      icon: <AlertCircle className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--error)' }} />,
      border: 'var(--error)',
      bg: 'var(--error-bg)',
    },
    info: {
      icon: <Info className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--info)' }} />,
      border: 'var(--border-strong)',
      bg: 'var(--bg-elevated)',
    },
  }[toast.type]

  return (
    <div
      className="pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-xl min-w-[240px] max-w-[380px] animate-toast-in"
      style={{
        background: 'var(--bg-elevated)',
        border: `1px solid ${config.border}`,
        boxShadow: 'var(--shadow-lg)',
      }}
    >
      {config.icon}
      <p className="flex-1 text-sm leading-snug" style={{ color: 'var(--text-primary)' }}>
        {toast.message}
      </p>
      <button
        onClick={() => onDismiss(toast.id)}
        className="transition-colors mt-0.5 shrink-0"
        style={{ color: 'var(--text-tertiary)' }}
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}
