# 视频合成任务生命周期

本地视频剪辑器不会把一次合成当作同步 HTTP 请求。`POST /api/compose` 会持久化一个确定性的任务，随后由 `GET /api/compose/{taskId}` 恢复或轮询状态；页面刷新后仍使用同一 task id。

```text
queued → rendering → succeeded
                   ↘ failed → queued (POST retry)
queued/rendering → cancelled (POST cancel)
```

## 操作

| 操作 | 用途 | 关键不变量 |
|---|---|---|
| `POST /api/compose` | 登记时间线并返回 `ComposeTaskResponse` | 立即返回 task；尚未产生 Artifact/Asset。 |
| `GET /api/compose/{taskId}` | 刷新恢复、轮询进度或读取终态 | 保持 task id 和 terminal state。 |
| `POST /api/compose/{taskId}` + `{ action: "cancel" }` | 取消 queued/rendering 合成 | 时间线不变；不产生 Artifact 或 Asset。 |
| `POST /api/compose/{taskId}` + `{ action: "retry" }` | 重新排队 failed 任务 | 复用 task id；只允许失败任务重新排队。 |

`succeeded` 是唯一可以包含 `artifact`、`assetId` 与 `subtitleMode` 的状态。`failed` 是唯一可以包含 `failure` 的状态；`queued`、`rendering`、`cancelled` 不暴露成片。服务端在提交 Asset 前持久化保护位，因此反复轮询或刷新只会创建一个画布产物。

## Local fixture 与后端交接

当前 renderer、任务文件和媒体文件都位于本地 fixture 存储。未来后端替换为队列、编码器和对象存储时，保留 `ComposeTask`、task id、状态图、取消/重试语义和一次性成片不变量；不要让页面改为轮询真实 provider URL。所有 operation 都采用 workspace 授权，详见 [AUTHORIZATION.md](AUTHORIZATION.md)。
