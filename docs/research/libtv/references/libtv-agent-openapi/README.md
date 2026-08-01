# LibTV Agent OpenAPI 与 Skills 契约

研究基线：官方 `libtv-labs/libtv-skills` 仓库提交 `c609246`，以及官方 CLI
页面在采集时解析出的 CLI 版本 `1.1.1`。本页只记录官方客户端公开消费的
契约，不把服务端内部实现推断为事实。

官方入口：

- <https://github.com/libtv-labs/libtv-skills/tree/c609246c1eca69f6bc129bcbb5d64c36734e4a4a>
- <https://www.liblib.tv/cli>
- <https://liblibai-web-static.liblib.cloud/cli/1.1.1/libtv-cli-skill.zip>

## 两套外部边界

LibTV 当前公开了两套目的不同的自动化接口：

1. Agent OpenAPI：以 Access Key 调用 session/message/upload，后端 Agent 解释
   自然语言并产生消息和媒体 URL。
2. CLI 1.1.1：以本地登录态操作 workspace/project/group/node/model 等对象，
   同步等待节点运行终态，并通过 JSON/NDJSON 组合管道。

CLI 文档明确要求调用 CLI，不要自行拼其私有 HTTP；因此复刻时不能把两套接口
混成一个未经版本控制的 endpoint 集合。

## Agent OpenAPI

默认 base URL 为 `https://im.liblib.tv`。JSON 请求使用 Bearer Access Key，
但不得在日志、事件或研究截图中记录明文凭据。

<!-- markdownlint-disable MD013 -->

| 方法与路径 | 请求 | 官方客户端消费的成功数据 |
| --- | --- | --- |
| `POST /openapi/session` | `{ sessionId?, message? }`；空对象只创建/绑定 | `{ projectUuid, sessionId }` |
| `GET /openapi/session/{sessionId}` | 可选 `afterSeq=N`，只返回 `seq > N` | `{ messages: [...] }` |
| `POST /openapi/session/change-project` | `{}` | `{ projectUuid }` |
| `POST /openapi/upload` | multipart `accessKey` + `file`，同时带 Bearer | `{ url }` |

<!-- markdownlint-enable MD013 -->

README 曾写 `/openapi/file/upload`，但当前官方可执行源码请求
`/openapi/upload`。本地兼容层应以前者作为可选 alias，以后者作为源码事实，
不能声称 alias 已由官方服务验证。

## 消息与结果

官方脚本依赖的最小开放形状是：

```ts
type Message = {
  id: string;
  role: "user" | "assistant" | "tool" | string;
  content: string;
  seq?: number;
  [key: string]: unknown;
};
```

增量轮询依赖单调 `seq`。`tool` 消息内容还可能包含
`task_result.images[].previewPath` 与
`task_result.videos[].previewPath|url`；这只是官方客户端消费的形状，不是已
发布的稳定服务端 schema，复刻时必须保留未知字段。

## Session 生命周期

1. Access Key 在服务端绑定当前 `projectUuid`。
2. 创建 session 返回 `sessionId + projectUuid`；可在同一请求附带首条消息。
3. 后续传 `sessionId + message` 追加自然语言轮次。
4. 客户端每 8 秒用 `afterSeq` 增量读取消息，以 assistant 中出现图片/视频 URL
   作为完成信号。
5. 3 分钟无结果停止；单次失败可重试一次，连续三次失败停止。
6. `change-project` 切换 Access Key 当前项目；官方只提到 Redis 缓存会更新，
   没有公开 key、TTL、事务或多设备一致性规则。
7. 上传返回 OSS URL，客户端把 URL 拼入自然语言消息；下载器从消息或 tool
   result 提取 URL 后在本地并发下载。

公开 OpenAPI 没有正式 Task 对象、取消 endpoint、SSE/WebSocket 或计费状态。
NovaVideo 内部可以提供更强的 Job/Stream 状态，但兼容 endpoint 仍应保持上述
轮询语义，并通过版本化扩展暴露新增能力。

## 错误与限制

- JSON GET/POST 超时 30 秒，上传超时 120 秒。
- 非 2xx、网络错误或关键响应字段缺失时，官方脚本退出码为 1。
- 错误 body、malformed JSON 和 timeout 尚未统一成结构化错误协议。
- 文档写上传小于 200 MB，但 Python 客户端没有本地大小校验。
- 下载器默认五线程、单文件 60 秒；部分失败可能仍退出 0。

本地实现应补充统一错误 envelope、correlation id、URL allowlist、上传/下载大小
限制和原子落盘，并明确这些属于安全加固而非官方等价行为。

## CLI 1.1.1 命令面

| 域 | 命令/对象 |
| --- | --- |
| 登录与账户 | `login web/phone`、`logout`、`account info/list/use` |
| workspace | `create/list/update/use/unuse` |
| project | `create/list/update/use/unuse` |
| group | `list/create/use/unuse`、默认查询/创建/绑定、`--run` |
| node | 查询、创建、更新、删除、连线、运行 |
| media/script | `upload`、`image shortcut`、`script storyboard` |
| model | `search` 与完整动态 schema |

节点类型包括 `text/image/video/audio/script/storyboard/video-clip`；
`custom/group` 使用独立命令。stdout 只承载 JSON/NDJSON，stderr 承载上传、
运行和 storyboard 进度。`node --run` 自己提交、轮询并等待终态，外部 Agent
不应看到 task id 后再额外套一层重复轮询。

CLI 本地绑定保存在 `.libtv/project.json`，凭据默认保存在用户配置目录；两者
都只是客户端便利状态，服务端仍须重新校验账户、团队、workspace 和项目权限。

## NovaVideo 兼容建议

- OpenAPI 兼容层只承诺四个公开 endpoint、开放消息对象和 `afterSeq` 语义。
- Redis 保存 session 消息有序流和当前项目热状态，Postgres 保存权威 session、
  message、project 及 Job 映射；不伪造官方未公开的 Redis key/TTL。
- GA adapter 保存 `remoteSessionId/remoteJobId` 和幂等键，重启后重新附着而不是
  重复提交。
- CLI 兼容优先以受控子进程运行官方 CLI 并消费 JSON/NDJSON；私有 HTTP 协议
  未发布前不根据前端代码猜测。
- 分析埋点只记录命令类型、耗时、成功/失败和计数；不发送 Access Key、手机号、
  prompt、消息正文或素材/结果 URL。
