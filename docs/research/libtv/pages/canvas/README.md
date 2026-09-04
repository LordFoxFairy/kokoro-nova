# 项目与无限画布

实测路径：项目列表 `/project`；画布 `/canvas?spaceId=<space>&projectId=<project>`。

证据等级：除“官方指南补充”外，本页均为登录后实际 UI 观察。没有提交任何付费生成。
本轮 Text/Script 协议调研另外留下一个手写 Text、三个 starter 组和一个 Script V2 临时节点；
这些云端变更只会在删除动作发生前获得用户明确确认后清理。

## 2026-09-04 已登录项目只读复核

当前官网已登录项目加载后直接确认了可编辑项目名、画布下拉、工作流/故事板双视图、
发布/积分/Agent 顶栏、双底部轨道，以及 Script V2、预设、图片、音频、视频、特效和文本
节点在一个画布中的共存。采集严格只读，完整证据与本地约束见
[2026-09-04-live-project-readonly.md](2026-09-04-live-project-readonly.md)。

## 2026-09-03 当前深色桌面基线

本轮再次在登录态实测了当前线上版本。编辑器已使用独立的深色全屏 chrome，不继承
首页/项目页侧栏；既有浅色 `*-hires.png` 仍用于补齐未被当前截图覆盖的完整弹层和
交互状态，当前配色、控件密度与节点外观则以下列截图为准：

- [当前工作流](screenshots/canvas-authenticated-current-dark-desktop-1440x900-2026-09-03.png)
- [当前添加节点菜单](screenshots/canvas-add-node-current-dark-desktop-1440x900-2026-09-03.png)
- [当前故事板](screenshots/storyboard-authenticated-current-dark-desktop-1440x900-2026-09-03.png)

当前截图由应用内浏览器保存，位图尺寸为 `1440×900`，但宿主合成层会放大页面内容并裁切
右侧区域；因此截图用于确认主题、层级与状态，精确尺寸以下述 DOM 几何和既有完整
`*-hires.png` 基线交叉校验，不把裁切边界当作产品布局。

通过浏览器 DOM 几何实测，`1440×900` CSS 视口中的顶部按钮高 `32px`、距顶/左右
`16px`；右侧依次为发布与分享、积分超市、会员权益、积分、账户和 Agent。底部主工具
条按钮同为 `32px`，工具条整体高约 `48px`、距底约 `12px`；左下状态条依次为资产
管理、整理画布、小地图、连线显隐、网格吸附和缩放。

当前添加菜单顺序已经调整为：

1. 文本
2. 图片
3. 视频
4. 智能剪辑 `Beta`
5. 导演台 `NEW`
6. 逐帧拉片 `SD 2.5`
7. 音频
8. 脚本（子菜单）
9. 素材库（子菜单）
10. 添加资源：上传、从生成历史选择

故事板列是按当前文档内容动态出现的：只有图片与视频时不会强制占位显示空的音频/
文本列；存在音频或文本时，两者共享左侧纵向复合列。媒体列支持横向容纳、单列展开、
视频 `全部 / 成片 / 片段` 筛选；Agent 打开后压缩并重排主内容，而不是覆盖在列上。

## 核心对象层级

当前产品文案容易混淆 `项目 / 工作区 / 画布`。结合 Web UI 与 CLI 文档，可先按以下层级理解：

1. 顶部项目名称标识当前工作容器。
2. 一个项目可通过顶部切换器包含多个“画布”。
3. CLI 中 `workspace` 是容器，`project` 是真正的画布文件；复刻时必须在 API 中固定术语，不能照搬两套相反命名。

## 已观察能力

