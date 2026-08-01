# 架构

本文描述代码里**已经实现**的模型。所有断言都可以在引用的文件里核对。

---

## 1. 对象模型

全部类型定义在 `src/domain/types.ts`。

```
Space ─┬─ Folder ──┐
       │           ├─ Project ─── Canvas ─── WorkflowDocument
       └───────────┘                              ├─ WorkflowNode[]
                                                  ├─ WorkflowEdge[]
                                                  ├─ WorkflowGroup[]
                                                  └─ Viewport
```

### Space

`{ id, name, createdAt }`。租户/工作空间边界：`Folder`、`Project`、`Asset`、`LedgerEntry`、`AgentSession` 都带 `spaceId`，积分余额也按 space 记（`WorkspaceState.balances: Record<spaceId, number>`）。

当前实现只有一个种子 space，常量 `DEFAULT_SPACE_ID = 'sp_default'`（`src/server/store.ts`），没有创建 space 的接口，也没有用户/鉴权概念。类型上是多租户的，运行时是单租户的。

### Folder

`{ id, spaceId, name, coverUrl, createdAt, updatedAt }`。只有一层，文件夹不能嵌套文件夹（`Folder` 没有 `parentId`）。项目通过 `Project.folderId` 归属，`null` 表示在根层级。

删除文件夹会**连带删除**里面的项目和这些项目的画布，因此 `DELETE /api/folders/[folderId]` 强制要求 query 参数 `confirmName` 与文件夹名完全一致，服务端二次校验（`src/app/api/folders/[folderId]/route.ts:39`）。

### Project

`{ id, spaceId, folderId, name, coverUrl, createdAt, updatedAt, canvasIds }`。

`canvasIds` 是**有序**数组，顺序即画布切换器里的顺序，同时也是「这个项目拥有哪些画布」的权威来源——`canvasesOfProject()` 按 `canvasIds` 顺序去 `state.canvases` 里查，查不到就跳过。也就是说 `Canvas.projectId` 是反向指针，`Project.canvasIds` 才是正向关系。

新建项目一定带一个名为「画布 1」的画布；项目的最后一个画布不允许删除（`DELETE /api/canvases/[canvasId]` 返回 400）。

### Canvas

`{ id, projectId, name, revision, createdAt, updatedAt, document }`。

`revision` 是**乐观锁版本号**，不是版本历史。新建画布从 `1` 开始，每次成功写入 `+1`。它没有对应的历史文档快照，只用来检测「客户端手里的文档是不是最新的」。

### WorkflowDocument

```ts
{ schemaVersion: number, nodes: WorkflowNode[], edges: WorkflowEdge[],
  groups: WorkflowGroup[], viewport: { x, y, zoom } }
```

`WORKFLOW_SCHEMA_VERSION = 1`。文档内嵌在 `Canvas` 里整体存取，不是独立表。

**文档必须是 DAG**：`applyMutations` 在 `addEdge` 时调用 `wouldCreateCycle()`，成环直接抛 `MutationError`。这是硬约束，因为编译器要靠拓扑关系解析上游输入。

### WorkflowNode

```ts
{ id, type, name, position, size, groupId, keyElement, createdAt, updatedAt, data }
```

`type` 取自 `NODE_TYPES`（`src/domain/nodes.ts`）：`text` `image` `video` `videoComposite` `director` `audio` `script` `scriptLegacy` `style` `effect` `assetLibrary`。

`data: NodeData` 刻意是一个**弱类型包**（`prompt?` `modelId?` `output?` `references?` `artifacts?` `jobId?` `extra?`）而不是判别联合。原因写在类型注释里：校验的归属方是编译器 `compileNode`，不是 UI。UI 可以往 `extra` 里塞任何节点私有状态（脚本节点的分镜阶段、导演台的场景参数、合成节点的时间线），编译期只读它认识的字段。

