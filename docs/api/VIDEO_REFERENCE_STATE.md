# Video 参考、富引用、元素标记与运镜契约

本页定义 Video 节点交互如何落到既有 `POST /api/canvases/{canvasId}` mutation API。
它不新增临时 UI endpoint：图引用、提示词元数据与运镜必须和其他工作流编辑共享 revision、
撤销/重做与冲突恢复。

## 1. 数据所有权

| 数据 | 唯一事实来源 | 用途 |
|---|---|---|
| Video 输入引用 | `WorkflowDocument.edges` 中 `target = VIDEO_NODE_ID` 的边 | 编译、模式资格、运行输入、参考卡顺序 |
| `@` token | `videoNode.data.extra.videoMentions` | 在提示词编辑器重建可视 token；不产生输入 |
| 局部元素 | `videoNode.data.extra.elementMarks` | 描述某一图片引用上的归一化区域 |
| 当前运镜 | `videoNode.data.extra.cameraMove` | 生成提示与 UI 选中态 |
| 运镜收藏 | `videoNode.data.extra.cameraFavorites` | 当前节点/草稿的本地收藏视图 |

`NodeData.references` 仅用于拖入的独立资产或上传，不复制画布节点连线。后端编译时必须先读
图边，再合并显式 `NodeData.references`。

## 2. `VideoReferenceMention`

```ts
type VideoReferenceMention = {
  id: string
  nodeId: string        // 必须指向一条当前入边的 source
  label: string         // 例如“图片 1”
  ordinal: number       // token 插入顺序，从 1 开始；同一 source 可重复
}
```

token 不把标签文本拼入 `data.prompt`。客户端用 `prompt + videoMentions` 重建富编辑器；
provider 侧仍从入边得到真实媒体。这样重命名节点、调整展示文案或删除 token 都不会静默改变
生成拓扑。

## 3. `VideoElementMark`

```ts
type VideoElementMark = {
  id: string
  nodeId: string        // 图片来源节点
  x: number             // 0..1，左上角横坐标
  y: number             // 0..1，左上角纵坐标
  width: number         // 0..1
  height: number        // 0..1
  label: string         // 例如“元素 1”
}
```

服务端接入真实分割能力后，可把 mask 作为资产另行存储，并在此对象增加 mask asset ID；
现有客户端会保留 `extra` 的未知字段。本地 fixture 固定使用
`x=0.22, y=0.18, width=0.44, height=0.58`，保证测试可重复。

## 4. 图引用 mutation

### 添加

添加引用只提交 `addEdge`。服务端使用现有 `canConnect` 等价规则验证媒体类型，并拒绝自连、
不存在节点和闭环。

```json
{
  "canvasId": "can_video_main",
  "expectedRevision": 7,
  "label": "选择视频参考",
  "mutations": [
    {
      "op": "addEdge",
      "edge": {
        "id": "edg_fixture_text_video",
        "source": "node_text_01",
        "target": "node_video_01",
        "createdAt": "2026-09-03T12:00:00.000Z"
      }
    }
  ]
}
```

完整样本：[`examples/canvas-video-reference-add.request.json`](examples/canvas-video-reference-add.request.json)。

### 删除与关联清理

删除来源时，客户端在**同一个请求**中提交：

1. `removeEdge`；
2. `updateNode`，移除所有 `nodeId == SOURCE_NODE_ID` 的 `videoMentions` 和 `elementMarks`。

两步不能拆成两个 HTTP 请求，否则第二步 revision 冲突时会留下悬挂 token。样本见
[`examples/canvas-video-reference-remove.request.json`](examples/canvas-video-reference-remove.request.json)。

## 5. `@` token 与元素标记 mutation

两者都是 `updateNode`，并发送完整 `data` 对象，因为当前 `updateNode.patch` 对嵌套对象采用
替换而不是 JSON Merge Patch。客户端必须保留 `prompt/modelId/output/references/artifacts/jobId`
及其他 `extra` 字段。

[`examples/canvas-video-mention.request.json`](examples/canvas-video-mention.request.json) 展示一次 token
插入。局部元素与之相同，只把对象追加到 `extra.elementMarks`；如果图片尚未连接，应在同一
mutation 数组中先 `addEdge` 再 `updateNode`。

## 6. 运镜

```ts
type VideoCameraState = {
  cameraMove: string | null
  cameraFavorites: string[]
}
```

当前稳定 ID 与 UI 名称由 `src/domain/libraries.ts#CAMERA_MOVES` 定义，共 23 项。选择运镜时：

1. 写入 `extra.cameraMove`；
2. 如果 `data.prompt` 尚不包含该项 `prompt`，追加一行；
3. 在一次 `updateNode` 中提交完整 `data`；
4. 收藏只改变 `cameraFavorites`，不改变当前选中项。

“我的运镜”当前为空 fixture。未来自定义运镜放入 `extra.customCameraMoves` 或独立资源 API；
在后端契约明确前，不复用收藏数组伪装自定义资源。

## 7. 读取与刷新恢复

`GET /api/canvases/{canvasId}` 返回整个 `WorkflowDocument`。客户端按以下顺序恢复：

1. 以入边创建参考卡并按 `edges` 顺序编号；
2. 丢弃或警告指向非入边来源的 token/mark；
3. 从 `videoMentions` 重建富 token；
4. 从 `elementMarks` 重建局部元素 chip/mask；
5. 从 `cameraMove/cameraFavorites` 恢复运镜库状态；
6. 使用入边重新计算模型 mode，而不是信任缓存的 UI 结果。

## 8. 错误与并发

| 情况 | 结果 |
|---|---|
| source/target 不存在 | `400`，节点不存在 |
| 自连 | `400`，不能连接节点到自身 |
| 媒体不兼容 | `400`，返回目标节点不接受的媒体类型 |
| 形成闭环 | `400`，该连线会形成循环依赖 |
| `expectedRevision` 过期 | `409`，客户端刷新后重放一次 |
| 重复 source/target | 幂等抑制，不创建第二条边 |

参考 [`WORKFLOW_CONCURRENCY.md`](WORKFLOW_CONCURRENCY.md) 的 revision 与重放规则。
