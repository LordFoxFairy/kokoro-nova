# Visual CI 发布门设计与平台阻塞证据

- 状态：**待视觉平台基线引导；当前不接入 main/tag required gate**
- 审核日期：2026-09-05
- 范围：本地 deterministic fixture 的 1440×900 Playwright 像素回归。本文不描述官网 API、账户数据或任何真实生成行为。
- 约束：截图基线只可通过人工评审后的专用引导流程创建或更新；常规 PR/main/tag job 永远不带 `--update-snapshots`。

## 1. 本次判定

当前仓库具备现有 visual spec、语义前置断言、失败 trace 和 `test-results` artifact 路径，但尚未具备一个已批准的**固定 OS + Chromium + 字体**截图平台。因此，本次不直接在 `.github/workflows/ci.yml` 的 Ubuntu runner 上启用视觉比对；这样做会把平台切换产生的整批 diff 误报成产品回归，并使 tag 发布门不稳定。

这不是将 visual CI 降级为手工检查。下文给出唯一推荐的 Linux release-gate contract、基线引导规则、精确命令、workflow 结构、artifact 规则和启用前检查表。满足第 5 节的证据后，即可按第 6 节把 `visual-regression` job 接入现有 CI，并让 `publish` 依赖它。

## 2. 当前证据与阻塞条件

| 检查项 | 直接证据 | 对 release gate 的影响 |
| --- | --- | --- |
| CI OS | `.github/workflows/ci.yml` 的 `verify`、`e2e` 都是 `ubuntu-latest`，并以 `pnpm exec playwright install --with-deps chromium` 安装浏览器。 | 现有 CI 运行环境是 Linux。 |
| 已提交 baseline 的平台 | `git ls-files 'e2e/*snapshots/*.png'` 共 54 张，全部名为 `*-darwin.png`。 | Playwright 在 Linux 会解析 `*-linux.png` 路径；仓库当前没有已审查的 Linux baseline。 |
| 浏览器版本 | 当前 lockfile 解析到 Playwright `1.62.0`；本地 `pnpm exec playwright --version` 输出 `Version 1.62.0`。 | Docker/runner 合约须锁定同一 Playwright 发行版，并以 image digest 固化浏览器层。 |
| 字体输入 | `src/app/globals.css` 的 `--font-sans` 是 `-apple-system`、`BlinkMacSystemFont`、`Segoe UI`、`PingFang SC`、`Hiragino Sans GB`、`Microsoft YaHei`、`Noto Sans SC` 的 system fallback；仓库没有 `.woff/.woff2/.ttf/.otf` 文件。 | 同一 CSS 在 macOS 与 Ubuntu 的 glyph metric 并不固定；单靠 `document.fonts.ready` 只保证加载完成，不保证字体文件一致。 |
| 稳定等待 | `e2e/helpers/visual-stability.ts` 等待 fonts、图片 decode 与双帧，并禁用动画；各 visual spec 均保留语义断言。 | 具备截图捕获稳定性基础，但不能替代平台/字体固定。 |
| fixture 隔离 | `playwright.config.ts` 默认拥有 `:3210`、`.data-e2e`、`.next-e2e`；`home-visual-parity.spec.ts` 额外要求 `REGRESSION_BASE_URL`。 | visual job 必须为同一 Playwright-owned server 同时设置 `E2E_PORT` 与 `REGRESSION_BASE_URL`，且不使用 `:3200`。 |
| 失败诊断 | 配置只启用 `list` 与 `isolated-observability-reporter`；当前 workflow 上传 `test-results` 与可能不存在的 `playwright-report`。 | screenshot actual/expected/diff 与 trace 在 `test-results` 可归档；HTML report 尚未实际生成，启用 gate 时需添加 HTML reporter。 |

**阻塞结论：**现有 Darwin baseline 与 Ubuntu CI 没有可比性，且字体资产/镜像 digest 未被锁定。现阶段添加 job 会必然请求缺失的 Linux 基线或形成非产品 diff。此文不新增或更新任何 baseline。

## 3. 推荐的固定平台 contract

选择单一 Linux contract，而不是让 GitHub hosted macOS image 承担 canonical baseline：Linux Playwright 容器可按 digest 复现，长期开销和运行速度也更适合 PR/main/tag gate。

