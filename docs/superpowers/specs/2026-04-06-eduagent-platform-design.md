# EduAgent — 可嵌入式跨课程 AI Agent 通用架构平台

**赛题**: 第十七届中国大学生服务外包创新创业大赛 A25  
**出题方**: 中国计量大学  
**截止**: 2026-04-15 16:00  
**日期**: 2026-04-06  

---

## 1. 项目概述

### 1.1 核心目标

构建一套支持多课程 AI Agent 快速开发的通用平台架构。平台可嵌入超星、钉钉等主流教学平台，实现跨课程知识迁移和学情分析，提供位置级精细化作业批注。

### 1.2 硬性指标

| 指标 | 要求 | 实现策略 |
|------|------|---------|
| 并发用户 | ≥500 | FastAPI async + Redis 缓存 + Nginx 限流 |
| 知识点回答正确率 | ≥95% | RAG 二阶段检索（Milvus Top-10 → GPT-5.4 Rerank → Top-3）+ Neo4j 图谱增强 |
| 作业批注准确率 | ≥95%（位置+内容） | GPT-5.4 JSON Mode + Few-shot + 段落预编号 + original_text 校验 + 低置信降级 |
| 平台兼容 | ≥2 个教学平台 | 超星（LTI 1.3 真实对接）+ 钉钉（开放平台 SDK） |

### 1.3 演示课程

- 高等数学 + 大学物理
- 跨课程知识迁移示例：微积分 → 牛顿力学（做功定理）

---

## 2. 技术决策

| 决策项 | 选择 | 理由 |
|--------|------|------|
| 部署 | win4060 Docker Compose | RTX 4060 8GB，已有 Docker 基础设施 |
| LLM | GPT-5.4 via CLIProxyAPI (`codex-api.inspiredjinyao.com`) | 已部署，22+ 模型支持 |
| 前端 | Next.js 14 + TailwindCSS + shadcn/ui + CopilotKit | CopilotKit 原生 React 兼容，AG-UI 协议 |
| Agent 编排 | Python LangGraph (Director Graph 模式) | 移植 OpenMAIC，全自主代码 |
| 知识检索 | LangChain + Milvus (自建 RAG) | win4060 已有 Milvus，灵活可控 |
| 知识图谱 | Neo4j | 知识点关联、跨课程迁移路径 |
| 数据库 | PostgreSQL | 业务数据 + xAPI 存储 (JSONB) |
| 缓存 | Redis | 会话、限流、Agent 状态 |
| 平台对接 | ltijs (Node.js, LTI 1.3) + 钉钉 Python SDK | ltijs 独立容器，REST 桥接 FastAPI |
| 图标 | Remixicon 4.6 | 与已有项目一致，2800+ 图标 |

---

## 3. 系统架构

```
┌─────────────────────────────────────────────────────────────────┐
│                    前端层 (Next.js 14+)                          │
│  教师后台 │ 学生端 │ CopilotKit Popup/Sidebar │ Chrome 扩展     │
└───────────────────────────┬─────────────────────────────────────┘
                            │ REST + SSE (AG-UI Protocol)
┌───────────────────────────▼─────────────────────────────────────┐
│                   API 网关 (FastAPI Gateway)                     │
│  JWT 鉴权 │ Redis 限流 │ 路由分发 │ LTI 回调代理 │ 钉钉 Webhook │
└───────────────────────────┬─────────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────────┐
│              Agent 编排层 (LangGraph StateGraph)                 │
│                     ┌──────────────┐                            │
│                     │   Director   │ ← GPT-5.4 路由决策         │
│                     └──────┬───────┘                            │
│              ┌──────┬──────┼──────┬──────┐                     │
│              ▼      ▼      ▼      ▼      ▼                     │
│            QA    Grader  Tutor  Analyst  Meta                   │
│           Agent   Agent  Agent   Agent  Agent                   │
└───────────────────────────┬─────────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────────┐
│                      服务层                                      │
│  KnowledgeService │ GradingService │ AnalyticsService │ Platform │
└───────────────────────────┬─────────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────────┐
│                      数据层                                      │
│  PostgreSQL │ Neo4j │ Milvus │ Redis                            │
└─────────────────────────────────────────────────────────────────┘
```

