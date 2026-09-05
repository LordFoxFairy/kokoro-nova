# README / Demo / Container 文档一致性审计

审计日期：2026-09-05  
审计范围：`docs/CODEBASE_MAP.md`、`README.md`、`docs/DEMO_RUNBOOK.md`、
`package.json`；为核对可执行性，额外只读检查了
`scripts/demo.mjs`、`playwright.config.ts`、`e2e/helpers/runner-config.ts`、
`src/server/store.ts`、`Dockerfile`、`.github/workflows/ci.yml` 和
`docs/CONTAINER.md`。本次审计没有执行服务、Docker、测试或 Git 操作。

## 结论

`pnpm dev`、`pnpm demo`、`pnpm demo:smoke` 的命令名、默认端口和 demo
数据/Next 输出隔离均与实现一致。Dockerfile、GHCR 工作流及容器说明也已对齐。

审计后的修订已关闭三项文档不一致：README 现说明 E2E 使用专属 `:3210` 且拒绝复用
`:3200`；README/CI 现只称 GHCR 发布，首次公开拉取仍要求在 Package settings 确认 Public；
Runbook reset 命令使用 `DEMO_PORT`，并回退到默认 `:3300`。

## 已核对的运行契约

| 入口 | 当前命令实现 | 端口 | 数据目录 | Next 输出目录 | 结论与证据 |
| --- | --- | ---: | --- | --- | --- |
| 交互开发 | `next dev --turbopack -p 3200` | 3200 | `.data/` | `.next/` | 一致。`package.json:8` 固定端口；`src/server/store.ts:50` 缺省 `.data`；`next.config.mjs:7` 缺省 `.next`；README:40–45、67–70 与 Runbook:25–32 表述相符。 |
| 产品演示 | `node scripts/demo.mjs` | 3300 | `.demo-data/` | `.next-demo/` | 一致。`scripts/demo.mjs:5–18` 设定默认值并传入子进程；README:43–45、67–70 与 Runbook:23–32 相符。 |
| 演示 smoke | `node scripts/demo.mjs --smoke` | 3300（默认） | `.demo-data/` | `.next-demo/` | 一致。实现等待 `/` 与 `/api/dev/scenario`，检查 `scenario.id`，随后向子进程发送终止信号（`scripts/demo.mjs:30–65`）；Runbook:49–57 的描述准确。 |
| 隔离 E2E | `playwright test` | 3210 | `.data-e2e/` | `.next-e2e/` | Runbook:89–129 与实现一致。`runner-config.ts:3–5, 148–178` 给出默认值并注入隔离环境；`playwright.config.ts:37–50` 设置 `reuseExistingServer: false`。README 有冲突，见下表。 |
| 生产预览 | `NEXT_DIST_DIR=.next-prod next build` / `next start -p 3200` | 3200 | `.data/`（或 `DATA_DIR`） | `.next-prod/` | `package.json:11–12` 与 Dockerfile 的构建/运行目录一致；README:62–63 的端口结论正确。 |

### 环境变量优先级和隔离

| 场景 | 实现事实 | 文档状态 |
| --- | --- | --- |
| Demo 覆盖 | `DEMO_PORT` / `DEMO_DATA_DIR` / `DEMO_NEXT_DIST_DIR` 优先于对应的通用 `PORT` / `DATA_DIR` / `NEXT_DIST_DIR`，随后才回退默认值（`scripts/demo.mjs:5–7`）。 | Runbook:34–47 与 README:67–70 一致。 |
| Demo 并行运行 | demo 子进程注入 `.demo-data`、`.next-demo`，dev 的缺省值为 `.data`、`.next`。 | Runbook:25–32 的“不争用端口、Next 构建目录或 workspace 状态”有实现支撑。 |
| E2E 保护 | `E2E_PORT=3200` 会在配置计算时抛错；`E2E_BASE_URL` 指向 `:3200` 也会抛错（`runner-config.ts:53–71, 116–134`）。 | Runbook:103–128 的隔离及外部服务指引准确。 |
| E2E dist 限制 | `E2E_NEXT_DIST_DIR` 必须是仓库内相对路径（`runner-config.ts:78–92`）。 | Runbook 的示例使用相对目录，正确。 |

## Docker / GHCR 契约

| 项目 | 现状与证据 | 文档状态 |
| --- | --- | --- |
| 镜像运行 | Dockerfile 生产阶段以 `NEXT_DIST_DIR=.next-prod`、`PORT=3200`、`HOSTNAME=0.0.0.0` 运行，暴露 3200，默认持久卷为 `/app/.data`。 | `docs/CONTAINER.md` 的运行示例和环境变量表相符；README:79–83 的 pull/run 示例相符。 |
| 数据目录 | Dockerfile 将工作目录设为 `/app` 且创建 `/app/.data`；store 将缺省相对 `.data` 解析到当前工作目录，因此有效默认目录为 `/app/.data`。 | `docs/CONTAINER.md` 的 `DATA_DIR` 默认说明成立，尽管该值由工作目录和 store 缺省值导出，而非 Dockerfile 显式 `ENV DATA_DIR`。 |
| 发布条件 | CI 对 main、PR 和 `v*` tag 都运行 install、typecheck、lint、test、build（`.github/workflows/ci.yml:4–43`）；仅 `push` 的 `refs/tags/v*` 在 verify 成功后运行 publish（:46–92）。 | README:74–77 与 `docs/CONTAINER.md:10–30` 的主结论相符。 |
| 发布标签 | metadata-action 为 semver tag 生成完整版本、major.minor、major，并生成 `latest` 和长 SHA 标签（`.github/workflows/ci.yml:74–82`）。 | `docs/CONTAINER.md:32–39` 的 `v0.1.0` 示例准确；应将它理解为语义化版本 tag 的结果。 |
| 可见性 | 工作流有 `packages: write`，但没有 API 设置包可见性的步骤。`docs/CONTAINER.md:41–45` 明确要求首次发布后在 Package settings 设为 Public。 | README:74–76 的“自动将公开镜像发布”表述过强，见不一致项 C-02。 |