| 能力 | 截图 | 观察结论 |
| --- | --- | --- |
| 全部项目 | [project-list-authenticated-and-create-folder.png](screenshots/project-list-authenticated-and-create-folder.png) | 首页“全部项目”进入 `/project`；列表含开始创作、项目卡、新建文件夹和终点状态。 |
| 项目卡动作 | [project-card-actions-menu.png](screenshots/project-card-actions-menu.png) | 支持打开、重命名、修改封面、创建副本、移动至文件夹和删除项目。 |
| 项目重命名 | [project-rename-inline-editor.png](screenshots/project-rename-inline-editor.png) | 项目名直接切换为内联输入框；按 `Escape` 可取消，实测未保存改名。 |
| 项目移动 | [project-move-to-folder-empty-submenu.png](screenshots/project-move-to-folder-empty-submenu.png) | “移动至文件夹”使用二级菜单；没有文件夹时显示明确空态。 |
| 项目删除 | [project-delete-confirmation-dialog.png](screenshots/project-delete-confirmation-dialog.png) | 删除前有取消/确认二次确认，但不要求输入项目名；本轮只点击取消。 |
| 文件夹创建 | [默认名列表态](screenshots/project-folder-created-default-name-list-state.png)、[悬停动作](screenshots/project-folder-card-default-name-hover-actions.png) | 点击后立即创建“未命名文件夹”，没有命名表单；页面曾显示成功 toast（DOM 已观察，截图落盘前已消失），悬停卡片才显示更多按钮。 |
| 文件夹菜单 | [project-folder-actions-open-rename-cover-delete.png](screenshots/project-folder-actions-open-rename-cover-delete.png) | 文件夹支持打开、重命名、更换封面和删除；与项目菜单的复制、移动等动作不同。 |
| 文件夹重命名 | [内联输入](screenshots/project-folder-rename-inline-editor.png)、[乐观列表态](screenshots/project-folder-rename-optimistic-list-state.png) | 空名称按 Enter 会静默恢复原名；有效新名称先显示在卡片上，但导航后回滚为原名且没有错误提示，本轮未观察到持久化成功。 |
| 空文件夹详情 | [project-folder-empty-detail-start-create-no-projects.png](screenshots/project-folder-empty-detail-start-create-no-projects.png) | 详情保留返回首页、全部项目、文件夹名和新建项目；内容区同时有“开始创作”和“暂无项目”。 |
| 文件夹删除 | [默认禁用](screenshots/project-folder-delete-name-confirmation-disabled.png)、[精确名称后启用](screenshots/project-folder-delete-exact-name-confirm-enabled.png)、[删除后基线](screenshots/project-folder-delete-success-original-project-only.png) | 删除提示会连同内部文件永久删除；必须输入完整文件夹名才启用确认。临时空文件夹已删除，列表只剩原项目。 |
| 空项目 | [new-project-empty-workflow-with-agent.png](screenshots/new-project-empty-workflow-with-agent.png) | 新项目默认创建“画布 1”，同时显示工作流和 Agent。 |
| 画布切换 | [canvas-switcher-and-create.png](screenshots/canvas-switcher-and-create.png) | 同一项目内可新建和切换画布；管理动作待补。 |
| 画布选择器 | [canvas-selector-current-canvas-and-new-action.png](screenshots/canvas-selector-current-canvas-and-new-action.png) | 选择器同时承载当前画布列表与“新建画布”；从项目卡封面打开时会新建浏览器标签。 |
| 画布管理 | [canvas-selector-more-actions-single-canvas-delete-disabled.png](screenshots/canvas-selector-more-actions-single-canvas-delete-disabled.png) | 单画布可新窗口打开、重命名或复制；仅剩一个画布时删除动作禁用。 |
| 画布重命名 | [canvas-rename-inline-editor.png](screenshots/canvas-rename-inline-editor.png) | 重命名在选择器内切换为输入框；本轮按 `Escape` 取消。 |
| 新建画布命名 | [canvas-new-canvas-name-draft-default.png](screenshots/canvas-new-canvas-name-draft-default.png) | 点击“新建画布”先在选择器内插入默认名“画布 2”的输入框，按 Enter 才创建并切换。 |
| 新建空画布 | [canvas-new-blank-success-and-starter-shortcuts.png](screenshots/canvas-new-blank-success-and-starter-shortcuts.png) | 空画布默认 100% 缩放，展示双击提示和故事脚本、角色三视图、首帧图生视频、音频生视频四个启动快捷项。 |
| 多画布切换 | [canvas-selector-two-canvases-current-and-switch.png](screenshots/canvas-selector-two-canvases-current-and-switch.png) | 创建后选择器同时列出当前“画布 2”和原“画布 1”，可直接跨画布切换。 |
| 多画布管理 | [canvas-selector-more-actions-multi-canvas-delete-enabled.png](screenshots/canvas-selector-more-actions-multi-canvas-delete-enabled.png) | 多画布时“删除画布”从单画布禁用态变为可用；同一菜单继续提供新窗口、重命名和复制。 |
| 复制画布 | [canvas-copy-success-auto-name-and-empty-content.png](screenshots/canvas-copy-success-auto-name-and-empty-content.png) | 复制会触发页面导航确认并切到副本；副本自动命名为“画布 2副本1”，空画布内容和启动快捷项保持一致。 |
| 删除画布 | [canvas-delete-confirmation-multi-canvas.png](screenshots/canvas-delete-confirmation-multi-canvas.png) | 删除前显示目标画布名并明确“此操作不可恢复”；仅删除本轮临时画布，已回到原“画布 1”。 |
| 跨浏览器编辑租约 | [canvas-concurrent-browser-session-expired-refresh-required.png](screenshots/canvas-concurrent-browser-session-expired-refresh-required.png) | 同一画布在第二个浏览器打开后，旧编辑器被阻断并提示“会话已过期”；只有刷新当前页才能继续，刷新后 7 节点、1 条边完整恢复。 |
| 协作跟随 | [跟随后的视口](screenshots/collaboration-followed-viewport-with-connected-nodes.png)、[跟随状态与退出控件](screenshots/storyboard-following-status-and-exit-control.png) | 第一张记录跟随后的 92% 视口，第二张直接显示“正在跟随”和 `取消 ESC`；点击取消可退出。两张证据分别对应结果视口和显式状态。 |
| 工作流有内容态 | [workflow-populated-connected-text-image-nodes.png](screenshots/workflow-populated-connected-text-image-nodes.png) | 登录态工作流显示文本节点、图片节点和两者之间的连线；从故事板回切后结构仍保留。 |
| 故事板空态 | [storyboard-empty-canvas.png](screenshots/storyboard-empty-canvas.png) | 空画布切换到故事板时显示空内容区；文件名只描述截图中实际可见状态。 |
| 故事板映射 | [storyboard-populated-text-image-video-columns.png](screenshots/storyboard-populated-text-image-video-columns.png) | 同一工作流切换后按文本、图片、视频三列组织；空节点与已有示例产物都会映射。 |
| 故事板与 Agent | [基础节点](screenshots/storyboard-populated-with-agent-panel.png)、[示例产物](screenshots/storyboard-toolbox-preset-output-metadata-with-agent.png) | 故事板与右侧 Agent 可同时工作，打开面板不会离开当前项目或切回工作流；示例产物的模型、时长和尺寸仍可见。 |
| 参考元素详情 | [storyboard-reference-detail-text-node-pending-confirmation.png](screenshots/storyboard-reference-detail-text-node-pending-confirmation.png) | 图片卡的参考元素可回溯到源文本节点；详情显示提示词、模型、参数和“待确认后生成”状态。 |
| 参考节点动作 | [storyboard-reference-node-more-actions.png](screenshots/storyboard-reference-node-more-actions.png) | 源节点更多菜单包含设置关键元素、创建副本和删除；本轮只展开菜单。 |
| 参考节点注入 Agent | [storyboard-reference-added-to-agent-context.png](screenshots/storyboard-reference-added-to-agent-context.png) | “添加到对话”把源节点作为可定位 context chip 注入 Agent，并使发送按钮可用；随后已清空草稿，未发送。 |
| 添加节点与资源 | [add-node-and-resource-types.png](screenshots/add-node-and-resource-types.png) | 节点含文本、图片、视频、视频合成、导演台、音频、脚本、资产库；资源可上传或从历史选择。 |
| 文本节点 | [text-node-arranged-full-card.png](screenshots/text-node-arranged-full-card.png) | 文本节点支持手写、文生视频、图片反推提示词、文字生音乐；空输入时运行不可用。 |
| 节点引用 Agent | [text-node-selected-context-chip.png](screenshots/text-node-selected-context-chip.png) | 选中节点会自动在 Agent 输入区加入引用 chip，形成画布到对话的上下文桥。 |
| 节点拓扑编辑 | [canvas-manual-group-connected-nodes-and-actions.png](screenshots/canvas-manual-group-connected-nodes-and-actions.png) | 已实测节点重命名、创建副本、手工连线、普通分组、解组、撤销/重做和复制内部连线。 |
| 工具箱 | [toolbox-preset-library.png](screenshots/toolbox-preset-library.png) | 工具箱包含“我的工具”和预设目录；实测预设会一次创建成组节点与依赖连线。 |
| 素材库入口 | [material-library-style-and-effects-entry.png](screenshots/material-library-style-and-effects-entry.png) | 当前入口聚合风格库与特效库，两者语义是新增专用节点。 |
| 角色库详情 | [character-library-detail-and-apply.png](screenshots/character-library-detail-and-apply.png) | 角色详情包含标签、多类参考图和“应用至画布”；实测应用会创建四个图片节点。 |
| 角色筛选 | [character-library-filter-taxonomy.png](screenshots/character-library-filter-taxonomy.png) | 可按性别、年龄、种族、时代、文化区域、体型、发色筛选，并支持最近使用。 |
| 资产管理 | [asset-management-canvas-elements-node-list.png](screenshots/asset-management-canvas-elements-node-list.png) | 底部入口同时管理当前画布节点、个人/Agent 资产，并可进入完整个人资产库与可灵主体库。 |
| 历史资产 | [generated-asset-history-empty-state.png](screenshots/generated-asset-history-empty-state.png) | “历史记录”实际是图片/视频/音频生成资产记录，支持排序、批量操作和缩放，不是工作流版本历史。 |
| 快捷键 | [keyboard-shortcuts-creation-navigation.png](screenshots/keyboard-shortcuts-creation-navigation.png) | 覆盖成组、分镜组、解组、连线、复制、生成、新建节点、平移、缩放、撤销和重做。 |
| 帮助入口 | [help-support-entry-menu.png](screenshots/help-support-entry-menu.png) | 教程菜单同时提供使用指南、客服、销售和公众号入口。 |

### 项目管理桌面实现基准

以下 `1440x900` 截图固定了 `/project` 的桌面网格、卡片尺寸、顶部导航、动作菜单
和确认层位置：

- [全部项目列表](screenshots/project-list-canonical-desktop-1440x900-hires.png)
- [项目卡动作菜单](screenshots/project-card-actions-menu-desktop-1440x900-hires.png)
- [项目名内联编辑](screenshots/project-rename-inline-editor-desktop-1440x900-hires.png)
- [移动至文件夹空态二级菜单](screenshots/project-move-to-folder-empty-submenu-desktop-1440x900-hires.png)
- [删除项目确认层](screenshots/project-delete-confirmation-dialog-desktop-1440x900-hires.png)

项目卡更多动作只在卡片悬停后显示。重命名直接替换卡片标题为已全选的单行输入框，
本轮用 `Escape` 取消；移动菜单在没有目标文件夹时仍展开二级空态；删除使用居中
模态层和全页遮罩，本轮明确点击“取消”。“修改封面”直接调用本地文件选择器，
没有可单独复刻的站内弹层。

## 故事板视图与媒体详情

故事板不是独立的简化预览。它会把同一画布投影为音频、文本、图片和视频列，并在
已生成媒体上提供再生成参数、衍生编辑和视频合成入口。

### 列、筛选与展开

