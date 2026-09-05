# Demo 与视觉 QA 可靠性审计

**审计范围：** 本地可运行 demo、确定性 mock 重置、截图视觉回归、交互 E2E、GitHub CI 与 GHCR tag 发布。  
**审计日期：** 2026-09-05  
**审计方法：** 只读检查 `docs/CODEBASE_MAP.md`、`package.json`、`README.md`、`docs/DEMO_RUNBOOK.md`、`docs/CONTAINER.md`、`scripts/demo.mjs`、`e2e/`、`playwright.config.ts`、`.github/workflows/ci.yml`。本文件不代表某次命令的执行结果。

## 1. 结论与验收边界

仓库已经具备可分离的交互开发（`:3200`）、产品 demo（默认 `:3300`）和 Playwright 隔离测试（默认 `:3210`）三条运行路径；三者各自拥有数据目录与 Next 输出目录，设计上避免互相污染。核心优势是 fixture service 本身可被 E2E preflight 验证，且大量关键交互已在浏览器中被覆盖。

当前可靠性缺口集中在**剩余的自动化验收闭环而非产品缺少测试**：GitHub CI 已在独立 Ubuntu runner
执行 `pnpm e2e:ci` 的隔离核心 browser suite，并在失败时保存 Playwright diagnostics；`v*` 镜像发布同时依赖 verify
和 browser suite。完整 `pnpm e2e` 仍保留为本地/受控平台回归：它含 Darwin screenshot baseline，不能直接在
Ubuntu runner 上作为视觉结论。尚未纳入 CI 的是 `pnpm demo:smoke`、视觉基线与已发布 GHCR 镜像的启动验收。视觉
基线文件主要带有 `-darwin` 后缀，因此直接增加 Ubuntu 截图 job 前需要先确定跨平台截图策略。

本审计使用下列状态词：

- **现状**：代码或文档已经明确实现的能力。
- **建议**：尚未在本次检查中发现实现，需要后续排期和验证的改动。
- **验收证据**：某项建议完成后应在 PR、tag 或发布记录中保留的可复核输出。

## 2. 现状清单

| 范畴 | 现状 | 证据与影响 |
| --- | --- | --- |
| 交互开发 | `pnpm dev` 固定使用 `:3200`、`.data/`、`.next/`。 | `package.json` 与 `README.md` 明确该端口供交互预览使用。 |
| 产品 demo | `pnpm demo` 运行 `scripts/demo.mjs`，默认使用 `:3300`、`.demo-data/`、`.next-demo/`；允许 `DEMO_*` 或通用环境变量覆盖。 | demo 与 dev 的端口、数据、dist 均隔离。 |
| demo smoke | `pnpm demo:smoke` 启动 demo，轮询 `/`，并校验 `GET /api/dev/scenario` 返回带字符串 `scenario.id` 的 envelope，随后关闭子进程。 | 能发现启动失败和最小 fixture 服务失效；不覆盖创建、生成、截图或重置。 |
| mock 重置 | 开发 fixture endpoint 提供 `POST /api/dev/reset`；scenario endpoint 支持预置状态切换。演示文档给出手动 `curl` 重置方式。 | 多数 E2E 在测试前后调用 scenario/reset；但 demo 启动本身不会强制 reset，已有 `.demo-data/` 会保留。 |
| 默认 E2E 隔离 | Playwright 默认直接管理 `:3210`，使用 `.data-e2e/` 和 `.next-e2e/`，`reuseExistingServer: false`，拒绝使用 `:3200`。 | 避免测试静默连接交互开发服务；若 `:3210` 已被占用会明确失败。 |
| E2E preflight | global setup 先校验首页，再校验 fixture scenario envelope 及 projects/canvases/jobs/assets 四个数字计数。 | 浏览器启动前即可识别错误 URL、非 mock 服务或残缺 fixture。 |
| 交互覆盖 | `e2e/` 已涵盖项目/画布、文本/图片/音频/视频、Script V2、视频合成、Agent、素材、公开发现、账户、技能、协作 presence、生成/积分和生产 smoke 等多个 surface。 | 覆盖广度高；默认单 worker、非并行执行，符合共享文件 store 的约束。 |
| 可观测性 | 失败 reporter 输出 runner mode、base URL、数据目录与本地 dist；Playwright 保留失败 trace。 | 有利于将失败关联到实际 fixture 服务。 |
| 截图机制 | 多个 spec 使用 `toHaveScreenshot`，1440×900 为主基准；部分调用 `waitForStableVisuals`，关闭动画、等待字体和图片解码，并采用 `maxDiffPixelRatio: 0.0001`。 | 已有首页/项目、画布、故事板、编辑器、Script V2、账户、公开展示等基线。 |
| 视觉运行入口 | `home-visual-parity.spec.ts` 要求显式 `REGRESSION_BASE_URL`，未提供时跳过。 | 这使视觉首页/项目基线不会在默认 `pnpm e2e` 中运行。 |
| 当前 GitHub CI | `verify` job 在 main/PR/tag 上运行 frozen install、typecheck、lint、Vitest、production build；独立 `e2e` job 安装 Chromium 后以 `:3210/.data-e2e/.next-e2e` 运行 `pnpm e2e:ci`，其中包含 Script V2 的三阶段、镜头字段和批量 gate 核心流程，失败保存 diagnostics。 | 能防止基础编译、单测与核心浏览器交互回归；尚未执行 demo smoke、跨平台截图或镜像运行验证。 |
| GHCR 发布 | 仅在 `v*` tag 且 `verify` 成功后，workflow 使用 Buildx、metadata-action 与 GITHUB_TOKEN 推送 `ghcr.io/lordfoxfairy/kokoro-nova`。 | 有 tag、semver、latest、sha 标签和 GHA cache；发布路径目前没有容器启动/健康检查步骤。 |

