# Generation Job 状态机

## 对象边界

节点的“草稿”不是一个 `GenerationJob`。只有用户点击生成并完成编译/报价后才创建 job：

```text
node draft
    │ createGenerationJob
    ▼
awaiting_confirmation
    │ confirm
    ▼
queued ── provider accepted ──▶ running
  │                               │
  └──────────────┬────────────────┘
                 ▼
      succeeded | failed | cancelled | compliance_blocked
```

终态集合：`succeeded`、`failed`、`cancelled`、`compliance_blocked`。

## 状态定义

| 状态 | progress | startedAt | finishedAt | 节点 jobId | 产物 |
|---|---:|---|---|---|---|
| `awaiting_confirmation` | 0 | `null` | `null` | 当前 job | 无 |
| `queued` | 0 | 非空 | `null` | 当前 job | 无 |
| `running` | 1–99 | 非空 | `null` | 当前 job | 无可用终态产物 |
| `succeeded` | 100 | 非空 | 非空 | `null` | 至少一个 |
| `failed` | 最后进度 | 非空或 `null` | 非空 | `null` | 无新产物 |
| `cancelled` | 最后进度 | 视取消时机 | 非空 | `null` | 无新产物 |
| `compliance_blocked` | 最后进度 | 非空或 `null` | 非空 | `null` | 无可用产物 |

失败不会删除节点上更早的成功产物；它只不写入本次 job 的产物。

## API 动作

### 创建报价

```http
POST /api/jobs
Content-Type: application/json

{"canvasId":"can_video_main","nodeId":"node_video_01"}
```

服务端在创建 job 时冻结：

- `ExecutionSpec`：节点、模型、提示词、输出参数和已解析输入；
- `workflowDigest`：提交时的工作流摘要；
- `Quote`：积分、分项、价格版本和过期时间；
- `invocationId`：本次逻辑副作用的稳定 ID。

创建报价不扣积分、不调用 provider。

### 确认和取消

```http
POST /api/jobs/{jobId}
Content-Type: application/json

{"action":"confirm"}
{"action":"cancel"}
```

POST body 是严格判别联合，只接受 `confirm` / `cancel`；缺失 action、`poll` 或未知 action
返回 `400`，不会隐式确认任务。

轮询固定使用：

```http
GET /api/jobs/{jobId}
```

重复 `confirm` 不产生第二次预留或第二个 invocation。GET 轮询只推进已有 job；进程重启后的
真实 provider adapter 必须用同一 `invocationId` 重挂接，不能重新产生业务副作用。

官网当前生成协议使用 `POST /api/task/generation/progress`，并以数值状态
`0/1/2/3/4` 表示 pending/running/succeeded/failed/timed_out。本地对外 API 有意使用 REST
资源语义：GET 轮询；外部 adapter 在进入 runner 前完成状态和 `taskResult` JSON 归一化。
完整证据见
[`2026-09-03-video-task-client-contract.md`](../research/libtv/api/captures/2026-09-03-video-task-client-contract.md)。

## 允许转移

| 当前 | 动作 | 下一状态 | 副作用 |
|---|---|---|---|
| `awaiting_confirmation` | confirm | `queued` | 校验报价；预留积分；attempt +1 |
| `awaiting_confirmation` | cancel | `cancelled` | 不返还，因未预留 |
| `queued` | provider accepted | `running` | 保存 provider handle |
| `queued` | submit failed | `failed` | 全额返还预留 |
| `queued` | cancel | `cancelled` | 尝试取消；全额返还 |
| `running` | poll progress | `running` | 单调更新 progress |
| `running` | poll success | `succeeded` | 写 job 产物、节点产物、结算账本 |
| `running` | poll failure | `failed` | 写错误、返还预留、清 node jobId |
| `running` | compliance result | `compliance_blocked` | 写原因、返还预留、清 node jobId |
| `running` | cancel | `cancelled` | 取消竞争收敛、返还预留 |
| 任一终态 | poll | 原状态 | 无副作用 |

## 不变量

1. `invocationId` 在所有基础设施重试中不变；
2. job 的 `spec` 和 `quote` 创建后不可变；
3. `progress` 不倒退；
4. 一个 job 最多预留一次、结算一次或返还一次；
5. `reserve + settle/release` 与 status 更新在同一事务收敛；
6. 只有 `succeeded` 写新 artifact；
7. artifact 同时保存在 job 历史和节点最新产物数组；
8. 节点最新产物放在数组头部；
9. 取消与成功竞争时，以服务端首先提交的终态为准；
10. 终态 job 不再被后续 poll 改写。

## 确定性场景

| 场景 | status | progress | balance | error |
|---|---|---:|---:|---|
| `video-awaiting-confirmation` | awaiting_confirmation | 0 | 478 | null（报价已过期） |
| `video-awaiting-valid-confirmation` | awaiting_confirmation | 0 | 478 | null（固定有效报价） |
| `video-queued` | queued | 0 | 408 | null |
| `video-running` | running | 58 | 408 | null |
| `video-succeeded` | succeeded | 100 | 408 | null |
| `video-failed` | failed | 58 | 478 | 生成服务暂时繁忙 |
| `video-cancelled` | cancelled | 58 | 478 | 任务已由用户取消 |
| `video-compliance-blocked` | compliance_blocked | 58 | 478 | 素材合规校验未通过 |

表中余额已包含早前图片产物的 22 积分结算；视频报价为 70 积分。

## UI 映射

| status | 中文标签 | 主动作 |
|---|---|---|
| awaiting_confirmation | 等待确认 | 确认生成 / 取消 |
| queued | 排队中 | 取消 |
| running | 生成中 | 取消；显示进度 |
| succeeded | 生成完成 | 查看、加入时间线、再生成 |
| failed | 生成失败 | 查看原因、重试 |
| cancelled | 已取消 | 重新生成 |
| compliance_blocked | 素材合规校验未通过 | 查看规则、替换素材 |

刷新后 UI 必须从 API 重建标签和可用动作，不依赖组件内定时器记忆。
