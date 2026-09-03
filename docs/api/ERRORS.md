# API 错误契约

## 目标 envelope

所有非 2xx 响应最终统一为：

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

兼容期内，Route Handler 仍可能返回 `{error: string}`。API Client 按 HTTP status 映射稳定
code，并保持 `ApiError.status/message` 兼容现有调用方。

## 稳定错误码

| HTTP | code | 条件 | UI 行为 | 可重试 |
|---:|---|---|---|---:|
| 400 | `INVALID_INPUT` | 字段、组合、节点连接或业务前置条件无效 | 保留输入并在就近控件显示原因 | 否，需修改输入 |
| 401 | `UNAUTHENTICATED` | 未登录或登录凭据失效 | 打开登录门；官网研究时呼叫用户 | 登录后 |
| 403 | `FORBIDDEN` | 权限不足或 production 调用 dev route | 禁用动作并说明权限 | 否 |
| 404 | `NOT_FOUND` | 项目、画布、节点、任务、资产或快照不存在 | 返回上一层并刷新集合 | 刷新后 |
| 409 | `REVISION_CONFLICT` | `expectedRevision` 落后 | 拉取最新文档并重放一次 mutation | 是，最多一次 |
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
