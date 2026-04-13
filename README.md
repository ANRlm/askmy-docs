# AskMyDocs

> 上传文档，创建私有知识库，用自然语言（文字或语音）向知识库提问。系统基于 RAG 技术检索相关内容，流式生成带引用来源的回答。

---

## 技术栈

| 层级 | 选型 |
|---|---|
| 前端 | React 19 + TypeScript + Vite + Tailwind CSS |
| 后端框架 | Python + FastAPI |
| 数据库 | PostgreSQL 15 |
| 向量数据库 | Chroma 1.0 |
| 缓存 / 队列 | Redis 7 + RQ |
| LLM 接口 | OpenAI 兼容接口（阿里百炼） |
| Embedding | 阿里百炼 text-embedding-v3 |
| STT | 阿里百炼 Qwen3-ASR-Flash |
| TTS | 阿里百炼 cosyvoice-v3-flash |
| 部署 | Docker Compose（6 个服务） |
| 鉴权 | JWT |

---

## 快速启动

```bash
# 1. 复制并填写环境变量
cp .env.example .env
# 编辑 .env，填入你的阿里百炼 API Key 等配置

# 2. 一键启动所有服务
docker compose up -d

# 3. 查看服务状态
docker compose ps
```

启动后访问：
- **前端界面**：http://localhost:3000
- **API 文档**：http://localhost:8000/docs

---

## 服务架构

```
frontend (Nginx:3000)
    └── 反向代理 /api/ → backend

backend  (FastAPI:8000)
    ├── PostgreSQL  — 用户、知识库、会话、消息
    ├── Redis       — 限流 + 异步任务队列
    └── Chroma      — 向量检索

worker   (RQ Worker)
    └── 异步文档解析、分块、Embedding 写入 Chroma
```

---

## 环境变量说明

| 变量名 | 说明 |
|---|---|
| `DATABASE_URL` | PostgreSQL 连接字符串 |
| `REDIS_URL` | Redis 连接字符串 |
| `LLM_BASE_URL` | LLM API 基础地址（OpenAI 兼容） |
| `LLM_API_KEY` | LLM API Key |
| `LLM_MODEL` | LLM 模型名（如 qwen-plus） |
| `EMBEDDING_BASE_URL` | Embedding API 基础地址 |
| `EMBEDDING_API_KEY` | Embedding API Key |
| `EMBEDDING_MODEL` | Embedding 模型名 |
| `DASHSCOPE_API_KEY` | 阿里百炼语音 API Key（STT/TTS） |
| `STT_MODEL` | 语音识别模型名 |
| `TTS_MODEL` | 语音合成模型名 |
| `TTS_VOICE` | TTS 音色 |
| `JWT_SECRET` | JWT 签名密钥（⚠️ 生产环境必须修改，用 `openssl rand -hex 32` 生成） |
| `JWT_EXPIRE_DAYS` | JWT 有效期（天），默认 7 |
| `RATE_LIMIT_PER_MINUTE` | 每用户每分钟最大请求数，默认 30 |
| `CHROMA_HOST` | Chroma 服务地址 |
| `CHROMA_PORT` | Chroma 服务端口 |
| `FILE_STORAGE_PATH` | 上传文件存储路径 |
| `CORS_ORIGINS` | 允许的前端域名，多个用英文逗号分隔（如 `https://example.com`） |

---

## 功能列表

**用户系统**
- 注册、登录、JWT 鉴权
- 接口限流：滑动窗口，每用户每分钟 30 次

**知识库管理**
- 创建、重命名、删除知识库
- 上传文档（PDF / Markdown / TXT）
- 异步解析：文本提取 → 分块 → Embedding → Chroma 向量存储
- 文档处理状态实时轮询

**对话**
- 多轮对话，RAG 检索 + 流式 SSE 输出
- 可展开的引用来源列表（文件名、片段、相关度）
- 对 AI 回答点赞 / 踩反馈
- 超过 10 轮历史自动摘要压缩

**语音交互**
- STT：浏览器录音 → 识别为文字后自动发送（支持 Safari/Chrome）
- TTS：点击播放按钮朗读 AI 回答

**前端**
- Vercel 风格极简设计，纯黑白灰色调
- 双栏布局（知识库树 + 对话区）
- 响应式设计，支持明暗主题
- 侧边栏搜索：实时过滤知识库和会话名称
- 会话重命名：双击会话名即可内联编辑
- Markdown 渲染（含代码块、表格）
- 流式打字动画、自动滚动

---

## API 接口总览

### 用户与鉴权
- `POST /api/auth/register` — 注册
- `POST /api/auth/login` — 登录，返回 JWT
- `GET /api/auth/me` — 获取当前用户信息

### 知识库
- `POST /api/kb` — 创建知识库
- `GET /api/kb` — 列出知识库
- `PATCH /api/kb/{kb_id}` — 更新知识库
- `DELETE /api/kb/{kb_id}` — 删除知识库

### 文档
- `POST /api/kb/{kb_id}/documents` — 上传文档
- `GET /api/kb/{kb_id}/documents` — 列出文档
- `DELETE /api/kb/{kb_id}/documents/{doc_id}` — 删除文档

### 对话
- `POST /api/kb/{kb_id}/sessions` — 创建会话
- `GET /api/kb/{kb_id}/sessions` — 列出会话
- `PATCH /api/sessions/{session_id}` — 重命名会话
- `GET /api/sessions/{session_id}/messages` — 获取历史消息
- `POST /api/sessions/{session_id}/chat` — 发送消息（流式 SSE）
- `DELETE /api/sessions/{session_id}` — 删除会话

### 语音
- `POST /api/voice/stt` — 语音转文字（支持 OGG / MP4 / WAV / MP3 / M4A 等）
- `POST /api/voice/tts` — 文字转语音（返回 MP3）

### 统计与反馈
- `POST /api/messages/{message_id}/feedback` — 点赞/踩（rating: 1 或 -1）
- `GET /api/kb/{kb_id}/stats` — 知识库统计

## 已知问题与修复记录

| 版本 | 问题 | 修复方式 |
|---|---|---|
| — | Chroma 健康检查失败（镜像无 curl） | 改用 bash TCP 探测替代 curl |
| — | nginx 容器重启后 502（旧 IP 缓存） | 加 `resolver 127.0.0.11` 动态解析 |
| — | 文档上传后一直"待处理" | worker 未导入全部模型导致外键报错；修复 import |
| — | Embedding API 400 错误 | batch_size 从 20 改为 10（阿里百炼上限） |
| — | 侧边栏会话偶尔消失 | sessions 改为按知识库独立缓存，消除竞态 |
| 最新 | Chroma 同步调用阻塞事件循环 | 新增 get_collection_async()，所有 Chroma 操作使用 asyncio.to_thread() |
| 最新 | 前端 Toast 组件 progress 状态导致事件监听器频繁重新绑定 | 使用 progressRef 替代 progress 依赖 |
| 最新 | 前端未使用变量/导入未清理 | 启用 strict TypeScript，清理所有未使用代码 |
| 最新 | Bundle 大小超过 1MB | 启用 code-splitting，将 react/markdown/ui 库分离为独立 chunk |

---

## License

MIT
