# Goal Completion Audit — 2026-09-05

此审计按线程目标逐项检查当前 `main` 的**可验证证据**。它不把“已有页面”或“测试通过”
等同于完整复刻；未被当前源代码、受控浏览器观察或可执行验证直接证明的项目均保持未完成。

## 证据来源

- 官网登录态只读观察：[`pages/canvas/2026-09-04-live-project-readonly.md`](pages/canvas/2026-09-04-live-project-readonly.md)，含 2026-09-05 Script V2 阶段面板复核。
- 可公开/登录 surface、视觉与交互矩阵：[`REPLICATION_ACCEPTANCE_MATRIX.md`](REPLICATION_ACCEPTANCE_MATRIX.md)。
- Mock API 的 route/OpenAPI 审计：[`../../api/API_AUDIT.md`](../../api/API_AUDIT.md)。
- 当前主分支验证基线：GitHub Actions `33953631934`（`85988b1b`）成功；本地 `pnpm lint`、`pnpm typecheck` 与 24 个跨 surface Playwright 用例在 `2026-09-05` 已运行通过。

## 需求逐项判定

| 线程目标 | 当前证据 | 判定 | 尚需的证明/工作 |
|---|---|---|---|
| 以官网为主要事实来源梳理公开态与登录态布局、交互和状态机 | 页面、流程、截图和登录态 canvas 记录已覆盖首页、项目、画布、Storyboards、Skills、TV Show、Account；证据不保存 Cookie、token 或私有素材。 | **部分已证实** | 持续补齐官网当前版本的 Text/Script 目录与 Clip Editor 深度交互证据；每次必须记录观察范围和只读边界。 |
| 高保真复刻能力布局、Workflow 与 Storyboard | 1440×900 基线、workflow/storyboard 共享 `WorkflowDocument`、presence、公开只读 clone、Script V2 与视频/音频/图片节点均有源码及 E2E。 | **主路径已证实** | `visual/canvas-workflow-comparison.md` 仍明确 Text 模型目录能力粒度不足，且 Clip Editor 未覆盖完整时间线编辑密度。 |
| 完整 Video 创作与剪辑体验 | 视频模型目录、生成 job、确认门、媒体回退、Storyboard、compose lifecycle 和导出 mock 已有契约。 | **未完整证实** | 需要实现并验证素材拖放、裁切、分割、变速、转场、字幕、音轨、预览与导出的一致时间线；每项需 success/empty/error、fixture 和 1440×900 基线。 |
| 所有 API、任务、素材、数据均可重复的本地 mock/fixture | 55 path / 92 operation 清单、scenario/reset、fixture media、jobs、presence、identity 和 account handoff 均在仓内。 | **主路径已证实** | 将媒体二进制/文本错误与 JSON 路径的错误策略明确为同一可测试契约，防止未来 adapter 靠 UI 分支猜测。 |
| 结构化 API 文档与可由未来后端直接接手的 OpenAPI | OpenAPI、route manifest、示例和相关专题文档齐备，且集合校验通过。 | **未完整证实** | `API_AUDIT.md` 的 API-AUD-03 为 P0：运行时 legacy `{ error: string }` 与 OpenAPI `ErrorResponse` 不一致；另有 404 漏 response、匿名读取授权语义、示例覆盖和 route smoke matrix 缺口。 |
| 类型、单元、交互和视觉验证 | Typecheck/lint、916 单测（本轮之前）、近 24 E2E、视觉基线和 GitHub CI 已有通过证据；TV Show media metadata 截图竞态已由连续 20 次回归覆盖。 | **持续验证中** | 对新补齐的 Clip Editor/Text/API wire contract 扩展同等层级验证；当前绿色测试不能证明尚未实现的能力。 |

## 不可降级的后续放行顺序

1. **API wire contract**：统一本地 JSON 错误 envelope，给 `PATCH /api/team/members/{memberId}` 加 404 schema 与 route test，确定匿名 account projection 的 public-vs-adapter 边界；随后为状态机写操作增加 request/success/error/idempotency 示例和 manifest 驱动 smoke matrix。
2. **Video Clip Editor**：先写完整时间线交互设计与局部状态模型，再实现复杂编辑动作和本地 compose/asset projection，禁止用纯展示型时间线替代可编辑能力。
3. **Text / Script 专项**：把官网当前 Text/Script 可见目录、模型参数、状态及失败恢复映射到 typed fixture 和视觉/交互证据。
4. 每个切片只在 Mock route、Zod contract、OpenAPI、fixture、UI、单元测试、Playwright 和视觉基线全部同向时合入；不得引入官网凭证、真实账户数据或远端生成调用。

## 当前结论

目标**尚未完成**。当前仓库已经具备可演示的、受控的高保真核心工作流与较完整 API 表面，但
“完整 Video 创作与剪辑体验”及“未来后端可按 OpenAPI 直接实现”的两项仍缺直接证据。后续工作以
上述放行顺序推进，不能把现有绿 CI 误报为全目标完成。
