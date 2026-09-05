# LibTV 前端复刻 Mock API

本目录是当前纯前端子仓库的正式 API 契约。它服务两个消费者：

1. 当前 Next.js Route Handler 实现的确定性本地 mock（frontend-only，不读取真实 LibTV 凭证，也不调用真实后端）；
2. 未来按相同契约实现的真实后端。

LibTV 官网原始请求不会直接成为本地业务模型。官网证据记录在
[`docs/research/libtv/api`](../research/libtv/api/ENDPOINTS.md)，由 `src/contracts/libtv-*`
一类外部 adapter 解码；本目录描述的是经过命名、类型和状态收敛后的长期契约。

## 契约文件

| 文件 | 作用 |
|---|---|
| [`openapi.yaml`](openapi.yaml) | OpenAPI 3.1；55 个 path、92 个 operation（JSON、binary 与 SSE transport 均有明确成功体） |
| [`AUTHORIZATION.md`](AUTHORIZATION.md) | Bearer scheme、public/authenticated/owner/workspace 语义与后端授权交接边界 |
| [`ERRORS.md`](ERRORS.md) | HTTP 状态、稳定错误码和 UI 映射 |
| [`JOB_STATES.md`](JOB_STATES.md) | 生成任务状态机、积分和产物不变量 |
| [`COMPOSE_LIFECYCLE.md`](COMPOSE_LIFECYCLE.md) | 视频剪辑合成的持久化 task、取消、失败重试、刷新恢复与一次性产物约定 |
| [`ASSET_LIFECYCLE.md`](ASSET_LIFECYCLE.md) | 资产可用性投影、恢复/媒体失效动作及本地 fixture 边界 |
| [`ASSET_INGESTION.md`](ASSET_INGESTION.md) | 上传、取消、资产文件夹与生成产物入库的请求/响应和并发交接 |
| [`jobs-lifecycle.md`](jobs-lifecycle.md) | 可重放 Job fixture、停止/重试/刷新恢复和一次性账本结算 |
| [`WORKFLOW_CONCURRENCY.md`](WORKFLOW_CONCURRENCY.md) | revision、mutation、心跳和冲突恢复 |
| [`VIDEO_REFERENCE_STATE.md`](VIDEO_REFERENCE_STATE.md) | Video 图引用、`@` token、局部元素与运镜持久化契约 |
| [`IMAGE_AUTHORING_STATE.md`](IMAGE_AUTHORING_STATE.md) | Image 模型矩阵、参考、风格、预设与非破坏式派生工具契约 |
| [`AUDIO_AUTHORING_STATE.md`](AUDIO_AUTHORING_STATE.md) | Audio 六模型、TTS 标记、音色库/克隆、参考与生成契约 |
| [`TEXT_AUTHORING_STATE.md`](TEXT_AUTHORING_STATE.md) | Text 四模型、富文本文档、三个启动 Workflow、编译与内联产物契约 |
| [`SCRIPT_V2_STATE.md`](SCRIPT_V2_STATE.md) | Script V2 状态、四个 operation、批量/幂等/stale writeback 与后端 handoff |
| [`src/contracts/account.ts`](../../src/contracts/account.ts) | `GET /api/account` 的既有账户中心身份、钱包、会员、偏好和通知投影 |
| [`account-identity.md`](account-identity.md) | 首页与画布共用的 `LocalIdentity`、会话回跳、typed login continuation、主题/水印偏好与通知摘要 contract |
| [`ACCOUNT_EXTERNAL_COMMANDS.md`](ACCOUNT_EXTERNAL_COMMANDS.md) | Access Key 生命周期、团队邀请/成员更新及订阅、发票、模型市场 handoff |
| [`src/contracts/ledger.ts`](../../src/contracts/ledger.ts) | `GET /api/ledger` 的 `LedgerViewProjection`；账户余额、账本行、reserve/settle/release 折叠结果与任务链接 |
| [`src/contracts/publish.ts`](../../src/contracts/publish.ts) | TV Show 公开快照的发布、列表、详情与下架响应；列表只返回摘要，详情返回冻结工作流文档 |
| [`showcase-directory.md`](showcase-directory.md) | TV Show 目录分页、搜索回退、互动反馈、显式 empty/error fixture 与登录后复制项目契约 |
| [`src/contracts/skills.ts`](../../src/contracts/skills.ts) | Skill 市场卡片、分类/集合查询和幂等收藏动作 |
| [`MATERIAL_CATALOG.md`](MATERIAL_CATALOG.md) | 风格/特效独立目录、分页 facets、详情和幂等收藏动作 |
| [`creation-context.md`](creation-context.md) | 首页发送前的可恢复 CreationContext、版本冲突与提交冻结边界 |
| [`skills-authoring.md`](skills-authoring.md) | Skill 草稿、文件树、审核、发布与下架的作者工作流 |
| [`agent-skill-execution.md`](agent-skill-execution.md) | Agent 固定版本 Skill、确定性计划、确认门、工具轨迹与失败降级 |
| [`ROUTE_COVERAGE.md`](ROUTE_COVERAGE.md) | 47 个 path / 82 个 operation 的审计、fixture/空态/分页约定与后端替换边界 |
| [`PROJECT_RECYCLE_BIN.md`](PROJECT_RECYCLE_BIN.md) | 项目软删除、30 天保留、恢复、永久删除与画布保留边界 |
| [`SURFACE_MATRIX.md`](SURFACE_MATRIX.md) | 页面 surface、可见动作、本地 operation、场景与未来后端 seam 的总索引 |
| [`examples/`](examples/) | 脱敏且确定性的请求/响应样本 |
| `src/contracts/route-manifest.ts` | 本地 route、UI 触发动作和场景的代码清单 |
| `src/contracts/local.ts` / `src/contracts/home.ts` | 本地资源的 Zod 运行时 Schema |
| `src/contracts/jobs.ts` | Jobs 四个 operation 的严格请求/响应 Schema |
| `src/contracts/libtv-generation.ts` | 官网生成 create/progress/stop/batch 协议 adapter |
| `src/api/client.ts` | 页面唯一 JSON 传输与错误规范化入口 |

