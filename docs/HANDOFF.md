# 交接说明

给接手这套代码、并要把它接到真实模型服务上的团队。

前置阅读：[`../README.md`](../README.md)（怎么跑起来）、[`ARCHITECTURE.md`](ARCHITECTURE.md)（领域模型与不变量）。本文只讲**怎么改**。

三个接入点，彼此独立，可以并行推进：

| # | 接入点 | 要动的文件 | 不用动的东西 |
| --- | --- | --- | --- |
| 1 | 真实模型 provider | `src/server/generation/providers/*`（新建）+ `runner.ts` 的注册那一行 | 画布、故事板、账本、Agent |
| 2 | 真实数据库 | `src/server/store.ts` | 全部路由、`src/domain/**` |
| 3 | 真实 LLM 规划器 | `src/server/agent.ts` 的 `planTurn` | 会话表、seq 游标、确认门、`applyMutations` |

---

## 1. 实现一个真实的 GenerationProvider

### 1.1 接口

`src/server/generation/provider.ts`：

```ts
export interface GenerationProvider {
  readonly id: string
  supports(modelId: string): boolean
  submit(request: ProviderSubmitRequest): Promise<ProviderHandle>
  poll(handle: ProviderHandle): Promise<ProviderStatus>
  cancel(handle: ProviderHandle): Promise<void>
}

export interface ProviderSubmitRequest {
  invocationId: string      // 稳定的逻辑副作用 id，跨基础设施重试不变
  spec: ExecutionSpec       // 冻结的编译产物，provider 唯一的输入
  workspaceDir: string      // 产物写到这里（绝对路径）
  publicPrefix: string      // 与 workspaceDir 一一对应的公开 URL 前缀
}

export interface ProviderHandle {
  providerId: string
  invocationId: string
  remoteJobId: string
}

export type ProviderStatus =
  | { state: 'running'; progress: number }      // progress 是 0–100 的整数
  | { state: 'succeeded'; artifacts: Omit<Artifact, 'id' | 'jobId' | 'assetId' | 'createdAt'>[] }
  | { state: 'failed'; error: string }
  | { state: 'cancelled' }
  | { state: 'compliance_blocked'; error: string }
```

`spec: ExecutionSpec` 里有 provider 需要的一切：`modelId`、已合成好的 `prompt`、`output`（宽高比 / 画质 / 分辨率 / 张数 / 时长 / 是否带音频 / 视频模式 / 音色与语音参数）、以及 `inputs: ExecutionInput[]`。

`inputs` 的每一项是 `{ kind, value, fromNodeId }`。`value` 的含义**同时随 kind 和来源变化**，这一点必须看清楚（`src/domain/compile.ts:51` `resolveInputs`）：

| 来源 | `fromNodeId` | `kind` | `value` 是什么 |
| --- | --- | --- | --- |
| 上游文本节点 | 源节点 id | `text` | 字面文本。注意这些文本**已经**被拼进 `spec.prompt` 了，`inputs` 里保留一份是为了溯源 |
| 上游图/视频/音频节点 | 源节点 id | `image` / `video` / `audio` | 源节点**最新产物的 URL**，形如 `/api/media/job_xxx/inv_yyy-0.svg` |
| 上游风格/特效节点 | 源节点 id | `style` / `effect` | 预设 id（`src/domain/libraries.ts` 的 `STYLE_PRESETS` / `EFFECT_PRESETS`），**不是** URL |
| 拖入的引用（`data.references` 中 `origin !== 'node'` 的项） | `null` | 六种都可能 | `NodeReference.refId`，**不是** URL |

两条推论：判断一项是不是可下载的媒体，必须看 `fromNodeId !== null` **且** kind 属于 `image`/`video`/`audio`；`fromNodeId === null` 的项拿到的是引用 id，需要自己去解析。

媒体 URL 是**相对于本应用**的路径。真实 provider 如果要把参考图传给远端，需要自己拼上本服务的对外地址，或者按 `MEDIA_DIR` 从 `.data/media/` 直接读文件。

### 1.2 契约

**`submit` 必须对 `invocationId` 幂等。** 这不是「最好做到」，是「不做就会重复计费」。原因：runner 的 handle 表（`src/server/generation/runner.ts:16`）在进程内存里，进程重启后 `pollJob` 查不到 handle，会**用同一个 `invocationId` 再调一次 `submit()` 来重新挂接**，而不是把任务判死：

```ts
// runner.ts:134 — 重启后的重挂接路径
const handle = handles.get(jobId)
if (!handle) {
  const reattached = await provider.submit({ invocationId: snapshot.invocationId, ... })
  handles.set(jobId, reattached)
}
```

所以 `submit` 的正确形状是「先查后建」：把 `invocationId` 作为幂等键传给远端（多数厂商叫 `idempotency_key` / `client_token` / `request_id`），或者自己维护一张 `invocationId → remoteJobId` 的持久映射表。**不要用内存 Map 做这张表**——内存 Map 恰好在需要它的那一刻（重启后）是空的。内置的 mock provider 用的就是内存 Map，那是它作为离线桩可以接受的简化，不要照抄。

`submit` 抛异常时，runner 认为「副作用从未发生」，会把 job 置 `failed` 并**全额返还**积分。所以只有在确定远端没收到请求时才让它抛；不确定的情况（超时、连接中断）应当返回一个 handle，让 `poll` 去查真实状态。

**`poll` 必须可以被反复调用，且绝不改动计费。** runner 每次轮询都调它，客户端每 1200ms 触发一次。

`poll` 抛异常的后果要清楚：异常会一路传到 `GET /api/jobs/[jobId]` 变成 500，客户端吞掉后下一拍重试。job 会**永远停在 `running`，预留的积分永远不释放**——目前没有任何超时回收机制。因此：

- 瞬时错误（网络抖动、5xx、限流）→ 返回 `{ state: 'running', progress }`，不要抛；
- 确定性失败、或自己判断已超时 → 返回 `{ state: 'failed', error }`，让状态机走完终态并返还积分；
- 内容安全/合规被拒 → 返回 `{ state: 'compliance_blocked', error }`，它同样是终态且全额返还，只是在 UI 上是另一种提示。

