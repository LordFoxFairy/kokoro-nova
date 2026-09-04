# Responsive follow-up：Home / Project / Shell / Canvas / Storyboard

- 检查日期：2026-09-04
- 检查视口：`1440×900`、`1024×768`、`768×700`
- 检查浏览器：Playwright CLI headed Chromium，DPR 2
- 隔离服务：`http://127.0.0.1:3210`，`DATA_DIR=/tmp/libtv-responsive-qa-20260904`
- 场景：`authenticated-populated`
- 主控约束：没有切换主工作树的 `3200` 服务或 `.data`，没有改截图基线

## 本轮结论

确认并处理了两个窄屏生产问题：

1. Canvas 底部主工具栏在 `1024×768` 和 `768×700` 完全移出左侧，原因是 Tailwind v4 将 `-translate-x-1/2` 生成为独立的 `translate` 属性；已有的 `transform: none` 没有清除它。`BottomToolbar` 的窄屏规则现在同时设置 `translate: none`，保留横向滚动而不丢失首个按钮。
2. Shell 活动条的倒计时胶囊在 `768×700` 被 flex 压缩后换成两行，固定 `h-8` 将第二行裁掉。胶囊现在不可收缩且保持单行，旁边的活动消息承担截断。

## 逐视口观察

### `1440×900`

| Surface | 观察结果 |
| --- | --- |
| Home | 展开侧栏 `232px`，内容列 `1120px`；活动图、快捷创作、最近项目、Agent 和 TV Show 按桌面顺序出现；文档 `scrollWidth=1440`。 |
| Project | 标题栏与搜索/回收站/新建文件夹均在视口内；项目网格四列，卡片和更多操作可见；文档无水平溢出。 |
| Shell | 账户工具栏位于内容列顶部，主导航、帮助和活动卡均可达；键盘焦点有可见 ring。 |
| Canvas | 顶部 chrome、节点、状态栏和居中主工具栏均在视口内；`scrollWidth=1440`、`scrollHeight=900`。 |
| Storyboard | 文本/图片/视频三列完整可见，列边界约为 `x=16/498/967`，剪辑入口在右下且不遮挡列内容。 |

### `1024×768`

| Surface | 观察结果 |
| --- | --- |
| Home | Shell 自动收起为 `68px` 侧栏；内容列无水平溢出，快捷创作和最近项目降为窄屏网格，页面纵向滚动承载 TV Show。活动条文本开始截断但未遮挡 CTA。 |
| Project | 侧栏收起，标题栏安全换行；项目网格降为三列，搜索、回收站、新建文件夹均有完整可点击区域；文档无水平溢出。 |
| Shell | 图标导航仍有 `title`/`aria-label`，账户入口留在视口内；紧凑模式下收起按钮保持禁用，避免产生不可见的“展开”状态。 |
| Canvas | **修复前**主工具栏的第一个按钮矩形为负 `x`（约 `-487`），整条主 rail 只剩右半空壳；状态 rail 仍可见。根因及修复见上。 |
| Storyboard | 三列仍可在视口内显示，列宽约 `331/318/318px`，视频筛选和展开按钮可点击；无文档级水平溢出。 |

### `768×700`

| Surface | 观察结果 |
| --- | --- |
| Home | 侧栏收起；快捷创作变为两列并纵向滚动，最近项目也降为两列；无页面级水平溢出。活动条倒计时胶囊在修复前出现两行裁切，本轮已改为单行不收缩。 |
| Project | 标题“全部项目”、搜索、回收站和新建文件夹均在视口内；项目卡降为两列，封面和名称/日期/更多操作可见；文档 `scrollWidth=768`。 |
| Shell | 图标导航的键盘焦点 ring 可见；顶部账户入口没有被侧栏遮挡。 |
| Canvas | **修复前**主 rail 的 `translate` 为 `-50%`，矩形约 `x=-368…384`，所有主工具按钮都在视口外；本轮已清除该独立属性。无限画布节点被视口裁切属于画布平移模型，不计为页面溢出。 |
| Storyboard | 使用内部横向滚动：视图 `clientWidth=768`、`scrollWidth=896`，三列最小宽度 `280px`；“左右滑动查看更多”提示可见。视频列的筛选/展开入口在初始左端视口外，滚动后可操作，这是尚未定产品策略的 P1。 |

