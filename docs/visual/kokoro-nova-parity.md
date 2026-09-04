# Kokoro Nova / LibTV 视觉 QA 与 Parity 记录

- 检查日期：2026-09-04
- 目标视口：`1440×900 CSS px`
- 辅助窄屏：`1024×700`、`768×700`
- 检查对象：本地 Kokoro Nova 首页、项目页、Workflow 画布、Storyboard、Agent 打开态与关键动态菜单
- 本地观察入口：`http://localhost:3200/`；为避免污染仓库现有 `.data`，画布内容态另以隔离本地服务 `http://localhost:3210/` + `authenticated-populated` fixture 复核
- 证据基准：[`docs/research/libtv/pages/canvas/README.md`](../research/libtv/pages/canvas/README.md)、[`docs/research/libtv/pages/home/README.md`](../research/libtv/pages/home/README.md)、[`docs/research/libtv/references/official-guide/README.md`](../research/libtv/references/official-guide/README.md) 及其截图

## 结论摘要

### 已观察

1. `1440×900` 下首页与项目页的主分栏、活动条、右上工具、深色层级和内容密度与 2026-09-03 官方当前深色证据高度一致；关键入口均在首屏可见。
2. Workflow 使用独立深色全屏 chrome，不继承首页/项目侧栏；顶部、底部工具条、节点、连线和生成状态均可见，页面本身无水平/垂直溢出。
3. Storyboard 的三列投影、图片/视频媒体卡、待确认合成占位、视频筛选菜单与官方当前深色基准的层级一致；打开 Agent 后右侧面板压缩主内容而非覆盖列。
4. `768×700` 下页面没有报告为水平溢出（`scrollWidth === innerWidth`），但采用裁切/压缩而不是重排：首页快捷卡、最近项目、项目页标题和卡片元数据出现明显截断；这是当前最需要下一批处理的视觉问题。
5. 动态状态已能被观察到：活动倒计时、项目页加载/空态/有内容态、画布生成完成与待确认后生成、Storyboard `全部/成片/片段` 菜单、Agent 空会话就绪态与发送禁用态。

### 推断

- 当前深色 UI 不是简单套用首页 shell，而是画布自己的全屏产品层；后续 parity 应继续以画布独立 chrome 为边界。
- 低 alpha 次级文字在 `#141414` 背景上的可读性尚可，但在 `768px` 卡片压缩后，信息损失主要来自空间不足而非颜色本身。
- 首页和项目页已经把主要宽度约束收敛到 `1120px/1200px` 内容列；窄屏时保留四列/三列的策略会把视觉问题从“溢出”转成“文本裁切”，因此仅加 `overflow-x` 不能解决 parity。

### 待修复 / 待继续观察

- 需要定义窄屏的产品策略：侧栏收起、卡片降列、标题/操作区换行或最小可用宽度。当前 `768px` 仍会截断有意义的项目名称和快捷动作标签。
- 需要补充窄屏下 Storyboard 的媒体详情、Agent 打开态、列展开态和剪辑入口的视觉验收；本轮只确认基础三列。
- 需要在真实交互中继续验收上传、生成运行中、失败/重试、撤销/刷新恢复等动态状态的视觉反馈；本轮没有触发付费生成。
- 当前本地已有默认空账户服务状态；直接访问旧的 `projectId/canvasId` 时曾观察到“画布加载失败，请重试”。隔离 `authenticated-populated` fixture 可稳定复现目标内容态；该现象先按 fixture/数据状态差异记录，不计为已确认 UI 回归。

## 1440×900 观察记录

### 1. 首页

**几何与层级（已观察）**

- 活动条位于 `x=8,y=8`，高约 `48px`；主体从 `y=64px` 开始，左侧展开导航约 `232px`，主内容左边界 `x=280px`、宽 `1120px`。
- 主内容分区：Banner `1120×140`（`y=114`）；快捷创作 `1120×200`（`y=278`）；最近项目分区从 `y=504` 开始；Agent composer `1120×150`（`y=660`）；TV Show 从 `y=846` 开始，首屏只露出标题和筛选入口。
- 快捷创作是“一张约 2.04 份宽度的大卡 + 右侧三列两行工具卡”；最近项目是三张横向卡；输入区居中收窄并保留快捷 Skill 胶囊。
- 顶部会员、积分、账户、Blender/插件入口均在右上；左下固定活动卡和帮助入口可见。

