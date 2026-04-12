import React, { useState, useEffect, useRef, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Mic, MicOff, Volume2, VolumeX, ChevronDown, ChevronRight, FileText, Square, ArrowUp, Loader2 } from 'lucide-react'
import * as api from '../../api'
import type { Message, Session, KnowledgeBase, Source } from '../../types'
import { useRecorder } from '../../hooks/useRecorder'

interface Props {
  kb: KnowledgeBase | null
  session: Session | null
}

function SourceList({ sources }: { sources: Source[] }) {
  const [open, setOpen] = useState(false)
  if (!sources.length) return null
  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-xs text-white/30 hover:text-white/55 transition-colors"
      >
        {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        <FileText className="w-3 h-3" />
        <span>{sources.length} 条参考来源</span>
      </button>
      {open && (
        <div className="mt-2 space-y-1 animate-fade-in">
          {sources.map((s, i) => (
            <div key={i} className="px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.06] text-xs">
              <div className="flex items-center justify-between mb-1">
                <span className="text-white/70 font-medium truncate max-w-xs">{s.filename}</span>
                <span className="text-white/25 ml-2 flex-shrink-0">
                  片段 #{s.chunk_index} · {(s.score * 100).toFixed(0)}%
                </span>
              </div>
              <p className="text-white/40 leading-relaxed line-clamp-3">{s.text}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function TtsButton({ text }: { text: string }) {
  const [loading, setLoading] = useState(false)
  const [playing, setPlaying] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const toggle = async () => {
    if (playing && audioRef.current) {
      audioRef.current.pause()
      setPlaying(false)
      return
    }
    setLoading(true)
    try {
      const blob = await api.tts(text)
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      audioRef.current = audio
      audio.onended = () => { setPlaying(false); URL.revokeObjectURL(url) }
      audio.play()
      setPlaying(true)
    } catch {}
    setLoading(false)
  }

  return (
    <button
      onClick={toggle}
      disabled={loading}
      className="flex items-center gap-1 px-2 py-1 rounded text-[11px] text-white/30 hover:text-white/60 hover:bg-white/[0.05] transition-colors"
      title={playing ? '停止播放' : '语音播放'}
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

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === 'user'
  if (isUser) {
    return (
      <div className="flex justify-end animate-slide-up">
        <div className="max-w-[70%] px-4 py-2.5 rounded-2xl rounded-tr-sm bg-white text-black text-sm leading-relaxed">
          <p className="whitespace-pre-wrap">{msg.content}</p>
        </div>
      </div>
    )
  }
  return (
    <div className="flex gap-3 animate-slide-up">
      <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0 mt-0.5">
        <span className="text-[10px] text-white/60 font-bold">AI</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm text-white/85 leading-relaxed">
          <div className="prose prose-invert prose-sm max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
            {msg.streaming && (
              <span className="inline-flex gap-1 ml-1">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="w-1 h-1 bg-white/50 rounded-full inline-block animate-pulse-dot"
                    style={{ animationDelay: `${i * 0.16}s` }}
                  />
                ))}
              </span>
            )}
          </div>
        </div>
        {!msg.streaming && (
          <div className="flex items-center gap-1 mt-2">
            <TtsButton text={msg.content} />
          </div>
        )}
        {!msg.streaming && msg.sources && msg.sources.length > 0 && (
          <SourceList sources={msg.sources} />
        )}
      </div>
    </div>
  )
}

let msgId = 0
const nextId = () => String(++msgId)

export default function ChatArea({ kb, session }: Props) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [sttLoading, setSttLoading] = useState(false)
  const [sttError, setSttError] = useState<string | null>(null)
  const stopRef = useRef<(() => void) | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  // ref 持有 session / streaming 最新值，供 stt 回调使用（避免闭包过期）
  const sessionRef = useRef(session)
  const streamingRef = useRef(streaming)
  useEffect(() => { sessionRef.current = session }, [session])
  useEffect(() => { streamingRef.current = streaming }, [streaming])

  // 核心发送函数，接受显式 text 参数，避免依赖 input state 的闭包问题
  const doSend = useCallback((text: string) => {
    const sess = sessionRef.current
    if (!text.trim() || !sess || streamingRef.current) return

    setInput('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'

    const userMsg: Message = { id: nextId(), role: 'user', content: text }
    const assistantId = nextId()
    const assistantMsg: Message = { id: assistantId, role: 'assistant', content: '', streaming: true }

    setMessages((prev) => [...prev, userMsg, assistantMsg])
    setStreaming(true)
    streamingRef.current = true

    const stop = api.chatStream(
      sess.id,
      text,
      (chunk) => setMessages((prev) => prev.map((m) => m.id === assistantId ? { ...m, content: m.content + chunk } : m)),
      (sources) => setMessages((prev) => prev.map((m) => m.id === assistantId ? { ...m, sources } : m)),
      () => {
        setMessages((prev) => prev.map((m) => m.id === assistantId ? { ...m, streaming: false } : m))
        setStreaming(false)
        streamingRef.current = false
      },
      (err) => {
        setMessages((prev) => prev.map((m) => m.id === assistantId ? { ...m, content: `错误: ${err}`, streaming: false } : m))
        setStreaming(false)
        streamingRef.current = false
      },
    )
    stopRef.current = stop
  }, [])

  // 语音识别完成回调：识别结果直接发送
  const [sttError, setSttError] = useState<string | null>(null)

  const { recording, error: micError, startRecording, stopRecording } = useRecorder(async (blob, ext) => {
    setSttLoading(true)
    setSttError(null)
    try {
      const result = await api.stt(blob, ext)
      const text = result.text.trim()
      if (text) doSend(text)
      else setSttError('未识别到语音内容，请重试')
    } catch (e: any) {
      setSttError(`识别失败: ${e.message}`)
    } finally {
      setSttLoading(false)
    }
  })

  useEffect(() => {
    if (!session) { setMessages([]); return }
    api.getMessages(session.id).then((msgs) => {
      setMessages(msgs.map((m) => ({
        id: nextId(),
        role: m.role as 'user' | 'assistant',
        content: m.content,
        sources: m.sources || [],
      })))
    }).catch(() => {})
  }, [session?.id])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = () => doSend(input)

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleStop = () => {
    stopRef.current?.()
    setStreaming(false)
    streamingRef.current = false
    setMessages((prev) => prev.map((m) => m.streaming ? { ...m, streaming: false } : m))
  }

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
    const el = e.target
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 160) + 'px'
  }

  if (!session) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-[#111111]">
        <div className="text-center text-white/20">
          <div className="w-12 h-12 rounded-2xl bg-white/[0.05] flex items-center justify-center mx-auto mb-4">
            <span className="text-white/30 font-bold text-lg">AI</span>
          </div>
          <p className="text-sm font-medium text-white/40">
            {kb ? '选择或新建会话' : '请先选择知识库'}
          </p>
          <p className="text-xs mt-1 text-white/20">
            {kb ? `当前知识库：${kb.name}` : '在左侧选择知识库，然后新建会话'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col min-w-0 h-full bg-[#111111]">
      {/* Header */}
      <div className="px-6 py-3 border-b border-white/[0.06] flex items-center gap-3 flex-shrink-0 bg-[#111111]">
        <div className="w-2 h-2 rounded-full bg-emerald-500" />
        <div>
          <h2 className="text-sm font-medium text-white/85">{session.title}</h2>
          <p className="text-[11px] text-white/30">{kb?.name}</p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6 max-w-3xl w-full mx-auto">
        {messages.length === 0 && (
          <div className="text-center text-white/20 mt-20">
            <p className="text-sm">向 AI 提问，从知识库中检索相关内容来回答</p>
          </div>
        )}
        {messages.map((msg) => (
          <MessageBubble key={msg.id} msg={msg} />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-4 pb-5 pt-3 flex-shrink-0 max-w-3xl w-full mx-auto">
        <div className={`relative flex flex-col bg-[#1c1c1c] border rounded-2xl transition-colors ${
          recording ? 'border-red-500/40' : 'border-white/[0.1] focus-within:border-white/20'
        }`}>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder={
              recording
                ? '正在录音，再次点击麦克风结束...'
                : sttLoading
                  ? '识别中...'
                  : '输入问题... (Enter 发送，Shift+Enter 换行)'
            }
            rows={1}
            disabled={recording || sttLoading}
            className="w-full resize-none bg-transparent text-white/85 placeholder-white/25 text-sm focus:outline-none leading-relaxed px-4 pt-3 pb-2 disabled:opacity-50"
            style={{ maxHeight: '160px' }}
          />
          <div className="flex items-center justify-between px-3 pb-2.5">
            {/* Mic button */}
            <button
              onClick={recording ? stopRecording : startRecording}
              disabled={sttLoading || streaming}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                recording
                  ? 'bg-red-500/15 text-red-400 hover:bg-red-500/20'
                  : sttLoading
                    ? 'text-white/30'
                    : 'text-white/30 hover:text-white/60 hover:bg-white/[0.06]'
              }`}
              title={recording ? '再次点击结束录音，自动发送' : '语音输入（识别后自动发送）'}
            >
              {sttLoading
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : recording
                  ? <MicOff className="w-3.5 h-3.5" />
                  : <Mic className="w-3.5 h-3.5" />
              }
              <span>
                {sttLoading ? '识别中...' : recording ? '点击结束' : '语音'}
              </span>
            </button>

            {/* Send / Stop */}
            {streaming ? (
              <button
                onClick={handleStop}
                className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/10 text-white/60 hover:bg-white/15 transition-colors"
                title="停止生成"
              >
                <Square className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={!input.trim() || sttLoading || recording}
                className="w-8 h-8 flex items-center justify-center rounded-lg bg-white text-black hover:bg-white/90 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                title="发送"
              >
                <ArrowUp className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
        <p className="text-center text-[11px] text-white/15 mt-2">
          {(micError || sttError)
            ? <span className="text-red-400/80">{micError || sttError}</span>
            : 'AI 回答基于知识库内容，仅供参考'
          }
        </p>
      </div>
    </div>
  )
}
