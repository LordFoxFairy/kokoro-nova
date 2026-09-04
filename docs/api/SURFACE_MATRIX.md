# Kokoro Nova Surface / API 对照矩阵

本文把产品页面、可见动作、本地 mock route 和未来后端 seam 放在同一张表里，作为产品演示、
前端联调和后端接手的索引。它描述的是当前 **frontend-only** 样本，不代表已经接入真实
LibTV 服务，也不保存登录凭证。

## 1. 统一边界

```text
React / Zustand
  -> src/lib/api.ts（typed client）
  -> /api/* Route Handler（Zod 校验）
  -> src/domain/* + src/server/*（确定性 fixture）
```

- 页面组件不直接拼接远端 URL，不读取 Cookie、Authorization 或 token。
- 所有写操作都带对应的 revision / 幂等语义；失败时保留用户输入和本地可恢复状态。
- 媒体 URL 只指向 `/api/media/*` 的本地 fixture；不把官网 CDN 地址写入数据。
- API 成功体是规范化资源，官网的 `code/data/msg` envelope 只在外部 adapter 边界解码。
- 未来后端替换 transport、store 和 provider，不改变页面组件的 operationId 与字段语义。

## 2. Surface 矩阵

| Surface | 页面/入口 | 主要可见动作 | 本地 operation | 关键状态/场景 | 后端接手 seam |
|---|---|---|---|---|---|
| 首页发现 | `/` | 开始创作、打开最近项目、浏览 Skill/TV Show、登录门 | `getHomeDiscovery`, `listSkills`, `listPublishedSnapshots` | `anonymous`, `authenticated-empty`, `authenticated-populated` | discovery/catalog service |
| 项目管理 | `/project` | 搜索、创建/复制/重命名/删除项目，文件夹和回收站 | `listProjects`, `createProject`, `updateProject`, `duplicateProject`, `deleteProject`, `createFolder`, `renameFolder`, `deleteFolder` | 空态、已填充、删除确认 | project/folder repository |
| Workflow 画布 | `/canvas?projectId=PROJECT_ID` | 节点、连线、分组、视口、撤销/重做、刷新恢复 | `getProject`, `getCanvas`, `mutateCanvas`, `getCanvasPresence`, `updateCanvasPresence` | revision conflict、session expired、presence | document store + realtime/presence adapter |
| Image 节点 | 画布节点编辑器 | 模型、画幅、质量、参考、风格、预设、派生工具、生成 | `listModels`, `mutateCanvas`, Jobs 四 operation | awaiting/queued/running/succeeded/failed | model registry + generation provider |
| Video 节点 | 画布节点编辑器 | text/image/video/reference 输入、@ token、元素、运镜、音频、生成 | `listModels`, `mutateCanvas`, Jobs 四 operation | quote、compliance、任务终态 | video compiler + provider |
| Audio / Text 节点 | 画布节点编辑器 | TTS/音乐/音效、音色、参考、富文本、starter workflow | `listModels`, `mutateCanvas`, Jobs 四 operation | 参数联动、任务和本地产物 | audio/text provider |
| Script V2 | 画布 Script 入口 | 脚本解析、镜头、资产、双轨提示词、批量生成 | `quoteScriptV2`, `createScriptV2Run`, `getScriptV2Run`, `transitionScriptV2Run` | stage gates、幂等、stale writeback | script orchestration service |
| Storyboard | 画布 Storyboard tab | 四列投影、详情、参考、再生成、失败重试 | `getCanvas`, `mutateCanvas`, Jobs 四 operation, `composeVideo` | 空态、比例、job status | document projection + media service |
| Video compositor | Storyboard/Video 入口 | 裁切、变速、转场、字幕、音轨、时间线、导出 | `mutateCanvas`, `composeVideo`, `readLocalMedia` | invalid split、compose failure/timeout | render queue + object storage |
| 素材库 | 画布侧栏 / `/account` | 上传、取消、筛选、移动、重命名、保存产物 | `listAssets`, `uploadAsset`, `cancelAssetUpload`, `registerArtifactAsAsset`, `updateAsset`, `deleteAsset` | uploading/complete/cancelled/error | object storage + asset index |
| Agent | 首页/画布面板 | 创建会话、发送消息、ask-human、确认 mutation proposal | `listAgentSessions`, `createAgentSession`, `getAgentSession`, `sendAgentMessage`, `resolveAgentMessage`, `updateAgentSession`, `deleteAgentSession` | streaming/mock reply、pending proposal | agent gateway |
| Skills | `/skills`, `/skills/SKILL_ID` | 浏览、搜索、查看详情、收藏、选择附件/参考/Skill/生成模式 | `listSkills`（含 `composer` 上下文）、`getSkill`, `toggleSkillFavorite` | anonymous/authenticated | skill catalog 与 composer context |
| TV Show / Showcase | `/showcase`, `/showcase/SNAPSHOT_ID` | 浏览、搜索、详情沉浸背景、播放器、相邻作品、只读制作过程、发布/撤下 | `listShowcaseEntries`, `getShowcaseDetail`, `listPublishedSnapshots`, `getPublishedSnapshot`, `publishCanvas`, `revokePublishedSnapshot` | public snapshot、媒体读取、登录门 | showcase discovery projection + snapshot/publish service |
| 账户 | `/account` | 查看身份、钱包、账本、会员、通知、偏好和 CLI 入口 | `getAccountProfile`, `listLedgerEntries` | identity、wallet、preferences、notifications、balance、reserve、settle、release | shared account domain + billing/ledger service |

