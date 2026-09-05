# Goal Completion Audit — 2026-09-05

此审计按线程目标逐项检查当前 `main` 的**可验证证据**。它不把“已有页面”或“测试通过”
等同于完整复刻；未被当前源代码、受控浏览器观察或可执行验证直接证明的项目均保持未完成。

## 证据来源

- 官网登录态只读观察：[`pages/canvas/2026-09-04-live-project-readonly.md`](pages/canvas/2026-09-04-live-project-readonly.md)，含 2026-09-05 Script V2 阶段面板复核。
- 可公开/登录 surface、视觉与交互矩阵：[`REPLICATION_ACCEPTANCE_MATRIX.md`](REPLICATION_ACCEPTANCE_MATRIX.md)。
- Mock API 的 route/OpenAPI 审计：[`../../api/API_AUDIT.md`](../../api/API_AUDIT.md)。
- 当前主分支验证基线：GitHub Actions `33958820346`（`b36ea683`）成功；本地 `pnpm lint`、`pnpm typecheck`、137 个 Vitest 文件/995 个测试，核心 browser suite 当前列举 28 个隔离 Playwright 用例（含 Script V2 三阶段、durability、entry/focus、asset/prompt recovery、materialize idempotency、reorder、conflict、Storyboard 与 video-editor handoff）。最新提交的 GitHub CI 仍以 Actions 状态为准。

## 需求逐项判定

| 线程目标 | 当前证据 | 判定 | 尚需的证明/工作 |
|---|---|---|---|
| 以官网为主要事实来源梳理公开态与登录态布局、交互和状态机 | 页面、流程、截图和登录态 canvas 记录已覆盖首页、项目、画布、Storyboards、Skills、TV Show、Account；证据不保存 Cookie、token 或私有素材。 | **部分已证实** | 持续补齐官网当前版本的 Text/Script 目录与 Clip Editor 深度交互证据；每次必须记录观察范围和只读边界。 |
| 高保真复刻能力布局、Workflow 与 Storyboard | 1440×900 基线、workflow/storyboard 共享 `WorkflowDocument`、presence、公开只读 clone、Script V2 与视频/音频/图片节点均有源码及 E2E。 | **主路径已证实** | `visual/canvas-workflow-comparison.md` 仍明确 Text 模型目录能力粒度不足，且 Clip Editor 未覆盖完整时间线编辑密度。 |
| 完整 Video 创作与剪辑体验 | 视频模型目录、生成 job、确认门、媒体回退、Storyboard、compose lifecycle 和导出 mock 已有契约；`clip-editor-core` 覆盖裁切、分割、变速、转场、字幕、独立音轨、音量/静音、reload、失败/取消，`video-media-interaction-core` 覆盖 HTML5 drag/drop、preview 播放、reload 与本地导出不污染 timeline。 | **主路径已证实** | 仍需为素材/预览/导出建立 approved 1440×900 视觉基线，并继续以官网只读观察校准可见交互；当前本地 mock 通过不等同于官网完成态。 |
| 所有 API、任务、素材、数据均可重复的本地 mock/fixture | 55 path / 92 operation 清单、scenario/reset、fixture media、jobs、presence、identity 和 account handoff 均在仓内；媒体不再宣称未实现的 byte range。 | **主路径已证实** | 为长任务、资产和跨 workspace 状态补 manifest 驱动 route smoke，防止 future adapter 靠 UI 分支猜测。 |
| 结构化 API 文档与可由未来后端直接接手的 OpenAPI | OpenAPI、route manifest、示例和相关专题文档齐备，集合校验通过；团队命令与 TV Show interaction 已具有可执行请求/成功样本并由 route/contract tests 锁定。 | **未完整证实** | `API_AUDIT.md` 仍把 manifest 驱动的全 route smoke matrix、剩余 operation 示例覆盖以及特殊 transport/SSE 边界列为缺口。 |
| 类型、单元、交互和视觉验证 | Typecheck/lint、995 单测、当前核心 suite 已列入 Script V2、Storyboard/video-editor handoff 与 Clip Editor deterministic journey，另有既有 1440×900 基线；TV Show media metadata 截图竞态已由连续 20 次回归覆盖。 | **持续验证中** | 对新增 Clip Editor core 跑完整隔离 suite，并补齐素材拖放/预览/导出的视觉基线；当前绿色测试不能证明尚未实现的能力。 |

## 不可降级的后续放行顺序

1. **API wire contract**：JSON error envelope、成员 `404`、匿名 account projection 边界、团队与互动成功样本已收敛；下一步是 manifest 驱动的全 route smoke matrix，以及剩余状态机写操作的 request/success/error/idempotency 示例。
2. **Video Clip Editor**：先写完整时间线交互设计与局部状态模型，再实现复杂编辑动作和本地 compose/asset projection，禁止用纯展示型时间线替代可编辑能力。
3. **Text / Script 专项**：把官网当前 Text/Script 可见目录、模型参数、状态及失败恢复映射到 typed fixture 和视觉/交互证据。
4. 每个切片只在 Mock route、Zod contract、OpenAPI、fixture、UI、单元测试、Playwright 和视觉基线全部同向时合入；不得引入官网凭证、真实账户数据或远端生成调用。

## 当前结论

目标**尚未完成**。当前仓库已经具备可演示的、受控的高保真核心工作流与较完整 API 表面，但
“完整 Video 创作与剪辑体验”及“未来后端可按 OpenAPI 直接实现”的两项仍缺直接证据。后续工作以
上述放行顺序推进，不能把现有绿 CI 误报为全目标完成。
