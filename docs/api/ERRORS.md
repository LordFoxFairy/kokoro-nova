# API 错误契约

## 规范化 ErrorResponse 与迁移边界

未来后端交接的所有非 2xx 响应统一使用 OpenAPI `ErrorResponse`：

```ts
type ErrorResponse = {
  error: {
    code: ErrorCode
    message: string
    details?: unknown
  }
  requestId: string
}
```

`message` 面向用户，可以本地化；`code` 面向程序，不随文案改变；`details` 只放恢复操作
必需的结构化信息；`requestId` 用于问题定位。不得在错误中返回 Cookie、Token、Access Key、
文件系统绝对路径或上游私密响应。

`openapi.yaml` 的每个 4xx/5xx JSON response 已引用该 schema；它是后端实现、消费者契约测试和
新 transport adapter 的唯一规范化目标。`401 UNAUTHENTICATED`、`403 FORBIDDEN` 与资源级
`404 NOT_FOUND` 的授权语义见 [`AUTHORIZATION.md`](AUTHORIZATION.md)。

### 迁移边界

`src/server/http.ts` 的通用 `handle()` 路径现已返回完整 `ErrorResponse`（稳定 code 与
fixture-stable requestId）。`src/api/client.ts` 在兼容期仍接受旧/新 envelope，以便 future adapter
或未迁移的专门 transport 保持 `ApiError.status/message` 兼容；object-shaped JSON error 的 `requestId` 同时保留在 `ApiError.requestId`。

兼容输入 `{ "error": "message" }` 在 OpenAPI components 中仍命名为
`LegacyErrorResponse` 并标记 deprecated；它只用于读取旧 adapter/专门 transport 的响应，
不得重新加入新的 operation response。

专门 transport 仍是单独边界：Presence 的握手前和 POST JSON 错误已归一化为完整
`ErrorResponse`，但成功 GET 始终为 SSE，建流后的异常以关闭/重连处理；媒体的 403/404 是浏览器资源加载用的纯文本，SVG preview 尚无受控 error response。它们不能被泛化 JSON handler 的
迁移结果掩盖；完整剩余范围见 [`ERROR_ENVELOPE_MIGRATION_MATRIX.md`](ERROR_ENVELOPE_MIGRATION_MATRIX.md)。

后端切换时先在 adapter 或服务端把上游错误归一化为 `ErrorResponse`，再逐 route 删除旧形状；
不得让页面组件处理 legacy 分支。旧形状只描述当前 fixture 的兼容输入，不能作为新后端 response
schema，也不得新增到 operation response 中。

## 稳定错误码

| HTTP | code | 条件 | UI 行为 | 可重试 |
|---:|---|---|---|---:|
| 400 | `INVALID_INPUT` | 字段、组合、节点连接或业务前置条件无效 | 保留输入并在就近控件显示原因 | 否，需修改输入 |
| 401 | `UNAUTHENTICATED` | 未登录或登录凭据失效 | 打开登录门；官网研究时呼叫用户 | 登录后 |
| 403 | `FORBIDDEN` | 权限不足或 production 调用 dev route | 禁用动作并说明权限 | 否 |
| 404 | `NOT_FOUND` | 项目、画布、节点、任务、资产或快照不存在 | 返回上一层并刷新集合 | 刷新后 |
| 409 | `REVISION_CONFLICT` | `expectedRevision` 落后 | 拉取最新文档并重放一次 mutation | 是，最多一次 |
| 409 | `EDIT_LEASE_CONFLICT` | 同画布已有未过期 editor lease | 保留 presence/follow，显示“获取编辑权”重试 | 对方释放或 TTL 后 |
| 409 | `SESSION_EXPIRED` | 编辑租约失效或被另一会话接管 | 阻断编辑并要求刷新 | 刷新后 |
| 409 | `ALREADY_TERMINAL` | 对终态任务执行不兼容动作 | 使用服务端终态覆盖本地 | 否 |
| 410 | `QUOTE_EXPIRED` | 报价超出 `expiresAt` | 关闭旧确认门并重新报价 | 是，重新创建报价 |
| 422 | `INVALID_DATA` | 服务响应或 fixture 不符合 Schema | 显示通用数据错误并记录 requestId | 修复契约后 |
| 422 | `COMPLIANCE_BLOCKED` | 人像、版权或素材合规未通过 | 展示阻断原因，不产生可用产物 | 修改素材后 |
| 402 | `INSUFFICIENT_CREDITS` | 可用积分小于预留额 | 打开积分/会员入口 | 充值后 |
| 429 | `RATE_LIMITED` | 并发或频率超限 | 展示等待时间，禁用重复提交 | 是，按 retryAfter |
| 499 | `CANCELLED` | 客户端取消上传或合成 | 收敛到已取消并清理暂存数据 | 可重新创建 |
| 500 | `INTERNAL_ERROR` | 未分类 mock/服务异常 | Toast + requestId；不改本地成功状态 | 是 |
| 502 | `INVALID_JSON` | 上游返回不可解析 JSON | 通用服务异常 | 是 |
| 502 | `INVALID_DATA` | 2xx body 未通过 Zod | 通用服务异常并记录 issues | 修复契约后 |
| 503 | `SERVICE_UNAVAILABLE` | 本地合成环境缺少 ffmpeg | 保留时间线并提示安装运行依赖 | 环境就绪后 |
| 504 | `TIMEOUT` | 视频合成超过服务端执行预算 | 保留时间线和参数，允许用户重试 | 是 |

## 结构化 details

### Revision conflict

```json
{
  "error": {
    "code": "REVISION_CONFLICT",
    "message": "画布版本冲突",
    "details": {
      "canvasId": "can_video_main",
      "expectedRevision": 7,
      "currentRevision": 8
    }
  },
  "requestId": "req_fixture_revision_01"
}
```

### Rate limit

```json
{
  "error": {
    "code": "RATE_LIMITED",
    "message": "当前生成并发已满",
    "details": {
      "retryAfterSeconds": 30,
      "active": 2,
      "limit": 2
    }
  },
  "requestId": "req_fixture_rate_01"
}
```

### Compliance block

```json
{
  "error": {
    "code": "COMPLIANCE_BLOCKED",
    "message": "素材合规校验未通过",
    "details": {
      "reason": "portrait-consent-required",
      "inputIds": ["asset_portrait_01"]
    }
  },
  "requestId": "req_fixture_compliance_01"
}
```

## 前端处理顺序

1. transport 读取完整 response text；
2. JSON 解析失败转为 `INVALID_JSON`，不向组件抛原始 `SyntaxError`；
3. 非 2xx 先解析新/旧 error envelope；
4. 2xx 使用 endpoint Zod Schema 校验；
5. 页面按 `code` 决定登录门、刷新、重放、积分门或就近错误；
6. 未识别 code 走 `HTTP_ERROR`，保留 status 和安全 message。

## Mock 场景对应

| code/状态 | 场景 |
|---|---|
| `UNAUTHENTICATED` | `anonymous` |
| `SESSION_EXPIRED` | `session-expired` |
| `REVISION_CONFLICT` | `revision-conflict` |
| `COMPLIANCE_BLOCKED` | `video-compliance-blocked` |
| 普通任务失败 | `video-failed` |
| 用户取消 | `video-cancelled` |

错误场景必须能通过 `/api/dev/scenario` 重建，不能依赖随机失败率。