| 状态 | 截图 | 观察结论 |
| --- | --- | --- |
| 视频筛选 | [storyboard-video-filter-all-final-clips-options.png](screenshots/storyboard-video-filter-all-final-clips-options.png) | 视频列可切换全部、成片和片段。 |
| 成片空态 | [storyboard-video-final-filter-empty-state.png](screenshots/storyboard-video-final-filter-empty-state.png) | 当前示例成品与待生成视频均不属于“成片”，筛选后显示明确空态。 |
| 片段结果 | [storyboard-video-clip-filter-generated-and-pending.png](screenshots/storyboard-video-clip-filter-generated-and-pending.png) | 已生成的 5 秒视频和待确认视频都归入“片段”，说明筛选类型与任务状态是两个维度。 |
| 图片列展开 | [storyboard-image-column-expanded-thumbnail-grid.png](screenshots/storyboard-image-column-expanded-thumbnail-grid.png) | 图片列可从纵向卡片切换到更密集的缩略图网格。 |
| 视频列展开 | [storyboard-video-column-expanded-thumbnail-grid.png](screenshots/storyboard-video-column-expanded-thumbnail-grid.png) | 视频列提供同类放大/展开视图，并保留名称和生成元数据。 |

### 已生成视频详情与剪辑

| 状态 | 截图 | 观察结论 |
| --- | --- | --- |
| 详情与再生成 | [storyboard-generated-video-detail-player-and-regeneration-controls.png](screenshots/storyboard-generated-video-detail-player-and-regeneration-controls.png) | 详情同时包含 0:00-0:05 播放器、两份参考、提示词、Kling O1、图生视频和成本 35 的再生成配置。 |
| 更多动作 | [storyboard-generated-video-detail-more-actions.png](screenshots/storyboard-generated-video-detail-more-actions.png) | 已生成视频可设置关键元素、创建副本或删除。 |
| 参考拖入 | [storyboard-video-detail-reference-drop-tooltip.png](screenshots/storyboard-video-detail-reference-drop-tooltip.png) | 图片、视频和资产都可拖入参考区域，输入不是固定单一图片槽。 |
| 特效市场 | [storyboard-video-detail-effects-market-catalog.png](screenshots/storyboard-video-detail-effects-market-catalog.png) | 详情内特效分广场、收藏、最近使用，支持搜索、分类和模型筛选。 |
| 运镜库 | [storyboard-video-detail-camera-movement-library.png](screenshots/storyboard-video-detail-camera-movement-library.png) | 运镜库覆盖固定、跟随、环绕、推拉摇移、变焦、手持、无人机和第一人称等预设。 |
| 输出参数 | [storyboard-video-detail-output-quality-duration-count.png](screenshots/storyboard-video-detail-output-quality-duration-count.png) | 可选择标准/高品质、自适应分辨率、5/10 秒和输出数量。 |
| 空时间线 | [storyboard-video-editor-empty-timeline-controls.png](screenshots/storyboard-video-editor-empty-timeline-controls.png) | “剪辑”进入内嵌视频合成器；不会自动把当前卡片加入时间线，空态下裁切、分割和速度动作禁用。 |
| 转场 | [storyboard-video-editor-transition-library-and-properties.png](screenshots/storyboard-video-editor-transition-library-and-properties.png) | 转场库包含淡入淡出、黑场和白场，未选片段时属性与删除动作保持禁用。 |
| 字幕 | [storyboard-video-editor-subtitle-panel-empty-state.png](screenshots/storyboard-video-editor-subtitle-panel-empty-state.png) | 字幕/文本是独立面板和时间线轨道，支持搜索与新建字幕。 |
| 导出 | [storyboard-video-editor-export-local-or-canvas-disabled.png](screenshots/storyboard-video-editor-export-local-or-canvas-disabled.png) | 可导出到本地或画布；空时间线时两项均禁用。 |

本地复刻已按上述四个官网状态完成内嵌几何、层级和空态，并用原创 fixture 补齐了官网
当前账户未触发的有效片段路径：裁切、播放头分割、变速、拖拽重排、源音频/独立音轨、
转场、字幕、刷新恢复与真实本地 MP4 导出。逐状态对照、保留差异和自动化证据见
[视频合成器对比](../../visual/video-compositor-comparison.md)。这里的本地结果不提升官网
“有效输入/失败态”的证据等级。

### 已生成图片工具

| 状态 | 截图 | 观察结论 |
| --- | --- | --- |
| 首层动作 | [storyboard-generated-image-detail-tool-actions.png](screenshots/storyboard-generated-image-detail-tool-actions.png) | 图片详情动作条包含人像质感、全景、多角度、打光、九宫格、更多、下载和展开。 |
| 基础编辑 | [storyboard-generated-image-detail-more-hd-crop-rotate.png](screenshots/storyboard-generated-image-detail-more-hd-crop-rotate.png) | “更多”提供高清、裁剪和旋转。 |
| 裁剪默认态 | [storyboard-generated-image-crop-original-aspect-confirm.png](screenshots/storyboard-generated-image-crop-original-aspect-confirm.png) | 裁剪编辑器默认保留原图比例，并有关闭和确认动作；本轮未确认。 |
| 裁剪比例 | [storyboard-generated-image-crop-aspect-ratio-options.png](screenshots/storyboard-generated-image-crop-aspect-ratio-options.png) | 比例包含原图、1:1、4:3、3:4、16:9 和 9:16。 |
| 多角度 | [storyboard-generated-image-multi-angle-editor-controls.png](screenshots/storyboard-generated-image-multi-angle-editor-controls.png) | 提供鱼眼、倾斜、俯拍、仰拍、背面等预设，以及水平环绕、垂直俯仰、景别缩放、提示词和重置。 |
| 打光 | [storyboard-generated-image-lighting-editor-controls.png](screenshots/storyboard-generated-image-lighting-editor-controls.png) | 可调全局亮度/颜色、主光方向和轮廓光；未改变参数时执行动作禁用。 |
| 九宫格目录 | [storyboard-generated-image-nine-grid-preset-menu.png](screenshots/storyboard-generated-image-nine-grid-preset-menu.png) | 当前菜单列出多机位、剧情推演、角色/场景/产品设定、25 宫格、光影校正、角色三视图和前后画面推演。 |
| 九宫格待确认 | [storyboard-nine-grid-preset-creates-pending-image-node-and-cost.png](screenshots/storyboard-nine-grid-preset-creates-pending-image-node-and-cost.png) | “多机位九宫格”先创建带参考边的待确认图片节点；Lib Image、16:9、高画质、4K、1 张，显示成本 124，未执行生成。 |
| 人像/情绪分流 | [storyboard-generated-image-portrait-and-emotion-adjustment-menu.png](screenshots/storyboard-generated-image-portrait-and-emotion-adjustment-menu.png) | 人像质感入口继续分为人像调节和情绪调节。 |
| 人像待确认 | [storyboard-portrait-quality-adjustment-pending-image-and-cost.png](screenshots/storyboard-portrait-quality-adjustment-pending-image-and-cost.png) | 人像调节创建带一份参考的待确认节点；Lib Image、16:9、标准画质、2K、1 张，成本 22。 |
| 情绪人物识别 | [storyboard-image-emotion-adjustment-person-selection.png](screenshots/storyboard-image-emotion-adjustment-person-selection.png) | 情绪调节先识别人像，并允许选择识别结果或手动框选，不会立即生成。 |
| 情绪定位 | [storyboard-image-emotion-adjustment-positioning-panel.png](screenshots/storyboard-image-emotion-adjustment-positioning-panel.png) | 选定人物后以激动/平静、亲近/疏离四向坐标定位情绪，默认文案为“淡然自若”，成本 22。 |
| 情绪输出 | [storyboard-image-emotion-adjustment-output-count-options.png](screenshots/storyboard-image-emotion-adjustment-output-count-options.png) | 分辨率可选 1K/2K/4K，数量可选 1/2/4 张；本轮未提交。 |

## 生成与制作节点登录态实测

以下状态均来自当前登录态画布。只展开默认配置、选择器、空态和可逆预设，未提交图片、
视频、音频或脚本生成，也未消耗积分。

### 文本节点

