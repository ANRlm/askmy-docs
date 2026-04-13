import { useState, useCallback, useRef, useEffect } from 'react'
import { useAuth } from './hooks/useAuth'
import AuthPage from './components/auth/AuthPage'
import Sidebar from './components/layout/Sidebar'
import ChatArea from './components/chat/ChatArea'
import { ToastProvider, useToast } from './components/ui/Toast'
import CommandPalette from './components/ui/CommandPalette'
import KeyboardShortcutsModal from './components/ui/KeyboardShortcutsModal'
import { useCommandPalette } from './hooks/useCommandPalette'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { useBreakpoint } from './hooks/useBreakpoint'
import { useTheme } from './hooks/useTheme'
import type { CommandItem } from './components/ui/CommandPalette'
import type { KnowledgeBase, Session, Message, Source } from './types'
import * as api from './api'
import { Plus, MessageSquare, FolderOpen, Trash2, BookOpen } from 'lucide-react'

function AppInner() {
  const { token } = useAuth()
  const { toast } = useToast()
  const { commandPaletteOpen, openCommandPalette, closeCommandPalette } = useCommandPalette()
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const isMobile = useBreakpoint()
  const { theme, toggleTheme } = useTheme()
  const [commandPaletteItems, setCommandPaletteItems] = useState<CommandItem[]>([])
  const [selectedKb, setSelectedKb] = useState<KnowledgeBase | null>(null)
  const [selectedSession, setSelectedSession] = useState<Session | null>(null)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)

  // Keep a stable ref to toast to avoid loadCommandPaletteItems recreating on every render
  const toastRef = useRef(toast)
  toastRef.current = toast

  // Messages stored per session — switching sessions preserves in-progress streams
  const [messagesBySession, setMessagesBySession] = useState<Map<number, Message[]>>(new Map())
  // Tracks which sessions have been loaded (stable ref, not state)
  const loadedSessionsRef = useRef<Set<number>>(new Set())
  // Tracks which sessions are currently loading history
  const [loadingSessions, setLoadingSessions] = useState<Set<number>>(new Set())
  // Tracks which sessions have an in-progress stream
  const [streamingSessions, setStreamingSessions] = useState<Set<number>>(new Set())

  // Abort controller refs keyed by session id
  const stopRefs = useRef<Map<number, () => void>>(new Map())

  // Accumulated streaming content per session — avoids new Map() on every SSE chunk
  const streamingAccumRef = useRef<Map<number, { content: string; sources: Source[] | null }>>(new Map())
  const flushTimerRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map())

  // Load KBs/sessions for command palette
  const loadCommandPaletteItems = useCallback(async () => {
    try {
      const kbs = await api.listKBs()
      const items: CommandItem[] = [
        {
          id: 'cmd-new-session',
          label: '新建会话',
          sublabel: selectedKb?.name,
          icon: <Plus className="w-3.5 h-3.5" />,
          action: () => {
            if (selectedKb) {
              api.createSession(selectedKb.id).then(handleNewSession).catch((e) => toastRef.current(e.message, 'error'))
            }
          },
          category: 'action',
        },
        {
          id: 'cmd-clear-messages',
          label: '清空当前会话',
          icon: <Trash2 className="w-3.5 h-3.5" />,
          action: () => {
            if (selectedSession) {
              setMessagesBySession((prev) => {
                const next = new Map(prev)
                next.delete(selectedSession.id)
                return next
              })
              toastRef.current('会话已清空', 'success')
            }
          },
          category: 'action',
        },
        {
          id: 'cmd-toggle-sidebar',
          label: sidebarCollapsed ? '展开侧边栏' : '折叠侧边栏',
          icon: <BookOpen className="w-3.5 h-3.5" />,
          action: () => setSidebarCollapsed((c) => !c),
          category: 'action',
        },
      ]

      for (const kb of kbs) {
        items.push({
          id: `kb-${kb.id}`,
          label: kb.name,
          sublabel: '知识库',
          icon: <FolderOpen className="w-3.5 h-3.5" />,
          action: () => handleSelectKb(kb),
          category: 'kb',
        })
        try {
          const sessions = await api.listSessions(kb.id)
          for (const session of sessions) {
            items.push({
              id: `session-${session.id}`,
              label: session.title,
              sublabel: kb.name,
              icon: <MessageSquare className="w-3.5 h-3.5" />,
              action: () => {
                handleSelectKb(kb)
                setTimeout(() => handleSelectSession(session), 50)
              },
              category: 'session',
            })
          }
        } catch {}
      }

      setCommandPaletteItems(items)
    } catch {}
  }, [selectedKb, selectedSession, sidebarCollapsed])

  // Populate command palette when opened
  useEffect(() => {
    if (commandPaletteOpen) {
      loadCommandPaletteItems()
    }
  }, [commandPaletteOpen, loadCommandPaletteItems])

  // Global keyboard shortcuts
  useKeyboardShortcuts([
    { key: 'k', metaKey: true, action: () => commandPaletteOpen ? closeCommandPalette() : openCommandPalette() },
    { key: 'b', metaKey: true, action: () => setSidebarCollapsed((c) => !c) },
    { key: 'n', metaKey: true, action: () => { if (selectedKb) api.createSession(selectedKb.id).then(handleNewSession).catch((e) => toast(e.message, 'error')) } },
    { key: 'Escape', action: () => commandPaletteOpen ? closeCommandPalette() : shortcutsOpen ? setShortcutsOpen(false) : closeCommandPalette() },
    { key: '?', action: () => setShortcutsOpen((o) => !o) },
  ], !!token)

  const flushStreamingContent = useCallback((sessionId: number) => {
    const entry = streamingAccumRef.current.get(sessionId)
    if (!entry) return
    setMessagesBySession((prev) => {
      const list = prev.get(sessionId)
      if (!list) return prev
      return new Map(prev).set(sessionId, list.map((m) =>
        m.id.startsWith(`${sessionId}-a-`) && m.streaming
          ? { ...m, content: entry.content, sources: entry.sources ?? m.sources }
          : m
      ))
    })
  }, [])

  const scheduleFlush = useCallback((sessionId: number) => {
    const existing = flushTimerRef.current.get(sessionId)
    if (existing) clearTimeout(existing)
    const tid = setTimeout(() => {
      flushStreamingContent(sessionId)
      flushTimerRef.current.delete(sessionId)
    }, 50)
    flushTimerRef.current.set(sessionId, tid)
  }, [flushStreamingContent])

  if (!token) {
    return <AuthPage />
  }

  const handleSelectKb = (kb: KnowledgeBase) => {
    setSelectedKb(kb)
    setSelectedSession(null)
  }

  const handleSelectSession = (session: Session) => {
    if (isMobile) setDrawerOpen(false)
    const prev = selectedSession
    if (prev) {
      if (stopRefs.current.has(prev.id)) {
        stopRefs.current.get(prev.id)?.()
        stopRefs.current.delete(prev.id)
        setStreamingSessions((s) => { const n = new Set(s); n.delete(prev.id); return n })
      }
      // Flush accumulated content synchronously before switching away
      flushStreamingContent(prev.id)
      const tid = flushTimerRef.current.get(prev.id)
      if (tid) { clearTimeout(tid); flushTimerRef.current.delete(prev.id) }
      streamingAccumRef.current.delete(prev.id)
    }
    setSelectedSession(session)
  }

  const handleNewSession = (session: Session) => {
    setSelectedSession(session)
    toast(`已创建会话「${session.title}」`, 'success')
  }

  const handleSessionRenamed = (session: Session) => {
    if (selectedSession?.id === session.id) {
      setSelectedSession((prev) => prev ? { ...prev, title: session.title } : prev)
    }
  }

  const handleKbDeleted = (kbId: number) => {
    if (selectedKb?.id === kbId) {
      const prev = selectedSession
      if (prev) {
        if (stopRefs.current.has(prev.id)) {
          stopRefs.current.get(prev.id)?.()
          stopRefs.current.delete(prev.id)
          setStreamingSessions((s) => { const n = new Set(s); n.delete(prev.id); return n })
        }
        const tid = flushTimerRef.current.get(prev.id)
        if (tid) { clearTimeout(tid); flushTimerRef.current.delete(prev.id) }
        streamingAccumRef.current.delete(prev.id)
      }
      setSelectedKb(null)
      setSelectedSession(null)
    }
  }

  // Load history into the Map for a given session
  const loadHistory = useCallback((sessionId: number) => {
    if (loadedSessionsRef.current.has(sessionId)) return
    loadedSessionsRef.current.add(sessionId)
    setLoadingSessions((prev) => new Set(prev).add(sessionId))
    api.getMessages(sessionId).then((msgs) => {
      setMessagesBySession((prev) => {
        const next = new Map(prev)
        next.set(sessionId, msgs.map((m) => ({
          id: `${sessionId}-${m.id}`,
          db_id: m.id,
          role: m.role as 'user' | 'assistant',
          content: m.content,
          sources: m.sources || [],
          created_at: m.created_at,
        })))
        return next
      })
    }).catch(() => {})
    .finally(() => setLoadingSessions((prev) => { const n = new Set(prev); n.delete(sessionId); return n }))
  }, [])

  useEffect(() => {
    if (selectedSession) loadHistory(selectedSession.id)
  }, [selectedSession?.id, loadHistory])

  // Send new message
  const handleSend = useCallback((text: string) => {
    const sess = selectedSession
    if (!text.trim() || !sess || streamingSessions.has(sess.id)) return

    const userMsgId = `${sess.id}-u-${Date.now()}`
    const assistantMsgId = `${sess.id}-a-${Date.now()}`

    setMessagesBySession((prev) => {
      const next = new Map(prev)
      next.set(sess.id, [...(next.get(sess.id) ?? []), { id: userMsgId, role: 'user', content: text }, { id: assistantMsgId, role: 'assistant', content: '', streaming: true }])
      return next
    })
    setStreamingSessions((s) => new Set(s).add(sess.id))

    const stop = api.chatStream(
      sess.id, text,
      (chunk) => {
        const entry = streamingAccumRef.current.get(sess.id) ?? { content: '', sources: null }
        entry.content += chunk
        streamingAccumRef.current.set(sess.id, entry)
        scheduleFlush(sess.id)
      },
      (sources) => {
        const entry = streamingAccumRef.current.get(sess.id) ?? { content: '', sources: null }
        entry.sources = sources
        streamingAccumRef.current.set(sess.id, entry)
        scheduleFlush(sess.id)
      },
      (dbMsgId) => {
        flushStreamingContent(sess.id)
        streamingAccumRef.current.delete(sess.id)
        const tid = flushTimerRef.current.get(sess.id)
        if (tid) { clearTimeout(tid); flushTimerRef.current.delete(sess.id) }
        setMessagesBySession((prev) => {
          const list = prev.get(sess.id)
          if (!list) return prev
          return new Map(prev).set(sess.id, list.map((m) => m.id === assistantMsgId ? { ...m, streaming: false, db_id: dbMsgId } : m))
        })
      },
      (err) => {
        flushStreamingContent(sess.id)
        streamingAccumRef.current.delete(sess.id)
        const tid = flushTimerRef.current.get(sess.id)
        if (tid) { clearTimeout(tid); flushTimerRef.current.delete(sess.id) }
        setMessagesBySession((prev) => {
          const list = prev.get(sess.id)
          if (!list) return prev
          return new Map(prev).set(sess.id, list.map((m) => m.id === assistantMsgId ? { ...m, content: `错误: ${err}`, streaming: false } : m))
        })
      },
    )
    stopRefs.current.set(sess.id, stop)
  }, [selectedSession, streamingSessions])

  // Retrace (edit + regenerate)
  const handleRetrace = useCallback((targetDbId: number, newContent: string) => {
    const sess = selectedSession
    if (!sess || streamingSessions.has(sess.id)) return

    setMessagesBySession((prev) => {
      const next = new Map(prev)
      const list = next.get(sess.id) ?? []
      const idx = list.findIndex((m) => m.db_id === targetDbId)
      if (idx !== -1) next.set(sess.id, list.slice(0, idx))
      return next
    })

    const userMsgId = `${sess.id}-u-${Date.now()}`
    const assistantMsgId = `${sess.id}-a-${Date.now()}`

    setMessagesBySession((prev) => {
      const next = new Map(prev)
      const list = next.get(sess.id) ?? []
      next.set(sess.id, [...list, { id: userMsgId, role: 'user', content: newContent }, { id: assistantMsgId, role: 'assistant', content: '', streaming: true }])
      return next
    })
    setStreamingSessions((s) => new Set(s).add(sess.id))

    const stop = api.retraceChat(
      sess.id, targetDbId, newContent,
      (chunk) => {
        const entry = streamingAccumRef.current.get(sess.id) ?? { content: '', sources: null }
        entry.content += chunk
        streamingAccumRef.current.set(sess.id, entry)
        scheduleFlush(sess.id)
      },
      (sources) => {
        const entry = streamingAccumRef.current.get(sess.id) ?? { content: '', sources: null }
        entry.sources = sources
        streamingAccumRef.current.set(sess.id, entry)
        scheduleFlush(sess.id)
      },
      (assistantDbId) => {
        flushStreamingContent(sess.id)
        streamingAccumRef.current.delete(sess.id)
        const tid = flushTimerRef.current.get(sess.id)
        if (tid) { clearTimeout(tid); flushTimerRef.current.delete(sess.id) }
        setMessagesBySession((prev) => {
          const list = prev.get(sess.id)
          if (!list) return prev
          return new Map(prev).set(sess.id, list.map((m) => m.id === assistantMsgId ? { ...m, streaming: false, db_id: assistantDbId } : m))
        })
      },
      (err) => {
        flushStreamingContent(sess.id)
        streamingAccumRef.current.delete(sess.id)
        const tid = flushTimerRef.current.get(sess.id)
        if (tid) { clearTimeout(tid); flushTimerRef.current.delete(sess.id) }
        setMessagesBySession((prev) => {
          const list = prev.get(sess.id)
          if (!list) return prev
          return new Map(prev).set(sess.id, list.map((m) => m.id === assistantMsgId ? { ...m, content: `错误: ${err}`, streaming: false } : m))
        })
      },
      (userDbId) => setMessagesBySession((prev) => {
        const list = prev.get(sess.id)
        if (!list) return prev
        return new Map(prev).set(sess.id, list.map((m) => m.id === userMsgId ? { ...m, db_id: userDbId } : m))
      }),
    )
    stopRefs.current.set(sess.id, stop)
  }, [selectedSession, streamingSessions])

  // Stop streaming
  const handleStop = useCallback(() => {
    const sess = selectedSession
    if (!sess) return
    stopRefs.current.get(sess.id)?.()
    stopRefs.current.delete(sess.id)
    setStreamingSessions((s) => { const n = new Set(s); n.delete(sess.id); return n })
    flushStreamingContent(sess.id)
    streamingAccumRef.current.delete(sess.id)
    const tid = flushTimerRef.current.get(sess.id)
    if (tid) { clearTimeout(tid); flushTimerRef.current.delete(sess.id) }
    setMessagesBySession((prev) => {
      const list = prev.get(sess.id)
      if (!list) return prev
      return new Map(prev).set(sess.id, list.map((m) => m.streaming ? { ...m, streaming: false } : m))
    })
  }, [selectedSession, flushStreamingContent])

  const currentMessages = selectedSession ? (messagesBySession.get(selectedSession.id) ?? []) : []
  const isStreaming = selectedSession ? streamingSessions.has(selectedSession.id) : false
  const isLoadingMessages = selectedSession ? loadingSessions.has(selectedSession.id) : false

  return (
    <div className="h-screen flex overflow-hidden" style={{ background: 'var(--bg-base)' }}>
      <Sidebar
        selectedKb={selectedKb}
        selectedSession={selectedSession}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((c) => !c)}
        onSelectKb={handleSelectKb}
        onSelectSession={handleSelectSession}
        onNewSession={handleNewSession}
        onSessionRenamed={handleSessionRenamed}
        onKbDeleted={handleKbDeleted}
        onKbUpdated={(kb) => { if (selectedKb?.id === kb.id) setSelectedKb(kb) }}
        isMobile={isMobile}
        drawerOpen={drawerOpen}
        onCloseDrawer={() => setDrawerOpen(false)}
        theme={theme}
        onToggleTheme={toggleTheme}
      />
      <main className="flex-1 flex overflow-hidden">
        <ChatArea
          kb={selectedKb}
          session={selectedSession}
          messages={currentMessages}
          isStreaming={isStreaming}
          isLoadingMessages={isLoadingMessages}
          onSend={handleSend}
          onStop={handleStop}
          onRetrace={handleRetrace}
          isMobile={isMobile}
          onOpenDrawer={() => setDrawerOpen(true)}
          onDelete={(msgId) => {
            setMessagesBySession((prev) => {
              const list = prev.get(selectedSession!.id)
              if (!list) return prev
              return new Map(prev).set(selectedSession!.id, list.filter((m) => m.id !== msgId))
            })
          }}
        />
      </main>
      <CommandPalette
        open={commandPaletteOpen}
        onClose={closeCommandPalette}
        items={commandPaletteItems}
      />
      <KeyboardShortcutsModal
        open={shortcutsOpen}
        onClose={() => setShortcutsOpen(false)}
        categories={[
          {
            name: '全局',
            shortcuts: [
              { key: '?', label: '快捷键帮助' },
              { key: 'Cmd+K', label: '命令面板' },
              { key: 'Cmd+B', label: '折叠/展开侧边栏' },
              { key: 'Cmd+N', label: '新建会话' },
            ],
          },
          {
            name: '会话',
            shortcuts: [
              { key: 'Enter', label: '发送消息' },
              { key: 'Shift+Enter', label: '换行' },
              { key: 'Escape', label: '关闭弹窗/停止生成' },
            ],
          },
          {
            name: '导航',
            shortcuts: [
              { key: 'ArrowUp/Down', label: '命令面板中选择' },
              { key: 'Enter', label: '执行命令面板选项' },
            ],
          },
        ]}
      />
    </div>
  )
}

export default function App() {
  return (
    <ToastProvider>
      <AppInner />
    </ToastProvider>
  )
}
