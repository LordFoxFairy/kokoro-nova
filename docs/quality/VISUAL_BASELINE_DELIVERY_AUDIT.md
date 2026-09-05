# 1440×900 Visual Baseline Delivery Audit

- 状态：**macOS visual release lane 已启用；Linux canonical baseline 尚未引导**
- 审计日期：2026-09-05
- 范围：已跟踪的 Playwright 1440×900 像素基线、其来源 spec、平台可比性，以及 Video / Clip Editor 的视觉缺口。
- 非范围：不更改 UI、截图、Playwright/CI 配置、fixture 或发布工作流；不将浏览器交互测试误报为像素基线。

## 1. 审计结论

仓库当前有 **57** 张已跟踪的 `*-darwin.png` 像素基线，全部由 fixture 驱动的 1440×900 状态产生。它们证明 macOS/Darwin 上的局部视觉契约已经存在；它们**不**构成 Ubuntu GitHub Actions 的可比较 release baseline，因为仓库没有任何批准的 `*-linux.png` 文件。GitHub Actions 已启用 macOS-14 的 visual regression lane，并在 `ci.yml` 中以独立端口、数据目录和 Next 输出目录运行；Linux canonical baseline 仍未引导。

`playwright.config.ts` 的默认 desktop viewport 为 1440×900、`locale: zh-CN`，但默认 `deviceScaleFactor` 是 2；大部分 visual spec 另行设为 1，少数仅继承默认。Canonical Linux 引导前必须把每个纳入 gate 的 spec 的 viewport、scale、browser 版本和字体解析结果记录到 artifact，不能把“同为 1440×900”当作相同像素平台。

现有核心 browser E2E 已为 Script V2 和 Video/Clip flow 提供状态与持久化证据；其中相当一部分没有截图断言。本审计将它们明确为待补的视觉状态，而不是假定 core E2E 覆盖等价于视觉验收。

## 2. 已提交的像素基线清单

下表逐项映射已跟踪 baseline 到产生它的 test。`Darwin` 表示基线名称为 `*-darwin.png`；`Linux` 均为 `未引导`，而不是未检查即视为通过。

