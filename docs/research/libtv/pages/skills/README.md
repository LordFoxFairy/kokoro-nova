# Skill 广场与详情

路径：`/skill`

## 已观察状态

### Skill 广场

截图：[market-overview.png](screenshots/market-overview.png)

- 顶部保留创作输入区，可直接从提示词进入创作。
- 主视图分为 Skill、收藏、我的。
- 分类包括推荐、专业影视、商业广告、短剧漫剧、动漫游戏、音乐 MV、自媒体创作、通用技能和发现。
- Skill 卡包含封面、输出媒介、稳定 slug、名称、简介、作者、调用量、收藏和使用动作。

### 登录态收藏生命周期

截图：

- [收藏初始空态](screenshots/skill-market-authenticated-favorites-empty.png)
- [广场卡片已收藏态](screenshots/skill-market-card-favorited-active-state.png)
- [收藏列表单卡态](screenshots/skill-market-favorites-populated-single-card.png)
- [详情已收藏态](screenshots/skill-detail-favorited-state-and-actions.png)
- [分享点击 tooltip](screenshots/skill-detail-share-click-tooltip-no-modal.png)

- 当前账户的市场“收藏”标签初始显示“当前暂无Skill”。
- 收藏“选角Casting”后，广场卡片星标立即点亮，按钮语义变为“取消收藏”；
  收藏列表即时出现单卡，详情弹层同步显示已收藏星标。
- 本次公开统计从 855 变为 856。取消收藏后按钮立即恢复，但统计没有同步回退，
  当前收藏列表也暂时保留旧卡；刷新后服务端状态重新加载，收藏列表恢复空态。
- 详情“分享”点击后，本次 Playwright 浏览器只显示“分享” tooltip，没有出现站内
  弹层、路由变化或可确认的成功反馈；不能据此断言已复制链接或调用系统分享。
- 本轮未点击“使用”或“添加 Skill”，没有执行 Agent、创建项目或消耗积分。

### 首页 Skill 选择器

截图：

- [home-selector-default.png](screenshots/home-selector-default.png)
- [home-selector-search-results.png](screenshots/home-selector-search-results.png)
- [home-selector-search-empty.png](screenshots/home-selector-search-empty.png)
- [home-selector-favorites-unauthenticated.png](screenshots/home-selector-favorites-unauthenticated.png)
- [home-selector-skill-added-to-composer.png](screenshots/home-selector-skill-added-to-composer.png)
- [home-selected-skill-submit-auth-gate.png](screenshots/home-selected-skill-submit-auth-gate.png)

- 选择器在首页 composer 左下方展开，保留创建、全部、通用、收藏、我的和搜索。
- 每项展示名称、稳定 slug、简介、添加动作和详情入口。
- 搜索即时过滤列表；无结果时显示“未找到匹配的 Skill”，不跳离首页。
- 未登录点击收藏、我的或创建会进入统一认证层；这些个性化入口不伪装成空态。
- 未登录可以先把通用 Skill 添加到 composer，成为可点击的上下文 chip，并使发送
  按钮可用；点击发送时才进入认证层，已选 Skill intent 保留在背景 composer。

### 登录态 Agent Skill 选择器

截图：

- [登录态分类与创建入口](../agent/screenshots/agent-skill-selector-authenticated-categories-and-create.png)
- [收藏空态](../agent/screenshots/agent-skill-selector-favorites-empty.png)
- [我的空态](../agent/screenshots/agent-skill-selector-my-empty.png)
- [创建方式](../agent/screenshots/agent-skill-create-options-conversation-or-custom.png)

- 画布 Agent 中的选择器复用创建、全部、通用、收藏、我的、搜索、添加与详情能力。
- 当前账户的收藏和我的为真实空态；与首页未登录时的认证门是两种不同状态。
- 创建入口支持把当前对话转化为 Skill，或进入自定义 Skill 作者页。

### Skill 作者页

截图：

- [作者表单、内容编辑器与文件树](screenshots/skill-author-create-editor-fields-and-file-tree.png)
- [默认代码模板](screenshots/skill-author-code-editor-default-template.png)
- [默认模板预览](screenshots/skill-author-preview-default-template.png)
- [输出类型选项](screenshots/skill-author-output-type-options.png)
- [必填字段校验](screenshots/skill-author-required-field-validation.png)