`openapi.yaml` 使用 JSON-compatible YAML；它既是合法 YAML，也是合法 JSON，因此无需在
浏览器运行时增加 YAML 解析依赖。

## 本地地址与版本

```text
Base URL: http://localhost:3200
Contract version: 1.25.0-showcase-account-commands
OpenAPI: 3.1.0
```

`Contract version` 是当前 mock API 契约的权威版本标记，并与 `openapi.yaml` 的
`info.version` 保持一致；采用 SemVer `MAJOR.MINOR.PATCH`，可附带标准 prerelease/build
标识（例如 `1.13.0-local-identity`）。版本演进不改变非版本化 `/api/*` 路径。

当前实现只向本地 Next.js mock 发请求；真实后端接入时以部署层 base URL 切换，不要求页面组件改路径或直接读取环境变量，也不把凭证下沉到组件。

`createApiClient()` 的第二参数是仅限 transport 的 header seam；它在本地相对路径校验通过后才读取 header provider，
并合并调用方已显式传入的 header。生产 adapter 可在应用外层注入一次，组件仍只调用 typed client：

```ts
const backendClient = createApiClient(fetch, {
  getHeaders: async () => ({ Authorization: `Bearer ${await readAccessToken()}` }),
})
```

fixture、组件 state、Route Handler body 和文档样本都不保存该 token；调用方 header（例如 idempotency key）优先于 adapter 的同名默认值。

## 传输约定

### JSON

- 除媒体下载和上传外，请求/响应使用 UTF-8 JSON；
- 有 JSON body 的请求发送 `Content-Type: application/json`；
- 时间一律为带时区 ISO 8601 字符串；
- ID 是不透明字符串，fixture 使用可读稳定 ID，例如 `prj_video_demo`；
- 金额不用浮点货币；积分是整数；
- 任务进度取值范围 `0..100`；
- 空集合返回 `[]`，不返回 `null`；可缺对象使用显式 `null`。

