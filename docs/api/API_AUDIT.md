# API 契约审计（1.25.1-account-member-not-found）

> 审计日期：2026-09-05  
> 范围：`docs/api/`、`src/app/api/`、`src/contracts/`、`src/contracts/route-manifest.ts` 与对应的 local mock Route Handler；不修改 OpenAPI 或运行时代码。  
> 基线：`6a6d1d3a`，OpenAPI `1.25.1-account-member-not-found`。

## 结论

**路由集合本身一致：55 paths / 92 operations。** `src/app/api` 导出的 method/path、
`LOCAL_API_ROUTES` 与 `openapi.yaml` 的 path/method 集合一致；每个 operation 也具有
`operationId`、UI trigger、mock 场景和成功 transport 声明。

但这不是完整的 wire-contract 一致性证明。下面的缺口会使未来后端或 SDK 虽能从 OpenAPI 生成
55/92 个端点，却在错误 envelope、匿名读取、状态码和可执行示例上与当前 mock/UI 出现分歧。

### 后续修订

审计后，`1.25.1-account-member-not-found` 已将
`PATCH /api/team/members/{memberId}` 的运行时 `404` 明确写入 OpenAPI；API-AUD-04 的**文档
缺项**已关闭。随后通用 `handle()` 也已收敛到 `ErrorResponse`，使 87 个 JSON operation 的
runtime 成功/错误主路径与 OpenAPI 同向；Presence 的 JSON errors 与 media 的 plain-text resource errors 也已对齐。SVG preview 的无受控 failure 和 SSE 已建流后的生命周期仍使 wire contract 不能判定为完全交付。

## 已验证的基线

| 检查 | 结果 | 说明 |
|---|---|---|
| Route Handler ↔ manifest | 通过 | `src/contracts/__tests__/openapi.test.ts` 从实际 `route.ts` 导出 method/path。 |
| manifest ↔ OpenAPI | 通过 | 相同测试比较完整 operation 集合及 operationId/trigger/scenario/transport。 |
| OpenAPI 内部 `$ref`、path 参数、JSON 样本路径 | 通过 | `scripts/verify-api-contract.mjs`。 |
| 版本与总量 | 通过 | `openapi.yaml`、README 权威 version 行及 `ROUTE_COVERAGE.md` 顶栏均为 `1.25.1-account-member-not-found`、55/92。 |

## 发现与具体缺口

