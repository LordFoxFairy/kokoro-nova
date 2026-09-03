# Image 创作、风格、预设与派生工具契约

本页定义画布 Image 节点从编辑器交互到持久化数据的完整契约。所有操作复用
`POST /api/canvases/{canvasId}` 的 revision mutation，不增加仅服务弹窗的临时 endpoint。
这样 Workflow、Storyboard、刷新恢复、撤销/重做和未来真实后端始终读取同一份
`WorkflowDocument`。

## 1. 能力边界

Image 创作面由五类状态组成：

| 状态 | 唯一事实来源 | 说明 |
|---|---|---|
| 输入参考 | `WorkflowDocument.edges` 中 `target = IMAGE_NODE_ID` 的边 | 编译输入和参考卡顺序 |
| 提示词与输出 | `imageNode.data.prompt/output` | 可直接执行的生成快照 |
| 语义预设 | `imageNode.data.extra.imagePreset` | 恢复预设选中态，不替代 prompt/output |
| 风格绑定 | style 节点、style → image 入边、`extra.imageStyle` | 图拓扑是执行事实，metadata 是 UI 索引 |
| 派生工具 | 新 Image 节点、source → derived 入边、`extra.imageTransform` | 非破坏、可追溯、可重放 |

局部元素沿用 `extra.elementMarks` 的归一化区域结构。Image 与 Video 共用画布选取引擎和
边合法性规则，但不会共享临时弹窗状态。

## 2. 图片模型目录

`GET /api/models?media=image&q=` 返回 `ModelDefinition[]`；Image 项必须携带
`imageCapabilities`。完整响应样本见
[`examples/models-image.response.json`](examples/models-image.response.json)。当前冻结目录按 UI 顺序为：

| modelId | 显示名 | 延迟标签 |
|---|---|---|
| `lib-image-2` | Lib Image | 60s |
| `lib-navo-pro` | Lib Navo Pro | 50s |
| `lib-navo-2` | Lib Navo 2 | 25s |
| `seedream-5-pro` | Seedream 5.0 Pro | 20s |
| `midjourney-v8-1` | Midjourney V8.1 | 50s |
| `midjourney-v7` | Midjourney V7 | 50s |
| `midjourney-niji-7` | Midjourney Niji 7 | 50s |

延迟是目录展示标签，不是任务 SLA。真实后端可以更新目录版本与标签，但在同一版本内必须
保持稳定顺序和 capability 矩阵。

## 3. `ImageModelCapabilities` 与输出归一化

```ts
type ImageOutputSpec = {
  quality: 'low' | 'standard' | 'high'
  resolution: '1K' | '2K' | '4K'
  aspectRatio:
    | '1:1' | '1:2' | '2:1' | '9:16' | '16:9'
    | '3:4' | '4:3' | '3:2' | '2:3' | '5:4'
    | '4:5' | '21:9' | '9:21'
  count: 1 | 2 | 4
}

type ImageModelCapabilities = {
  qualities: ImageOutputSpec['quality'][]
  resolutions: ImageOutputSpec['resolution'][]
  aspectRatios: ImageOutputSpec['aspectRatio'][]
  counts: ImageOutputSpec['count'][]
  defaults: ImageOutputSpec
}
```

当前七个模型都暴露完整观察矩阵，默认值为
`standard / 2K / 16:9 / 1`。客户端每次切换模型或修改参数都调用同一归一化规则：

1. 保留新模型 capability 中仍合法的值；
2. 非法或旧版本字段回退到该模型 `defaults`；
3. 丢弃 `durationSeconds/withAudio/mode` 等跨媒体字段；
4. 服务端在创建 Job 前再次归一化，不信任导入草稿。

## 4. 画布参考与局部元素

添加参考只提交 `addEdge`，完整样本见
[`examples/canvas-image-reference-add.request.json`](examples/canvas-image-reference-add.request.json)。
可接受来源由 `image.accepts = text | image | style | effect` 决定；音频、视频、自连和闭环应返回
稳定的 `400` 业务错误。

删除引用提交 `removeEdge`。如果该来源同时被 `elementMarks` 使用，客户端必须在同一 mutation
数组中提交 `updateNode` 清理对应 mark，避免 revision 冲突留下悬挂引用。参考卡按入边在
`document.edges` 中的顺序编号。

## 5. 风格绑定

选择风格是一个原子事务，顺序如下：

1. `addNode` 创建 `type = style` 的节点并保存 `presetId/presetName/hue`；
2. `addEdge` 创建 style → image 依赖；
3. `updateNode` 写入目标 Image 的 `extra.imageStyle`。