### 成功响应

本地规范化 API 直接返回 operation 对应的资源或结果，不再套一层官网 `code/data/msg`。
官网 envelope 由 `decodeExternalEnvelope()` 在 adapter 边界剥离。

```json
{
  "projects": [],
  "folders": [],
  "balance": 100
}
```

### 错误响应

目标格式：

```json
{
  "error": {
    "code": "REVISION_CONFLICT",
    "message": "画布版本冲突",
    "details": {
      "expectedRevision": 7,
      "currentRevision": 8
    }
  },
  "requestId": "req_fixture_0001"
}
```

现有 Route Handler 仍有 `{ "error": "message" }` 兼容形状。`src/api/client.ts` 同时识别
两种格式；OpenAPI 的后端交接 response 已统一为 `ErrorResponse`，迁移完成后删除旧形状，详见
[`ERRORS.md`](ERRORS.md)。

### 后端交接授权

OpenAPI 为所有 82 个 operation 显式声明 operation-level `security` 与
`x-authorization`：公开读取使用 `security: []`，其余 operation 使用 `bearerAuth`。Bearer
由 transport adapter 注入，页面和 fixture 不读取或持久化凭证。public、authenticated、owner 和
workspace 的资源边界，以及 `401`/`403`/`404` 的交接规则见 [`AUTHORIZATION.md`](AUTHORIZATION.md)。

## 确定性场景

开发环境可切换完整 fixture，而不是靠随机参数碰状态：

```bash
curl -s http://localhost:3200/api/dev/scenario

curl -s -X POST http://localhost:3200/api/dev/scenario \
  -H 'Content-Type: application/json' \
  -d '{"scenarioId":"video-running"}'

curl -s -X POST http://localhost:3200/api/dev/reset
```

`POST /api/dev/scenario` 选择并重建场景；`POST /api/dev/reset` 重新构建当前选择的场景，
不会偷偷切回另一套数据。两者在 production 均返回 `403`。

| 场景 | 主要用途 |
|---|---|
| `anonymous` | 公开首页、TV Show 和登录门 |
| `authenticated-empty` | 登录空账户和项目空态 |
| `authenticated-populated` | 完整项目、节点、资产和 Agent 会话 |
| `account-switch-required` | 账户选择门 |
| `session-expired` | 画布编辑租约失效与刷新恢复 |
| `video-awaiting-confirmation` | 过期报价保护与关闭/取消入口 |
| `video-awaiting-valid-confirmation` | 有效报价确认、积分预留与运行态收敛 |
| `video-queued` | 排队态 |
| `video-running` | 固定 58% 的刷新恢复态 |
| `video-succeeded` | 本地视频产物写回 |
| `video-failed` | 可重试失败 |
| `video-cancelled` | 取消和积分返还 |
| `video-compliance-blocked` | 素材合规阻断 |
| `revision-conflict` | 服务端 revision 领先一版 |
| `public-showcase` | 冻结公开快照 |

所有场景使用稳定对象 ID 和本地媒体路径；常规 fixture 使用 `2026-09-03T12:00:00.000Z` 固定时钟，`video-awaiting-valid-confirmation` 以固定的 `2099-12-31T23:59:00.000Z` 报价到期时间提供可重复的有效确认门。

## UI 到 API 主链路

