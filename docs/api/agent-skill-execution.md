# Agent + Skill 本地执行闭环

`/api/agent/sessions/*` 是前端 Agent 面板的本地 mock contract。执行器固定为
`local-deterministic-skill-runner/v1`：它不请求真实 LLM、模型 provider、LibTV Cookie 或积分服务。
未来 Agent gateway 只替换规划/工具实现，保留会话、消息序号、Skill pin、模式门和工具轨迹的 wire shape。

## 固定 Skill 与生成模式

1. composer context 中的 `{ kind: "skill", refId }` 解析到本地 catalogue，并在 proposal
   `summary` 和 `skills.resolve` tool message 固定 `skillId + version`；运行中不会跟随 catalogue 更新。
2. `POST /api/agent/sessions/{sessionId}/messages` 生成确定性 `text` 或 `media` mutation proposal，
   并写入 `skills.resolve`、`workflow.plan` 两条 tool trace。
3. **手动模式**始终只返回 `pending` proposal；只有
   `PATCH .../messages { action: "apply" }` 才调用 `applyMutations` 写画布。`reject` 不创建节点。
4. **自动模式**只自动应用符合本地安全规则的 proposal：mutation 数量为 1–32，且每项均为
   `addNode` 或 `addEdge`。删除、更新、分组、视口或超限的 proposal 保持 `pending`，继续显示
   与手动模式相同的确认门。
5. 自动应用会返回 `document` 与 `revision`，将 proposal 标为 `applied`，并按顺序写入
   `workflow.auto_apply`、`workflow.apply` 和执行 trace。面板显示自动模式说明、可见 trace，以及
   “自动模式已应用符合本地安全规则的工作流改动”的 assistant feedback，便于审计。

## 显式失败降级

apply 后写入本地执行 trace。text workflow 记录 `text.render`；media workflow 记录
`media.generate` 的 running/ok 或 running/error，并保持画布中的文本/分镜节点可编辑。

`[fixture:media-failure]`、`媒体失败`、`生成失败`、`降级`、`fallback` 或 `模型不可用` 是显式可重复的
媒体失败 marker。无论该安全 proposal 是由手动确认还是自动模式应用，失败均不创建远程 job、不调用
provider、不扣积分；它写入 `workflow.fallback`，使演示可验证降级而不依赖外部服务。

## 工作流分类

- `分镜拆解`、`广告脚本结构`、`前三秒钩子` 在没有明确媒体诉求时生成 text-first workflow；
- 明确的图片、视频、音频关键词，或其他已选 Skill，生成 media workflow；
- 所有 workflow 都从可编辑文本节点开始，媒体失败时该节点即为可靠 fallback。

完整 response fixture：[`agent-skill-execution.response.json`](examples/agent-skill-execution.response.json)。
