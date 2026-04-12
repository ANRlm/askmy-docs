import React, { useState, useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  Mic, MicOff, Volume2, VolumeX, ChevronDown, ChevronRight,
  FileText, Square, ArrowUp, Loader2, ThumbsUp, ThumbsDown,
  Pencil, X, RotateCcw,
} from 'lucide-react'
import type { Message, Session, KnowledgeBase, Source } from '../../types'
import * as api from '../../api'
import { useRecorder } from '../../hooks/useRecorder'

interface Props {
  kb: KnowledgeBase | null
  session: Session | null
  messages: Message[]
  isStreaming: boolean
  onSend: (text: string) => void
  onStop: () => void
  onRetrace: (targetDbId: number, newContent: string) => void
}

/* ── Source citations ── */
function SourceList({ sources }: { sources: Source[] }) {
  const [open, setOpen] = useState(false)
  if (!sources.length) return null
  return (
    <div className="mt-3">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-[11px] transition-colors"
        style={{ color: 'var(--text-disabled)' }}
        onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-tertiary)')}
        onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-disabled)')}
      >
        {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        <FileText className="w-3 h-3" />
        <span>{sources.length} 条参考来源</span>
      </button>
      {open && (
        <div className="mt-2 space-y-1.5 animate-fade-in">
          {sources.map((s, i) => (
            <div
              key={i}
              className="px-3 py-2 rounded-xl text-[12px]"
              style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)' }}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-medium truncate max-w-xs" style={{ color: 'var(--text-secondary)' }}>
                  {s.filename}
                </span>
                <span className="ml-2 flex-shrink-0 text-[10px]" style={{ color: 'var(--text-disabled)' }}>
                  #{s.chunk_index} · {(s.score * 100).toFixed(0)}%
                </span>
              </div>
              <p className="leading-relaxed line-clamp-3 text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                {s.text}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ── TTS button ── */
function TtsButton({ text }: { text: string }) {
  const [loading, setLoading] = useState(false)
  const [playing, setPlaying] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const toggle = async () => {
    if (playing && audioRef.current) {
      audioRef.current.pause(); setPlaying(false); return
    }
    setLoading(true)
    try {
      const blob = await api.tts(text)
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      audioRef.current = audio
      audio.onended = () => { setPlaying(false); URL.revokeObjectURL(url) }
      audio.play(); setPlaying(true)
    } catch {}
    setLoading(false)
  }

  return (
    <button
      onClick={toggle}
      disabled={loading}
      className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] transition-colors"
      style={{ color: 'var(--text-disabled)' }}
      title={playing ? '停止播放' : '语音播放'}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text-tertiary)' }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-disabled)' }}
    >
      {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : playing ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
      <span>{playing ? '停止' : '播放'}</span>
    </button>
  )
}

/* ── Feedback buttons ── */
function FeedbackButtons({ dbId }: { dbId: number }) {
  const [voted, setVoted] = useState<1 | -1 | null>(null)

  const handleVote = async (rating: 1 | -1) => {
    if (voted !== null) return
    try {
      await api.submitFeedback(dbId, rating)
      setVoted(rating)
    } catch {}
  }

  return (
    <div className="flex items-center gap-0.5">
      {([1, -1] as const).map((r) => (
        <button
          key={r}
          onClick={() => handleVote(r)}
          disabled={voted !== null}
          className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] transition-colors disabled:cursor-default"
          style={{
            background: voted === r ? (r === 1 ? 'var(--success-bg)' : 'var(--error-bg)') : 'transparent',
            color: voted === r ? (r === 1 ? 'var(--success)' : 'var(--error)') : 'var(--text-disabled)',
          }}
          title={r === 1 ? '有帮助' : '没有帮助'}
          onMouseEnter={(e) => { if (voted === null) { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text-tertiary)' } }}
          onMouseLeave={(e) => { if (voted !== r) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-disabled)' } }}
        >
          {r === 1 ? <ThumbsUp className="w-3 h-3" /> : <ThumbsDown className="w-3 h-3" />}
        </button>
      ))}
    </div>
  )
}

/* ── Editable user message bubble ── */
interface UserBubbleProps {
  msg: Message
  isStreaming: boolean
  onRetrace: (msgId: number, content: string) => void
}

function UserBubble({ msg, isStreaming, onRetrace }: UserBubbleProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(msg.content)
  const [hovered, setHovered] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const isComposingRef = useRef(false)

  useEffect(() => {
    if (editing && textareaRef.current) {
      const el = textareaRef.current
      el.style.height = 'auto'
      el.style.height = el.scrollHeight + 'px'
      el.focus()
      el.setSelectionRange(el.value.length, el.value.length)
    }
  }, [editing])

  useEffect(() => {
    if (!editing) setDraft(msg.content)
  }, [msg.content, editing])

  const handleSubmit = () => {
    const trimmed = draft.trim()
    if (!trimmed || !msg.db_id) return
    setEditing(false)
    onRetrace(msg.db_id, trimmed)
  }

  const handleCancel = () => {
    setEditing(false)
    setDraft(msg.content)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !isComposingRef.current) {
      e.preventDefault()
      handleSubmit()
    }
    if (e.key === 'Escape') handleCancel()
  }

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setDraft(e.target.value)
    const el = e.target
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 200) + 'px'
  }

  if (editing) {
    return (
      <div className="flex justify-end animate-fade-in">
        <div className="max-w-[72%] w-full">
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            onCompositionStart={() => { isComposingRef.current = true }}
            onCompositionEnd={() => { isComposingRef.current = false }}
            rows={1}
            className="w-full resize-none rounded-2xl rounded-tr-md px-4 py-3 text-sm leading-relaxed focus:outline-none"
            style={{ background: 'var(--bg-elevated)', border: '2px solid var(--border-strong)', color: 'var(--text-primary)', maxHeight: '200px' }}
          />
          <div className="flex items-center justify-end gap-1.5 mt-1.5">
            <button
              onClick={handleCancel}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[12px] transition-colors"
              style={{ color: 'var(--text-tertiary)', background: 'var(--bg-hover)' }}
            >
              <X className="w-3 h-3" />取消
            </button>
            <button
              onClick={handleSubmit}
              disabled={!draft.trim()}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[12px] font-medium transition-colors disabled:opacity-40"
              style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}
            >
              <RotateCcw className="w-3 h-3" />重新生成
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className="flex justify-end animate-slide-up"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="flex flex-col items-end gap-1 max-w-[72%]">
        <div
          className="px-4 py-3 rounded-2xl rounded-tr-md text-sm leading-relaxed"
          style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}
        >
          <p className="whitespace-pre-wrap">{msg.content}</p>
        </div>
        {!isStreaming && msg.db_id && (
          <button
            onClick={() => { setDraft(msg.content); setEditing(true) }}
            className="flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] transition-all"
            style={{ color: 'var(--text-disabled)', opacity: hovered ? 1 : 0, pointerEvents: hovered ? 'auto' : 'none' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text-tertiary)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-disabled)' }}
            title="编辑并重新生成"
          >
            <Pencil className="w-3 h-3" />编辑
          </button>
        )}
      </div>
    </div>
  )
}

