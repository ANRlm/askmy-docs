import React, { useState } from 'react'
import { useAuth } from './hooks/useAuth'
import AuthPage from './components/auth/AuthPage'
import Sidebar from './components/layout/Sidebar'
import ChatArea from './components/chat/ChatArea'
import { ToastProvider } from './components/ui/Toast'
import type { KnowledgeBase, Session } from './types'

export default function App() {
  const { token } = useAuth()
  const [selectedKb, setSelectedKb] = useState<KnowledgeBase | null>(null)
  const [selectedSession, setSelectedSession] = useState<Session | null>(null)

  if (!token) return <ToastProvider><AuthPage /></ToastProvider>

  const handleSelectKb = (kb: KnowledgeBase) => {
    setSelectedKb(kb)
    setSelectedSession(null)
  }

  const handleSelectSession = (session: Session) => {
    setSelectedSession(session)
  }

  const handleNewSession = (session: Session) => {
    setSelectedSession(session)
  }

  const handleSessionRenamed = (session: Session) => {
    if (selectedSession?.id === session.id) {
      setSelectedSession((prev) => prev ? { ...prev, title: session.title } : prev)
    }
  }

  return (
    <ToastProvider>
      <div className="h-screen flex overflow-hidden bg-[#0a0a0a]">
        <Sidebar
          selectedKb={selectedKb}
          selectedSession={selectedSession}
          onSelectKb={handleSelectKb}
          onSelectSession={handleSelectSession}
          onNewSession={handleNewSession}
          onSessionRenamed={handleSessionRenamed}
        />
        <main className="flex-1 flex overflow-hidden">
          <ChatArea kb={selectedKb} session={selectedSession} />
        </main>
      </div>
    </ToastProvider>
  )
}