**`cancel` 是尽力而为。** runner 调它时会 `.catch(() => undefined)` 吞掉异常，随后立刻调 `pollJob` 让状态机自己收敛。取消之后远端仍然成功是被允许的情形——由 runner 决定最终状态，不需要 provider 自己处理这个竞态。

**`poll` 拿不到 `workspaceDir` 和 `publicPrefix`。** `ProviderHandle` 里只有三个 id 字段。产物一般在 `poll` 阶段才拿到，所以 provider 必须在 `submit` 时把 `request` 记下来（键用 `invocationId`）。重启后 runner 会重新调用 `submit` 并带上完整 `request`，这张表会被自动重建——这也是内存表在这里够用的原因。

### 1.3 产物写到哪里

`runner` 传进来的两个路径是成对的（`src/server/generation/runner.ts:100`）：

```
workspaceDir  =  <项目根>/.data/media/<jobId>          文件系统绝对路径
publicPrefix  =  /api/media/<jobId>                    公开 URL 前缀
```

规则：

1. 把产物文件写进 `workspaceDir`（先 `fs.mkdir(workspaceDir, { recursive: true })`）；
2. 返回的 `Artifact.url` / `thumbnailUrl` 一律拼成 `` `${publicPrefix}/${文件名}` ``；
3. 文件名建议带上 `invocationId` 和序号，保证同目录下不冲突。

这些 URL 会被**原样**写进 `WorkflowNode.data.artifacts`、`GenerationJob.artifacts`，登记成资产后还会写进 `Asset.url`，长期留在文档里。所以：

- **不要直接返回厂商的临时下载链接。** 带签名和过期时间的 URL 在几小时后会让历史文档里的图全部裂掉。正确做法是在 `poll` 拿到成功状态时把文件下载到 `workspaceDir`，再返回本地 URL。
- 文件后缀要在 `src/app/api/media/[...path]/route.ts` 的 `CONTENT_TYPES` 表里（`.svg .png .jpg .jpeg .webp .mp4 .webm .wav .mp3 .txt`），否则会以 `application/octet-stream` 返回，浏览器不会内联播放。要支持新格式就往那张表里加。
- 该路由已经做了路径穿越校验，并对产物打了 `immutable` 长缓存——URL 一旦发出就不该指向不同内容。

改成对象存储（S3/MinIO）时，改的是 `MEDIA_DIR`（`src/server/store.ts:44`）的含义和 `/api/media` 路由的实现（转成签名重定向或代理），provider 侧的约定不变：仍然返回 `publicPrefix` 开头的 URL，让文档里的地址永远指向本应用。

`Artifact` 里 provider 需要填的字段：

```ts
{ kind: 'image' | 'video' | 'audio' | 'text',
  url: string,
  thumbnailUrl: string | null,   // 视频/音频建议给一张海报图，故事板和节点卡都用它
  width: number | null,
  height: number | null,
  durationSeconds: number | null,
  modelId: string }              // 远端实际使用的模型，用于复现，可能不等于 spec.modelId
```

`id` / `jobId` / `assetId` / `createdAt` 由 runner 补齐，不要自己填。

产物数量会影响结算：runner 按 `实际产物数 / spec.output.count` 折算实际扣费，少出的部分自动退回（见 ARCHITECTURE 第 7 节）。

### 1.4 注册（这里有个必须避开的坑）

`providerFor(modelId)` **从后往前**扫 registry，返回第一个 `supports(modelId)` 为真的 provider，即**后注册的遮蔽先注册的**。

而 `runner.ts` 在模块加载时就注册了内置 mock，且 mock 的 `supports()` **恒为 `true`**：

```ts
// src/server/generation/runner.ts:13
registerProvider(mockProvider)
```

> ⚠️ 因此：真实 provider 必须在 `runner.ts` 的模块体执行**之后**才注册。如果你把 `registerProvider(realProvider)` 放在 `instrumentation.ts` 或任何先于 `runner.ts` 加载的模块里，registry 会变成 `[real, mock]`，倒序扫描先命中恒真的 mock，**你的 provider 永远不会被调用**。症状是「一切正常，只是产出全是假的」——最难发现的那类 bug。

推荐做法：新建 `src/server/generation/providers/index.ts` 导出一个数组，然后在 `runner.ts` 的注册行**下面**接上一行。

```ts
// src/server/generation/runner.ts
registerProvider(mockProvider)
// 顺序有意义：providerFor() 倒序扫描，而 mock 的 supports() 恒真，
// 先于它注册的 provider 会被整个遮蔽。
for (const provider of realProviders) registerProvider(provider)
```

补充：`registerProvider` 对相同 `id` 是**替换**而不是追加，所以开发模式下模块被 HMR 重新执行不会把 registry 撑爆。

上线前的自检：`listProviders()` 打印出的顺序里，真实 provider 必须排在 `mock-offline` **后面**；或者更彻底地，把 mock 的注册包在 `process.env.NODE_ENV !== 'production'` 里。

### 1.5 骨架

