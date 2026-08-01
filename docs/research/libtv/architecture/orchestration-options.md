# NovaVideo 平台编排方案

状态：方案比较，等待批准后才创建应用脚手架。

## 共同底座

无论采用哪种编排，均保持以下边界：

- Postgres 是项目、workflow revision、AgentRequest、ExecutionSpec、Job、session
  seq、资产元数据、账本、inbox/outbox 的唯一权威。
- Redis 用于 NovaVideo GA 的版本化 command/event 通道、缓存、限流、presence
  和实时 fanout，不保存不可替代的业务历史。
- S3/MinIO 保存上传、隔离、产物和发布媒体，所有访问经过 Asset Service。
- Web 使用 Next.js/React；无限画布使用 `@xyflow/react`，其 ARIA/交互形态与
  已观察页面高度一致；导演台使用 React Three Fiber/Three.js。
- API、Canvas、Policy、Billing、Asset 和 Catalog 首版作为模块化单体内的
  强边界模块；高资源 worker、外部 GA adapter 和媒体处理独立进程。
- pnpm monorepo 共享 contracts、domain、workflow compiler、model registry、
  Redis protocol 和 UI tokens。

## 方案 A：Postgres 事务队列 + Redis 通信

API 在同一事务写 Job、reservation 和 outbox；worker 用 `FOR UPDATE SKIP LOCKED`
领取，Redis Streams 仅连接 NovaVideo GA 及推送实时事件。

优点：

- 基础设施最少，事务不变量清晰，首版最容易正确。
- 本地开发只需要 Postgres、Redis 和对象存储。
- 能先完成画布、资产、模型、公开快照和 OpenAPI/CLI 兼容。

代价：

- 长达分钟/小时的 ReAct、人工确认、timer、补偿和版本升级需要自行实现状态机。
- 高吞吐、复杂父子任务和可视化排障能力弱于专用编排引擎。

适合：快速首版，且短期任务量/团队运维能力有限。

## 方案 B：Temporal + Postgres + Redis 边缘通道（推荐）

Temporal 负责 Agent plan、确认等待、节点子任务、取消、timeout、retry、
reconcile 和补偿；业务对象、账本和消息仍在 Postgres。活动通过 Redis Streams
与 NovaVideo GA 通信，并把带 invocationId 的结果 signal 回 workflow。

优点：

- 最贴合外部 ReAct、多步骤长任务、人工确认、取消和不确定提交恢复。
- timer、retry、child workflow、signal、查询和运行历史是成熟能力。
- Redis 仍是与核心 GA 的通信协议，但不被迫承担账本和业务状态机。

代价：

- 多一套基础设施和 workflow determinism/versioning 学习成本。
- Activity 与数据库事务仍需 inbox/outbox，Temporal 不能替代业务账本。
- 本地/CI 环境更重，需要明确 worker 与 workflow 版本发布策略。

适合：目标确实是完整复刻 LibTV 并长期承载复杂视频生产。本项目目标符合这一
条件，因此推荐方案 B；实现顺序仍从模块化单体和一条端到端流程开始。

## 方案 C：Redis Streams 同时承担队列与编排

全部 command、timer、retry、状态和 fanout 都围绕 Streams/consumer group 自建。

优点：组件数量少，表面上最贴近“通过 Redis 通信”。

代价：需要自行实现 lease/fencing、timer、saga、父子聚合、reconcile、DLQ、
升级兼容、灾备和可视化历史；Redis 裁剪或重建还会威胁公开游标。

结论：不推荐作为完整平台架构。只在范围严格缩小、所有权和故障模型可接受时
使用，且 Postgres 仍必须保存权威状态。

## 推荐 monorepo 边界

```text
apps/
  web/                 Next.js public site + authenticated editor
  api/                 HTTP, auth, policy, domain commands
  realtime/            SSE/WebSocket projection gateway
workers/
  orchestrator/        Temporal workflows and activities
  ga-adapter/          Redis command/event protocol to NovaVideo
  media/               probe, thumbnail, transcode, quarantine
packages/
  contracts/           versioned HTTP/event schemas
  domain/              project, asset, billing, publication rules
  workflow/            editor document -> ExecutionSpec compiler
  model-registry/      model/node/Skill manifests and validation
  redis-protocol/      stream names, envelopes, codecs
  ui/                  shared components and tokens
infra/
  docker/              Postgres, Redis, MinIO, Temporal for local use
```

Web、CLI、OpenAPI 和 GA adapter 只能调用同一 domain command 层。UI 画布保存
`WorkflowDocument`，执行时编译并冻结 `ExecutionSpec`；媒体二进制不进入 Redis
或 Postgres JSON。

## 决策前必须确认

1. 是否接受 Temporal 作为正式依赖；若否，首版采用方案 A，并保留
   `WorkflowOrchestrator` port 方便迁移。
2. NovaVideo GA 已有的 Redis stream/key、消息 schema、消费组、取消和恢复契约。
3. 单租户/多租户、团队角色、目标并发、最长任务时长和可接受 RPO/RTO。
4. 积分是否在本平台记账，还是由 NovaVideo/模型 provider 统一结算。
5. 首个垂直切片选择：推荐“新建项目 -> 文本节点 -> GA 计划/确认 -> 模拟图片
   Job -> Artifact/Asset -> 画布回写”，先不调用付费模型。

## 后续 ADR

- 编排选型与 workflow 版本策略。
- invocation 幂等、不确定提交和 reconcile 协议。
- ActorContext、授权委托与成员撤销策略。
- 双分录账本、报价、预占和结算矩阵。
- Asset 隔离、合规撤销和删除传播。
- Agent OpenAPI/CLI 兼容与版本固定策略。