## 3. 关键请求链路

### 3.1 打开画布

```text
GET /api/projects/PROJECT_ID
GET /api/canvases/CANVAS_ID
GET /api/jobs?canvasId=CANVAS_ID
GET /api/presence/CANVAS_ID
```

页面以 canvas response 的 `document` 和 `revision` 建立唯一编辑状态，再将 jobs、presence
挂到视图层。刷新不能依赖组件内存中的选中节点、轮询计时器或临时 modal。

### 3.2 生成节点

```text
POST /api/jobs
  { "canvasId": "CANVAS_ID", "nodeId": "NODE_ID" }
       -> awaiting_confirmation + frozen spec/quote

POST /api/jobs/JOB_ID
  { "action": "confirm" }
       -> queued/running

GET /api/jobs/JOB_ID
       -> running | succeeded | failed | cancelled | compliance_blocked
```

确认前不扣积分、不调用 provider；重复确认使用同一个 job/invocation；终态只收敛一次。
成功响应可携带最新 `document` 和 `revision`，让产物写回后无需第二次 bootstrap。

### 3.3 Script V2

```text
POST /api/script-v2/quotes
POST /api/script-v2/runs
GET  /api/script-v2/runs/RUN_ID
POST /api/script-v2/runs/RUN_ID
```

四种 `operation` 为 `generate-full`、`recognize-assets-only`、`recompute-prompts`、
`generate-asset`。同一 `idempotencyKey + fingerprint` 重放原 run；迟到结果必须通过
`expectedRevision` / `workflowDigest` 检查后才能写回。字段和状态图见
[`SCRIPT_V2_STATE.md`](SCRIPT_V2_STATE.md)。

### 3.4 合成器

```text
POST /api/compose
```

请求只描述规范化后的 clips、audioTracks、subtitles，不把 `canvasId`、下载目标或持久化
动作混入渲染接口。时间线先通过 `mutateCanvas` 保存；收到产物后由 UI 决定预览、加入画布或
保存到素材库。合成约束和错误映射见 [`ERRORS.md`](ERRORS.md)。

## 4. 错误到 UI 的映射

| code | 页面行为 | 是否自动重放 |
|---|---|---:|
| `INVALID_INPUT` | 就近控件显示原因，保留草稿 | 否 |
| `UNAUTHENTICATED` | 打开本地登录门；样本不向远端登录 | 登录后由用户重试 |
| `REVISION_CONFLICT` | 拉取最新文档，提示冲突，再最多重放一次 | 是，一次 |
| `SESSION_EXPIRED` | 锁定编辑并提供刷新恢复 | 刷新后 |
| `QUOTE_EXPIRED` | 关闭旧门，重新创建报价 | 否，重新报价 |
| `INSUFFICIENT_CREDITS` | 打开账户/会员入口，保留输入 | 充值后 |
| `COMPLIANCE_BLOCKED` | 展示素材级原因，不产生可用产物 | 修改输入后 |
| `RATE_LIMITED` | 展示 `retryAfter`，禁止重复点击 | 按服务端建议 |
| `INTERNAL_ERROR` / `SERVICE_UNAVAILABLE` | Toast + requestId，保留时间线或草稿 | 用户触发 |

完整 envelope 和稳定错误码见 [`ERRORS.md`](ERRORS.md)。

## 5. 本地场景复现

```bash
curl -sS http://localhost:3200/api/dev/scenario
curl -sS -X POST http://localhost:3200/api/dev/scenario \
  -H 'Content-Type: application/json' \
  -d '{"scenarioId":"video-running"}'
curl -sS -X POST http://localhost:3200/api/dev/reset
```

推荐演示顺序：

1. `authenticated-populated`：完整项目、节点、资产和 Agent；
2. `video-awaiting-confirmation`：过期报价门、关闭/取消；
3. `video-awaiting-valid-confirmation`：有效报价确认、积分预留与运行态收敛；
4. `video-running`：刷新恢复和进度；
5. `video-succeeded`：产物写回、Storyboard 和 compositor；
6. `revision-conflict` / `session-expired`：并发与恢复反馈；
7. `anonymous` / `public-showcase`：公开发现和登录门。

场景只用于本地演示，production 的 `/api/dev/*` 返回 `403`。

## 6. 后端接手清单

- [ ] 按 `operationId` 实现所有 OpenAPI path，并保持 method/path 一一对应；
- [ ] 使用相同的 Zod/JSON 字段约束、ISO 时间、整数积分和错误 envelope；
- [ ] 保留 `expectedRevision`、`workflowDigest`、`invocationId`、`idempotencyKey`；
- [ ] 将 `src/server/store.ts` 替换为持久化 repository，将 provider 替换为可重挂接队列；
- [ ] 媒体下载使用对象存储签名 URL，但由 server-side adapter 生成，组件不接触密钥；
- [ ] 保留任务终态、账本 reserve/settle/release 和取消竞争的不变量；
- [ ] 运行 `pnpm typecheck && pnpm lint && pnpm test && pnpm build && pnpm e2e`；
- [ ] 逐项对照官方证据，标注 `network-confirmed`、`bundle-confirmed` 或本地归一化。

## 7. 机器可读入口

- OpenAPI：[`openapi.yaml`](openapi.yaml)
- route 清单：[`src/contracts/route-manifest.ts`](../../src/contracts/route-manifest.ts)
- 统一入口：[`README.md`](README.md)
- 演示运行手册：[`DEMO_RUNBOOK.md`](../DEMO_RUNBOOK.md)