| 状态 | 截图/证据 | 观察结论 |
| --- | --- | --- |
| 空节点 | [text-node-arranged-full-card.png](screenshots/text-node-arranged-full-card.png) | 固定显示自己编写内容、文生视频、图片反推提示词、文字生音乐四个入口。 |
| 节点生成器 | [当前 Text 捕获](../../api/captures/2026-09-03-text-authoring.md) | 深色节点附着浮层约 660px；提示词、参考、模型、翻译、积分和生成位于同一层。 |
| 模型目录 | [当前 Text 捕获](../../api/captures/2026-09-03-text-authoring.md) | 顺序为 GVLM 3.1、CVLM 5.5、GVLM 3.1 Flash、Qwen 3 VL Flash，并显示 10–20s 与描述。 |
| 手写文档 | [当前 Text 捕获](../../api/captures/2026-09-03-text-authoring.md) | 约 350×200；工具栏包含背景、三级标题、正文、粗斜体、两类列表、分割线、复制和展开。 |
| 文生视频 | [当前 Text 捕获](../../api/captures/2026-09-03-text-authoring.md) | 一次创建 `预设 - 文生视频` 的 Text → Video 图，Video 默认为 2.0 Fast / 16:9 / 720p / 5s / 1 / 静音。 |
| 图片反推提示词 | [当前 Text 捕获](../../api/captures/2026-09-03-text-authoring.md) | 一次创建 `预设 - 图片反推提示词` 的 Image → Text 图。 |
| 文字生音乐 | [当前 Text 捕获](../../api/captures/2026-09-03-text-authoring.md) | 一次创建 `预设 - 文字生音乐` 的 Text → Audio 图，Audio 使用 Mureka V8。 |

当前 Text 编辑进一步触发了 `POST /api/canvas/nodes/batch`；手写节点投影为
`text_resource + content[]`，生成节点使用独立 prompt/model 语义；报价响应确认
`POST /api/task/generation/power/calculator` 的 `data.power`。完整脱敏字段见上表链接。
本地复刻将富文本保存为无 HTML 的 block tree，三个 starter 作为一个 revision transaction，
并通过通用 Job 生成 `.txt + textContent` 后投影到 Storyboard。实现差异和基线见
[`../../visual/text-authoring-comparison.md`](../../visual/text-authoring-comparison.md)，长期后端契约见
[`../../../../api/TEXT_AUTHORING_STATE.md`](../../../../api/TEXT_AUTHORING_STATE.md)。

### 图片节点

| 状态 | 截图 | 观察结论 |
| --- | --- | --- |
| 默认生成器 | [image-node-default-lib-image-controls.png](screenshots/image-node-default-lib-image-controls.png) | 默认进入 Lib Image 图片生成器，提示词、参考图、模型、参数和积分区集中在节点内。 |
| 模型目录 | [image-node-model-catalog-with-latency.png](screenshots/image-node-model-catalog-with-latency.png) | 模型卡同时展示提供方、版本/档位和预计生成耗时。 |
| 输出参数 | [image-node-output-quality-resolution-aspect-count.png](screenshots/image-node-output-quality-resolution-aspect-count.png) | 质量、分辨率、画幅比例和生成张数是独立参数，并共同影响成本。 |
| 预设目录 | [image-node-preset-catalog-storyboard-quality-camera-design.png](screenshots/image-node-preset-catalog-storyboard-quality-camera-design.png) | 预设按故事板、画质、镜头和设计等创作意图组织，不只是模型快捷方式。 |
| 画布参考 | [image-node-reference-select-from-canvas-mode.png](screenshots/image-node-reference-select-from-canvas-mode.png) | 参考图可以从当前画布选择，形成节点间的显式素材依赖。 |
| 风格市场 | [image-node-style-market-categories-commercial-filter.png](screenshots/image-node-style-market-categories-commercial-filter.png) | 节点内可直接浏览风格分类，并按“可商用”筛选。 |
| 全景预览 | [image-node-panorama-preview-camera-and-multiview-actions.png](screenshots/image-node-panorama-preview-camera-and-multiview-actions.png) | 已生成图片可进入节点内全景预览，调整横纵视角与缩放，并导出当前、4 大或 12 大视角截图。 |

### 视频节点

| 状态 | 截图 | 观察结论 |
| --- | --- | --- |
| 默认生成器 | [video-node-default-seedance-controls-and-advanced-settings.png](screenshots/video-node-default-seedance-controls-and-advanced-settings.png) | 默认 Seedance 生成器包含输入槽、提示词、输出参数和高级设置。 |
| 模型目录 | [video-node-model-catalog-with-estimated-duration.png](screenshots/video-node-model-catalog-with-estimated-duration.png) | 模型目录直接给出预计耗时，支持在能力与等待成本之间选择。 |
| 输入驱动模式 | [video-node-generation-modes-dependent-on-inputs.png](screenshots/video-node-generation-modes-dependent-on-inputs.png) | 文生视频、首帧和首尾帧等模式随已连接输入变化。 |
| 输出参数 | [video-node-output-aspect-resolution-duration-audio-count.png](screenshots/video-node-output-aspect-resolution-duration-audio-count.png) | 画幅、分辨率、时长、音频开关和生成数量构成一次视频任务的输出规格。 |
| 高级设置 | [video-node-advanced-settings-web-search-and-auto-validation.png](screenshots/video-node-advanced-settings-web-search-and-auto-validation.png) | 高级设置包含联网搜索与自动合规校验开关。 |
| 画布参考选择 | [图片节点同模式证据](screenshots/image-node-reference-select-from-canvas-mode.png) | 当前 Video 入口实测会进入蓝色“从画布选择参考”画布模式；既有来源显示“取消选择”，返回节点与退出是两条独立动作。 |
| 局部元素标记 | 当前登录态 DOM 实测 | “标记”进入“元素选择模式”，提示“点击图片选择局部元素”，普通画布 chrome 暂时隐藏。 |
| `@` 富引用 | 当前登录态 DOM 实测 | 参考卡按数字编号；点击 `@` 会把可辨识 token 插入提示词并打开来源预览，提示“双击可聚焦至节点”。 |
| 特效市场 | [video-node-effects-market-recommended-commercial-catalog.png](screenshots/video-node-effects-market-recommended-commercial-catalog.png) | 视频节点可从推荐特效市场选取标记为可商用的预设。 |
| 运镜库 | [video-node-camera-movement-library-presets.png](screenshots/video-node-camera-movement-library-presets.png) | 运镜是四列媒体卡大面板，含运镜广场/我的收藏/我的运镜、搜索和星标；当前实测共 23 项。 |

当前深色版 DOM 进一步确认：Video 编辑器是节点内部的 `node-floating-ui`，原始宽度
`660px`，通过画布 zoom 的倒数缩放保持稳定屏幕尺寸，并带 `nodrag / nowheel / nopan`
事件边界。当前目录可见 36 个 Video 模型；模式和输出值同时受模型能力与已连接素材约束。
当前运镜广场按顺序显示：固定镜头、跟随拍摄、盘旋抬升、盘旋下降、镜头上摇、镜头下摇、
镜头左摇、镜头右摇、镜头上升、镜头下降、镜头左移、镜头右移、镜头前推、镜头后移、
变焦推进、变焦拉远、柯克变焦、环绕拍摄、滚筒旋转、第一视角、无人机、高空航拍、手持拍摄。
本地复刻以工作流边作为参考来源真相，选择/取消后生成模式和依赖门立即重新计算。
本地逐项实现、代表模型和视觉差异见
[`../../visual/video-model-editor-comparison.md`](../../visual/video-model-editor-comparison.md)。

### 音频节点

