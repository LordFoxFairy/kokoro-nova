# API 契约审计（1.25.0-showcase-account-commands）

> 审计日期：2026-09-05  
> 范围：`docs/api/`、`src/app/api/`、`src/contracts/`、`src/contracts/route-manifest.ts` 与对应的 local mock Route Handler；不修改 OpenAPI 或运行时代码。  
> 基线：`67bfe114`，OpenAPI `1.25.0-showcase-account-commands`。

## 结论

**路由集合本身一致：55 paths / 92 operations。** `src/app/api` 导出的 method/path、
`LOCAL_API_ROUTES` 与 `openapi.yaml` 的 path/method 集合一致；每个 operation 也具有
`operationId`、UI trigger、mock 场景和成功 transport 声明。

但这不是完整的 wire-contract 一致性证明。下面的缺口会使未来后端或 SDK 虽能从 OpenAPI 生成
55/92 个端点，却在错误 envelope、匿名读取、状态码和可执行示例上与当前 mock/UI 出现分歧。

### 后续修订

审计后，`1.25.1-account-member-not-found` 已将
`PATCH /api/team/members/{memberId}` 的运行时 `404` 明确写入 OpenAPI；API-AUD-04 的**文档
缺项**已关闭。它不消除 API-AUD-03 的 legacy error-envelope 运行时差异，因此不能据此把 wire
contract 判定为已完全交付。

## 已验证的基线

| 检查 | 结果 | 说明 |
|---|---|---|
| Route Handler ↔ manifest | 通过 | `src/contracts/__tests__/openapi.test.ts` 从实际 `route.ts` 导出 method/path。 |
| manifest ↔ OpenAPI | 通过 | 相同测试比较完整 operation 集合及 operationId/trigger/scenario/transport。 |
| OpenAPI 内部 `$ref`、path 参数、JSON 样本路径 | 通过 | `scripts/verify-api-contract.mjs`。 |
| 版本与总量 | 通过 | `openapi.yaml`、README 权威 version 行及 `ROUTE_COVERAGE.md` 顶栏均为 `1.25.0-showcase-account-commands`、55/92。 |

## 发现与具体缺口