```ts
// src/server/generation/providers/acme.ts
import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { Artifact } from '@/domain/types'
import type {
  GenerationProvider,
  ProviderHandle,
  ProviderStatus,
  ProviderSubmitRequest,
} from '../provider'

type OutputArtifact = Omit<Artifact, 'id' | 'jobId' | 'assetId' | 'createdAt'>

/** 本 provider 认领的模型。未列出的模型交给别人，别用恒真的 supports()。 */
const CLAIMED = new Set(['lib-image-2', 'lib-navo-pro'])

/**
 * poll() 只拿得到 ProviderHandle，而产物落盘需要 submit() 时才有的两个路径。
 * 进程重启后 runner 会用同一个 invocationId 重新调 submit()，这张表随之重建。
 */
const pending = new Map<string, ProviderSubmitRequest>()

export const acmeProvider: GenerationProvider = {
  id: 'acme',

  supports(modelId) {
    return CLAIMED.has(modelId)
  },

  async submit(request) {
    pending.set(request.invocationId, request)

    // 先查后建。重启后的重新挂接会走到这里，此时远端任务已经存在，
    // 再创建一次就是第二次真实扣费。
    const existing = await acme.findJobByClientToken(request.invocationId)
    const remoteJobId =
      existing?.id ??
      (
        await acme.createJob({
          // 远端的幂等键与我们的逻辑副作用 id 必须是同一个值。
          clientToken: request.invocationId,
          model: request.spec.modelId,
          prompt: request.spec.prompt,
          aspectRatio: request.spec.output.aspectRatio,
          numOutputs: request.spec.output.count ?? 1,
          // fromNodeId 非空才说明 value 是产物 URL；来自拖入引用的项 value 是 refId。
          referenceUrls: request.spec.inputs
            .filter((i) => i.kind === 'image' && i.fromNodeId !== null)
            .map((i) => toAbsoluteUrl(i.value)),
        })
      ).id

    return { providerId: 'acme', invocationId: request.invocationId, remoteJobId }
  },

  async poll(handle): Promise<ProviderStatus> {
    const request = pending.get(handle.invocationId)
    if (!request) return { state: 'failed', error: '任务上下文丢失' }

    let remote: AcmeJob
    try {
      remote = await acme.getJob(handle.remoteJobId)
    } catch {
      // 瞬时错误绝不能抛：抛出去会让 job 卡在 running，预留的积分永不释放。
      return { state: 'running', progress: 0 }
    }

    switch (remote.status) {
      case 'queued':
      case 'processing':
        return { state: 'running', progress: Math.round(remote.progress * 100) }

      case 'moderation_rejected':
        return { state: 'compliance_blocked', error: remote.reason ?? '内容未通过合规校验' }

      case 'failed':
        return { state: 'failed', error: remote.error ?? '生成失败' }

      case 'cancelled':
        return { state: 'cancelled' }

      case 'succeeded': {
        // 厂商给的是带签名的临时链接，直接存进文档几小时后就会失效，
        // 所以落到本地再返回本应用的稳定 URL。
        await fs.mkdir(request.workspaceDir, { recursive: true })
        const artifacts: OutputArtifact[] = []

        for (const [index, output] of remote.outputs.entries()) {
          const file = `${handle.invocationId}-${index}.png`
          const bytes = await fetch(output.url).then((r) => r.arrayBuffer())
          await fs.writeFile(path.join(request.workspaceDir, file), Buffer.from(bytes))

          artifacts.push({
            kind: 'image',
            url: `${request.publicPrefix}/${file}`,
            thumbnailUrl: `${request.publicPrefix}/${file}`,
            width: output.width,
            height: output.height,
            durationSeconds: null,
            modelId: remote.modelUsed ?? request.spec.modelId,
          })
        }

        pending.delete(handle.invocationId)
        return { state: 'succeeded', artifacts }
      }
    }
  },

  async cancel(handle) {
    await acme.cancelJob(handle.remoteJobId)
  },
}
```

`toAbsoluteUrl` 需要你自己提供：`ExecutionInput.value` 对媒体来说是 `/api/media/...` 这样的相对路径，远端拉不到。

### 1.6 验证接入是否成功

1. 打开画布，加一个图片节点，写提示词，点生成 → 确认门显示报价；
2. 确认后余额立刻减少（预留），节点进度条动起来；
3. `curl http://localhost:3200/api/jobs/<jobId>` 看 `status` 是否走到 `succeeded`；
4. 产物文件确实出现在 `.data/media/<jobId>/` 下，`curl -I` 打得开；
5. `curl http://localhost:3200/api/ledger` 里能看到 `reserve` + `settle` 两条，`logicalChargeId` 分别是 `reserve:<jobId>` 和 `settle:<jobId>`；
6. **重启 dev server，再对一个 in-flight 的任务轮询一次**——这是幂等性的真正验收：远端不应该出现第二个任务。

---

## 2. 用真实数据库替换文件存储

`src/server/store.ts` 是唯一知道状态怎么落盘的模块，路由层和 `src/domain/**` 完全不感知。

### 2.1 必须重新实现的导出

| 导出 | 签名 | 说明 |
| --- | --- | --- |
| `WorkspaceState` | `interface` | 十个集合 + `balances: Record<spaceId, number>`。DB 化之后它退化成「一次事务里用到的仓储句柄」，可以保留这个名字以免改动全部调用点 |
| `readState()` | `() => Promise<WorkspaceState>` | 只读快照。所有纯查询路由用它，`GET /api/jobs/[jobId]` 还会在 `pollJob` 前后各读一次 |
| `withState(mutator)` | `<T>(m: (s) => T \| Promise<T>) => Promise<T>` | **串行化的读改写**。调用方直接原地修改 state 对象。这是唯一的写入入口 |
| `findProject(state, id)` | 纯查找 | 无 I/O，可保持不变或改成 await |
| `findCanvas(state, id)` | 纯查找 | 同上 |
| `canvasesOfProject(state, id)` | 纯查找 | **必须保持 `Project.canvasIds` 的顺序** |
| `balanceOf(state, spaceId)` | 纯查找 | 当前无调用方，路由直接读 `state.balances[...]` |
| `DEFAULT_SPACE_ID` | `const` | 硬编码在 4 个路由文件里（`projects` / `folders` / `assets` / `agent/sessions`）与 `ledger` 路由，接鉴权时全部要换成会话里的 spaceId |
| `MEDIA_DIR` | `const` | `runner` 与 `/api/media` 路由共用，两边必须一致 |
| `invalidateCache()` / `resetStore()` | 测试辅助 | 当前没有任何调用方，可以直接删掉或改成 DB 版 |

`readState` 与 `withState` 的调用点：

```
src/app/api/{projects,projects/[projectId],folders,folders/[folderId],canvases,
             canvases/[canvasId],jobs,jobs/[jobId],assets,ledger,
             agent/sessions,agent/sessions/[sessionId],
             agent/sessions/[sessionId]/messages}/route.ts
src/server/generation/runner.ts
```

最省事的迁移路径是**保留 `withState` 的签名**：内部开一个真实事务，把一个可变的工作副本交给 mutator，返回前把变更 flush 进去。这样 13 个路由一行都不用改。代价是全量读写，早期够用；之后再逐个路由换成细粒度仓储调用。

### 2.2 必须保住的不变量

1. **`withState` 的原子性。** 调用方写的是「读 → 改若干处 → 返回」，中间任何一步抛异常都必须让整次写入不生效。
   - 现状有个隐患值得在 DB 版里修掉：文件实现把**内存 cache 对象本身**交给 mutator，mutator 改到一半抛异常时磁盘没写、但内存 cache 已经脏了，下一次成功的写入会把这半截脏数据一起持久化。真实事务 + 回滚可以彻底消除这个问题。