---

## 4. 模块设计

### 4.1 M1: 统一 AI Agent 框架

**核心模式**: LangGraph Director Graph（移植 OpenMAIC）

**状态机**: `START → director → agent_generate → director (loop) → END`

**Agent SDK**:

```python
@registry.register("qa")
class QAAgent(BaseAgent):
    name = "智能答疑 Agent"
    description = "回答课程知识问题，基于 RAG 检索知识库"
    
    async def handle(self, message, ctx) -> AsyncGenerator:
        docs = await ctx.knowledge.search(message, ctx.course_id)
        async for chunk in ctx.llm.stream(prompt, docs):
            yield TextDelta(content=chunk)
```

**5 个 Agent**:

| Agent | 触发意图 | 调用服务 |
|-------|---------|---------|
| QA Agent | 知识问答 | KnowledgeService (RAG + 图谱) |
| Grader Agent | 作业批改 | GradingService (位置级批注) |
| Tutor Agent | 练习生成 | AnalyticsService (BKT 选题) |
| Analyst Agent | 学情分析 | AnalyticsService (画像+预警) |
| Meta Agent | 课程配置 | AgentRegistry + Config |

**SSE 事件协议** (兼容 AG-UI):
`agent_start → text_delta* → action* → agent_end`

### 4.2 M2: 知识中间件

**三层架构**:

1. **文档 RAG** (LangChain + Milvus)
   - 解析: Unstructured (Word/PDF/PPT/LaTeX)
   - 切片: RecursiveCharacterTextSplitter, chunk_size=1000, overlap=200
   - Embedding: text-embedding-3-large (3072 维, via CLIProxyAPI)
   - 检索: 语义搜索 Top-10 → GPT-5.4 Rerank → Top-3

2. **知识图谱** (Neo4j)
   - 节点: KnowledgePoint (id, name, course, difficulty, embedding)
   - 边: PREREQUISITE / CONTAINS / CROSS_COURSE / SIMILAR_TO
   - 跨课程示例: `MATH-CALC-001 --CROSS_COURSE--> PHY-MECH-003`

3. **标准化接口** (JSON Schema)
   - 统一知识点表示，跨 Agent 共享

**API**: upload / search / graph / points / migrate / cross-course

### 4.3 M3: 平台适配层

**超星 LTI 1.3**:
- ltijs Node 服务 (端口 3000)，独立 Docker 容器
- OIDC Launch → 身份提取 → REST 转发到 FastAPI → JWT → 重定向前端
- Grade Service: 批改完成 → `lti.Grade.submitScore()` → 成绩回传超星

**钉钉开放平台**:
- 企业内部机器人 (Webhook 接收 → Agent 编排 → 回复)
- 工作通知 (学情预警推送)
- H5 微应用 (iframe 嵌入 Next.js 学生端)

**统一身份层**: `platform_users` 表映射 LTI user_id / 钉钉 union_id → 统一用户

**API**: lti-launch / lti-grade / dingtalk-webhook / dingtalk-notify / user-resolve / xapi-statement

### 4.4 M4: 数据融合引擎

**xAPI 标准**: 所有 Agent 动作 → xAPI Statement → PostgreSQL `xapi_statements` 表 (JSONB)

**BKT 状态**: `student_profiles.bkt_states` JSONB，按知识点存储掌握概率

**三大输出**:
- 学生能力画像 (雷达图 JSON)
- 学情预警 (BKT probMastery < 0.3 → 钉钉推送)
- 教学决策报告 (班级共性错误 Top-5 + GPT-5.4 建议)

**API**: record / profile / warnings / report / bkt-update / bkt-select-problem

### 4.5 M5: 精细化智能引擎

**位置级批注 Pipeline (4 阶段)**:

1. **文档预处理**: 按段落编号 [P1] [P2] ...，生成唯一锚点 ID
2. **GPT-5.4 结构化批改**: JSON Mode + Few-shot (5 个示例)
   ```json
   {
     "annotations": [{
       "paragraph_id": "P4",
       "char_start": 12, "char_end": 15,
       "original_text": "1/2",
       "type": "error", "severity": "critical",
       "comment": "计算错误：1/3≠1/2",
       "correction": "1/3",
       "knowledge_point": "MATH-CALC-001"
     }],
     "overall_score": 75,
     "summary": "..."
   }
   ```
3. **规则引擎校验**: paragraph_id 存在性 + char 范围 + original_text 匹配 + 知识点存在
4. **知识点关联**: 批注 → BKT 更新 → 练习推荐

**准确率保障**: JSON Mode (85%) → Few-shot (90%) → 段落预编号 (93%) → original_text 校验 (96%) → 低置信降级 (97%+)

**BKT 知识追踪** (移植 OATutor):

```python
def bkt_update(params, is_correct):
    if is_correct:
        num = params['pM'] * (1 - params['pS'])
        den = (1 - params['pM']) * params['pG']
    else:
        num = params['pM'] * params['pS']
        den = (1 - params['pM']) * (1 - params['pG'])
    posterior = num / (num + den)
    params['pM'] = posterior + (1 - posterior) * params['pT']
```

**选题策略**: 掌握度最低优先，≥0.95 跳过

**"测-评-练"闭环**: 批改定位 → BKT 选题 → 练习(题库/LLM生成) → 更新掌握度 → 循环

---

## 5. 前端设计

### 5.1 设计系统: Ink & Paper

| 属性 | 值 |
|------|---|
| 风格 | 纯白底 + 靛蓝强调，Notion/Linear Light 风格 |
| Background | #FFFFFF |
| Surface | #FAFAFA |
| Border | #F3F4F6 |
| Primary | #4338CA (Indigo 700) |
| Success | #059669 |
| Warning | #D97706 |
| Error | #DC2626 |
| Text | #1F2937 |
| Text Muted | #6B7280 / #9CA3AF |
| 标题字体 | Plus Jakarta Sans (400-800) |
| 正文字体 | Inter (400-500) |
| 代码字体 | JetBrains Mono (400-500) |
| 图标 | Remixicon 4.6 (线性风格) |

### 5.2 页面清单

**产品首页** (Landing Page):
- 导航栏 + Hero (价值主张 + 双 CTA) + 4 核心卖点卡片

**教师端** (需 role=teacher):
- 学情仪表盘: 统计卡片 + Sparkline + 知识点掌握度柱状图 + 预警学生
- 课程管理: 课程列表 / 详情 / 知识库上传
- 知识图谱: 暗色全屏 3D 力导向图 (react-force-graph-3d)
- 批改队列: 作业列表 + AI 全部批改 + Focus Drawer 详情
- Agent 配置: 每个 Agent 独立配置模型/规则/知识库
- 预警中心: 预警学生列表 + 知识点分布

**学生端** (需 role=student):
- AI 答疑: CopilotKit 聊天 + RAG 来源引用 + 跨课程关联
- 作业提交 + 批注查看: 行级红笔标注 + 批注卡片 + 一键练习
- 增量练习: BKT 选题 + 选择题 + 进度条 + Energy Ring 掌握度
- 能力画像: 雷达图 + 掌握度历史曲线

**嵌入式** (极简布局):
- CopilotKit Popup: 超星 iframe 内悬浮按钮
- CopilotKit Sidebar: 钉钉微应用常驻右侧
- Chrome 扩展: Shadow DOM 注入任意教学平台

**手机端** (响应式):
- 学生: 底部 5 Tab (课程/答疑/作业/练习/我的)
- 教师: 底部 5 Tab (总览/课程/批改/学情/我的)

### 5.3 交互创新

1. **⌘K AI 命令面板**: 全局指令 + AI 建议 + 实时预览
2. **Focus Drawer**: 点击作业 → 主视图 scale(0.98) 压暗 → 右侧 70% 抽屉
3. **语义化缩放**: 图谱/雷达图缩放时 UI 重绘 (散点→标题→详情)
4. **Sparkline Tooltips**: 学生列表 Hover → 微型 7 天趋势折线
5. **Inline AI Morph**: 框选文本 → 悬浮工具条 (提示我/拆解步骤)

