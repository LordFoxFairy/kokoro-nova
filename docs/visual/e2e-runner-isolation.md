# Playwright 隔离与可观测性基线

- Runner 默认目标：`http://127.0.0.1:3210`
- Runner 数据：`.data-e2e/`
- Runner Next 输出：`.next-e2e/`
- 交互开发预览：`http://localhost:3200`（明确不属于 Playwright runner）

## 前置条件

Playwright global setup 只请求 runner 的 `baseURL`，依序校验：

1. `GET /` 返回成功；
2. 非 production 目标的 `GET /api/dev/scenario` 返回可解析的 fixture envelope；
3. `scenario.id` 非空，且 `projects/canvases/jobs/assets` 全部是数字。

前置检查是只读的，不调用 reset。各规格自行选择 scenario/reset，避免全局 reset 与并行用例
产生 fixture race。

## 失败证据

全局前置失败与单用例 unexpected outcome 都输出以下字段：

```text
mode=<isolated|external|production>
baseURL=<实际请求 URL>
serverDataDir=<服务使用或调用方声明的数据目录>
nextDistDir=<本地 runner 时的 Next 输出目录>
```

外部服务模式要求提供 `E2E_BASE_URL`；这个地址为 `:3200` 时会被拒绝，因此 runner 不会探测、
复用或 reset 交互预览。若调用方知道外部服务的数据目录，应同时提供
`E2E_SERVER_DATA_DIR`，使失败 trace 能对应到实际 fixture 文件。

## `:3210` 占用策略

默认 isolated 模式由 Playwright 直接拥有 `next dev` 子进程；测试结束时由 Playwright 负责停止它。
`reuseExistingServer: false` 使 `:3210` 已被占用时立即失败，不会复用、探测或终止任何已有监听者。
这避免了测试进程误杀交互演示服务；`:3200` 始终不在 runner 的目标集合中。