2. **写入必须串行化（或用真实的行级并发控制）。** 现状是一条 `writeChain` promise 链。换成 DB 后可以放开并发，但下面第 3、4、5 条必须靠事务和约束保证。
3. **`Canvas.revision` 的检查与自增必须在同一个事务里。** 这是 409 乐观锁的全部依据。SQL 里最直接的写法：
   ```sql
   UPDATE canvases SET document = $1, revision = revision + 1, updated_at = now()
   WHERE id = $2 AND revision = $3
   ```
   受影响行数为 0 就返回 409。不要先 `SELECT revision` 再 `UPDATE`，那是典型的 TOCTOU。
4. **账本只追加，`logical_charge_id` 上必须有唯一索引。** 现状的去重是 `state.ledger.find(...)`，**全局**匹配而不区分 space（键里已经嵌了 `jobId` / `orderId`，全局唯一是安全的）。唯一冲突时的语义是「静默 no-op」，不是报错——`append()` 命中已有条目时返回 `null`。
5. **余额与账本条目必须同事务写入。** `balances[spaceId]` 是账本的物化视图，账本尾条目的 `balanceAfter` 必须等于它。并发预留必须靠 `SELECT … FOR UPDATE` 或 `UPDATE balances SET credits = credits - $1 WHERE space_id = $2 AND credits >= $1` 保证不会透支——现状靠串行化，DB 化后串行化没有了。
6. **`AgentSession.seq` 必须在插入消息的同一个事务里分配，且单调递增。** 增量轮询 `?afterSeq=N` 完全依赖它。如果两条消息拿到同一个 seq，或者游标已经越过某条消息之后它才可见，客户端就会永久丢消息。`seq` 允许有空洞，不允许乱序或重复。
7. **`Project.canvasIds` 是有序的**，画布切换器的顺序就是它。存成数组列或者加 `position` 列，别用无序的外键集合。
8. **删除的级联关系要照搬。** 三条路径已经收敛到 `src/server/store.ts` 的两个函数
   （`deleteProjects` / `deleteSessions`），DB 版建议同样只保留一处实现，别让每个路由
   各推一遍——之前正是那样，然后三条路径就跑偏了：
   - 删项目 → 删它的 canvases，并对 `projectId` 指向它的 agent sessions 调 `deleteSessions`；
   - 删文件夹 → 收集其下所有 projectId 交给同一个 `deleteProjects`，因此级联深度与删项目完全一致；
   - 删会话 → 同时删它的全部消息（`deleteSessions` 的职责，上面两条都经由它，所以不会留孤儿消息）；
   - 删画布 → 项目最后一块画布不允许删（400）。

   用外键 `ON DELETE CASCADE` 表达即可，但要保证"消息随会话走"这一层不被漏掉——
   `src/server/__tests__/cascade-delete.test.ts` 的 5 条测试就是钉这个的，可以照着移植。
9. **`Asset.state` 过滤**：`GET /api/assets` **只返回 `committed`**。`staging` 是上传的隔离态（尚未通过内容校验），`revoked` 是已撤回，两者都不是素材库内容。
10. **产物文件与数据库分离。** `.data/media/<jobId>/` 下的文件不在数据库里，迁移时要单独搬，或者同时切到对象存储。

---

## 3. 用真实 LLM 替换本地规划器

`src/server/agent.ts` 的 `planTurn()` 现在是关键词匹配（命中「视频/短片/…」就加视频节点，命中「配音/旁白/…」就加音频节点）。要替换的**只有这一个函数**，签名保持不变即可：

```ts
planTurn(input: {
  state: WorkspaceState
  session: AgentSession
  text: string
  context: AgentContextChip[]
}): TurnResult                       // { reply: string; payload?: AgentPayload }
```

会话表、消息表、seq 游标、确认门、`applyMutations` 写入路径全部照旧。

### 3.1 必须守住的协议

**（a）`ask_human` — 信息不足时只问，不建。**

```ts
{ kind: 'ask_human', question: string, placeholder: string, answered: boolean, answer?: string }
```

现状的触发条件是「首轮 + brief 短于 24 字符 + 没有 context chip」。换成 LLM 后由模型判断，但语义必须保持：**返回 `ask_human` 的这一轮不能产生任何 mutation**。回复文案要明确告诉用户这一轮不会创建节点、不会跑模型、不会扣积分——这是用户敢往下点的前提。

用户回答走 `PATCH .../messages { action: 'answer', answer }`：服务端把原消息标记 `answered: true` 并写回 `answer`，追加一条 `role: 'user'` 消息，然后**再调一次 `planTurn`**。`action: 'ignore'` 则只标记 `answered: true, answer: ''`，不再规划。这两条分支已经实现好了，`planTurn` 不需要感知自己是被哪条路径调用的。

**（b）`mutation_proposal` — Agent 永远不直接写画布。**

```ts
{ kind: 'mutation_proposal', summary: string, status: 'pending' | 'applied' | 'rejected',
  mutations: CanvasMutation[] }
```

LLM 的输出必须落成合法的 `CanvasMutation[]`。强烈建议：

- 用工具调用 / 结构化输出，schema 直接照 `src/domain/types.ts` 的 `CanvasMutation` 联合写，而不是让模型吐 JSON 字符串再解析；
- 节点对象用 `createNode()`（`src/domain/factory.ts`）构造，别让模型编 id、尺寸和默认 `data`——`createNode` 会给出正确的 `NODE_SIZE`、按类型的默认模型和默认 `output`，并且自动生成不重名的「图片节点 3」这类名字；
- 边用 `createEdge(from, to)`；
- **返回之前先在服务端本地跑一次 `applyMutations(doc, mutations)`**。抛 `MutationError` 就说明模型给的图非法（成环、连了不接受的媒体类型、引用了不存在的节点），此时应当重试或降级成 `ask_human`，而不是把注定失败的提案推给用户。

用户点确认走 `PATCH .../messages { action: 'apply' }`，服务端在事务里 `applyMutations` + `revision += 1`，并补一条 `role: 'tool'` 的 `tool_call` 消息。点拒绝走 `action: 'reject'`，只把 `status` 改成 `rejected`。已经不是 `pending` 的提案再次 apply 会被静默忽略（幂等）。