`NODE_META` 声明每类节点的 `produces` / `accepts` / `storyboardColumn`，`canConnect()` 用它做连线合法性判断。`assetLibrary` 是多态的——它输出什么取决于绑定资产的 kind，所以 `canConnect` 接受第三个参数 `sourceAssetKind`，`applyMutations` 从 `node.data.extra.assetKind` 取值传入。

### WorkflowEdge

`{ id, source, target, createdAt }`。没有 handle/port 概念，一个节点只有一进一出的语义端口。同一对 `(source, target)` 重复连接不报错，直接静默忽略（`src/domain/mutations.ts:86`）。

### WorkflowGroup

`{ id, kind: 'normal' | 'storyboard', name, nodeIds, createdAt, storyboard? }`。

关系是**双向冗余**的：`WorkflowGroup.nodeIds` 与 `WorkflowNode.groupId` 同时维护，`applyMutations` 负责保持一致：

- 一个节点最多属于一个分组：`addGroup` 会先把新成员从旧分组里摘掉；
- 摘完后成员为空的分组会被删除；
- `removeNode` 同时清理分组成员表并删掉变空的分组；
- `removeGroup` 带 `deleteNodes` 标志，决定是解散分组还是连节点一起删。

`kind: 'storyboard'` 的分组多一个 `storyboard: { aspectRatio, grid: {rows, cols}, showSequenceNumbers }` 配置。普通分组转分镜组的准入条件在 `canConvertToStoryboardGroup()`：**至少 2 个成员，且至少 2 个成员已经有 image 产物**。判据是「组里有可用的图片输出」，与节点类型和连线数量无关。

---

## 2. 可编辑文档 vs 冻结的 ExecutionSpec

这是整个系统最重要的一条分界线。

`WorkflowDocument` 是**活的**：用户随时可以改提示词、换模型、拖连线。而一次生成必须对着一个**不会再变**的输入。`compileNode(doc, nodeId)`（`src/domain/compile.ts:86`）就是这条边界：

```ts
compileNode(doc, nodeId) -> { spec: ExecutionSpec, quote: Quote }
```

`ExecutionSpec` 里没有任何指回文档的活引用：

```ts
{ workflowDigest, nodeId, nodeType, modelId, prompt, output, inputs }
```

编译时做的事：

1. **校验模型**：`data.modelId` 必须存在且在 `MODELS_BY_ID` 里，否则抛 `CompileError`。
2. **解析输入**（`resolveInputs`）：遍历上游节点，
   - 上游是文本类 → 取它的 `data.prompt`（trim 后非空才算）；
   - 上游是 `style` / `effect` → 取 `data.extra.presetId`；
   - 上游是图/视频/音频 → 取 `data.artifacts[0].url`，也就是**最新一次产物的 URL**，不是节点引用；
   - 再加上 `data.references` 里 `origin !== 'node'` 的拖入引用（边已经覆盖了 node 来源），这些项的 `value` 是 `refId` 而不是 URL，`fromNodeId` 为 `null`。
3. **合成提示词**：本节点 `prompt` 与所有上游文本输入用换行拼接。`videoComposite` 和 `director` 不要求提示词；其余节点如果既没有有效提示词也没有媒体输入，抛 `CompileError`。
4. **收敛视频模式**：`availableVideoModes()` 根据实际连了几个图/视频上游推导出可用模式（1 张图 → `first-frame`，2 张图 → `first-last-frame`，有视频上游 → `video2video`）。如果节点上存的 `output.mode` 不在可用集合里，就取集合的最后一项。**模式是从图结构推导出来的，不是用户自由选的。**
5. **计价**：`quoteCredits(modelId, output)` 给出 `credits` 与逐项 `breakdown`。
6. **摘要**：`workflowDigest` 是对 `nodes.map(n => [id, type, data])` 与 `edges` 做的确定性非加密散列，用于审计——事后可以判断「这次生成对应的画布长什么样」。

编译结果被整体拷进 `GenerationJob.spec`。之后文档怎么漂移都与这次任务无关：provider 只看 `spec`，账本只看 `quote`。这也是重放/审计的基础——job 是持久的，文档不是。

