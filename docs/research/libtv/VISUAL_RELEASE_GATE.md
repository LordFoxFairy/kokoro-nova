# 1440×900 视觉发布门

- 范围：仅覆盖本仓库可重复的本地 fixture、已提交的 Playwright 像素快照和真实浏览器渲染。
- 入口：`pnpm e2e:visual`。
- CI job：`Visual regression (macOS 1440x900)`；在 PR、`main` 与 `v*` tag 触发，tag 镜像发布依赖该 job。

## 固定执行契约

发布门使用 GitHub Actions `macos-14`，从 lockfile 安装 Playwright 所需的 Chromium。现有快照使用 Playwright 的 `-darwin` platform suffix，因此该 job 不跨 OS 读取基线；它以固定的 macOS job 标签、锁定依赖和每次归档的系统/浏览器/字体清单维持可复核性。

视觉命令固定以下资源，均由 Playwright 拥有：

| 项目 | 值 |
| --- | --- |
| viewport | `1440×900` CSS px |
| locale / screenshot scale | `zh-CN` / `css` |
| visual port | `3220` |
| fixture storage | `.data-e2e-visual` |
| Next output | `.next-e2e-visual` |
| regression base URL | `http://127.0.0.1:3220` |
| workers | Playwright config 的串行 `1` worker |

该入口从不指向交互式 `:3200`，也不使用 `.data`、`.data-e2e`、`.next` 或 `.next-e2e`。它不带 `--update-snapshots`，因此任何 actual/expected/diff 都是失败证据，不会自动修改基线。

## 当前 release suite

命令只执行已有的 snapshot-bearing journey：

1. `e2e/home-visual-parity.spec.ts`：登录首页和项目管理桌面层级；
2. `e2e/canvas-parity.spec.ts`：空画布、工具菜单、Workflow/Storyboard 关键状态；
3. `e2e/script-v2.spec.ts`：Script V2 三阶段与 gate surface；
4. `e2e/recent-surfaces-visual.spec.ts`：技能工作区、团队资产、TV Show 播放器和 presence lease。
5. `e2e/video-clip-editor-visual.spec.ts`：本地视频素材的可导出时间线与已选片段的裁切/变速控制态。

每个快照前保留已有的 role/test-id 状态断言和稳定等待（字体、图片 decode、视频首帧冻结、双帧、禁用动画）。这使 job 同时验证可达的 fixture state 与像素基线，而非只归档任意截图。

## 失败与发布证据

每次 job（成功或失败）上传 `visual-regression-<run-id>` artifact：

- `test-results/`：Playwright trace、expected/actual/diff 及 `visual-platform/platform.txt`；
- `playwright-report/`：HTML 浏览报告；
- platform manifest：macOS、架构、Playwright、Chromium executable/version 与系统字体清单。

基线更新不是 CI 行为：仅在同一 macOS contract 下人工审阅生成的 Darwin PNG 后才允许提交。任何平台、Chromium 或字体清单漂移都应先按 platform incident 检查，不得直接接受 snapshot 更新。
