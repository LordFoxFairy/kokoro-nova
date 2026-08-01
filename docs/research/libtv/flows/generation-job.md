# 节点生成任务流程

## 从画布到 ExecutionSpec

1. 用户或 Agent 选定目标输出节点。
2. 服务端从目标反向遍历依赖，只编译可达节点；孤立节点不执行。
3. 校验节点类型版本、输入槽类型、必填参数、模型 mode、上下游媒体数量、
   DAG 环、素材权限和合规状态。
4. 冻结 `workflowRevision`、node type、Skill、model/provider/GA revision、输入
   Asset hash、seed 和计费报价，形成不可变 ExecutionSpec。
5. 任一目标失败时默认拒绝整次提交；若未来支持部分输出，响应必须明确返回
   accepted/rejected targets。

这一层复用 ComfyUI 的“编辑文档与 API 执行图分离”模式，但不复用其内存队列。

## 提交与状态

以下为目标设计，不是 LibTV 官方状态枚举：

```text
QUEUED -> LEASED -> RUNNING -> CANCELLING | RECONCILING
-> SUCCEEDED | FAILED | CANCELLED | COMPLIANCE_BLOCKED | UNKNOWN
```

- API 使用 idempotency key 防止按钮重试或 Agent 轮询产生重复 Job。
- 计费先创建 reservation；入队成功、领取失败和执行失败都必须有对应账本决议。
- 编排器按批准方案选择 Temporal 或 Postgres 事务队列；Redis Streams 只承担
  NovaVideo GA command/event 边缘通道和实时 fanout。
- Job、invocation、attempt、node run、event 和 ledger 在数据库持久化；任何
  worker claim/complete 都需 lease/fencing 或编排器等价保证。
- 外部 provider/GA 保存 remoteJobId；进程重启后重新 attach 或查询，而非重提。

## 事件顺序

建议最小事件：

```text
job.accepted
job.queued
job.leased
job.started
node.started
node.progress*
artifact.preview*
node.succeeded | node.failed
job.cancelling?
job.succeeded | job.failed | job.cancelled
```

每个事件包含 job id、attempt、sequence、correlation/causation id 和时间戳。
WebSocket/SSE 只做持久事件的 fanout，客户端以 `lastEventId` 恢复。`succeeded`
必须晚于结果对象与数据库提交，避免 UI 收到完成却读不到资产。

## 缓存

缓存键至少包含：

```text
nodeTypeVersion + canonicalInputs + upstreamArtifactHashes
+ model/provider/GARevision + seed + runtimeNamespace
```

非确定性外部 GA 默认不缓存；大媒体只缓存对象存储 pointer。缓存命中仍需检查
租户权限、素材有效性和公开许可，不能把另一 workspace 的私有资产直接返回。

## 取消与失败

- pending：从待领队列撤销并写 `CANCELLED` 终态。
- running：进入 `CANCELLING`，向 provider/GA 转发取消，并在节点检查点协作停止。
- worker 失联：lease 过期后创建新 attempt；旧 worker 的 fencing token 失效。
- provider 已完成但回写失败：恢复任务先查询 remoteJobId，再完成 artifact commit。
- 计费：根据实际 provider 接受/完成规则结算，剩余 reservation 明确 release。

当前站内 Job 状态名、错误码、进度精度和失败计费规则仍待真实任务验证。