`runnableNodes(doc, ids)` 就是「哪些节点现在能跑」：对每个 id 试着 `compileNode`，不抛异常即可运行。批量执行和快捷键用它决定按钮的可用状态。

---

## 3. 故事板是投影，不是第二份文档

`src/domain/storyboard.ts` 是一个**纯函数模块**，唯一的入口是：

```ts
projectStoryboard(doc, modelLabelOf) -> { audio: Card[], text: Card[], image: Card[], video: Card[] }
```

它不持有状态、不写任何东西、不产生 id、不调 API。四列直接来自 `NODE_META[type].storyboardColumn`；`storyboardColumn === null` 的节点（`style` / `effect` / `assetLibrary`）压根不出现在故事板里。

为什么必须是投影而不是第二份文档：

- **切视图不能丢结构**。如果故事板是独立文档，工作流→故事板→工作流的往返就需要一套双向同步，而分镜里没有「连线」这个概念，回程必然有信息损失。做成投影后，`viewMode` 只是 zustand 里的一个字段（`src/lib/editor-store.ts`），切换不触发任何网络请求，也不可能产生分歧。
- **不存在同步冲突**。文档只有一份，`revision` 也只有一份。
- **卡片顺序稳定**：按 `createdAt` 再按 `id` 排序，重渲染时卡片不会跳位。

投影里几个派生字段值得注意：

- `pending = artifacts.length === 0`，即「还没生成」，与任务状态无关；
- `videoKind`：`videoComposite` 节点是「成片」，上游含视频节点的 `video` 节点也算「成片」，其余是「片段」。所以**筛选类型（成片/片段）与生成状态是两个独立维度**，一个还没生成的合成节点仍然归入「成片」；
- `references`：先按入边回溯到源节点（`origin: 'node'`，`refId` 是源节点 id，所以详情抽屉能跳回源节点而不是跳到一份媒体拷贝），再加上非 node 来源的拖入引用。

---

## 4. Artifact 与 Asset

两个**不同**的对象，不要混。

| | `Artifact` | `Asset` |
| --- | --- | --- |
| 归属 | 一次生成任务（`jobId` 必填） | 一个 space（`spaceId` 必填） |
| 语义 | 「这次跑出来的东西」 | 「素材库里可复用的条目」 |
| 生命周期 | 随 job 产生，不可变 | `staging → committed → revoked` |
| 额外字段 | `modelId`（provider 实际用的模型，用于复现）、`assetId`（登记后回填） | `namespace: personal \| agent`、`tags`、`folderId`、`sourceArtifactId` |
| 存放位置 | `GenerationJob.artifacts` **且**拷贝到 `WorkflowNode.data.artifacts` | `WorkspaceState.assets` |

`Artifact` 会被存两处：job 上一份（历史），节点 `data.artifacts` 上一份（**最新的在数组头部**，`writeArtifactsToNode`）。编译时只取 `artifacts[0]`，即上游的最新产物。

产物变成资产要显式登记：`POST /api/assets { artifactId, name?, namespace?, tags? }`。这一步对 `sourceArtifactId` 幂等（已登记过就返回既有 asset），并把 `artifact.assetId` 回填。生成产物直接落 `state: 'committed'`——它从没离开过平台，不需要隔离审查。

> `namespace` 区分 `personal` 与 `agent` 是刻意的：Agent 的产出不会静默混进用户的个人素材库。

### 生成历史 vs 文档版本

这是两条**完全不同**的时间线：

- **生成历史**：`state.jobs` 只追加，每个 job 冻结了当时的 `spec`（含 `workflowDigest`）、`quote`、`artifacts`、`attempt`、时间戳。这条线是持久的、可审计的，删除节点也不会删掉它对应的 job。
- **文档版本**：只有 `Canvas.revision` 一个单调递增的整数，**没有保存任何历史文档快照**。撤销/重做栈（最多 50 帧，`UndoFrame { label, before, after }`）活在客户端内存里，刷新页面就没了。