| 状态 | 截图 | 观察结论 |
| --- | --- | --- |
| 默认 TTS | [audio-node-default-tts-composer.png](screenshots/audio-node-default-tts-composer.png) | 默认是文字转语音编辑器，支持长文本输入并在提交区展示成本。 |
| TTS 控制 | [audio-node-default-tts-controls-and-voice-effects.png](screenshots/audio-node-default-tts-controls-and-voice-effects.png) | 默认模型为 Minimax-speech-2.8-hd；语速、音调、音量、情绪、音色和效果均可调。 |
| 模型目录 | [audio-node-model-catalog-speech-music-multimodal.png](screenshots/audio-node-model-catalog-speech-music-multimodal.png) | 同一目录覆盖语音、音乐和多模态音频模型，包括 Seed Audio、Minimax、Eleven 与 Mureka 系列。 |
| 音色库 | [audio-node-voice-library-tabs-clone-filter-and-pagination.png](screenshots/audio-node-voice-library-tabs-clone-filter-and-pagination.png) | 音色库分公共、我的、收藏三类；实测列表显示 327 个音色、17 页，并提供克隆入口。 |
| 音色筛选 | [audio-node-voice-library-filter-language-accent-gender-age.png](screenshots/audio-node-voice-library-filter-language-accent-gender-age.png) | 可按语言/口音、性别和青年、成年、儿童、老年等年龄筛选。 |
| 音色克隆 | [audio-node-voice-cloning-consent-and-recording-flow.png](screenshots/audio-node-voice-cloning-consent-and-recording-flow.png) | 克隆流程要求朗读指定文本、录音并勾选授权声明；条件不齐时生成按钮禁用。 |
| 停顿标记 | [audio-node-pause-marker-presets-and-custom-duration.png](screenshots/audio-node-pause-marker-presets-and-custom-duration.png) | 可插入 0.25、0.5、1、1.5 秒或自定义停顿标记；测试标记随后已清空。 |
| 副语言提示上半部 | [audio-node-paralinguistic-cue-preset-library.png](screenshots/audio-node-paralinguistic-cue-preset-library.png) | 预设覆盖笑声、咳嗽、换气、喘气、吸气、呼气、叹气等非语言声音。 |
| 副语言提示下半部 | [audio-node-paralinguistic-cue-preset-library-lower-items.png](screenshots/audio-node-paralinguistic-cue-preset-library-lower-items.png) | 下半部补充打嗝、咂嘴、哼唱、口哨、喷嚏、抽泣和鼓掌，共观察到 21 类。 |

### 脚本节点

| 状态 | 截图 | 观察结论 |
| --- | --- | --- |
| 新版入口 | [script-node-default-generator-and-three-entry-paths.png](screenshots/script-node-default-generator-and-three-entry-paths.png) | 新版脚本提供“剧本生成”“角色生成”和“自己编写”三条入口，默认 GVLM 3.1、成本 6。 |
| 语言模型 | [script-node-language-model-catalog-with-latency.png](screenshots/script-node-language-model-catalog-with-latency.png) | 可选 GVLM 3.1 Pro、CVLM 5.5 与 GVLM 3.1 Flash Lite，并展示约 10 到 20 秒的预计耗时。 |
| 确认镜头 | [script-v2-manual-storyboard-confirm-shots-table.png](screenshots/script-v2-manual-storyboard-confirm-shots-table.png) | 手写入口进入全屏三阶段流程；第一阶段按镜号、时长、画面、景别、对白、音效、运镜和最终提示词编辑。 |
| 景别选择 | [script-v2-shot-size-selector-options.png](screenshots/script-v2-shot-size-selector-options.png) | 景别提供大远景到大特写以及头肩、半身、全身等 12 个选项；镜头时长范围为 5 到 15 秒。 |
| 准备资产 | [script-v2-prepare-assets-characters-scenes-props.png](screenshots/script-v2-prepare-assets-characters-scenes-props.png) | 第二阶段按角色、场景和道具三类准备可复用资产。 |
| 角色来源 | [script-v2-add-character-source-options.png](screenshots/script-v2-add-character-source-options.png) | 新角色可来自 AI 生成、当前画布或本地上传。 |
| AI 角色表单 | [script-v2-add-character-ai-generation-form.png](screenshots/script-v2-add-character-ai-generation-form.png) | 角色 AI 生成表单复用 Lib Image、质量、分辨率、画幅和成本规格；无提示词时确认生成禁用。 |
| 删除影响 | [script-v2-delete-asset-impact-options.png](screenshots/script-v2-delete-asset-impact-options.png) | 删除角色资产时可选择保留分镜文本，或同时移除分镜中的角色与 `@` 引用。 |
| 合成提示词 | [script-v2-compose-prompts-phase-and-batch-action.png](screenshots/script-v2-compose-prompts-phase-and-batch-action.png) | 第三阶段支持一键合成全部提示词；批量视频动作在前置内容未完成时禁用。 |
| 旧版默认态 | [script-legacy-node-default-reference-inputs.png](screenshots/script-legacy-node-default-reference-inputs.png) | 旧版 Beta 提供剧本、视频参考和角色参考三种分镜脚本入口，仍使用节点内大输入框。 |
| 旧版视频预设 | [script-legacy-video-reference-preset-graph.png](screenshots/script-legacy-video-reference-preset-graph.png) | “视频参考”会创建预设分组、空视频节点、脚本节点并自动连线；调研后已删除整组临时节点。 |

Script V2 的本地实现是 frontend-only local mock：脚本状态只保存在
`node.data.extra.scriptV2`，不读取真实 LibTV 凭证、不调用真实后端。报价、四种任务
operation、轮询和取消/重试的本地契约见 [`SCRIPT_V2_STATE.md`](../../../../api/SCRIPT_V2_STATE.md)
与 [`docs/api/openapi.yaml`](../../../../api/openapi.yaml)；官网请求形状和证据等级见
[`Script V2 协议捕获`](../../api/captures/2026-09-03-script-v2.md)。

| 本地 operation | UI 连接 |
|---|---|
| `quoteScriptV2` | 生成/资产识别/提示词合成/AI 资产生成前的报价门，不收费。 |
| `createScriptV2Run` | 提交 `generate-full`、`recognize-assets-only`、`recompute-prompts` 或 `generate-asset`。 |
| `getScriptV2Run` | 刷新安全的进度轮询；确定性 mock 从 queued 推进 running 再到 succeeded。 |
| `transitionScriptV2Run` | 取消 queued/running，或重试 failed/cancelled。 |

### Storyboard 与关键媒体 API 边界

Storyboard 没有独立的持久化 route：它是 `GET /api/canvases/{canvasId}` 返回的同一份
`WorkflowDocument`（`groups`、`nodes`、`artifacts`）的投影。列、镜头详情和再生成面板
通过 `POST /api/canvases/{canvasId}` 的 `expectedRevision` mutation 写回；生成进度从
`/api/jobs` 轮询，导出由 `/api/compose` 同步登记本地 video artifact/asset。分组缩略图
使用 `/api/preview/stitch`，角色参考预览使用 `/api/preview/character`；两者都返回本地
SVG 字节流，不返回 JSON envelope。

| Surface | 本地 contract | 脱敏样本/证据 |
|---|---|---|
| Storyboard bootstrap | `CanvasDetailResponse` | [`openapi.yaml`](../../../../api/openapi.yaml) |
| Storyboard / Video job | `ListJobsResponse`、`GetJobResponse`、`TransitionJobResponse` | [`jobs-get.response.json`](../../../../api/examples/jobs-get.response.json) |
| Video compose | `ComposeRequest` → `ComposeResponse` | [`compose.request.json`](../../../../api/examples/compose.request.json)、[`compose.response.json`](../../../../api/examples/compose.response.json) |
| Script V2 state/result | `ScriptV2State`、四种 operation-discriminated run | [`SCRIPT_V2_STATE.md`](../../../../api/SCRIPT_V2_STATE.md)、[Script V2 capture](../../api/captures/2026-09-03-script-v2.md) |

以上均属于 frontend-only local mock：媒体 URL 只允许本地 `/api/media/*` 或 fixture 路径，
不读取真实 LibTV 凭证、不发送 Cookie/Authorization，也不把 Storyboard 状态复制到第二个
文档或远端资源。

### 视频合成

| 状态 | 截图 | 观察结论 |
| --- | --- | --- |
| 无输入空态 | [video-composite-node-empty-requires-connected-video.png](screenshots/video-composite-node-empty-requires-connected-video.png) | 合成节点没有已生成视频输入时只显示连接提示；连接空视频节点仍不会开启编辑器。 |

### 导演台

