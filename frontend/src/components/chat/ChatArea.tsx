import React, { useState, useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import {
  Mic, MicOff, Volume2, VolumeX, ChevronDown, ChevronRight,
  FileText, Square, ArrowUp, Loader2, ThumbsUp, ThumbsDown,
  Pencil, X, Search, Download, RotateCcw, Copy, CheckCheck, Clock, Menu,
} from 'lucide-react'
import type { Message, Session, KnowledgeBase, Source } from '../../types'
import * as api from '../../api'
import { useToast } from '../ui/Toast'
import { useRecorder } from '../../hooks/useRecorder'
import ConfirmDialog from '../ui/ConfirmDialog'

/* ── Waveform visualizer ── */
function Waveform({ analyserRef }: { analyserRef: React.RefObject<AnalyserNode | null> }) {
  const [bars, setBars] = useState<number[]>(Array(7).fill(0.1))
  const rafRef = useRef<number>(0)

  useEffect(() => {
    const update = () => {
      const analyser = analyserRef.current
      if (analyser) {
        const data = new Uint8Array(analyser.frequencyBinCount)
        analyser.getByteFrequencyData(data)
        const step = Math.floor(data.length / 7)
        const newBars = Array.from({ length: 7 }, (_, i) => {
          const val = data[i * step] / 255
          return Math.max(0.1, val)
        })
        setBars(newBars)
      }
      rafRef.current = requestAnimationFrame(update)
    }
    rafRef.current = requestAnimationFrame(update)
    return () => cancelAnimationFrame(rafRef.current)
  }, [analyserRef])

  return (
    <div className="flex items-center gap-0.5 h-5" aria-hidden="true">
      {bars.map((h, i) => (
        <div
          key={i}
          className="w-0.5 rounded-full"
          style={{
            height: `${h * 20}px`,
            background: 'var(--error)',
            animation: `waveform-bar ${0.4 + i * 0.05}s ease-in-out infinite alternate`,
            animationDelay: `${i * 0.06}s`,
          }}
        />
      ))}
    </div>
  )
}

interface Props {
  kb: KnowledgeBase | null
  session: Session | null
  messages: Message[]
  isStreaming: boolean
  isLoadingMessages?: boolean
  onSend: (text: string) => void
  onStop: () => void
  onRetrace: (targetDbId: number, newContent: string) => void
  isMobile?: boolean
  onOpenDrawer?: () => void
}

/* ── Skeleton message row ── */
function SkeletonMessageRow({ role }: { role: 'user' | 'assistant' }) {
  const isUser = role === 'user'
  return (
    <div className={`flex gap-3 animate-fade-in ${isUser ? 'flex-row-reverse' : ''}`}>
      {!isUser && (
        <div className="ai-orb w-8 h-8 rounded-full skeleton flex-shrink-0 mt-0.5" />
      )}
      <div
        className="max-w-[72%] rounded-2xl px-4 py-3 space-y-2"
        style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)' }}
      >
        <div className="h-3 w-32 skeleton rounded" />
        <div className="h-3 w-48 skeleton rounded" />
        <div className="h-3 w-24 skeleton rounded" />
      </div>
    </div>
  )
}

/* ── Relative time ── */
function relativeTime(isoString: string): string {
  const now = Date.now()
  const then = new Date(isoString).getTime()
  const diff = now - then
  const mins = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  if (mins < 1) return '刚刚'
  if (mins < 60) return `${mins} 分钟前`
  if (hours < 24) return `${hours} 小时前`
  if (days < 7) return `${days} 天前`
  return new Date(isoString).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}

/* ── Source citations ── */
function SourceList({ sources }: { sources: Source[] }) {
  const [open, setOpen] = useState(false)
  if (!sources.length) return null
  return (
    <div className="mt-3">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-[11px] interactive"
        style={{ color: 'var(--text-disabled)' }}
        aria-label={open ? '收起参考来源' : '展开参考来源'}
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
              className="px-3 py-2.5 rounded-xl text-[12px]"
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
  const { toast } = useToast()

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
    } catch {
      toast('语音播放失败', 'error')
    }
    setLoading(false)
  }

  return (
    <button
      onClick={toggle}
      disabled={loading}
      className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] interactive"
      style={{ color: 'var(--text-disabled)' }}
      title={playing ? '停止播放' : '语音播放'}
      aria-label={playing ? '停止播放' : '语音播放'}
    >
      {loading
        ? <Loader2 className="w-3 h-3 animate-spin" />
        : playing
          ? <VolumeX className="w-3 h-3" />
          : <Volume2 className="w-3 h-3" />
      }
      <span>{playing ? '停止' : '播放'}</span>
    </button>
  )
}