| UI 流程 | 主要 operation |
|---|---|
| 首页发现/最近项目 | `getHomeDiscovery`, `getHomeCreationContext`, `saveHomeCreationContext`, `submitHomeCreationContext` |
| 全部项目与回收站 | `listProjects`, `createProject`, `listRecycleBin`, `restoreRecycledProject`, `permanentlyDeleteRecycledProject` |
| 文件夹 | `createFolder`, `renameFolder`, `deleteFolder` |
| 打开项目和多画布 | `getProject`, `getCanvas`, `createCanvas`, `renameCanvas`, `deleteCanvas` |
| 工作流编辑 | `mutateCanvas`, `getCanvasPresence`, `updateCanvasPresence` |
| Video 参考、元素、运镜 | `mutateCanvas`（同一 revision 的边与节点元数据事务） |
| Image 参考、风格、预设、派生工具 | `mutateCanvas`（原子图 mutation 与可重放 metadata） |
| 画布风格/特效目录 | `listMaterials`, `getMaterial`, `toggleMaterialFavorite`；应用动作再走 `mutateCanvas` 创建专用节点 |
| Audio/TTS/音乐、音色与参考 | `listModels`, `mutateCanvas`, Jobs 四 operation（本地 WAV） |
| Text 生成、手写文档与三个启动 Workflow | `listModels`, `mutateCanvas`, Jobs 四 operation（本地 TXT + 内联文本） |
| Script V2 三阶段脚本 | `quoteScriptV2`, `createScriptV2Run`, `getScriptV2Run`, `transitionScriptV2Run`；状态写回仍走 `mutateCanvas` |
| TV Show 目录与详情 | `listShowcaseEntries`, `getShowcaseDetail`, `getPublishedSnapshot`；详情媒体、作者、统计和相邻作品属于独立 discovery projection，工作流仍读取冻结快照 |
| 节点生成 | `listGenerationJobs`, `createGenerationJob`, `transitionGenerationJob`, `getGenerationJob` |
| 模型目录与参数联动 | `listModels` |
| 视频剪辑导出 | `composeVideo`, `getComposeTask`, `transitionComposeTask`, `readLocalMedia` |
| 素材管理 | `listAssets`, `uploadAsset`, `registerArtifactAsAsset`, `updateAsset` |
| Agent | `createAgentSession`, `sendAgentMessage`, `resolveAgentMessage` |
| Skill | `listSkills`, `getSkill`, `toggleSkillFavorite`, `listAuthoredSkills`, `createAuthoredSkill`, `getAuthoredSkill`, `updateAuthoredSkill`, `transitionAuthoredSkill` |
| TV Show | `listShowcaseEntries`, `getShowcaseDetail`, `listPublishedSnapshots`, `getPublishedSnapshot`, `clonePublishedSnapshot`, `publishCanvas` |
| 账户中心身份/偏好 | `getAccountProfile` |
| 头像菜单身份/会话/偏好/通知 | `getLocalIdentity`, `updateLocalSession`, `getLocalPreferences`, `updateLocalPreferences`, `getNotificationSummary`, `markNotificationsRead` |
| 账户积分 | `listLedgerEntries` |

完整触发动作位于每个 OpenAPI operation 的 `x-ui-triggers`，可重放状态位于
`x-mock-scenarios`。

### 首页聚合契约

`GET /api/home` 是首页唯一初始化请求：公开活动、创作入口、推荐 Skill 与 TV Show
内容来自冻结的本地 catalogue；账户积分和最近三个项目来自当前 scenario workspace state。
匿名态仍返回公开发现内容，但 `recentProjects` 为空、积分为 `0`。所有媒体 URL 都由
运行时 Schema 限制在 `/fixtures/libtv/`，页面不会依赖官网 CDN 或登录凭证。

### 公开发现与 TV Show 契约

首页的 `GET /api/home` 是聚合读取；需要独立刷新公开内容时使用：

```text
GET  /api/publish
GET  /api/publish/SNAPSHOT_ID
POST /api/publish       { canvasId, title?, summary? }
DELETE /api/publish/SNAPSHOT_ID
POST   /api/publish/SNAPSHOT_ID/clone
```

