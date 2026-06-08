# AskMyDocs

上传文档，创建私有知识库，用自然语言（文字或语音）向知识库提问。基于 RAG（检索增强生成）技术检索相关内容，流式生成带引用来源的回答。

## 目录

- [核心功能](#核心功能)
- [技术栈](#技术栈)
- [系统架构](#系统架构)
- [项目结构](#项目结构)
- [快速开始](#快速开始)
- [API 参考](#api-参考)
- [配置说明](#配置说明)
- [开发指南](#开发指南)
- [部署](#部署)
- [测试](#测试)
- [许可证](#许可证)

## 核心功能

| 功能 | 说明 |
|------|------|
| 文档上传与解析 | 支持 PDF / Markdown / TXT / DOCX / XLSX / CSV / HTML 格式；异步解析、分块、Embedding 至 Chroma 向量库 |
| RAG 对话 | 多轮对话，流式 SSE 输出，可展开的引用来源列表，支持为每个知识库设置专属 system prompt |
| 知识库管理 | 创建/重命名/删除知识库，可调节检索数量（top_k）和相似度阈值（score_threshold） |
| 文档全文搜索 | 关键词匹配，服务端 Chroma `where_document` 过滤 |
| 语音交互 | 浏览器录音 → STT 语音识别 → 发送问题；TTS 朗读 AI 回答 |
| 用户系统 | 注册/登录/JWT 鉴权/API Key 管理/邮箱验证/密码重置 |
| 会话分享 | 生成分享链接（30 天有效期），公开只读访问 |
| 消息编辑与回溯 | 编辑用户消息后重新生成 AI 回答 |
| 反馈系统 | 对 AI 回答点赞/踩 |
| 限流保护 | 滑动窗口限流（每用户每分钟 30 次）+ IP 级限流 |

## 技术栈

### 前端

| 分类 | 技术 |
|------|------|
| 框架 | React 19 + TypeScript |
| 构建工具 | Vite 6 |
| CSS 框架 | Tailwind CSS 3（Geist / Noto Sans SC 字体，CSS 变量驱动明暗主题） |
| 状态管理 | React Context（无外部库） |
| Markdown | react-markdown + remark-gfm + rehype-highlight |
| 代码高亮 | react-syntax-highlighter（Prism + oneDark） |
| 动画 | Framer Motion |
| 图标 | Lucide React |
| 测试 | Vitest + Testing Library |
| 包管理器 | pnpm |

### 后端

| 分类 | 技术 |
|------|------|
| 框架 | FastAPI + Python 3.11 |
| 数据库 | PostgreSQL 15 |
| ORM | SQLAlchemy 2.0（async，连接池 pool_size=20） |
| 向量数据库 | Chroma 1.0 |
| 缓存/队列 | Redis 7 + RQ（文档处理队列 `document-processing`） |
| 认证 | JWT（HS256）+ API Key（PBKDF2+SHA256，10 万次迭代） |
| 文档解析 | pypdf / python-docx / openpyxl / beautifulsoup4 / charset-normalizer |
| LLM 接口 | OpenAI 兼容接口（默认阿里百炼 DashScope） |
| STT / TTS | 阿里百炼 Qwen3-ASR / CosyVoice-v3 |
| 邮件 | aiosmtplib（邮箱验证、密码重置） |
| 限流 | 滑动窗口（用户级 30/min + IP 级可调） |

### 部署

| 组件 | 说明 |
|------|------|
| 容器化 | Docker Compose（6 个服务） |
| 服务端口 | Frontend :3001 / Backend :8002 / Chroma :8001 |

## 系统架构

```
Host ports:     3001                       8002                        8001
                 │                          │                           │
                 ▼                          ▼                           ▼
┌──────────────────────────┐  ┌──────────────────────────┐  ┌──────────────────┐
│  frontend (Nginx :80)    │  │  backend (FastAPI :8000) │  │  chroma (:8000)   │
│  React 19 SPA            │  │  REST API + SSE          │  │  Vector DB        │
│  SPA fallback + SSE      │  │  RAG 流式输出            │  │  Cosine 距离      │
│  /api/ → backend:8000    │  │  6 个路由前缀            │  │  Collection/kb_id │
└──────────────────────────┘  └───────────┬──────────────┘  └──────────────────┘
                                          │
                          ┌───────────────┼───────────────────┐
                          │               │                   │
                          ▼               ▼                   ▼
                  ┌─────────────┐  ┌─────────────┐  ┌──────────────────┐
                  │  postgres   │  │   redis     │  │  worker (RQ)     │
                  │  :5432      │  │  :6379      │  │  文档异步解析     │
                  │  9 张表     │  │  限流/缓存   │  │  分块 → Embedding │
                  └─────────────┘  └─────────────┘  └──────────────────┘
```

**核心数据流**：

```
用户上传文档 → 后端入库 → RQ Worker（异步：提取文本 → 分块 → Embedding → Chroma）
用户提问 → POST /api/sessions/{id}/chat → Chroma 检索 → LLM 流式生成（SSE）→ 前端渲染
         → 检索来源记录（RetrievalLog）→ 前端展开引用列表
```

## 项目结构

```
askmy-docs/
├── frontend/                       # React 19 前端（SPA，无路由库）
│   ├── src/
│   │   ├── components/
│   │   │   ├── auth/AuthPage.tsx   # 登录/注册/验证邮箱/重置密码（统一页面）
│   │   │   ├── chat/ChatArea.tsx   # 主聊天区（消息流、输入、语音、反馈、导出）
│   │   │   ├── kb/
│   │   │   │   ├── DocumentModal.tsx    # 文档上传/列表/删除
│   │   │   │   └── KbSettingsModal.tsx  # 知识库 RAG 参数设置
│   │   │   ├── layout/Sidebar.tsx  # 左侧栏（知识库树 + 会话列表 + 搜索 + 主题）
│   │   │   └── ui/                 # 9 个通用组件（CommandPalette / Toast / Modal...）
│   │   ├── hooks/                  # 7 个自定义 Hook
│   │   │   ├── useAuth.tsx         # Auth Context（JWT + localStorage）
│   │   │   ├── useTheme.ts         # 主题切换（system / dark / light）
│   │   │   ├── useRecorder.ts      # 浏览器录音（MediaRecorder + AnalyserNode）
│   │   │   ├── useBreakpoint.ts    # 响应式断点（768px）
│   │   │   └── ...                 # useFocusTrap / useKeyboardShortcuts / ...
│   │   ├── api/index.ts            # 全部 API 调用封装（auth / KB / doc / session / voice / feedback）
│   │   ├── types/index.ts          # TypeScript 接口定义
│   │   ├── App.tsx                 # 根组件：认证门控 + Sidebar + ChatArea
│   │   └── main.tsx                # 入口
│   ├── package.json
│   ├── vite.config.ts              # dev:3000 代理 /api → backend:8000；代码分割方案
│   ├── tailwind.config.js          # CSS 变量驱动颜色、Geist 字体、自定义动画
│   └── Dockerfile                  # 多阶段：node:20-alpine 构建 → nginx:alpine 运行
│
├── backend/                        # FastAPI 后端
│   ├── api/
│   │   ├── auth.py                 # 注册/登录/当前用户/API Key CRUD/邮箱验证/密码重置
│   │   ├── knowledge_base.py       # 知识库 CRUD
│   │   ├── documents.py            # 文档上传/列表/状态/搜索/删除/重试
│   │   ├── sessions.py             # 会话 CRUD/流式 SSE 聊天/回溯/分享/消息删除
│   │   ├── voice.py                # STT / TTS
│   │   └── stats.py                # 反馈/知识库统计/检索来源
│   ├── services/
│   │   ├── document_service.py     # 文档解析（支持 8 种格式）+ 文本分块（chunk_size=500）
│   │   ├── embedding_service.py    # Embedding API 调用
│   │   ├── llm_service.py          # LLM 流式/非流式调用
│   │   ├── rag_service.py          # RAG 核心：检索 + 流式生成 + Redis 缓存 + 记忆压缩
│   │   ├── voice_service.py        # 阿里百炼语音（Qwen3-ASR / CosyVoice-v3）
│   │   ├── email_service.py        # SMTP 邮件发送
│   │   └── memory_service.py       # 对话历史自动摘要压缩（>10 轮触发）
│   ├── models/                     # 9 个 SQLAlchemy 模型
│   │   ├── user.py                 # User（含邮箱验证字段）
│   │   ├── knowledge_base.py       # KnowledgeBase（top_k / score_threshold / system_prompt）
│   │   ├── document.py             # Document（status 轮询, 复合索引）
│   │   ├── session.py              # Session（share_token / expires_at, 复合索引）
│   │   ├── message.py              # Message（sources JSON, response_time）
│   │   ├── feedback.py             # Feedback + RetrievalLog
│   │   ├── api_key.py              # ApiKey（PBKDF2 哈希存储）
│   │   └── password_reset.py       # PasswordResetToken
│   ├── tasks/
│   │   └── document_task.py        # RQ 异步任务：解析 → 分块 → Embedding → Chroma
│   ├── middleware/
│   │   ├── auth.py                 # JWT / API Key 双认证 Depends
│   │   ├── rate_limit.py           # 滑动窗口限流（用户级 + IP 级）
│   │   └── request_id.py           # 请求链路追踪中间件
│   ├── utils/
│   │   ├── security.py             # bcrypt + JWT + PBKDF2 API Key
│   │   └── logger.py               # loguru（stdout + 50MB 轮转文件）
│   ├── migrations/                 # 内联迁移 + 独立脚本
│   ├── tests/                      # pytest（auth + security）
│   ├── main.py                     # 入口（lifespan / CORS / 路由 / 异常处理）
│   ├── config.py                   # Pydantic Settings（23 个环境变量）
│   ├── clients.py                  # LLM / Embedding / Chroma 客户端（contextvars）
│   ├── chroma_client.py            # Chroma collection 操作封装
│   ├── database.py                 # async SQLAlchemy（pool_size=20, max_overflow=10）
│   └── redis_client.py             # async + sync Redis 双客户端
│
├── data/                           # 持久化数据目录（Docker volume）
│   ├── postgres/
│   ├── redis/
│   ├── chroma/
│   └── files/
├── docker-compose.yml
├── .env.example
├── LICENSE                         # MIT
└── .gitignore
```

## 快速开始

### 环境要求

- Docker Desktop 或 OrbStack
- Docker Compose v2+

### 启动步骤

```bash
# 1. 复制环境变量
cp .env.example .env

# 2. 编辑 .env，填入 LLM / Embedding / 语音 API Key 和 JWT_SECRET

# 3. 一键启动
docker compose up -d

# 4. 查看服务状态
docker compose ps
```

启动后访问：

| 服务 | 地址 |
|------|------|
| 前端界面 | http://localhost:3001 |
| API 文档 | http://localhost:8000/docs |
| 健康检查 | http://localhost:8000/health |

### 已有数据库升级

如果之前已有旧数据库，需手动运行迁移：

```bash
cd backend && PYTHONPATH=. python -m migrations.add_email_verification
cd backend && PYTHONPATH=. python -m migrations.add_share_token
```

新部署会自动运行内联迁移，无需手动操作。

## API 参考

### 用户与鉴权

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth/register` | 注册（发送验证邮件，IP 限流 5/60s） |
| POST | `/api/auth/login` | 登录，返回 JWT（IP 限流 10/60s） |
| GET | `/api/auth/me` | 获取当前用户信息 |
| POST | `/api/auth/api-keys` | 创建 API Key |
| GET | `/api/auth/api-keys` | 列出 API Key |
| DELETE | `/api/auth/api-keys/{key_id}` | 撤销 API Key |
| POST | `/api/auth/verify-email` | 验证邮箱 |
| POST | `/api/auth/forgot-password` | 发送密码重置邮件（IP 限流 3/60s） |
| POST | `/api/auth/reset-password` | 重置密码（IP 限流 3/60s） |

### 知识库

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/kb` | 创建知识库 |
| GET | `/api/kb` | 列出知识库 |
| PATCH | `/api/kb/{kb_id}` | 更新知识库（top_k / score_threshold / system_prompt） |
| DELETE | `/api/kb/{kb_id}` | 删除知识库及关联 Chroma collection |
| GET | `/api/kb/{kb_id}/stats` | 知识库统计 |

### 文档

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/kb/{kb_id}/documents` | 上传文档（提交到 RQ worker 异步处理） |
| GET | `/api/kb/{kb_id}/documents` | 列出文档（cursor 分页） |
| GET | `/api/kb/{kb_id}/documents/{doc_id}` | 查询文档处理状态 |
| POST | `/api/kb/{kb_id}/documents/{doc_id}/retry` | 重试失败文档 |
| DELETE | `/api/kb/{kb_id}/documents/{doc_id}` | 删除文档及 Chroma 向量 |
| POST | `/api/kb/{kb_id}/documents/search` | 全文搜索（Chroma `where_document` 服务端过滤） |

### 对话

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/kb/{kb_id}/sessions` | 创建会话 |
| GET | `/api/kb/{kb_id}/sessions` | 列出会话（cursor 分页） |
| PATCH | `/api/sessions/{session_id}` | 重命名会话 |
| GET | `/api/sessions/{session_id}/messages` | 获取历史消息（cursor 分页） |
| POST | `/api/sessions/{session_id}/chat` | 发送消息（流式 SSE 输出） |
| POST | `/api/sessions/{session_id}/retrace` | 回溯并重新生成回答 |
| POST | `/api/sessions/{session_id}/share` | 生成分享链接（30 天有效期） |
| DELETE | `/api/sessions/{session_id}` | 删除会话 |
| DELETE | `/api/messages/{message_id}` | 删除单条消息 |

### 语音与反馈

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/voice/stt` | 语音转文字 |
| POST | `/api/voice/tts` | 文字转语音 |
| POST | `/api/messages/{message_id}/feedback` | 点赞（1）/ 踩（-1） |
| GET | `/api/messages/{message_id}/sources` | 查看检索来源 |

### 系统

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/health` | 健康检查 |

### SSE 事件格式

`POST /api/sessions/{session_id}/chat` 返回 `text/event-stream`：

```json
data: {"type":"text","content":"基于您提供的..."}
data: {"type":"sources","sources":[{"filename":"...","chunk_index":0,"text":"...","score":0.92}]}
data: {"type":"user_msg_id","id":"..."}
data: {"type":"done"}
```

## 配置说明

### 环境变量

| 变量 | 必填 | 默认值 | 说明 |
|------|------|--------|------|
| `DATABASE_URL` | 是 | — | PostgreSQL 连接字符串 |
| `POSTGRES_USER` | 是 | `ai_user` | PostgreSQL 用户 |
| `POSTGRES_PASSWORD` | 是 | — | PostgreSQL 密码 |
| `POSTGRES_DB` | 是 | `ai_assistant` | PostgreSQL 数据库名 |
| `REDIS_URL` | 是 | `redis://redis:6379/0` | Redis 连接字符串 |
| `LLM_BASE_URL` | 是 | `https://dashscope.aliyuncs.com/compatible-mode/v1` | OpenAI 兼容 LLM API |
| `LLM_API_KEY` | 是 | — | LLM API Key |
| `LLM_MODEL` | 是 | `qwen3.6-plus-2026-04-02` | LLM 模型名 |
| `EMBEDDING_BASE_URL` | 是 | `https://dashscope.aliyuncs.com/compatible-mode/v1` | Embedding API 地址 |
| `EMBEDDING_API_KEY` | 是 | — | Embedding API Key |
| `EMBEDDING_MODEL` | 是 | `text-embedding-v3` | Embedding 模型名 |
| `DASHSCOPE_API_KEY` | 是 | — | 阿里百炼语音 API Key |
| `STT_MODEL` | 是 | `qwen3-asr-flash-2026-02-10` | 语音识别模型 |
| `TTS_MODEL` | 是 | `cosyvoice-v3-flash` | 语音合成模型 |
| `TTS_VOICE` | 否 | `longanyang` | TTS 音色 |
| `JWT_SECRET` | 是 | — | JWT 签名密钥（生产必改） |
| `JWT_EXPIRE_DAYS` | 否 | 7 | JWT 有效期（天） |
| `RATE_LIMIT_PER_MINUTE` | 否 | 30 | 每用户每分钟最大请求数 |
| `CORS_ORIGINS` | 否 | `http://localhost:3000` | 允许的前端域名（逗号分隔） |
| `CHROMA_HOST` | 否 | `chroma` | Chroma 服务地址 |
| `CHROMA_PORT` | 否 | 8000 | Chroma 服务端口 |
| `FILE_STORAGE_PATH` | 否 | `/data/files` | 上传文件存储路径 |
| `EMAIL_SMTP_HOST` | 否 | — | SMTP 服务器（未配置则禁用邮件） |
| `EMAIL_SMTP_PORT` | 否 | 587 | SMTP 端口 |
| `EMAIL_USERNAME` | 否 | — | SMTP 用户名 |
| `EMAIL_PASSWORD` | 否 | — | SMTP 密码 |
| `EMAIL_FROM_ADDRESS` | 否 | `noreply@askmydocs.com` | 发件人地址 |
| `EMAIL_USE_TLS` | 否 | `true` | 是否使用 TLS |

> `JWT_SECRET` 强随机串生成：`openssl rand -hex 32`

### Docker Compose 服务

| 服务 | 内部端口 | 映射端口 | 资源限制 | 依赖 |
|------|----------|----------|----------|------|
| frontend | 80 | 3001 | 0.25 CPU + 128MB | backend |
| backend | 8000 | 8002 | 0.5 CPU + 256MB | postgres / redis / chroma（健康） |
| worker | — | — | 0.5 CPU + 256MB | postgres / redis / chroma（健康） |
| postgres | 5432 | — | 0.25 CPU + 128MB | — |
| redis | 6379 | — | 0.25 CPU + 128MB | — |
| chroma | 8000 | 8001 | 0.25 CPU + 128MB | — |

> 前端通过 Nginx 代理 `/api/*` 到 backend:8000，支持 SSE（`proxy_buffering off`，300s 超时）。Nginx 使用 Docker DNS 动态解析，避免容器重启后 502。

## 开发指南

### 后端开发

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# 运行开发服务器
PYTHONPATH=. uvicorn main:app --reload --host 0.0.0.0 --port 8000

# 运行 RQ Worker
rq worker document-processing --url redis://localhost:6379/0

# 运行测试
pytest
```

### 前端开发

```bash
cd frontend
pnpm install

# 开发服务器（热重载 + /api 代理到 backend:8000）
pnpm dev

# 构建生产版本
pnpm build
```

### 支持的文档格式

| 格式 | 解析方式 |
|------|----------|
| PDF | `pypdf` 提取文本 |
| DOCX | `python-docx` |
| XLSX / XLS | `openpyxl` |
| CSV | Python `csv` 标准库 |
| HTML / HTM | `beautifulsoup4` |
| Markdown | 纯文本读取 |
| TXT | 纯文本读取 |

### 文本分块策略

- **chunk_size**: 500 字符
- **overlap**: 50 字符
- **分块方式**: 优先按段落拆分，确保语义完整性

### RAG 参数

每个知识库可独立配置：

| 参数 | 默认值 | 范围 | 说明 |
|------|--------|------|------|
| `top_k` | 5 | 1–50 | 检索返回的片段数量 |
| `score_threshold` | 0.5 | 0–1 | 相似度过滤阈值 |
| `system_prompt` | — | — | 自定义 AI 回答风格（text 字段） |

### 会话记忆压缩

当对话超过 10 轮时，自动触发 LLM 摘要压缩，将历史会话替换为简短摘要。压缩后对话可继续正常进行。

### 代码规范

后端使用 ruff 进行代码检查；提交信息格式参考 Angular Commit Convention。

## 部署

### Docker Compose（生产环境推荐）

```bash
# 构建并启动
docker compose up -d --build

# 查看日志
docker compose logs -f

# 停止并清理数据
docker compose down -v
```

### 前端独立部署（Vercel）

```bash
cd frontend
pnpm build
# 将 dist 目录部署到 Vercel
```

### 生产环境 Checklist

1. `JWT_SECRET` 替换为强随机串
2. `CORS_ORIGINS` 配置正确的前端域名
3. 配置 SMTP 以启用邮箱验证/密码重置
4. 填入有效的 LLM / Embedding / 语音 API Key
5. 考虑将 `CORS_ALLOW_ALL` 设为 `false`

## 测试

```bash
# 后端
cd backend && pytest -v

# 前端
cd frontend && pnpm test
```

## 许可证

[MIT License](./LICENSE) © cnhyk