## 3. 可执行的本地验收流程

### 3.1 运行前隔离规则

| 目标 | 命令/环境 | 预期隔离 | 通过条件 |
| --- | --- | --- | --- |
| 开发预览 | `pnpm dev` | `:3200` / `.data/` / `.next/` | 首页可打开；不作为 E2E 或截图基准服务。 |
| 稳定演示 | `pnpm demo` | `:3300` / `.demo-data/` / `.next-demo/` | 从新浏览器会话完成一条演示路径。 |
| demo 启动烟测 | `pnpm demo:smoke` | 同 demo 默认隔离 | 进程退出码为 0，输出包含 URL、scenario id、数据与 dist 目录。 |
| 默认 E2E | `pnpm e2e` | `:3210` / `.data-e2e/` / `.next-e2e/` | preflight 成功、所有未跳过用例通过、无意外 trace。 |
| 生产 E2E | `pnpm build && pnpm e2e:prod` | `.next-prod`，默认 `PROD_URL=http://localhost:3300` 由脚本启动 | 核心创建路径通过，且 `POST /api/dev/reset` 被拒绝。 |
| 视觉回归 | 启动一次性隔离服务后，以 `REGRESSION_BASE_URL` 指向它运行指定 visual spec | 独立 `DATA_DIR`、`NEXT_DIST_DIR` 和非 3200 端口 | 截图无 diff；服务与目录在运行记录中可追溯。 |

建议在执行前确认 `:3210` 和视觉专用端口没有其他监听者；不要让 E2E 复用 `:3200`。默认 Playwright runner 已对此做了防护，人工视觉命令也应遵循相同原则。

### 3.2 建议固化的 demo 重置协议

**现状：** demo 运行目录与开发目录隔离，但 `.demo-data/` 会跨次启动保留；文档提供手工 reset endpoint 与删除目录两种恢复方式。`demo:smoke` 仅验证服务可用，并不使数据回到已知起点。

**建议：** 新增一个明确、幂等、只作用于 demo 数据目录的 reset 命令（命名可为 `pnpm demo:reset`），并把演示主持人流程固定为：

1. 停止上一轮 demo，确认端口已释放。
2. 执行 demo reset；命令只允许删除或调用 `DEMO_DATA_DIR` 指向的状态，不得触及 `.data/`、`.data-e2e/` 或其他自定义目录。
3. 启动 `pnpm demo:smoke`；通过后启动 `pnpm demo`。
4. 在演示开场显示 scenario id 与启动时间，便于确认演示数据不是残留状态。
5. 演示结束记录所用环境变量；若演示修改了数据，下一次演示前重新执行 reset。

