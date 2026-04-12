# AI 知识助手（askmy-docs）

> 用户可以上传自己的文档，创建私有知识库，然后用自然语言（文字或语音）向知识库提问，系统基于 RAG 技术检索相关内容并生成带引用来源的回答。

---

## 技术栈

| 层级 | 选型 |
|---|---|
| 后端框架 | Python + FastAPI |
| 数据库 | PostgreSQL 15 |
| 向量数据库 | Chroma |
| 缓存 / 队列 | Redis 7 + RQ |
| LLM 接口 | OpenAI 兼容接口（阿里百炼） |
| Embedding | 阿里百炼 text-embedding-v3 |
| STT | 阿里百炼 paraformer-realtime-v2 |
| TTS | 阿里百炼 cosyvoice-v1 |
| 部署 | Docker Compose |
| 鉴权 | JWT + API Key |

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

# 4. 访问 API 文档
open http://localhost:8000/docs
```

---

## 环境变量说明

| 变量名 | 说明 |
|---|---|
| `DATABASE_URL` | PostgreSQL 连接字符串 |
| `REDIS_URL` | Redis 连接字符串 |
| `LLM_BASE_URL` | LLM API 基础地址（OpenAI 兼容） |
| `LLM_API_KEY` | LLM API Key（阿里百炼） |
| `LLM_MODEL` | 使用的 LLM 模型名（如 qwen-plus） |
| `EMBEDDING_BASE_URL` | Embedding API 基础地址 |
| `EMBEDDING_API_KEY` | Embedding API Key |
| `EMBEDDING_MODEL` | Embedding 模型名（text-embedding-v3） |
| `DASHSCOPE_API_KEY` | 阿里百炼语音 API Key |
| `STT_MODEL` | 语音识别模型名 |
| `TTS_MODEL` | 语音合成模型名 |
| `JWT_SECRET` | JWT 签名密钥（请设置为随机强密码） |
| `JWT_EXPIRE_DAYS` | JWT 有效期（天），默认 7 |
| `RATE_LIMIT_PER_MINUTE` | 每用户每分钟最大请求数，默认 30 |
| `CHROMA_HOST` | Chroma 服务地址 |
| `CHROMA_PORT` | Chroma 服务端口 |
| `FILE_STORAGE_PATH` | 上传文件存储路径 |

---

## 已实现功能

- [x] 用户系统：注册、登录、JWT 鉴权
- [x] API Key 管理：创建、列出、撤销
- [x] 接口限流：滑动窗口，每用户每分钟 30 次
- [x] 知识库管理：创建、列出、重命名、删除
- [x] 文档管理：上传（PDF/MD/TXT）、列出、查询状态、删除
- [x] RAG Pipeline：文本提取 → 分块 → Embedding → Chroma 存储（异步处理）
- [x] 多轮对话问答：RAG 检索 + 流式 SSE 输出 + 引用来源
- [x] 记忆压缩：超过 10 轮历史自动摘要压缩
- [x] 语音交互：STT（语音转文字）、TTS（文字转语音）
- [x] 评测系统：点赞/踩、统计好评率、平均响应时间
- [x] 检索日志：记录每次 RAG 检索命中来源，可回溯
- [x] Swagger 文档：`/docs` 自动生成
- [x] Docker Compose 一键部署

---

## API 接口总览

### 用户与鉴权
- `POST /api/auth/register` — 注册
- `POST /api/auth/login` — 登录，返回 JWT
- `GET /api/auth/me` — 获取当前用户信息
- `POST /api/auth/api-keys` — 创建 API Key
- `GET /api/auth/api-keys` — 列出 API Key
- `DELETE /api/auth/api-keys/{id}` — 撤销 API Key

### 知识库
- `POST /api/kb` — 创建知识库
- `GET /api/kb` — 列出知识库
- `PATCH /api/kb/{kb_id}` — 更新知识库
- `DELETE /api/kb/{kb_id}` — 删除知识库

### 文档
- `POST /api/kb/{kb_id}/documents` — 上传文档
- `GET /api/kb/{kb_id}/documents` — 列出文档
- `GET /api/kb/{kb_id}/documents/{doc_id}` — 查询状态
- `DELETE /api/kb/{kb_id}/documents/{doc_id}` — 删除文档

### 对话
- `POST /api/kb/{kb_id}/sessions` — 创建会话
- `GET /api/kb/{kb_id}/sessions` — 列出会话
- `GET /api/sessions/{session_id}/messages` — 获取历史消息
- `POST /api/sessions/{session_id}/chat` — 发送消息（流式 SSE）
- `DELETE /api/sessions/{session_id}` — 删除会话

### 语音
- `POST /api/voice/stt` — 语音转文字
- `POST /api/voice/tts` — 文字转语音

### 评测
- `POST /api/messages/{message_id}/feedback` — 点赞/踩
- `GET /api/kb/{kb_id}/stats` — 知识库统计
- `GET /api/messages/{message_id}/sources` — 查看检索来源

---

## License

MIT
