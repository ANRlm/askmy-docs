import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  Search, CornerDownLeft, ArrowRight, X,
} from 'lucide-react'

interface CommandItem {
  id: string
  label: string
  sublabel?: string
  icon: React.ReactNode
  action: () => void
  category: 'action' | 'kb' | 'session'
}

interface Props {
  open: boolean
  onClose: () => void
  items: CommandItem[]
  placeholder?: string
}

function fuzzyMatch(text: string, query: string): boolean {
  text = text.toLowerCase()
  query = query.toLowerCase().trim()
  if (!query) return true
  let qi = 0
  for (let i = 0; i < text.length && qi < query.length; i++) {
    if (text[i] === query[qi]) qi++
  }
  return qi === query.length
}

function highlightMatch(text: string, query: string) {
  const q = query.trim()
  if (!q) return <span>{text}</span>
  const idx = text.toLowerCase().indexOf(q.toLowerCase())
  if (idx === -1) return <span>{text}</span>
  return (
    <>
      <span>{text.slice(0, idx)}</span>
      <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{text.slice(idx, idx + q.length)}</span>
      <span>{text.slice(idx + q.length)}</span>
    </>
  )
}

export default function CommandPalette({ open, onClose, items, placeholder = '搜索命令、知识库或会话...' }: Props) {
  const [query, setQuery] = useState('')
  const [selectedIdx, setSelectedIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const filtered = items.filter((item) =>
    fuzzyMatch(item.label, query) || fuzzyMatch(item.sublabel || '', query)
  )

  useEffect(() => {
    if (open) {
      setQuery('')
      setSelectedIdx(0)
      setTimeout(() => inputRef.current?.focus(), 20)
    }
  }, [open])

  useEffect(() => {
    setSelectedIdx(0)
  }, [query])

  const execute = useCallback((item: CommandItem) => {
    onClose()
    setTimeout(() => item.action(), 50)
  }, [onClose])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIdx((i) => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIdx((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (filtered[selectedIdx]) execute(filtered[selectedIdx])
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }

  useEffect(() => {
    if (!open) return
    const handleGlobalKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', handleGlobalKey)
    return () => window.removeEventListener('keydown', handleGlobalKey)
  }, [open, onClose])

  if (!open) return null

  const categories = ['action', 'kb', 'session'] as const
  const categoryLabel = { action: '操作', kb: '知识库', session: '会话' }

  return (
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center pt-[15vh] animate-cp-in"
      style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(12px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="w-full max-w-[560px] mx-4 rounded-2xl overflow-hidden animate-slide-down"
        style={{
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-strong)',
          boxShadow: 'var(--shadow-lg), 0 0 0 1px rgba(255,255,255,0.05) inset',
        }}
      >
        {/* Search input */}
        <div
          className="flex items-center gap-3 px-4 py-3.5"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          <Search className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--text-tertiary)' }} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="flex-1 bg-transparent text-sm focus:outline-none"
            style={{ color: 'var(--text-primary)' }}
            spellCheck={false}
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="interactive-icon p-0.5 rounded"
              style={{ color: 'var(--text-tertiary)' }}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <kbd
            className="text-[10px] px-1.5 py-0.5 rounded-md font-mono"
            style={{ background: 'var(--bg-hover)', color: 'var(--text-disabled)', border: '1px solid var(--border)' }}
          >
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[340px] overflow-y-auto py-2">
          {filtered.length === 0 && (
            <div className="py-10 text-center">
              <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>没有找到匹配项</p>
            </div>
          )}
          {categories.map((cat) => {
            const catItems = filtered.filter((i) => i.category === cat)
            if (!catItems.length) return null
            return (
              <div key={cat}>
                <p
                  className="px-4 py-1.5 text-[10.5px] font-semibold uppercase tracking-widest"
                  style={{ color: 'var(--text-disabled)' }}
                >
                  {categoryLabel[cat]}
                </p>
                {catItems.map((item) => {
                  const globalIdx = filtered.indexOf(item)
                  return (
                    <button
                      key={item.id}
                      onClick={() => execute(item)}
                      className="w-full flex items-center gap-3 px-4 py-2.5 transition-colors"
                      style={{
                        background: globalIdx === selectedIdx ? 'var(--bg-active)' : 'transparent',
                        color: globalIdx === selectedIdx ? 'var(--text-primary)' : 'var(--text-secondary)',
                      }}
                      onMouseEnter={() => setSelectedIdx(globalIdx)}
                    >
                      <span
                        className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ background: 'var(--bg-active)', color: 'var(--text-secondary)' }}
                      >
                        {item.icon}
                      </span>
                      <span className="flex-1 text-sm text-left truncate">
                        {highlightMatch(item.label, query)}
                      </span>
                      {item.sublabel && (
                        <span className="text-xs truncate max-w-[120px]" style={{ color: 'var(--text-tertiary)' }}>
                          {item.sublabel}
                        </span>
                      )}
                      {globalIdx === selectedIdx && (
                        <CornerDownLeft className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--text-secondary)' }} />
                      )}
                    </button>
                  )
                })}
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div
          className="flex items-center gap-4 px-4 py-2.5"
          style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-hover)' }}
        >
          <span className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--text-disabled)' }}>
            <ArrowRight className="w-3 h-3" /> 导航
          </span>
          <span className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--text-disabled)' }}>
            <CornerDownLeft className="w-3 h-3" /> 执行
          </span>
        </div>
      </div>
    </div>
  )
}

export { type CommandItem }