| 状态 | 截图 | 观察结论 |
| --- | --- | --- |
| 画布节点 | [director-node-default-3d-scene-multiview-entry.png](screenshots/director-node-default-3d-scene-multiview-entry.png) | 导演台节点说明其用途是 3D 搭景与多视角截图，并提供独立工作室入口。 |
| 默认 3D 编辑器 | [director-studio-default-3d-scene-editor.png](screenshots/director-studio-default-3d-scene-editor.png) | 全屏编辑器默认包含机位 1、角色 A、场景树、属性面板和可交互 3D 视口。 |
| 姿势与关节 | [director-studio-pose-presets-and-joint-controls.png](screenshots/director-studio-pose-presets-and-joint-controls.png) | 角色提供 20 类姿势预设，并可细调躯干、头、肩肘、髋膝等关节。 |
| 机位视角 | [director-studio-camera-view-mode.png](screenshots/director-studio-camera-view-mode.png) | 摄像机模式支持预览、FOV、机位切换、位置、旋转、跟随与注视目标。 |
| 画幅选择 | [director-studio-camera-aspect-ratio-options.png](screenshots/director-studio-camera-aspect-ratio-options.png) | 画幅覆盖自动、21:9、16:9、4:3、1:1、3:4 和 9:16。 |
| AI 识图导入 | [director-studio-ai-image-import-source-and-overwrite-modes.png](screenshots/director-studio-ai-image-import-source-and-overwrite-modes.png) | 图片可来自本地或历史；识图结果可插入新导演台或覆盖当前场景，退出不会中断识别。 |
| 动画引导 | [director-studio-animation-timeline-onboarding.png](screenshots/director-studio-animation-timeline-onboarding.png) | 首次进入时间轴会展示分步引导，说明关键帧和镜头运动的基本流程。 |
| 动画时间轴 | [director-studio-animation-timeline-controls.png](screenshots/director-studio-animation-timeline-controls.png) | 时间轴支持播放、自动帧、循环、总时长、缩放、主机位轨道、绘制轨迹和导出画布。 |
| 快捷键 | [director-studio-keyboard-shortcuts.png](screenshots/director-studio-keyboard-shortcuts.png) | 覆盖视角切换、移动/旋转/缩放、WASDQE、吸附、成组、撤销和删除。 |
| 全景来源 | [director-studio-panorama-source-tabs.png](screenshots/director-studio-panorama-source-tabs.png) | 全景背景可来自本地、历史或 AI 生成。 |
| 全景 AI 表单 | [director-studio-panorama-ai-generation-form.png](screenshots/director-studio-panorama-ai-generation-form.png) | AI 全景以参考图上传为前置，生成异步进入历史；空输入时生成按钮禁用。 |

### 风格与特效素材库

| 状态 | 截图 | 观察结论 |
| --- | --- | --- |
| 全局入口 | [asset-library-toolbar-style-and-effects-entry.png](screenshots/asset-library-toolbar-style-and-effects-entry.png) | 左侧素材库先分流到风格库和特效库，两者都标记为新增素材节点。 |
| 风格市场 | [style-library-market-categories-commercial-catalog.png](screenshots/style-library-market-categories-commercial-catalog.png) | 风格广场支持搜索、收藏、最近使用、分类、模型类别和可商用筛选。 |
| 风格详情 | [style-library-detail-commercial-and-compatible-models.png](screenshots/style-library-detail-commercial-and-compatible-models.png) | 详情显示作者、商用声明、首选模型、其他兼容模型，并提供收藏与使用。 |
| 特效市场 | [effects-library-market-commercial-catalog.png](screenshots/effects-library-market-commercial-catalog.png) | 特效广场支持搜索、收藏、最近使用和商业许可标识，卡片同时展示作者与使用量。 |
| 特效节点 | [effects-asset-node-selected-preset-and-replace-action.png](screenshots/effects-asset-node-selected-preset-and-replace-action.png) | 点击特效卡会立即创建带预览和“更换特效”的素材节点；验证后已删除临时节点。 |

### 资产管理

资产管理分为画布侧栏与完整资产库两层。侧栏负责在当前图中定位节点、区分个人与
Agent 资产；完整资产库负责文件夹、上传、标签和批量组织。

| 状态 | 截图 | 观察结论 |
| --- | --- | --- |
| 画布节点清单 | [asset-management-canvas-elements-node-list.png](screenshots/asset-management-canvas-elements-node-list.png) | 侧栏显示项目、画布以及当前节点总数；调研基线中的七类节点均可从列表定位。 |
| 节点类型筛选 | [asset-management-node-type-filter-options.png](screenshots/asset-management-node-type-filter-options.png) | 可按文本、图片、视频、视频合成、导演台、音频、新/旧脚本筛选。 |
| 节点更多动作 | [asset-management-node-more-actions-rename-copy.png](screenshots/asset-management-node-more-actions-rename-copy.png) | 节点行提供重命名和复制；本轮只展开菜单，未改写原节点。 |
| 个人资产空态 | [asset-management-personal-assets-empty-state.png](screenshots/asset-management-personal-assets-empty-state.png) | 侧栏个人资产支持搜索和标签筛选；当前账户为空。 |
| 标签筛选 | [asset-management-asset-tag-filter-options.png](screenshots/asset-management-asset-tag-filter-options.png) | 标签包含其它、人物、场景、物品、风格和音效，并有清空/应用动作。 |
| Agent 资产空态 | [asset-management-agent-assets-separate-empty-state.png](screenshots/asset-management-agent-assets-separate-empty-state.png) | Agent 是独立资产命名空间，不与个人资产空态合并。 |
| 完整个人资产库 | [asset-management-full-personal-library-empty-state.png](screenshots/asset-management-full-personal-library-empty-state.png) | 完整弹层提供分类、搜索、批量操作、新建和上传入口。 |
| 新建菜单 | [asset-management-new-folder-upload-menu.png](screenshots/asset-management-new-folder-upload-menu.png) | “新建”分流到新建文件夹和上传资产。 |
| 批量动作 | [asset-management-batch-actions-and-fifty-item-limit.png](screenshots/asset-management-batch-actions-and-fifty-item-limit.png) | 批量态支持全选当前页、移动、改标签和删除；文件夹不参与选择，单次上限 50 个资产。 |
| 可灵主体库 | [asset-management-kling-subject-library-categories.png](screenshots/asset-management-kling-subject-library-categories.png) | 主体库按人物、场景、道具、特效和其他分类，并在空态提供创建主体入口。 |

### 工具箱预设

| 状态 | 截图 | 观察结论 |
| --- | --- | --- |
| 预设目录 | [toolbox-preset-catalog-motion-commerce-storyboard.png](screenshots/toolbox-preset-catalog-motion-commerce-storyboard.png) | 目录覆盖运镜、电商展示、角色动画、转场、空间效果、时装、分镜和室内预览等工作流。 |
| 模板说明 | [toolbox-template-description-and-tutorial-link.png](screenshots/toolbox-template-description-and-tutorial-link.png) | 模板信息卡解释其加速创作用途，并提供教程入口。 |
| 实例化结果 | [toolbox-preset-instantiated-three-node-group-and-edges.png](screenshots/toolbox-preset-instantiated-three-node-group-and-edges.png) | “左弧滑行”预设一次创建参考图片、富文本提示词和输出视频三个节点，并建立三条依赖边。 |
| 分组动作 | [toolbox-preset-group-context-actions.png](screenshots/toolbox-preset-group-context-actions.png) | 实例组可复制、创建副本、粘贴、删除和复制到剪贴板；无生成结果时保存资产与创建主体禁用。 |
| 分镜转换资格 | [storyboard-conversion-disabled-for-three-node-toolbox-preset.png](screenshots/storyboard-conversion-disabled-for-three-node-toolbox-preset.png) | 预设组已有参考图、提示词、成品和三条依赖边，但动作条中的“转分镜组”仍禁用；资格不只取决于节点类型和拓扑。 |
| 故事板产物映射 | [storyboard-toolbox-preset-full-width-output-metadata.png](screenshots/storyboard-toolbox-preset-full-width-output-metadata.png) | 预设实例在故事板中映射为文本、图片、视频；参考图显示 `2000 x 3000`，成品显示 Kling O1、5 秒和 `1176 x 1764`。 |
| 富文本参考详情 | [storyboard-reference-detail-rich-prompt-from-toolbox.png](screenshots/storyboard-reference-detail-rich-prompt-from-toolbox.png) | 点击提示词参考项可查看中英文提示词与操作建议，并可设置关键元素、创建副本、删除或添加到对话。 |

