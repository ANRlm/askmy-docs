import { useState, useEffect, useRef } from 'react'
import {
  Plus, Trash2, FolderOpen, MessageSquare, ChevronDown, ChevronRight,
  BookOpen, LogOut, Search, X, Files, Sliders, Sun, Moon, Monitor, Pencil,
} from 'lucide-react'
import * as api from '../../api'
import type { KnowledgeBase, Session } from '../../types'
import { useAuth } from '../../hooks/useAuth'
import DocumentModal from '../kb/DocumentModal'
import KbSettingsModal from '../kb/KbSettingsModal'
import ConfirmDialog from '../ui/ConfirmDialog'
import type { ThemePref } from '../../hooks/useTheme'

interface Props {
  selectedKb: KnowledgeBase | null
  selectedSession: Session | null
  collapsed: boolean
  onToggleCollapse: () => void
  onSelectKb: (kb: KnowledgeBase) => void
  onSelectSession: (session: Session) => void
  onNewSession: (session: Session) => void
  onSessionRenamed?: (session: Session) => void
  onKbDeleted?: (kbId: number) => void
  onKbUpdated?: (kb: KnowledgeBase) => void
  isMobile?: boolean
  drawerOpen?: boolean
  onCloseDrawer?: () => void
  theme?: ThemePref
  onToggleTheme?: () => void
}

