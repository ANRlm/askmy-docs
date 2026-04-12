# AskMyDocs — 开发路线图

> 记录已完成功能与后续迭代计划，供开发参考。

---

## 已完成

### 后端
- [x] 用户注册、登录、JWT 鉴权
- [x] 接口限流（滑动窗口，每用户每分钟 30 次）
- [x] 知识库 CRUD
- [x] 文档上传（PDF / MD / TXT）+ 异步解析入队
- [x] RAG Pipeline：文本提取 → 分块 → Embedding → Chroma 向量存储
- [x] 多轮对话：RAG 检索 + 流式 SSE 输出 + 引用来源
- [x] 对话历史压缩（超 10 轮自动摘要）
- [x] STT（Qwen3-ASR-Flash）、TTS（cosyvoice-v3-flash）
- [x] 消息反馈（点赞/踩）、知识库统计 API
- [x] Docker Compose 一键部署（6 个服务）

### 前端
- [x] React 18 + TypeScript + Vite + Tailwind CSS
- [x] 黑白简洁风格（参考 OpenWebUI）
- [x] 双栏布局：左侧知识库/会话树 + 右侧对话区
- [x] 注册/登录（含确认密码验证）
- [x] 文档管理弹窗（上传、状态轮询、删除）
- [x] 流式 SSE 渲染 + Markdown 展示
- [x] 可折叠引用来源列表
- [x] 语音输入（STT，录音后自动发送）
- [x] 语音播放（TTS）
- [x] Nginx 反向代理 + Docker 构建

---

## 待办事项

优先级分三级：**P0 = 影响基本使用 / P1 = 体验提升 / P2 = 进阶功能**

---

### P0 — 工程基础

#### 1. 补充 `.env.example`
README 引导 `cp .env.example .env`，但文件缺失，新用户无法快速上手。
- 列出所有环境变量及说明
- 敏感字段填写占位符（如 `your-api-key-here`）

#### 2. Docker Compose 健康检查 & 启动顺序
冷启动时 backend/worker 可能在 postgres 就绪前启动导致连接失败。
- 为 backend、worker 添加 `depends_on: postgres: condition: service_healthy`
- 同理处理 redis

#### 3. 生产环境安全检查
- 启动时检测 `JWT_SECRET=changeme`，打印警告或拒绝启动
- CORS 白名单从环境变量读取，不要硬编码 `*`

---

### P1 — 体验提升

#### 4. 会话重命名
- 双击侧边栏会话名 → 变为输入框 → 回车保存
- 后端已有 `PATCH /api/sessions/{id}`（或需补充该接口）

#### 5. 知识库 / 会话搜索
- 侧边栏顶部加搜索框，实时过滤知识库名和会话标题
- 纯前端过滤，无需后端接口

#### 6. 消息反馈按钮
后端 `POST /api/messages/{id}/feedback` 已实现，前端缺入口。
- 每条 AI 回复下方加 👍 / 👎 按钮
- 点击后高亮，不可撤回

#### 7. 对话导出
- 在会话 header 加"导出"按钮
- 将当前对话序列化为 Markdown 并触发浏览器下载

#### 8. 文件拖拽上传
- DocumentModal 整体区域支持 drag & drop
- 拖入时高亮边框提示

#### 9. 错误提示 Toast
- 目前错误混入消息气泡，体验割裂
- 实现轻量 Toast 组件（右上角 3 秒自动消失）
- STT/TTS/上传失败均走 Toast

#### 10. 知识库统计面板
后端 `GET /api/kb/{kb_id}/stats` 已实现（好评率、平均响应时间）。
- 在文档管理弹窗底部或新增 Tab 展示数据

---

### P2 — 进阶功能

#### 11. 多模态文档支持
- Word（`.docx`）：使用 `python-docx` 解析
- 网页 URL：使用 `httpx` 抓取正文，`trafilatura` 提取纯文本
- 图片 OCR：可选，依赖较重

#### 12. 对话分享
- 生成只读分享链接，无需登录即可查看某次对话快照
- 后端新增 `POST /api/sessions/{id}/share` 返回 token
- 前端 `/share/{token}` 页面只读展示

#### 13. 自定义检索参数
- 在知识库设置里允许用户调整：Top-K（检索片段数）、相似度阈值
- 存入 KB 配置字段，RAG 时读取

#### 14. 多知识库联合检索
- 发送消息时可选"跨知识库搜索"
- 从多个 Chroma Collection 检索后合并、去重、重排

#### 15. API Key 管理前端页面
- 后端已有完整 API Key CRUD 接口
- 前端补充设置页（目前完全缺失）

---

## 技术债

| 问题 | 说明 |
|---|---|
| 前端无全局错误边界 | 组件崩溃会白屏，需加 `ErrorBoundary` |
| STT 仅支持短录音 | MediaRecorder 单次录音，不支持实时流式识别 |
| 文档解析无超时保护 | 超大 PDF 可能让 worker 卡死 |
| Chroma 版本锁定 | `chromadb==1.0.0` 需跟随上游更新 |
| 前端无 E2E 测试 | 核心流程（注册→上传→对话）无自动化覆盖 |

---

## 版本节奏建议

| 版本 | 内容 |
|---|---|
| v0.2 | P0 全部完成（.env.example、健康检查、安全检查） |
| v0.3 | P1 中的 4、5、6、9（重命名、搜索、反馈、Toast） |
| v0.4 | P1 中的 7、8、10（导出、拖拽上传、统计面板） |
| v1.0 | P2 按需挑选，稳定后发布 |