**密度、颜色、控件（已观察）**

- 深色背景接近 `rgb(20,20,20)`，卡面约 `rgb(27,27,27)`；主文案白色，次级文案使用透明白。黑色 Banner 与深色页面有清晰层级分界。
- 活动 Banner、`新建画布创作`、Seedance/Wan/Minimax、导演台、逐帧拉片、片段重拍、最近项目、Agent 输入和 TV Show 入口均可见。
- 空输入时 `开始创作` 禁用；首页活动倒计时和积分余额是动态文案，不应按截图固化。

**与官方证据的对照**

- [`home-authenticated-desktop-1440x900-2026-09-03.png`](../research/libtv/pages/home/screenshots/home-authenticated-desktop-1440x900-2026-09-03.png) 与本地隔离首页的分区位置、1120px 内容宽度、快捷创作网格和 Agent 输入区一致；本地素材图已替换为仓库 fixture，动态封面不同属于数据差异。
- [`home-authenticated-canonical-desktop-1440x900-hires.png`](../research/libtv/pages/home/screenshots/home-authenticated-canonical-desktop-1440x900-hires.png) 是较早浅色证据，证明首页内容职责与发现/创作顺序；当前深色站内实测优先级更高。

### 2. 项目页

**几何与层级（已观察）**

- 内容区从 `x=240` 开始，主 section 宽约 `1200px`、`y=160`；标题栏依次为返回、`全部项目`、搜索、回收站、新建文件夹。
- 四列卡片的外接位置约为 `x=280/508/735/963`，每张约 `214×166px`；第一列是开始创作卡，后三列是项目卡，封面下方显示名称和日期，更多动作位于卡片右下。
- 有内容态显示三项目及“当前显示 3 个项目或文件夹/没有更多了”；空态显示“还没有项目”和“开始第一个项目”。两种状态的加载 spinner 均能观察到。

**Parity 结论（已观察）**

- [`project-authenticated-desktop-1440x900-2026-09-03.png`](../research/libtv/pages/home/screenshots/project-authenticated-desktop-1440x900-2026-09-03.png) 的标题栏、四列固定卡宽和深色留白与本地隔离项目页一致。
- 项目操作按钮在有内容态可见；回收站、新建文件夹在空账户态按当前状态禁用，属于状态差异而非布局差异。

### 3. Workflow 画布

**几何与层级（已观察）**

- 顶部 chrome：`header x=16,y=16,w=1408,h=32`；左侧返回/项目/画布切换，中间 Workflow/Storyboard，右侧发布与分享、积分超市、会员权益、积分、账户、Agent。
- 底部主工具条位于 `y=848`，按钮高 `32px`，由添加节点、移动、工具箱、素材库、角色库、历史资产、快捷键、帮助组成；左下状态条约在 `y=854`，含资产管理、自动整理、小地图、连线显隐、网格吸附和 `50%`。
- 隔离内容态的四个节点实测位置约为：文本 `180×163`、图片 `200×173`、视频 `200×163`、合成 `210×143`，节点从 `x=160` 延伸到 `x=1060`，连线按文本→图片→视频→合成串联。
- 当前画布背景约 `rgb(20,20,20)`，节点/菜单/面板约 `rgb(36,36,36)`；选中按钮约为白色低透明面，未选中的工具图标使用约 `0.66` alpha 白色。

**关键动态态（已观察）**

- 添加节点菜单从底部工具条向上展开，顺序为文本、图片、视频、智能剪辑 `Beta`、导演台 `NEW`、逐帧拉片 `SD 2.5`、音频、脚本子菜单、素材库子菜单、上传、从生成历史选择；菜单没有把画布推开。
- 节点卡分别显示生成完成、模型/尺寸/积分，以及合成节点的“待确认后生成”；这使确认门状态在不打开编辑器时也可见。
- Agent 打开后右侧约 `340px` 面板从右边界向内占位，顶部显示“新会话/就绪/新建会话/历史会话”，中央为空会话引导，底部输入框、附件、引用、Skill、模型、手动/自动和禁用发送均可见；画布缩窄但不被面板遮盖。

