# 模型、生成器与资产

## 页面职责

模型与资产不是单一页面，而是贯穿首页、Agent、节点生成器、角色/主体库、
生成历史和 CLI 的共享能力面。复刻时应由同一个版本化 registry 与 Asset
Service 提供数据，避免每个入口维护不同规则。

## 模型选择

当前站内截图：
[首页图片/视频模型选择器](../home/screenshots/model-selector-image-and-video.png)

官方目录截图：

- [图像模型](../../references/official-guide/screenshots/model-catalog-image.png)
- [视频模型](../../references/official-guide/screenshots/model-catalog-video.png)
- [语言模型](../../references/official-guide/screenshots/model-catalog-language.png)
- [音频模型](../../references/official-guide/screenshots/model-catalog-audio.png)
- [视频能力矩阵](../../references/official-guide/screenshots/model-capability-video-matrix.png)
- [声音能力矩阵](../../references/official-guide/screenshots/model-capability-audio-matrix.png)

模型名称、输入模式、媒体数量、参数、会员门槛、积分、并发和可用区域都可能
变化。Web、CLI、Agent、validator 和 worker 必须消费同一份带 revision 的
model schema；运行时在 ExecutionSpec 中冻结实际 revision。

## 生成器能力

- [风格库](../../references/official-guide/screenshots/image-generator-style.png)
- [焦点编辑](../../references/official-guide/screenshots/image-generator-focus-edit.png)
- [镜头聚焦](../../references/official-guide/screenshots/image-generator-lens-focus.png)
- [摄像机控制](../../references/official-guide/screenshots/image-generator-camera-control.png)
- [视频主体库](../../references/official-guide/screenshots/video-generator-subject-library.png)

风格是版本化模板，焦点编辑是多素材元素提取，镜头聚焦是单图区域意图，
摄像机控制是摄影参数，主体库是跨生成任务复用的身份资产。它们需要不同的
输入验证和权限语义，不能全部压缩为一个自由 JSON 参数。

## 资产入口

- 首页附件支持本地上传和资产库。
- 画布生成历史按图片、视频、音频展示结果，但不是 workflow 版本历史。
- 角色库提供官方/最近使用、类型标签、详情和应用画布；实测一次应用会创建三视图、
  表情参考、脸部近景和角色立绘四个独立图片节点。
- 视频主体库允许从多图或单段视频建立跨次一致性主体。
- CLI upload 会创建对应媒体资源节点；OpenAPI upload 返回 URL，再由消息引用。

画布内资产管理的完整实测证据见
[项目与无限画布](../canvas/#资产管理)。它包含两层界面：

- 画布侧栏列出节点并按类型筛选，另分个人和 Agent 资产命名空间。
- 完整资产库提供个人资产与可灵主体库、标签、文件夹、上传和批量操作。
- 批量态支持全选当前页、移动、修改标签和删除，且明确限制单次最多 50 个资产。
- 可灵主体库按人物、场景、道具、特效和其他分类；当前账户为空。

相关截图：
[画布节点清单](../canvas/screenshots/asset-management-canvas-elements-node-list.png)、
[个人资产库空态](../canvas/screenshots/asset-management-full-personal-library-empty-state.png)、
[批量动作与限制](../canvas/screenshots/asset-management-batch-actions-and-fifty-item-limit.png)、
[可灵主体分类](../canvas/screenshots/asset-management-kling-subject-library-categories.png)。

登录态共享资产页截图：

- [asset-library-source-tabs-filters-empty.png](screenshots/asset-library-source-tabs-filters-empty.png)
- [asset-library-libtv-source-empty.png](screenshots/asset-library-libtv-source-empty.png)

触发路径：头像 -> 管理资产。入口打开 `liblib.art/asset`，但继续复用同一账户会话。
资产页不是 LibTV 专属列表，而是按来源切换 Lib 生成器、LibTV、ComfyUI、WebUI 和
AI 应用。当前页面支持媒体类型、日期范围和收藏筛选；LibTV 来源会移除收藏筛选，
当前测试账户为空。

同页来源标签与共享登录态支持“这些生成表面可能复用统一资产域”的推断，但不能证明
LibTV 的后端数据模型。复刻时建议把 `sourceProduct/sourceJob/sourceNode` 作为来源
元数据，而不为每种生成器复制一套对象表。筛选权限仍需按个人/团队 scope 重新校验，
不能因为共享登录态而跨租户泄漏。

Asset 模型应拆为内容哈希实体与租户引用：媒体二进制进入对象存储，数据库
记录类型、尺寸、时长、合规、来源 Job、owner/workspace 和公开许可。发布到
TV Show 时只把允许公开的引用冻结进快照。

## 合规与音色

- [Seedance 审核标准](../../references/official-guide/screenshots/seedance-review-standards.png)
- [两种合规校验](../../references/official-guide/screenshots/seedance-two-compliance-checks.png)
- [音色克隆](../../references/official-guide/screenshots/audio-voice-cloning.png)

人像/真人素材和音色都需要授权、审核、标识、有效期和撤销能力。合规状态应
属于 Asset/Identity，而不是只存在于某次前端表单；任何一项校验失败时应阻止
整次不合规提交，并清晰说明是否产生积分预占或返还。

## 待补状态

- 当前 Web 的完整模型参数、输入数量限制、单价和不可用原因。
- 上传进行中、格式/大小错误、重复内容、取消和断点续传。
- 资产有内容时的卡片字段、收藏、批量执行结果、下载、移动、删除、恢复和团队共享。
- 图像/视频等媒体类型选项，以及各来源标签的有内容、加载和错误状态。
- 角色/主体/音色的创建、编辑、删除、授权、审核、同步更新和失效状态。
- 合规校验失败、人工审核中、通过、驳回和过期。