## 焦点与可点击性

- 用键盘逐个聚焦了 Home、Project、Shell 的链接、按钮和输入框；显式 `focus-visible` ring 或浏览器默认 focus ring 均可观察到，没有发现焦点落在不可见控件后无法恢复的情况。
- Project 三个目标窄屏下的搜索、回收站、新建文件夹 bounding box 均完全落在视口内。
- Canvas 的窄屏主 rail 是本轮确认的可点击性回归；修复前 `添加节点`、工具箱、素材库等按钮均为负 `x`，修复后应由主控在现有 `3200` 服务做一次最终复验。
- Storyboard 的横向滚动提示是非交互提示；视频筛选入口需要先滚动到视频列，需继续决定“横向滚动”与“窄屏降列”哪一种是正式产品行为。
- 因用户中止长时间浏览器命令，本轮没有完成 `MediaDetailDrawer` 在 `768×700` 打开态的最终截图验收；该项保留给主控的短 smoke pass。

## 剩余 P1 / P2

### P1

- Storyboard 在 `768px` 初始左端只露出视频列的一部分，筛选和展开按钮需要横向滚动后才能看到。当前有提示且内部滚动正常，但核心操作的首屏可发现性仍弱；下一步应明确降列、横向滚动指示器或紧凑列头策略。
- `MediaDetailDrawer` 在 `768×700` 的打开态尚缺一轮截图与 focus-trap 验收，尤其要确认抽屉宽度、关闭按钮和底部再生成操作不被视口裁切。

### P2

- `1024px` 下部分 Home 快捷卡和活动消息会截断次级文案；主操作仍可见，属于信息密度打磨项。
- Storyboard 媒体元数据和 Project 日期使用低 alpha 次级文字；本轮未确认文字被遮挡，但可在对比度审计中继续收敛。

## 改动路径

- `src/components/canvas/BottomToolbar.tsx`：窄屏规则增加 `translate: none`，修复 Tailwind v4 独立 translate 属性造成的主工具栏负坐标。
- `src/components/shell/PromoStrip.tsx`：倒计时胶囊增加 `shrink-0 whitespace-nowrap`，避免固定高度下的垂直裁切。
- `docs/visual/responsive-followup.md`：记录隔离 fixture、视口观测、根因、剩余 P1/P2 和验证边界。

## 验证命令与结果

已执行：

```text
curl -X POST http://127.0.0.1:3210/api/dev/scenario \
  -H 'content-type: application/json' \
  --data '{"scenarioId":"authenticated-populated"}'
```

结果：HTTP 200，返回 `scenario.id=authenticated-populated`、3 个项目、3 个画布、2 个任务；未接触主 `.data`。

Playwright CLI 已在隔离服务上完成三视口 DOM 几何和截图观察：

- Home / Project：三视口文档级 `scrollWidth === innerWidth`。
- Canvas：桌面文档 `1440×900` 无溢出；窄屏修复前主 rail 负 `x` 已复现并记录。
- Storyboard：`768px` 内部横向滚动 `896 > 768`，提示和列边界已观察。

收尾阶段已运行的短验证（未启动服务、未切换场景）：

```bash
git diff --check
pnpm exec eslint src/components/canvas/BottomToolbar.tsx src/components/shell/PromoStrip.tsx
pnpm exec tsc --noEmit --pretty false
```

结果：三条命令均以 `exit=0` 结束；typecheck 没有输出诊断信息。

浏览器 session 与隔离 `3210` 服务已停止；没有提交、reset、checkout，也没有改 `tsconfig.json`、`next-env.d.ts`、`.gitignore` 或截图基线。
