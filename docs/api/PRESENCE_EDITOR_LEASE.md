# Presence 与编辑席位契约

本页定义 Canvas 的本地协作边界。它是 frontend-only fixture：状态仅保留在当前 Next
进程内，绝不写入 `WorkflowDocument`、workspace seed 或浏览器持久化存储。

## 目标状态机

```text
idle ── acquire ──▶ active ── release / stream close ──▶ idle
             │
             └── 409 EDIT_LEASE_CONFLICT ──▶ following (仍保留 SSE presence)

active ── heartbeat(leaseId) ──▶ active（expiresAt 后移）
active ── TTL / stale token ──▶ expired；后续 heartbeat/release = 409 SESSION_EXPIRED
```

- 同一个 `canvasId` 同时只有一个 `active` editor lease；多个协作者可以保持 cursor、viewport
  与 follow。
- `acquire` 被占用时返回 `409 EDIT_LEASE_CONFLICT`，并包含 `canvasId`、
  `ownerClientId`、`expiresAt`；前端保留连接，展示“获取编辑权”重试按钮。
- `release` 与 `heartbeat` 必须同时匹配 `clientId + leaseId`。旧 tab 的迟到清理只得到
  `SESSION_EXPIRED`，不能删除后继 owner 的 lease。
- 正常 SSE abort 会释放同一 participant 的当前 lease；异常断线最多在 15 秒 TTL 后回收。
- 编辑席位不会提高 canvas revision，也不会改变 nodes、edges、groups 或 document viewport。
  真正 workflow mutation 仍由 revision optimistic lock 独立保护。

## HTTP 形状

同一 typed endpoint 保留现有 heartbeat 兼容性：

```http
POST /api/presence/CANVAS_ID
Content-Type: application/json

{ "action": "acquire", "participantId": "CLIENT_ID" }
```

成功回包示例：[acquire request](examples/presence-lease-acquire.request.json) / [response](examples/presence-lease-acquire.response.json)。

```ts
type EditorLease = {
  canvasId: string
  clientId: string
  leaseId: string
  acquiredAt: string
  heartbeatAt: string
  expiresAt: string
  state: 'active'
}

type LeaseRequest =
  | { action: 'acquire'; participantId: string }
  | { action: 'heartbeat'; participantId: string; leaseId: string }
  | { action: 'release'; participantId: string; leaseId: string }
```

Zod source is [`src/contracts/presence.ts`](../../src/contracts/presence.ts). UI uses
`client.presence.lease()` in [`src/lib/presence-client.ts`](../../src/lib/presence-client.ts);
server ownership is in [`src/server/presence.ts`](../../src/server/presence.ts).

## Backend handoff

A multi-instance backend must replace the process-local room map with an atomic shared lease
store and realtime bus. The atomic acquire condition is `no active unexpired lease for canvasId`
or `same clientId`; it must never become a workflow document write. Retain the `leaseId`
compare-and-release invariant, 409 codes, and the ability for rejected editors to remain
followers on the SSE/WebSocket stream.
