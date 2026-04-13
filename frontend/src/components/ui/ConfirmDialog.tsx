import { useState, useEffect, useRef } from 'react'
import { AlertTriangle } from 'lucide-react'

interface Props {
  open: boolean
  title: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = '确认',
  cancelLabel = '取消',
  destructive = false,
  onConfirm,
  onCancel,
}: Props) {
  const [visible, setVisible] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) {
      setVisible(true)
      setTimeout(() => dialogRef.current?.focus(), 20)
    } else {
      setVisible(false)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCancel()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [open, onCancel])

  if (!open && !visible) return null

  const handleConfirm = () => {
    setVisible(false)
    setTimeout(() => onConfirm(), 150)
  }

  const handleCancel = () => {
    setVisible(false)
    setTimeout(() => onCancel(), 150)
  }

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center animate-cp-in"
      style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(8px)', opacity: visible ? 1 : 0, transition: 'opacity 0.15s' }}
      onClick={(e) => { if (e.target === e.currentTarget) handleCancel() }}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="w-full max-w-[320px] mx-4 rounded-2xl p-5 animate-slide-down"
        style={{
          background: 'var(--bg-elevated)',
          border: `1px solid ${destructive ? 'var(--error)' : 'var(--border-strong)'}`,
          boxShadow: 'var(--shadow-lg)',
        }}
      >
        <div className="flex items-start gap-3">
          {destructive && (
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
              style={{ background: 'var(--error-bg)' }}
            >
              <AlertTriangle className="w-4 h-4" style={{ color: 'var(--error)' }} />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold leading-snug" style={{ color: 'var(--text-primary)' }}>
              {title}
            </p>
            {message && (
              <p className="mt-1.5 text-[12.5px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                {message}
              </p>
            )}
          </div>
        </div>

        <div className="flex gap-2 mt-4">
          <button
            onClick={handleCancel}
            className="flex-1 py-2 rounded-xl text-[13px] font-medium interactive"
            style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
          >
            {cancelLabel}
          </button>
          <button
            onClick={handleConfirm}
            className="flex-1 py-2 rounded-xl text-[13px] font-medium interactive"
            style={{
              background: destructive ? 'var(--error)' : 'var(--text-primary)',
              color: destructive ? '#fff' : 'var(--bg-base)',
              border: `1px solid ${destructive ? 'var(--error)' : 'var(--text-primary)'}`,
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