**验收证据：** 连续两次 reset 后请求 `/api/dev/scenario` 的 `scenario.id` 和四个 state count 一致；创建一个项目后再次 reset，项目不再存在；`.data/` 的文件修改时间和内容未改变。

### 3.3 建议固定的产品演示脚本

| 演示段落 | 起始 fixture | 最小操作 | 需要观察的可靠性信号 |
| --- | --- | --- | --- |
| 进入创作 | authenticated-empty | 首页创建项目进入 canvas | URL 同时含 `projectId` 与 `canvasId`，workflow canvas 可见。 |
| 工作流与故事板 | 新建 canvas | 加入文本/图片/视频节点，切换 storyboard | 同一文档投影一致；刷新后节点、连线和视图状态仍可读。 |
| 本地生成 | 可生成节点 | 提交、确认、等待、查看产物 | 本地 job 生命周期、产物写回和积分账本可解释；无外部调用。 |
| Script V2 | 新建 Script V2 | 进入、编辑镜头、准备资产、合成提示词 | stage 状态和编辑结果刷新后仍保留。 |
| 视频合成 | seeded/populated | 时间线编辑、预览/导出 | 任务失败时 retry 不破坏时间线；成功产物可访问。 |
| 公共与账户 surface | authenticated-populated / anonymous | 公开作品查看/克隆、账户账本 | 匿名门控和 authenticated mutation 分别符合 fixture 场景。 |

建议将上述段落做成演示 runbook 的“主持人检查表”，每段给出 1 个页面级 data-testid 或 URL/API 校验点，而不仅依赖肉眼判断。

## 4. 截图视觉回归审计与建议

### 4.1 已有基础

- 基线覆盖了关键大屏状态：首页/项目、canvas、storyboard、Script V2 三阶段、文本/图片/音频/视频编辑器、视频合成、技能、账户、presence 和公开发现。
- Playwright 基准 viewport 为 1440×900；绝大多数视觉断言使用严格的 `0.0001` diff ratio。
- 公共 `waitForStableVisuals` 已等待字体、图片和双帧渲染并禁用 CSS 动画；部分 spec 仍保留本地简化版 wait helper。

### 4.2 风险和建议

| 观察 | 风险 | 建议 | 验收证据 |
| --- | --- | --- | --- |
| 截图文件名显示 `-darwin`。 | Ubuntu GitHub runner 的字体、Chrome 渲染和 OS snapshot suffix 可能与现有基线不兼容。 | 先确定唯一受支持截图平台：推荐在固定 Playwright Docker 镜像内生成/比对 Linux 基线，或明确保留 macOS-only visual job。不要直接在 Ubuntu CI 启用现有 Darwin 基线。 | 新平台首次运行只使用 `--update-snapshots` 生成独立基线，经人工审批后提交；第二次无更新运行通过。 |
| `home-visual-parity.spec.ts` 依赖 `REGRESSION_BASE_URL`，默认 suite 跳过。 | 默认 E2E 绿灯不等于首页/项目视觉基线已比对。 | 建立独立 `e2e:visual` script：启动专用隔离 server、传递 `REGRESSION_BASE_URL`、只运行视觉 spec；其端口和目录由 CI job 唯一拥有。 | job 输出 base URL、fixture scenario、snapshot platform；任何 diff 产出 actual/diff/trace artifact。 |
| visual-stability helper 存在公共版和某些 spec 内联版。 | 稳定等待策略漂移会造成偶发 diff 或降低基线可信度。 | 迁移到一个公共 helper，统一字体、图片 decode、动画、portal、双帧等待与 screenshot 参数；每次迁移只做机械替换并单独 review。 | 多次连续 `e2e:visual` 运行无随机 diff；代码搜索不再存在重复 helper。 |
| 当前视觉基线以桌面 1440×900 为主。 | 关键 compact/responsive 路径可能只有语义 E2E，缺少视觉保护。 | 为已有 compact video compositor、侧栏收起、移动/窄屏关键路径选择少量基线；不要把所有组合状态截图化。 | 每个选定的 responsive surface 有一个明确 viewport、scenario 和 screenshot 名称。 |
| 严格 ratio 不能代替语义断言。 | 可访问性、按钮 disabled、overlay 层级、持久化失败可能肉眼近似但功能错误。 | 每张基线保留到达状态所需的 semantic assertions；截图后继续校验关键保存、导航或 API 响应。 | PR 中 visual spec 同时含可读 role/testid 断言和 screenshot 断言。 |

