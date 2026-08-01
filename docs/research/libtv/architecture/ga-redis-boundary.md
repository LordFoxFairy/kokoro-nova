# GA 与 Redis 执行边界（研究草案）

状态：架构建议，尚未批准实施。

依据：LibTV 登录态行为、官方 CLI 契约、Skill 规范和 ComfyUI
官方源码。公开资料不能证明 LibTV 官方使用 Redis；本页是 NovaVideo
的目标架构建议。

## 边界原则

- GA 负责理解请求、选择 Skill、规划步骤和提出画布 mutation。
- Canvas Mutation Executor 是唯一可写工作流权威存储的服务。
- Generation Gateway/Worker 负责模型与远程 GA/provider 调用。
- Metering/Billing 负责预占、结算和释放积分。
- Asset Service 负责上传、对象存储、合规资产 ID 和媒体元数据。
- API/BFF 负责认证、团队 scope、限流和 WebSocket/SSE。
- Compatibility Gateway 负责公开 Agent OpenAPI 与 CLI adapter，不把两者的
  身份、生命周期和错误协议混在核心领域模型中。

GA 不持有用户凭据，不直接写数据库，不直接扣费，也不把 Redis 当长期权威数据库。

## 命令信封

建议所有跨服务命令至少包含不可变身份与服务端签发的 actor reference：

```json
{
  "messageId": "uuid",
  "correlationId": "uuid",
  "causationId": "uuid",
  "actorContextId": "server-issued-reference",
  "workspaceId": "uuid",
  "projectId": "uuid",
  "expectedVersion": 12,
  "invocationId": "stable-logical-side-effect-id",
  "attemptId": "replaceable-worker-attempt-id",
  "commandType": "canvas.plan.apply",
  "payload": {},
  "createdAt": "RFC3339"
}
```

`actorContextId` 不是客户端声明的 user/team 字段，而是入口服务签发、可撤销、
绑定 subject、认证方式、membership/policy version、delegation 和费用上限的引用。
消费方仍按资源关系重新判权。敏感令牌不进入消息体；worker 只通过受控
credential reference 获取短期、动作白名单和 workspace 限定的 capability。

## Redis Streams 边缘通道

Redis Streams 用于 NovaVideo GA 跨进程通信和实时 fanout，不作为内部 Job
编排器或业务历史。建议版本化 channel：

- `ga.command.v1`
- `ga.event.v1`
- `realtime.event.v1`

GA adapter consumer group 的 pending entry、claim、retry 和 DLQ 必须可观测。
Postgres inbox/outbox 保存消息、去重键、payload hash 和处理结果；
终态不能只依赖 Redis 消息存在。需要明确 stream trimming、PEL reclaim、consumer
ownership、背压、poison message、DLQ replay 权限和灾备 RPO/RTO。

公开 Agent OpenAPI 的 `afterSeq` 由 Postgres 在 session 事务内分配单调 `BIGINT`
序号；Redis Stream 只携带该 seq 做 fanout，不能把可裁剪、可重建的 Stream ID
暴露成持久游标。`accessKey -> activeProjectUuid` 只作为带 CAS/epoch 的热状态；
创建 session 后必须冻结实际 project，避免多个客户端切换时串项目。

## Job 状态

### Agent 请求

```text
RECEIVED -> PLANNING -> AWAITING_CONFIRMATION -> APPLYING -> GENERATING
-> COMPLETED | PARTIAL_FAILED | FAILED | CANCELLED | REJECTED | EXPIRED
```

### 执行任务

```text
QUEUED -> LEASED -> RUNNING -> CANCELLING | RECONCILING
-> SUCCEEDED | FAILED | CANCELLED | COMPLIANCE_BLOCKED | UNKNOWN
```

