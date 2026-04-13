import React, { useEffect, useRef } from 'react'
import { X } from 'lucide-react'

export interface ShortcutItem {
  key: string
  label: string
  description?: string
}

export interface ShortcutCategory {
  name: string
  shortcuts: ShortcutItem[]
}

interface Props {
  open: boolean
  onClose: () => void
  categories: ShortcutCategory[]
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform)

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd
      className="inline-flex items-center justify-center px-1.5 py-0.5 rounded-md text-[10.5px] font-mono font-medium"
      style={{
        background: 'var(--bg-active)',
        border: '1px solid var(--border-strong)',
        color: 'var(--text-secondary)',
        minWidth: '20px',
      }}
    >
      {children}
    </kbd>
  )
}

export default function KeyboardShortcutsModal({ open, onClose, categories }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  if (!open) return null

  const modKey = isMac ? 'Cmd' : 'Ctrl'

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center animate-cp-in"
      style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(12px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        ref={dialogRef}
        className="w-full max-w-[440px] mx-4 rounded-2xl overflow-hidden animate-slide-down"
        style={{
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-strong)',
          boxShadow: 'var(--shadow-lg), 0 0 0 1px rgba(255,255,255,0.05) inset',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            快捷键
          </h2>
          <div className="flex items-center gap-3">
            <span className="text-[11px]" style={{ color: 'var(--text-disabled)' }}>
              按 <Kbd>Esc</Kbd> 关闭
            </span>
            <button
              onClick={onClose}
              className="interactive-icon p-1 rounded-lg"
              style={{ color: 'var(--text-tertiary)' }}
              aria-label="关闭"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Categories */}
        <div className="px-5 py-4 max-h-[60vh] overflow-y-auto space-y-5">
          {categories.map((cat) => (
            <div key={cat.name}>
              <p
                className="text-[10.5px] font-semibold uppercase tracking-widest mb-2.5"
                style={{ color: 'var(--text-disabled)' }}
              >
                {cat.name}
              </p>
              <div className="space-y-1.5">
                {cat.shortcuts.map((s, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between py-1.5 px-3 rounded-xl"
                    style={{ background: 'var(--bg-hover)' }}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[12.5px] truncate" style={{ color: 'var(--text-primary)' }}>
                        {s.label}
                      </span>
                      {s.description && (
                        <span className="text-[11px] truncate" style={{ color: 'var(--text-disabled)' }}>
                          — {s.description}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0 ml-3">
                      {renderKeyDisplay(s.key, modKey)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div
          className="px-5 py-3"
          style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-hover)' }}
        >
          <p className="text-[11px]" style={{ color: 'var(--text-disabled)' }}>
            在输入框中部分快捷键不可用
          </p>
        </div>
      </div>
    </div>
  )
}

function renderKeyDisplay(key: string, modKey: string) {
  const parts = key.split('+').map((p) => {
    const lower = p.toLowerCase()
    if (lower === 'cmd' || lower === 'ctrl' || lower === 'meta') return <Kbd key={p}>{modKey}</Kbd>
    if (lower === 'option') return <Kbd key={p}>Alt</Kbd>
    if (lower === 'shift') return <Kbd key={p}>Shift</Kbd>
    if (lower === 'escape') return <Kbd key={p}>Esc</Kbd>
    if (lower === 'arrowup') return <Kbd key={p}>↑</Kbd>
    if (lower === 'arrowdown') return <Kbd key={p}>↓</Kbd>
    if (lower === 'arrowleft') return <Kbd key={p}>←</Kbd>
    if (lower === 'arrowright') return <Kbd key={p}>→</Kbd>
    if (lower === 'enter') return <Kbd key={p}>Enter</Kbd>
    if (lower === 'backspace') return <Kbd key={p}>⌫</Kbd>
    if (lower === '?') return <Kbd key={p}>?</Kbd>
    return <Kbd key={p}>{p.toUpperCase()}</Kbd>
  })

  return parts.reduce((acc, part, i) => {
    if (i === 0) return [part]
    return [...acc, <span key={`plus-${i}`} className="text-[10px]" style={{ color: 'var(--text-disabled)' }}>+</span>, part]
  }, [] as React.ReactNode[])
}
