# 2026-09-03 Text 节点、启动 Workflow 与当前持久化协议

## 捕获条件

- 页面：登录态 Workflow 画布；
- 视口：Chrome `1440 × 900` CSS 像素；
- 动作：新建 Text、展开生成器/模型目录、切换手写模式、实例化三个可逆 starter，并观察保存与报价请求；
- 费用边界：没有确认任何付费生成；
- 隐私：Cookie、Token、账户、空间、项目、节点、组、请求和会话的真实标识均未记录；
- 临时数据：本轮在官网项目留下一个手写 Text、三个 starter 组和一个 Script V2 调研节点，
  等用户在删除动作发生前明确确认后再清理。

## UI 与状态事实

空 Text 提供四个动作，顺序为：

1. `自己编写内容`
2. `文生视频`
3. `图片反推提示词`
4. `文字生音乐`

双击节点后的生成器宽约 `660px`，深色浮层挂在节点空间内。提示词 placeholder 为：

> 写下你想讲的故事、场景或角色设定。例如：一个来自未来的机器人，在城市屋顶看星星。

当前模型目录顺序：

| 显示名 | 耗时 | 描述 |
|---|---:|---|
| GVLM 3.1 | 20s | 多模态文本模型Pro |
| CVLM 5.5 | 10s | 超智能大语言模型 |
| GVLM 3.1 Flash | 15s | 多模态文本模型lite |
| Qwen 3 VL Flash | 10s | Qwen 3 VL Flash |

默认 GVLM 3.1，界面显示 6 积分。手写卡约 `350×200px`，编辑入口为
`输入内容…`，工具栏依次为背景色、标题 1/2/3、正文、粗体、斜体、无序列表、有序列表、
分割线、复制内容、展开编辑。空的关闭态文案为“请编写内容，开始你的创作。”。

## 当前节点批量保存

动作真实触发：

```http
POST https://api.liblib.tv/api/canvas/nodes/batch
Content-Type: application/json
```

脱敏后的顶层结构：

```ts
type CanvasNodesBatchRequest = {
  projectUuid: string
  nodes: Array<Record<string, unknown>>
  connections: Array<Record<string, unknown>>
  version: string | number
  requestId: string
  sessionId: string
  timestamp: string | number
}

type ExternalEnvelope<T> = {
  code: number
  data: T
  msg: string
  trace_id: string
}
```

以上顶层字段和 envelope 为 `shape-confirmed`。标识值只以
`<PROJECT_UUID> / <NODE_UUID> / <REQUEST_ID> / <SESSION_ID>` 表示。

手写 Text 节点的字段投影进一步确认：

```json
{
  "type": 1,
  "data": {
    "action": "text_resource",
    "generatorType": "default",
    "content": ["<PLAIN_TEXT_BLOCK>"],
    "params": {
      "prompt": "",
      "model": "aurora-3-prime",
      "count": 1,
      "textList": [],
      "imageList": [],
      "videoList": [],
      "audioList": []
    }
  }
}
```

数字 `type: 1`、`action`、`generatorType`、content 数组和上述 params 字段属于
当前 payload 事实；本文不推断数字类型的跨版本稳定枚举，也不把官网完整 node 对象直接作为
本地长期领域模型。

该端点与初始化批次中曾观察到的
`POST /api/canvas/project/draft/update` 同时存在：后者保存项目草稿/视口，当前细粒度节点
动作使用 `/api/canvas/nodes/batch`。本地统一归一为 revision-guarded
`POST /api/canvases/{canvasId}`，而不是复制两个上游存储模型。

## 当前算力报价

打开/修改 Text 生成配置时真实观察到：

```http
POST https://api.liblib.tv/api/task/generation/power/calculator
```

响应结构：

```ts
type PowerCalculatorResponse = ExternalEnvelope<{
  power: number
}>
```

请求中观察到 Text provider/model 与生成参数语义；默认条目映射为 provider
`aurora`、model `aurora-3-prime`。账户、团队、节点和请求标识均已替换为占位符。未执行
生成，因此 create/progress/result 仍沿用
[Video 任务客户端协议](2026-09-03-video-task-client-contract.md) 的 bundle 级边界，不在本文
提升证据等级。

## Starter 图拓扑

三个入口都在一次用户动作后创建完整图：

| 动作 | 方向 | 组名 | 观察到的默认 |
|---|---|---|---|
| 文生视频 | Text → Video | `预设 - 文生视频` | Video 提示“根据文字描述生成视频。”；2.0 Fast、16:9、720p、5s、1、静音 |
| 图片反推提示词 | Image → Text | `预设 - 图片反推提示词` | Text 要求结构化中文主体/环境/光影/镜头语言/风格关键词 |
| 文字生音乐 | Text → Audio | `预设 - 文字生音乐` | Mureka V8 音乐节点 |

“文字生音乐”长提示词和三个完整本地 mutation 固定在
[`docs/api/TEXT_AUTHORING_STATE.md`](../../../../api/TEXT_AUTHORING_STATE.md) 及相邻 examples，
避免在证据索引重复维护两份字符串。

## 证据边界与本地归一化

| 内容 | 等级 | 本地策略 |
|---|---|---|
| 四入口、四模型、标签、顺序、手写工具栏 | `interaction-linked`, `shape-confirmed UI` | 固定 role、顺序、状态机和视觉基线 |
| `/api/canvas/nodes/batch` 顶层与手写 Text data | `shape-confirmed` | adapter 投影，不成为 Canvas 内部模型 |
| calculator `data.power` | `shape-confirmed` | 本地 quote 保持两阶段确认 |
| 其他模型价格、字符上限、provider 内部细节 | 本轮未确认 | 使用明确标注的确定性 fixture |
| 付费生成结果、失败、取消 | `COST_GATED` | 本地 Job 场景覆盖，不冒充官网网络事实 |