| 项目 | release-gate 约束 |
| --- | --- |
| Runner | `ubuntu-latest` 仅负责调度；测试在固定容器执行。 |
| 容器 | 专用 Playwright 镜像，基于 `mcr.microsoft.com/playwright:v1.62.0-noble`，发布 workflow 使用 immutable `@sha256:IMAGE_DIGEST`，不得使用浮动 tag。 |
| Browser | Chromium，`pnpm exec playwright --version` 必须为 `1.62.0`，并记录 `chromium --version` 到 job summary。 |
| Font package | 将确定版本的 `fonts-noto-cjk`、`fonts-noto-color-emoji`、`fonts-liberation` 装入专用镜像；镜像构建时及 job 中分别执行 `fc-match 'Noto Sans CJK SC'` 和 `fc-match sans-serif`。系统 fallback 的解析结果写入 artifact。 |
| Viewport | 1440×900 CSS px、`deviceScaleFactor: 1`、`locale: zh-CN`、`scale: css`；这是现有 visual spec 明确设置的 desktop contract。 |
| Fixture service | `E2E_PORT=3220`、`E2E_DATA_DIR=.data-visual`、`E2E_NEXT_DIST_DIR=.next-visual`、`REGRESSION_BASE_URL=http://127.0.0.1:3220`。全部由 Playwright 管理，不复用 `:3200`/`.data`/`.next`。 |
| Parallelism | 保持现有 `fullyParallel: false` 与 `workers: 1`，因为 file-backed fixture store 是共享状态。 |
| Baseline naming | 使用 Playwright 默认 Linux snapshot suffix，提交的 canonical 文件为 `*-linux.png`。Darwin 文件保留作现有本地证据，不作为 Linux gate 输入。 |

## 4. 首批固定 visual suite

以下只采用已存在的 specs；每个状态都已有到达状态的 role/test-id 语义断言后再截图。首批覆盖 acceptance plan 所需的首页/项目、canvas、Storyboard、Script V2 三阶段以及一个协作/公开/账户状态，而不是把全部 54 张基线直接塞入 release lane。

| Spec | 已有 visual states | 对应验收面 |
| --- | --- | --- |
| `e2e/home-visual-parity.spec.ts` | authenticated 首页、项目四卡 | discovery / project desktop chrome |
| `e2e/canvas-parity.spec.ts` | empty canvas、add menu、populated workflow、Storyboard 与 card action | Canvas / Storyboard |
| `e2e/script-v2.spec.ts` | node、generator、catalog、确认镜头、资产、提示词、detail、batch dialog | Script V2 三阶段及 gate surface |
| `e2e/recent-surfaces-visual.spec.ts` | skill author、account team、TV Show quality menu、presence follower lease | 跨 surface 与协作可见状态 |

常规 job 的精确调用如下。它启动同一个 `:3220` isolated service，令 `REGRESSION_BASE_URL` 与 config 的 server plan 一致，故首页/项目 visual spec 不会跳过：

```bash
E2E_PORT=3220 \
E2E_DATA_DIR=.data-visual \
E2E_NEXT_DIST_DIR=.next-visual \
REGRESSION_BASE_URL=http://127.0.0.1:3220 \
pnpm exec playwright test \
  e2e/home-visual-parity.spec.ts \
  e2e/canvas-parity.spec.ts \
  e2e/script-v2.spec.ts \
  e2e/recent-surfaces-visual.spec.ts
```

这条命令**不包含** `--update-snapshots`。在首批 Linux baseline 已获审批后，它就是 main/tag 的 blocker；PR 也使用同一命令，确保 PR 与发布候选的渲染环境相同。

## 5. 一次性 baseline 引导与批准证据

引导不是 release workflow 的功能，必须由受控、人工批准的单独操作完成。开始前需要以下所有证据：

1. 专用镜像 Dockerfile、Playwright `1.62.0` 与镜像 digest 已代码评审；`fc-match` 输出明确保存为审批附件。
2. 在该 image digest 中运行第 4 节同一 spec 选择，第一次以 `--update-snapshots` 产出 **Linux** 文件；不修改 Darwin baseline。
3. 人工按 route/state 审阅每个新增 `*-linux.png`，并逐项确认中文字体、canvas 文本、边距、图标、overlay 层级和 disabled gate 没有伪差异。
4. 将 Linux baseline 提交后，在**相同 digest**中连续无更新运行三次；三次均没有 screenshot diff。
5. 失败运行验证：临时改动一项基线对应的视觉输出，确认 artifact 内同时包含 actual/expected/diff、trace、HTML report 和 font/browser manifest；随后还原该试验改动。
6. 通过上述复验后才允许把 `.github` job 标为 required，tag 的 `publish` 才可依赖该 job。