/* ── AI message bubble ── */
function AssistantBubble({ msg }: { msg: Message }) {
  return (
    <div className="flex gap-3 animate-slide-up">
      <div
        className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 text-[10px] font-bold"
        style={{ background: 'var(--bg-active)', color: 'var(--text-tertiary)' }}
      >
        AI
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm leading-relaxed" style={{ color: 'var(--text-primary)' }}>
          <div className="prose prose-sm max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
            {msg.streaming && (
              <span className="inline-flex gap-1 ml-1 align-middle">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="w-1.5 h-1.5 rounded-full inline-block animate-pulse-dot"
                    style={{ background: 'var(--text-tertiary)', animationDelay: `${i * 0.18}s` }}
                  />
                ))}
              </span>
            )}
          </div>
        </div>
        {!msg.streaming && (
          <div className="flex items-center gap-0.5 mt-2">
            <TtsButton text={msg.content} />
            {msg.db_id && <FeedbackButtons dbId={msg.db_id} />}
          </div>
        )}
        {!msg.streaming && msg.sources && msg.sources.length > 0 && (
          <SourceList sources={msg.sources} />
        )}
      </div>
    </div>
  )
}

/* ── Empty / no session placeholder ── */
function EmptyState({ kb }: { kb: KnowledgeBase | null }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center" style={{ color: 'var(--text-disabled)' }}>
      <div
        className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4 text-lg font-bold"
        style={{ background: 'var(--bg-hover)', color: 'var(--text-tertiary)' }}
      >
        AI
      </div>
      <p className="text-sm font-medium" style={{ color: 'var(--text-tertiary)' }}>
        {kb ? '选择或新建会话' : '请先选择知识库'}
      </p>
      <p className="text-[12px] mt-1">
        {kb ? `当前知识库：${kb.name}` : '在左侧选择知识库，然后新建会话'}
      </p>
    </div>
  )
}

/* ─────────────────────────────────────────────── */