| Surface | 1440×900 visual state / baseline stem | 来源 Playwright test | Darwin | Linux |
| --- | --- | --- | --- | --- |
| Home / Projects | authenticated home / `home-authenticated-dark` | `home-visual-parity.spec.ts` | 已提交 | 未引导 |
| Home / Projects | authenticated four-card projects / `project-authenticated-dark` | `home-visual-parity.spec.ts` | 已提交 | 未引导 |
| Canvas | empty workflow / `canvas-empty-dark` | `canvas-parity.spec.ts` | 已提交 | 未引导 |
| Canvas | node context menu / `canvas-node-context-menu-dark` | `canvas-parity.spec.ts` | 已提交 | 未引导 |
| Canvas | add menu / `canvas-add-menu-dark` | `canvas-parity.spec.ts` | 已提交 | 未引导 |
| Canvas | populated workflow / `canvas-populated-dark` | `canvas-parity.spec.ts` | 已提交 | 未引导 |
| Storyboard | default projection / `storyboard-dark` | `canvas-parity.spec.ts` | 已提交 | 未引导 |
| Storyboard | agent panel / `storyboard-agent-dark` | `canvas-parity.spec.ts` | 已提交 | 未引导 |
| Storyboard | card actions / `storyboard-card-actions-dark` | `canvas-parity.spec.ts` | 已提交 | 未引导 |
| Script V2 | empty node / `script-v2-node-empty` | `script-v2.spec.ts` | 已提交 | 未引导 |
| Script V2 | generator / `script-v2-generator` | `script-v2.spec.ts` | 已提交 | 未引导 |
| Script V2 | model catalog / `script-v2-model-catalog` | `script-v2.spec.ts` | 已提交 | 未引导 |
| Script V2 | shot confirmation / `script-v2-shots` | `script-v2.spec.ts` | 已提交 | 未引导 |
| Script V2 | prepare assets / `script-v2-assets` | `script-v2.spec.ts` | 已提交 | 未引导 |
| Script V2 | compose prompts / `script-v2-prompts` | `script-v2.spec.ts` | 已提交 | 未引导 |
| Script V2 | prompt detail / `script-v2-prompt-detail` | `script-v2.spec.ts` | 已提交 | 未引导 |
| Script V2 | batch image dialog / `script-v2-batch-image` | `script-v2.spec.ts` | 已提交 | 未引导 |
| Text editor | node editor / `text-node-editor-dark` | `text-editor.spec.ts` | 已提交 | 未引导 |
| Text editor | model catalog / `text-model-catalog-dark` | `text-editor.spec.ts` | 已提交 | 未引导 |
| Text editor | document toolbar / `text-document-toolbar-dark` | `text-editor.spec.ts` | 已提交 | 未引导 |
| Text editor | expanded editor / `text-expanded-editor-dark` | `text-editor.spec.ts` | 已提交 | 未引导 |
| Image editor | node editor / `image-node-editor-dark` | `image-editor.spec.ts` | 已提交 | 未引导 |
| Image editor | model catalog / `image-model-catalog-dark` | `image-editor.spec.ts` | 已提交 | 未引导 |
| Image editor | output popover / `image-output-popover-dark` | `image-editor.spec.ts` | 已提交 | 未引导 |
| Image editor | reference selection / `image-reference-selection-dark` | `image-editor.spec.ts` | 已提交 | 未引导 |
| Image editor | style market / `image-style-market-dark` | `image-editor.spec.ts` | 已提交 | 未引导 |
| Audio editor | seed editor / `audio-seed-editor-dark` | `audio-editor.spec.ts` | 已提交 | 未引导 |
| Audio editor | model catalog / `audio-model-catalog-dark` | `audio-editor.spec.ts` | 已提交 | 未引导 |
| Audio editor | MiniMax advanced / `audio-minimax-advanced-dark` | `audio-editor.spec.ts` | 已提交 | 未引导 |
| Audio editor | Mureka editor / `audio-mureka-editor-dark` | `audio-editor.spec.ts` | 已提交 | 未引导 |
| Audio editor | voice library / `audio-voice-library` | `audio-editor.spec.ts` | 已提交 | 未引导 |
| Audio editor | voice clone / `audio-voice-clone` | `audio-editor.spec.ts` | 已提交 | 未引导 |
| Video node editor | node editor / `video-node-editor-dark` | `video-editor.spec.ts` | 已提交 | 未引导 |
| Video node editor | model catalog / `video-model-catalog-dark` | `video-editor.spec.ts` | 已提交 | 未引导 |
| Video node editor | reference picker / `video-reference-picker-dark` | `video-editor.spec.ts` | 已提交 | 未引导 |
| Video node editor | camera library / `video-camera-library-dark` | `video-editor.spec.ts` | 已提交 | 未引导 |
| Video compositor | empty editor / `video-compositor-empty` | `video-compositor.spec.ts` | 已提交 | 未引导 |
| Video compositor | transition controls / `video-compositor-transition` | `video-compositor.spec.ts` | 已提交 | 未引导 |
| Video compositor | subtitle controls / `video-compositor-subtitle` | `video-compositor.spec.ts` | 已提交 | 未引导 |
| Video compositor | populated timeline / `video-compositor-timeline` | `video-compositor.spec.ts` | 已提交 | 未引导 |
| Video compositor | seeded mixed-media timeline / `video-clip-editor-seeded-mixed-media` | `video-clip-editor-visual.spec.ts` | 已提交 | 未引导 |
| Video compositor | trim controls / `video-compositor-trim` | `video-compositor.spec.ts` | 已提交 | 未引导 |
| Account | identity menu / `account-identity-menu-dark` | `account-identity.spec.ts` | 已提交 | 未引导 |
| Account | light preferences menu / `account-identity-menu-light-preferences` | `account-identity.spec.ts` | 已提交 | 未引导 |
| Recent surface | skill author workbench / `skill-author-workbench` | `recent-surfaces-visual.spec.ts` | 已提交 | 未引导 |
| Recent surface | account shared assets / `account-team-shared-assets` | `recent-surfaces-visual.spec.ts` | 已提交 | 未引导 |
| Recent surface | TV Show quality menu / `tv-show-player-quality-menu` | `recent-surfaces-visual.spec.ts` | 已提交 | 未引导 |
| Recent surface | follower lease / `canvas-presence-follower-lease` | `recent-surfaces-visual.spec.ts` | 已提交 | 未引导 |
| Public discovery | TV Show directory / `tv-show-directory-dark` | `public-discovery.spec.ts` | 已提交 | 未引导 |
| Public discovery | TV Show detail / `tv-show-detail-dark` | `public-discovery.spec.ts` | 已提交 | 未引导 |
| Public discovery | clone login gate / `tv-show-clone-login-gate-dark` | `public-discovery.spec.ts` | 已提交 | 未引导 |
| Skills | market / `skills-market-dark` | `skills-parity.spec.ts` | 已提交 | 未引导 |
| Skills | detail carousel / `skills-detail-carousel-dark` | `skills-parity.spec.ts` | 已提交 | 未引导 |
| Workflow | director studio / `director-studio-dark` | `workflow.spec.ts` | 已提交 | 未引导 |
| History | current canvas history panel / `history-panel-current-canvas` | `history-panel.spec.ts` | 已提交 | 未引导 |

