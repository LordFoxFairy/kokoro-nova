# State visibility gate：本地 scenario/fixture 验收

- 检查日期：2026-09-04
- 检查对象：本地 mock/fixture 的项目页、Workflow 画布、Storyboard
- 浏览器视口：Playwright 默认桌面视口 `1440×900`
- 服务：`http://localhost:3302`，`DATA_DIR` 指向 `/tmp/libtv-state-visibility-gate-dev.G5bti6`；没有使用真实远端、凭证或生成 provider
- 范围：观察加载、空/有内容、任务状态文案、标签、禁用态和恢复入口；隔离回归另覆盖有效报价的确认、积分预留与状态收敛

## 结论

静态 fixture 的状态可见性覆盖完整：项目页 loading/empty/populated 可区分；视频任务的 `awaiting_confirmation`、`queued`、`running`、`succeeded`、`failed`、`cancelled`、`compliance_blocked` 均在画布节点上有可读文案，失败/取消/合规阻断提供可用的恢复入口。过期和固定有效两种报价门 fixture 已分别验证：前者保护确认按钮，后者经本地 transition 后预留积分并收敛到运行态。

## 验收矩阵

| 状态 / fixture | 入口 | 实测可见文案或标签 | 禁用态 / 恢复入口 | 结果 |
| --- | --- | --- | --- | --- |
| loading | `/project`，延迟本地 `/api/projects` | `aria-busy="true"`；spinner；列表区域暂未渲染 grid | 没有错误态或 retry 误显 | 通过 |
| loading | `/canvas?...`，延迟本地项目 bootstrap | `role=status`：`正在加载画布`；`aria-busy="true"` | 等待加载完成 | 通过 |
| empty | `authenticated-empty` → `/project` | `还没有项目`；`从一个空白画布开始，建立你的第一个视频项目`；`开始第一个项目` | `开始第一个项目`、`回收站`、`新建文件夹` 实测均未禁用；这是当前空账户行为 | 通过，需明确产品预期 |
| populated | `authenticated-populated` → `/project` | `未命名`、`咕嘎Doro`、`Seedance2.0体验`；`当前显示 3 个项目`；`没有更多了` | 项目卡和打开入口可用 | 通过 |
| awaiting confirmation（过期） | `video-awaiting-confirmation` → Workflow | 节点：`待确认后生成`、`等待确认`、按钮 `待确认`；弹窗：`确认生成`、`积分预估`、`合计 70`、`当前余额 478` | fixture 的 `expiresAt` 早于当前日期，因此出现 `报价已过期，请关闭后重新报价。`；`确认生成` 原生 disabled 且 `aria-disabled="true"`；`取消` enabled | 通过：过期保护 |
| awaiting confirmation（有效） | `video-awaiting-valid-confirmation` → Workflow | 同样显示报价门与 70 积分预估 | `confirm-generate` enabled；隔离 Playwright 点击后 `/api/jobs/job_video_01` 本地 transition 成功，余额为 408 且节点显示 `生成中` | 通过：确认、预留与状态收敛 |
| queued | `video-queued` → Workflow | `排队中`、`0%` | `取消生成` 入口存在且未禁用 | 通过 |
| running | `video-running` → Workflow | `生成中`、`58%`；刷新后仍保持该文案和进度 | `取消生成` 入口存在且未禁用；进度条可见 | 通过（只读刷新恢复） |
| succeeded | `video-succeeded` → Workflow | `1280 × 720`、`生成完成`；本地产物预览存在 | 不显示 retry/cancel；节点回到 `生成` 入口 | 通过 |
| failed | `video-failed` → Workflow | `生成失败` | `重试` 按钮存在且 enabled；fixture 错误为 `生成服务暂时繁忙，请稍后重试` | 通过（只验证入口，不触发） |
| cancelled | `video-cancelled` → Workflow | `已取消` | `重新生成` 按钮存在且 enabled | 通过（只验证入口，不触发） |
| compliance-blocked | `video-compliance-blocked` → Workflow / Storyboard | Workflow：`素材合规校验未通过`；Storyboard：独立 `合规阻断` 状态、原因与“修改后重试” | Workflow `重试` enabled；Storyboard 提供独立恢复入口 | 通过：独立状态与抽屉恢复路径均已覆盖 |

## 错误态和 retry 证据

通过 Playwright 仅在浏览器层拦截本地 API，未改生产组件：

- 项目列表返回本地 `503` 时显示 `项目列表加载失败`、fixture 错误文本和 `重试`（`data-testid="project-retry"`）。
- 画布 bootstrap 返回本地 `503` 时显示 `画布加载失败`、`画布加载失败，请重试。` 和 `重试`。
- 生成失败 fixture 显示 `生成失败` + `重试`；取消 fixture 显示 `已取消` + `重新生成`；合规 fixture 显示合规错误 + `重试`。

