# AskMyDocs

> 上传文档，创建私有知识库，用自然语言（文字或语音）向知识库提问。系统基于 RAG 技术检索相关内容，流式生成带引用来源的回答。

---

## 项目介绍

AskMyDocs 是一款开源的私有知识库问答系统，支持上传 PDF、Markdown、TXT 等文档，构建专属知识库，并通过自然语言进行问答。系统采用 RAG（检索增强生成）技术，确保回答有据可查。

### 核心特性

- **文档上传与解析**：支持 PDF、Markdown、TXT 格式，异步解析、分块、Embedding 存储
- **RAG 对话**：多轮对话，流式 SSE 输出，可展开的引用来源列表，支持为每个知识库设置专属系统提示词
- **语音交互**：浏览器录音 → STT 语音识别 → 发送问题；TTS 朗读 AI 回答
- **用户系统**：注册 / 登录 / JWT 鉴权 / 邮箱验证 / 密码重置
- **限流保护**：滑动窗口限流，每用户每分钟 30 次请求
- **极简前端**：双栏布局，支持明暗模式，Markdown 渲染，代码高亮

---

## 技术栈

### 前端

| 分类 | 技术 |
|------|------|
| 框架 | React 19 + TypeScript |
| 构建工具 | Vite 6 |
| CSS 框架 | Tailwind CSS 3 |
| 路由 | React Router DOM 6 |
| Markdown | react-markdown + remark-gfm + rehype-highlight |
| 代码高亮 | react-syntax-highlighter |
| 测试 | Vitest |
| 包管理器 | pnpm |

### 后端

| 分类 | 技术 |
|------|------|
| 框架 | FastAPI + Python |
| 数据库 | PostgreSQL 15 |
| ORM | SQLAlchemy 2.0 |
| 向量数据库 | Chroma 1.0 |
| 缓存 / 队列 | Redis 7 + RQ |
| 认证 | JWT (python-jose) |
| 文档解析 | pypdf / python-docx / openpyxl / BeautifulSoup4 |
| LLM 接口 | OpenAI 兼容接口（阿里百炼） |
| STT / TTS | 阿里百炼 Qwen3-ASR / cosyvoice-v3 |
| 测试 | pytest |

### 部署

| 组件 | 说明 |
|------|------|
| 容器化 | Docker Compose（6 个服务） |
| 服务端口 | Frontend 3001 / Backend 8002 / Chroma 8001 |

---

## 快速开始

### 环境要求

- Docker Desktop 或 OrbStack
- Docker Compose v2+

### 启动步骤

```bash
# 1. 复制环境变量配置文件
cp .env.example .env

# 2. 编辑 .env，填入阿里百炼 API Key 等配置

# 3. 一键启动所有服务
docker compose up -d

# 4. 查看服务状态
docker compose ps
```

启动后访问：

- **前端界面**：http://localhost:3001
- **API 文档**：http://localhost:8000/docs

### 已有数据库升级

如果之前已有数据库，需手动运行迁移添加新列：

```bash
cd backend && PYTHONPATH=. python -m migrations.add_email_verification
```

---

## 项目结构

```
askmy-docs/
├── backend/                 # FastAPI 后端
│   ├── api/                 # API 路由
│   ├── clients.py           # 外部服务客户端
│   ├── config.py            # 配置管理
│   ├── database.py          # 数据库连接
│   ├── main.py              # FastAPI 应用入口
│   ├── middleware/          # 中间件
│   ├── migrations/          # 数据库迁移脚本
│   ├── models/              # SQLAlchemy 模型
│   ├── redis_client.py      # Redis 客户端
│   ├── services/            # 业务逻辑服务
│   ├── tasks/               # RQ 异步任务
│   ├── tests/               # pytest 测试
│   ├── utils/               # 工具函数
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/                # React 前端
│   ├── src/                # 源代码
│   ├── public/              # 静态资源
│   ├── Dockerfile
│   ├── package.json
│   ├── vite.config.ts
│   └── tailwind.config.js
├── data/                    # 数据持久化目录
│   ├── postgres/            # PostgreSQL 数据
│   ├── redis/               # Redis 数据
│   ├── chroma/              # Chroma 向量数据
│   └── files/               # 上传文件存储
├── docker-compose.yml
├── .env.example             # 环境变量示例
├── .gitignore
└── LICENSE                  # MIT License
```

---

## 服务架构