/* ── Feedback buttons ── */
function FeedbackButtons({ dbId }: { dbId: number }) {
  const [voted, setVoted] = useState<1 | -1 | null>(null)
  const { toast } = useToast()

  const handleVote = async (rating: 1 | -1) => {
    if (voted !== null) return
    try {
      await api.submitFeedback(dbId, rating)
      setVoted(rating)
    } catch {
      toast('反馈提交失败', 'error')
    }
  }

  return (
    <div className="flex items-center gap-0.5" role="group" aria-label="反馈">
      {([1, -1] as const).map((r) => (
        <button
          key={r}
          onClick={() => handleVote(r)}
          disabled={voted !== null}
          className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] interactive disabled:cursor-default"
          style={{
            background: voted === r ? (r === 1 ? 'var(--success-bg)' : 'var(--error-bg)') : 'transparent',
            color: voted === r ? (r === 1 ? 'var(--success)' : 'var(--error)') : 'var(--text-disabled)',
          }}
          title={r === 1 ? '有帮助' : '没有帮助'}
          aria-label={r === 1 ? '有帮助' : '没有帮助'}
        >
          {r === 1 ? <ThumbsUp className="w-3 h-3" /> : <ThumbsDown className="w-3 h-3" />}
        </button>
      ))}
    </div>
  )
}

/* ── Copy button ── */
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const { toast } = useToast()

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      toast('已复制到剪贴板', 'success')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast('复制失败', 'error')
    }
  }

  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] interactive"
      style={{ color: copied ? 'var(--success)' : 'var(--text-disabled)' }}
      aria-label="复制消息"
    >
      {copied ? <CheckCheck className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
      <span>{copied ? '已复制' : '复制'}</span>
    </button>
  )
}

/* ── Code block with copy ── */
function CodeBlock({ language, code }: { language?: string; code: string }) {
  const [codeCopied, setCodeCopied] = useState(false)
  const { toast } = useToast()

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCodeCopied(true)
      setTimeout(() => setCodeCopied(false), 2000)
    } catch {
      toast('复制失败', 'error')
    }
  }

  return (
    <div className="relative group rounded-xl overflow-hidden" style={{ background: 'var(--code-block-bg)', border: '1px solid var(--border)' }}>
      {language && (
        <div
          className="flex items-center justify-between px-4 py-1.5 text-[10px] font-mono"
          style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-disabled)' }}
        >
          <span>{language}</span>
          <button
            onClick={handleCopy}
            className="opacity-0 group-hover:opacity-100 transition-opacity interactive p-1 rounded"
            style={{ color: codeCopied ? 'var(--success)' : 'var(--text-disabled)' }}
            aria-label="复制代码"
          >
            {codeCopied ? <CheckCheck className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
          </button>
        </div>
      )}
      <SyntaxHighlighter
        language={language || 'text'}
        style={oneDark}
        customStyle={{
          margin: 0,
          padding: '1em 1.1em',
          background: 'transparent',
          fontSize: '0.8em',
          lineHeight: 1.6,
        }}
        codeTagProps={{ style: { fontFamily: "'GeistMono', 'JetBrains Mono', monospace" } }}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  )
}

/* ── Editable user message bubble ── */
interface UserBubbleProps {
  msg: Message
  isStreaming: boolean
  onRetrace: (msgId: number, content: string) => void
  onRequestCancel?: (draft: string) => void
  highlightFn?: (text: string, query: string) => React.ReactNode
  searchQuery?: string
}