## 证据索引

Playwright CLI 的只读快照/输出：

- 空账户：`.playwright-cli/page-2026-09-04T11-56-28-680Z.yml`
- 有内容账户：`.playwright-cli/page-2026-09-04T11-57-33-767Z.yml`
- 等待确认及过期禁用态：`.playwright-cli/page-2026-09-04T11-57-46-494Z.yml`
- 有效报价的确认/预留/运行态：`e2e/regression-followup.spec.ts` 的 Playwright 隔离回归
- 合规阻断 Workflow：`.playwright-cli/page-2026-09-04T11-59-59-017Z.yml`
- 合规阻断 Storyboard：`.playwright-cli/page-2026-09-04T12-01-44-734Z.yml`
- 项目列表 loading：`.playwright-cli/page-2026-09-04T12-00-34-067Z.yml`
- 项目列表错误/retry：`.playwright-cli/page-2026-09-04T12-02-37-198Z.yml`
- 画布错误/retry：`.playwright-cli/page-2026-09-04T12-04-13-954Z.yml`

代码/fixture 对照点：

- scenario catalog/build：`src/mocks/scenarios/catalog.ts`、`src/mocks/scenarios/build.ts`、`src/mocks/scenarios/video-project.ts`
- 画布 loading/error/retry：`src/components/canvas/CanvasWorkspace.tsx`
- 画布节点状态、取消、重试、重新生成：`src/components/canvas/NodeCard.tsx`
- 有效报价保护、确认/取消按钮 disabled 逻辑：`src/components/canvas/ConfirmGate.tsx`
- Storyboard 状态标签与合规映射：`src/components/storyboard/MediaDetailDrawer.tsx`、`src/components/storyboard/StoryboardView.tsx`
- 现有浏览器状态断言：`e2e/scenarios.spec.ts`

## 执行命令

```bash
cat /Users/nako/WebstormProjects/github/thefoxfairy/libtv/docs/CODEBASE_MAP.md

# 隔离本地 fixture 数据；仅启动本地开发服务
STATE_DIR=$(mktemp -d /tmp/libtv-state-visibility-gate-dev.XXXXXX)
DATA_DIR="$STATE_DIR" pnpm dev -p 3302

# 仅切换本地 scenario，不启动生成
curl -X POST http://localhost:3302/api/dev/scenario \\
  -H 'content-type: application/json' \\
  --data '{"scenarioId":"video-running"}'

# Playwright CLI：goto / snapshot / eval；错误态使用 page.route() 返回本地 503
export CODEX_HOME="${CODEX_HOME:-$HOME/.codex}"
export PWCLI="$CODEX_HOME/skills/playwright/scripts/playwright_cli.sh"
"$PWCLI" goto 'http://localhost:3302/canvas?projectId=prj_video_demo&canvasId=can_video_main'
"$PWCLI" snapshot
"$PWCLI" eval '() => ({ body: document.body.innerText })'

# 与本次状态逻辑直接相关的单元测试
pnpm exec vitest run \\
  src/mocks/__tests__/scenarios.test.ts \\
  src/components/canvas/__tests__/ConfirmGate.test.ts \\
  src/components/storyboard/__tests__/regeneration.test.ts

pnpm typecheck
pnpm lint
```

验证结果：`pnpm typecheck`、`pnpm lint` 通过；完整 Vitest `105 files / 887 tests passed`；有效报价交互在 Playwright 隔离服务上通过。

## 遗留风险与下一批任务优先级

1. **已完成 — 有效报价确认门 fixture。** `video-awaiting-valid-confirmation` 使用固定的未来报价到期时间；隔离 Playwright 覆盖 enabled、确认期间 busy/disabled、本地积分预留和 `生成中` 收敛。
2. **已完成 — Storyboard 合规阻断独立建模。** `regenerationStatusForJob(compliance_blocked)` 使用独立状态、琥珀色语义、专用 test id 和“修改后重试”恢复入口。
3. **已完成 — 隔离浏览器状态矩阵。** 将本报告的 scenario 切换、项目/画布 loading 拦截、失败/取消/合规 retry 可见性固化到隔离 `DATA_DIR` 的 Playwright 流程；每个 case 只读断言或拦截请求，不调用真实 provider。
4. **已完成 — 空账户二级操作契约。** 2026-09-04 官网 `/project` 空态直接显示 enabled 的 `回收站` 与 `新建文件夹`；本地 mock 保持相同语义并在隔离回归中断言。

本轮完整 Vitest 与有效报价的隔离 Playwright 均已通过；后者使用临时 `DATA_DIR` 和端口，不触碰主 `3200` 服务或其数据。