`skills-parity.spec.ts`、`workflow.spec.ts` 等还会写出用于人工查看的 `page.screenshot(...)` 文件；未通过 `toHaveScreenshot` 比对的输出不计入上表的像素回归 baseline。

## 3. Darwin → Linux canonical baseline blocker

| 阻塞项 | 当前可核查证据 | 交付前必须完成的动作 |
| --- | --- | --- |
| Snapshot platform suffix | `git ls-files 'e2e/*snapshots/*.png'` 返回 57 个 `-darwin.png`，没有 `-linux.png`。 | 固定 Linux contract 后只生成/评审同名 `-linux.png`；不可重命名或覆盖 Darwin 基线。 |
| OS/browser reproducibility | CI 是 `ubuntu-latest`，现有 CI 通过 `playwright install --with-deps chromium` 获取浏览器。 | 以 immutable Playwright Linux image digest 锁定 Chromium 与系统库，记录 Playwright/Chromium version。 |
| Font reproducibility | CSS 使用 system fallback；仓库没有提交 `.woff/.woff2/.ttf/.otf`。 | 镜像安装并锁定 CJK/emoji/Latin 字体包；归档 `fc-match`、`fc-list` 与 CSS fallback 解析结果。 |
| Scale consistency | 全局 config `deviceScaleFactor: 2`；常见 visual spec 用 `test.use(... deviceScaleFactor: 1)`，未纳入 gate 的 spec 不能从名称推断 scale。 | 每个 canonical spec 统一并显式申明 `deviceScaleFactor: 1`、`scale: 'css'` 或记录有意例外；引导/比较命令必须相同。 |
| Service isolation | 常规 E2E 使用 `:3210/.data-e2e/.next-e2e`；首页 visual spec 需要 `REGRESSION_BASE_URL`。 | macOS visual lane 使用专有 `:3220/.data-e2e-visual/.next-e2e-visual`，让 `REGRESSION_BASE_URL` 指向同一 Playwright-owned service。 |
| Failure diagnosis | macOS visual lane 已产出 HTML reporter、`test-results`、expected/actual/diff、trace，并上传平台记录 artifact；失败 trace 会保留。 | Linux canonical lane 启用时继续上传同一组诊断，并补齐字体/browser manifest。 |

这些条件与 [Visual CI 发布门设计](./VISUAL_CI_RELEASE_GATE_DESIGN.md) 一致；该设计是 platform contract 的权威实施方案，本文件只审计可交付清单。

## 4. 人工批准与 CI artifact 操作清单

### 4.1 一次性 Linux baseline 引导

1. 评审固定 Playwright Linux image 的 Dockerfile、immutable image digest、Playwright/Chromium 版本与字体包版本；把 `fc-match 'Noto Sans CJK SC'`、`fc-match sans-serif`、`fc-list : family` 保存为审查附件。
2. 使用同一 image digest 和隔离环境运行首批 spec，并且仅在受控引导任务中传入 `--update-snapshots`：

   ```bash
   E2E_PORT=3220 \
   E2E_DATA_DIR=.data-visual \
   E2E_NEXT_DIST_DIR=.next-visual \
   REGRESSION_BASE_URL=http://127.0.0.1:3220 \
   pnpm exec playwright test --update-snapshots \
     e2e/home-visual-parity.spec.ts \
     e2e/canvas-parity.spec.ts \
     e2e/script-v2.spec.ts \
     e2e/recent-surfaces-visual.spec.ts
   ```

3. 人工逐张检查新增 `*-linux.png`：中文排版、图标、canvas 边距、overlay z-index、禁用态与 fixture 文本必须和批准的产品状态一致。审阅记录须含 route、test、baseline 文件、image digest 和字体 manifest。
4. 只提交经批准的 Linux PNG；Darwin PNG 不变。相同 digest 下运行无 `--update-snapshots` 连续三次，三次均无 diff。
5. 故意制造一次受控 screenshot diff，确认 artifact 实际含 expected/actual/diff、trace、HTML report 和 font/browser manifest；随后还原试验。

### 4.2 日常 CI failure artifact

每次 visual-regression job 必须上传如下内容，包含成功与失败路径所需的最小可复核事实：