| ID | 优先级 | 证据 | 缺口 | 建议闭环 |
|---|---|---|---|---|
| API-AUD-01 | P1 | `docs/api/README.md:41,128` | README 同时保留 `47 个 path / 82 个 operation` 和“所有 82 个 operation”的旧数字，与封面处 55/92 冲突。当前校验只断言 README *包含* 55/92，因此会产生通过但文档自相矛盾的假阳性。 | 更新旧数字，并让 verifier 断言 README 中没有其他 `N path/M operation` 总量声明。 |
| API-AUD-02 | P1 | `docs/api/ROUTE_COVERAGE.md` 的“覆盖结论”表 | 分域计数未随新路由更新：Project/Folder/Recycle Bin 实际 **7/13**（文档 6/12）；Jobs/Script V2/compose 实际 **7/11**（文档 6/11）；Public discovery/publish 实际 **8/11**（文档 7/9）。三项按现有 tag/path 合并后均与正文总量冲突。 | 从 `LOCAL_API_ROUTES` 或 OpenAPI tags 自动生成分域统计，避免人工计数漂移。 |
| API-AUD-03 | P0 | `src/server/http.ts:44,51`；多数 handler 使用 `handle()`；`docs/api/ERRORS.md` 与 OpenAPI 的 `ErrorResponse` | OpenAPI 的 4xx/5xx JSON response 都引用规范化 `ErrorResponse { error: { code, message, details }, requestId }`，当前通用 handler 实际返回 legacy `{ error: string }`，且未知 domain 异常用中文 message 正则推断为 400/500。媒体 route 还返回纯文本 `Forbidden`/`Not found`。README 虽描述迁移期兼容，但 OpenAPI 与运行时并非同一 wire contract。 | 后端接入前统一 server error factory（稳定 code、requestId、details）；在此之前将 OpenAPI 清楚标为 future contract，并增加逐 route response-shape 测试。 |
| API-AUD-04 | P1 | `src/server/account-boundaries.ts:226`；`/api/team/members/{memberId}` OpenAPI responses | `PATCH /api/team/members/{memberId}` 当成员不存在时实际抛出 **404**，OpenAPI 仅声明 200/400/401/403/409/500，漏掉 404。 | 增补 404 `ErrorResponse` 并为不存在成员增加 route-level contract test。 |
| API-AUD-05 | P1 | `src/app/api/account/route.ts`、`account/handoffs/route.ts`、`team/route.ts`、`shared-assets/route.ts`、`identity/route.ts`、`preferences/route.ts`、`notifications/route.ts`；这些 GET operation 的 OpenAPI security | 以上 7 个 GET 在匿名 fixture 下实际返回 **200 projection**（如 `permission-denied`、`authentication-required`、公开浏览者或空通知），但 OpenAPI 标为 `x-authorization: owner` + `bearerAuth`。`ACCOUNT_EXTERNAL_COMMANDS.md` 也明确把匿名 handoff 写为 200 projection。未来服务无法同时“Bearer 必需”与“匿名拿到该 200 body”。 | 为每个 route 明确二选一：将读取 projection 作为 public/local-display contract，或让真实 API 返回 401 并把 projection 转换留在前端 adapter；随后使 OpenAPI、场景和文档同向。 |
| API-AUD-06 | P1 | OpenAPI operation example metadata 审计 | 92 个 operation 中 **52 个没有 request/response example metadata**。新近账户命令（`GET/POST /api/access-key`、`GET /api/account/handoffs`、`POST /api/team/invites`、`PATCH /api/team/members/{memberId}`）和 TV Show engagement（`GET/POST /api/showcase/{snapshotId}/engagement`）均无样本。它们正包含状态机、匿名门或幂等语义，是后端交接风险最高的一组。 | 为这些 operation 至少提供 success、认证/权限失败、幂等 replay/冲突（写命令）样本，并将 examples 接入 OpenAPI `components.examples` 或 operation examples。 |
| API-AUD-07 | P2 | `src/contracts/__tests__/openapi.test.ts`、`scripts/verify-api-contract.mjs` | 现有静态门验证集合、引用、路径参数与少量 schema，但不执行 92 个 route，也不校验运行时成功/错误 body 是否能被对应 OpenAPI schema 解析；因此 API-AUD-03/04 不会阻断 CI。 | 添加 manifest 驱动的 route smoke matrix：每 operation 至少验证成功 content type/schema，错误 fixture 验证 status + `ErrorResponse`；对 body 命令增加 request schema、幂等 replay 和相同 key 不同输入的 409。 |
| API-AUD-08 | P2 | `docs/api/README.md:77` 对 transport header 的表述；`AccessKeyCommandRequest`、`CreateTeamInviteRequest`、`UpdateTeamMemberRequest` | README 把 idempotency key 作为“调用方 header”的示例，而三个账户/团队命令和 Script V2 实际把 `idempotencyKey` 置于 JSON body。没有全局 header 约定，但文案容易让 future adapter 在错误位置注入 key。 | 明确：本仓的幂等键为 operation schema 的 body 字段；若未来采用 `Idempotency-Key` header，应作为 versioned contract 迁移并同时保留兼容策略。 |

## 示例覆盖的优先补齐顺序

1. **P0：错误 envelope** — 先让任意一条 `handle()` 4xx/5xx 与 OpenAPI `ErrorResponse` 相同，再扩展到所有 JSON routes；媒体 binary/text error 需单独声明或归一化。
2. **P1：账户与团队命令** — 为 Access Key create/rotate/revoke、同键 replay、同键不同 command 的 409、邀请 seat 满、owner 修改和未知 member 的 404 固化样本。
3. **P1：匿名读取决策** — Account/identity/team/handoff 选择 public display projection 或 401 backend resource model，禁止混合语义。
4. **P1：公开互动** — engagement 的匿名 POST 401、已登录 like/unlike/share、刷新后 state 及不会改动冻结 snapshot 的样本。
5. **P2：全表生成验证** — 把 example 覆盖、status 集合和 schema 解析纳入 CI，而不是只验证路由名集合。

## 可执行复核命令

```bash
# 现有结构校验：route.ts、manifest、OpenAPI、内部引用、version 和 JSON examples。
node scripts/verify-api-contract.mjs

# OpenAPI/manifest 结构测试（当前 16 assertions）。
pnpm exec vitest run src/contracts/__tests__/openapi.test.ts

# 无依赖地重算权威总量；应输出 55 92 与 1.25.0-showcase-account-commands。
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

# 定位本审计记录的旧总量和需要统一的 legacy error path。
rg -n '47 个 path|82 个 operation|NextResponse\.json\(\{ error: error\.message \}' docs/api src/server/http.ts
```

## 审计边界

本文件记录缺口，不改变 `openapi.yaml`、mock route、contract schema 或前端行为。`1.25.0` 的
55/92 路由集合可继续作为 frontend-only 演示基线；在上述 P0/P1 项关闭前，不应将其宣称为可直接
用于真实后端生成客户端的完全 wire-compatible API。
