# Agent OpenAPI 调用流程

详细端点证据见
[Agent OpenAPI 契约](../references/libtv-agent-openapi/README.md)。

## 官方兼容流程

1. 客户端从安全环境读取 `LIBTV_ACCESS_KEY`，用 Bearer 鉴权。
2. 可先调用 `change-project` 切换当前 project，或沿用 Access Key 绑定项目。
3. 本地文件先调用 `/openapi/upload`，获得 URL 后放入自然语言 message。
4. `POST /openapi/session` 以空对象创建/绑定 session，或同时发送首条消息。
5. 保存返回的 `projectUuid` 和 `sessionId`。
6. 每 8 秒 `GET /openapi/session/{id}?afterSeq=N`，更新已见最大 seq。
7. assistant 消息出现图片/视频 URL 时视为结果；tool 消息还可能提供
   `task_result` 媒体字段。
8. 3 分钟无结果停止；单次错误重试一次，连续三次错误停止。
9. 下载器提取 allowlist URL，并发写入本地目标目录。

## 兼容注意点

- `afterSeq=0` 在官方脚本中会省略查询参数，因此首次请求是全量读取。
- 消息对象是开放 schema；保留未知 role/字段并以 seq 排序去重。
- 轮询是读操作，绝不能再次触发 submit。
- 当前没有正式 Task/cancel/realtime endpoint；本地扩展必须单独版本化。
- README 的旧上传路径只作 alias，源码路径 `/openapi/upload` 为 canonical。
- Access Key、手机号、消息正文和素材 URL 不进入日志、Redis 命令 payload 或
  分析事件。

## 内部映射

兼容层把 session message 映射为 AgentRequest，并在数据库保存外部 session、
project 与内部 Job 的关系。Redis Stream 提供单调事件序号；OpenAPI 响应仍投影
成 message 列表。这样既保留官方轮询契约，也允许 Web 使用可恢复实时事件。
