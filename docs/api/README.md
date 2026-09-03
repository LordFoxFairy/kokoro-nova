# LibTV 前端复刻 Mock API

本目录是当前纯前端子仓库的正式 API 契约。它服务两个消费者：

1. 当前 Next.js Route Handler 实现的确定性本地 mock；
2. 未来按相同契约实现的真实后端。

LibTV 官网原始请求不会直接成为本地业务模型。官网证据记录在
[`docs/research/libtv/api`](../research/libtv/api/ENDPOINTS.md)，由 `src/contracts/libtv-*`
一类外部 adapter 解码；本目录描述的是经过命名、类型和状态收敛后的长期契约。

## 契约文件

| 文件 | 作用 |
|---|---|
| [`openapi.yaml`](openapi.yaml) | OpenAPI 3.1；29 个 path、52 个 operation |
| [`ERRORS.md`](ERRORS.md) | HTTP 状态、稳定错误码和 UI 映射 |
| [`JOB_STATES.md`](JOB_STATES.md) | 生成任务状态机、积分和产物不变量 |
| [`WORKFLOW_CONCURRENCY.md`](WORKFLOW_CONCURRENCY.md) | revision、mutation、心跳和冲突恢复 |
| [`examples/`](examples/) | 脱敏且确定性的请求/响应样本 |
| `src/contracts/route-manifest.ts` | 本地 route、UI 触发动作和场景的代码清单 |
| `src/contracts/local.ts` / `src/contracts/home.ts` | 本地响应的 Zod 运行时 Schema |
| `src/api/client.ts` | 页面唯一 JSON 传输与错误规范化入口 |

`openapi.yaml` 使用 JSON-compatible YAML；它既是合法 YAML，也是合法 JSON，因此无需在
浏览器运行时增加 YAML 解析依赖。

## 本地地址与版本

```text
Base URL: http://localhost:3200
Contract version: 1.1.0-video-catalog
OpenAPI: 3.1.0
```

当前版本保留已有 route 的非版本化 `/api/*` 路径。真实后端接入时以部署层 base URL
切换，不要求页面组件改路径或直接读取环境变量。

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
两种格式；迁移完成后删除旧形状，详见 [`ERRORS.md`](ERRORS.md)。

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
| `video-awaiting-confirmation` | 报价确认门 |
| `video-queued` | 排队态 |
| `video-running` | 固定 58% 的刷新恢复态 |
| `video-succeeded` | 本地视频产物写回 |
| `video-failed` | 可重试失败 |
| `video-cancelled` | 取消和积分返还 |
| `video-compliance-blocked` | 素材合规阻断 |
| `revision-conflict` | 服务端 revision 领先一版 |
| `public-showcase` | 冻结公开快照 |

所有场景使用 `2026-09-03T12:00:00.000Z` 固定时钟、稳定对象 ID 和本地媒体路径。

## UI 到 API 主链路

| UI 流程 | 主要 operation |
|---|---|
| 首页发现/最近项目 | `getHomeDiscovery` |
| 全部项目 | `listProjects`, `createProject` |
| 文件夹 | `createFolder`, `renameFolder`, `deleteFolder` |
| 打开项目和多画布 | `getProject`, `getCanvas`, `createCanvas`, `renameCanvas`, `deleteCanvas` |
| 工作流编辑 | `mutateCanvas`, `getCanvasPresence`, `updateCanvasPresence` |
| 节点生成 | `createGenerationJob`, `transitionGenerationJob`, `getGenerationJob` |
| 模型目录与参数联动 | `listModels` |
| 视频剪辑导出 | `composeVideo`, `readLocalMedia` |
| 素材管理 | `listAssets`, `uploadAsset`, `registerArtifactAsAsset`, `updateAsset` |
| Agent | `createAgentSession`, `sendAgentMessage`, `resolveAgentMessage` |
| Skill | `listSkills`, `getSkill`, `toggleSkillFavorite` |
| TV Show | `listPublishedSnapshots`, `getPublishedSnapshot`, `publishCanvas` |
| 账户积分 | `listLedgerEntries` |

完整触发动作位于每个 OpenAPI operation 的 `x-ui-triggers`，可重放状态位于
`x-mock-scenarios`。

### 首页聚合契约

`GET /api/home` 是首页唯一初始化请求：公开活动、创作入口、推荐 Skill 与 TV Show
内容来自冻结的本地 catalogue；账户积分和最近三个项目来自当前 scenario workspace state。
匿名态仍返回公开发现内容，但 `recentProjects` 为空、积分为 `0`。所有媒体 URL 都由
运行时 Schema 限制在 `/fixtures/libtv/`，页面不会依赖官网 CDN 或登录凭证。

### 模型目录契约

`GET /api/models?media=video&q=` 返回版本化的本地模型 registry。目录顺序、标签和当前
可见模型集合以官网交互证据为基线；`baseCredits`、provider adapter 和 capability 默认值
是本地 mock 的规范化字段，不声称等于官网动态价格或服务端内部配置。

Video 项的 `capabilities` 同时提供：

- 支持的画幅、清晰度、时长、生成数量和音频策略；
- 可用 generation mode；
- 每种 mode 对图片、视频、音频或任意参考素材的最小/最大数量要求；
- 切换模型时应使用的默认输出。

页面切换模型后先按此能力对象归一化编辑态，`compileNode()` 在创建任务前再次执行同一
归一化，避免导入旧草稿或直接 mutation 留下不可执行参数。完整响应样本见
[`examples/models-video.response.json`](examples/models-video.response.json)。

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
pnpm vitest run src/contracts/__tests__/openapi.test.ts
```

测试会扫描 `src/app/api/**/route.ts`，并要求源码导出的 method/path 与
`LOCAL_API_ROUTES`、`openapi.yaml` 完全相同；还会检查 operationId 唯一、UI 触发动作和
mock scenario 非空。新增 route 时三个来源必须在同一提交更新。

## 未来后端接入

1. 保留 `src/api/client.ts` 的方法签名；
2. 将 transport base URL 指向真实服务；
3. 在 adapter 层添加认证头，不让业务组件读取 token；
4. 先让真实响应通过同一 Zod Schema，再关闭对应 mock route；
5. 使用 examples 与 scenario E2E 做消费者契约测试；
6. 真实长任务可把轮询替换为 SSE/WebSocket，但状态机和资源结构保持不变。
