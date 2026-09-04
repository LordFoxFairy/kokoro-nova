# Script V2 状态与后端 handoff 契约

> 本文描述当前 frontend-only local mock 的长期契约。它不包含真实 LibTV 凭证，不调用
> LibTV 后端，也不把官网捕获 envelope 当作本地持久化格式。真实后端接入时，先实现同一
> 资源与状态边界，再替换 transport/provider。

## 1. 规范边界

唯一持久化位置是 `WorkflowNode.data.extra.scriptV2`，类型为 `ScriptV2State`，版本固定
为 `1`。旧版 `extra.draft`、`extra.shots`、`extra.assets` 只允许由迁移读取器转换，
新写入不制造第二份 Script 真相。脚本状态与工作流节点、输出节点、普通生成 Job、个人
资产是四类不同对象。

```text
Script V2 node.data.extra.scriptV2
        │  canvas mutation + expectedRevision
        ▼
  WorkflowDocument ──► Storyboard projection
        │
        ├── POST /api/script-v2/quotes       本地报价，无扣费
        ├── POST /api/script-v2/runs         四种 operation 的幂等 run
        ├── GET  /api/script-v2/runs/{id}    queued → running → succeeded
        └── POST /api/script-v2/runs/{id}    cancel / retry
                 │
                 ▼
          结果经 fingerprint + operation 校验后写回
```

## 2. 顶层状态字段

| 字段 | 类型/限制 | 语义 |
|---|---|---|
| `version` | 常量 `1` | 持久化 schema 版本。 |
| `identitySeed` | 非空字符串，最多 200 | 刷新后继续分配稳定 row/asset ID 的本地 seed。 |
| `nextRowOrdinal` | 正整数，且大于 `rows.length` | 下一镜头序号分配器。 |
| `nextAssetOrdinal` | 正整数 | 下一资产序号分配器。 |
| `entry` | `screenplay` / `character` / `manual` / `null` | 进入 Script V2 的入口。 |
| `activeStage` | `shots` / `assets` / `prompts` | 刷新后恢复的当前阶段。 |
| `title` | 最多 500 字符 | 脚本标题，CSV 文件名来源。 |
| `originalStoryText` | 最多 20,000 字符 | 原始故事文本，不用生成结果反推。 |
| `styleDescription` | 字符串最多 20,000 或 `null` | 共享视觉风格上下文。 |
| `rows` | 最多 500 条 `ScriptV2Row` | 密集、一基的镜头列表。 |
| `assets` | `characters`、`scenes`、`props` 三个数组 | 角色/场景/道具资产表。 |
| `generator` | `ScriptV2GeneratorState` | 入口生成器的临时/可恢复状态。 |
| `promptComposer` | `ScriptV2PromptComposerState` | 单镜与批量合成模式及模型。 |
| `promptBatchRuns` | 最多 100 条 `ScriptV2PromptBatchRun` | 双轨提示词批量任务历史与防覆盖上下文。 |

### 2.1 镜头 row

`ScriptV2Row` 要求 `id`、`hiddenUuid`、`shotNumber`、`durationSeconds`、
`plotDescription`、`characters`、`shotSize`、`emotion`、`sceneAssetIds`、`propTags`、
`propAssetIds`、`lightingAndAtmosphere`、`audioEffects`、`dialogue`、
`imageGenerationPrompt`、`videoMotionPrompt`、`imageToVideoMotionPrompt`、
`imageVersions`、`videoVersions`、`colorLabel`、`imagePromptState`、`videoPromptState`、
`textHash`、`payloadHash`。时长是整数 5–15 秒；`shotSize` 为 12 项观察词汇；列表
镜号必须等于数组下标加一。

可选字段：`plotDescriptionEntityRefs`、`videoReference`、`cinematics`、
`dialogueLines`、`voiceover`、`bgm`、`sfx`、`finalImagePromptEntityRefs`、
`finalVideoPromptEntityRefs`、`userEditedImageToVideoMotionPrompt`。`videoReference` 的
`endTime >= startTime`；媒体版本包含 `id`、`url`、可选 `thumbnailUrl`、`createdAt`。
所有文本字段与引用数量上限以 `src/contracts/script-v2.ts` 为准。

### 2.2 资产、生成器和批次

资产必须有 `id`、`role`、`name`、`description`、`source`、`status`、`createdAt`、
`updatedAt`。`role` 是 `character` / `scene` / `prop`；`source` 是 `ai` / `canvas` /
`upload` / `library`；`status` 是 `pending` / `generating` / `ready` / `failed` /
`lost`。可选 `thumbnailUrl`、`linkedNodeId`、`sourceImageRef`、`isPrimary`、`compliance`、
`generation`、`error` 不应被 UI 重新解释成节点状态。

