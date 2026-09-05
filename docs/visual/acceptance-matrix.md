# 状态可见性与响应式验收矩阵

- 复核日期：2026-09-04
- 复核范围：`docs/visual/kokoro-nova-parity.md`、`docs/visual/state-visibility.md`、`docs/visual/responsive-followup.md`
- 视口：`1440×900`、`1024×768`、`768×700`
- 数据边界：仅本地 mock/scenario；浏览器复核使用临时 `DATA_DIR` 与临时端口
- 本次复核：隔离 `DATA_DIR` + 临时端口执行状态回归；视觉基线仅在人工核验后更新，不调用真实 provider。

## 结论速览

已有隔离浏览器证据覆盖桌面基线、项目/画布加载错误、空态、有内容态，以及视频任务的过期/有效等待确认、排队、运行、成功、失败、取消和合规阻断。首页和项目页现在也有独立的 `1440×900` Playwright 像素快照守门，基线固定在可重复的 `authenticated-populated` fixture；首页、项目页和 Showcase 额外以同一视口检查 loading/error/retry/empty 的可访问地标、键盘焦点和恢复路径。响应式跟进中记录的两个已修复问题仍成立：窄屏主工具栏的独立 `translate` 已清除，活动倒计时胶囊已禁止收缩换行。

仍需保留为遗留项：`768×700` 的 Storyboard 视频列操作需要横向滚动后才完整可见。

## 状态矩阵

| 状态 | fixture / 入口 | 1440×900 | 1024×768 | 768×700 | 可见性与恢复契约 | 结论 |
| --- | --- | --- | --- | --- | --- | --- |
| loading | `/project`，延迟 `GET /api/projects` | spinner、`aria-busy` | 同左；壳层收起 | 同左；无页面级横向溢出 | 列表未就绪时不显示空态；请求恢复后进入列表 | 通过（既有隔离证据） |
| loading | `/canvas?...`，延迟项目 bootstrap | `role=status`：`正在加载画布` | 同左 | 同左；底部控件不应覆盖加载层 | `aria-busy="true"`，完成后进入工作区 | 通过（既有隔离证据） |
| empty | `authenticated-empty` → `/project` | `还没有项目`、开始入口 | 侧栏收起，标题栏可见 | 两列布局，文本不应推出页面宽度 | 开始第一个项目、回收站和新建文件夹均 enabled | 通过；官网空态已直接确认 |
| empty | 空工作流 → Workflow / Storyboard | 空画布起始卡、Storyboard 空态 | 起始卡仍在可视区域 | 起始卡改为窄屏网格；画布自然裁切 | 不误报生成失败 | 通过（既有桌面/窄屏证据） |
| populated | `authenticated-populated` → `/project` / Canvas | 四列项目卡、节点和媒体可见 | 项目三列；侧栏收起 | 项目两列；画布工具条首个按钮在视口内 | 项目/画布内容可刷新恢复 | 通过；Storyboard 初始视频列仍有发现性问题 |
| project lifecycle | `authenticated-empty` → `/project` | 新建/重命名文件夹、创建项目、封面菜单、副本和移动动作均可操作 | 同左；动作菜单保持可达 | 同左；不引入页面级横向溢出 | 刷新后保留文件夹名、示例封面、副本和移动结果；测试结束恢复空 fixture | 通过（`e2e/project-lifecycle.spec.ts`） |
| desktop visual baseline | `authenticated-populated` → `/` / `/project` | 首页的活动/创作/最近项目/Agent/TV Show 层级，以及项目四卡管理视图 | 不适用（桌面固定基线） | 不适用（桌面固定基线） | `e2e/home-visual-parity.spec.ts` 在临时服务上以 `toHaveScreenshot` 比较；不接触主 `:3200` 或 `.data` | 通过（2 个 1440×900 像素快照） |
| loading / error / empty | `/`，拦截本地 `GET /api/home` | `home-loading` 状态地标、错误告警、键盘触发重试、空最近项目 | 同首页响应式守门 | 同首页响应式守门 | `e2e/home-project.spec.ts` 用一次失败后放行的本地路由拦截验证，不请求远端 | 通过（桌面交互基准） |
| loading / error / empty | `/project`，拦截本地 `GET /api/projects` | `project-loading` 状态地标、错误重试、空工作区 CTA 与四列内容宽度 | 同项目响应式守门 | 同项目响应式守门 | `e2e/home-project.spec.ts` 用隔离 mock 验证状态转换和焦点 | 通过（桌面交互基准） |
| loading / error / empty | `/showcase`，拦截本地 `GET /api/showcase` | `showcase-loading`、错误重试、空发现态、`main` 的状态描述关系 | 网格自然降列 | 单列内容保持导航可达 | `e2e/showcase-interactions.spec.ts` 用隔离 mock 验证，不写入公开数据 | 通过（桌面交互基准） |
| error | 项目列表 `503` | 错误卡与错误文本 | 同左 | 同左，按钮不被标题栏挤出 | `project-load-error` + `重试` | 通过（浏览器拦截证据） |
| error | 画布 bootstrap `404/503` | `画布加载失败` | 同左 | 同左 | `canvas-load-error` + `重试`，不显示半成品画布 | 通过（浏览器拦截证据） |
| retry | 项目/画布错误态 | 按钮可见、可聚焦 | 同左 | 同左 | 重试入口保持在视口内；只恢复本地请求 | 通过（既有证据） |
| awaiting（过期） | `video-awaiting-confirmation` → Workflow | 节点显示 `等待确认`；确认门显示报价 | 同左 | 同左；弹窗需继续做完整窄屏焦点验收 | 过期报价显示 `报价已过期…`，确认按钮 disabled，取消可用 | 通过（过期保护） |
| awaiting（有效） | `video-awaiting-valid-confirmation` → Workflow | 节点显示 `等待确认`；确认门显示报价 | 同左 | 同左；弹窗需继续做完整窄屏焦点验收 | 确认按钮 enabled；请求期间显示“正在确认”且锁定按钮，确认后本地积分从 478 预留至 408，状态收敛为 `生成中` | 通过（隔离 Playwright 交互） |
| queued | `video-queued` | `排队中`、`0%`、取消入口 | 同左 | 同左 | 任务状态与进度同时可读 | 通过（既有证据） |
| running | `video-running` | `生成中`、`58%`、进度条、取消 | 同左 | 同左；底部主 rail 可操作 | 刷新后仍为 `生成中` / `58%` | 通过（既有刷新证据） |
| succeeded | `video-succeeded` | `生成完成`、本地产物预览 | 同左 | 同左；媒体可见 | 不显示 retry/cancel；保留生成入口 | 通过（既有证据） |
| failed | `video-failed` | `生成失败`、`重试` | 同左 | 同左 | 错误文案与 retry 同时可见且 enabled | 通过（只读断言） |
| cancelled | `video-cancelled` | `已取消`、`重新生成` | 同左 | 同左 | 取消结果不覆盖原产物；重新生成入口可用 | 通过（只读断言） |
| compliance | `video-compliance-blocked` → Workflow / Storyboard | Workflow 合规错误；Storyboard `合规阻断` | 同左 | 同左；视频列可能需横向滚动 | Workflow retry、Storyboard 显示独立合规提示与“修改后重试” | 通过（独立状态及抽屉恢复路径已覆盖） |