顺带说明：`AgentSettings.generationMode`（`manual` / `auto`）目前只是一个被持久化的字段，`planTurn` 没有读它——**没有任何自动提交生成的代码路径存在**。接 LLM 时如果要实现 `auto`，注意生成任务的确认门（`POST /api/jobs/[jobId] { action: 'confirm' }`）是唯一的扣费入口，自动模式意味着服务端替用户按下它。

**（c）配额门 — `quota_gate` 不消耗轮次。**

```ts
{ kind: 'quota_gate', reason: string }
```

现状：`AgentSettings.freeTurns` 建会话时是 `3`（`src/app/api/agent/sessions/route.ts:9`），`planTurn` 在开头检查 `freeTurns <= 0` 就直接返回 `quota_gate`。扣减发生在**路由层**（`messages/route.ts` 的 POST 与 PATCH-answer 两处）：

```ts
if (turn.payload?.kind !== 'quota_gate') {
  session.settings.freeTurns = Math.max(0, session.settings.freeTurns - 1)
}
```

也就是**被配额拒绝的请求不算一次消耗**。接真实计费时守住这条：调用失败/被拒绝不扣用户的额度。如果要按 token 计费，扣减逻辑放在同一个位置，并且要在 LLM 调用**成功返回之后**才扣。

**（d）seq 游标 — 每条消息都要经过 `appendMessage`。**

```ts
appendMessage(state, session, { role, content, context?, payload? })
```

它负责 `session.seq += 1` 并把值写进消息。客户端用 `GET /api/agent/sessions/[sessionId]?afterSeq=N` 增量拉取，只会拿到 `seq > N` 的消息。

对 LLM 集成的直接影响：**流式输出不能靠不断修改同一条消息来实现**，因为改 `content` 不会推进 `seq`，轮询端拿不到更新。要做流式，两个选项：(1) 换成 SSE/WebSocket，绕开 seq 游标；(2) 保持轮询，但每个增量片段作为新消息 append（会撑大消息表）。当前实现是**非流式**的：`POST .../messages` 同步返回 `[userMessage, assistantMessage]`。如果 LLM 调用要几十秒，先把这个端点改成「立刻返回一条占位消息，后台补完」，否则 HTTP 请求会挂很久。

**（e）context chips。** `AgentContextChip { id, kind: 'node' | 'asset' | 'model' | 'skill' | 'artifact', refId, label, thumbnailUrl? }` 是用户在发送前挂上的引用。`planTurn` 现在只用了 `kind === 'node'`（把选中的文本/图片节点当作链条的头部，避免重复创建）。接 LLM 时这些 chip 应当被渲染进 prompt——`refId` 对 `node` 来说是节点 id，可以直接去 `state` 里取完整节点。

### 3.2 建议的实现骨架

```ts
export async function planTurn(input: TurnInput): Promise<TurnResult> {
  // 注意：签名要从同步改成异步，messages/route.ts 的两个调用点需要 await，
  // 且必须把 LLM 调用挪到 withState 事务之外——不要在持有写锁时做网络 I/O。
}
```

这是替换过程中唯一需要改动 `agent.ts` 之外代码的地方：`planTurn` 变成 `async` 后，`messages/route.ts` 现在的写法是在 `withState` 的同步 mutator 里直接调用它，必须重构成「事务外调 LLM → 事务内落消息」。

---

## 4. HTTP 接口全表

全部路由都是 `export const dynamic = 'force-dynamic'`，无缓存。错误统一是 `{ "error": string }`（`src/server/http.ts`）。

### 项目与文件夹

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| `GET` | `/api/projects` | 列出默认 space 的项目（含 `canvasCount`）与文件夹（含 `projectCount`）+ 余额，按 `updatedAt` 倒序 |
| `POST` | `/api/projects` | 建项目，同时建一块名为「画布 1」的画布。返回 `{ project, canvas }` |
| `GET` | `/api/projects/[projectId]` | 项目 + 它的画布列表（按 `canvasIds` 顺序）+ 余额 |
| `PATCH` | `/api/projects/[projectId]` | 改名 / 移动文件夹 / 换封面。改名传空串是静默保留原名，不报错 |
| `DELETE` | `/api/projects/[projectId]` | 删项目 + 它的画布 + 绑定它的 agent 会话 |
| `PUT` | `/api/projects/[projectId]` | 创建副本：复制项目和其下每块画布的完整文档（深拷贝） |
| `POST` | `/api/folders` | 建「未命名文件夹」。无请求体 |
| `PATCH` | `/api/folders/[folderId]` | 改名 / 换封面 |
| `DELETE` | `/api/folders/[folderId]?confirmName=<名称>` | 删文件夹**及其中的项目和画布**。`confirmName` 与文件夹名不完全一致返回 400 |

### 画布

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| `POST` | `/api/canvases` | 在项目里建画布。带 `copyOf` 则复制该画布的文档，自动命名「\<源名\>副本N」 |
| `GET` | `/api/canvases/[canvasId]` | `{ canvas, project, jobs, balance }`，`jobs` 是这块画布的全部任务 |
| **`POST`** | **`/api/canvases/[canvasId]`** | **文档的唯一写入端点**，见下 |
| `PATCH` | `/api/canvases/[canvasId]` | 改画布名 |
| `DELETE` | `/api/canvases/[canvasId]` | 删画布。项目仅剩一块画布时返回 400 |

`POST /api/canvases/[canvasId]` 请求体：

```ts
{ canvasId: string, expectedRevision: number, mutations: CanvasMutation[], label: string }
```

成功返回 `{ revision, document }`，`revision` 已经 `+1`。

**409 的含义**：`expectedRevision` 与服务端当前 `Canvas.revision` 不一致，即**你手里的文档不是最新的**。这是乐观锁，不是权限错误也不是限流。响应体形如 `{"error":"画布版本冲突：期望 9999，当前 3"}`。

会拿到 409 的两种情形：

1. 另一个编辑者（或另一个标签页、Agent 的 apply）写过这块画布；
2. 你自己的某个生成任务成功了——runner 把产物写回节点时会 `revision += 1`（见 ARCHITECTURE 5.3）。