`GET /api/publish` 返回 `{ snapshots }`，每行是 `SnapshotSummary`，包含稳定的
`nodeCount` / `mediaCount`，不携带工作流正文。`GET /api/publish/SNAPSHOT_ID` 返回
`PublishedSnapshot`，其中 `document` 是发布时的深拷贝；后续画布编辑不会改变公开页面。
发布会清理 job、session、asset 等私有句柄；下架是软状态变更，公开列表与详情对隐藏/撤销
快照统一返回 `404`，避免暴露已下架作品是否存在。复制使用独立的 `POST /api/publish/SNAPSHOT_ID/clone`，只在登录 mock 场景创建新的私有项目和深拷贝画布。

### Skill 市场契约

```text
GET  /api/skills?category=全部&collection=全部&q=关键词
GET  /api/skills?composer=attachments|references|skills|modes&fixture=empty|error
GET  /api/skills/SKILL_ID
POST /api/skills/SKILL_ID  { action: "favourite" | "unfavourite" }
```

未传 `composer` 的列表响应为 `{ skills, category, collection, counts }`。传入 `composer` 后，
附件/参考响应为 `{ kind, items }`，Skill 响应额外返回 `{ counts }`，生成模式响应为
`{ kind: "modes", items }`。`fixture=empty` 和 `fixture=error` 是仅供 local mock 验证
drawer 的确定性空态和 `503` 错误态。`category`、`collection` 的未知
查询值按“全部”处理，搜索覆盖名称、摘要、作者和标签；每个 `SkillCard` 都带版本、执行
说明和当前 workspace 的 `favourite` 投影。收藏请求表达目标状态而不是 flip，因此重试和
重复点击是幂等的。Skill catalogue 是只读本地 fixture，收藏 id 按 space 持久化，不会污染
共享种子数据。

作者工作流使用本地 deterministic mock：

```text
GET|POST /api/skills/author
GET|PATCH|POST /api/skills/author/SKILL_ID
```

它固定覆盖 `create → draft → 编辑版本化说明/输出类型/可选封面/文件树 → submit_review → publish → 我的可见 → unpublish`。
仅 `published` 版本投影到 `collection=我的`；发布未通过审核或不完整草稿会给出可行动校验错误。完整字段说明见
[`skills-authoring.md`](skills-authoring.md)。

### 模型目录契约

`GET /api/models?media=video&q=` 返回版本化的本地模型 registry。目录顺序、标签和当前
可见模型集合以官网交互证据为基线；`baseCredits`、provider adapter 和 capability 默认值
是本地 mock 的规范化字段，不声称等于官网动态价格或服务端内部配置。

Image 项的 `imageCapabilities` 固定质量、清晰度、13 种画幅、生成数量及默认值；Audio 项的
`audioCapabilities` 固定五种模型族、字符上限、text/audio 参考、音色与 TTS token 支持及完整 defaults；
Text 项的 `textCapabilities` 固定四项模型顺序、provider model、字符上限、text/image 参考、
翻译能力和 `text-generate` scene；
Video 项的 `capabilities` 同时提供：

- 支持的画幅、清晰度、时长、生成数量和音频策略；
- 可用 generation mode；
- 每种 mode 对图片、视频、音频或任意参考素材的最小/最大数量要求；
- 切换模型时应使用的默认输出。

页面切换模型后先按此能力对象归一化编辑态，`compileNode()` 在创建任务前再次执行同一
归一化，避免导入旧草稿或直接 mutation 留下不可执行参数。完整响应样本见
[`examples/models-video.response.json`](examples/models-video.response.json)。
Text 完整目录见 [`examples/models-text.response.json`](examples/models-text.response.json)，富文本文档、
下游纯文本投影、三个原子 starter 与内联 `.txt` 产物见
[`TEXT_AUTHORING_STATE.md`](TEXT_AUTHORING_STATE.md)。

Canvas 节点编辑器与 Storyboard 再生成面板消费同一个 registry、目录组件和
`WorkflowNode.data`。后端不需要维护“故事板参数”副本；任一入口的修改都通过
`mutateCanvas` 增加 revision，另一入口重新投影同一文档即可看到结果。

