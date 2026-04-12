import React, { useState, useCallback, useRef, useEffect } from 'react'
import { useAuth } from './hooks/useAuth'
import AuthPage from './components/auth/AuthPage'
import Sidebar from './components/layout/Sidebar'
import ChatArea from './components/chat/ChatArea'
import { ToastProvider } from './components/ui/Toast'
import type { KnowledgeBase, Session, Message } from './types'
import * as api from './api'

export default function App() {
  const { token } = useAuth()
  const [selectedKb, setSelectedKb] = useState<KnowledgeBase | null>(null)
  const [selectedSession, setSelectedSession] = useState<Session | null>(null)

  // Messages stored per session — switching sessions preserves in-progress streams
  const [messagesBySession, setMessagesBySession] = useState<Map<number, Message[]>>(new Map())
  // Tracks which sessions have an in-progress stream
  const [streamingSessions, setStreamingSessions] = useState<Set<number>>(new Set())

  // Abort controller refs keyed by session id
  const stopRefs = useRef<Map<number, () => void>>(new Map())

  if (!token) return <ToastProvider><AuthPage /></ToastProvider>

  const handleSelectKb = (kb: KnowledgeBase) => {
    setSelectedKb(kb)
    setSelectedSession(null)
  }

  const handleSelectSession = (session: Session) => {
    const prev = selectedSession
    if (prev && stopRefs.current.has(prev.id)) {
      stopRefs.current.get(prev.id)?.()
      stopRefs.current.delete(prev.id)
      setStreamingSessions((s) => { const n = new Set(s); n.delete(prev.id); return n })
    }
    setSelectedSession(session)
  }

  const handleNewSession = (session: Session) => setSelectedSession(session)

  const handleSessionRenamed = (session: Session) => {
    if (selectedSession?.id === session.id) {
      setSelectedSession((prev) => prev ? { ...prev, title: session.title } : prev)
    }
  }

  // Load history into the Map for a given session
  const loadHistory = useCallback((sessionId: number) => {
    if (messagesBySession.has(sessionId)) return
    api.getMessages(sessionId).then((msgs) => {
      setMessagesBySession((prev) => {
        const next = new Map(prev)
        next.set(sessionId, msgs.map((m) => ({
          id: `${sessionId}-${m.id}`,
          db_id: m.id,
          role: m.role as 'user' | 'assistant',
          content: m.content,
          sources: m.sources || [],
        })))
        return next
      })
    }).catch(() => {})
  }, [messagesBySession])

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
      (chunk) => setMessagesBySession((prev) => {
        const next = new Map(prev)
        const list = next.get(sess.id) ?? []
        next.set(sess.id, list.map((m) => m.id === assistantMsgId ? { ...m, content: m.content + chunk } : m))
        return next
      }),
      (sources) => setMessagesBySession((prev) => {
        const next = new Map(prev)
        const list = next.get(sess.id) ?? []
        next.set(sess.id, list.map((m) => m.id === assistantMsgId ? { ...m, sources } : m))
        return next
      }),
      (dbMsgId) => setMessagesBySession((prev) => {
        const next = new Map(prev)
        const list = next.get(sess.id) ?? []
        next.set(sess.id, list.map((m) => m.id === assistantMsgId ? { ...m, streaming: false, db_id: dbMsgId } : m))
        return next
      }),
      (err) => setMessagesBySession((prev) => {
        const next = new Map(prev)
        const list = next.get(sess.id) ?? []
        next.set(sess.id, list.map((m) => m.id === assistantMsgId ? { ...m, content: `错误: ${err}`, streaming: false } : m))
        return next
      }),
    )
    stopRefs.current.set(sess.id, stop)
  }, [selectedSession, streamingSessions])

  // Retrace (edit + regenerate)
  const handleRetrace = useCallback((targetDbId: number, newContent: string) => {
    const sess = selectedSession
    if (!sess || streamingSessions.has(sess.id)) return

    // Truncate from target message
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
      (chunk) => setMessagesBySession((prev) => {
        const next = new Map(prev)
        const list = next.get(sess.id) ?? []
        next.set(sess.id, list.map((m) => m.id === assistantMsgId ? { ...m, content: m.content + chunk } : m))
        return next
      }),
      (sources) => setMessagesBySession((prev) => {
        const next = new Map(prev)
        const list = next.get(sess.id) ?? []
        next.set(sess.id, list.map((m) => m.id === assistantMsgId ? { ...m, sources } : m))
        return next
      }),
      (assistantDbId) => setMessagesBySession((prev) => {
        const next = new Map(prev)
        const list = next.get(sess.id) ?? []
        next.set(sess.id, list.map((m) => m.id === assistantMsgId ? { ...m, streaming: false, db_id: assistantDbId } : m))
        return next
      }),
      (err) => setMessagesBySession((prev) => {
        const next = new Map(prev)
        const list = next.get(sess.id) ?? []
        next.set(sess.id, list.map((m) => m.id === assistantMsgId ? { ...m, content: `错误: ${err}`, streaming: false } : m))
        return next
      }),
      (userDbId) => setMessagesBySession((prev) => {
        const next = new Map(prev)
        const list = next.get(sess.id) ?? []
        next.set(sess.id, list.map((m) => m.id === userMsgId ? { ...m, db_id: userDbId } : m))
        return next
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
    setMessagesBySession((prev) => {
      const next = new Map(prev)
      const list = next.get(sess.id) ?? []
      next.set(sess.id, list.map((m) => m.streaming ? { ...m, streaming: false } : m))
      return next
    })
  }, [selectedSession])

  const currentMessages = selectedSession ? (messagesBySession.get(selectedSession.id) ?? []) : []
  const isStreaming = selectedSession ? streamingSessions.has(selectedSession.id) : false

  return (
    <ToastProvider>
      <div className="h-screen flex overflow-hidden" style={{ background: 'var(--bg-base)' }}>
        <Sidebar
          selectedKb={selectedKb}
          selectedSession={selectedSession}
          onSelectKb={handleSelectKb}
          onSelectSession={handleSelectSession}
          onNewSession={handleNewSession}
          onSessionRenamed={handleSessionRenamed}
        />
        <main className="flex-1 flex overflow-hidden">
          <ChatArea
            kb={selectedKb}
            session={selectedSession}
            messages={currentMessages}
            isStreaming={isStreaming}
            onSend={handleSend}
            onStop={handleStop}
            onRetrace={handleRetrace}
          />
        </main>
      </div>
    </ToastProvider>
  )
}