| ID | 优先级 | 证据 | 缺口 | 建议闭环 |
|---|---|---|---|---|
| API-AUD-01 | P1（关闭） | `docs/api/README.md`、`src/contracts/__tests__/openapi.test.ts` | README 已统一为 55 个 path / 92 个 operation；契约测试同时断言权威总量且拒绝历史 `47/82` 标记，避免仅“包含正确数字”但文档仍自相矛盾。 | 保持总量断言；新增 route 时同步更新 README、manifest 与 OpenAPI。 |
| API-AUD-02 | P1（已关闭） | `docs/api/ROUTE_COVERAGE.md` 的“覆盖结论”表、`src/contracts/__tests__/openapi.test.ts` | Project/Folder/Recycle Bin、Jobs/Script V2/compose、Public discovery/publish 已更正为 **7/13**、**7/11**、**8/11**。契约测试从 `LOCAL_API_ROUTES` 重新计算这些含 `GET /api/home` 重叠归类的分域统计，并断言覆盖表文本，防止新增 operation 后再次静默漂移。 | 新增或改 tag/path 时同步扩展覆盖分组 predicate；表格仍应只表达明确的后端接手 domain，而非所有 tag 的无差别汇总。 |
| API-AUD-03 | P0（部分关闭） | `src/server/http.ts`、`src/app/api/presence/[canvasId]/route.ts`、`src/api/client.ts`；`docs/api/ERRORS.md` 与 OpenAPI 的 `ErrorResponse` | 通用 `handle()` 的 87 个 JSON operation、Presence 握手前/POST JSON error 已输出规范化 `ErrorResponse { error: { code, message, details? }, requestId }`，且 `ApiError.requestId` 已保留关联值。剩余 wire 边界是 SVG preview 无受控 failure 与 SSE 已建立后不存在 JSON error body；media 的 plain-text `Forbidden`/`Not found`、关键 cache/security headers 已与 OpenAPI 和 route tests 对齐。 | 保持 JSON/media route runtime tests；明确 SSE 建连后重连语义与 SVG resource failure 策略。 |
| API-AUD-04 | P1（已关闭） | `src/server/account-boundaries.ts:226`、`src/app/api/team/members/[memberId]/route.test.ts`；`/api/team/members/{memberId}` OpenAPI responses | `PATCH /api/team/members/{memberId}` 的未知成员路径已声明为 **404 `ErrorResponse`**，并由 route-level contract test 解析 `NOT_FOUND` envelope；同套测试同时锁定 owner `403`、成功重放与幂等冲突 `409`。 | 未来成员服务替换 fixture 时，保留 status/code 映射并增加真实 principal/权限矩阵测试。 |
| API-AUD-05 | P1（部分关闭） | `src/app/api/account/route.ts`、`account/handoffs/route.ts`、`team/route.ts`、`shared-assets/route.ts`、`identity/route.ts`、`preferences/route.ts`、`notifications/route.ts`；这些 GET operation 的 OpenAPI security | 以上 7 个 GET 在匿名 fixture 下实际返回 **200 projection**（如 `permission-denied`、`authentication-required`、公开浏览者或空通知）。OpenAPI 现将其标为 `x-authorization: local-display-projection` + `security: []`，并由 `AUTHORIZATION.md` 明确它们只是不含真实账户资源的 local fixture display state。未来后端仍必须选择保留该脱敏 shape，或以 versioned protected resource + adapter 迁移。 | 将 future backend 的二选一记录为具体 ADR；若迁移到 protected resource，新增 versioned contract、adapter 和匿名/认证 E2E。 |
| API-AUD-06 | P1（部分关闭） | OpenAPI operation example metadata 审计 | 当前 92 个 operation 中 **44 个没有 request/response example metadata**。`GET/POST /api/access-key`、`GET /api/account/handoffs`、`POST /api/team/invites`、`PATCH /api/team/members/{memberId}` 与 `GET/POST /api/showcase/{snapshotId}/engagement` 均已有可执行 schema 样本；团队写命令的 fixture transition、body idempotency、`401/403/404/409` 语义已在 `ACCOUNT_EXTERNAL_COMMANDS.md` 及 route tests 锁定，互动样本锁定匿名可读初始 projection 及登录 like transition。 | 为剩余高优先级 operation 至少提供 success、认证/权限失败、幂等 replay/冲突（写命令）样本，并将 examples 接入 OpenAPI `components.examples` 或 operation examples。 |
| API-AUD-07 | P2（局部补强） | `src/contracts/__tests__/openapi.test.ts`、`scripts/verify-api-contract.mjs`、`src/app/api/assets/route.test.ts`、`src/app/api/assets/upload/route.test.ts`、`src/app/api/agent/sessions/route.test.ts`、`src/app/api/agent/sessions/[sessionId]/route.test.ts`、`src/app/api/canvases/route.test.ts`、`src/app/api/canvases/[canvasId]/route.test.ts`、`src/app/api/jobs/route.test.ts`、`src/app/api/jobs/[jobId]/route.test.ts`、`src/app/api/script-v2/quotes/route.test.ts`、`src/app/api/script-v2/runs/route.test.ts`、`src/app/api/script-v2/runs/[runId]/route.test.ts`、`src/app/api/compose/route.test.ts`、`src/app/api/showcase/[snapshotId]/engagement/route.test.ts` | 静态门仍不执行 92 个 route；资产库主切片已直接验证活跃/不可用 lifecycle、文件夹计数、元数据移动、软删除/恢复和缺失资产 `404`。上传切片直接执行 multipart 的部分成功（已提交文件与逐文件拒绝项）、active listing、同 token 二次 ingress 的 `409`、取消后的 `revoked` 计数与重复取消 replay，并解析 `400` / `409 ErrorResponse`。Canvas/workflow 切片直接验证新建与深拷贝画布、GET 的 canvas/project/jobs/balance 投影、重命名、非最后画布删除、schema-valid mutation 的 revisioned document 回读、失效 revision `409`，以及 batch 中后续 mutation 无效时不提交之前 viewport 修改的原子性。Jobs/Script V2 切片直接验证 collection/create 的成功 schema、确认门、poll 状态推进、取消/重试 replay、同幂等键同输入重放与不同输入 `409`，并覆盖 malformed `400/422`、missing `404`、终态 transition `409`。视频合成切片则直接验证 schema-valid queued task、rendering → cancelled 的持久化投影、重复 cancel 的幂等回复，以及 malformed body / missing task 的 `400` / `404 ErrorResponse`。TV Show 互动切片直接验证匿名读取、登录 like/unlike/share 的本地持久化、重复 like 的 state-setting replay、分享计数递增及公开 detail 不变，并解析 `401`、`400`、`404 ErrorResponse`。RT-05 已为账户/项目边界直接执行 handoffs 的登录/匿名 display projection、账本 schema/分页限制、dev reset 成功与 production `403`、文件夹删除确认/认证/404，以及 project detail 的私有认证、会话过期和 not-found 投影。Agent session 全部 7 个 operation 也由 collection/detail/message route smoke 执行：success schema、`afterSeq` 增量 cursor、单调 `seq`、`ask_human` answer resolve、未知会话 `404` 及删除后的 detail/list projection。成功 body 以对应 Zod schema 解析，错误 body 以 `LocalErrorEnvelopeSchema` 解析。其余 operation 仍未形成运行时 matrix。 | 添加 manifest 驱动的 route smoke matrix：每 operation 至少验证成功 content type/schema，错误 fixture 验证 status + `ErrorResponse`；对 body 命令增加 request schema、幂等 replay 和相同 key 不同输入的 409。 |
| API-AUD-08 | P2 | `docs/api/README.md:77` 对 transport header 的表述；`AccessKeyCommandRequest`、`CreateTeamInviteRequest`、`UpdateTeamMemberRequest` | README 把 idempotency key 作为“调用方 header”的示例，而三个账户/团队命令和 Script V2 实际把 `idempotencyKey` 置于 JSON body。没有全局 header 约定，但文案容易让 future adapter 在错误位置注入 key。 | 明确：本仓的幂等键为 operation schema 的 body 字段；若未来采用 `Idempotency-Key` header，应作为 versioned contract 迁移并同时保留兼容策略。 |

