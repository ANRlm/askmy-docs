import type { AuthTokens, KnowledgeBase, Document, Session, Source } from '../types'

const BASE_URL = '/api'

function getToken(): string | null {
  return localStorage.getItem('token')
}

function authHeaders(): HeadersInit {
  const token = getToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

async function request<T>(path: string, init?: RequestInit & { signal?: AbortSignal }): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
      ...init?.headers,
    },
    signal: init?.signal,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || `HTTP ${res.status}`)
  }
  return res.json()
}

// Auth
export async function login(email: string, password: string): Promise<AuthTokens> {
  return request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
}

export async function register(email: string, password: string): Promise<{ id: number }> {
  return request('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
}

export async function getMe(): Promise<{ id: number; email: string; created_at: string }> {
  return request('/auth/me')
}

// Knowledge bases
export async function listKBs(): Promise<KnowledgeBase[]> {
  return request('/kb')
}

export async function createKB(name: string, description: string, top_k = 5, score_threshold = 0.5): Promise<KnowledgeBase> {
  return request('/kb', { method: 'POST', body: JSON.stringify({ name, description, top_k, score_threshold }) })
}

export async function deleteKB(kbId: number): Promise<void> {
  return request(`/kb/${kbId}`, { method: 'DELETE' })
}

export async function updateKB(kbId: number, data: { name?: string; description?: string; top_k?: number; score_threshold?: number }): Promise<KnowledgeBase> {
  return request(`/kb/${kbId}`, { method: 'PATCH', body: JSON.stringify(data) })
}

// Documents
export async function listDocuments(kbId: number): Promise<Document[]> {
  return request(`/kb/${kbId}/documents`)
}

export async function retryDocument(kbId: number, docId: number): Promise<Document> {
  return request(`/kb/${kbId}/documents/${docId}/retry`, { method: 'POST' })
}

export async function uploadDocument(kbId: number, file: File): Promise<Document> {
  const formData = new FormData()
  formData.append('file', file)
  const token = getToken()
  const res = await fetch(`${BASE_URL}/kb/${kbId}/documents`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || `HTTP ${res.status}`)
  }
  return res.json()
}

export async function deleteDocument(kbId: number, docId: number): Promise<void> {
  return request(`/kb/${kbId}/documents/${docId}`, { method: 'DELETE' })
}

// Sessions
export async function listSessions(kbId: number, signal?: AbortSignal): Promise<Session[]> {
  return request(`/kb/${kbId}/sessions`, { signal })
}

export async function createSession(kbId: number, title?: string): Promise<Session> {
  return request(`/kb/${kbId}/sessions`, { method: 'POST', body: JSON.stringify({ title: title || '新会话' }) })
}

export async function deleteSession(sessionId: number): Promise<void> {
  return request(`/sessions/${sessionId}`, { method: 'DELETE' })
}

export async function renameSession(sessionId: number, title: string): Promise<Session> {
  return request(`/sessions/${sessionId}`, { method: 'PATCH', body: JSON.stringify({ title }) })
}

export async function getMessages(sessionId: number): Promise<Array<{
  id: number; role: string; content: string; sources: Source[] | null; created_at: string
}>> {
  return request(`/sessions/${sessionId}/messages`)
}

// Chat stream
export function chatStream(
  sessionId: number,
  message: string,
  onText: (chunk: string) => void,
  onSources: (sources: Source[]) => void,
  onDone: (messageId: number) => void,
  onError: (err: string) => void,
): () => void {
  return _streamChat(`${BASE_URL}/sessions/${sessionId}/chat`, { message }, onText, onSources, onDone, onError)
}

// Retrace: edit a past user message and regenerate from that point
export function retraceChat(
  sessionId: number,
  messageId: number,
  content: string,
  onText: (chunk: string) => void,
  onSources: (sources: Source[]) => void,
  onDone: (assistantMsgId: number) => void,
  onError: (err: string) => void,
  onUserMsgId?: (userMsgId: number) => void,
): () => void {
  return _streamChat(
    `${BASE_URL}/sessions/${sessionId}/retrace`,
    { message_id: messageId, content },
    onText, onSources, onDone, onError,
    onUserMsgId,
  )
}

function _streamChat(
  url: string,
  body: object,
  onText: (chunk: string) => void,
  onSources: (sources: Source[]) => void,
  onDone: (messageId: number) => void,
  onError: (err: string) => void,
  onUserMsgId?: (userMsgId: number) => void,
): () => void {
  const token = getToken()
  const ctrl = new AbortController()

  fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
    signal: ctrl.signal,
  }).then(async (res) => {
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }))
      onError(err.detail || `HTTP ${res.status}`)
      return
    }
    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        try {
          const data = JSON.parse(line.slice(6))
          if (data.type === 'text') onText(data.content)
          else if (data.type === 'sources') onSources(data.content)
          else if (data.type === 'done') onDone(data.message_id)
          else if (data.type === 'user_msg_id') onUserMsgId?.(data.message_id)
          else if (data.type === 'error') onError(data.content)
        } catch {}
      }
    }
  }).catch((e) => {
    if (e.name !== 'AbortError') onError(e.message)
  })

  return () => ctrl.abort()
}

// Session export
export async function exportSession(sessionId: number): Promise<string> {
  const messages = await getMessages(sessionId)
  const lines: string[] = ['# 会话导出\n']
  for (const msg of messages) {
    const role = msg.role === 'user' ? '**用户**' : '**AI**'
    const time = msg.created_at ? new Date(msg.created_at).toLocaleString('zh-CN') : ''
    lines.push(`\n## ${role}${time ? ` — ${time}` : ''}\n`)
    lines.push(`${msg.content}\n`)
    if (msg.sources && msg.sources.length > 0) {
      lines.push('\n**参考来源:**\n')
      for (const s of msg.sources) {
        lines.push(`- [${s.filename} #${s.chunk_index}] ${s.text.slice(0, 200)}...`)
      }
      lines.push('')
    }
  }
  return lines.join('\n')
}

// Voice
export async function submitFeedback(messageId: number, rating: 1 | -1): Promise<void> {
  return request(`/messages/${messageId}/feedback`, {
    method: 'POST',
    body: JSON.stringify({ rating }),
  })
}

export async function stt(audioBlob: Blob, ext: string): Promise<{ text: string }> {
  const formData = new FormData()
  formData.append('file', audioBlob, `recording.${ext}`)
  const token = getToken()
  const res = await fetch(`${BASE_URL}/voice/stt`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || `HTTP ${res.status}`)
  }
  return res.json()
}

export async function tts(text: string): Promise<Blob> {
  const token = getToken()
  const res = await fetch(`${BASE_URL}/voice/tts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ text }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || `HTTP ${res.status}`)
  }
  return res.blob()
}
