# 视频合成任务生命周期

本地视频剪辑器不会把一次合成当作同步 HTTP 请求。`POST /api/compose` 会持久化一个确定性的任务，随后由 `GET /api/compose/{taskId}` 恢复或轮询状态；页面刷新后仍使用同一 task id。编辑器仅把 `queued`、`rendering` 和 `failed` task id 作为可恢复状态保存；`succeeded` 与 `cancelled` 在展示一次终态后清除该恢复指针，不会在下一次打开时覆盖新的导出。

```text
queued → rendering → succeeded
                   ↘ failed → queued (POST retry)
queued/rendering → cancelled (POST cancel)
```

## 操作

| 操作 | 用途 | 关键不变量 |
|---|---|---|
| `POST /api/compose` | 登记时间线并返回 `ComposeTaskResponse` | 立即返回 task；时间线必须由 `/api/media/` 下、带正时长的本地视频/音频输入规范化而来；尚未产生 Artifact/Asset。 |
| `GET /api/compose/{taskId}` | 刷新恢复、轮询进度或读取终态 | 保持 task id 和 terminal state。 |
| `POST /api/compose/{taskId}` + `{ action: "cancel" }` | 取消 queued/rendering 合成 | 时间线不变；不产生 Artifact 或 Asset。 |
| `POST /api/compose/{taskId}` + `{ action: "retry" }` | 重新排队 failed 任务 | 复用 task id；只允许失败任务重新排队。 |

`failed` task id 是唯一保留给刷新恢复和“重试”的终态；`succeeded`/`cancelled` 清除恢复指针但保留服务端 task 可审计。

浏览器恢复指针使用 `libtv.compose.active-task:{projectId}:{canvasId}` 作为
`localStorage` key，并对 project/canvas id 做 URL 编码；不同画布不会互相恢复任务。
同一画布的多个标签页仍共享一个恢复指针，后续后端接入时应把 task scope 提升到服务端
的 project/canvas/space 归属校验，而不是把 localStorage 当作授权边界。

开发环境切换 mock scenario 会轮换 workspace generation、清理旧 task/成片目录，并让仍在
渲染的旧 worker 丢弃结果；因此旧 scenario 的成片不会写入新 fixture。

`succeeded` 是唯一可以包含 `artifact`、`assetId` 与 `subtitleMode` 的状态。`failed` 是唯一可以包含 `failure` 的状态；`queued`、`rendering`、`cancelled` 不暴露成片。服务端在提交 Asset 前持久化保护位，因此反复轮询或刷新只会创建一个画布产物。

`ComposeRequest` 在 HTTP handler 和 `startComposeTask` 服务边界各解析一次：前者给调用方同步的 `400`，后者保护 fixture runner、队列 worker 等绕过 route 的调用者。文件消失、解码器缺失、超时和渲染失败发生在 task 已创建之后，因此统一收敛为同一 task 的 `failed + failure`，而非把前端时间线回滚。

## Local fixture 与后端交接

当前 renderer、任务文件和媒体文件都位于本地 fixture 存储。未来后端替换为队列、编码器和对象存储时，保留 `ComposeTask`、task id、状态图、取消/重试语义和一次性成片不变量；不要让页面改为轮询真实 provider URL。所有 operation 都采用 workspace 授权，详见 [AUTHORIZATION.md](AUTHORIZATION.md)。
