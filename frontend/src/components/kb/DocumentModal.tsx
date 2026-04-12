import React, { useState, useEffect, useRef } from 'react'
import { X, Upload, Trash2, FileText, RefreshCw, CheckCircle, AlertCircle, Clock } from 'lucide-react'
import * as api from '../../api'
import type { Document, KnowledgeBase } from '../../types'

interface Props {
  kb: KnowledgeBase
  onClose: () => void
}

const statusLabel: Record<Document['status'], string> = {
  pending: '待处理',
  processing: '处理中',
  done: '已完成',
  failed: '失败',
}

function StatusBadge({ status }: { status: Document['status'] }) {
  const configs: Record<string, { color: string; bg: string; icon: React.ReactNode }> = {
    done:       { color: 'var(--success)', bg: 'var(--success-bg)', icon: <CheckCircle className="w-3 h-3" /> },
    failed:     { color: 'var(--error)',   bg: 'var(--error-bg)',   icon: <AlertCircle className="w-3 h-3" /> },
    processing: { color: 'var(--info)',    bg: 'var(--info-bg)',    icon: <RefreshCw className="w-3 h-3 animate-spin" /> },
    pending:    { color: 'var(--warning)', bg: 'var(--warning-bg)', icon: <Clock className="w-3 h-3" /> },
  }
  const config = configs[status] ?? configs.pending

  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10.5px] font-medium"
      style={{ color: config.color, background: config.bg }}
    >
      {config.icon}
      {statusLabel[status] ?? status}
    </span>
  )
}

export default function DocumentModal({ kb, onClose }: Props) {
  const [docs, setDocs] = useState<Document[]>([])
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // Track whether the component is still mounted to prevent setState after unmount
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      if (pollingRef.current) {
        clearInterval(pollingRef.current)
        pollingRef.current = null
      }
    }
  }, [])

  const load = async () => {
    try {
      const data = await api.listDocuments(kb.id)
      if (mountedRef.current) setDocs(data)
    } catch (e: any) {
      if (mountedRef.current) setError(e.message)
    }
  }

  const stopPolling = () => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current)
      pollingRef.current = null
    }
  }

  const startPolling = () => {
    // Always clear any existing interval before starting a new one
    stopPolling()
    pollingRef.current = setInterval(async () => {
      if (!mountedRef.current) { stopPolling(); return }
      const data = await api.listDocuments(kb.id).catch(() => null)
      if (!mountedRef.current) { stopPolling(); return }
      if (data) {
        setDocs(data)
        const hasPending = data.some((d) => d.status === 'pending' || d.status === 'processing')
        if (!hasPending) stopPolling()
      }
    }, 3000)
  }

  useEffect(() => {
    load()
    startPolling()
    // Cleanup is handled by the mountedRef effect above
  }, [kb.id])

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    setUploading(true)
    setError('')
    try {
      for (const file of files) await api.uploadDocument(kb.id, file)
      await load()
      startPolling()
    } catch (e: any) {
      if (mountedRef.current) setError(e.message)
    } finally {
      if (mountedRef.current) setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const handleDelete = async (docId: number) => {
    if (!confirm('确定删除此文档？向量数据将同步删除。')) return
    try {
      await api.deleteDocument(kb.id, docId)
      if (mountedRef.current) setDocs((prev) => prev.filter((d) => d.id !== docId))
    } catch (e: any) {
      if (mountedRef.current) setError(e.message)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 animate-fade-in"
        style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }}
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className="relative w-full max-w-xl flex flex-col max-h-[85vh] animate-slide-up sm:rounded-2xl rounded-t-2xl overflow-hidden"
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
          <div>
            <h2 className="text-[14px] font-semibold" style={{ color: 'var(--text-primary)' }}>
              {kb.name}
            </h2>
            <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
              文档管理 · {docs.length} 个文件
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[12px] font-semibold transition-all disabled:opacity-50 active:scale-95"
              style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}
            >
              {uploading
                ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                : <Upload className="w-3.5 h-3.5" />
              }
              {uploading ? '上传中...' : '上传文档'}
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-xl transition-colors"
              style={{ color: 'var(--text-tertiary)' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <input
          ref={fileRef}
          type="file"
          multiple
          accept=".pdf,.md,.txt"
          className="hidden"
          onChange={handleUpload}
        />

        {/* Info banner */}
        <div
          className="px-5 py-2.5 text-[11px]"
          style={{
            background: 'var(--bg-hover)',
            borderBottom: '1px solid var(--border)',
            color: 'var(--text-disabled)',
          }}
        >
          支持格式：PDF · Markdown · TXT，上传后自动解析并建立向量索引
        </div>

        {/* Error */}
        {error && (
          <div
            className="mx-5 mt-4 px-3.5 py-2.5 rounded-xl text-[12px] animate-fade-in"
            style={{ background: 'var(--error-bg)', color: 'var(--error)', border: '1px solid var(--error-bg)' }}
          >
            {error}
          </div>
        )}

        {/* Doc list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-1.5">
          {docs.length === 0 ? (
            <div
              className="flex flex-col items-center justify-center py-14 text-center"
              style={{ color: 'var(--text-disabled)' }}
            >
              <FileText className="w-10 h-10 mb-3 opacity-30" />
              <p className="text-[13px] font-medium" style={{ color: 'var(--text-tertiary)' }}>暂无文档</p>
              <p className="text-[11px] mt-1">点击上传按钮添加文件</p>
            </div>
          ) : (
            docs.map((doc) => (
              <div
                key={doc.id}
                className="flex items-center gap-3 px-3.5 py-3 rounded-xl group transition-colors"
                style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-active)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
              >
                <FileText className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--text-disabled)' }} />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                    {doc.filename}
                  </p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <StatusBadge status={doc.status} />
                    {doc.chunk_count != null && (
                      <span className="text-[10.5px]" style={{ color: 'var(--text-disabled)' }}>
                        {doc.chunk_count} 个片段
                      </span>
                    )}
                    {doc.error_msg && (
                      <span className="text-[10.5px] truncate max-w-[200px]" style={{ color: 'var(--error)' }}>
                        {doc.error_msg}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(doc.id)}
                  className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg transition-all"
                  style={{ color: 'var(--text-tertiary)' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--error-bg)'; e.currentTarget.style.color = 'var(--error)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-tertiary)' }}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
