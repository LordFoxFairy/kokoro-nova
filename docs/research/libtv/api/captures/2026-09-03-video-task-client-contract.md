# 2026-09-03 Video 生成任务客户端协议

## 捕获条件

- 页面：登录态 Workflow，打开 Video 节点编辑器；
- 视口：Chrome `1440 × 900` CSS 像素；
- 动作：读取当前节点配置、复核既有画布初始化网络捕获，并对当前部署静态客户端做字段级分析；
- 费用边界：没有点击付费生成，因此 create/progress/stop 的结构属于 `bundle-confirmed`，只有批量进度初始化属于 `shape-confirmed`；
- 安全：未保存 Cookie、Token、账户、团队、空间、项目、节点、任务、提示词或媒体的真实值；本文只使用占位符与本地 fixture；
- 归档：部署 bundle 仅在临时目录中分析，不进入仓库，也不作为运行时依赖。

## 证据等级

| 等级 | 含义 |
|---|---|
| `network-confirmed` | 浏览器真实触发并看到方法、URL 和状态；尚未保证字段完整。 |
| `shape-confirmed` | 浏览器网络响应进一步确认了脱敏字段结构。 |
| `bundle-confirmed` | 当前线上部署客户端明确构造或消费该字段；尚未用付费动作生成对应网络样本。 |
| `interaction-linked` | 已确认可见 UI 对应此请求或响应。 |

静态证据来自 2026-09-03 当前部署。为避免把第三方源码复制进仓库，只保留压缩资源的
SHA-256 和从中归纳出的接口事实：

| 证据职责 | SHA-256 |
|---|---|
| API registry | `c26fbe266c4d1628cb8e1916a78d9f8ca101511eb7c11a5f3f6d2a4df9eac2f9` |
| generation request service | `10e33bfed0e56ca1177128970a65e0dabbf223124d25805b1cf09554fc23f482` |
| canvas service | `c24f1fc6cb32f43135b8bb0ee2d409205d3acd6b75a72359001d0b81e694e32a` |
| generation params builder | `9a1d1379c15971912bb5263948acf4a7b069cbdf423e6763d80b7325d871bfa4` |
| task poll/writeback | `e46c015b207ef4e0cac211e9b2b2f83ea53af5ff3bc330faeacc4760d0123b54` |

## 端点索引

| 方法 | 路径 | 用途 | 证据 |
|---|---|---|---|
| `POST` | `/api/task/generation/create` | 创建单个生成任务 | `bundle-confirmed`, `interaction-linked` |
| `POST` | `/api/task/generation/progress` | 读取指定任务进度与结果 | `bundle-confirmed`, `interaction-linked` |
| `POST` | `/api/task/generation/progress/batch` | 初始化时批量同步任务 | `shape-confirmed`, `interaction-linked` |
| `POST` | `/api/task/generation/stop/batch` | 批量停止任务 | `bundle-confirmed`, `interaction-linked` |
| `POST` | `/api/task/generation/power/calculator` | 单个请求算力/积分报价 | `bundle-confirmed`, `interaction-linked` |
| `POST` | `/api/task/generation/power/calculator/batch` | 批量请求算力/积分报价 | `bundle-confirmed` |
| `POST` | `/api/task/generation/video/opt` | Video 任务优化入口 | `bundle-confirmed`；字段未确认 |

## 创建任务

### Request

```ts
type GenerationCreateRequest = {
  params: Record<string, unknown>
  metadata: {
    node_id: string
    project_id: string
    [extension: string]: unknown
  }
  provider: string
  model: string
  taskType: string
  requestId: string
  teamId?: number
  bizScene?: number
  budgetPower?: number
  [extension: string]: unknown
}
```

Video 参数构造器会把基础设置和高级设置展开到 `params`。当前客户端会按模型能力构造或
清理这些字段：

```ts
type VideoGenerationParams = {
  textList?: unknown[]
  imageList?: unknown[]
  videoList?: unknown[]
  audioList?: unknown[]
  mixedList?: unknown[]
  imageListV2?: unknown[]
  videoListV2?: unknown[]
  audioListV2?: unknown[]
  cameraPresets?: unknown[]
  effects?: unknown[]
  effectTemplateUuids?: string[]
  elementList?: unknown[]
  loraList?: unknown[]
  refMap?: Record<string, unknown>
  editSegments?: unknown[]
  modeType?: string
  [modelSpecificParam: string]: unknown
}
```

已确认的规范化规则：

1. `text2video` 清空图像和视频参考；
2. image-to-video 模式清空视频参考，video-to-video 模式清空图像参考；
3. 当前多模态 Video 模型使用带 URL、尺寸、时长和 `assetId` 的 V2 媒体结构；
4. digital-human 需要首张图片和首段音频，并归一到单图驱动模式；
5. 模型 schema 会移除当前模型不支持的扁平参数；
6. 同一 `metadata.node_id` 的重复提交在客户端有 2 秒抑制窗口，但这不等于服务端幂等保证。