所以：能回答「这张图是用什么参数、什么模型、花了多少积分生成的」；**不能**回答「上周三这块画布长什么样」。

---

## 5. 唯一写入路径

### 5.1 applyMutations 是文档的校验型 reducer

`src/domain/mutations.ts` 导出：

```ts
applyMutations(doc: WorkflowDocument, mutations: CanvasMutation[]): WorkflowDocument
```

它先深拷贝入参，逐条应用，任何一条不合法就抛 `MutationError`——因为是在拷贝上操作，**抛异常时原文档一个字节都没被改**，天然全有或全无。

`CanvasMutation` 九个 op：`addNode` `updateNode` `removeNode` `addEdge` `removeEdge` `addGroup` `updateGroup` `removeGroup` `setViewport`。

它强制的不变量（前面已经提过的分组一致性之外）：

- `addNode` 的 id 不能重复；
- `updateNode` / `updateGroup` 无论 patch 里写了什么都**不允许改 id**（`Object.assign(node, patch, { id: node.id, … })`）；
- `addEdge` 校验 `canConnect` 与无环，自连直接拒；
- `removeNode` 级联清理边和分组成员。

领域层和 UI 层用的是**同一份实现**：客户端 import 它做本地校验和乐观更新，服务端 import 它做权威校验。校验逻辑不存在两份、也就不会漂移。

### 5.2 服务端：乐观锁与 409

`POST /api/canvases/[canvasId]` 是画布文档的写入端点（`src/app/api/canvases/[canvasId]/route.ts:33`）：

```ts
{ canvasId, expectedRevision, mutations, label }
```

在 `withState` 的串行化事务里：

1. 若 `typeof expectedRevision === 'number'` 且不等于 `canvas.revision` → 抛 `HttpError(409, …)`；
2. `canvas.document = applyMutations(canvas.document, mutations)`——校验失败在这里抛，此时 revision 还没动；
3. `canvas.revision += 1`，刷新 `updatedAt`，同步刷新所属项目的 `updatedAt`；
4. 返回 `{ revision, document }`。

注意第 1 步的类型判断：**`expectedRevision` 缺省或不是数字时，乐观锁检查会被整个跳过**，写入无条件生效。这是一个有意的逃生口，但也意味着任何客户端都可以绕过冲突检测。

Agent 的提案走另一条路径但仍然经过同一个 reducer：`PATCH /api/agent/sessions/[sessionId]/messages` 且 `action: 'apply'` 时，直接在 `withState` 里调 `applyMutations` 并 `revision += 1`。它不经过上面的 HTTP 端点，因而**没有** `expectedRevision` 检查——Agent 的写入总是基于服务端当前文档。

### 5.3 唯一路径的例外：runner 的产物回写

老实说清楚：`src/server/generation/runner.ts` 有三处**不经过 `applyMutations`** 的直接字段写入：

| 位置 | 写什么 | 是否 `revision += 1` |
| --- | --- | --- |
| `createJob` | `node.data.jobId = job.id` | 否 |
| `writeArtifactsToNode`（poll 成功时） | `node.data.artifacts` 前插 + `jobId = null` | **是** |
| `clearNodeJob`（poll 失败/合规拦截/取消时） | `node.data.jobId = null` | 否 |

这样设计的理由是这些写入只碰 `node.data` 的两个字段、不改图结构，因此不需要图校验。代价是：产物回写会顶掉客户端的 `revision`，客户端下一次提交会撞 409；这正是 `editor-store` 保留 409 重放逻辑的原因之一。而 `createJob` / `clearNodeJob` 不改 revision，意味着客户端本地文档里的 `data.jobId` 可能与服务端不一致——客户端因此不依赖它，而是单独维护 `jobs` 数组（`upsertJob`）。

### 5.4 客户端：commitWith 把写入串成一条队列

`src/lib/editor-store.ts` 里有一个模块级的 `commitQueue: Promise<void>`。所有画布写入都排进这条链：

