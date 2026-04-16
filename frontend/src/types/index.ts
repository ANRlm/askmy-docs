export interface User {
  id: number
  email: string
  username: string
  created_at: string
}

export interface KnowledgeBase {
  id: number
  name: string
  description: string
  top_k: number
  score_threshold: number
  created_at: string
}

export interface Document {
  id: number
  filename: string
  status: 'pending' | 'processing' | 'done' | 'failed'
  chunk_count: number | null
  error_msg: string | null
  created_at: string
}

export interface Session {
  id: number
  title: string
  kb_id: number
  created_at: string
}

export interface Source {
  filename: string
  chunk_index: number
  text: string
  score: number
}

export interface Message {
  id: string
  db_id?: number  // 后端数据库消息 id，用于提交反馈
  role: 'user' | 'assistant'
  content: string
  sources?: Source[]
  response_time?: number
  streaming?: boolean
  isError?: boolean
  created_at?: string  // ISO timestamp from backend
}

export interface AuthTokens {
  access_token: string
  token_type: string
}
