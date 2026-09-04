# Kokoro Nova 产品演示 Runbook

## 边界

演示模式是 **frontend-only** 的本地 Next.js 应用：浏览器页面、App Router
route handlers、Zustand 编辑器状态和文件型 mock store 都在同一个进程中运行。

- 生成链路使用仓库内的 `mock-offline` provider，输入相同就得到相同的本地 SVG / WAV
  /（本机有 ffmpeg 时）MP4 结果。
- 不连接真实模型、外部 API、账户系统或付费服务，也不代表生产部署拓扑。
- `.demo-data/` 是演示状态目录；它与 `pnpm dev` 默认使用的 `.data/` 分开。
- `/api/dev/*` 仅用于开发演示和 fixture 检查，不是生产 API。

## 一键启动

在仓库根目录执行：

```bash
pnpm install
pnpm demo
```

打开 <http://localhost:3300>。默认值如下：

| 项目 | `pnpm dev`（保持不变） | `pnpm demo` |
| --- | --- | --- |
| 端口 | `3200` | `3300` |
| 文件数据 | `.data/` | `.demo-data/` |
| Next dist | `.next/` | `.next-demo/` |

因此可以同时运行 `pnpm dev` 与 `pnpm demo`；两者不会争用端口、Next 构建目录或
workspace 状态。

## 覆盖默认值

优先使用 `DEMO_*` 变量；也支持直接使用 Next/store 的运行时变量：

```bash
DEMO_PORT=3301 \
DEMO_DATA_DIR=/tmp/kokoro-nova-demo-data \
DEMO_NEXT_DIST_DIR=.next-demo-3301 \
pnpm demo
```

等价的通用变量是 `PORT`、`DATA_DIR`、`NEXT_DIST_DIR`。相对数据目录和 dist 目录
以仓库根目录为基准；绝对路径按原值使用。`DATA_DIR` 的解析由
`src/server/store.ts` 统一负责，所有 route handler 继续走同一个 store 接口。

## 最小 smoke

```bash
pnpm demo:smoke
```

该命令使用同一组隔离默认值，启动 demo server，检查首页返回成功，并检查
`GET /api/dev/scenario` 返回有效的确定性 fixture envelope，然后自动退出。它不执行
Docker build，也不触发真实生成服务。

需要手工恢复演示 fixture 时：

```bash
curl -sS -X POST http://localhost:3300/api/dev/reset
```

演示结束后按 `Ctrl-C`；临时目录可以删除：

```bash
rm -rf .demo-data .next-demo
```

## 产品演示路径

1. 从首页创建一个项目，进入 workflow canvas。
2. 放置文本、图片或视频节点，编辑提示词并观察画布与 storyboard 的同一份文档投影。
3. 提交生成时使用 mock provider；确认门、任务进度、产物写回和积分结算均为本地
   可重复流程。
4. 切换 storyboard 查看 Audio / Text / Image / Video 列，或打开 Agent 面板演示
   本地 mutation 提案与确认门。
5. 需要回到干净状态时调用上面的 dev reset，或删除 `DATA_DIR` 指向的目录后重启。

## 交接检查点

- 产品演示只依赖本仓库和 `pnpm install` 后的本地依赖。
- 真实模型接入仍从 `src/server/generation/provider.ts` 开始；本 runbook 不改变该
  接入边界。
- 持久化替换仍从 `src/server/store.ts` 开始；demo 只通过 `DATA_DIR` 选择隔离的
  文件目录，不复制或旁路 store 逻辑。