### Response

```ts
type GenerationCreateResponse = {
  code: number
  data: {
    taskId?: string
    task_id?: string
    [extension: string]: unknown
  }
  msg?: string
  trace_id?: string
}
```

当前客户端同时读取 `taskId` 与 `task_id`。本地 adapter 因此必须归一成一个稳定
`taskId`，两者都缺失时按契约错误处理。

## 任务进度与结果

### Request

```ts
type GenerationProgressRequest = {
  taskIds: string[]
  teamId?: number
}
```

### Response

```ts
type GenerationProgressResponse = {
  code: number
  data: {
    progresses: Array<{
      taskId: string
      status: 0 | 1 | 2 | 3 | 4
      progressPercent: number
      taskResult?: string | null
      failedReason?: string | null
      delayInfo?: unknown
      benefitTag?: unknown
      agentProcessing?: boolean
      nodeKeys?: string[]
      yieldStage?: unknown
      startTimeMs?: number
      [extension: string]: unknown
    }>
    [extension: string]: unknown
  }
  msg?: string
  trace_id?: string
}
```

状态映射：

| 官网值 | adapter 语义 | 本地 runner 收敛 |
|---:|---|---|
| `0` | `pending` | `queued` |
| `1` | `running` | `running` |
| `2` | `succeeded` | `succeeded`，写入产物并结算 |
| `3` | `failed` | `failed`，记录原因并返还预留 |
| `4` | `timed_out` | `failed` + 明确超时原因，返还预留 |

`taskResult` 是 JSON 字符串，不是已解析对象。当前客户端消费的结果集合为
`videos / images / audios / texts`。媒体项的已确认字段包括：

```ts
type TaskMedia = {
  previewPath?: string | null
  videoUrl?: string | null
  originalPath?: string | null
  storagePath?: string | null
  width?: number | null
  height?: number | null
  duration?: number | null
  subtitleUrl?: string | null
  subtitleHtmlUrl?: string | null
  transition?: { type: string; duration: number }
  transitions?: Array<{ type: string; duration: number }>
  subType?: string | number | null
  [extension: string]: unknown
}
```

外部 adapter 需要把 `taskResult` 解析成独立字段并保留原字符串；空值映射为 `absent`，
非法 JSON 映射为 `INVALID_JSON`，JSON 合法但媒体结构不合法映射为 `INVALID_SHAPE`。
任务即使标记成功但结果非法，也不能把未经校验的对象写入节点。

## 批量同步与停止

画布初始化真实观察到 `POST /api/task/generation/progress/batch` 可无 body，响应为：

```ts
type BatchProgressResponse = {
  code: number
  data: { success: boolean; [extension: string]: unknown }
  msg: string
  trace_id: string
}
```

当前部署客户端也允许传 `{ teamId?: number }`。停止请求与响应为：

```ts
type StopBatchRequest = { taskIds: string[] }

type StopBatchResponse = {
  code: number
  data: {
    results: Array<{
      taskId: string
      success: boolean
      message?: string
      [extension: string]: unknown
    }>
  }
  msg?: string
  trace_id?: string
}
```

## 算力报价

单个 calculator 使用与 create 相同的生成请求；批量请求为：

```ts
type GenerationPowerBatchRequest = {
  list: GenerationCreateRequest[]
  infiniteSwitch?: boolean
}
```

报价响应的字段仍需一次单动作网络捕获，当前阶段只把请求边界写入 adapter，不虚构返回值。

## 画布写回约束

- 轮询完成后，官网客户端只把白名单字段写回对应节点，不用服务端结果整体替换节点；
- 协作场景会额外判断当前编辑租约持有者；
- 草稿保存使用 `{ projectUuid, viewportX, viewportY, viewportZoom, draftJson, sessionId, timestamp }`；
- 保存前会移除 blob/data URL，临时浏览器资源不能进入长期草稿；
- 本地实现用 `invocationId` 做强于官网 2 秒窗口的逻辑幂等键，进程重挂接时不得二次产生副作用。

## 本地实现映射

| 官网协议 | 本地规范化 API | 差异意图 |
|---|---|---|
| generation create | `POST /api/jobs` + `POST /api/jobs/{jobId}` confirm | 本地先冻结 spec/quote，再显式确认 provider submit。 |
| generation progress | `GET /api/jobs/{jobId}` | GET 轮询；响应同时给出画布 revision/document 与余额。 |
| progress batch | `GET /api/jobs?canvasId=` | 返回持久化 job 列表，而非只返回同步确认。 |
| stop batch | `POST /api/jobs/{jobId}` cancel | 当前本地 UI 单任务取消；provider adapter 可在内部批量调用。 |

运行时 schema 位于 `src/contracts/libtv-generation.ts` 与 `src/contracts/jobs.ts`；正式本地协议、
示例与状态机分别位于 `docs/api/openapi.yaml`、`docs/api/examples/jobs-*` 和
`docs/api/JOB_STATES.md`。