### Script V2 契约

Script V2 是唯一写入 `WorkflowNode.data.extra.scriptV2` 的三阶段脚本状态。四个 local
operation 覆盖报价、幂等提交、轮询和取消/重试；四种 operation 值为
`generate-full`、`recognize-assets-only`、`recompute-prompts`、`generate-asset`。
请求/响应由 `src/contracts/script-v2.ts` 的 Zod 判别联合约束，OpenAPI 也用四个
`oneOf` 分支描述 `input` 与 `result`，不是 `unknown` 占位。

本地 mock 固定为 create=`queued`、第一次 GET=`running/48%`、第二次 GET=`succeeded/100%`；
相同 `idempotencyKey` 和 fingerprint 重放原 run，不同输入返回 409。Script 状态写回仍需
`expectedRevision`，迟到或过期结果不得覆盖用户编辑。完整字段表、阶段门槛、错误码、CSV
规则和真实后端交接顺序见 [`SCRIPT_V2_STATE.md`](SCRIPT_V2_STATE.md)；官网 shape/bundle
证据见 [`2026-09-03-script-v2.md`](../research/libtv/api/captures/2026-09-03-script-v2.md)。

### 生成任务契约

本地 Jobs API 使用两阶段提交：

1. `POST /api/jobs` 接收严格的 `{ canvasId, nodeId }`，冻结 `ExecutionSpec` 与 `Quote`，返回
   `awaiting_confirmation`，此时不扣积分、不提交 provider；
2. `POST /api/jobs/{jobId}` 只接受 `{ action: "confirm" | "cancel" }`；确认后才预留积分并
   submit，取消则尽力终止并由状态机收敛；
3. `GET /api/jobs/{jobId}` 是唯一轮询入口；成功时额外返回最新 `revision/document`，避免
   产物写回画布后再多一次 bootstrap；
4. `GET /api/jobs?canvasId=` 返回可刷新恢复的持久任务列表。

四个 operation 分别使用 `ListJobsResponse / CreateJobResponse / GetJobResponse /
TransitionJobResponse`，不再使用泛型成功占位。请求与响应的可执行样本位于
[`examples/jobs-create.request.json`](examples/jobs-create.request.json) 等 `jobs-*` 文件。
`createApiClient().jobs` 在页面边界验证全部响应；服务端 route 在调用 runner 前验证 JSON，
因此缺失 action 或把 `poll` 误发到 POST 都稳定返回 `400`，不会隐式开始生成。

官网协议仍是 `POST /api/task/generation/create|progress|stop/batch`。两者不是同一路由设计：
`src/contracts/libtv-generation.ts` 负责兼容 `taskId/task_id`、数值状态和字符串化
`taskResult`，再交给本地领域状态机。每个 Jobs OpenAPI operation 的 `x-libtv-upstream`
记录这层映射与证据等级。

### 视频合成契约

`POST /api/compose` 接收编辑器从 `videoComposite.data.extra.composite` 规范化得到的多轨
时间线。API 不接收 `canvasId`、`nodeId`、`timeline` 或 `destination`：持久化属于画布
mutation，下载或添加到画布属于前端在收到产物之后的动作，两者都不应耦合进渲染请求。

```ts
type ComposeRequest = {
  clips: Array<{
    url: string
    inPoint: number
    outPoint: number
    speed?: number                 // 0.25..4，默认 1
    muted?: boolean                // 默认 false
    transitionAfter?: 'fade' | 'to-black' | 'to-white' | null
    transitionDurationSeconds?: number | null // 0.08..2
  }>
  audioTracks?: Array<{
    url: string
    inPoint: number
    outPoint: number
    start?: number                 // 成片时间线秒数，默认 0
    volume?: number                // 0..2，默认 1
    muted?: boolean
  }>
  subtitles?: Array<{ text: string; start: number; end: number }>
}
```

