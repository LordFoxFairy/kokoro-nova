# Kokoro Nova

AI 视频创作工作台样本。核心是一块无限工作流画布：用户在画布上摆放 **文本 / 图片 / 视频 / 视频合成 / 导演台 / 音频 / 脚本（V2 与旧版）/ 风格 / 特效 / 资产库** 十一类节点，用连线表达依赖关系，然后逐节点提交生成任务。同一份画布文档可以切换到**故事板视图**（按 音频 / 文本 / 图片 / 视频 四列投影），也可以交给**Agent 面板**用自然语言驱动。

当前仓库是 Kokoro Nova 的 **frontend-only + local mock** 子仓库：交互和能力布局按 LibTV 官网高保真复刻，API、任务、素材和数据全部在本地确定性运行；后端由后续独立仓库承接。边界与接入 seam 见 [`docs/FRONTEND_MOCK_BOUNDARY.md`](docs/FRONTEND_MOCK_BOUNDARY.md)。

当前目标、已交付能力、并行 agent 工作线和验收门槛集中记录在
[`docs/PROJECT_STATUS.md`](docs/PROJECT_STATUS.md)。

生成链路是完整的：编译 → 报价 → 确认门 → 积分预留 → provider 提交 → 轮询 → 产物写回节点 → 积分结算。目前只注册了一个内置的离线 provider（`mock-offline`），它在本地真实地渲染 SVG / WAV /（有 ffmpeg 时）MP4 文件，因此上述每一段代码路径都会被真实执行，但不调用任何外部模型、不产生任何费用。

围绕画布还有几块独立 surface：**素材库**（真实 multipart 上传，`staging → committed` 两阶段校验）、**导演台**（俯视走位图 + 机位预览双视口，真透视投影）、**脚本 V2 向导**（剧本解析 → 镜头表 → 资产准备 → 提示词合成 → 批量生成）、**视频合成**（时间线用 ffmpeg 真实渲染成 MP4，含裁切、变速与转场）。

画布支持**多人协作**：SSE 广播光标与视口，可以跟随他人的相机（本地平移 / `Esc` / 取消按钮三条逃逸路径）。presence 属于临时视图状态，不写进画布文档。

还有三个独立页面：`/skills` 技能库（Skill 是能被 Agent 加载的版本化能力包）、`/showcase` 公开作品（发布会冻结成不可变快照，只读展示）、`/account` 积分账户（获取 / 消耗 / 返还三本明细）。

> 接手这套代码并接入真实模型服务，请从 [`docs/HANDOFF.md`](docs/HANDOFF.md) 开始；想先理解领域模型，读 [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)。

## 技术栈

| 层 | 选型 |
| --- | --- |
| 框架 | Next.js 15（App Router，`next dev --turbopack`） |
| 语言 | TypeScript 5.9，`strict: true`，路径别名 `@/* → src/*` |
| UI | React 19 + Tailwind CSS v4（`@tailwindcss/postcss`） |
| 画布 | `@xyflow/react` 12 |
| 客户端状态 | `zustand` 5（单 store，见 `src/lib/editor-store.ts`） |
| 本地 mock 持久化 | 文件存储 `.data/workspace.json` + `.data/media/`（`src/server/store.ts`） |
| 端到端测试 | Playwright 1.56（`e2e/`） |
| 包管理 | pnpm 11 |

依赖里还有 `zod`、`immer`、`clsx`、`tailwind-merge`、`nanoid`，其中 `nanoid` 用于 `src/domain/ids.ts` 的前缀 ID。

## 运行

```bash
pnpm install

# 开发服务器，固定 3200 端口
pnpm dev            # http://localhost:3200

# 产品演示：frontend-only + deterministic mock，默认使用 3300/.demo-data/.next-demo
pnpm demo           # http://localhost:3300
pnpm demo:smoke     # 启动、检查首页和 mock scenario、自动退出

# 类型检查（tsconfig 的 include 覆盖 src/ 与根配置，exclude 掉 e2e/）
pnpm typecheck

# ESLint
pnpm lint

# 单元测试（vitest，node 环境）
pnpm test
pnpm test:watch

# 端到端测试；Playwright 独占 3210/.data-e2e/.next-e2e，
# 不复用、探测或停止交互开发的 3200
pnpm e2e
pnpm e2e:ui

# 生产构建
pnpm build && pnpm start   # start 同样是 3200
```

产品演示的一键启动、隔离目录和环境变量覆盖见
[`docs/DEMO_RUNBOOK.md`](docs/DEMO_RUNBOOK.md)。`pnpm demo` 支持
`DEMO_PORT` / `DEMO_DATA_DIR` / `DEMO_NEXT_DIST_DIR`；也可使用通用的
`PORT` / `DATA_DIR` / `NEXT_DIST_DIR`。`pnpm dev` 始终保留在 `3200`，默认 `.data`
和 `.next` 不会被 demo 使用。

### Docker / GHCR