删除该预设分组会同时删除三个子节点和三条依赖边。本轮删除后再次通过资产侧栏确认
画布恢复为七个原始节点。

另用空文本、空图片、空视频建立两节点与三节点链路后创建普通组，“转分镜组”同样
保持禁用。后续使用四张已生成角色参考图组成普通组时，该动作变为可用，说明核心
资格是组内具有可用图片产物，而不是只检查节点类型、连线数量或工具箱来源。

### 角色库应用

| 状态 | 截图 | 观察结论 |
| --- | --- | --- |
| 应用结果 | [character-library-apply-creates-four-reference-image-nodes.png](screenshots/character-library-apply-creates-four-reference-image-nodes.png) | “甜妹/清新少女”应用后创建三视图、表情参考、脸部近景和角色立绘四个独立图片节点，没有自动成组或连线。 |
| 图片节点动作 | [character-library-applied-image-node-context-actions.png](screenshots/character-library-applied-image-node-context-actions.png) | 已生成参考图可做 Seedance 合规校验、保存资产、全景预览、创建主体、复制和删除。 |
| 全景视角工具 | [image-node-panorama-preview-camera-and-multiview-actions.png](screenshots/image-node-panorama-preview-camera-and-multiview-actions.png) | 全景工具显示当前角度与视场缩放，并提供当前、4 大、12 大视角截图、参考线和全屏预览。 |

四个角色参考节点仅用于观察应用结果，随后逐个通过生成内容删除确认回滚；资产侧栏
最终仍显示七个原始节点。

### 分镜组

| 状态 | 截图 | 观察结论 |
| --- | --- | --- |
| 候选素材 | [storyboard-group-candidate-four-generated-character-images-selected.png](screenshots/storyboard-group-candidate-four-generated-character-images-selected.png) | 四张角色参考图都是已有产物；直接按“合并分镜组”快捷键不会从散节点创建分镜组。 |
| 普通组资格 | [storyboard-group-eligible-four-generated-images-toolbar.png](screenshots/storyboard-group-eligible-four-generated-images-toolbar.png) | 先按 `⌘G` 组成普通组后，“转分镜组”可用；空节点组和工具箱混合组则禁用。 |
| 成功态 | [storyboard-group-success-four-generated-images-2x2-controls.png](screenshots/storyboard-group-success-four-generated-images-2x2-controls.png) | 转换后显示“分镜组 4 个节点”，默认 16:9、2×2，并提供拼接、序号、清空、转普通组和解组。 |
| 画幅 | [storyboard-group-aspect-ratio-options.png](screenshots/storyboard-group-aspect-ratio-options.png) | 分镜组可选 21:9、16:9、4:3、1:1、3:4 和 9:16。 |
| 宫格 | [storyboard-group-grid-layout-options.png](screenshots/storyboard-group-grid-layout-options.png) | 固定宫格覆盖 2×2、3×3、4×4 和 5×5。 |
| 自定义宫格 | [storyboard-group-custom-grid-picker.png](screenshots/storyboard-group-custom-grid-picker.png) | “自定义”展开 5×5 选择矩阵，用于直接选择行列规模。 |
| 序号 | [storyboard-group-sequence-number-overlay-enabled.png](screenshots/storyboard-group-sequence-number-overlay-enabled.png) | 序号开关为每格叠加 `01` 到 `04`，关闭后可恢复无编号布局。 |
| 2K 拼接 | [storyboard-group-stitch-2k-creates-output-image-node.png](screenshots/storyboard-group-stitch-2k-creates-output-image-node.png) | 每次点击会立即创建一张 `2048×1152` 的“分镜拼接-2k”图片节点，没有二次确认；重复点击会产生重复输出。 |

截图中的四张参考图、测试分镜组和两次拼接输出均已删除，最终恢复七个原始节点和
一条原始连线。`⌘⌥G` 的文案是“合并分镜组”，用于已有分镜组之间的合并，不是
从散图片创建分镜组的入口。

### 手工拓扑与节点管理

以下操作全部使用空文本、空图片临时节点完成，没有填写提示词或触发生成。

| 状态 | 截图 | 观察结论 |
| --- | --- | --- |
| 节点右键菜单 | [canvas-text-node-context-copy-duplicate-delete.png](screenshots/canvas-text-node-context-copy-duplicate-delete.png) | 空文本节点可复制、创建副本、粘贴、删除和复制到剪贴板；无产物时保存资产与创建主体禁用。 |
| 副本与重命名 | [canvas-node-duplicate-and-inline-rename-result.png](screenshots/canvas-node-duplicate-and-inline-rename-result.png) | “创建副本”自动追加“副本”后缀；资产侧栏支持节点名内联编辑并以 Enter 提交。 |
| 手工连线 | [canvas-manual-text-to-image-connection-result.png](screenshots/canvas-manual-text-to-image-connection-result.png) | 从文本节点输出端拖到图片节点输入端会立即建立依赖并把文本加入图片参考；重复连接同一端点对不会新增第二条边。 |
| 普通分组 | [canvas-manual-group-connected-nodes-and-actions.png](screenshots/canvas-manual-group-connected-nodes-and-actions.png) | 多选后按 `⌘G` 创建普通组；动作条包含整组执行、添加到工具箱、转分镜组、解组和批量下载。 |
| 复制节点与边 | [canvas-copy-selected-nodes-preserves-internal-edge.png](screenshots/canvas-copy-selected-nodes-preserves-internal-edge.png) | 多选已连接节点后按 `⌘D`，两个副本之间会保留复制前的内部连线，外部连线不在本轮验证范围。 |

解组后按 `⌘Z` 可恢复原分组，再按 `⌘⇧Z` 会重做解组；两次操作都保留组内
文本到图片的依赖边。随后使用删除键移除五个临时节点，两条临时边同步删除，
资产侧栏重新显示七个原始节点。

“新建文件夹”单击后会立即创建“未命名文件夹”，不是先打开命名表单。文件夹菜单
支持打开、重命名、更换封面和删除；删除要求输入完整文件夹名，并警告其中项目会一并
不可恢复地删除。本轮误触创建的空文件夹已立即按该确认流程删除，原有项目未改动。

项目“修改封面”会直接唤起系统文件选择器，不经过站内二次弹层。本轮没有选择或上传
文件。“创建副本”可能直接产生持久化副作用，因此仅记录入口，尚未执行。

## 画布控制面

- 左侧：添加节点、移动、工具箱、素材库、角色库、历史资产、快捷键、教程。
- 底部：资产管理、自动整理、小地图、连线显隐、网格吸附、缩放。
- 顶部：项目名称、画布切换、工作流/故事板、分享/权益/账户、Agent 开关。
- 节点：左右连接点、生成器、模型与参数、右键操作、与 Agent 的上下文引用。

## 一比一桌面实现基准

以下图片固定为 `1440x900` CSS 视口，并保留完整 viewport，不裁切顶部导航、主工作区、
底部工具条或右侧 Agent。它们用于测量页面分栏、固定层、弹层锚点、留白和响应式压缩；
具体节点与媒体成功态仍应结合上方局部截图实现。

### 视图与分栏

| 基准态 | 截图 | 复刻时重点 |
| --- | --- | --- |
| 工作流全景 | [canvas-workflow-collaboration-following-desktop-1440x900-hires.png](screenshots/canvas-workflow-collaboration-following-desktop-1440x900-hires.png) | 记录 7 节点、1 条边、50% 缩放下的顶部导航、画布、左侧入口和底部工具条。抓取会话处于协作跟随态；显式跟随提示以“协作跟随”旧图为准。 |
| 故事板全景 | [storyboard-populated-collaboration-following-desktop-1440x900-hires.png](screenshots/storyboard-populated-collaboration-following-desktop-1440x900-hires.png) | 音频/文本侧栏与图片/视频主列的默认宽度、列间距、卡片高度和右下剪辑入口。 |
| 故事板与 Agent | [storyboard-with-agent-ask-human-desktop-1440x900-hires.png](screenshots/storyboard-with-agent-ask-human-desktop-1440x900-hires.png) | Agent 打开后故事板不是被遮挡，而是重排为更窄三列；右侧面板与顶部导航共享垂直边界。 |
| 图片列独占展开 | [storyboard-image-column-expanded-desktop-1440x900-hires.png](screenshots/storyboard-image-column-expanded-desktop-1440x900-hires.png) | 左侧音频/文本保持固定宽度，图片列占用剩余空间，视频列退出布局。 |
| 视频筛选菜单 | [storyboard-video-filter-menu-all-final-clips-desktop-1440x900-hires.png](screenshots/storyboard-video-filter-menu-all-final-clips-desktop-1440x900-hires.png) | 菜单锚定列头右侧，提供全部/成片/片段和当前项勾选，不推动下方内容。 |
| 视频列独占展开 | [storyboard-video-column-expanded-desktop-1440x900-hires.png](screenshots/storyboard-video-column-expanded-desktop-1440x900-hires.png) | 与图片展开共用同一分栏规则，同时保留视频筛选和剪辑入口。 |