## 示例覆盖的优先补齐顺序

1. **P0：特殊 transport 错误契约** — JSON routes 与 Presence JSON errors 已收敛；媒体 binary/text error 与 SVG preview 需单独声明、测试或归一化。
2. **P1：账户与团队命令** — Access Key create 与账户 handoff 已有脱敏 success 样本；继续补齐 rotate/revoke、同键 replay、同键不同 command 的 409、邀请 seat 满、owner 修改和未知 member 的 404。
3. **P1：匿名读取决策** — 7 个账户菜单 GET 已收敛为 local display projection；未来后端选择保留该脱敏 shape 或 versioned protected resource + adapter，禁止混合语义。
4. **P1：公开互动** — engagement 的匿名 POST 401、已登录 like/unlike/share、刷新后 state 及不会改动冻结 snapshot 的样本。
5. **P2：全表生成验证** — 把 example 覆盖、status 集合和 schema 解析纳入 CI，而不是只验证路由名集合。

## 可执行复核命令

```bash
# 现有结构校验：route.ts、manifest、OpenAPI、内部引用、version 和 JSON examples。
node scripts/verify-api-contract.mjs

# OpenAPI/manifest 结构测试（当前 16 assertions）。
pnpm exec vitest run src/contracts/__tests__/openapi.test.ts

# 无依赖地重算权威总量；应输出 55 92 与 1.25.1-account-member-not-found。
node - <<'NODE'
const fs = require('node:fs')
const api = JSON.parse(fs.readFileSync('docs/api/openapi.yaml', 'utf8'))
const methods = ['get', 'post', 'put', 'patch', 'delete']
const operations = Object.values(api.paths).reduce(
  (count, item) => count + methods.filter((method) => item[method]).length,
  0,
)
console.log(Object.keys(api.paths).length, operations, api.info.version)
NODE

# 检查正文不再混入旧总量（审计历史本身不计入）。
rg -n '47 个 path|82 个 operation' docs/api/README.md docs/api/ROUTE_COVERAGE.md
```

## 审计边界

本文件记录缺口，不改变 `openapi.yaml`、mock route、contract schema 或前端行为。`1.25.1` 的
55/92 路由集合可继续作为 frontend-only 演示基线；在上述 P0/P1 项关闭前，不应将其宣称为可直接
用于真实后端生成客户端的完全 wire-compatible API。