## 不一致与待修正项

| ID | 优先级 | 不一致 | 证据 | 建议的可验证修正 |
| --- | --- | --- | --- | --- |
| C-01 | P1（已关闭） | README 曾说 `pnpm e2e` 复用 `:3200`；runner 实际专属 `:3210`。 | README、Runbook、`playwright.config.ts`、`runner-config.ts`。 | README 现明确 `.data-e2e/.next-e2e/:3210` 隔离；运行“E2E 隔离验收”确认。 |
| C-02 | P1（已关闭） | README 曾把 tag publish 直接称为“公开镜像”。 | README、`docs/CONTAINER.md`、CI workflow。 | README 和 workflow 现使用 GHCR 发布表述；首次公开拉取仍按 Package settings + 匿名 pull 验收。 |
| C-03 | P2（已关闭） | Runbook reset curl 曾固定为 `:3300`。 | Runbook 与 `scripts/demo.mjs`。 | 命令现使用 `${DEMO_PORT:-${PORT:-3300}}`；运行“Demo 覆盖验收”确认。 |

## 可执行验收矩阵

以下命令用于后续修正文档或发布前验证；命令会创建各自声明的数据/Next 输出目录，运行前应确认目标端口未被其他进程占用。

### 1. 命令与默认隔离

```bash
# 交互开发：预期 http://localhost:3200、.data、.next
pnpm dev

# 另一个终端：演示：预期 http://localhost:3300、.demo-data、.next-demo
pnpm demo

# 独立 smoke：预期打印 Demo smoke passed，并自行退出
pnpm demo:smoke
```

验收：在 `pnpm dev` 与 `pnpm demo` 同时运行时，分别请求 `:3200/api/dev/scenario`
和 `:3300/api/dev/scenario`；在一个实例内 `POST /api/dev/reset` 后，另一个实例的
fixture 状态不应改变。停止进程后，仅清理本次产生的 `.demo-data/.next-demo`，不要清理
正在交互使用的 `.data/.next`。

### 2. Demo 覆盖和 reset 端口

```bash
DEMO_PORT=3301 \
DEMO_DATA_DIR=/tmp/kokoro-nova-demo-audit \
DEMO_NEXT_DIST_DIR=.next-demo-audit \
pnpm demo

# 另一个终端；3301 是上面实际启动的端口
curl -fsS -X POST http://localhost:3301/api/dev/reset
```

验收：`http://localhost:3301/api/dev/scenario` 成功；仓库内 `.demo-data` 不因该运行
而成为该实例的数据目录；reset 请求使用已覆盖的端口而非固定 `:3300`。

### 3. E2E 隔离和 :3200 保护

```bash
# 默认：Playwright 自管 3210/.data-e2e/.next-e2e
pnpm e2e

# 保护断言：两条都必须在浏览器启动前失败
E2E_PORT=3200 pnpm e2e
E2E_BASE_URL=http://127.0.0.1:3200 pnpm e2e
```

验收：第一条测试结束后 `:3200` 的交互服务仍存活且状态未被 E2E fixture 重置；后两条
报出 `:3200` 保留/不允许作为 E2E 目标的配置错误。若需手动隔离服务，按
`docs/DEMO_RUNBOOK.md:105–115` 的 `:3245` 示例运行。

### 4. Docker 运行时契约

```bash
docker build --pull -t kokoro-nova:readme-demo-audit .
docker run --rm --name kokoro-nova-readme-demo-audit \
  -p 3200:3200 -v kokoro-nova-audit-data:/app/.data \
  kokoro-nova:readme-demo-audit
```

验收：`curl -f http://localhost:3200/` 成功；容器日志/行为显示进程监听 3200；重启使用
同一 named volume 后 workspace 数据仍存在。覆盖端口时，使用 `-e PORT=8080 -p 8080:8080`
并请求 `:8080`。

### 5. GHCR tag 发布与公开拉取

```bash
git tag -a v0.1.0 -m "release v0.1.0"
git push origin v0.1.0

docker pull ghcr.io/lordfoxfairy/kokoro-nova:0.1.0
docker pull ghcr.io/lordfoxfairy/kokoro-nova:latest
```

验收：GitHub Actions 的 `Verify application` 成功后才运行 `Publish public GHCR image`；
镜像具备 `0.1.0`、`0.1`、`0`、`latest` 和 SHA 标签。首次发布还须在 Packages 设置确认
Public，并从未登录的 Docker 环境完成 pull，才能证明 README 中的“公开”交付事实。

## 审计边界

- 本文只核验文档与本仓库实现的静态契约；不把本次未实际启动的服务、未构建的镜像或未触发的
  GitHub tag 当作已通过验收。
- `docs/CODEBASE_MAP.md` 的命令清单（typecheck/lint/test/build/e2e/verify）与
  `package.json` 相符；它不声明 demo 或 GHCR 细节，故没有额外冲突。
- 未修改 README、Runbook、Dockerfile、工作流、package scripts 或 Git 状态；上述三项
  仅是后续文档维护待办。