```ts
commitWith(produce: (doc) => CanvasMutation[], label): Promise<boolean>
commit(mutations, label) === commitWith(() => mutations, label)
```

`produce` 是个**回调而不是现成的数组**，这一点是关键：它在这次写入**真正开始执行的时刻**才被调用，因此能看到前面所有排队写入的结果。节点自动摆位（找空位）和自动命名（「图片节点 3」）都依赖这个，否则连点两次「新增节点」会得到两个重名、重叠的节点。

一次 `attempt` 的完整流程：

1. 读当前 `{ canvasId, revision, document }`；
2. `produce(document)` 得到 mutations，空数组直接返回 `false`；
3. **本地先 `applyMutations` 校验**——非法编辑立刻弹 toast、不发请求，用户马上知道原因；
4. 乐观地 `set({ document: optimistic })`；
5. `POST /api/canvases/:id` 带上第 1 步读到的 `revision` 作为 `expectedRevision`；
6. 成功 → 用服务端返回的 `document`/`revision` 覆盖本地，压一帧 `UndoFrame { label, before, after }`（上限 50 帧），清空 redo 栈；
7. 失败 → 先把 `document` 回滚成乐观更新之前的值；若是 `ApiError` 且 `status === 409` 且这是第一次尝试 → `reloadCanvas()` 拉最新文档，然后**用同一个 `produce` 重放一次**（`attempt(true)`）；其它错误弹 toast 返回 `false`。

序列化的必要性：两个 UI 动作前后脚发出时，如果并发，两者会读到同一个 `revision`，后到的必然 409，用户的第二次编辑就丢了。排队之后，第二次写入读到的是第一次写完之后的 `revision`。真正的 409 只会来自另一个并发编辑者（或 5.3 的产物回写），这时才走「rebase + 重放一次」。

拖拽过程中的高频位置更新走 `patchLocal`，只改本地文档、不发请求；落点确定后才 commit 一次。

撤销/重做不重放反向操作，而是用 `documentReplaceMutations(current, target)` 把「让文档变成 target 的样子」表达成一串常规 mutation（先拆分组、拆边、删多余节点，再逐个 add/update 回去，最后 `setViewport`），照样走服务端端点接受校验。快照式撤销比逐 op 求逆更难写错。

---

## 6. 任务状态机

状态定义在 `JobStatus`，转移全部实现在 `src/server/generation/runner.ts`。

```
                       createJob
                          │
                          ▼
              ┌── awaiting_confirmation ──┐
     cancelJob│                           │confirmJob
              ▼                           ▼
          cancelled                    queued ──(provider.submit 抛错)──▶ failed
        （未预留，无需返还）              │
                                        │ submit 成功
                                        ▼
                                     running ──┬─▶ succeeded
                                        ▲      ├─▶ failed
                                pollJob ┘      ├─▶ compliance_blocked
                                               └─▶ cancelled
```

终态：`succeeded` `failed` `cancelled` `compliance_blocked`（`isTerminal()`）。

各转移的语义：

- **`createJob`** — 编译 + 报价，落一条 `awaiting_confirmation` 的 job，把 `node.data.jobId` 指过去。**不扣钱，不调 provider**。`invocationId` 在这里生成一次，之后跨所有基础设施重试都不变。
- **`confirmJob`** — 只接受 `awaiting_confirmation`（已经启动过就原样返回）。先校验报价没过期（`quote.expiresAt`，签发时 = 现在 + 10 分钟），过期抛错。然后在**同一个 store 写事务里**完成「预留积分 + 状态置 `queued` + `attempt += 1` + 记 `startedAt`」——预留和状态迁移必须一起提交，否则会出现「扣了钱但状态没变」或反之。事务提交后才调 `provider.submit()`；成功则把 handle 存进内存表并把状态推到 `running`（仅当它还是 `queued`），失败则置 `failed` 并**全额返还**（提交从未发生）。
- **`pollJob`** — 已是终态或还在 `awaiting_confirmation` 直接返回。若内存 handle 表里查不到（进程重启过），**不重新提交业务，而是用同一个 `invocationId` 再调一次 `submit()` 去重新挂接**——provider 是「副作用是否已发生」的唯一权威，重新提交对真实 provider 意味着重复计费。重挂接失败则置 `failed` 并全额返还。拿到 provider 状态后在一个写事务里对账，事务开头会再检查一次终态（并发轮询可能已经写过）。
- **`cancelJob`** — `awaiting_confirmation` 时直接置 `cancelled`，**不做返还**，因为从来没预留过。否则尽力调 `provider.cancel()`（异常吞掉），然后走 `pollJob` 让状态机统一收敛。

