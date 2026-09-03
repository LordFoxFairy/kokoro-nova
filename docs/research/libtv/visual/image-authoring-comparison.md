# LibTV Image 创作器视觉与交互对比

本文固定 Image 节点创作里程碑在 `1440×900` Chrome CSS viewport 下的证据对。
官网登录态只用于观察产品布局与状态；本地运行使用确定性原创素材、mock API 和本地
`WorkflowDocument`，不读取 Cookie、Token、私有项目内容或官网 CDN。

## 基线对

| 状态 | 官网证据 | 本地基线 |
|---|---|---|
| Image 默认创作器 | [`image-node-default-lib-image-controls.png`](../pages/canvas/screenshots/image-node-default-lib-image-controls.png) | [`image-node-editor-dark-1440x900.png`](../../../screenshots/image-node-editor-dark-1440x900.png) |
| 图片模型目录 | [`image-node-model-catalog-with-latency.png`](../pages/canvas/screenshots/image-node-model-catalog-with-latency.png) | [`image-model-catalog-dark-1440x900.png`](../../../screenshots/image-model-catalog-dark-1440x900.png) |
| 输出参数矩阵 | [`image-node-output-quality-resolution-aspect-count.png`](../pages/canvas/screenshots/image-node-output-quality-resolution-aspect-count.png) | [`image-output-popover-dark-1440x900.png`](../../../screenshots/image-output-popover-dark-1440x900.png) |
| 已生成图片工具 | [`storyboard-generated-image-detail-tool-actions.png`](../pages/canvas/screenshots/storyboard-generated-image-detail-tool-actions.png) | 默认创作器基线中图片节点下方的工具条 |
| 画布参考模式 | 登录态当前交互实测 | [`image-reference-selection-dark-1440x900.png`](../../../screenshots/image-reference-selection-dark-1440x900.png) |
| 风格市场 | 登录态当前交互实测 | [`image-style-market-dark-1440x900.png`](../../../screenshots/image-style-market-dark-1440x900.png) |

官网旧截图与当前站内状态存在迭代差异时，以当前站内可操作项为准；旧截图用于补足未裁切的
弹层关系和密度，而不把旧模型名称覆盖到当前目录。

## 几何契约

| 区域 | 本地断言 | 对齐策略 |
|---|---|---|
| 节点附着创作器 | 屏幕宽度 `660±2px` | 使用画布 zoom 倒数缩放；`33% / 50% / 100%` 均保持可读。 |
| 默认编辑器 | 节点下方、深色圆角浮层、提示词为主体 | 不再打开通用右侧 `NodeInspector`。 |
| 模型目录 | `410×470px`，7 项、独立搜索栏 | 锚定模型按钮上方，键盘上下/Enter/Escape 分层处理。 |
| 输出弹层 | `438px`，质量与清晰度各三列、比例五列换行 | 13 种比例按官网顺序，最后一行保留三项。 |
| 已生成工具条 | 创作器上方单行操作条 | 九项派生/编辑动作后接下载和展开。 |

几何和可访问层级由 `e2e/image-editor.spec.ts` 的 bounding-box、role、count 与截图断言锁定。

## 已对齐交互

- 双击 Image 节点打开节点空间内的 `660px` 创作器；`nodrag / nowheel / nopan` 防止表单动作
  误触画布。
- 顶部动作提供“参考 / 标记 / 风格”；参考与标记进入蓝色画布选择模式，返回节点与退出画布
  是两条独立路径。
- 提示词、模型、输出、预设、优化、AutoLink、积分和生成控制在同一面完成。
- 图片模型按当前观察顺序固定为 7 项，搜索、hover active、Enter 选择与 Escape 关闭可重放。
- 输出恰好覆盖 `3` 画质、`3` 清晰度、`13` 比例、`3` 数量；连续快速选择使用串行
  revision reducer 合并，不会由陈旧 React closure 互相覆盖。
- 风格面包含“风格广场 / 我的收藏 / 最近使用”、名称/作者搜索、当前十类分类和“仅看可商用”；
  选择后创建 style 节点、入边和 `imageStyle` metadata。
- 四组 15 个图片预设写回 prompt、规范化 output 和语义选择，不在运行时二次查目录。
- 已生成图片工具统一创建新的待确认 Image 节点；源 Artifact 不变，入边和
  `ImageTransformSpec v1` 保留来源与参数。

## 数据与 API 对齐

- `GET /api/models?media=image` 返回七项 registry 与 `ImageModelCapabilities`；
- 参考、局部元素、风格、预设和图片工具全部复用 `POST /api/canvases/{canvasId}`；
- 图边是输入事实，`imagePreset / imageStyle / imageTransform` 是刷新恢复和解释层；
- 完整规范、原子 mutation、错误与示例见
  [`docs/api/IMAGE_AUTHORING_STATE.md`](../../../api/IMAGE_AUTHORING_STATE.md)。

## 保留差异

| 差异 | 原因 | 后续验收 |
|---|---|---|
| 本地媒体为原创雨夜城市 fixture | 不复制登录账户中的私有项目素材。 | 保持尺寸、层级、操作密度一致，内容本身不做像素伪装。 |
| 下载输出本地 fixture，展开使用轻量 Lightbox；派生动作创建待确认节点 | 本批次不触发官网计费生成；纯前端目标由确定性 mock 承担。 | 在 Asset 专项补批量下载、格式选择和故障态。 |
| 风格收藏与最近使用是固定 catalogue 视图 | 当前子仓库无独立用户偏好后端。 | 未来真实后端可新增 catalogue/prefs API，不改变 style → image 图契约。 |
| 生成成功/失败仍由通用 Job fixture 提供 | 官网付费生成未执行。 | Image Job 专项补独立 running/succeeded/failed/cancelled 视觉基线。 |

## 自动化证据

`e2e/image-editor.spec.ts` 覆盖：

1. 反向缩放几何、节点内编辑器和通用抽屉互斥；
2. 七模型目录、搜索、键盘选择与 Escape 栈；
3. 完整输出参数矩阵、连续修改持久化和 API 读回；
4. 参考边删除/返回、风格原子绑定；
5. 预设写回和高清派生节点的来源边与 typed metadata。

领域与 API 样本另由 `src/domain/__tests__/image-authoring.test.ts`、
`src/contracts/__tests__/image-authoring-examples.test.ts` 和
`src/contracts/__tests__/openapi.test.ts` 锁定。
