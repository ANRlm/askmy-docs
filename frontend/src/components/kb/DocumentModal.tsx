import React, { useState, useEffect, useRef, useCallback } from 'react'
import { X, Upload, Trash2, FileText, RefreshCw, CheckCircle, AlertCircle, Clock, File } from 'lucide-react'
import * as api from '../../api'
import type { Document, KnowledgeBase } from '../../types'
import { useFocusTrap } from '../../hooks/useFocusTrap'

interface Props {
  kb: KnowledgeBase
  onClose: () => void
}

interface UploadItem {
  id: string
  file: File
  progress: number
  status: 'uploading' | 'done' | 'error'
  error?: string
}

const statusLabel: Record<Document['status'], string> = {
  pending: '待处理',
  processing: '处理中',
  done: '已完成',
  failed: '失败',
}

const BADGE_CONFIG: Record<string, { color: string; bg: string; icon: React.ReactNode }> = {
  done:       { color: 'var(--success)',  bg: 'var(--success-bg)',  icon: <CheckCircle  className="w-3 h-3" /> },
  failed:     { color: 'var(--error)',    bg: 'var(--error-bg)',    icon: <AlertCircle  className="w-3 h-3" /> },
  processing: { color: 'var(--info)',     bg: 'var(--info-bg)',     icon: <RefreshCw    className="w-3 h-3 animate-spin" /> },
  pending:    { color: 'var(--warning)',  bg: 'var(--warning-bg)',  icon: <Clock        className="w-3 h-3" /> },
}
const BADGE_FALLBACK = { color: 'var(--text-disabled)', bg: 'var(--bg-hover)', icon: <Clock className="w-3 h-3" /> }

function StatusBadge({ status }: { status: string | undefined | null }) {
  const c = BADGE_CONFIG[status ?? ''] ?? BADGE_FALLBACK
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10.5px] font-medium"
      style={{ color: c.color, background: c.bg }}
    >
      {c.icon}
      {status ? (statusLabel[status as keyof typeof statusLabel] ?? '未知') : '未知'}
    </span>
  )
}

