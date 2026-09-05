# Jobs deterministic lifecycle fixtures

`/api/jobs` is a frontend-only state-machine seam. It never creates a remote
model task or payment. A normal request omits `fixture`; fixtures exist so
Playwright and the future backend adapter can replay failures with stable input.

```http
POST /api/jobs
Content-Type: application/json

{"canvasId":"can_video_main","nodeId":"node_video_01","fixture":"pending"}
```

## State graph and charging boundary

```text
awaiting_confirmation
  ├─ confirm (valid quote) → queued/pending → running
  │                                      ├→ succeeded          reserve + settle once
  │                                      ├→ failed             reserve + release once
  │                                      ├→ cancelled          reserve + release once
  │                                      └→ compliance_blocked reserve + release once
  ├─ confirm (expired / unsupported) → awaiting_confirmation (no reserve)
  └─ cancel → cancelled (no reserve)

failed | cancelled | compliance_blocked
  └─ retry → fresh awaiting_confirmation job (no inherited reservation)
```

`queued` is the persisted local equivalent of the upstream pending status.
A `pending` fixture keeps it visible until the first GET poll, so reload can
prove that status reconstruction does not depend on a component timer.

## Local fixture matrix

| `fixture` | Confirm / poll result | Ledger invariant |
|---|---|---|
| `pending` | `queued → running → succeeded` | `reserve`, then one `settle` |
| `succeeded` | `running → succeeded` | `reserve`, then one `settle` |
| `failed` | `running → failed` | `reserve`, then one `release` |
| `cancelled` | `running → cancelled` | `reserve`, then one `release` |
| `compliance_blocked` | `running → compliance_blocked` | `reserve`, then one `release` |
| `network_offline` | submit fails deterministically | `reserve`, then one `release` |
| `capability_unsupported` | confirm returns 400; quote remains open | no `reserve` |
| `expired_quote` | confirm returns 400; quote remains open | no `reserve` |

The outcome is encoded in the persisted `invocationId`, not held in a module
map. Clearing the runner's process-local provider handle table therefore causes
safe reattachment with that same invocation rather than a second reservation.

## Idempotent actions

- `confirm` on a non-`awaiting_confirmation` job returns its existing job;
- `cancel` is terminal/idempotent and writes at most one `release:${jobId}`;
- terminal `poll` is read-only;
- `POST /api/jobs/{jobId}` with `{ "action": "retry" }` returns one new
  `awaiting_confirmation` job for the source terminal job. Replaying the same
  retry returns that same retry job, with a new stable provider invocation;
- every ledger row uses a `logicalChargeId`: `reserve:JOB_ID`, `settle:JOB_ID`,
  or `release:JOB_ID`.

`reserve` 的 idempotency lookup 先于余额检查：已经写入 `reserve:JOB_ID` 的重放确认直接
返回 no-op，不会因为其他正在运行的任务后来冻结了剩余余额而返回“积分不足”。这使 browser retry、
HTTP 重送和未来 provider webhook 的重复投递保持同一条账本链。

A retry always receives a new 15-minute local quote and starts with `attempt: 0`;
its counter becomes `1` only after its own confirmation. It never resurrects the
source job's reservation or artifacts.