```
┌─────────────────────────────────────────────────────────┐
│                    Docker Compose                       │
│                                                         │
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐    │
│  │   frontend  │   │   backend  │   │   worker    │    │
│  │  (Nginx)   │   │ (FastAPI)  │   │ (RQ Worker) │    │
│  │   :3000    │   │   :8000    │   │             │    │
│  └─────────────┘   └─────────────┘   └─────────────┘    │
│                          │                              │
│         ┌────────────────┼────────────────┐             │
│         │                │                │             │
│   PostgreSQL         Redis          Chroma              │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### 服务说明

| 服务 | 端口 | 说明 |
|------|------|------|
| frontend | 3001 | React 前端，Nginx 反向代理 |
| backend | 8002 | FastAPI 后端，提供 REST API |
| worker | - | RQ 异步任务处理器 |
| postgres | 5432 | PostgreSQL 15 |
| redis | 6379 | Redis 7 |
| chroma | 8001 | Chroma 1.0 向量数据库 |

---

## 功能列表

### 用户系统

- 注册、登录、JWT 鉴权
- 邮箱验证、密码重置（通过 SMTP 邮件）
- 接口限流：滑动窗口，每用户每分钟 30 次

### 知识库管理

- 创建、重命名、删除知识库
- 上传文档（PDF / Markdown / TXT）
- 异步解析：文本提取 → 分块 → Embedding → Chroma 向量存储
- 文档处理状态实时轮询
- 文档全文搜索（关键词匹配）
- 可设置系统提示词（system_prompt），控制 RAG 回答风格和行为
- 可调整检索数量（top_k）和相似度阈值（score_threshold）

### 对话

- 多轮对话，RAG 检索 + 流式 SSE 输出
- 可展开的引用来源列表（文件名、片段、相关度）
- 对 AI 回答点赞 / 踩反馈
- 超过 10 轮历史自动摘要压缩
- 分享会话链接（30 天有效期）

### 语音交互

- STT：浏览器录音 → 识别为文字后自动发送
- TTS：点击播放按钮朗读 AI 回答

### 前端

- Vercel 风格极简设计，纯黑白灰色调
- 双栏布局（知识库树 + 对话区）
- 响应式设计，支持手动切换明暗模式 + 自动检测系统主题
- 侧边栏搜索：实时过滤知识库和会话名称
- 会话重命名：双击会话名即可内联编辑
- Markdown 渲染（含代码块、表格）
- 流式打字动画、自动滚动

---

## 环境变量说明

| 变量名 | 必填 | 说明 |
|--------|------|------|
| `DATABASE_URL` | 是 | PostgreSQL 连接字符串 |
| `REDIS_URL` | 是 | Redis 连接字符串 |
| `LLM_BASE_URL` | 是 | LLM API 基础地址（OpenAI 兼容） |
| `LLM_API_KEY` | 是 | LLM API Key |
| `LLM_MODEL` | 是 | LLM 模型名 |
| `EMBEDDING_BASE_URL` | 是 | Embedding API 基础地址 |
| `EMBEDDING_API_KEY` | 是 | Embedding API Key |
| `EMBEDDING_MODEL` | 是 | Embedding 模型名 |
| `DASHSCOPE_API_KEY` | 是 | 阿里百炼语音 API Key |
| `STT_MODEL` | 是 | 语音识别模型名 |
| `TTS_MODEL` | 是 | 语音合成模型名 |
| `TTS_VOICE` | 否 | TTS 音色 |
| `JWT_SECRET` | 是 | JWT 签名密钥（生产环境必须修改） |
| `JWT_EXPIRE_DAYS` | 否 | JWT 有效期（天），默认 7 |
| `RATE_LIMIT_PER_MINUTE` | 否 | 每用户每分钟最大请求数，默认 30 |
| `CHROMA_HOST` | 否 | Chroma 服务地址 |
| `CHROMA_PORT` | 否 | Chroma 服务端口 |
| `FILE_STORAGE_PATH` | 否 | 上传文件存储路径 |
| `CORS_ORIGINS` | 是 | 允许的前端域名 |
| `EMAIL_SMTP_HOST` | 否 | SMTP 服务器地址 |
| `EMAIL_SMTP_PORT` | 否 | SMTP 端口 |
| `EMAIL_USERNAME` | 否 | SMTP 用户名 |
| `EMAIL_PASSWORD` | 否 | SMTP 密码 |
| `EMAIL_FROM_ADDRESS` | 否 | 发件人地址 |
| `EMAIL_USE_TLS` | 否 | 是否使用 TLS |

### 生成 JWT Secret

```bash
openssl rand -hex 32
```

---

## API 接口总览

### 用户与鉴权

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth/register` | 注册（发送验证邮件） |
| POST | `/api/auth/login` | 登录，返回 JWT |
| GET | `/api/auth/me` | 获取当前用户信息 |
| POST | `/api/auth/verify-email` | 验证邮箱 |
| POST | `/api/auth/forgot-password` | 发起密码重置 |
| POST | `/api/auth/reset-password` | 重置密码 |

