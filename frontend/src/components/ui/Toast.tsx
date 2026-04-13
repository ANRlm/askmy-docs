import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react'
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

const DURATION = 4000

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const startTimes = useRef<Map<string, number>>(new Map())
  const paused = useRef<Set<string>>(new Set())
  const progressIntervals = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map())

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
    const timer = timers.current.get(id)
    if (timer) { clearTimeout(timer); timers.current.delete(id) }
    startTimes.current.delete(id)
    const interval = progressIntervals.current.get(id)
    if (interval) { clearInterval(interval); progressIntervals.current.delete(id) }
    paused.current.delete(id)
  }, [])

  const startTimer = useCallback((id: string) => {
    const startTime = Date.now()
    startTimes.current.set(id, startTime)
    const intervalId = setInterval(() => {
      if (paused.current.has(id)) return
      const elapsed = Date.now() - (startTimes.current.get(id) ?? Date.now())
      const remaining = Math.max(0, DURATION - elapsed)
      // Progress updates handled by inline style
      if (remaining <= 0) {
        clearInterval(intervalId)
        progressIntervals.current.delete(id)
        dismiss(id)
      }
    }, 50)
    progressIntervals.current.set(id, intervalId)
    const timer = setTimeout(() => {
      dismiss(id)
    }, DURATION)
    timers.current.set(id, timer)
  }, [dismiss])

  const toast = useCallback((message: string, type: ToastType = 'info') => {
    const id = String(++toastSeq)
    setToasts((prev) => [...prev.slice(-4), { id, message, type }])
    startTimer(id)
  }, [startTimer])

  const pauseTimer = useCallback((id: string) => {
    paused.current.add(id)
  }, [])

  const resumeTimer = useCallback((id: string) => {
    if (!paused.current.has(id)) return
    paused.current.delete(id)
    const elapsed = Date.now() - (startTimes.current.get(id) ?? Date.now())
    startTimes.current.set(id, Date.now() - elapsed)
  }, [])

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {/* Aria-live region for screen readers */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none"
      >
        {toasts.map((t) => (
          <ToastItem
            key={t.id}
            toast={t}
            onDismiss={dismiss}
            onMouseEnter={() => pauseTimer(t.id)}
            onMouseLeave={() => resumeTimer(t.id)}
          />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

function ToastItem({
  toast,
  onDismiss,
  onMouseEnter,
  onMouseLeave,
}: {
  toast: Toast
  onDismiss: (id: string) => void
  onMouseEnter: () => void
  onMouseLeave: () => void
}) {
  const config = {
    success: {
      icon: <CheckCircle className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--success)' }} />,
      border: 'var(--success)',
      bg: 'rgba(52, 211, 153, 0.08)',
    },
    error: {
      icon: <AlertCircle className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--error)' }} />,
      border: 'var(--error)',
      bg: 'rgba(248, 113, 113, 0.08)',
    },
    info: {
      icon: <Info className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--accent-hover)' }} />,
      border: 'var(--border)',
      bg: 'var(--bg-elevated)',
    },
  }[toast.type]

  const [progress, setProgress] = useState(100)
  const [swiping, setSwiping] = useState(false)
  const [offsetX, setOffsetX] = useState(0)
  const startXRef = useRef(0)
  const toastRef = useRef<HTMLDivElement>(null)
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startTimeRef = useRef<number>(Date.now())
  const progressRef = useRef(100)

  const updateProgress = (value: number) => {
    progressRef.current = value
    setProgress(value)
  }

  // Start countdown on mount
  useEffect(() => {
    startTimeRef.current = Date.now()
    progressIntervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current
      const remaining = Math.max(0, DURATION - elapsed)
      updateProgress((remaining / DURATION) * 100)
    }, 50)
    return () => {
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current)
    }
  }, [])

  // Pause/resume countdown
  useEffect(() => {
    const handleMouseEnter = () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current)
        progressIntervalRef.current = null
      }
    }
    const handleMouseLeave = () => {
      if (!progressIntervalRef.current) {
        startTimeRef.current = Date.now() - ((100 - progressRef.current) / 100) * DURATION
        progressIntervalRef.current = setInterval(() => {
          const elapsed = Date.now() - startTimeRef.current
          const remaining = Math.max(0, DURATION - elapsed)
          updateProgress((remaining / DURATION) * 100)
        }, 50)
      }
    }
    const el = toastRef.current
    if (!el) return
    el.addEventListener('mouseenter', handleMouseEnter)
    el.addEventListener('mouseleave', handleMouseLeave)
    return () => {
      el.removeEventListener('mouseenter', handleMouseEnter)
      el.removeEventListener('mouseleave', handleMouseLeave)
    }
  }, [])

  // Swipe to dismiss
  const handleTouchStart = (e: React.TouchEvent) => {
    startXRef.current = e.touches[0].clientX
    setSwiping(true)
  }
  const handleTouchMove = (e: React.TouchEvent) => {
    if (!swiping) return
    const delta = e.touches[0].clientX - startXRef.current
    if (delta < 0) setOffsetX(delta)
  }
  const handleTouchEnd = () => {
    if (offsetX < -80) {
      onDismiss(toast.id)
    } else {
      setOffsetX(0)
    }
    setSwiping(false)
  }

  return (
    <div
      ref={toastRef}
      className="pointer-events-auto flex flex-col min-w-[260px] max-w-[380px] animate-toast-in rounded-xl overflow-hidden"
      style={{
        background: config.bg,
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: `1px solid ${config.border}`,
        boxShadow: 'var(--shadow-lg)',
        transform: swiping ? `translateX(${offsetX}px)` : 'translateX(0)',
        transition: swiping ? 'none' : 'transform 0.24s ease, opacity 0.2s ease',
        opacity: swiping ? 1 - Math.abs(offsetX) / 200 : 1,
      }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <div
        className="flex items-start gap-3 px-4 py-3"
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      >
        {config.icon}
        <p className="flex-1 text-sm leading-snug" style={{ color: 'var(--text-primary)' }}>
          {toast.message}
        </p>
        <button
          onClick={() => onDismiss(toast.id)}
          className="transition-colors mt-0.5 shrink-0 interactive-icon p-0.5 rounded"
          style={{ color: 'var(--text-tertiary)' }}
          aria-label="关闭提示"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Countdown bar */}
      <div
        className="h-0.5 w-full"
        style={{ background: config.border, opacity: 0.3 }}
        aria-hidden="true"
      >
        <div
          className="h-full rounded-full transition-[width] duration-100 ease-linear"
          style={{
            width: `${progress}%`,
            background: config.border,
          }}
        />
      </div>
    </div>
  )
}