**正确的客户端处理是 rebase 而不是放弃**：重新 `GET /api/canvases/[canvasId]` 拿最新文档和 revision，然后把同一批 mutation 重新算一遍并重试一次。`src/lib/editor-store.ts` 的 `commitWith` 就是这么做的（`attempt(true)` 只重试一次，避免死循环）。**不要**直接把用户的编辑丢掉，也不要无限重试。

注意逃生口：`expectedRevision` 不是数字（缺省 / `null` / 字符串）时**乐观锁检查被整个跳过**，写入无条件生效。脚本化写入图省事可以用，但生产环境应当考虑把它改成必填。

其它错误：画布不存在 404；`applyMutations` 校验失败（成环、非法连线、节点不存在、重复 id）→ 400，错误信息是中文的具体原因。

### 生成任务

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| `GET` | `/api/jobs?canvasId=<id>` | 列任务，按 `createdAt` 倒序。`canvasId` 省略则返回全部 |
| `POST` | `/api/jobs` | 请求体 `{ canvasId, nodeId }`。编译 + 报价，建 `awaiting_confirmation` 的 job。**不扣费、不调 provider**。编译失败返回 400 |
| `GET` | `/api/jobs/[jobId]` | **轮询兼对账**：每次调用都会向 provider 查一次并推进状态机。返回 `{ job, revision, document, balance }`，其中 `document` 仅在 `status === 'succeeded'` 时非空（省掉客户端一次往返） |
| `POST` | `/api/jobs/[jobId]` | 请求体严格为 `{ action: 'confirm' \| 'cancel' }`；缺失、`poll` 或未知 action 返回 400。confirm = 预留积分 + 提交给 provider；cancel = 尽力取消。返回 `{ job, balance }` |

`confirm` 的 400 场景：报价过期（签发后 10 分钟）、积分不足（`InsufficientCreditsError`）。

轮询只使用 `GET /api/jobs/[jobId]`。`src/contracts/jobs.ts` 定义本地四类精确 response wrapper，
`src/contracts/libtv-generation.ts` 定义官网 create/progress/stop/batch 的外部 adapter；两者的
映射和脱敏字段证据见 `docs/research/libtv/api/captures/2026-09-03-video-task-client-contract.md`。

### 资产与积分

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| `GET` | `/api/assets?namespace=&kind=&tag=&q=` | 列资产，**只返回 `committed`**，按 `createdAt` 倒序 |
| `POST` | `/api/assets` | 请求体 `{ artifactId, name?, namespace?, tags? }`。把产物登记进素材库，对 `sourceArtifactId` 幂等，并回填 `artifact.assetId` |
| `GET` | `/api/ledger` | 积分明细：`{ balance, earned, spent, returned }` |
| `PATCH` / `DELETE` | `/api/assets/[assetId]` | 重命名、改标签、移动文件夹；DELETE 是软删除（置 `revoked`），因为产物可能仍在引用它 |
| `GET` / `POST` | `/api/assets/folders` | 列出与新建资产文件夹 |
| `POST` | `/api/assets/upload` | `multipart/form-data` 真实上传。MIME 白名单、单文件与单次数量上限、`staging → committed` 两阶段；校验不通过不留残片 |
| `GET` | `/api/media/[...path]` | 提供产物与上传文件。已做路径穿越校验；命中返回 `immutable` 长缓存，未命中 404，越界 403。**响应带 `Content-Security-Policy: default-src 'none'; sandbox` 与 `X-Content-Type-Options: nosniff`** —— 这里会回吐用户上传的字节，SVG 作为文档打开会在本源执行脚本 |

### 发布与公开只读

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| `POST` | `/api/publish` | `{ canvasId, title, summary }`。把当前画布**冻结**成不可变快照（深拷贝，`jobId` 归零）。再次发布产生新快照，不修改旧的 |
| `GET` | `/api/publish` | 公开画廊列表，只含 `listed` |
| `GET` | `/api/publish/[snapshotId]` | 单个快照；不可见（`hidden` / `revoked`）时 404 |
| `DELETE` | `/api/publish/[snapshotId]` | 撤回（置 `revoked`），详情路由**立刻** 404，不只是从列表移除 |

公开页面 `/showcase` 与 `/showcase/[snapshotId]` 无需登录。只读详情复用 `projectStoryboard` 做故事板投影，不挂载可编辑画布组件。

### 技能库

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| `GET` | `/api/skills?category=&q=&collection=` | `collection` 取 `全部` / `收藏` / `我的`。返回卡片列表与三种集合的计数 |
| `GET` | `/api/skills/[skillId]` | 单个 Skill，含 `executableSpec`（分节结构，不是 JSON 字符串）；未知 id 404 |
| `POST` | `/api/skills/[skillId]` | 切换收藏。幂等；**不修改种子目录**，收藏是 per-space 用户态 |

目录是 `src/domain/skills.ts` 里的静态种子。接真实 Skill 服务时替换 `src/server/skills.ts`
的读取来源即可，路由与页面不用动。收藏挂在 workspace state 的运行时键上（与 publish 同样的做法）。

### 合成导出

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| `POST` | `/api/compose` | 请求体 `{ clips[], audioTracks[], subtitles[] }`。用 ffmpeg 真实渲染成 MP4，并返回 `{ artifact, assetId, subtitleMode, notes }` |

`clips[]` 每项含 `url / inPoint / outPoint / speed / muted / transitionAfter /
transitionDurationSeconds`；`audioTracks[]` 含裁切区间、成片起点、增益和静音。校验在调用
ffmpeg **之前**完成（空时间线、`out <= in`、离谱倍速、20 分钟/片段/音轨/字幕上限、
字幕越界都会先 400）。
素材地址会解析回 `MEDIA_DIR` 之内，**并做 realpath 解引用**——只做文本 `startsWith` 会被
目录内的软链穿出去。ffmpeg 缺失时返回结构化失败而不是抛异常。

Storyboard 合成器现在是内嵌双栏工作区，不是 modal。编辑态唯一存于
`videoComposite.data.extra.composite` v1；`src/domain/composite.ts` 负责旧数组迁移、
归一化和不可变编辑，`src/contracts/compose.ts` 是 route/UI 共享运行时契约。视频源音频会
随裁切、倍速和转场同步，无音频片段补静音；独立 BGM/配音按时间线放置后混音。
OpenAPI 与完整样本见 `docs/api/README.md` 和 `docs/api/examples/compose.*.json`。