`compliance.state` 为 `pass` / `reject` / `pending` / `expired` / `unknown`。
`generation` 保存 `modelId`、`prompt`、`quality`（low/standard/high）、`resolution`
（1K/2K/4K）和 `aspectRatio`。

`generator` 保存 `modelId`、`prompt`、`translating`、`referenceIds`、`status`
（idle/generating/failed）和可空 `error`。`promptComposer` 保存 `singleMode`、`batchMode`
（smart/auto）及 `modelId`。

`promptBatchRuns` 的每条记录包含 `runId`、`status`（running/completed/failed/cancelled）、
`targetShotIds`、`batchSize`、`batches`、`createdAt`、`updatedAt`。每个 batch 包含
`batchId`、1–20 个 `shotIds`、`status`（pending/submitting/running/succeeded/failed/cancelled），
可选 `taskId`、`error` 和最多 40 条 image/video `requestContexts`。

## 3. 阶段 gate 与提示词状态

| 阶段 | 进入条件 | 完成/前进 gate |
|---|---|---|
| `shots` | `entry` 已选择；手写入口可从空表开始。 | 至少一镜；镜号密集；时长 5–15；必要文本通过 schema。 |
| `assets` | 有可识别故事/角色或手动资产。 | 引用的 asset ID 存在；资产来源和合规状态可显示；缺图的生成动作禁用。 |
| `prompts` | 镜头和资产关系可解析。 | 目标镜头有 image/video track；批量视频只在前置内容完成后启用。 |

| 状态 | 含义 | 允许的写回 |
|---|---|---|
| `none` | 尚无该轨提示词 | 生成后变为 `synced`。 |
| `synced` | 提示词与当前 row 输入 fingerprint 一致 | 可被智能/自动合成替换。 |
| `stale` | row 内容变化，旧提示词仍存在 | 新结果只在 fingerprint 匹配时写回。 |
| `generating` | 该轨正在生成 | 禁止旧轮次覆盖当前输入。 |
| `user_edited` | 用户直接编辑 | 生成器不得静默覆盖。 |
| `user_edited_stale` | 用户编辑后其依赖输入变化 | 需明确用户操作或单镜重算后才更新。 |

## 4. 四个 local API operation

| operationId / 方法 | 请求 | 成功响应 | UI 触发 |
|---|---|---|---|
| `quoteScriptV2` / `POST /api/script-v2/quotes` | 四种 operation 的报价输入；重算带 `shotCount`，资产生成带数量/图片规格。 | `{ quote }`，固定 `priceVersion`，不扣积分。 | 脚本生成、资产识别、提示词重算、AI 资产生成前的报价门。 |
| `createScriptV2Run` / `POST /api/script-v2/runs` | `idempotencyKey`、`canvasId`、`nodeId`、operation-discriminated `input`；`canvasId`/`nodeId` 是本地不透明引用，本地 run route 不读取它们指向的对象。 | `{ run }`，初始 `queued`、`progress: 0`、关联 quote。 | 四种 Script V2 action 提交。 |
| `getScriptV2Run` / `GET /api/script-v2/runs/{runId}` | path `runId`。 | `{ run }`；首次读取 queued→running 48%，再次读取 running→succeeded 100%。 | 任务进度轮询与刷新恢复。 |
| `transitionScriptV2Run` / `POST /api/script-v2/runs/{runId}` | `{ action: "cancel" | "retry" }`。 | `{ run }`；cancel 收敛为 cancelled，retry 从 failed/cancelled 增加 `attempt` 后回到 queued。 | 取消或重试 Script V2 任务。 |

四种 operation 值为：`generate-full`、`recognize-assets-only`、`recompute-prompts`、
`generate-asset`。它们分别返回 `ScriptV2GenerateResult`、
`ScriptV2RecognizeAssetsResult`、`ScriptV2RecomputeResult`、`ScriptV2GenerateAssetResult`；
`ScriptV2Run` 的 `input` 与 `result` 必须由同一个 operation discriminator 配对。

## 5. 批量规则、幂等与 stale writeback

- `recompute-prompts` 单次 `rowIds` 最多 20；官方 adapter 可携带最多 100 个 context shots。
  超过 20 必须由本地拆成多个 batch，单批保持原顺序，`promptBatchRuns` 记录每批状态。
- 批量生图/生视频创建一个 group、每镜一个输出节点和 Script→输出边；拓扑 mutation
  一次提交，用户一次 undo 应移除整批。输出节点后续再进入普通 Jobs ConfirmGate。
- 每次 run 的 `idempotencyKey` 必须由同一逻辑副作用复用；相同 key + 相同 input 返回原 run，
  相同 key + 不同 fingerprint 返回 409。基础设施重试不得分配新 key。