- `/skill/create` 提供名称、一句话介绍、Skill 内容、使用场景、如何使用、输出内容、
  输出类型和可选封面。
- Skill 内容区同时提供预览/代码、上传、内容优化、放大、文件树、新建文件夹和
  新建 Markdown 文件；默认入口文件是 `SKILL.md`。
- 默认模板要求作者说明用途、最少输入、执行方式、产物和需要向用户追问的条件。
- 输出类型包括图片、视频、音频和文本。
- 空表单保存会逐项提示必填错误，且 `SKILL.md` 不能为空；本轮未保存、未上传、
  未调用内容优化，也未创建 Skill。

### Skill 详情首屏

截图：[detail-hero-and-actions.png](screenshots/detail-hero-and-actions.png)

- 包含名称、作者、分类、使用量、收藏量、分享、收藏和“添加 Skill”。
- 作品示例使用轮播展示，详情位于同一弹层的下方。

### 示例轮播与原图

截图：

- [示例 1/4](screenshots/skill-detail-example-carousel-01-of-04.png)
- [示例 2/4](screenshots/skill-detail-example-carousel-02-of-04.png)
- [示例 3/4](screenshots/skill-detail-example-carousel-03-of-04.png)
- [示例 4/4](screenshots/skill-detail-example-carousel-04-of-04.png)
- [原图查看层](screenshots/skill-detail-example-original-image-lightbox.png)

- 四张示例分别展示两男两女角色；每张都在同一画面并列定脸主图、表情九宫格
  和正/侧/背三视图，直接解释 Skill 的实际输出组合。
- 轮播顶部显示当前序号；首张禁用“上一个”，末张禁用“下一个”，中间状态允许
  双向切换。切换只替换媒体，不关闭详情或重置下方规范位置。
- “查看原图”打开覆盖页面和详情弹层的深色 lightbox，保留大图、前后浏览和右上角
  关闭动作；按 `Escape` 可回到同一详情和当前轮播项。

### 使用摘要

截图：[detail-usage-summary.png](screenshots/detail-usage-summary.png)

- 明确列出简介、使用场景、使用方法和输出内容。
- 详情弹层同时承担营销说明和操作说明。

### 可执行规范

早期中段截图：[detail-executable-spec.png](screenshots/detail-executable-spec.png)

源码模式：

- [元数据、版本与工具契约](screenshots/skill-detail-executable-source-mode-frontmatter-and-tool-contract.png)
- “预览”渲染 Markdown 结构，“源码”展示同一份原始文本；切换后可以无损返回预览。
- 当前源码暴露稳定名 `casting-cn`、命名空间 `libtv-industry`、标题、描述和可见版本
  `v1.0.2`，证明详情需要按不可变版本读取规范，而不是只按展示名称定位。
- 基础设定还声明默认图像能力、`image_2`、2K、`character` tag、输入字段、
  真人/3D 触发规则和工具速查，说明运行时需要先编译 Skill 声明再执行步骤。

“选角Casting”当前公开规范的连续分段证据：

