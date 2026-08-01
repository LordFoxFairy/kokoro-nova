# ComfyUI 官方源码对照

研究基线：ComfyUI 官方主分支提交 `593786e`，采集日期 2026-07-21。
完整提交链接见下方关键源码。

本页只区分“官方源码事实”和“NovaVideo 复刻建议”。ComfyUI 是单机/桌面 GPU 图执行器，不能直接当作多租户云端架构照搬。

## 值得复用的模型

### 两份图

- 编辑器 Workflow Save Format 保存节点、连线、位置、尺寸、分组、颜色、widgets 和 reroutes。
- 后端 Prompt/API Format 只保留可执行节点、常量输入和 `[sourceNodeId, outputSlot]` 链接。
- NovaVideo 应对应保存可编辑 `WorkflowDocument` 与不可变 `ExecutionSpec`。

官方参考：

- [Workflow JSON v1.0](https://docs.comfy.org/specs/workflow_json)
- [API Format](https://docs.comfy.org/development/api-development/workflow-api-format)
- [validation](https://github.com/comfy-org/ComfyUI/blob/593786e4898780e61c5928bc014b5a9a539e75b5/execution.py#L839-L1242)

### 验证与执行

- 以输出节点为根，反向验证可达上游。
- 验证必填输入、链接槽位类型、常量转换、范围、combo、自定义规则和静态环。
- 拓扑执行支持 lazy dependency；运行时可展开动态子图。
- 复刻首版建议保留反向可达、DAG、类型验证和节点级缓存，暂不开放任意动态子图。

### 事件面

ComfyUI 通过 WebSocket 发出以下事件：

```text
status / execution_start / execution_cached / executing / progress
executed / execution_success / execution_error / execution_interrupted
```

NovaVideo 不应照搬其无回放 WebSocket；事件应进入 Redis Stream，并支持
`lastEventId` 断点续传。`executed` 语义也应拆为明确的 node terminal
event 和 artifact event。

### 缓存

缓存键应由节点类型/版本、规范化输入、有序上游签名、模型/provider/GA
revision、seed 和 runtime namespace 共同组成。媒体和 tensor 进入对象存储，
Redis 只保存元数据与指针。

### 资产

ComfyUI 新资产系统已体现“内容实体”和“文件引用”分离。NovaVideo 应保存内容哈希实体、租户引用、所有者、标签、元数据、缺失状态和任务关联，不能把本地路径当跨服务结果。

## 不应照搬

- 内存优先队列、内存 history 和普通缓存。
- 单 daemon worker。
- 全局 interrupt/client/current-node 状态。
- pending cancel 不保留终态。
- WebSocket 重连不回放丢失事件。
- 插件直接 import 到主 Python 进程且没有权限沙箱。
- 共享本地文件系统和本地路径结果。

## 映射到 TypeScript + Redis + 外部 GA

1. 编辑器提交冻结的 ExecutionSpec、节点包版本、模型 schema 版本和 GA 版本。
2. API 在 Postgres 事务写入 Job、计费 reservation 与 outbox。
3. 批准后由 Temporal 或 Postgres 事务队列编排，不让 Redis 承担业务状态机。
4. Redis Streams 只连接外部 GA；逻辑调用使用跨 attempt 稳定的
   `invocationId`，保存 `remoteJobId` 并在重启后重新 attach/query。
5. node run、Job、Invocation 和 attempt 分别维护状态；结果先完成 artifact
   transaction，再发 terminal event。
6. WebSocket/SSE 只负责持久事件 fanout，不是权威状态存储。

## 关键源码

- [PromptExecutor](https://github.com/comfy-org/ComfyUI/blob/593786e4898780e61c5928bc014b5a9a539e75b5/execution.py#L436-L837)
- [PromptQueue](https://github.com/comfy-org/ComfyUI/blob/593786e4898780e61c5928bc014b5a9a539e75b5/execution.py#L1244-L1393)
- [DynamicPrompt / ExecutionList](https://github.com/comfy-org/ComfyUI/blob/593786e4898780e61c5928bc014b5a9a539e75b5/comfy_execution/graph.py#L21-L278)
- [cache key](https://github.com/comfy-org/ComfyUI/blob/593786e4898780e61c5928bc014b5a9a539e75b5/comfy_execution/caching.py#L82-L148)
- [server / WebSocket](https://github.com/comfy-org/ComfyUI/blob/593786e4898780e61c5928bc014b5a9a539e75b5/server.py#L269-L1210)
- [plugin security](https://docs.comfy.org/installation/install_custom_node)