export default function Sidebar({
  selectedKb, selectedSession, collapsed, onToggleCollapse,
  onSelectKb, onSelectSession, onNewSession, onSessionRenamed, onKbDeleted, onKbUpdated,
  isMobile, drawerOpen, onCloseDrawer, theme = 'system', onToggleTheme,
}: Props) {
  const { user, logout } = useAuth()
  const [kbs, setKbs] = useState<KnowledgeBase[]>([])
  const [sessionsByKb, setSessionsByKb] = useState<Map<number, Session[]>>(new Map())
  const [expandedKb, setExpandedKb] = useState<number | null>(null)
  const [docModalKb, setDocModalKb] = useState<KnowledgeBase | null>(null)
  const [settingsModalKb, setSettingsModalKb] = useState<KnowledgeBase | null>(null)
  const [creating, setCreating] = useState(false)
  const [newKbName, setNewKbName] = useState('')
  const [newKbDesc, setNewKbDesc] = useState('')
  const [searchQuery, setSearchQuery] = useState('')

  const [renamingSessionId, setRenamingSessionId] = useState<number | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const renameInputRef = useRef<HTMLInputElement>(null)

  const [renamingKbId, setRenamingKbId] = useState<number | null>(null)
  const [renameKbValue, setRenameKbValue] = useState('')
  const renameKbInputRef = useRef<HTMLInputElement>(null)

  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean
    title: string
    message?: string
    destructive?: boolean
    onConfirm: () => void
  } | null>(null)

  const loadSessionsAbortRef = useRef<AbortController | null>(null)

  const loadKbs = async () => {
    try { setKbs(await api.listKBs()) } catch {}
  }

  const loadSessions = async (kbId: number) => {
    if (loadSessionsAbortRef.current) {
      loadSessionsAbortRef.current.abort()
    }
    const controller = new AbortController()
    loadSessionsAbortRef.current = controller
    try {
      const data = await api.listSessions(kbId, controller.signal)
      if (!controller.signal.aborted) {
        setSessionsByKb((prev) => new Map(prev).set(kbId, data))
      }
    } catch {}
  }

  useEffect(() => { loadKbs() }, [])

  useEffect(() => {
    if (selectedKb) loadSessions(selectedKb.id)
  }, [selectedKb])

  useEffect(() => {
    if (renamingSessionId !== null) {
      renameInputRef.current?.focus()
      renameInputRef.current?.select()
    }
  }, [renamingSessionId])

  useEffect(() => {
    if (renamingKbId !== null) {
      renameKbInputRef.current?.focus()
      renameKbInputRef.current?.select()
    }
  }, [renamingKbId])

  const handleSelectKb = (kb: KnowledgeBase) => {
    setExpandedKb(expandedKb === kb.id ? null : kb.id)
    onSelectKb(kb)
    loadSessions(kb.id)
  }

  const handleNewSession = async (kb: KnowledgeBase) => {
    try {
      const session = await api.createSession(kb.id)
      setSessionsByKb((prev) => {
        const next = new Map(prev)
        next.set(kb.id, [session, ...(next.get(kb.id) ?? [])])
        return next
      })
      onNewSession(session)
    } catch {}
  }

  const handleDeleteSession = (e: React.MouseEvent, sessionId: number, kbId: number) => {
    e.stopPropagation()
    setConfirmDialog({
      open: true,
      title: '删除会话',
      message: '确定删除此会话？此操作不可撤销。',
      destructive: true,
      onConfirm: async () => {
        try {
          await api.deleteSession(sessionId)
          setSessionsByKb((prev) => {
            const next = new Map(prev)
            next.set(kbId, (next.get(kbId) ?? []).filter((s) => s.id !== sessionId))
            return next
          })
        } catch {}
      },
    })
  }

  const handleRenameSubmit = async (sessionId: number) => {
    const trimmed = renameValue.trim()
    if (!trimmed) { setRenamingSessionId(null); return }
    try {
      const updated = await api.renameSession(sessionId, trimmed)
      setSessionsByKb((prev) => {
        const next = new Map(prev)
        for (const [kbId, list] of next) {
          const idx = list.findIndex((s) => s.id === sessionId)
          if (idx !== -1) {
            const newList = [...list]
            newList[idx] = { ...newList[idx], title: updated.title }
            next.set(kbId, newList)
            break
          }
        }
        return next
      })
      onSessionRenamed?.(updated)
    } catch {}
    setRenamingSessionId(null)
  }

  const handleRenameKeyDown = (e: React.KeyboardEvent, sessionId: number) => {
    if (e.key === 'Enter') handleRenameSubmit(sessionId)
    if (e.key === 'Escape') setRenamingSessionId(null)
  }

  const handleRenameKb = (kb: KnowledgeBase) => {
    setRenamingKbId(kb.id)
    setRenameKbValue(kb.name)
  }

  const handleRenameKbSubmit = async (kbId: number) => {
    const trimmed = renameKbValue.trim()
    if (!trimmed) { setRenamingKbId(null); return }
    try {
      const updated = await api.updateKB(kbId, { name: trimmed })
      setKbs((prev) => prev.map((k) => k.id === kbId ? { ...k, name: updated.name } : k))
      onKbUpdated?.(updated)
    } catch {}
    setRenamingKbId(null)
  }

  const handleRenameKbKeyDown = (e: React.KeyboardEvent, kbId: number) => {
    if (e.key === 'Enter') handleRenameKbSubmit(kbId)
    if (e.key === 'Escape') setRenamingKbId(null)
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

  const handleDeleteKb = (e: React.MouseEvent, kbId: number) => {
    e.stopPropagation()
    setConfirmDialog({
      open: true,
      title: '删除知识库',
      message: '确定删除此知识库？所有文档和会话将被永久删除。此操作不可撤销。',
      destructive: true,
      onConfirm: async () => {
        try {
          await api.deleteKB(kbId)
          setKbs((prev) => prev.filter((k) => k.id !== kbId))
          setSessionsByKb((prev) => { const n = new Map(prev); n.delete(kbId); return n })
          onKbDeleted?.(kbId)
        } catch {}
      },
    })
  }

  const q = searchQuery.trim().toLowerCase()
  const filteredKbs = q
    ? kbs.filter(
        (kb) =>
          kb.name.toLowerCase().includes(q) ||
          (sessionsByKb.get(kb.id) ?? []).some((s) => s.title.toLowerCase().includes(q))
      )
    : kbs

  const collapsedWidth = 56

  const sidebarBody = (
    <div
      className={`flex flex-col h-full ${isMobile ? 'w-[280px] max-w-[85vw]' : ''}`}
      style={{ background: 'var(--bg-sidebar)', width: isMobile ? undefined : (collapsed ? collapsedWidth : 240) }}
    >
      {/* Header */}
      <div
        className="w-full px-2 py-3 flex flex-col items-center gap-2"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        {/* Logo Icon */}
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: 'var(--bg-active)', border: '1px solid var(--border-strong)' }}
        >
          <BookOpen className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
        </div>

        {/* Full logo text (visible when expanded) */}
        {!collapsed && !isMobile && (
          <span
            className="font-semibold text-[13px] tracking-tight text-center w-full truncate px-1"
            style={{ color: 'var(--text-primary)' }}
          >
            AskMyDocs
          </span>
        )}
      </div>

      {/* Desktop collapse toggle */}
      {!isMobile && (
        <button
          onClick={onToggleCollapse}
          className="absolute top-1/2 -translate-y-1/2 interactive-icon w-5 h-5 rounded flex items-center justify-center"
          style={{
            color: 'var(--text-tertiary)',
            left: collapsed ? '50%' : 'auto',
            right: collapsed ? 'auto' : '8px',
            transform: collapsed ? 'translateX(-50%) translateY(-50%)' : 'translateY(-50%)',
          }}
          aria-label={collapsed ? '展开侧边栏' : '折叠侧边栏'}
        >
          <ChevronRight className={`w-3.5 h-3.5 transition-transform duration-200 ${collapsed ? '' : 'rotate-180'}`} />
        </button>
      )}

        {/* Search — hidden when collapsed */}
        {!collapsed && (
        <div className="px-3 py-2.5" style={{ borderBottom: '1px solid var(--border)' }}>
          <div
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg"
            style={{
              background: 'var(--bg-input)',
              border: '1px solid var(--border)',
              transition: 'border-color 0.15s, box-shadow 0.15s',
            }}
          >
            <Search className="w-3 h-3 flex-shrink-0" style={{ color: 'var(--text-disabled)' }} />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索..."
              className="flex-1 bg-transparent text-[12px] focus:outline-none min-w-0"
              style={{ color: 'var(--text-primary)' }}
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} style={{ color: 'var(--text-tertiary)' }} aria-label="清除搜索">
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
        )}

        {/* KB List */}
        {!collapsed && (
        <div className="flex-1 overflow-y-auto py-1.5">
          {/* Section header */}
          <div className="flex items-center justify-between px-3.5 pb-1.5 pt-1">
            <span
              className="text-[10.5px] font-semibold uppercase tracking-widest"
              style={{ color: 'var(--text-disabled)', letterSpacing: '0.08em' }}
            >
              知识库
            </span>
            <button
              onClick={() => setCreating(!creating)}
              className="interactive-icon w-5 h-5 flex items-center justify-center rounded-md"
              style={{ color: 'var(--text-tertiary)' }}
              aria-label="新建知识库"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Create form */}
          {creating && (
            <form
              onSubmit={handleCreateKb}
              className="mx-2.5 mb-2 p-3 rounded-xl space-y-2 animate-slide-down"
              style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)' }}
            >
              <input
                autoFocus
                value={newKbName}
                onChange={(e) => setNewKbName(e.target.value)}
                placeholder="知识库名称"
                className="w-full px-2.5 py-1.5 rounded-lg text-[12px] focus:outline-none"
                style={{
                  background: 'var(--bg-input)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-primary)',
                  transition: 'border-color 0.15s',
                }}
              />
              <input
                value={newKbDesc}
                onChange={(e) => setNewKbDesc(e.target.value)}
                placeholder="简介（可选）"
                className="w-full px-2.5 py-1.5 rounded-lg text-[12px] focus:outline-none"
                style={{
                  background: 'var(--bg-input)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-primary)',
                  transition: 'border-color 0.15s',
                }}
              />
              <div className="flex gap-1.5">
                <button
                  type="submit"
                  className="flex-1 py-1.5 rounded-lg text-[12px] font-medium interactive"
                  style={{ background: 'var(--text-primary)', color: 'var(--bg-base)' }}
                >
                  创建
                </button>
                <button
                  type="button"
                  onClick={() => setCreating(false)}
                  className="flex-1 py-1.5 rounded-lg text-[12px] interactive"
                  style={{ background: 'var(--bg-active)', color: 'var(--text-secondary)' }}
                >
                  取消
                </button>
              </div>
            </form>
          )}

          {/* KB items */}
          {filteredKbs.map((kb) => (
            <div key={kb.id}>
              {/* KB row */}
              <div
                className="flex items-center gap-1.5 mx-1 my-0.5 rounded-lg cursor-pointer group"
                style={{
                  background: selectedKb?.id === kb.id ? 'var(--bg-active)' : 'transparent',
                  color: selectedKb?.id === kb.id ? 'var(--text-primary)' : 'var(--text-secondary)',
                  transition: 'background 0.15s',
                  padding: '6px 10px',
                }}
                onClick={() => handleSelectKb(kb)}
              >
                <span className="flex-shrink-0 w-3.5 h-3.5 flex items-center justify-center" style={{ color: 'var(--text-tertiary)' }}>
                  {expandedKb === kb.id
                    ? <ChevronDown className="w-3 h-3" />
                    : <ChevronRight className="w-3 h-3" />
                  }
                </span>
                <FolderOpen className="w-3.5 h-3.5 flex-shrink-0" style={{ color: selectedKb?.id === kb.id ? 'var(--text-primary)' : 'var(--text-tertiary)' }} />
                {renamingKbId === kb.id ? (
                  <input
                    ref={renameKbInputRef}
                    value={renameKbValue}
                    onChange={(e) => setRenameKbValue(e.target.value)}
                    onBlur={() => handleRenameKbSubmit(kb.id)}
                    onKeyDown={(e) => handleRenameKbKeyDown(e, kb.id)}
                    onClick={(e) => e.stopPropagation()}
                    className="flex-1 text-[13px] rounded px-1.5 py-0.5 focus:outline-none min-w-0"
                    style={{
                      background: 'var(--bg-input)',
                      border: '1px solid var(--border-accent)',
                      color: 'var(--text-primary)',
                    }}
                  />
                ) : (
                  <span className="flex-1 text-[13px] text-left truncate font-medium">
                    {kb.name}
                  </span>
                )}
                {/* Action buttons */}
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => { e.stopPropagation(); handleRenameKb(kb) }}
                    className="interactive-icon p-1 rounded-md"
                    style={{ color: 'var(--text-tertiary)' }}
                    aria-label="重命名知识库"
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setDocModalKb(kb) }}
                    className="interactive-icon p-1 rounded-md"
                    style={{ color: 'var(--text-tertiary)' }}
                    aria-label="管理文档"
                  >
                    <Files className="w-3 h-3" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setSettingsModalKb(kb) }}
                    className="interactive-icon p-1 rounded-md"
                    style={{ color: 'var(--text-tertiary)' }}
                    aria-label="知识库设置"
                  >
                    <Sliders className="w-3 h-3" />
                  </button>
                  <button
                    onClick={(e) => handleDeleteKb(e, kb.id)}
                    className="interactive-icon p-1 rounded-md"
                    style={{ color: 'var(--text-tertiary)' }}
                    aria-label="删除知识库"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>

              {/* Sessions */}
              {expandedKb === kb.id && (
                <div
                  className="ml-5 mr-1 mb-1"
                  style={{ borderLeft: '1px solid var(--border)' }}
                >
                  {/* New session button */}
                  <button
                    onClick={() => handleNewSession(kb)}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px] rounded-lg mx-0.5 interactive"
                    style={{ color: 'var(--text-tertiary)' }}
                  >
                    <Plus className="w-3 h-3" />
                    <span>新建会话</span>
                  </button>

                  {/* Session items */}
                  {(sessionsByKb.get(kb.id) ?? [])
                    .filter((s) => !q || s.title.toLowerCase().includes(q))
                    .map((session) => (
                      <div
                        key={session.id}
                        onClick={() => renamingSessionId !== session.id && onSelectSession(session)}
                        className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg mx-0.5 group cursor-pointer"
                        style={{
                          background: selectedSession?.id === session.id ? 'var(--bg-active)' : 'transparent',
                          color: selectedSession?.id === session.id ? 'var(--text-primary)' : 'var(--text-tertiary)',
                          transition: 'background 0.15s',
                        }}
                      >
                        <MessageSquare className="w-3 h-3 flex-shrink-0" style={{ color: 'var(--text-disabled)' }} />

                        {renamingSessionId === session.id ? (
                          <input
                            ref={renameInputRef}
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onBlur={() => handleRenameSubmit(session.id)}
                            onKeyDown={(e) => handleRenameKeyDown(e, session.id)}
                            onClick={(e) => e.stopPropagation()}
                            className="flex-1 text-[12px] rounded px-1.5 py-0.5 focus:outline-none min-w-0"
                            style={{
                              background: 'var(--bg-input)',
                              border: '1px solid var(--border-accent)',
                              color: 'var(--text-primary)',
                            }}
                          />
                        ) : (
                          <span className="flex-1 text-[12px] truncate font-medium">
                            {session.title}
                          </span>
                        )}

                        <button
                          onClick={(e) => { e.stopPropagation(); setRenamingSessionId(session.id); setRenameValue(session.title) }}
                          className="opacity-0 group-hover:opacity-100 p-0.5 rounded transition-opacity interactive-icon"
                          style={{ color: 'var(--text-tertiary)' }}
                          aria-label="重命名会话"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                        <button
                          onClick={(e) => handleDeleteSession(e, session.id, kb.id)}
                          className="opacity-0 group-hover:opacity-100 p-0.5 rounded transition-opacity interactive-icon"
                          style={{ color: 'var(--text-tertiary)' }}
                          aria-label="删除会话"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                </div>
              )}
            </div>
          ))}

          {/* Empty state */}
          {kbs.length === 0 && !creating && (
            <div
              className="flex flex-col items-center justify-center py-12 text-center px-4"
            >
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center mb-3"
                style={{ background: 'var(--bg-hover)' }}
              >
                <FolderOpen className="w-5 h-5" style={{ color: 'var(--text-disabled)' }} />
              </div>
              <p className="text-[12px] font-medium" style={{ color: 'var(--text-tertiary)' }}>暂无知识库</p>
              <p className="text-[11px] mt-1" style={{ color: 'var(--text-disabled)' }}>点击上方 + 创建</p>
            </div>
          )}
        </div>
        )}

        {/* User footer */}
        {!collapsed && (
        <div className="p-2.5 flex flex-col gap-1" style={{ borderTop: '1px solid var(--border)' }}>
          <button
            onClick={onToggleTheme}
            className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl cursor-pointer group interactive w-full"
          >
            <div
              className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ background: 'var(--bg-active)', border: '1px solid var(--border-strong)', color: 'var(--text-secondary)' }}
            >
              {theme === 'dark' ? <Moon className="w-3 h-3" /> : theme === 'light' ? <Sun className="w-3 h-3" /> : <Monitor className="w-3 h-3" />}
            </div>
            <span
              className="flex-1 text-[12px] truncate font-medium"
              style={{ color: 'var(--text-tertiary)', transition: 'color 0.15s' }}
            >
              {theme === 'dark' ? '深色模式' : theme === 'light' ? '浅色模式' : '跟随系统'}
            </span>
          </button>
          <div
            className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl cursor-pointer group interactive"
            onClick={logout}
          >
            <div
              className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-medium uppercase"
              style={{ background: 'var(--bg-active)', border: '1px solid var(--border-strong)', color: 'var(--text-secondary)' }}
            >
              {user?.email?.[0] || 'U'}
            </div>
            <span
              className="flex-1 text-[12px] truncate font-medium"
              style={{ color: 'var(--text-tertiary)', transition: 'color 0.15s' }}
            >
              {user?.email}
            </span>
            <LogOut
              className="w-3.5 h-3.5"
              style={{ color: 'var(--text-disabled)' }}
              aria-label="退出登录"
            />
          </div>
        </div>
        )}
    </div>
  )

  // Mobile: render as overlay drawer with backdrop
  if (isMobile) {
    if (!drawerOpen) return null
    return (
      <>
        {/* Backdrop */}
        <div
          className="fixed inset-0 z-40 animate-fade-in"
          style={{ background: 'rgba(0,0,0,0.5)' }}
          onClick={onCloseDrawer}
          aria-hidden="true"
        />
        {/* Drawer */}
        <div
          className="fixed left-0 top-0 bottom-0 z-50 animate-slide-right flex-shrink-0 flex flex-col h-full"
          style={{ width: '280px', maxWidth: '85vw' }}
        >
          {sidebarBody}
        </div>
        {docModalKb && (
          <DocumentModal kb={docModalKb} onClose={() => setDocModalKb(null)} />
        )}
        {settingsModalKb && (
          <KbSettingsModal
            kb={settingsModalKb}
            onClose={() => setSettingsModalKb(null)}
            onUpdated={(updated) => {
              setKbs((prev) => prev.map((k) => k.id === updated.id ? updated : k))
              onKbUpdated?.(updated)
            }}
          />
        )}
        {confirmDialog && (
          <ConfirmDialog
            open={confirmDialog.open}
            title={confirmDialog.title}
            message={confirmDialog.message}
            confirmLabel="删除"
            cancelLabel="取消"
            destructive={confirmDialog.destructive}
            onConfirm={() => {
              confirmDialog.onConfirm()
              setConfirmDialog(null)
            }}
            onCancel={() => setConfirmDialog(null)}
          />
        )}
      </>
    )
  }

  // Desktop: inline sidebar
  return (
    <>
      <aside
        className="flex-shrink-0 flex flex-col h-full sidebar-collapse relative"
        style={{
          width: collapsed ? collapsedWidth : 240,
          minWidth: collapsed ? collapsedWidth : 240,
          background: 'var(--bg-sidebar)',
          borderRight: '1px solid var(--border)',
        }}
      >
        {sidebarBody}
      </aside>
      {docModalKb && (
        <DocumentModal kb={docModalKb} onClose={() => setDocModalKb(null)} />
      )}
      {settingsModalKb && (
        <KbSettingsModal
          kb={settingsModalKb}
          onClose={() => setSettingsModalKb(null)}
          onUpdated={(updated) => {
            setKbs((prev) => prev.map((k) => k.id === updated.id ? updated : k))
            onKbUpdated?.(updated)
          }}
        />
      )}
      {confirmDialog && (
        <ConfirmDialog
          open={confirmDialog.open}
          title={confirmDialog.title}
          message={confirmDialog.message}
          confirmLabel="删除"
          cancelLabel="取消"
          destructive={confirmDialog.destructive}
          onConfirm={() => {
            confirmDialog.onConfirm()
            setConfirmDialog(null)
          }}
          onCancel={() => setConfirmDialog(null)}
        />
      )}
    </>
  )
}