- `inputFingerprint` 是稳定的 Script V2 v1 fingerprint；`operationId` 与
  `requestInputFingerprint` 写入 prompt request context，用于防止迟到结果覆盖。
- run 结果写回前校验 `operation`、目标 `rowId`、当前 row/text/payload fingerprint 和
  当前 canvas revision。任何一项不匹配都丢弃为 stale，不清除当前用户内容。
- 持久化通过 `POST /api/canvases/{canvasId}` 的 `expectedRevision` 乐观锁；revision 冲突
  返回 409，重新 bootstrap 后由用户重试，不能直接覆盖远端/共享文档。

## 6. 错误码与本地 progression

| HTTP | 本地含义 |
|---:|---|
| 400 | JSON 无效。 |
| 404 | `runId` 不存在。`canvasId`/`nodeId` 在 create route 中只是本地引用，不触发查找。 |
| 409 | 幂等 key 输入不一致、run ID 冲突或任务状态不允许当前 transition。 |
| 422 | Zod operation/input/body 不符合严格契约。 |
| 500 | 未分类 mock 运行时异常；不是官网成功/失败证据。 |

本地 run 使用固定时钟和稳定 ID：create 返回 queued；第一次 GET 返回 running/48%；第二次
GET 执行对应 deterministic mock 并返回 succeeded/100%；cancel 在 queued/running 收敛为
cancelled；failed/cancelled 可 retry 为新 attempt。run repository 保证开发热更新后仍能
从同一进程状态读取。

## 7. 实际本地错误状态

Route Handler 当前保留兼容错误体 `{ "error": "message" }`，不会伪造官网的
`code/data/msg/trace_id` envelope。下表是当前本地实际返回的 HTTP 状态；未来统一错误体时
应保持状态语义，再由 client adapter 映射为 [`ERRORS.md`](ERRORS.md) 中的稳定 code。

| 本地 route | 400 | 404 | 409 | 422 | 500 |
|---|---|---|---|---|---|
| `POST /api/script-v2/quotes` | JSON 不合法 | — | — | body/operation 不符合 Schema | 未分类 mock 异常 |
| `POST /api/script-v2/runs` | JSON 不合法 | —（`canvasId`/`nodeId` 只做不透明引用） | 同一 `idempotencyKey` 对应不同输入或本地 run ID 冲突 | body/operation/input 不符合 Schema | 未分类 mock 异常 |
| `GET /api/script-v2/runs/{runId}` | — | `runId` 不存在 | — | — | 未分类 mock 异常 |
| `POST /api/script-v2/runs/{runId}` | JSON 不合法 | `runId` 不存在 | transition 与当前状态不兼容 | action 不符合 Schema | 未分类 mock 异常 |

`quoteScriptV2` 与 `createScriptV2Run` 的 body Schema 使用 422，原因是 route 显式将 Zod
校验失败与 JSON 解析失败区分；这和普通 Jobs 的 400 body 校验不要混用。取消/重试不是
普通 Jobs：Script V2 的非法状态明确返回 409。所有错误体都只包含本地安全 message，不带
Cookie、Authorization、远端 ID 或后端实现细节。

## 8. CSV 与后端交接

CSV 由前端从 `ScriptV2State` 生成，包含镜号、时长、画面、景别、对白、音效、运镜、
双轨提示词和资产表；使用 UTF-8 BOM，正确转义逗号、引号、换行，文件名由 `title` 派生。
CSV 下载不创建 run、不收费、不写回 revision。

后端接入顺序：

1. 保持上述四个 local path、operationId 和 Zod 形状，先实现真实 transport 替换；
2. 在 adapter 层映射官网 `nodes/batch`、power calculator、`script-generate-v2` 和
   `script-recompute-prompts-v2`，不得让组件读取 token；
3. 先验证真实响应通过同一 operation-discriminated schemas，再启用 provider；
4. 将真实持久化接到 canvas revision/lease 事务，按 fingerprint 拒绝 stale writeback；
5. 用 `docs/api/examples/`、scenario 轮询和错误矩阵做消费者契约测试；
6. 真实长任务可替换轮询为 SSE/WebSocket，但资源结构、幂等语义和取消/重试状态保持不变。

完整可执行样本、OpenAPI schema 与官方脱敏证据入口：

- [`openapi.yaml`](openapi.yaml)
- [`examples/script-v2-state.json`](examples/script-v2-state.json)
- [`examples/script-v2-quote.request.json`](examples/script-v2-quote.request.json)
- [`examples/script-v2-quote.response.json`](examples/script-v2-quote.response.json)
- [`examples/script-v2-run.request.json`](examples/script-v2-run.request.json)
- [`examples/script-v2-run.response.json`](examples/script-v2-run.response.json)
- [`../research/libtv/api/captures/2026-09-03-script-v2.md`](../research/libtv/api/captures/2026-09-03-script-v2.md)