### 核心入口与管理面板

| 基准态 | 截图 | 复刻时重点 |
| --- | --- | --- |
| 添加节点与资源 | [canvas-add-node-and-resource-menu-desktop-1440x900-hires.png](screenshots/canvas-add-node-and-resource-menu-desktop-1440x900-hires.png) | 菜单从底部加号向上展开，节点与资源分组；脚本、素材库继续有二级入口。 |
| 工具箱目录 | [canvas-toolbox-preset-library-desktop-1440x900-hires.png](screenshots/canvas-toolbox-preset-library-desktop-1440x900-hires.png) | 居中固定宽度面板使用三列媒体卡、内部纵向滚动和悬停“使用”动作，不改变画布缩放。 |
| 素材库入口 | [canvas-material-library-style-effects-desktop-1440x900-hires.png](screenshots/canvas-material-library-style-effects-desktop-1440x900-hires.png) | 风格库与特效库是锚定底部工具条的两项轻量菜单，均标注 `NEW`。 |
| 角色库详情与目录 | [canvas-character-library-detail-catalog-desktop-1440x900-hires.png](screenshots/canvas-character-library-detail-catalog-desktop-1440x900-hires.png) | 大模态框上部是当前角色四类完整参考，下部是横向角色目录，应用动作固定在详情区右下。 |
| 角色筛选上半段 | [canvas-character-library-filter-taxonomy-desktop-1440x900-hires.png](screenshots/canvas-character-library-filter-taxonomy-desktop-1440x900-hires.png) | 筛选浮层覆盖性别、年龄段、种族和时代；自身有 click-away 遮罩和内部滚动。 |
| 角色筛选下半段 | [canvas-character-library-filter-taxonomy-bottom-desktop-1440x900-hires.png](screenshots/canvas-character-library-filter-taxonomy-bottom-desktop-1440x900-hires.png) | 与上一张连续，补齐文化区域、体型和发色；两张共同构成完整筛选 taxonomy。 |
| 历史资产空态 | [canvas-generated-history-empty-desktop-1440x900-hires.png](screenshots/canvas-generated-history-empty-desktop-1440x900-hires.png) | 大型遮罩面板包含图片/视频/音频标签、缩放、排序、批量操作和居中空态。 |
| 快捷键完整面板 | [canvas-keyboard-shortcuts-full-panel-desktop-1440x900-hires.png](screenshots/canvas-keyboard-shortcuts-full-panel-desktop-1440x900-hires.png) | 四列一次展示创作、缩放、移动画布和其他操作；平台修饰键与鼠标/触控板图示都属于实现内容。 |
| 帮助与支持 | [canvas-help-support-menu-desktop-1440x900-hires.png](screenshots/canvas-help-support-menu-desktop-1440x900-hires.png) | 从底部问号向上锚定，按教程、客服、销售、公众号顺序排列。 |
| 资产管理画布元素 | [canvas-asset-management-elements-sidebar-desktop-1440x900-hires.png](screenshots/canvas-asset-management-elements-sidebar-desktop-1440x900-hires.png) | 左侧工作区面板压缩画布，列出 7 节点、类型筛选、搜索、定位和更多动作，并提供可拖动宽度分隔条。 |
| 资产管理个人空态 | [canvas-asset-management-personal-assets-empty-desktop-1440x900-hires.png](screenshots/canvas-asset-management-personal-assets-empty-desktop-1440x900-hires.png) | 资产标签内个人页保留搜索与类型筛选；空态文案为“暂无资产”。 |
| 资产管理 Agent 空态 | [canvas-asset-management-agent-assets-empty-desktop-1440x900-hires.png](screenshots/canvas-asset-management-agent-assets-empty-desktop-1440x900-hires.png) | Agent 资产是独立子标签，空态文案改为“暂无素材”，并隐藏个人页的搜索筛选行。 |

## 工作流、故事板与 Agent 的已观察关系

```text
工作流文本节点 -> 工作流图片节点
       |                 |
       +------ 故事板映射 +--> 文本 / 图片 / 视频列
                          |
                          +--> 查看参考元素 -> 源文本节点详情
                                               |
                                               +--> 添加到对话 -> Agent context chip

工具箱三节点组 -> 故事板示例产物 -> 查看富文本提示词
                                  -> 视频“对话” -> Agent 产物 context chip
```

该链路是当前站内直接交互所得。它证明三种视图共享可定位的节点身份，但不证明
故事板拥有独立持久化文档，也不证明 Agent 已执行或修改过节点。

## 官方指南补充

官方《LibTV 使用指南》补充了当前账户无法安全走到成功态的能力，视觉证据统一归档在 [官方指南参考](../../references/official-guide/)：

- 图片工具：当前 UI 已实测全景、多角度、打光、九宫格、裁剪/旋转和分镜组；官方另补充宫格切分、标注、镜像及部分成功输出。
- 视频工具：高清、解析、剪辑、多轨合成、人声/背景音分离、音视频分离。
- Slash 预设：故事板、调度故事板、角色设定、分镜宫格、光影、人像和情绪等。
- 导演台：轻量 3D 场景构图、多机位截图、运动与镜头路径。
- 脚本节点 v2：剧本拆解、资产提取、分镜调整、提示词合成、批量生图和批量生视频。

## 复刻要求

- 分离可编辑 `WorkflowDocument` 与提交后不可变 `ExecutionSpec`。
- 节点选择、Agent 引用、生成任务、生成资产是不同对象，不能只靠一份节点 JSON 表达全部状态。
- “历史资产”和“工作流版本”必须使用不同页面、接口和存储模型。
- 画布 mutation 需要版本号和乐观锁；外部 GA 只能提出 mutation request，不能绕过权限直接写图。
- 协作相机、跟随对象和缩放属于 presence/view state，不能写回共享工作流文档。
- 真实生成前应有确认门、积分预估、并发校验、人像合规校验和幂等键。

## 待补状态

- 图片、视频、音频和脚本的真实运行、取消、失败、重试、结果与成本结算。
- 官网视频合成在有效媒体输入下的时间线、预览、导出请求和失败恢复；本地同构能力已完成，
  仍需登录环境中捕获官网网络契约后做字段映射复核。
- 导演台保存、截图导出、AI 识图完成态、动画导出和多机位结果回写。
- 不兼容节点类型错误、边选择/删除/重连、外部边复制和循环依赖校验。
- 多个分镜组的合并、拖拽重排、清空、自定义宫格落地、拼接失败/重复提交保护、
  整组执行、批量下载和添加到工具箱结果；普通组转分镜组的成功路径已实测。
- 跨刷新/协作的撤销栈、持久 revision、并发编辑冲突和恢复边界。
- 有内容资产的预览、下载、移动、改标签、删除/恢复、团队权限与 Agent 资产写入来源。
- 发布、分享、协作邀请、多用户冲突处理和跟随退出后的状态恢复。
- 项目副本、实际移动、文件夹嵌套及非空文件夹删除保护。
- 自定义工具箱的创建、编辑、版本、发布和失效；更多预设的输入输出约束。
- 角色/主体的创建、编辑、权限、更新、失效以及应用后引用资产的同步策略。
- 风格节点的实际落点、风格/特效节点的连接规则、失效状态和生成消费关系。