## 5. 交互 E2E 验收矩阵

| 层级 | 建议命令 | 必测内容 | 当前覆盖依据 | 建议门禁 |
| --- | --- | --- | --- | --- |
| Fixture/preflight | `pnpm e2e` | 首页、fixture envelope、state count、隔离 URL | `e2e-preflight.ts` | 所有 E2E job 必跑。 |
| 核心创作 | `pnpm e2e -- e2e/workflow.spec.ts e2e/canvas-parity.spec.ts` | 项目→画布→节点→连线→生成→storyboard、画布几何与键盘 | 两个 spec 已覆盖 | PR 必跑。 |
| 高风险编辑 | 分组运行 text/image/audio/video/script-v2/compositor specs | 模型选择、持久化、确认门、导出、失败与 retry | 对应 editor 与 lifecycle specs 已存在 | 修改该 surface 时必跑；主干 nightly/merge queue 全跑。 |
| 协作与状态 | `presence-concurrency`, `generation-ledger-lifecycle`, `scenarios` | 多浏览器、lease、刷新、账本、失败恢复 | 已有专项 spec | 触及 store/presence/jobs 时必跑。 |
| 公开与身份 | `public-discovery`, `showcase-interactions`, `account*`, `home-project-return-to` | anonymous gate、clone、identity、账本 | 已有专项 spec | 触及 auth/public/account API 时必跑。 |
| 生产最小路径 | `pnpm e2e:prod` | production server 创建路径、dev reset 禁止 | `production.spec.ts` opt-in | main 与 release candidate 必跑。 |
| 视觉 | 建议 `pnpm e2e:visual` | 已批准的 screenshot spec | 多套 baseline 已存在 | 受控平台上的 main/PR 必跑，更新基线须人工审批。 |

**建议的测试数据纪律：** 每个会写入 store 的 spec 必须在 `beforeEach` 选择已知 scenario 或 reset，并在 `afterEach` 复位；跨浏览器 spec 使用独立 browser context；测试不得依赖其他 spec 的执行顺序。当前配置 `fullyParallel: false`、`workers: 1` 与 file-backed store 相一致，除非每个 worker 取得独立 `DATA_DIR`，否则不建议增加 workers。

## 6. GitHub CI 与 GHCR 发布验收矩阵

### 6.1 当前 workflow 覆盖

| 事件 | 当前执行 | 当前未覆盖 |
| --- | --- | --- |
| Pull request | frozen install、typecheck、lint、Vitest、production build、隔离 Chromium core E2E | demo smoke、视觉回归、Docker build/run。 |
| push main | 与 PR 相同 | 同上。 |
| `v*` tag | verify 与隔离 Chromium E2E 通过后，Buildx 构建并推送 GHCR | 已发布镜像的 pull/run/HTTP smoke、容器内 fixture 验证、镜像 digest 级别的生产 E2E。 |

### 6.2 建议目标工作流