function FileTypeIcon({ filename }: { filename: string }) {
  const ext = filename.split('.').pop()?.toLowerCase()
  const config: Record<string, { color: string; label: string }> = {
    pdf:  { color: '#f87171', label: 'PDF' },
    docx: { color: '#60a5fa', label: 'DOCX' },
    doc:  { color: '#60a5fa', label: 'DOC' },
    xlsx: { color: '#34d399', label: 'XLSX' },
    xls:  { color: '#34d399', label: 'XLS' },
    csv:  { color: '#fbbf24', label: 'CSV' },
    html: { color: '#f97316', label: 'HTML' },
    htm:  { color: '#f97316', label: 'HTML' },
    md:   { color: '#60a5fa', label: 'MD' },
    txt:  { color: '#a3a3a3', label: 'TXT' },
  }
  const { color, label } = config[ext ?? ''] ?? { color: 'var(--text-disabled)', label: ext?.toUpperCase() ?? 'FILE' }

  return (
    <div
      className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
      style={{ background: 'var(--bg-hover)', color }}
      title={label}
      aria-label={label}
    >
      <File className="w-4 h-4" />
    </div>
  )
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function SkeletonDocRow() {
  return (
    <div className="flex items-center gap-3 px-3.5 py-3 rounded-xl" style={{ border: '1px solid var(--border)' }}>
      <div className="w-8 h-8 rounded-lg skeleton flex-shrink-0" />
      <div className="flex-1 min-w-0 space-y-2">
        <div className="h-3 w-48 skeleton rounded" />
        <div className="h-2.5 w-32 skeleton rounded" />
      </div>
      <div className="h-5 w-20 skeleton rounded-md" />
    </div>
  )
}

export default function DocumentModal({ kb, onClose }: Props) {
  const [docs, setDocs] = useState<Document[]>([])
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [uploadItems, setUploadItems] = useState<UploadItem[]>([])
  const [loading, setLoading] = useState(true)
  const fileRef = useRef<HTMLInputElement>(null)
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const mountedRef = useRef(true)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const modalRef = useFocusTrap<HTMLDivElement>(true, closeButtonRef)

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
      if (mountedRef.current) {
        setDocs(data)
        setLoading(false)
      }
    } catch (e: any) {
      if (mountedRef.current) {
        setError(e.message)
        setLoading(false)
      }
    }
  }

  const stopPolling = () => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current)
      pollingRef.current = null
    }
  }

  const startPolling = () => {
    if (pollingRef.current) return
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
  }, [kb.id])

  const uploadWithProgress = useCallback(async (file: File, itemId: string) => {
    return new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      const token = localStorage.getItem('token')

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && mountedRef.current) {
          const pct = Math.round((e.loaded / e.total) * 100)
          setUploadItems((prev) =>
            prev.map((i) => i.id === itemId ? { ...i, progress: pct } : i)
          )
        }
      }

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          if (mountedRef.current) {
            setUploadItems((prev) =>
              prev.map((i) => i.id === itemId ? { ...i, status: 'done', progress: 100 } : i)
            )
          }
          resolve()
        } else {
          let errMsg = `上传失败 (${xhr.status})`
          try {
            const err = JSON.parse(xhr.responseText)
            errMsg = err.detail || err.message || errMsg
          } catch {}
          if (mountedRef.current) {
            setUploadItems((prev) =>
              prev.map((i) => i.id === itemId ? { ...i, status: 'error', error: errMsg } : i)
            )
          }
          reject(new Error(errMsg))
        }
      }

      xhr.onerror = () => {
        if (mountedRef.current) {
          setUploadItems((prev) =>
            prev.map((i) => i.id === itemId ? { ...i, status: 'error', error: '网络错误' } : i)
          )
        }
        reject(new Error('网络错误'))
      }

      xhr.open('POST', '/api/kb/' + kb.id + '/documents')
      if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)
      const formData = new FormData()
      formData.append('file', file)
      xhr.send(formData)
    })
  }, [kb.id])

  const handleFiles = async (files: FileList | File[]) => {
    const items: UploadItem[] = Array.from(files).map((f) => ({
      id: `${Date.now()}-${Math.random()}`,
      file: f,
      progress: 0,
      status: 'uploading' as const,
    }))
    setUploadItems((prev) => [...prev, ...items])
    setUploading(true)
    stopPolling()

    for (const item of items) {
      try {
        await uploadWithProgress(item.file, item.id)
      } catch {}
    }

    // Refresh docs after uploads
    await load()
    setUploading(false)
    startPolling()

    // Remove done items after a moment
    setTimeout(() => {
      setUploadItems((prev) => prev.filter((i) => i.status === 'uploading'))
    }, 2000)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(true)
  }
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
  }
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    if (e.dataTransfer.files.length) {
      handleFiles(e.dataTransfer.files)
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

  const handleRetry = async (docId: number) => {
    try {
      const updated = await api.retryDocument(kb.id, docId)
      if (mountedRef.current) {
        setDocs((prev) => prev.map((d) => d.id === docId ? updated : d))
        startPolling()
      }
    } catch (e: any) {
      if (mountedRef.current) setError(e.message)
    }
  }

  const retryUpload = async (item: UploadItem) => {
    setUploadItems((prev) =>
      prev.map((i) => i.id === item.id ? { ...i, status: 'uploading', progress: 0, error: undefined } : i)
    )
    try {
      await uploadWithProgress(item.file, item.id)
    } catch {}
    await load()
  }

  return (
    <div
      ref={modalRef}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="doc-modal-title"
    >
      {/* Frosted glass backdrop */}
      <div
        className="absolute inset-0 animate-fade-in"
        style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
        onClick={onClose}
        aria-hidden="true"
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
            <h2 id="doc-modal-title" className="text-[14px] font-semibold" style={{ color: 'var(--text-primary)' }}>
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
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[12px] font-semibold interactive disabled:opacity-40"
              style={{ background: 'var(--text-primary)', color: 'var(--bg-base)' }}
              aria-label="上传文档"
            >
              {uploading
                ? <RefreshCw className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                : <Upload className="w-3.5 h-3.5" aria-hidden="true" />
              }
              {uploading ? '上传中...' : '上传文档'}
            </button>
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
        </div>

        <input
          ref={fileRef}
          type="file"
          multiple
          accept=".pdf,.md,.txt,.docx,.xlsx,.xls,.csv,.html,.htm"
          className="hidden"
          onChange={(e) => e.target.files && handleFiles(e.target.files)}
          aria-label="选择文件上传"
        />

        {/* Drag-drop zone */}
        <div
          className="mx-5 my-3 rounded-lg p-5 text-center transition-all duration-200 cursor-pointer"
          style={{
            border: `1px dashed ${dragOver ? 'var(--border-strong)' : 'var(--border)'}`,
            background: dragOver ? 'var(--bg-hover)' : 'transparent',
          }}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileRef.current?.click() }}
          aria-label="拖拽文件到此处上传"
        >
          <Upload
            className="w-6 h-6 mx-auto mb-2 transition-colors"
            style={{ color: dragOver ? 'var(--text-secondary)' : 'var(--text-disabled)' }}
            aria-hidden="true"
          />
          <p className="text-[12px] font-medium" style={{ color: dragOver ? 'var(--text-secondary)' : 'var(--text-tertiary)' }}>
            {dragOver ? '释放以上传' : '拖拽文件到此处，或点击选择文件'}
          </p>
          <p className="text-[11px] mt-1" style={{ color: 'var(--text-disabled)' }}>
            支持 PDF · Word · Excel · CSV · HTML · Markdown · TXT
          </p>
        </div>

        {/* Active uploads */}
        {uploadItems.length > 0 && (
          <div className="px-5 pb-3 space-y-2">
            {uploadItems.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl"
                style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)' }}
              >
                <FileTypeIcon filename={item.file.name} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[12px] font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                      {item.file.name}
                    </span>
                    <span className="text-[10px] ml-2 flex-shrink-0" style={{ color: 'var(--text-disabled)' }}>
                      {formatBytes(item.file.size)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div
                      className="flex-1 h-1 rounded-full overflow-hidden"
                      style={{ background: 'var(--bg-active)' }}
                    >
                      <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{
                          width: `${item.progress}%`,
                          background: item.status === 'error' ? 'var(--error)' : item.status === 'done' ? 'var(--success)' : 'var(--text-secondary)',
                        }}
                      />
                    </div>
                    <span className="text-[10px] w-8 text-right" style={{ color: 'var(--text-disabled)' }}>
                      {item.status === 'error' ? '失败' : item.progress + '%'}
                    </span>
                    {item.status === 'error' && (
                      <button
                        onClick={() => retryUpload(item)}
                        className="text-[10px] interactive px-1.5 py-0.5 rounded"
                        style={{ color: 'var(--text-secondary)' }}
                        aria-label="重试上传"
                      >
                        重试
                      </button>
                    )}
                  </div>
                  {item.error && (
                    <p className="text-[10px] mt-0.5" style={{ color: 'var(--error)' }}>{item.error}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Error */}
        {error && (
          <div
            className="mx-5 mt-2 px-3.5 py-2.5 rounded-xl text-[12px] animate-fade-in"
            style={{ background: 'var(--error-bg)', color: 'var(--error)', border: '1px solid var(--error)' }}
            role="alert"
          >
            {error}
          </div>
        )}

        {/* Doc list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-1.5">
          {loading ? (
            <div className="space-y-2">
              <SkeletonDocRow />
              <SkeletonDocRow />
              <SkeletonDocRow />
            </div>
          ) : docs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 text-center">
              <div
                className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4"
                style={{ background: 'var(--bg-hover)' }}
              >
                <FileText className="w-6 h-6" style={{ color: 'var(--text-disabled)' }} aria-hidden="true" />
              </div>
              <p className="text-[13px] font-medium" style={{ color: 'var(--text-tertiary)' }}>暂无文档</p>
              <p className="text-[11px] mt-1" style={{ color: 'var(--text-disabled)' }}>点击上方按钮或拖拽文件上传</p>
            </div>
          ) : (
            docs.map((doc) => (
              <div
                key={doc.id}
                className="flex items-center gap-3 px-3.5 py-3 rounded-xl group transition-colors"
                style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)' }}
              >
                <FileTypeIcon filename={doc.filename} />
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
                {doc.status === 'failed' && (
                  <button
                    onClick={() => handleRetry(doc.id)}
                    className="interactive-icon p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ color: 'var(--error)' }}
                    aria-label={`重试处理 ${doc.filename}`}
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  onClick={() => handleDelete(doc.id)}
                  className="interactive-icon p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ color: 'var(--text-tertiary)' }}
                  aria-label={`删除 ${doc.filename}`}
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
