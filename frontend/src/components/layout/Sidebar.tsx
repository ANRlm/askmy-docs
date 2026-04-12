import React, { useState, useEffect } from 'react'
import { Plus, Trash2, FolderOpen, MessageSquare, ChevronDown, ChevronRight, BookOpen, LogOut, Settings } from 'lucide-react'
import * as api from '../../api'
import type { KnowledgeBase, Session } from '../../types'
import { useAuth } from '../../hooks/useAuth'
import DocumentModal from '../kb/DocumentModal'

interface Props {
  selectedKb: KnowledgeBase | null
  selectedSession: Session | null
  onSelectKb: (kb: KnowledgeBase) => void
  onSelectSession: (session: Session) => void
  onNewSession: (session: Session) => void
}

export default function Sidebar({ selectedKb, selectedSession, onSelectKb, onSelectSession, onNewSession }: Props) {
  const { user, logout } = useAuth()
  const [kbs, setKbs] = useState<KnowledgeBase[]>([])
  const [sessions, setSessions] = useState<Session[]>([])
  const [expandedKb, setExpandedKb] = useState<number | null>(null)
  const [docModalKb, setDocModalKb] = useState<KnowledgeBase | null>(null)
  const [creating, setCreating] = useState(false)
  const [newKbName, setNewKbName] = useState('')
  const [newKbDesc, setNewKbDesc] = useState('')

  const loadKbs = async () => {
    try {
      const data = await api.listKBs()
      setKbs(data)
    } catch {}
  }

  const loadSessions = async (kbId: number) => {
    try {
      const data = await api.listSessions(kbId)
      setSessions(data)
    } catch {}
  }

  useEffect(() => { loadKbs() }, [])

  useEffect(() => {
    if (selectedKb) loadSessions(selectedKb.id)
  }, [selectedKb])

  const handleSelectKb = (kb: KnowledgeBase) => {
    setExpandedKb(expandedKb === kb.id ? null : kb.id)
    onSelectKb(kb)
    loadSessions(kb.id)
  }

  const handleNewSession = async (kb: KnowledgeBase) => {
    try {
      const session = await api.createSession(kb.id)
      setSessions((prev) => [session, ...prev])
      onNewSession(session)
    } catch {}
  }

  const handleDeleteSession = async (e: React.MouseEvent, sessionId: number) => {
    e.stopPropagation()
    if (!confirm('确定删除此会话？')) return
    try {
      await api.deleteSession(sessionId)
      setSessions((prev) => prev.filter((s) => s.id !== sessionId))
    } catch {}
  }

  const handleCreateKb = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newKbName.trim()) return
    try {
      const kb = await api.createKB(newKbName.trim(), newKbDesc.trim())
      setKbs((prev) => [...prev, kb])
      setCreating(false)
      setNewKbName('')
      setNewKbDesc('')
    } catch {}
  }

  const handleDeleteKb = async (e: React.MouseEvent, kbId: number) => {
    e.stopPropagation()
    if (!confirm('确定删除此知识库？所有文档和会话将被永久删除。')) return
    try {
      await api.deleteKB(kbId)
      setKbs((prev) => prev.filter((k) => k.id !== kbId))
    } catch {}
  }

  return (
    <>
      <aside className="w-64 flex-shrink-0 flex flex-col h-full bg-[#0f0f0f] border-r border-white/[0.06]">
        {/* Logo */}
        <div className="px-4 py-4 flex items-center gap-2.5 border-b border-white/[0.06]">
          <div className="w-7 h-7 rounded-md bg-white flex items-center justify-center flex-shrink-0">
            <BookOpen className="w-4 h-4 text-black" />
          </div>
          <span className="font-semibold text-white text-sm">AskMyDocs</span>
        </div>

        {/* KB list */}
        <div className="flex-1 overflow-y-auto py-2">
          {/* Section header */}
          <div className="flex items-center justify-between px-3 py-2 mb-1">
            <span className="text-[11px] font-medium text-white/30 uppercase tracking-widest">知识库</span>
            <button
              onClick={() => setCreating(!creating)}
              className="w-5 h-5 flex items-center justify-center rounded hover:bg-white/10 text-white/40 hover:text-white/80 transition-colors"
              title="新建知识库"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Create form */}
          {creating && (
            <form onSubmit={handleCreateKb} className="mx-2 mb-2 p-3 rounded-lg bg-white/[0.04] border border-white/[0.08] space-y-2 animate-fade-in">
              <input
                autoFocus
                value={newKbName}
                onChange={(e) => setNewKbName(e.target.value)}
                placeholder="知识库名称"
                className="w-full px-2.5 py-1.5 rounded-md bg-white/[0.06] border border-white/[0.08] text-white text-xs placeholder-white/25 focus:outline-none focus:border-white/20 transition-colors"
              />
              <input
                value={newKbDesc}
                onChange={(e) => setNewKbDesc(e.target.value)}
                placeholder="简介（可选）"
                className="w-full px-2.5 py-1.5 rounded-md bg-white/[0.06] border border-white/[0.08] text-white text-xs placeholder-white/25 focus:outline-none focus:border-white/20 transition-colors"
              />
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="flex-1 py-1.5 rounded-md bg-white text-black text-xs font-medium hover:bg-white/90 transition-colors"
                >
                  创建
                </button>
                <button
                  type="button"
                  onClick={() => setCreating(false)}
                  className="flex-1 py-1.5 rounded-md bg-white/[0.06] text-white/60 text-xs hover:bg-white/10 transition-colors"
                >
                  取消
                </button>
              </div>
            </form>
          )}

          {kbs.map((kb) => (
            <div key={kb.id}>
              <button
                onClick={() => handleSelectKb(kb)}
                className={`w-full flex items-center gap-2 px-3 py-2 mx-0 transition-colors group ${
                  selectedKb?.id === kb.id
                    ? 'bg-white/[0.08] text-white'
                    : 'text-white/55 hover:text-white/85 hover:bg-white/[0.04]'
                }`}
              >
                {expandedKb === kb.id
                  ? <ChevronDown className="w-3.5 h-3.5 flex-shrink-0 text-white/30" />
                  : <ChevronRight className="w-3.5 h-3.5 flex-shrink-0 text-white/30" />
                }
                <FolderOpen className="w-3.5 h-3.5 flex-shrink-0 text-white/50" />
                <span className="flex-1 text-[13px] text-left truncate">{kb.name}</span>
                <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5">
                  <button
                    onClick={(e) => { e.stopPropagation(); setDocModalKb(kb) }}
                    className="p-1 rounded hover:bg-white/10 text-white/40 hover:text-white/80 transition-colors"
                    title="管理文档"
                  >
                    <Settings className="w-3 h-3" />
                  </button>
                  <button
                    onClick={(e) => handleDeleteKb(e, kb.id)}
                    className="p-1 rounded hover:bg-red-500/15 text-white/40 hover:text-red-400 transition-colors"
                    title="删除知识库"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </button>

              {/* Sessions under this KB */}
              {expandedKb === kb.id && (
                <div className="ml-6 border-l border-white/[0.06]">
                  <button
                    onClick={() => handleNewSession(kb)}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-white/30 hover:text-white/60 hover:bg-white/[0.04] transition-colors text-[12px]"
                  >
                    <Plus className="w-3 h-3" />
                    <span>新建会话</span>
                  </button>
                  {sessions
                    .filter((s) => s.kb_id === kb.id)
                    .map((session) => (
                      <button
                        key={session.id}
                        onClick={() => onSelectSession(session)}
                        className={`w-full flex items-center gap-2 px-3 py-1.5 transition-colors group text-left ${
                          selectedSession?.id === session.id
                            ? 'bg-white/[0.08] text-white/90'
                            : 'text-white/40 hover:text-white/70 hover:bg-white/[0.04]'
                        }`}
                      >
                        <MessageSquare className="w-3 h-3 flex-shrink-0 text-white/30" />
                        <span className="flex-1 text-[12px] truncate">{session.title}</span>
                        <button
                          onClick={(e) => handleDeleteSession(e, session.id)}
                          className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-red-500/15 hover:text-red-400 text-white/30 transition-colors"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </button>
                    ))}
                </div>
              )}
            </div>
          ))}

          {kbs.length === 0 && !creating && (
            <div className="text-center py-10 text-white/20 text-xs">
              <FolderOpen className="w-7 h-7 mx-auto mb-2 opacity-30" />
              <p>暂无知识库</p>
              <p className="mt-1 opacity-70">点击 + 新建</p>
            </div>
          )}
        </div>

        {/* User footer */}
        <div className="border-t border-white/[0.06] p-3">
          <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/[0.05] transition-colors group cursor-pointer" onClick={logout}>
            <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0">
              <span className="text-[10px] text-white/60 font-medium uppercase">
                {user?.email?.[0] || 'U'}
              </span>
            </div>
            <span className="flex-1 text-[12px] text-white/40 truncate">{user?.email}</span>
            <LogOut className="w-3.5 h-3.5 text-white/20 group-hover:text-white/50 transition-colors" />
          </div>
        </div>
      </aside>

      {docModalKb && (
        <DocumentModal kb={docModalKb} onClose={() => setDocModalKb(null)} />
      )}
    </>
  )
}
