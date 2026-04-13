import { useState, useRef } from 'react'
import { X, Settings2, Database, Zap } from 'lucide-react'
import * as api from '../../api'
import type { KnowledgeBase } from '../../types'
import { useToast } from '../ui/Toast'
import { useFocusTrap } from '../../hooks/useFocusTrap'

interface Props {
  kb: KnowledgeBase
  onClose: () => void
  onUpdated: (kb: KnowledgeBase) => void
}

export default function KbSettingsModal({ kb, onClose, onUpdated }: Props) {
  const { toast } = useToast()
  const [topK, setTopK] = useState(kb.top_k)
  const [scoreThreshold, setScoreThreshold] = useState(kb.score_threshold)
  const [saving, setSaving] = useState(false)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const modalRef = useFocusTrap<HTMLDivElement>(true, closeButtonRef)

  const handleSave = async () => {
    if (topK < 1 || topK > 50) {
      toast('top_k 必须在 1-50 之间', 'error')
      return
    }
    if (scoreThreshold < 0 || scoreThreshold > 1) {
      toast('score_threshold 必须在 0-1 之间', 'error')
      return
    }
    setSaving(true)
    try {
      const updated = await api.updateKB(kb.id, { top_k: topK, score_threshold: scoreThreshold })
      onUpdated(updated)
      toast('设置已保存', 'success')
      onClose()
    } catch (e: any) {
      toast(e.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      ref={modalRef}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="kb-settings-title"
    >
      <div
        className="absolute inset-0 animate-fade-in"
        style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className="relative w-full max-w-md animate-slide-up rounded-2xl overflow-hidden"
        style={{
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          boxShadow: 'var(--shadow-lg)',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          <div className="flex items-center gap-2">
            <Settings2 className="w-4 h-4" style={{ color: 'var(--accent)' }} />
            <h2 id="kb-settings-title" className="text-[14px] font-semibold" style={{ color: 'var(--text-primary)' }}>
              知识库设置
            </h2>
          </div>
          <button
            onClick={onClose}
            className="interactive-icon p-1.5 rounded-xl"
            style={{ color: 'var(--text-tertiary)' }}
            aria-label="关闭"
            ref={closeButtonRef}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-5">
          <p className="text-[12px]" style={{ color: 'var(--text-tertiary)' }}>
            知识库：<span className="font-medium" style={{ color: 'var(--text-primary)' }}>{kb.name}</span>
          </p>

          {/* Top K */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Database className="w-3.5 h-3.5" style={{ color: 'var(--text-tertiary)' }} />
              <label className="text-[12px] font-medium" style={{ color: 'var(--text-primary)' }}>
                检索数量 (top_k)
              </label>
            </div>
            <p className="text-[11px]" style={{ color: 'var(--text-disabled)' }}>
              每次检索返回的最相关片段数量（1-50）
            </p>
            <input
              type="number"
              min={1}
              max={50}
              value={topK}
              onChange={(e) => setTopK(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-xl text-[13px] focus:outline-none"
              style={{
                background: 'var(--bg-input)',
                border: '1px solid var(--border)',
                color: 'var(--text-primary)',
              }}
            />
          </div>

          {/* Score Threshold */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Zap className="w-3.5 h-3.5" style={{ color: 'var(--text-tertiary)' }} />
              <label className="text-[12px] font-medium" style={{ color: 'var(--text-primary)' }}>
                相似度阈值 (score_threshold)
              </label>
            </div>
            <p className="text-[11px]" style={{ color: 'var(--text-disabled)' }}>
              只返回相似度大于此值的片段（0-1），越接近 1 越严格
            </p>
            <input
              type="number"
              min={0}
              max={1}
              step={0.05}
              value={scoreThreshold}
              onChange={(e) => setScoreThreshold(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-xl text-[13px] focus:outline-none"
              style={{
                background: 'var(--bg-input)',
                border: '1px solid var(--border)',
                color: 'var(--text-primary)',
              }}
            />
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={scoreThreshold}
              onChange={(e) => setScoreThreshold(Number(e.target.value))}
              className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
              style={{ accentColor: 'var(--accent)' }}
            />
          </div>
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-end gap-2 px-5 py-4"
          style={{ borderTop: '1px solid var(--border)' }}
        >
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-[12px] interactive"
            style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 rounded-xl text-[12px] font-medium interactive disabled:opacity-50"
            style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}
          >
            {saving ? '保存中...' : '保存设置'}
          </button>
        </div>
      </div>
    </div>
  )
}