### 5.4 动效 (Framer Motion)

- 面板: `spring { stiffness: 400, damping: 30, mass: 0.8 }`
- 列表级联: `staggerChildren: 0.04, y: 15 → 0, blur: 4px → 0`
- 批注书写: SVG `pathLength: 0 → 1`, duration 0.5s
- BKT Energy Ring: SVG `stroke-dasharray` 动画 + 粒子爆裂 (canvas-confetti)

---

## 6. 项目结构

```
edu-agent-platform/
├── frontend/                    # Next.js 14
│   ├── app/
│   │   ├── (auth)/              # 登录注册
│   │   ├── (teacher)/           # 教师后台
│   │   ├── (student)/           # 学生端
│   │   ├── (embed)/             # 嵌入式页面
│   │   └── api/copilotkit/      # CopilotKit Runtime 代理
│   ├── components/              # 共享组件
│   └── lib/                     # 工具函数
├── backend/                     # Python FastAPI
│   ├── app/
│   │   ├── main.py              # FastAPI 入口
│   │   ├── agents/              # Agent 定义 (QA/Grader/Tutor/Analyst/Meta)
│   │   ├── orchestration/       # LangGraph Director Graph
│   │   ├── services/
│   │   │   ├── knowledge.py     # RAG + Neo4j
│   │   │   ├── grading.py       # 位置级批注引擎
│   │   │   ├── analytics.py     # BKT + 学情
│   │   │   └── platform.py      # LTI + 钉钉
│   │   ├── models/              # SQLAlchemy / Pydantic
│   │   └── api/                 # API 路由
│   └── requirements.txt
├── lti-provider/                # ltijs Node.js 服务
│   ├── index.js
│   └── package.json
├── extension/                   # Chrome 扩展
│   ├── manifest.json
│   └── content.js
├── docker-compose.yml           # 全部服务编排
├── nginx.conf                   # 反向代理
└── docs/
```

---

## 7. Docker Compose 服务

| 服务 | 镜像 | 端口 | 说明 |
|------|------|------|------|
| frontend | node:20 | 3001 | Next.js |
| backend | python:3.12 | 8000 | FastAPI |
| lti-provider | node:20 | 3000 | ltijs LTI 1.3 |
| postgres | postgres:16 | 5432 | 业务数据 + xAPI |
| neo4j | neo4j:5 | 7474/7687 | 知识图谱 |
| milvus | milvusdb/milvus | 19530 | 向量检索 (已有) |
| redis | redis:7 | 6379 | 缓存/限流/队列 |
| nginx | nginx:alpine | 80/443 | 反向代理 + SSL |

---

## 8. 参考仓库复用清单

| 源仓库 | 复用内容 | 目标模块 |
|--------|---------|---------|
| OpenMAIC (清华) | Director Graph 编排模式 + Prompt 模板 + SSE 流式 | M1 Agent 框架 |
| OATutor (UC Berkeley) | BKT 算法 (14行) + 选题策略 | M5 知识追踪 |
| nengdou | 批改 UI 工作流 + 轮询机制 + 规则配置 | M5 前端参考 |
| ltijs | LTI 1.3 Provider + 成绩回传 + Deep Linking | M3 平台适配 |
| CopilotKit | Popup/Sidebar/Chat 组件 + AG-UI 协议 | 前端嵌入 |

---

## 9. 提交材料

| # | 材料 | 格式 |
|---|------|------|
| 1 | 项目概要介绍 (300字) | 文本 |
| 2 | 项目简介 PPT (≤10页) | PPTX |
| 3 | 项目详细技术方案 | DOCX |
| 4 | 演示视频 (≤5分钟) | MP4 |
| 5 | 可运行 Demo | URL (win4060 Docker) |
| 6 | 源代码 | GitHub |
| 7 | 参赛承诺书 | PDF (全员签+院系盖章) |