**已知降级**：字幕是否烧录取决于本机 ffmpeg 是否编译了 libfreetype；没有时退化为
muxed 字幕轨，响应里的 `subtitleMode` 会如实标明 `burned` / `muxed` / `none`。

### 协作 presence

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| `GET` | `/api/presence/[canvasId]?participantId=&name=&color=&x=&y=&zoom=` | SSE 流。先发 `snapshot`，随后是 `join` / `move` / `leave` 增量，并周期性发送 keepalive 注释 |
| `POST` | `/api/presence/[canvasId]` | 心跳：`{ participantId, name, color, cursor, viewport }` |

约束（`PRESENCE_LIMITS`）：id 为 `^[A-Za-z0-9_-]{1,64}$`，名称 ≤ 24 字，颜色必须 `#rrggbb`，
坐标绝对值 ≤ 1e6。`color` 是**必填**，不带会 400。

两条必须保留的性质：

1. **presence 绝不进持久化文档。** 它不 import `withState`，不走 `applyMutations`，
   `.data/workspace.json` 在整个会话期间字节不变。光标移动不是文档编辑——把它塞进
   文档会让每次鼠标移动都产生一次 revision 冲突。
2. **跟随必须可逃逸。** 本地平移/缩放、`Esc`、横幅上的取消按钮，三条独立路径。

**部署限制**：`src/server/presence.ts` 是**进程内** hub，扇出只在单实例内成立。
多实例部署需要把 hub 换成共享总线（Redis pub/sub 之类），路由与客户端契约可以不变。

### 账户与积分

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| `GET` | `/api/ledger?limit=` | 账本投影：`{ balance, earned, spent, returned, counts, totals, jobs }`。`limit` 为正整数，上限 200 |

`totals` 里的 `spent = reserved - returned`，因此恒等式 `balance === earned - spent` 对任意账本成立；
`held` 是尚未结束的任务仍冻结的部分。每行带 `charge`，把一次 reserve 与关闭它的
settle/release 折叠成一个结果，这样"生成失败、积分已退回"在任一集合里都读得出来。

### 仅开发环境

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| `POST` | `/api/dev/reset` | 把 workspace store 重置为种子状态。生产构建下返回 403。E2E 用它保证每个用例的隔离 |

### Agent

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| `GET` | `/api/agent/sessions?projectId=<id>` | 列会话，按 `updatedAt` 倒序 |
| `POST` | `/api/agent/sessions` | 建会话，`{ projectId?, canvasId? }`。默认 `generationMode: 'manual'`、`freeTurns: 3` |
| `GET` | `/api/agent/sessions/[sessionId]?afterSeq=<n>` | 会话 + `seq > n` 的消息（按 seq 升序）。增量轮询入口 |
| `PATCH` | `/api/agent/sessions/[sessionId]` | 改 `title` / `shared` / `generationMode` / `modelId`。把空会话置 `shared: true` 返回 400 |
| `DELETE` | `/api/agent/sessions/[sessionId]` | 删会话及其全部消息 |
| `POST` | `/api/agent/sessions/[sessionId]/messages` | 发一轮用户消息 `{ text, context? }`，同步返回 `{ session, messages: [用户消息, 助手消息] }` |
| `PATCH` | `/api/agent/sessions/[sessionId]/messages` | 处理待办 payload：`{ messageId, action: 'answer' \| 'apply' \| 'reject' \| 'ignore', answer? }`。`apply` 成功时额外返回 `{ revision, document }` |

### 预览

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| `GET` | `/api/preview/character?hue=&label=` | 合成的角色参考图（SVG） |
| `GET` | `/api/preview/stitch?rows=&cols=&seq=` | 合成的分镜拼接图（SVG contact sheet），`rows`/`cols` 夹在 1–5 |

这两个端点返回的是**程序生成的占位图形**，没有真实的角色库或拼接服务在后面。

### 状态码约定

- `HttpError` 抛出什么状态码就是什么（404 / 400 / 409）；
- 其它异常由 `src/server/http.ts:26` 的一条中文正则决定：消息里含「不存在 / 已存在 / 不接受 / 循环 / 不能 / 需要 / 未选择 / 已过期 / 积分不足 / 冲突」→ 400，否则 500。

  > 这是个可以工作但很脆的机制。加新的领域错误时，**用 `HttpError` 显式给状态码**，不要指望这条正则能匹配上；重构时也要留意它是靠中文文案在分类。

---

## 5. 明确没有实现的部分

不要从类型定义反推功能存在。以下是刻意留白或尚未完成的：

> 这份清单本身也会过期，而过期的方向恰好最有害：把已经做完的东西列成"没有"，
> 接手方会照着重造一遍。所以每条都写清可验证的落点（文件:行号 / 命令），
> 改动相关功能时请连带更新这里。上一次逐条对代码核实：**第九轮之后**。

### 身份与多租户

- **没有鉴权、没有用户、没有登录。** 任何人访问 `http://localhost:3200` 就是全部数据的所有者。
- **实际是单空间的。** `DEFAULT_SPACE_ID = 'sp_default'` 硬编码在 5 个路由文件里，没有创建 space 的接口。`Space` 类型没有 owner / member 字段。
- 没有权限模型、没有分享链接。`AgentSession.shared` 只是一个布尔字段，没有任何依据它做访问控制的代码。
- 协作 presence **是有的**（见第 4 节 `/api/presence/[canvasId]`），但它**不是访问控制**：
  参与者身份由客户端自报，任何人都能用任意 `participantId` 和名字加入任意画布的流。
  在接鉴权之前，不要把在场列表当成"谁有权看这块画布"的依据。

### 生成链路