```ts
type ImageStyleSelection = {
  nodeId: string
  presetId: string
  name: string
}
```

三个 mutation 必须使用同一个 `expectedRevision` 请求。完整样本见
[`examples/canvas-image-style-apply.request.json`](examples/canvas-image-style-apply.request.json)。
编译器以入边为事实来源；`imageStyle.nodeId` 只用于刷新后直接定位 UI。如果入边不存在，读取端
应忽略该 metadata，而不是静默重建边。

## 6. 图片预设

预设应用在原 Image 节点上，一次更新三个字段：

```ts
data.prompt = preset.promptTemplate
data.output = normalize(preset.output)
data.extra.imagePreset = { id: preset.id, name: preset.name }
```

`prompt/output` 是提交 Job 所需的完整执行快照，`imagePreset` 是可解释的语义来源。后端不应
在执行时按 preset ID 二次查表，否则目录升级会让旧画布产生不同结果。完整样本见
[`examples/canvas-image-preset.request.json`](examples/canvas-image-preset.request.json)。

当前预设目录按四组展示：分镜叙事、质感调节、空间与机位、设定图；目录内容属于前端能力
registry，可在未来迁移到独立 catalogue API，但持久化形状保持不变。

## 7. 非破坏式图片工具

“人像质感调节、全景、多角度、打光、九宫格、高清、元素编辑、图层分离、宫格切分”中的
生成类动作绝不原地覆盖源图。它们创建一个新的待确认 Image 节点，并用入边保留 provenance：

```ts
type ImageTransformSpec = {
  version: 1
  sourceNodeId: string
  tool: string
  label: string
  parameters: Record<string, string | number | boolean | null>
  output: ImageOutputSpec
  credits: number
}
```

派生事务包含 `addNode + addEdge`。新节点的 `data.prompt/output` 是可直接生成的快照，
`extra.imageTransform` 保存重放和审计所需参数。源节点和既有 Artifact 保持不变。完整样本见
[`examples/canvas-image-transform.request.json`](examples/canvas-image-transform.request.json)。

| tool | 典型 parameters |
|---|---|
| `lighting` | `brightness`, `temperature`, `keyAngle`, `rimLight` |
| `multi-angle` | `preset`, `orbit`, `pitch`, `zoom`, `extra` |
| `emotion` | `subject`, `x`, `y`, `emotion` |
| `crop` | `aspect`, `rotation`, `mirrored` |
| `panorama` | `views` |
| `upscale` | 空对象；输出固定提升到高画质 4K |
| `layer-separation` / `grid-split` | 空对象；输出数量由动作决定 |
| `preset` | `presetId` |

`version` 用于未来迁移。读取端遇到未知版本应保留原始 `extra`、显示普通 Image 节点，并停止
自动重放，不能猜测参数意义。

## 8. UI 状态与持久状态

以下内容只属于组件本地状态，不写入 API：当前打开的模型/输出/预设弹层、搜索词、风格分类、
风格收藏页签、工具弹窗步骤以及 hover 状态。以下内容必须持久化：模型 ID、归一化输出、prompt、
图引用、局部元素、预设、风格和派生 provenance。

刷新恢复顺序：

1. 从 `GET /api/canvases/{canvasId}` 取得完整文档与 revision；
2. 用 `modelId + imageCapabilities` 归一化输出；
3. 按入边恢复参考和风格；
4. 用 `imagePreset/imageStyle` 恢复语义标签；
5. 对派生节点严格解析 `ImageTransformSpec.version`；
6. Artifact 存在时显示结果工具条，否则显示生成编辑器。

## 9. 并发、错误与未来后端

- 所有动作遵守 [`WORKFLOW_CONCURRENCY.md`](WORKFLOW_CONCURRENCY.md)；`409` 后刷新并仅重放一次；
- 嵌套 `data` 当前是替换语义，客户端提交 `updateNode.patch.data` 时必须保留未修改字段；
- 风格与派生动作必须原子提交，禁止拆成多个 HTTP 请求；
- 创建 Job 时后端从图边解析真实输入，从 `data.prompt/output` 冻结 `ExecutionSpec`；
- 真实素材上传继续使用 Assets API，不把二进制或短期签名 URL 写进 transform parameters；
- 登录凭证由 transport 层管理，组件和持久化文档不读取、不保存 token。

OpenAPI 对应 schema：`ImageOutputSpec`、`ImageModelCapabilities`、
`ImagePresetSelection`、`ImageStyleSelection`、`ImageTransformSpec`。