未具备以上证据前，现有 `pnpm e2e:ci` 仍是可用的 browser interaction gate，但不应被解释为视觉 release gate。

## 6. 启用时的 workflow 结构

以下是待第 5 节完成后追加到 `.github/workflows/ci.yml` 的结构。`PLAYWRIGHT_IMAGE_DIGEST` 必须替换为已审批的 immutable digest；它刻意不是一个可直接运行的浮动镜像引用。

```yaml
  visual-regression:
    name: Visual regression (Linux 1440x900)
    runs-on: ubuntu-latest
    timeout-minutes: 45
    container:
      image: ghcr.io/lordfoxfairy/kokoro-nova-playwright@sha256:PLAYWRIGHT_IMAGE_DIGEST
    env:
      E2E_PORT: '3220'
      E2E_DATA_DIR: .data-visual
      E2E_NEXT_DIST_DIR: .next-visual
      REGRESSION_BASE_URL: http://127.0.0.1:3220
      PLAYWRIGHT_BROWSERS_PATH: /ms-playwright
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: '11.2.2'
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: pnpm
      - name: Install dependencies
        run: pnpm install --frozen-lockfile
      - name: Record visual platform contract
        run: |
          pnpm exec playwright --version
          chromium --version || chromium-browser --version
          fc-match 'Noto Sans CJK SC'
          fc-match sans-serif
          fc-list : family | sort -u > test-results/font-families.txt
      - name: Compare approved visual baselines
        run: >-
          pnpm exec playwright test
          e2e/home-visual-parity.spec.ts
          e2e/canvas-parity.spec.ts
          e2e/script-v2.spec.ts
          e2e/recent-surfaces-visual.spec.ts
      - name: Upload visual diagnostics
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: visual-regression-${{ github.run_id }}
          path: |
            test-results
            playwright-report
          if-no-files-found: warn
          retention-days: 14
```

同时修改 `playwright.config.ts` 的 reporter 列表，追加 Playwright HTML reporter，确保上例中的 `playwright-report` 在失败和通过时都实际存在：

```ts
["html", { outputFolder: "playwright-report", open: "never" }]
```

启用后将 `publish.needs` 从 `[verify, e2e]` 改为 `[verify, e2e, visual-regression]`。对失败事件，Playwright 的 `toHaveScreenshot` 输出在 `test-results` 内提供 expected/actual/diff，`trace: "retain-on-failure"` 提供 trace；HTML report、font manifest 和 isolated reporter 的 URL/data-dir 记录让人工能够区分视觉回归、字体漂移和 fixture 问题。

## 7. 日常操作规则

1. 产品改动触发 screenshot diff 时，先查看 artifact 的 font/browser manifest；版本或 `fc-match` 偏离属于 platform incident，不得以更新基线处理。
2. 视觉确有意修改时，先在同一 canonical image digest 的受控引导流程更新相应 `*-linux.png`；PR 附 route、fixture、语义断言和 expected/actual/diff 人工审阅链接。
3. 不允许 PR/main/tag workflow 传入 `--update-snapshots`，也不允许 job 自动提交 baseline。
4. 更新 image digest、Playwright 或字体包属于 baseline migration：完整第 5 节流程重新执行，旧 Linux baseline 不得直接沿用。
5. 保留 Darwin baseline，直到 macOS local workflow 不再需要它；Linux release gate 只读取其 canonical `*-linux.png` 伙伴文件。

## 8. 本次可复核验证

本设计基于以下只读验证：

```bash
ruby -e 'require "yaml"; YAML.load_file(".github/workflows/ci.yml"); puts "ci.yml: valid YAML"'
pnpm exec playwright --version
find e2e -path '*snapshots/*.png' -type f
find . -path './node_modules' -prune -o \
  \( -iname '*.woff' -o -iname '*.woff2' -o -iname '*.ttf' -o -iname '*.otf' \) -print
```

观察结果：现有 workflow YAML 可解析；Playwright 为 `1.62.0`；54 个 tracked baseline 全部是 Darwin suffix；仓库没有自带字体文件。这些证据支持“先固定平台并生成经人工审批的 Linux baseline，再接入 visual release gate”的顺序。
