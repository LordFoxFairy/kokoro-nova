# Visual follow-up：状态可见性 lane

- 日期：2026-09-04
- 目标：复核 Kokoro Nova parity 与 state-visibility 文档中的已修复项和遗留项
- 本 lane 只改文档与状态/响应式 E2E；不改生产组件、不改截图基线

## 复核结果

### 已确认保持有效的修复

1. **Canvas 窄屏主工具条**
   - 路径：`src/components/canvas/BottomToolbar.tsx`
   - 根因：Tailwind v4 将桌面 `-translate-x-1/2` 生成为独立 `translate` 属性；仅设置 `transform: none` 不会清除该属性。
   - 当前结果：窄屏规则同时设置 `transform: none` 与 `translate: none`，`1024×768`、`768×700` 的首个主工具按钮回到视口内。
2. **活动倒计时胶囊**
   - 路径：`src/components/shell/PromoStrip.tsx`
   - 根因：紧凑宽度下 flex 收缩使倒计时换成两行，而固定高度裁掉第二行。
   - 当前结果：胶囊 `shrink-0 whitespace-nowrap`；活动消息负责截断，倒计时保持完整单行。
3. **Home / Project 响应式壳层**
   - 路径：`src/components/shell/AppSidebar.tsx`、`src/components/project/ProjectListPage.tsx`、`src/components/project/ProjectToolbar.tsx`
   - 当前结果：`1024px` 侧栏收起、项目三列；`768px` 项目两列，标题和主要操作仍有可点击区域，页面级无水平溢出。

### 已完成的状态闭环

- **有效报价确认门**：新增 `video-awaiting-valid-confirmation`，以固定的 `2099-12-31T23:59:00.000Z` 报价到期时间补足有效态；隔离 Playwright 已断言确认按钮 enabled、请求期间 busy/disabled、请求成功、积分从 478 预留至 408，以及状态收敛到 `生成中`。
- **Storyboard 合规阻断**：`compliance_blocked` 已使用独立的 regeneration status、琥珀色状态提示和“修改后重试”恢复入口；详情抽屉有专用 test id 与回归断言。

### 仍需跟进的缺口

| 优先级 | 路径 / 状态 | 复现或证据 | 处理建议 |
| --- | --- | --- | --- |
| P1 | `src/components/storyboard/StoryboardView.tsx`：`768×700` | 三列使用内部横向滚动；视频筛选/展开入口在初始左端不完整可见 | 明确降列、列头紧凑化或更明显的滚动指示；补媒体详情抽屉与 focus-trap 验收 |
| P2 | Home / Project 次级信息 | 窄屏日期、模型辅助文案仍可能省略或使用低 alpha | 做对比度与信息优先级审计，不以截图像素作为契约 |

## 回归测试边界

新增 `e2e/regression-followup.spec.ts` 只覆盖：

- 本地 scenario 的 loading、empty、error/retry；
- `awaiting（过期/有效）/ queued / running / succeeded / failed / cancelled / compliance_blocked` 的可见状态和恢复入口；
- 有效报价的确认、积分预留与运行态收敛；
- `1440×900`、`1024×768`、`768×700` 的页面级溢出、Shell/Project 栅格、Canvas 主 rail、Storyboard 内部滚动；
- 所有请求均为本地相对 API 路径；不点击真实生成、不写截图基线。

运行时必须显式注入临时服务地址，例如 `REGRESSION_BASE_URL=http://127.0.0.1:PORT`，并由调用方将 `DATA_DIR` 指向临时目录。没有注入地址时测试不会回退到主 `3200`。

## 验证记录

- 已读：`docs/CODEBASE_MAP.md`、`docs/visual/kokoro-nova-parity.md`、`docs/visual/state-visibility.md`、`docs/visual/responsive-followup.md`。
- 已保留既有隔离浏览器结果：三视口响应式观察、状态 fixture 与错误/retry 快照记录。
- 本次收尾未重新启动服务器；按要求停止了当前仓库的长时间 Playwright 测试进程（父进程 `42424` 及 worker `42603`）。
- 本次不运行会触碰主 `3200/.data` 或生成目录的命令；新增测试的实际浏览器执行留给带临时端口/目录的调用。