claim、heartbeat、complete 带 fencing token，防止过期 worker 写回新 attempt。
`invocationId` 标识一次逻辑外部副作用，在所有基础设施 attempt 间保持不变；
provider 支持幂等时始终发送 invocationId。请求超时且无法确认 provider 是否
已接受时进入 `RECONCILING/UNKNOWN`，先 attach/query，不能自动再次提交。
fencing token 只能阻止旧 worker 回写，不能撤销 provider 已执行和已扣费的调用。
取消 pending/running、迟到成功以及 cancel-vs-success 竞争都要保留明确终态。

## 最小持久对象

- workspace / project / workflow revision
- node / edge / group
- execution snapshot
- agent request / plan / confirmation
- job / invocation / attempt / node run / reconciliation
- artifact / tenant asset reference / compliance grant
- session message with seq / inbox / outbox / event projection
- model schema / node type / Skill version
- immutable ledger entry / reservation / quote / settlement

## 计费不变量

- 使用不可变双分录账本，`logicalChargeId` 唯一，重复 webhook/attempt 不重复扣费。
- reservation、Job/Invocation 创建与 outbox 必须在同一数据库事务提交。
- quote 冻结价格版本、有效期、余额池消耗顺序和最大金额；计划、模型或资产
  变化会使确认失效并重新报价。
- provider 成本账与用户积分账分离，通过 reconciliation 对账。
- 明确定义取消后完成、迟到结果、部分成功、缓存命中、provider 已扣费但无结果
  等结算矩阵；release 不能靠定时任务猜测。

## 资产与合规生命周期

```text
STAGING -> QUARANTINED -> COMMITTED -> REVOKED | DELETED
```

上传先进入隔离区，经过 MIME/大小/恶意内容/人像与版权策略后才能 COMMIT。
对象存储提交、Asset 元数据和 outbox 需要可恢复的 saga，并有孤儿清理、合法保留、
加密 key、引用计数和删除传播。合规撤销必须反向失效缓存、公开快照、克隆引用
及未来执行，不能只修改一个 Asset 状态字段。跨租户内容去重不能泄漏 hash 命中。

## 外部 GA 与兼容接口

- NovaVideo GA 使用版本化 command/event envelope 与平台通信，不直接依赖 Web
  页面或 CLI 本地绑定文件。
- 外部 GA 调用保存 `invocationId`、`remoteSessionId`、`remoteJobId`、capability
  与 attempt；恢复时重新附着已有远程任务，禁止因轮询超时重复提交。
- Agent OpenAPI 兼容层保持 session/message/upload/change-project 四个公开
  endpoint 与 `afterSeq` 行为，内部可映射到更丰富的 Job 状态机。
- CLI 1.1.1 的私有 HTTP 未发布；兼容时优先受控执行官方 CLI 并消费
  JSON/NDJSON，而不是根据前端 bundle 猜接口。
- GA/分析埋点是旁路观测，不记录 Access Key、手机号、prompt、消息正文、
  素材 URL 或结果 URL，埋点失败不影响业务执行。
- 向外部 GA 发送 prompt/媒体属于数据出境，需 tenant/provider/region allowlist、
  内容最小化、受控下载代理、短期签名 URL、保留/删除传播和审计，不写日志并
  不代表可以无条件发送。
- CLI/Skill 固定版本与 checksum，在每任务隔离容器运行，限制文件系统、CPU、
  内存、输出大小、超时和网络出口，不共享用户 HOME 或凭据目录。

## 可复现性

ExecutionSpec 保存 workflow digest、节点包/Skill/model schema digest、runtime
image digest、provider 实际模型 ID、模板版本和输入 Asset version。确定性本地
节点可重放；远程非确定性生成只能承诺审计可追溯，不能承诺位级复现。

## 首版取舍

首版建议支持：版本化静态 DAG、子工作流、确认门、节点级任务、
持久事件、幂等重试、对象存储资产和当前页面需要的基础节点。

首版暂缓：任意运行时动态图扩展、第三方代码直接进主进程、
复杂多人实时协同和自动化付费生成默认开启。

编排与基础设施方案比较见 [orchestration-options.md](orchestration-options.md)。
