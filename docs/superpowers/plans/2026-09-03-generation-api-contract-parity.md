# Generation API 契约对齐实施计划

> 本计划是 LibTV 全能力复刻总目标中的一个可验证里程碑；完成本计划不代表总目标完成。

## 目标

把官网当前生成任务客户端的已验证协议沉淀为可执行契约，并让本地 mock 的 Jobs API、类型化客户端与 OpenAPI 完全一致：

- 区分浏览器网络实测与当前部署 bundle 静态确认的证据等级；
- 固化创建、进度、批量进度、批量停止与算力报价的上游请求/响应边界；
- 兼容官网 `taskId` / `task_id` 返回差异，显式映射 `0..4` 任务状态；
- 安全解析 `taskResult`，把合法、缺失、非法 JSON 与非法结构变成可判定结果；
- 为本地 `/api/jobs` 全部方法建立严格 Zod 请求/响应契约；
- POST 仅承担 `confirm` / `cancel`，轮询固定使用 GET，消除文档与实现歧义；
- OpenAPI、JSON 示例、路由、客户端和测试共用同一事实边界；
- 保持所有数据为本地 fixture，不固化登录账号中的项目、空间或素材标识。

## 实施清单

### 1. 上游生成协议证据

- [x] 新增生成任务客户端协议记录，列出证据等级、endpoint、字段、状态映射与 bundle 哈希。
- [x] 更新 endpoint 总表，只记录协议事实与脱敏本地示例。
- [x] 明确静态 bundle 不进入仓库，官网私有项目/空间/素材 ID 不进入文档。

### 2. 上游适配契约（TDD）

- [x] 先写失败测试：create 双 task ID、状态映射、扩展字段保留、合法/非法 `taskResult`。
- [x] 新增 `src/contracts/libtv-generation.ts`，实现请求/响应 schema 和确定性 decoder。
- [x] 覆盖 progress、batch progress、stop batch 和 power calculator 请求结构。

### 3. 本地 Jobs 契约（TDD）

- [x] 先写失败测试：严格 create/transition 输入、四类精确响应和示例 round-trip。
- [x] 新增 `src/contracts/jobs.ts`，复用现有 `GenerationJobSchema` 与 `WorkflowDocumentSchema`。
- [x] 路由在调用 runner 前校验 JSON，非法 body 稳定返回 400。
- [x] `POST /api/jobs/{jobId}` 只接受 `confirm` / `cancel`，缺失或 `poll` 不再隐式确认。
- [x] `createApiClient().jobs` 提供 list/create/get/transition 四个类型化方法。

### 4. OpenAPI 与对接文档

- [x] 为 Jobs 四个 operation 替换 `GenericSuccess`，补精确 request/response schema 和示例。
- [x] 标注本地 operation 与官网生成 endpoint/状态的映射，不把二者伪装成同一路由。
- [x] 修正 `JOB_STATES.md`：GET 轮询，POST 仅确认/取消。
- [x] 增加 OpenAPI 契约测试，验证 examples 可被运行时 schema 解析且没有 POST poll。
- [x] 更新 API README、Feature Matrix、task 和 handoff。

### 5. 验证与提交

- [x] 记录 TDD 红灯，再运行目标测试至绿灯。
- [x] 运行 `pnpm verify`、OpenAPI JSON 解析和 `git diff --check`。
- [x] 构建后恢复 `next-env.d.ts`，不改动用户未跟踪的 `.gitignore`。
- [x] 独立提交本里程碑；总目标保持 active。

## 验证记录

- TDD 红灯：缺失 adapter/schema、未校验 route、缺失 typed client 与 OpenAPI 仍引用 `GenericSuccess` 均先产生预期失败；
- 目标契约测试：5 个文件、38 项通过；
- `pnpm verify`：35 个测试文件、559 项通过，ESLint 零 warning，Next.js 生产构建通过；
- `pnpm e2e`：50 项通过、2 项按 production 条件跳过，包含真实生成确认/轮询主链路；
- `python3 -m json.tool docs/api/openapi.yaml` 与 `git diff --check` 通过；
- E2E 后恢复全部既有 screenshot 与 `next-env.d.ts`，用户未跟踪的 `.gitignore` 保持不变。

## 完成边界

本里程碑只完成“生成任务协议与本地 Jobs API”这一纵切。后续继续推进 Image/Audio/Text、Script V2/Legacy、素材/角色/工具库、媒体衍生编辑，以及全站页面与视觉/API 终审；这些全部通过前不结束总目标。