| 分段 | 覆盖内容 | 截图 |
| --- | --- | --- |
| 01 | 审美准则 A-D | [截图](screenshots/skill-detail-spec-01-aesthetic-criteria-a-to-d.png) |
| 02 | 审美准则 D-G | [截图](screenshots/skill-detail-spec-02-aesthetic-criteria-d-to-g.png) |
| 03 | 核心翻译、定脸生成 | [截图](screenshots/skill-detail-spec-03-core-translation-and-face-generation.png) |
| 04 | 定脸调用、锁定块入口 | [截图](screenshots/skill-detail-spec-04-face-generation-and-locked-block-intro.png) |
| 05 | 构图、渲染、清晰度锁定块 | [截图](screenshots/skill-detail-spec-05-locked-composition-rendering-sharpness.png) |
| 06 | 清晰度禁用词、服装规则 | [截图](screenshots/skill-detail-spec-06-clothing-rules-and-sharpness-ban.png) |
| 07 | 身材、头身比校准规则 | [截图](screenshots/skill-detail-spec-07-body-proportion-rules-and-calibration.png) |
| 08 | 校准表、全身立绘入口 | [截图](screenshots/skill-detail-spec-08-calibration-table-and-full-body-asset.png) |
| 09 | 全身、三视图、表情资产 | [截图](screenshots/skill-detail-spec-09-full-body-three-view-expression-assets.png) |
| 10 | 表情九宫格、补丁入口 | [截图](screenshots/skill-detail-spec-10-expression-grid-and-patch-intro.png) |
| 11 | 皮肤补丁、3D 触发边界 | [截图](screenshots/skill-detail-spec-11-patches-and-3d-trigger-boundary.png) |
| 12 | 3D 质感目标 | [截图](screenshots/skill-detail-spec-12-3d-quality-targets.png) |
| 13 | 3D 覆盖、脸型约束 | [截图](screenshots/skill-detail-spec-13-3d-overrides-and-face-constraints.png) |
| 14 | 3D 调用示例、执行流程 | [截图](screenshots/skill-detail-spec-14-3d-call-example-and-execution-flow.png) |
| 15 | 确认门、边界、故障排查 | [截图](screenshots/skill-detail-spec-15-confirmation-gates-boundary-troubleshooting.png) |

- 详情下方公开的是结构化、可直接驱动 Agent 的长规范，不是单次 prompt。
- 当前样例共 13 个一级章节，覆盖输入解释、审美约束、生成调用、资产引用、
  确认门、可选产物、能力边界、降级补丁、执行顺序和故障排查。
- 规范要求先生成定脸资产并询问用户确认；未明确通过前不得继续生成全身、三视图
  或表情资产。这与 Agent 实测的专用 `ask_human` 控件可以形成同一执行语义。
- 产物通过“资产归档标记”传给后续调用；同一剧本还用
  `cast-style-{剧本名}.json` 跨对话固定真人/3D 质感参数。
- 能力不稳定时采用显式降级路径，例如三视图拆分生成、表情分批或逐张生成，
  而不是把一次模型失败直接视为整个 Skill 失败。
- 以上是单个公开 Skill 的当前版本证据。复刻时必须保存 Skill 版本和执行快照，
  不能假设所有 Skill 都使用相同章节或让线上编辑改变运行中的任务。

## 复刻意义

- Skill 应是版本化领域对象，至少包含元数据、说明、可执行规范、作者、分类、示例、统计和发布状态。
- “添加/收藏/使用”是三种不同关系：安装到个人空间、轻量收藏、立即执行。
- Skill 执行不能等同于单次 LLM prompt；需要编排、能力调用、确认门、资产依赖和失败降级。

## 待补状态

- 登录态已创建 Skill、把对话转为 Skill 的预填结果。
- 重复添加、移除 chip、版本不可用和权限不足。
- 使用 Skill 后的 Agent 会话与项目创建。
- 分享在真实桌面浏览器中的系统分享或复制成功反馈。
- Skill 保存成功、编辑、版本、审核和发布流程。

### 2026-09-04 登录态当前页复核

来源：用户已登录的 `/skill`，仅读取可访问性树，未添加、收藏、发布或执行 Skill。

- 当前 Hero 标题为 **`新的一天，新的 Skill`**；它取代了早期记录的“用 Skill，开启今天的故事”。
- Hero 下仍是同一 composer：`添加附件`、`选择模型`、`Skill`、`生成模式` 与 disabled 的 `发送`；空输入不能发送。
- 主标签精确为 `Skill / 收藏 / 我的`；分类首屏顺序为 `推荐 / 短漫剧 / 电影 / 商业广告 / 创意/社媒玩法 / 音乐MV`，搜索是独立的输入与 `搜索` 按钮。
- 左侧登录壳当前保留首页、项目、LibTV Agent、创作者挑战赛、新建项目、帮助与可收起导航。

本地 `SkillGallery` 的 Hero 文案和 Playwright 可访问名称以这次直接观察为准；未在这次观察中见到的卡片分页、详情与作者流继续沿用既有证据，不能由本次首屏推断。