## 响应式基线

| 断言 | 1440×900 | 1024×768 | 768×700 |
| --- | --- | --- | --- |
| `document.documentElement.scrollWidth === innerWidth`（页面级） | 通过 | 通过 | 通过 |
| Shell 侧栏 | 展开 | 自动收起为紧凑 rail | 自动收起为紧凑 rail |
| Project 网格 | 四列 | 三列 | 两列 |
| Canvas 主工具条 | 居中 | 首个按钮可见 | 首个按钮可见；内部可横向滚动 |
| Storyboard | 三列完整可见 | 三列可见 | 内部横向滚动；视频列操作不是首屏完整可见 |

## 证据与边界

- 既有浏览器记录：`docs/visual/state-visibility.md`、`docs/visual/responsive-followup.md` 及其列出的 Playwright 快照。
- 本轮已重新执行本地浏览器套件：音频、图片、视频、剪辑、文本、脚本、画布、首页/项目与场景旅程均覆盖 1440×900；隔离回归服务额外验证了 `768×700` Storyboard 横向内容上的媒体详情抽屉焦点闭环与 Escape 回焦。更新的截图只反映已人工核验的局部 UI 演进：画布键盘焦点不再在指针打开编辑器时常驻描边，参考选择横幅显示 Escape 提示，剪辑侧栏补充来源/规格元数据。
- 生成状态均由本地 scenario fixture 提供；验收不调用 provider、不使用真实凭证或远端接口。
- 复跑桌面状态基准时，使用单独的 `NEXT_DIST_DIR`、`DATA_DIR` 和临时端口；例如 `REGRESSION_BASE_URL=http://127.0.0.1:3242 pnpm exec playwright test e2e/home-project.spec.ts e2e/showcase-interactions.spec.ts`。像素快照仍只由 `e2e/home-visual-parity.spec.ts` 在人工核验后更新。
