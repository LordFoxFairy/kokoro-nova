# Workflow 并发、Revision 与编辑会话

## 三类状态必须分离

| 状态 | 范围 | 持久化位置 |
|---|---|---|
| `WorkflowDocument` | 节点、边、分组和共享视口 | Canvas document |
| 本地编辑历史 | undo/redo 快照与当前选择 | 浏览器内存 |
| Presence/租约 | 光标、跟随、临时视口、编辑会话 | Presence mock/未来实时服务 |

协作光标和“正在跟随谁”不得写进共享工作流；本地选择与面板开关也不得提高 revision。

## Revision 规则

- 新画布 revision 从 `1` 开始；
- 每次成功的共享文档 mutation 加 `1`；
- mutation 请求带客户端最后读取到的 `expectedRevision`；
- 服务端在同一串行事务中比较、应用 mutation、提高 revision 并返回新文档；
- 请求包含多条 mutation 时全有或全无；任一校验失败时 revision 不变；
- 节点任务成功写回 artifact 属于共享文档变化，也会提高 revision；
- 光标、面板、选择和本地拖拽中间帧不提高 revision。

```http
POST /api/canvases/can_video_main
Content-Type: application/json

{
  "canvasId": "can_video_main",
  "expectedRevision": 7,
  "label": "更新视频参数",
  "mutations": [
    {
      "op": "updateNode",
      "nodeId": "node_video_01",
      "patch": {
        "data": {
          "prompt": "镜头缓慢推进"
        }
      }
    }
  ]
}
```

## 409 冲突

目标响应：

```json
{
  "error": {
    "code": "REVISION_CONFLICT",
    "message": "画布版本冲突",
    "details": {
      "canvasId": "can_video_main",
      "expectedRevision": 7,
      "currentRevision": 8
    }
  },
  "requestId": "req_fixture_revision_01"
}
```

客户端恢复算法：

```text
1. 保留产生 mutation 的 produce(document) 回调
2. 回滚失败的乐观文档
3. GET 最新 canvas/document/revision
4. 用最新 document 再执行一次 produce
5. 本地 applyMutations 校验
6. 仅重提一次，expectedRevision 使用最新值
7. 第二次仍冲突时停止自动重放，展示冲突并保留用户输入
```

必须重放“意图函数”，不能直接重发第一次生成的坐标/名称数组；否则两个连续新增动作可能
产生重名、重叠或覆盖别人刚写入的节点。

## 客户端提交队列

同一浏览器内所有画布写入进入一条 Promise 队列。第二个动作只有在第一个动作返回新
revision 后才开始；拖拽移动中的每帧只更新本地位置，落点时提交一次。

```text
UI action A ─┐
             ├─▶ commit queue ─▶ optimistic apply ─▶ POST ─▶ revision N+1
UI action B ─┘                                      └──────▶ revision N+2
```

该队列只解决同一客户端的写入顺序；另一个浏览器、Agent mutation 或任务产物写回仍可能
触发 409，因此服务端 revision 检查不能省略。

## 编辑会话和心跳

官网画布初始化已确认独立 `sessionId`，并用于：

```text
POST /api/canvas/project/heartbeat
POST /api/canvas/project/draft/update
```

本地规范将其建模到 Presence：

```ts
type EditorLease = {
  canvasId: string
  clientId: string
  sessionId: string
  acquiredAt: string
  heartbeatAt: string
  expiresAt: string
  state: 'active' | 'expired' | 'superseded'
}
```

- 打开画布创建或恢复 lease；
- 活跃标签按固定间隔发送心跳；
- 失焦可降低频率，但不伪造用户在线；
- 超过 `expiresAt` 或被同账户新会话接管后，写请求返回 `SESSION_EXPIRED`；
- 页面显示阻断层“会话已过期，请刷新页面”；
- 刷新重新读取文档并建立新 lease；
- lease ID、Cookie 或 token 不进入 `WorkflowDocument`。

`session-expired` 场景固定重放阻断层；`revision-conflict` 场景固定让服务端画布为 revision 8，
客户端基准为 revision 7。

## Agent 与任务写入

Agent 的 mutation proposal 必须在用户确认后转换为同一 `CanvasMutation[]`，并经过同一
`applyMutations` 校验。任务产物写回只允许修改对应节点的 `artifacts/jobId`，仍需提高
revision 并触发客户端刷新；任何路径都不得静默改节点图而不产生版本变化。

## Undo/Redo

- undo/redo 是客户端文档快照，不是服务端版本历史；
- undo 也被转换为普通 mutation 并提交新 revision；
- 刷新后本地 undo 栈清空；
- 已生成 job 和 ledger 不因 undo 删除；
- 删除节点后 job 仍保留审计历史，但后续产物写回不能重新创建已删除节点。

## 测试矩阵

| 场景 | 操作 | 期望 |
|---|---|---|
| 单客户端连续写 | 快速新增两个节点 | 两次成功，revision 连续 +2 |
| 远端领先一版 | 更新节点 | 首次 409，刷新后重放一次成功 |
| 连续冲突 | 重放期间远端再写 | 停止重试，展示冲突 |
| 任务写回竞争 | 用户改提示词同时 job 成功 | 两项变化都保留，客户端重载新 revision |
| session expired | 修改节点 | 阻断写入，刷新后恢复 |
| 跟随视口 | 退出跟随 | 共享 document/revision 不变 |
| 非法循环边 | addEdge | 整批 mutation 失败，revision 不变 |