- 至少 1、最多 40 个视频片段；独立音轨最多 16 条；字幕最多 100 条；
- 裁切后、转场重叠前的总时长最多 20 分钟（1200 秒）；每个裁切窗口至少 0.05 秒；
- `url` 必须是无 query/fragment 的 `/api/media/` 本地媒体 URL；ClipEditor 只允许存在正时长的本地 video/audio artifact 入轨，Zod 在 HTTP 边界拒绝远端 URL，服务端在交给 ffmpeg 前仍做解码、路径边界、`realpath` 和普通文件校验；
- 视频源音频会按裁切、倍速和转场同步处理；无音频的片段以静音补齐；独立 BGM/配音按
  `start` 放置、按 `volume` 混音；
- 转场时长会根据相邻片段有效长度收缩；字幕优先烧录，缺少文字渲染能力时封装为
  `mov_text`，响应的 `subtitleMode` 明确返回 `burned`、`muxed` 或 `none`；
- 成功响应为 `{ artifact, assetId, subtitleMode, notes }`，其中 Artifact 同步登记进个人
  资产库。`notes` 用于展示裁切、几何或字幕降级，不代表请求失败；
- `POST /api/compose` 的 `400` 只表示同步契约/时间线无效；任务创建后发现源文件消失、ffmpeg
  缺失、超过 90 秒预算或渲染失败，都会由同一 task 的 `failed + failure` 返回。失败不会清空或改写前端时间线。

完整样本见 [`compose.request.json`](examples/compose.request.json) 与
[`compose.response.json`](examples/compose.response.json)，运行时 Schema 位于
`src/contracts/compose.ts`，OpenAPI 对应 `ComposeRequest` / `ComposeResponse`。

## 分页、排序和查询

项目官网证据确认两种查询：

- 首页最近内容：`page=1&pageSize=5&orderBy=updated_at_desc`；
- 全部项目：`page=1&pageSize=20&orderBy=created_at_desc`。

本地现有 `/api/projects` 仍一次返回完整集合；项目页视觉复刻批次会迁移为：

```ts
type Page<T> = {
  items: T[]
  page: number
  pageSize: number
  total: number
  hasMore: boolean
}
```

分页顺序必须由 fixture 时间和稳定 ID 决定，禁止依赖 `Date.now()` 或随机数。

## 幂等与并发

- 画布 mutation 使用 `expectedRevision`；冲突返回 409；
- 生成任务以 `invocationId` 标识一次逻辑副作用；基础设施重试不生成新 ID；
- 产物注册按 `sourceArtifactId` 幂等；
- 账本按 `logicalChargeId` 去重；
- 项目/画布删除不是幂等成功：对象不存在返回 404；
- 编辑租约和协作视口属于 Presence，不写进 `WorkflowDocument`。

## 契约一致性测试

```bash
node scripts/verify-api-contract.mjs
pnpm vitest run src/contracts/__tests__/openapi.test.ts
```

前一条命令独立校验 route source / manifest / OpenAPI、权威版本、文档统计和已链接 JSON 样本；测试会扫描 `src/app/api/**/route.ts`，并要求源码导出的 method/path 与
`LOCAL_API_ROUTES`、`openapi.yaml` 完全相同；还会检查 operationId 唯一、UI 触发动作和
mock scenario 非空。新增 route 时三个来源必须在同一提交更新。

## 未来后端接入

1. 保留 `src/api/client.ts` 的方法签名；
2. 将 transport base URL 指向真实服务；
3. 在 adapter 层添加认证头，不让业务组件读取 token；按 [`AUTHORIZATION.md`](AUTHORIZATION.md)
   执行 `x-authorization` 的 public/authenticated/owner/workspace 边界；
4. 先将上游错误归一化为 `ErrorResponse`，再让真实成功响应通过同一 Zod Schema；
5. 使用 examples 与 scenario E2E 做消费者契约测试；
6. 真实长任务可把轮询替换为 SSE/WebSocket，但状态机和资源结构保持不变。