终态的副作用（都在 `pollJob` 的同一个写事务内）：

| 终态 | 产物 | 账本 | 节点 |
| --- | --- | --- | --- |
| `succeeded` | 补齐 `id`/`jobId`/`assetId=null`/`createdAt` 后写进 `job.artifacts` | `settle` | 前插到 `data.artifacts`、`jobId = null`、`canvas.revision += 1` |
| `failed` | — | `release` 全额 | `jobId = null` |
| `compliance_blocked` | — | `release` 全额 | `jobId = null` |
| `cancelled` | — | `release` 全额 | `jobId = null` |

`progress` 由 provider 的 `running` 状态提供，成功时置 100。客户端在 `CanvasWorkspace` 里以 1200ms 间隔轮询处于 `queued`/`running` 的任务，并用 `pollRef` 防止同一 job 的请求叠加。

---

## 7. 账本不变量

`src/server/ledger.ts`，只追加，永不修改或删除条目。

内部的 `append()` 是所有写入的唯一出口，它做三件事：**幂等去重 → 计算新余额 → 同时写 `ledger` 条目和 `balances[spaceId]`**。

### 不变量 1：`logicalChargeId` 幂等

```ts
const existing = state.ledger.find((e) => e.logicalChargeId === logicalChargeId)
if (existing) return null
```

同一个 `logicalChargeId` 第二次出现是 no-op，不是第二次扣费。重复的 webhook、重试的轮询、并发的两次结算都被这一行挡住。各操作的键：

| 操作 | `logicalChargeId` | `credits` |
| --- | --- | --- |
| `reserve` | `reserve:${jobId}` | 负数（`-credits`） |
| `settle` | `settle:${jobId}` | `0` |
| 部分返还 | `release-partial:${jobId}` | 正数（差额） |
| `release` | `release:${jobId}` | 正数（全额） |
| `grant` | `grant:${新生成的 ledger id}` | 正数 |
| `purchase` | `purchase:${orderId}` | 正数 |

键以 `jobId` 为核心，而不是 `invocationId` 或 attempt——**一个 job 在其生命周期内最多预留一次、最多结算一次、最多全额返还一次**。

`grant` 用新生成的 id 作键，所以它实际上从不去重，每次调用都会发放；`purchase` 用 `orderId` 去重，重复回调不会重复充值。

### 不变量 2：先预留，后执行

`confirmJob` 里 `reserve()` 与状态迁移在同一个 `withState` 事务内，且在 `provider.submit()` **之前**。余额不足时 `reserve()` 抛 `InsufficientCreditsError`，事务里的状态迁移也就不会发生——不存在「没预留就跑起来」的窗口。

### 不变量 3：终态必须结算或返还

见第 6 节的表。四个终态各自对应一次且仅一次账本动作，没有「终态了但预留还挂着」的路径。

`settle()` 的记账方式要特别注意：**它写的条目 `credits` 是 0**。因为钱在 `reserve` 阶段就已经从余额里扣掉了，settle 只是一条「这笔预留最终确认为 N 积分」的记录；如果实际产出少于报价（`actualCredits < reservedCredits`），差额通过一条独立的 `release-partial` 条目退回。`runner` 按产物数量折算实际值：