- **只有一个 provider**：`mock-offline`，`supports()` 恒真。它在本地渲染确定性的 SVG / WAV /（有 ffmpeg 时）MP4，没有任何外部调用。
- **没有队列、没有 worker、没有 webhook。** 任务靠客户端每 1200ms 轮询推进；浏览器标签页关掉，任务就不再前进。
- **runner 的 handle 表和 mock 的 run 表都在进程内存里**，因此当前实现只能单进程跑。
- **没有超时回收。** `poll` 持续抛异常或远端永不返回终态时，job 永远停在 `running`，预留的积分永远不释放。没有 reaper、没有 job TTL。
- **合规拦截是假的**：`compliance_blocked` 只来自 mock 内部一个确定性的随机判定（视频模型约 3.5% 概率），没有接任何内容安全服务。
- **失败没有自动重试。** `GenerationJob.attempt` 只会在 confirm 时自增一次，没有第二次 attempt 的代码路径。
- **`videoComposite` 的生成编译与剪辑导出仍是两条明确路径。** 节点持久化的
  `data.extra.composite` v1 由 `src/domain/composite.ts` 规范化；Storyboard 内嵌剪辑器
  直接 `POST /api/compose`，由 `src/server/compose.ts` 用 ffmpeg 实渲。通用
  `compileNode()` 不消费 composite 文档，因此节点上的生成动作不能替代剪辑器导出；
  接真实后端时不要把这两个副作用暗中合并。
- 导演台的 `extra.scene` **有消费方**（`CanvasWorkspace.tsx:565` 读、`:569` 写回），
  但消费它的只有导演台自己这个编辑器 UI；**生成管线不读它**，摆好的机位和走位
  不会影响任何一次真实出图。
- 成片导出端点是 `POST /api/compose`（见第 4 节）。**已知降级**：字幕是否烧录取决于
  本机 ffmpeg 有没有文字渲染能力，缺少时封装 `mov_text`，响应里的 `subtitleMode` 会
  如实标明 `burned` / `muxed` / `none`。

### 数据

- `/api/ledger` 的前端调用方是账户页（`src/components/account/AccountPage.tsx:38`）。
  除此之外，界面各处的余额都来自 project / canvas / job 各接口顺带返回的 `balance` 字段，
  而**不是**再查一次账本——所以账本投影出问题不会让余额显示出错，反之亦然。
- **画布侧栏的「资产」标签页仍是空态占位**（`src/components/canvas/AssetSidebar.tsx`）；完整素材库在 `AssetLibraryPanel`（底部「添加资源 → 上传」进入），那条路径是接了真实接口的。
- **`NodeReference.origin: 'upload'` 仍没有产生方**：上传得到的是 Asset，插入画布时走的是产物路径，不是 `NodeReference`。
- **`WORKFLOW_SCHEMA_VERSION` 只是被写进文档，没有任何迁移代码。** 改文档结构时需要自己补迁移。
- **没有文档历史。** `Canvas.revision` 是乐观锁计数器，不是版本号；撤销栈只存在于客户端内存（上限 50 帧），刷新即丢。
- 级联删除**已经统一**：删项目 / 删文件夹 / 删会话三条路径共用 `src/server/store.ts` 的
  `deleteProjects` / `deleteSessions`，消息随会话一起删，不再留孤儿消息。
  `src/server/__tests__/cascade-delete.test.ts` 有 5 条测试钉住，含孤儿消息那条回归。
  （此前这里记的"删项目留孤儿消息、删文件夹不删会话"描述的是修复前的行为。）

### Agent

- **不是 LLM。** `planTurn` 是关键词匹配加固定的 text → image → video (+audio) 链条模板。
- **没有工具调用循环。** `AgentPayload` 里的 `tool_call` 只在 mutation 提案被采纳后由服务端补记一条，模型没有可调用的工具集。
- **`generationMode: 'auto'` 没有实现**：字段会被保存，但没有任何代码读它，不存在自动提交生成的路径。
- **不是流式的**：`POST .../messages` 同步返回完整回复。
- `AgentContextChip` 的 `kind` 允许 `asset` / `model` / `skill` / `artifact`，但 `planTurn` 只消费 `node`。
- Skill **目录**是有的（`/skills` 页面 + 第 4 节的三个接口，种子在 `src/domain/skills.ts`），
  但**没有执行器**：Skill 详情页渲染出来的 `executableSpec` 只是给人看的结构化文本，
  没有任何代码把它翻译成 `CanvasMutation` 或生成任务。Agent 侧把 Skill 作为
  context chip 注入，仅此而已——`planTurn` 并不会因为挂了 Skill 而改变行为。

### 工程

- **测试规模**：35 个文件、559 条用例（`pnpm test`，2026-09-03 本批次实跑）。其中新增
  generation adapter、Jobs schema、route validation 与 typed client 契约测试；
  `src/server/` 整层没有单测的说法已经不成立。
- **但覆盖是偏的，而且恰好偏在本文要你动的地方。** 实测哪些模块被测试引用过：

  | 模块 | 引用它的测试文件数 |
  | --- | --- |
  | `src/server/store.ts` | 7 |
  | `src/server/assets.ts` / `svg-sanitize.ts` | 4 / 3 |
  | `ledger.ts` / `compose.ts` / `presence.ts` / `publish.ts` / `skills.ts` | 各 1 |
  | **`src/server/generation/`（`runner` / `provider` / `mock-provider`）** | **0** |
  | **`src/server/agent.ts`（`planTurn`）** | **0** |

  也就是说：**第 1 节（换 provider）和第 3 节（换 LLM）要改的两个模块，一条单测都没有。**
  runner 的终态副作用（结算 / 返还 / 产物写回节点 / `revision += 1`）、重启后的重挂接路径、
  provider registry 的倒序遮蔽、`planTurn` 的三种 payload，全部只被 Playwright 用例
  间接盖到。动它们之前先补测试——尤其是"失败要全额返还"和"submit 幂等"这两条，
  它们错了是直接对着真钱错。
- **路由层没有集成测试。** HTTP 行为（含 409）只在 Playwright 用例里被间接覆盖。
- `tsconfig.json` 的 `exclude` 里有 `e2e`，所以 `pnpm typecheck` **不检查** Playwright 用例；`vitest.config.ts` 也不在 tsconfig 的排除列表里，它会被类型检查覆盖。
- 没有 CI 配置、没有 Dockerfile、没有 `.env.example`（目前也确实不需要任何环境变量——接入真实 provider 后需要新增）。
- 没有结构化日志、没有 tracing、没有指标。
- 没有速率限制；`POST /api/jobs` 每次调用都会新建一个 job，HTTP 层没有幂等键。
- `src/server/store.ts` 导出的 `resetStore()` / `invalidateCache()` / `balanceOf()` 目前没有任何调用方。
- 界面只在 1440×900 桌面视口下验证过（见 `playwright.config.ts`），没有做移动端适配。