### 知识库

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/kb` | 创建知识库 |
| GET | `/api/kb` | 列出知识库 |
| PATCH | `/api/kb/{kb_id}` | 更新知识库 |
| DELETE | `/api/kb/{kb_id}` | 删除知识库 |

### 文档

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/kb/{kb_id}/documents` | 上传文档 |
| GET | `/api/kb/{kb_id}/documents` | 列出文档 |
| DELETE | `/api/kb/{kb_id}/documents/{doc_id}` | 删除文档 |
| POST | `/api/kb/{kb_id}/documents/search` | 全文检索 |

### 对话

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/kb/{kb_id}/sessions` | 创建会话 |
| GET | `/api/kb/{kb_id}/sessions` | 列出会话 |
| PATCH | `/api/sessions/{session_id}` | 重命名会话 |
| GET | `/api/sessions/{session_id}/messages` | 获取历史消息 |
| POST | `/api/sessions/{session_id}/chat` | 发送消息（流式 SSE） |
| DELETE | `/api/sessions/{session_id}` | 删除会话 |

### 语音

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/voice/stt` | 语音转文字 |
| POST | `/api/voice/tts` | 文字转语音 |

### 统计与反馈

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/messages/{message_id}/feedback` | 点赞/踩 |
| GET | `/api/kb/{kb_id}/stats` | 知识库统计 |

---

## 开发指南

### 后端开发

```bash
cd backend

# 创建虚拟环境
python -m venv .venv
source .venv/bin/activate

# 安装依赖
pip install -r requirements.txt

# 运行开发服务器
PYTHONPATH=. uvicorn main:app --reload --host 0.0.0.0 --port 8000

# 运行测试
pytest

# 运行 RQ Worker
rq worker document-processing --url redis://localhost:6379/0
```

### 前端开发

```bash
cd frontend

# 安装依赖
pnpm install

# 运行开发服务器
pnpm dev

# 构建生产版本
pnpm build

# 运行测试
pnpm test
```

---

## 部署

### Docker Compose（生产环境推荐）

```bash
# 构建并启动所有服务
docker compose up -d --build

# 查看日志
docker compose logs -f

# 停止所有服务
docker compose down

# 停止并清除数据
docker compose down -v
```

### 前端独立部署（Vercel）

```bash
cd frontend
pnpm build
# 将 dist 目录部署到 Vercel
```

### 环境变量配置

生产环境部署时，请确保：

1. 修改 `JWT_SECRET` 为强随机字符串
2. 配置正确的 `CORS_ORIGINS`（前端域名）
3. 配置 SMTP 服务以启用邮件功能
4. 使用真实的 LLM / Embedding / 语音 API Key

---

## 已知问题与修复记录

| 版本 | 问题 | 修复方式 |
|------|------|----------|
| - | Chroma 健康检查失败（镜像无 curl） | 改用 bash TCP 探测替代 curl |
| - | nginx 容器重启后 502（旧 IP 缓存） | 加 `resolver 127.0.0.11` 动态解析 |
| - | 文档上传后一直"待处理" | worker 未导入全部模型导致外键报错；修复 import |
| - | Embedding API 400 错误 | batch_size 从 20 改为 10 |
| - | 侧边栏会话偶尔消失 | sessions 改为按知识库独立缓存，消除竞态 |
| 最新 | 前端点击会话后 `k.map is not a function` 报错 | 后端返回 `{messages: [...]}` 对象，前端未解包 |
| 最新 | Bundle 大小超过 1MB | 启用 code-splitting |
| 最新 | 缺少测试基础设施 | 添加 pytest + Vitest 测试 |
| 最新 | 缺少手动主题切换 | 添加 `useTheme` hook |
| 最新 | 缺少邮箱验证/密码重置 | 添加验证邮件发送、邮箱验证、密码重置端点 |
| 最新 | 缺少文档全文搜索 | 添加 search 端点 |
| 最新 | 注册/登录 HTTP 500 | 添加迁移脚本 `add_email_verification.py` |
| 最新 | 代码质量检查失败（ruff） | 修复未使用导入、歧义变量名、无占位符 f-string 等 35 处问题 |
| 最新 | API Key 存储不安全 | SHA256 升级为 PBKDF2+salt（10 万次迭代） |
| 最新 | 文档搜索全表加载 | 改用 Chroma where_document 服务端过滤 |
| 最新 | 消息获取浪费 | 获取条数从 20 优化为 6，减少不必要的 DB 查询 |
| 最新 | 数据库连接池未配置 | 添加 pool_size=20, max_overflow=10 |
| 最新 | TTS 同步阻塞 worker | 改为 asyncio.to_thread 异步调用 |
| 最新 | worker 无 healthcheck | 添加 RQ worker 健康检查 |
| 最新 | 缺少复合索引 | 添加 sessions(kb_id,updated_at) 和 documents(kb_id,status) 索引 |

---

## License

MIT License - 详见 [LICENSE](LICENSE) 文件