function UserBubble({ msg, isStreaming, onRetrace, onRequestCancel, highlightFn, searchQuery }: UserBubbleProps) {
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
    const hasChanges = draft.trim() !== msg.content.trim()
    if (hasChanges && onRequestCancel) {
      onRequestCancel(draft)
    } else {
      setEditing(false)
      setDraft(msg.content)
    }
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
            className="w-full resize-none rounded-2xl rounded-tr-lg px-4 py-3 text-sm leading-relaxed focus:outline-none"
            style={{
              background: 'var(--bg-elevated)',
              border: '2px solid var(--border-accent)',
              color: 'var(--text-primary)',
              maxHeight: '200px',
              boxShadow: '0 0 0 3px rgba(99,102,241,0.08)',
            }}
            aria-label="编辑消息内容"
          />
          <div className="flex items-center justify-end gap-1.5 mt-1.5">
            <button
              onClick={handleCancel}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[12px] interactive"
              style={{ color: 'var(--text-tertiary)', background: 'var(--bg-hover)' }}
              aria-label="取消编辑"
            >
              <X className="w-3 h-3" />取消
            </button>
            <button
              onClick={handleSubmit}
              disabled={!draft.trim()}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[12px] font-medium interactive disabled:opacity-40"
              style={{ background: 'var(--bg-active)', border: '1px solid var(--border-strong)', color: 'var(--text-primary)' }}
              aria-label="重新生成"
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
      className="flex justify-end animate-fade-in"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="flex flex-col items-end gap-1.5 max-w-[72%]">
        <div
          className="px-4 py-3 rounded-2xl rounded-tr-md text-sm leading-relaxed"
          style={{
            background: 'var(--bg-active)',
            border: '1px solid var(--border)',
            color: 'var(--text-primary)',
          }}
        >
          <p className="whitespace-pre-wrap">
            {searchQuery && highlightFn ? highlightFn(msg.content, searchQuery) : msg.content}
          </p>
        </div>
        {/* Meta row: timestamp + actions */}
        <div
          className="flex items-center gap-2 px-1 transition-opacity"
          style={{ opacity: hovered ? 1 : 0 }}
        >
          {msg.created_at && (
            <span
              className="flex items-center gap-1 text-[10px]"
              style={{ color: 'var(--text-disabled)' }}
            >
              <Clock className="w-3 h-3" />
              {relativeTime(msg.created_at)}
            </span>
          )}
          <CopyButton text={msg.content} />
          {!isStreaming && msg.db_id && (
            <button
              onClick={() => { setDraft(msg.content); setEditing(true) }}
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] interactive"
              style={{ color: 'var(--text-disabled)' }}
              title="编辑并重新生成"
              aria-label="编辑并重新生成"
            >
              <Pencil className="w-3 h-3" />编辑
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

/* ── AI message bubble ── */
function AssistantBubble({ msg, onRetry, highlightFn, searchQuery }: { msg: Message; onRetry?: (text: string) => void; highlightFn?: (text: string, query: string) => React.ReactNode; searchQuery?: string }) {
  const [hovered, setHovered] = useState(false)
  const isError = msg.content.startsWith('错误:')

  return (
    <div
      className="flex gap-3 animate-fade-in"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Minimal orb avatar */}
      <div
        className="ai-orb w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
        aria-hidden="true"
      >
        <span className="text-[9px] font-medium">AI</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm leading-relaxed" style={{ color: 'var(--text-primary)' }}>
          <div className="prose prose-sm max-w-none">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                code({ className, children, ...props }) {
                  const match = /language-(\w+)/.exec(className || '')
                  const code = String(children).replace(/\n$/, '')
                  if (match) {
                    return <CodeBlock language={match[1]} code={code} />
                  }
                  return <code className={className} {...props}>{children}</code>
                },
              }}
            >
              {/* @ts-ignore - ReactMarkdown accepts ReactNodes at runtime */}
              {searchQuery && highlightFn ? (highlightFn(msg.content || '', searchQuery) as React.ReactNode) : (msg.content || (msg.streaming ? '正在生成...' : ''))}
            </ReactMarkdown>
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

        {/* Meta row: timestamp + actions */}
        <div
          className="flex items-center gap-2 mt-2 transition-opacity"
          style={{ opacity: hovered ? 1 : 0 }}
        >
          {msg.created_at && (
            <span
              className="flex items-center gap-1 text-[10px]"
              style={{ color: 'var(--text-disabled)' }}
            >
              <Clock className="w-3 h-3" />
              {relativeTime(msg.created_at)}
            </span>
          )}
          {msg.response_time && !isError && (
            <span className="text-[10px]" style={{ color: 'var(--text-disabled)' }}>
              {msg.response_time < 1000 ? `${msg.response_time}ms` : `${(msg.response_time / 1000).toFixed(1)}s`}
            </span>
          )}
          {!msg.streaming && (
            <>
              {isError && onRetry && (
                <button
                  onClick={() => onRetry(msg.content.replace('错误: ', ''))}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] interactive"
                  style={{ background: 'var(--error-bg)', color: 'var(--error)' }}
                  aria-label="重试"
                >
                  <RotateCcw className="w-3 h-3" />
                  重试
                </button>
              )}
              <CopyButton text={msg.content} />
              {!isError && <TtsButton text={msg.content} />}
              {msg.db_id && !isError && <FeedbackButtons dbId={msg.db_id} />}
            </>
          )}
        </div>

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
    <div className="flex-1 flex flex-col items-center justify-center">
      {/* Minimal orb */}
      <div
        className="ai-orb w-14 h-14 rounded-full flex items-center justify-center mb-5"
        aria-hidden="true"
      >
        <span className="text-xs font-medium">AI</span>
      </div>
      <p className="text-sm font-medium" style={{ color: 'var(--text-tertiary)' }}>
        {kb ? '选择或新建会话' : '请先选择知识库'}
      </p>
      <p className="text-[12px] mt-2" style={{ color: 'var(--text-disabled)' }}>
        {kb ? `当前知识库：${kb.name}` : '在左侧选择知识库，然后新建会话'}
      </p>
    </div>
  )
}