export default function ChatArea({ kb, session, messages, isStreaming, onSend, onStop, onRetrace }: Props) {
  const [input, setInput] = useState('')
  const [sttLoading, setSttLoading] = useState(false)
  const [sttError, setSttError] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const isComposingRef = useRef(false)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const { recording, error: micError, startRecording, stopRecording } = useRecorder(async (blob, ext) => {
    setSttLoading(true); setSttError(null)
    try {
      const result = await api.stt(blob, ext)
      const text = result.text.trim()
      if (text) { onSend(text) }
      else setSttError('未识别到语音内容，请重试')
    } catch (e: any) {
      setSttError(`识别失败: ${e.message}`)
    } finally {
      setSttLoading(false)
    }
  })

  const handleSend = () => {
    const text = input.trim()
    if (!text || isStreaming) return
    setInput('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    onSend(text)
  }

  const handleStop = () => {
    onStop()
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !isComposingRef.current) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
    const el = e.target
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 160) + 'px'
  }

  if (!session) {
    return (
      <div className="flex-1 flex flex-col" style={{ background: 'var(--bg-panel)' }}>
        <EmptyState kb={kb} />
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col min-w-0 h-full" style={{ background: 'var(--bg-panel)' }}>
      {/* Header */}
      <div
        className="px-6 py-3.5 flex items-center gap-3 flex-shrink-0"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: 'var(--success)' }} />
        <div className="min-w-0">
          <h2 className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
            {session.title}
          </h2>
          <p className="text-[11px]" style={{ color: 'var(--text-disabled)' }}>{kb?.name}</p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-8 space-y-7 max-w-3xl w-full mx-auto">
        {messages.length === 0 && (
          <div className="text-center mt-16">
            <p className="text-sm" style={{ color: 'var(--text-disabled)' }}>
              向 AI 提问，从知识库中检索相关内容来回答
            </p>
          </div>
        )}
        {messages.map((msg) =>
          msg.role === 'user' ? (
            <UserBubble
              key={msg.id}
              msg={msg}
              isStreaming={isStreaming}
              onRetrace={onRetrace}
            />
          ) : (
            <AssistantBubble key={msg.id} msg={msg} />
          )
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div className="px-4 pb-5 pt-2 flex-shrink-0 max-w-3xl w-full mx-auto">
        <div
          className="relative flex flex-col rounded-2xl transition-all duration-200"
          style={{
            background: 'var(--bg-elevated)',
            border: `1px solid ${recording ? 'var(--error)' : 'var(--border)'}`,
            boxShadow: 'var(--shadow-sm)',
          }}
          onFocusCapture={(e) => {
            const el = e.currentTarget as HTMLDivElement
            el.style.borderColor = recording ? 'var(--error)' : 'var(--border-strong)'
            el.style.boxShadow = 'var(--shadow-md)'
          }}
          onBlurCapture={(e) => {
            const el = e.currentTarget as HTMLDivElement
            el.style.borderColor = recording ? 'var(--error)' : 'var(--border)'
            el.style.boxShadow = 'var(--shadow-sm)'
          }}
        >
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            onCompositionStart={() => { isComposingRef.current = true }}
            onCompositionEnd={() => { isComposingRef.current = false }}
            placeholder={
              recording ? '正在录音，再次点击麦克风结束...'
                : sttLoading ? '识别中...'
                  : '输入问题... (Enter 发送，Shift+Enter 换行)'
            }
            rows={1}
            disabled={recording || sttLoading}
            className="w-full resize-none bg-transparent text-sm focus:outline-none leading-relaxed px-4 pt-3.5 pb-2 disabled:opacity-50"
            style={{ color: 'var(--text-primary)', maxHeight: '160px' }}
          />

          <div className="flex items-center justify-between px-3 pb-3">
            <button
              onClick={recording ? stopRecording : startRecording}
              disabled={sttLoading || isStreaming}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                background: recording ? 'var(--error-bg)' : 'transparent',
                color: recording ? 'var(--error)' : 'var(--text-tertiary)',
              }}
              title={recording ? '再次点击结束录音，自动发送' : '语音输入（识别后自动发送）'}
              onMouseEnter={(e) => { if (!recording) e.currentTarget.style.background = 'var(--bg-hover)' }}
              onMouseLeave={(e) => { if (!recording) e.currentTarget.style.background = 'transparent' }}
            >
              {sttLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : recording ? <MicOff className="w-3.5 h-3.5" />
                  : <Mic className="w-3.5 h-3.5" />}
              <span>{sttLoading ? '识别中...' : recording ? '点击结束' : '语音'}</span>
            </button>

            {isStreaming ? (
              <button
                onClick={handleStop}
                className="w-8 h-8 flex items-center justify-center rounded-xl transition-colors"
                style={{ background: 'var(--bg-active)', color: 'var(--text-secondary)' }}
                title="停止生成"
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--border-strong)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--bg-active)')}
              >
                <Square className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={!input.trim() || sttLoading || recording}
                className="w-8 h-8 flex items-center justify-center rounded-xl transition-all disabled:opacity-25 disabled:cursor-not-allowed active:scale-90"
                style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}
                title="发送"
              >
                <ArrowUp className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        <p className="text-center text-[11px] mt-2" style={{ color: 'var(--text-disabled)' }}>
          {(micError || sttError)
            ? <span style={{ color: 'var(--error)' }}>{micError || sttError}</span>
            : 'AI 回答基于知识库内容，仅供参考'
          }
        </p>
      </div>
    </div>
  )
}