**与官方证据的对照**

- [`canvas-workflow-collaboration-following-desktop-1440x900-hires.png`](../research/libtv/pages/canvas/screenshots/canvas-workflow-collaboration-following-desktop-1440x900-hires.png) 与 [`canvas-add-node-and-resource-menu-desktop-1440x900-hires.png`](../research/libtv/pages/canvas/screenshots/canvas-add-node-and-resource-menu-desktop-1440x900-hires.png) 证明官方画布也是全屏 chrome、底部固定工具条和向上菜单。
- 官方截图宿主合成层存在裁切/放大，README 已明确要求以 DOM 几何和完整 `*-hires.png` 交叉校验；本轮没有把官方截图左侧裁切边界误判为产品布局。
- 官方指南的 [`canvas-left-sidebar-documented-five-functions.png`](../research/libtv/references/official-guide/screenshots/canvas-left-sidebar-documented-five-functions.png) 仍描述旧版“添加/工作流/资产/历史记录/教程”五项；当前 Web 已扩展为工具箱、角色库、快捷键等更多入口，按版本漂移处理。

### 4. Storyboard

**几何与层级（已观察）**

- 画布视图顶部留白到 `y=72`；主区横向三段：左侧文本复合列约从 `x=16` 开始、宽 `470px`；图片列 `x=498,w=457,h=812`；视频列 `x=967,w=457,h=812`。列间隙约 `12px`。
- 文本列显示 `文本/故事梗概`；图片列显示首帧图片、`Lib Image`、`1280×720`、参考文本入口；视频列显示视频生成、`Seedance 2.0 VIP`、`1280×720`、`15 秒`、缩略图和待确认合成占位。
- 右下固定剪辑圆形入口约 `56×56px`，不推动媒体列内容。

**动态与对照（已观察）**

- 视频列 `全部` 菜单锚定列头右侧，选项为 `全部/成片/片段`，当前项显示勾选，下方卡片位置不变；与 [`storyboard-video-filter-menu-all-final-clips-desktop-1440x900-hires.png`](../research/libtv/pages/canvas/screenshots/storyboard-video-filter-menu-all-final-clips-desktop-1440x900-hires.png) 的行为描述一致。
- 本地填充态与 [`storyboard-populated-collaboration-following-desktop-1440x900-hires.png`](../research/libtv/pages/canvas/screenshots/storyboard-populated-collaboration-following-desktop-1440x900-hires.png) 都是文本/图片/视频的横向媒体投影；本地深色面板使用 `rgb(36,36,36)`，官方当前截图的列宽、纵向满高和剪辑入口位置一致。
- Agent 打开态本地采用右侧重排；官方 [`storyboard-with-agent-ask-human-desktop-1440x900-hires.png`](../research/libtv/pages/canvas/screenshots/storyboard-with-agent-ask-human-desktop-1440x900-hires.png) 也显示三列与 Agent 共享垂直边界，而不是把 Agent 覆盖在媒体卡上。

## 窄屏与溢出检查

| 视口 | 已观察 | 结论 |
| --- | --- | --- |
| `1024×700` 首页 | `scrollWidth=1024`；右上工具仍在视口内；快捷卡名称和最近项目名开始省略；内容向下滚动 | 无真实水平滚动，但关键信息密度下降，属于 P1 响应式问题 |
| `768×700` 首页 | `scrollWidth=768`；活动文案换成两行并截断；三列快捷卡文字大量省略；最近项目卡横向压缩，名称/日期被切掉；Agent 输入区下沉 | `overflow-x:hidden` 式裁切掩盖了布局不足，用户仍能看到卡片但难以识别和操作 |
| `768×700` 项目页 | 主内容从 `x=240` 开始、宽约 `528px`；四列仍压缩；标题显示为“全…”；名称、日期、更多动作拥挤或省略 | 应在窄屏收起侧栏/降列，而不是保持桌面四列 |
| `768×700` Workflow | 页面 `scrollWidth=768`；顶部 Agent 贴近右边界；节点区自然被视口裁切，底部工具条仍可见 | 无限画布裁切本身合理，但顶栏需验证最小宽度和关键按钮可操作性 |
| `768×700` Storyboard | 三列继续并排，页面无水平滚动；每列约 `240px`，媒体仍可见但元数据与筛选空间很紧 | 需要明确三列最小宽度、横向可滚动提示或降列策略；不能仅依赖文字省略 |