| Artifact | 用途 | 必需时机 |
| --- | --- | --- |
| `test-results/` | Playwright expected/actual/diff 与保留的 trace | `if: always()` |
| `playwright-report/` | 人工浏览 screenshot 与 trace 的 HTML report | `if: always()` |
| `font-families.txt`、`fc-match` 输出 | 区分字体漂移和产品差异 | `if: always()` |
| Playwright/Chromium 版本、image digest | 证明比对发生在 canonical platform | `if: always()` |
| runner base URL、port、data/dist directory | 排除误连 `:3200` 与 fixture 污染 | `if: always()` |

常规 PR/main/tag job 不得携带 `--update-snapshots`，不得自动提交 PNG。只有 4.1 的人工批准流程允许更新 Linux files。

## 5. Video / Clip Editor 视觉状态缺口

已有 Video 像素基线覆盖视频节点编辑器（编辑器、模型目录、reference picker、camera library）与 compositor（empty、transition、subtitle、timeline、trim）。下列已被交互 E2E 覆盖的状态仍**没有**对应 `toHaveScreenshot` pixel baseline：

| 缺失 visual state | 已有行为测试 | 缺口说明 / 推荐优先级 |
| --- | --- | --- |
| 本地视频素材 HTML5 drag/drop 后的 populated timeline | `video-media-interaction-core.spec.ts` | 有 functional drag/drop 与 reload 断言，但没有验证落点、轨道密度、缩略图或 playhead 的 1440×900 布局。P0。 |
| Preview `<video>` paused 与 playing/playhead progression | `video-media-interaction-core.spec.ts` | 有播放/暂停与时间推进行为断言，没有 preview frame、control state、playhead 的视觉状态。P0。 |
| local export success（下载文件名、toast、任务状态清理） | `video-media-interaction-core.spec.ts` | 有 export 行为验证，没有 success feedback/下载 affordance 的 visual evidence。P1。 |
| render/composite failure 与 cancel，且不污染 timeline | `clip-editor-core.spec.ts`、`script-v2-video-editor-core.spec.ts` | 有不写入与取消行为断言，没有 failure/cancel message、retry/disabled/loading state baseline。P0。 |
| clip split 与 trim result | `clip-editor-core.spec.ts` | `video-compositor-trim` 是已有 editor control state，未证明 split 后多 clip topology 与 handle visual state。P1。 |
| speed change、transition applied、subtitle applied | `clip-editor-core.spec.ts` | compositor 已有 transition/subtitle controls；没有已应用后 timeline/inspector 的 compact visual baseline。P1。 |
| independent audio track、volume、mute | `clip-editor-core.spec.ts` | 没有音轨 lane、音量/mute indicator 的 pixel contract。P1。 |
| Script V2 video materialize → Storyboard → editor handoff | `script-v2-video-editor-core.spec.ts` | 有 source metadata、failure/cancel 不污染的 functional evidence；没有交接时 Storyboard/Editor 的 visual state。P1。 |
| Video generation retry/replay/partial success and reload re-entry | Script V2 audit documents this as P1 gap | 尚无等价 core E2E 与 screenshot；应先补功能状态，再选稳定状态纳入 visual suite。P0 功能缺口、随后 P1 visual。 |

在 Linux canonical baseline 未获批准前，以上条目只应作为后续 screenshot 设计与交互验收矩阵，不应新增未评审的 Darwin snapshot 作为 CI 门禁。

## 6. 交付验收标准

visual baseline delivery 可宣布进入 required gate 的最低证据为：

- 57 个 Darwin baseline 的清单、来源 spec 和不跨平台使用的限制均保持可追溯；
- macOS-14 visual lane 使用独立服务并由 `verify`、browser interaction 和 visual regression job 共同保护发布条件；
- 首批 selected spec 有人工审批的 Linux counterparts，并在同一 immutable image digest、同字体 manifest 下连续三次无 diff；
- visual CI 每次归档上述 failure diagnostics；
- `publish` 仅在 `verify`、core E2E 与 visual-regression 均通过后执行；
- Video/Clip 表列出的 P0 状态至少各有一个 approved 1440×900 screenshot contract，不能以单纯 core E2E 替代视觉证据；seeded mixed-media timeline 已有独立 Darwin 像素基线，local export success、失败态和 Linux canonical baseline 仍是后续证据。

在满足这些标准前，当前 57 张 Darwin baseline 与 browser core E2E 均是有效的局部证据，不足以支持“Linux visual release gate 已交付”的结论。