```ts
const perUnit = job.quote.credits / (job.spec.output.count ?? 1)
const actual = Math.round(perUnit * Math.max(1, artifacts.length))
```

### 不变量 4：`balances` 是账本的物化视图

`balances[spaceId]` 与账本尾部的 `balanceAfter` 始终相等，因为它们在 `append()` 里同一步写入。它是缓存不是真相——重建余额只需要重放该 space 的所有条目求和。

`ledgerView()` 把条目按 获取（`grant`/`purchase`）/ 消耗（`reserve`/`settle`）/ 返还（`release`）三组倒序返回，余额作为投影一并给出。

---

## 8. 服务端状态与并发

`src/server/store.ts` 是唯一知道状态怎么落盘的模块。

- 全部状态是一个 `WorkspaceState` 对象，序列化成 `.data/workspace.json`；进程内有 `cache` 单例。
- `persist()` 先写 `<file>.<pid>.tmp` 再 `rename`，避免写到一半崩溃把权威文件截断。
- `withState(mutator)` 是**串行化的读改写**：所有写操作挂在一条 `writeChain` 上依次执行，因此并发的路由处理器不会交错读改写。`writeChain` 用 `.then(run, run)` 挂接，即使某一环 reject 后续也照常执行。
- `readState()` 是只读快照（返回同一个 cache 对象，注意它不是深拷贝）。

因为 `cache`、`writeChain`、runner 的 `handles` 表、mock provider 的 `runs` 表全是**进程内内存**，这套实现只在单进程下正确。多实例部署需要连同第 9 节一起替换。

---

## 9. Provider 接入面

`src/server/generation/provider.ts` 定义了平台唯一认识的模型接口 `GenerationProvider`（`supports` / `submit` / `poll` / `cancel`）与一个进程内 registry。

`providerFor(modelId)` **从后往前**遍历 registry 返回第一个 `supports(modelId)` 为真的 provider——后注册的遮蔽先注册的。`registerProvider` 遇到相同 `id` 是替换而不是追加。

`runner.ts` 在模块加载时无条件注册内置的 `mockProvider`（`id: 'mock-offline'`，`supports()` 恒为 `true`），因此开箱即用；接入真实 provider 的具体做法、注册时序陷阱和产物落盘约定见 [`HANDOFF.md`](HANDOFF.md)。

---

## 10. Agent 协议

`src/server/agent.ts` 的 `planTurn()` 目前是关键词匹配，但**协议本身是完整的**，替换成真实 LLM 不需要动会话、游标、确认门或写入路径。

一次 turn 的产出是 `TurnResult { reply, payload? }`，`payload` 是四选一的 `AgentPayload`：

- `ask_human` — 一个澄清问题；此时**不创建任何东西**。首轮 brief 过短（`< 24` 字符）且没有附带 context chip 时走这条。
- `mutation_proposal` — 一组 `CanvasMutation` + 摘要，`status: 'pending'`；**Agent 永远不直接写画布**，必须由用户在 `PATCH .../messages` 里 `action: 'apply'` 才落盘，且落盘时依然过 `applyMutations` 校验。
- `tool_call` — 工具执行记录（`apply` 成功后由服务端补一条 `role: 'tool'` 的消息）。
- `quota_gate` — 免费轮次耗尽。**quota gate 不消耗轮次**（请求被拒绝了），其它 payload 才把 `freeTurns` 减一。

`AgentSession.seq` 是**单调游标**：`appendMessage()` 每追加一条消息就 `session.seq += 1` 并把值写进消息的 `seq`。轮询端点 `GET /api/agent/sessions/[sessionId]?afterSeq=N` 只返回 `seq > N` 的消息并按 `seq` 升序排列，客户端拿最后一条的 `seq` 作为下次的游标。这让增量拉取不依赖时间戳，也就不受时钟精度和并发写入顺序的影响。

会话标题由第一条用户消息派生（`deriveTitle`，超过 18 字截断加省略号）。空会话不允许分享，服务端在 `PATCH` 里二次校验。
