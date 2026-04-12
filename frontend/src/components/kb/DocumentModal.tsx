import React, { useState, useEffect, useRef } from 'react'
import { X, Upload, Trash2, FileText, RefreshCw, CheckCircle, AlertCircle, Clock } from 'lucide-react'
import * as api from '../../api'
import type { Document, KnowledgeBase } from '../../types'

interface Props {
  kb: KnowledgeBase
  onClose: () => void
}

const StatusIcon = ({ status }: { status: Document['status'] }) => {
  if (status === 'done') return <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
  if (status === 'failed') return <AlertCircle className="w-3.5 h-3.5 text-red-400" />
  if (status === 'processing') return <RefreshCw className="w-3.5 h-3.5 text-blue-400 animate-spin" />
  return <Clock className="w-3.5 h-3.5 text-yellow-400" />
}

const statusLabel: Record<Document['status'], string> = {
  pending: '待处理',
  processing: '处理中',
  done: '已完成',
  failed: '失败',
}

export default function DocumentModal({ kb, onClose }: Props) {
  const [docs, setDocs] = useState<Document[]>([])
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const load = async () => {
    try {
      const data = await api.listDocuments(kb.id)
      setDocs(data)
    } catch (e: any) {
      setError(e.message)
    }
  }

  useEffect(() => {
    load()
    pollingRef.current = setInterval(async () => {
      const data = await api.listDocuments(kb.id).catch(() => null)
      if (data) {
        setDocs(data)
        const hasPending = data.some((d) => d.status === 'pending' || d.status === 'processing')
        if (!hasPending && pollingRef.current) {
          clearInterval(pollingRef.current)
          pollingRef.current = null
        }
      }
    }, 3000)
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current)
    }
  }, [kb.id])

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    setUploading(true)
    setError('')
    try {
      for (const file of files) {
        await api.uploadDocument(kb.id, file)
      }
      await load()
      if (!pollingRef.current) {
        pollingRef.current = setInterval(async () => {
          const data = await api.listDocuments(kb.id).catch(() => null)
          if (data) {
            setDocs(data)
            const hasPending = data.some((d) => d.status === 'pending' || d.status === 'processing')
            if (!hasPending && pollingRef.current) {
              clearInterval(pollingRef.current)
              pollingRef.current = null
            }
          }
        }, 3000)
      }
    } catch (e: any) {
      setError(e.message)
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const handleDelete = async (docId: number) => {
    if (!confirm('确定删除此文档？向量数据将同步删除。')) return
    try {
      await api.deleteDocument(kb.id, docId)
      setDocs((prev) => prev.filter((d) => d.id !== docId))
    } catch (e: any) {
      setError(e.message)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-xl bg-[#161616] border border-white/[0.08] rounded-2xl shadow-2xl flex flex-col max-h-[80vh] animate-slide-up">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
          <div>
            <h2 className="text-sm font-medium text-white">{kb.name}</h2>
            <p className="text-xs text-white/35 mt-0.5">文档管理 · {docs.length} 个文件</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white text-black text-xs font-medium hover:bg-white/90 disabled:opacity-50 transition-colors"
            >
              {uploading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
              {uploading ? '上传中...' : '上传文档'}
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-white/[0.06] text-white/40 hover:text-white/70 transition-colors"
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
        <div className="px-5 py-2.5 bg-white/[0.02] border-b border-white/[0.04] text-[11px] text-white/30">
          支持格式：PDF · Markdown · TXT，上传后自动解析并建立向量索引
        </div>

        {/* Error */}
        {error && (
          <div className="mx-5 mt-3 px-3 py-2.5 rounded-lg bg-red-500/8 border border-red-500/15 text-red-400 text-xs">
            {error}
          </div>
        )}

        {/* Doc list */}
        <div className="flex-1 overflow-y-auto p-5 space-y-1.5">
          {docs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-white/25">
              <FileText className="w-10 h-10 mb-3 opacity-30" />
              <p className="text-sm">暂无文档</p>
              <p className="text-xs mt-1 opacity-70">点击上传按钮添加文件</p>
            </div>
          ) : (
            docs.map((doc) => (
              <div
                key={doc.id}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-white/[0.03] border border-white/[0.05] hover:bg-white/[0.05] transition-colors group"
              >
                <FileText className="w-4 h-4 text-white/30 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] text-white/80 font-medium truncate">{doc.filename}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <StatusIcon status={doc.status} />
                    <span className="text-[11px] text-white/35">{statusLabel[doc.status]}</span>
                    {doc.chunk_count != null && (
                      <span className="text-[11px] text-white/25">· {doc.chunk_count} 个片段</span>
                    )}
                    {doc.error_msg && (
                      <span className="text-[11px] text-red-400 truncate max-w-[200px]">· {doc.error_msg}</span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(doc.id)}
                  className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-red-500/10 text-white/30 hover:text-red-400 transition-colors"
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
