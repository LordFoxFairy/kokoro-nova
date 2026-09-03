# 2026-09-03 登录态画布初始化

## 捕获条件

- 页面：已有内容的 `/canvas?spaceId=<SPACE_ID>&projectId=<PROJECT_UUID>`；
- 登录态：是；
- 视口：Chrome `1440 × 900` CSS 像素；
- 动作：刷新当前项目并等待节点、连线、任务与 Agent 会话初始化；
- 证据：可见画布、CDP request/response、脱敏 JSON 字段结构；
- 安全：没有输出或保存认证值、用户标识、原始项目标识、提示词或媒体 URL。

本次单动作响应缓冲未被截断。画布视觉结构与既有 1440×900 截图索引位于
[`pages/canvas/README.md`](../../pages/canvas/README.md)。

## 初始化主请求

### `GET /api/canvas/project/detail-by-space`

查询参数：

```text
spaceId=<SPACE_ID>
projectUuid=<PROJECT_UUID>
```

响应主结构：

```ts
type CanvasProjectDetailResponse = {
  code: number
  data: {
    config: {
      accessPolicy: number
      allowCopy: boolean
      shareAgentConversation: boolean
    }
    effective: ProjectEffectivePermissions
    folder: ProjectFolderEntry
    projectList: ProjectFolderEntry[]
    total: number
    projectDetail: {
      projectMeta: CanvasProjectMeta
      projectDraft: CanvasProjectDraft
      nodeList: CanvasNodeRecord[]
      connectionList: CanvasConnectionRecord[]
    }
  }
  msg: string
  trace_id: string
}

type ProjectEffectivePermissions = {
  canRead: boolean
  canEdit: boolean
  canManage: boolean
  canPublish: boolean
  canShare: boolean
  canCopy: boolean
}

type CanvasProjectMeta = {
  id: number
  uuid: string
  name: string
  visibility: number
  ownerId: number
  createdAtMs: number
  updatedAtMs: number
  folderId: number
  accessConfig: {
    accessPolicy: number
    publishable: number
    assetLocation: number
    allowCopy: boolean
    shareAgentConversation: boolean
  }
  effective: ProjectEffectivePermissions
  projectSpaceId: number
  projectType: number
  bizScene: number
}

type CanvasProjectDraft = {
  id: number
  uuid: string
  projectUuid: string
  createdBy: number
  draftData: string
  viewportX: string
  viewportY: string
  viewportZoom: string
  lastEditedAtMs: number
}

type CanvasNodeRecord = {
  nodeKey: string
  projectUuid: string
  toolId: number
  toolKey: string
  type: number
  name: string
  position: { positionX: number; positionY: number }
  measured: { width: number; height: number }
  data: string
  parentKey: string
  status: number
  createdAtMs: number
  updatedAtMs: number
  workflowUuid: string
  workflowRoot: number
}

type CanvasConnectionRecord = {
  projectUuid: string
  connectionId: string
  source: string
  target: string
  type: string
  deletable: boolean
  selectable: boolean
  createdAtMs: number
  updatedAtMs: number
}
```

观察到节点 `data` 是 JSON 字符串而不是对象；图片节点包含 URL、内容尺寸、资源元数据和
更新时间字段，特效/镜头节点包含封面、版本和适用类型，视频节点包含完整生成参数。
本地 contract 可以使用强类型对象，但外部协议适配器必须承担字符串解析和校验。

## 已观察视频节点数据

```ts
type ObservedVideoNodeData = {
  type: string
  name: string
  url: string[]
  poster: string
  action: string
  generatorType: string
  params: {
    model: string
    prompt: string
    textList: unknown[]
    imageList: Array<{
      nodeId: string
      url: string
      label: string
      width: number
      height: number
      assetId: string
    }>
    videoList: unknown[]
    audioList: unknown[]
    modeType: string
    count: number
    settings: {
      ratio: string
      resolution: string
      duration: number
      enableSound: string
    }
    advancedSettings: {
      search_enabled: number
      autoCompliance: number
    }
    imageListOrder: string[]
    videoListOrder: string[]
    mixedListOrder: string[]
    mixedList: Array<{
      nodeId: string
      url: string
      label: string
      width: number
      height: number
      assetId: string
      mediaType: string
    }>
    ratio: string
    resolution: string
    duration: number
    enableSound: string
    effects: number[]
    lensModels: Array<{
      uuid: string
      versionId: number
      name: string
      imageUrl: string
      sourceNodeId: string
      _fromLensNode: boolean
    }>
  }
  taskInfo: { loading: boolean; taskId: string }
  isStale: boolean
}
```

本次有内容样本确认：

```json
{
  "model": "star-video2-fast",
  "modeType": "mixed2video",
  "count": 1,
  "settings": {
    "ratio": "16:9",
    "resolution": "720p",
    "duration": 15,
    "enableSound": "on"
  },
  "advancedSettings": {
    "search_enabled": 1,
    "autoCompliance": 1
  }
}
```

同一节点还保留了一组顶层 `ratio/resolution/duration/enableSound` 兼容字段，且样本中的顶层
`duration` 与 `settings.duration` 不一致。复刻时以当前 UI 消费的 `settings` 为规范化值，
同时在官网协议适配器中保留旧字段，不能让重复字段直接污染领域模型。

## 草稿与编辑会话

### `POST /api/canvas/project/draft/update`

```ts
type UpdateCanvasDraftRequest = {
  projectUuid: string
  viewportX: string
  viewportY: string
  viewportZoom: string
  draftJson: string
  sessionId: string
  timestamp: number
}
```

```ts
type EmptySuccessResponse = {
  code: number
  data: Record<string, never>
  msg: string
  trace_id: string
}
```

### `POST /api/canvas/project/heartbeat`

```ts
type ProjectHeartbeatRequest = {
  projectUuid: string
  sessionId: string
  timestamp: number
}
```

响应与 `EmptySuccessResponse` 相同。`sessionId` 同时出现在草稿保存和心跳中，说明编辑会话
不能只建模成账户登录状态；本地 mock 需要独立的项目编辑租约/会话场景。

## 任务与 Agent 初始化

### `POST /api/task/generation/progress/batch`

本次请求没有 body，响应为：

```ts
type BatchGenerationProgressResponse = {
  code: number
  data: { success: boolean }
  msg: string
  trace_id: string
}
```

### `GET https://im.liblib.tv/api/v1/project/session/list`

查询参数：`projectId=<PROJECT_ID>`。

```ts
type AgentProjectSessionsResponse = {
  code: number
  message: string
  data: { sessions: unknown[] }
  trace_id: string
}
```

当前项目样本返回空数组；有内容会话字段需在打开 Agent 历史后单动作捕获。

## 对本地实现的直接约束

1. 初始化响应必须同时带权限、同文件夹项目列表、项目元数据、节点和连线；
2. 节点与连接使用稳定 key，连接可单独声明 `deletable/selectable`；
3. 传输层负责解析 `data` JSON 字符串，领域层只接收校验后的判别联合；
4. 画布视口可独立保存，数值在官网协议中以字符串传输；
5. 项目编辑会话需要心跳和过期场景，不能用页面是否登录替代；
6. Agent 会话列表来自独立域，失败时不应阻止工作流画布载入；
7. 视频参数要保留 `mixed2video`、音频开关、合规开关、效果与镜头模型；
8. 重复的新旧参数字段必须在 adapter 中收敛为单一规范值。