仓库已配置 GitHub Actions 容器发布：推送 `v*` tag 且类型检查、Lint、测试和生产构建全部
通过后，会自动将 GHCR 镜像发布到
[`ghcr.io/lordfoxfairy/kokoro-nova`](https://github.com/LordFoxFairy/kokoro-nova/pkgs/container/kokoro-nova)。
首次发布后，需在 GitHub Package settings 确认该包为 Public，才可作为公开镜像匿名拉取。
完整的 tag、版本和本地运行说明见 [`docs/CONTAINER.md`](docs/CONTAINER.md)。CI 会在容器构建前运行 `node --test scripts/container-contract.test.mjs`，静态校验这里的一键拉取/运行命令、Dockerfile 运行时端口与卷，以及 tag 发布的 GHCR 镜像契约保持一致。

```bash
docker pull ghcr.io/lordfoxfairy/kokoro-nova:latest
docker run --rm -p 3200:3200 -v kokoro-nova-data:/app/.data \
  ghcr.io/lordfoxfairy/kokoro-nova:latest
```

两套测试的边界由 `vitest.config.ts` 的 `include: ['src/**/*.test.ts']` 划开：`pnpm test` 会运行 `src/` 下的领域、组件、服务端和契约单测，`e2e/` 归 Playwright。改配置时别把这条 include 放宽，否则 vitest 会把 Playwright 的 spec 收进来并在 `test()` 调用处崩掉。

### 本地数据

服务端状态写在仓库根的 `.data/` 下（已被 `.gitignore` 忽略）：

- `.data/workspace.json` — 全部 space / folder / project / canvas / asset / job / ledger / agent 数据，单文件 JSON
- `.data/media/<jobId>/…` — 生成产物文件，通过 `GET /api/media/[...path]` 对外提供

删除 `.data/` 即可回到初始种子状态（一个 `sp_default` 空间、一个示例项目、100 初始积分）。

## 源码地图

```
src/
├─ app/                        Next.js App Router
│  ├─ page.tsx                 首页：一个意图输入框，提交后建项目并带着 brief 进画布
│  ├─ project/page.tsx         项目/文件夹列表
│  ├─ canvas/page.tsx          编辑器路由，URL 只带 projectId / canvasId
│  ├─ layout.tsx globals.css
│  └─ api/                     全部 HTTP 接口，见 docs/HANDOFF.md 的接口表
│     ├─ projects/ folders/ canvases/
│     ├─ jobs/                 生成任务：创建、确认、轮询、取消
│     ├─ assets/ ledger/ media/
│     ├─ agent/sessions/       会话、消息、ask_human 与 mutation 提案处理
│     └─ preview/              character / stitch 两个合成 SVG 预览端点
│
├─ domain/                     纯领域逻辑，不 import 任何服务端或 React 模块
│  ├─ types.ts                 全部数据结构（Space…Canvas、WorkflowDocument、
│  │                           GenerationJob、ExecutionSpec、LedgerEntry、
│  │                           AgentMessage、CanvasMutation…）
│  ├─ nodes.ts                 节点类型词表 NODE_META + 连线合法性 canConnect
│  ├─ mutations.ts             applyMutations：画布文档唯一的校验型 reducer
│  ├─ compile.ts               compileNode：可编辑文档 → 冻结的 ExecutionSpec + Quote
│  ├─ storyboard.ts            projectStoryboard：故事板的纯投影
│  ├─ models.ts                模型目录与 quoteCredits 计价
│  ├─ factory.ts               createNode / createEdge / createGroup / createCanvas
│  ├─ presets.ts               工具箱预设（一次性生成一组节点 + 连线）
│  ├─ libraries.ts             风格 / 特效 / 运镜 / 音色 / 角色 / 斜杠命令等静态库
│  ├─ ids.ts                   前缀 ID 生成
│  └─ __tests__/               vitest 单测，只覆盖这一层的纯函数
│
├─ server/                     仅服务端
│  ├─ store.ts                 文件存储 + 串行化读改写 withState
│  ├─ ledger.ts                只追加积分账本：reserve / settle / release / grant
│  ├─ agent.ts                 本地 Agent 规划器 planTurn（关键词驱动）
│  ├─ http.ts                  HttpError + 统一错误信封 handle
│  └─ generation/
│     ├─ provider.ts           GenerationProvider 接口 + registry（接入点）
│     ├─ mock-provider.ts      内置离线 provider
│     ├─ runner.ts             任务状态机：createJob / confirmJob / pollJob / cancelJob
│     └─ art.ts                确定性 SVG / WAV 渲染
│
├─ components/
│  ├─ canvas/                  画布工作区、节点卡片、检视器、分组层、工具栏、
│  │                           确认门、快捷键、素材侧栏、库面板
│  ├─ storyboard/              故事板视图、片段编辑、媒体详情抽屉
│  ├─ agent/AgentPanel.tsx     Agent 面板
│  ├─ project/ home/           项目列表、首页
│  ├─ ui/                      Dialog / Menu / Tooltip / 通用控件
│  └─ icons.tsx
│
└─ lib/
   ├─ editor-store.ts          zustand store：乐观更新 + 提交队列 + 撤销栈
   ├─ api.ts                   fetch 封装，非 2xx 抛 ApiError(status, message)
   └─ cn.ts

e2e/                           Playwright 用例
docs/                          本文档、ARCHITECTURE.md、HANDOFF.md
vitest.config.ts               单测配置；include 限定 src/**/*.test.ts
playwright.config.ts           e2e 配置；1440×900 基准视口，独占 3210 端口
```

## 依赖边界

- `src/domain/**` 是纯函数与类型，服务端与客户端都直接 import 同一份实现——客户端用它做乐观更新与本地校验，服务端用它做权威校验。改这一层要同时考虑两侧。
- `src/server/store.ts` 是**唯一**知道状态怎么落盘的模块；换数据库只需要重写它，路由和领域层不用动。
- `src/server/generation/provider.ts` 是**唯一**的模型接入面；注册一个真实 provider 不需要碰画布、故事板、账本或 Agent 的任何代码。
