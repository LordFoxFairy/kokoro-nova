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

## `:3210` 孤儿恢复

默认 isolated 模式在 OS 临时目录维护按 workspace SHA-256 和端口隔离的 control marker；marker
记录 runner 启动的进程组。每次 `pnpm e2e` 在 Playwright 的端口探测之前只处理该 marker：

1. marker 对应的 listener 或同一进程组仍在 `:3210` 时，输出 `reclaiming runner-owned orphan`，
   停止该进程组并等待端口释放；
2. `:3210` 有 listener 但没有匹配 marker 时，立即报出 listener pid，既不复用也不终止它；
3. Playwright 结束时启动器收到信号会停止自己启动的进程组并删除 marker。

因此 `:3200` 从不在恢复检查的端口集合中，`E2E_REUSE_SERVER` 也不会改变这一规则。