| Job | 触发 | 前置 | 步骤 | 通过条件 | 失败产物 |
| --- | --- | --- | --- | --- | --- |
| `verify` | PR/main/tag | 无 | 保持现有 frozen install、typecheck、lint、Vitest、build | 现有四项均为 0 | test log。 |
| `e2e` | PR/main/tag | 独立 Ubuntu runner | 安装 Chromium，以 `pnpm e2e:ci` 启动 :3210 的隔离 fixture server；涵盖账户、登录回跳、项目、生成/账本、合成、presence、公开互动及 Script V2 三阶段核心流 | preflight 和 core browser suite 均为 0；失败保存 trace/report | `test-results`、`playwright-report`。 |
| `demo-smoke` | PR/main/tag | dependencies install | `pnpm demo:smoke` | demo 子进程正常退出且 fixture envelope 合法 | server stdout/stderr、环境摘要。 |
| `e2e-core` | PR/main/tag | build 或隔离 dev service | 默认 `pnpm e2e`，可先显式限定核心 spec 后再扩展 | preflight 和所有未跳过用例通过 | Playwright trace、report、screenshots。 |
| `e2e-production` | main/tag；PR 可按变更路径触发 | production build | 以非 3200 端口运行 `.next-prod` 后执行 `pnpm e2e:prod` | 核心生产路径通过且 dev reset 拒绝 | trace 与 server log。 |
| `visual-regression` | main/PR；仅固定截图平台 | 专用 fixture server | 建议的 `e2e:visual` | 所有 approved baseline 无 diff | actual/diff/expected、trace、环境版本。 |
| `container-smoke` | tag，且 `verify` 成功 | 镜像 build | 先 `load` 到 runner，再以唯一端口运行；请求 `/`、`/api/dev/scenario`；可再执行 production E2E | image ID/digest 对应 tag，容器健康并服务 mock fixture | `docker logs`、inspect JSON、E2E trace。 |
| `publish` | tag | `verify` + container-smoke | 保持 metadata、push GHCR | 仅健康镜像被 push，输出 digest 与所有 tags | metadata 与 digest。 |
| `post-publish-pull-smoke` | tag | publish | 从 GHCR pull 刚发布的 digest，再运行同一 smoke | Registry 中镜像可匿名/目标身份拉取并实际启动 | pull output、digest、docker logs。 |

建议将发布拆为“本地构建并验收”与“push 后按 digest 回拉验收”两段：前者防止已知坏镜像入库，后者确认 tag、registry 权限和实际拉取路径无误。首次 GHCR 包仍需在 Package settings 确认 Public；这是一项仓库配置验收，不应被 workflow 的成功状态替代。

### 6.3 Tag 发布检查表

1. main 对应提交已通过 `verify`、demo smoke、核心 E2E、受控平台视觉回归与 production E2E。
2. 工作树无未审查截图基线或 fixture 数据变更；tag 指向已审查的 commit。
3. 推送符合 semver 的 `vX.Y.Z` tag。
4. workflow 的 container-smoke 记录 image ID、OCI labels、version/sha tag 和 `/api/dev/scenario` 校验结果。
5. publish 后记录 GHCR digest；以 digest 回拉验证，不只依赖 `latest`。
6. 首次或权限变更后，检查包为 Public，并在无登录环境执行一次 `docker pull` 验收。

## 7. 建议的落地顺序

1. **P0（部分完成）：** 隔离 `pnpm e2e:ci` 已加入 PR/main/tag CI，且上传失败 trace/report；继续将 `pnpm demo:smoke` 纳入 CI，并在确定截图平台后纳入完整 visual suite。
2. **P0：** 为 demo 建立显式、范围受限的 reset 命令和“reset → smoke → demo”主持人检查表。
3. **P1：** 决定视觉平台，建立独立 `e2e:visual` 入口和一次性服务编排；先迁移首页/项目与 canvas，再扩展全部既有基线。
4. **P1：** 让 tag 发布在 push 前完成 container-smoke，在 push 后执行 digest pull-smoke；将 publish 依赖链写入 workflow。
5. **P2：** 统一视觉稳定 helper，增加有限的 compact viewport 基线，并根据改动路径选择 E2E 分组门禁。

## 8. 最终验收定义

一个可交付演示版本同时满足以下条件：

- 新环境执行 reset、`pnpm demo:smoke` 和 `pnpm demo` 后，演示路径可从已知 fixture 起点稳定完成。
- 默认 E2E 从独立 `:3210` fixture 服务运行，不读取、复用或改写交互开发的 `:3200/.data/.next`。
- 受控平台的视觉 job 比对所有批准基线；任何差异都附带 expected/actual/diff/trace，并经人工确认后才更新基线。
- CI 不止验证编译：demo、核心浏览器交互、生产最小路径和必要的视觉回归都有可追溯结果。
- 每个 `v*` 镜像在 push 前已实际运行，在 GHCR push 后能按 digest 回拉并再次通过 HTTP/fixture smoke；公开可见性已被独立确认。