/* ── Markdown preview ── */
function MarkdownPreview({ text }: { text: string }) {
  return (
    <div className="rounded-xl px-3 py-2.5 text-sm" style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)' }}>
      <div className="prose prose-sm max-w-none">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────── */

const MAX_CHARS = 2000

export default function ChatArea({ kb, session, messages, isStreaming, isLoadingMessages, onSend, onStop, onRetrace, isMobile, onOpenDrawer }: Props) {
  const [input, setInput] = useState('')
  const [sttLoading, setSttLoading] = useState(false)
  const [sttError, setSttError] = useState<string | null>(null)
  const [showPreview, setShowPreview] = useState(false)
  const [userScrolledAway, setUserScrolledAway] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const { toast } = useToast()
  const [showSearch, setShowSearch] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [cancelConfirm, setCancelConfirm] = useState<{
    draft: string
    msgId: string
  } | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const isComposingRef = useRef(false)

  // Ctrl+F to focus search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault()
        setShowSearch(true)
        setTimeout(() => searchInputRef.current?.focus(), 50)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // Only auto-scroll if user hasn't scrolled away
  useEffect(() => {
    if (!userScrolledAway) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, userScrolledAway])

  const handleMessagesScroll = () => {
    const el = messagesEndRef.current?.parentElement
    if (!el) return
    const threshold = 80
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < threshold
    setUserScrolledAway(!nearBottom)
  }

  const { recording, error: micError, startRecording, stopRecording, analyserRef } = useRecorder(async (blob, ext) => {
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
    setShowPreview(false)
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    onSend(text)
  }

  const handleStop = () => onStop()

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

  const charCount = input.length

  // Highlight helper: wraps matching substrings with <mark>
  const highlightText = (text: string, query: string) => {
    if (!query.trim()) return text
    const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')
    const parts = text.split(regex)
    return parts.map((part, i) =>
      regex.test(part) ? <mark key={i} style={{ background: 'var(--warning-bg)', color: 'var(--warning)', borderRadius: '2px', padding: '0 1px' }}>{part}</mark> : part
    )
  }

  // Export handler
  const handleExport = async () => {
    if (!session) return
    setExporting(true)
    try {
      const md = await api.exportSession(session.id)
      const blob = new Blob([md], { type: 'text/markdown' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${session.title || '会话'}_${new Date().toISOString().slice(0, 10)}.md`
      a.click()
      URL.revokeObjectURL(url)
      toast('会话已导出', 'success')
    } catch {
      toast('导出失败', 'error')
    } finally {
      setExporting(false)
    }
  }
  const isNearLimit = charCount > MAX_CHARS * 0.85
  const isOverLimit = charCount > MAX_CHARS

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
        className="px-5 py-3.5 flex items-center gap-3 flex-shrink-0"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        {/* Status indicator */}
        <div className="relative flex-shrink-0">
          {isMobile && (
            <button
              onClick={onOpenDrawer}
              className="interactive-icon w-7 h-7 flex items-center justify-center rounded-lg"
              style={{ color: 'var(--text-tertiary)' }}
              aria-label="打开侧边栏"
            >
              <Menu className="w-4 h-4" />
            </button>
          )}
        </div>
        <div className="relative flex-shrink-0 flex items-center gap-2">
          {/* Status indicator */}
          <div
            className="w-2 h-2 rounded-full"
            style={{ background: 'var(--success)' }}
            aria-hidden="true"
          />
          {isStreaming && (
            <span
              className="absolute inset-0 rounded-full animate-ping"
              style={{ background: 'var(--success)', opacity: 0.4 }}
              aria-hidden="true"
            />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
            {session.title}
          </h2>
          <p className="text-[11px]" style={{ color: 'var(--text-disabled)' }}>
            {kb?.name}
            {isStreaming && <span className="ml-2" style={{ color: 'var(--text-secondary)' }}>生成中...</span>}
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={() => {
              if (showSearch) {
                setShowSearch(false); setSearchQuery('')
              } else { setShowSearch(true); setTimeout(() => searchInputRef.current?.focus(), 50) }
            }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] interactive"
            style={{ color: showSearch ? 'var(--text-primary)' : 'var(--text-tertiary)', background: showSearch ? 'var(--bg-hover)' : 'transparent' }}
            title="搜索消息 (Ctrl+F)"
            aria-label="搜索消息"
          >
            <Search className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleExport}
            disabled={exporting}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] interactive disabled:opacity-50"
            style={{ color: 'var(--text-tertiary)' }}
            title="导出会话为 Markdown"
            aria-label="导出会话"
          >
            {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Search bar */}
      {showSearch && (
        <div
          className="px-5 py-2.5 flex items-center gap-2 flex-shrink-0 animate-fade-in"
          style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-elevated)' }}
        >
          <Search className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--text-disabled)' }} />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索消息内容... (Enter 下一条, Shift+Enter 上一条, Esc 关闭)"
            className="flex-1 text-sm bg-transparent focus:outline-none"
            style={{ color: 'var(--text-primary)' }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') { setShowSearch(false); setSearchQuery('') }
              if (e.key === 'Enter') {
                e.preventDefault()
                const el = messagesEndRef.current?.parentElement
                if (el) el.scrollBy(0, e.shiftKey ? -200 : 200)
              }
            }}
          />
          {searchQuery && (
            <span className="text-[11px]" style={{ color: 'var(--text-disabled)' }}>
              {messages.filter((m) => !m.streaming && m.content.toLowerCase().includes(searchQuery.toLowerCase())).length} 条
            </span>
          )}
          <button
            onClick={() => { setShowSearch(false); setSearchQuery('') }}
            className="interactive p-1 rounded"
            style={{ color: 'var(--text-disabled)' }}
            aria-label="关闭搜索"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Messages */}
      <div
        className="flex-1 overflow-y-auto px-5 py-7 space-y-5 max-w-3xl w-full mx-auto"
        onScroll={handleMessagesScroll}
        ref={messagesEndRef}
      >
        {isLoadingMessages ? (
          <>
            <SkeletonMessageRow role="user" />
            <SkeletonMessageRow role="assistant" />
            <SkeletonMessageRow role="assistant" />
          </>
        ) : messages.length === 0 ? (
          <div className="text-center mt-20">
            <div
              className="ai-orb w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-4"
              aria-hidden="true"
            >
              <span className="text-[9px] font-medium">AI</span>
            </div>
            <p className="text-sm" style={{ color: 'var(--text-disabled)' }}>
              向 AI 提问，从知识库中检索相关内容来回答
            </p>
          </div>
        ) : null}
        {messages.map((msg) =>
          msg.role === 'user' ? (
            <UserBubble
              key={msg.id}
              msg={msg}
              isStreaming={isStreaming}
              onRetrace={onRetrace}
              onRequestCancel={(draft) => setCancelConfirm({ draft, msgId: msg.id })}
              highlightFn={highlightText}
              searchQuery={searchQuery}
            />
          ) : (
            <AssistantBubble key={msg.id} msg={msg} onRetry={onSend} highlightFn={highlightText} searchQuery={searchQuery} />
          )
        )}
<div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div className="px-4 pb-5 pt-1 flex-shrink-0 max-w-3xl w-full mx-auto">
        {/* Preview toggle */}
        {input.trim() && (
          <div className="mb-2">
            <button
              onClick={() => setShowPreview((p) => !p)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] interactive"
              style={{ color: showPreview ? 'var(--text-primary)' : 'var(--text-disabled)', background: showPreview ? 'var(--bg-hover)' : 'transparent' }}
              aria-label={showPreview ? '隐藏预览' : '预览格式'}
            >
              {showPreview ? <X className="w-3 h-3" /> : null}
              <span>{showPreview ? '关闭预览' : '预览格式'}</span>
            </button>
            {showPreview && (
              <div className="mt-1.5 animate-fade-in">
                <MarkdownPreview text={input} />
              </div>
            )}
          </div>
        )}

        <div
          className={`input-container relative flex flex-col rounded-2xl ${recording ? 'recording' : ''}`}
          style={{
            background: 'var(--bg-elevated)',
            border: `1px solid ${isOverLimit ? 'var(--error)' : recording ? 'var(--error)' : 'var(--border)'}`,
            boxShadow: 'var(--shadow-md)',
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
            aria-label="输入消息"
          />

          <div className="flex items-center justify-between px-3 pb-3">
            {/* Left: mic + char count */}
            <div className="flex items-center gap-2">
              <button
                onClick={recording ? stopRecording : startRecording}
                disabled={sttLoading || isStreaming}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] interactive disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  background: recording ? 'var(--error-bg)' : 'transparent',
                  color: recording ? 'var(--error)' : 'var(--text-tertiary)',
                }}
                title={recording ? '再次点击结束录音，自动发送' : '语音输入（识别后自动发送）'}
                aria-label={recording ? '停止录音' : '开始录音'}
              >
                {sttLoading
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                  : recording
                    ? <MicOff className="w-3.5 h-3.5" aria-hidden="true" />
                    : <Mic className="w-3.5 h-3.5" aria-hidden="true" />
                }
                <span>{sttLoading ? '识别中...' : recording ? '点击结束' : '语音'}</span>
              </button>
              {recording && <Waveform analyserRef={analyserRef} />}

              {/* Character count */}
              <span
                className="text-[11px] tabular-nums"
                style={{ color: isOverLimit ? 'var(--error)' : isNearLimit ? 'var(--warning)' : 'var(--text-disabled)' }}
                aria-label={`${charCount} / ${MAX_CHARS} 字符`}
              >
                {charCount > 0 ? `${charCount} / ${MAX_CHARS}` : ''}
              </span>
            </div>

            {/* Right: send / stop */}
            {isStreaming ? (
              <button
                onClick={handleStop}
                className="interactive-icon w-8 h-8 flex items-center justify-center rounded-xl"
                style={{ background: 'var(--bg-active)', color: 'var(--text-secondary)' }}
                title="停止生成"
                aria-label="停止生成"
              >
                <Square className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={!input.trim() || isOverLimit || sttLoading || recording}
                className="interactive-icon w-8 h-8 flex items-center justify-center rounded-xl disabled:opacity-25 disabled:cursor-not-allowed"
                style={{ background: 'var(--text-primary)', color: 'var(--bg-base)' }}
                title="发送"
                aria-label="发送消息"
              >
                <ArrowUp className="w-4 h-4" aria-hidden="true" />
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
      {cancelConfirm && (
        <ConfirmDialog
          open={true}
          title="放弃修改？"
          message="编辑内容尚未保存，确定放弃？"
          confirmLabel="放弃"
          cancelLabel="继续编辑"
          destructive={true}
          onConfirm={() => setCancelConfirm(null)}
          onCancel={() => setCancelConfirm(null)}
        />
      )}
    </div>
  )
}