## 颜色对比与动态可见性

### 已观察

- 页面背景约 `rgb(20,20,20)`；Workflow/Storyboard 表面约 `rgb(36,36,36)`；菜单使用相同深色表面并有约 `0.08` 白色描边/阴影。
- 主文字多为 `rgba(255,255,255,0.94)`；工具条次级文字约 `0.66`，未选中图标约 `0.4`。在桌面尺寸下主标题、按钮、生成状态和列标题清晰；低 alpha 的日期、模型辅助信息和更多按钮在窄屏更容易丢失。
- `生成完成`、`待确认后生成`、`就绪`、筛选勾选、活动倒计时和积分余额均有独立视觉/文案信号；本轮未发现“状态发生但页面完全无反馈”的情况。

### 推断 / 待验证

- 对比度本身不是当前主要阻塞项；P1 优先级应给空间重排和文本可见性。仍建议下一批用自动化对比度审计覆盖灰阶文本、禁用按钮和图片占位。
- 动态状态的颜色语义尚未覆盖失败、取消、合规阻断、运行中进度和刷新恢复；这些状态应与 P0/P1 可靠性旅程一起截图验收。

## 下一批 Agent 任务排序

### P0 — 基线守门（无新增已确认 P0 缺陷）

1. **`visual-baseline-gate`**：固定 `1440×900` 首页/项目/Workflow/Storyboard/Agent/添加菜单/视频筛选菜单快照，比较主边界（`x=240/280`、`y=64/72`、底部工具条、三列宽度）和关键文案可见性；只读现有 UI，不改基线文件。
2. **`state-visibility-gate`**：用本地 scenario fixture 验证 `loading → empty/populated → awaiting confirmation → running/succeeded/failed` 的状态颜色、标签、禁用态和错误恢复入口；把缺失的证据列为待修复，不触发付费生成。

### P1 — 下一轮优先实现

1. **`responsive-shell-lane`**：针对 `1024×700`、`768×700` 建立响应式策略；首页/项目页先收起或缩窄侧栏，项目卡从四列降列，标题栏允许安全换行，确保名称、日期、搜索、回收站和新建文件夹不互相遮挡。
2. **`responsive-canvas-storyboard-lane`**：定义画布顶栏最小宽度与 Storyboard 的三列最小宽度；在窄屏提供可发现的横向滚动或降列行为，保持 Agent、剪辑和视频筛选入口可操作。
3. **`visual-status-and-contrast-lane`**：覆盖 disabled、pending、running、failed、cancelled、compliance-blocked、空态与加载态；对低 alpha 元数据、占位卡、筛选勾选和 Agent 控件做对比度与 focus-visible 复核。

### P2 — 视觉打磨与证据维护

1. **`desktop-polish-lane`**：微调项目更多按钮、模型/日期辅助信息、Storyboard 元数据和菜单描边的层级，避免在不改变官方深色基线的前提下过低对比。
2. **`official-evidence-refresh-lane`**：把官方当前深色截图、旧版指南截图和版本漂移分别标注采集日期/证据等级；补齐 Storyboard 列展开、Agent ask-human、剪辑入口和真实失败态的当前证据。
3. **`parity-report-maintenance`**：每轮只追加本文件或 `docs/visual/` 辅助说明，保留“已观察/推断/待修复”三分法，并记录 fixture、视口、浏览器和动态状态，避免把营销文案或积分数值误当成布局契约。

## 验证记录

- `git diff --check`：通过，无 whitespace error。
- 本轮未修改 UI、domain、server、API docs、e2e、截图基线或 `.gitignore`。
- 为真实观察启动的隔离服务使用 `/tmp/kokoro-visual-qa` 数据目录；检查结束后已停止服务并恢复浏览器视口。
