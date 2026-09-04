# Kokoro Nova 项目对齐与并行工作板

更新时间：2026-09-04

## 1. 当前项目做了什么

Kokoro Nova 是一个**纯前端子仓库 + 确定性本地 mock**，目标是把 LibTV 的能力布局和创作工作流复刻成可演示、可测试、可交接的产品外壳。当前仓库不承载真实后端、真实模型调用、支付、账号系统或远端凭证；后端团队未来只需要按 [`docs/api/openapi.yaml`](api/openapi.yaml) 和各状态文档实现同一契约。

已经落地的主要面：

- 首页、项目/文件夹管理、账户/积分、Skill 市场、公开 Showcase；
- 全屏 Workflow 无限画布：节点、边、分组、工具箱、历史、撤销/重做、视口与协作者 presence；
- Image / Video / Audio / Text 节点编辑器及模型目录、输出参数、参考素材和派生工具；
- Storyboard 四列投影、媒体详情、图片工具、视频再生成和视频合成剪辑器；
- Agent 会话、引用、ask-human、mutation proposal 和确认门；
- Script V2 三阶段：脚本解析、镜头/资产准备、双轨提示词与批量生图/生视频；
- 本地生成状态机、报价/预占/结算、离线 SVG/WAV/ffmpeg 产物、API 文档与 OpenAPI；
- Dockerfile、GitHub Actions：打 `v*` tag 时构建并推送 GHCR 镜像；本地仍以 `pnpm demo` / `pnpm dev` 查看。

## 2. 对齐后的目标

### 产品目标

在 1440×900 的主要演示尺寸下，用户能够不依赖真实账号和后端，完整走通与 LibTV 对齐的核心路径：

1. 从项目页创建或打开项目；
2. 在 Workflow 与 Storyboard 之间切换；
3. 创建文本、图片、视频、音频及合成节点，连接参考并编辑参数；
4. 通过报价 → 确认 → 运行 → 产物 → 故事板/合成器走完 Video 闭环；
5. 在 Script V2 中完成脚本、镜头表、资产准备、提示词和批量生成；
6. 刷新、撤销、重试、取消、冲突恢复后仍保持可解释且可重复的状态；
7. 产品演示人员只执行一条命令即可启动隔离 demo，并能按 runbook 复现关键状态。

### 工程目标

- UI 只依赖 typed local API client，不把后端 URL、凭证或真实 LibTV 请求散落到组件；
- 所有 mock 数据、任务延迟、报价和媒体 URL 可重复，测试之间相互隔离；
- 任何可见能力都有对应 route、Zod schema、OpenAPI operation、fixture 和至少一个交互验证；
- 编辑中的文档与排队任务的冻结 `ExecutionSpec` 分离，迟到结果不能覆盖新编辑；
- 真实后端接入只替换 transport/provider/store seam，不重写页面交互；
- 每个里程碑先在主仓库重新跑 typecheck、lint、unit、build、E2E 和视觉基准，再发布到 `main`。

## 3. 当前并行工作分工

本项目按**多批次、最多五条互不重叠的写入线**推进，不采用单 agent 串行模式。历史批次已经完成
Video Contract、ConfirmGate/Jobs、Storyboard 状态、Script V2 状态与生成可靠性；主 agent 负责合并、
回归和最终质量门。当前批次正在执行：

| 工作线（agent） | 交付面 | 写入范围/输出 |
|---|---|---|
| Canvas parity（Banach） | 画布选中/引用焦点、工具栏、空态、响应式和可访问性 | `CanvasWorkspace.tsx`、`WorkflowCanvas.tsx`、canvas tests |
| Compositor（Arendt） | playhead 键盘操作、split 边界、时间线反馈、原比例语义 | `ClipEditor.tsx`、compositor tests |
| Home/Project/Shell（Sagan） | 首页发现、TV Show、项目操作、导航品牌和窄屏 | home/project/shell 组件与 tests |
| Assets/Agent/Director（Hilbert） | 素材库、上传生命周期、Agent 会话、Director Studio 演示闭环 | assets/agent/director 组件与 tests |
| Product QA/E2E（Leibniz） | 1440×900 主旅程、刷新/返回、空错态和稳定 Playwright 覆盖 | 新增 `e2e/kokoro-nova-parity.spec.ts`（只读现有产品代码） |

每条写入线都先读取 [`docs/CODEBASE_MAP.md`](CODEBASE_MAP.md)，严格限定文件所有权；不触碰真实登录、
真实 LibTV 凭证、后端或用户已有 `.gitignore`。agent 完成后不会直接视为交付，必须由主仓库重新跑
静态、单元、构建、E2E 和视觉验证。

主 agent 的职责不是重复写上述模块，而是：

- 检查每条工作线的 diff 是否越界、是否符合 frontend-only + mock 边界；
- 在主仓库重新执行完整验证，处理跨模块接口冲突；
- 把审计结果拆成下一轮新的 disjoint agent lane；
- 更新本文件、`docs/task.md` 和计划勾选状态；
- 仅在所有 gate 通过后提交、推送 `origin/main`。

## 4. 交付门槛

### 必须通过

```text
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm e2e
pnpm demo:smoke
```

并且：

- `git diff --check` 无错误；
- OpenAPI path/method 与 `src/app/api/**/route.ts` 完全一致；
- Script V2 四种 operation 的 request/response/错误分支均能由本地 fixture 解析；
- Video 的 text2video、image2video、video2video、首尾帧、动作迁移、数字人等模式不会静默丢弃不兼容输入；
- ConfirmGate 在过期、余额不足、重复点击、取消后重开和刷新恢复时有确定行为；
- Storyboard 再生成的提示词、参考、模型、输出和产物通过同一 revision/任务状态机；
- 1440×900 关键页面截图与官网观察记录逐项复核；
- `.gitignore` 等用户已有未跟踪文件不被修改或暂存。

### 明确不属于当前交付

- 真实 LibTV 登录、token 刷新、账号数据同步；
- 真实模型供应商、支付、额度扣款或远端媒体代理；
- 任何后端数据库、队列或多实例实时总线；
- 在本机执行 Docker build。Docker 交付物是可被 GitHub Actions 按 tag 构建的 Dockerfile、环境变量约定和 workflow。

## 5. 后续批次顺序

1. 收敛当前五条工作线并在主仓库重新验证；
2. 下一批并行：全局视觉基准、失败矩阵、API/OpenAPI 一致性和跨 surface 状态恢复；
3. 再下一批并行：账户/Showcase/Skills/响应式与产品演示路径打磨；
4. 更新 demo runbook 与 API handoff，按逻辑拆分 commits；
5. 推送 `origin/main`，确认 GitHub Actions 与 GHCR tag 产物，再给产品演示链接和复现命令。

## 6. 演示入口

```bash
pnpm install
pnpm demo
# 浏览器打开 http://localhost:3200
```

需要隔离的自动冒烟时使用：

```bash
pnpm demo:smoke
```

完整边界、环境变量和未来后端接缝见 [`FRONTEND_MOCK_BOUNDARY.md`](FRONTEND_MOCK_BOUNDARY.md)、[`DEMO_RUNBOOK.md`](DEMO_RUNBOOK.md)、[`HANDOFF.md`](HANDOFF.md) 和 [`api/README.md`](api/README.md)。
