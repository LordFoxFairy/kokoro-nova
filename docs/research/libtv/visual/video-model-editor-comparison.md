# LibTV Video 节点编辑器与模型目录对比

本文固定 Video 专项在 `1440×900` Chrome CSS viewport 下的产品事实、实现契约与
自动化证据。官网只用于观察界面与行为；本地运行不读取官网登录态、远端 CDN 或真实
生成服务。

## 基线对

| 状态 | 官网证据 | 本地基线 |
|---|---|---|
| Video 节点编辑器 | [`video-node-default-seedance-controls-and-advanced-settings.png`](../pages/canvas/screenshots/video-node-default-seedance-controls-and-advanced-settings.png) | [`video-node-editor-dark-1440x900.png`](../../../screenshots/video-node-editor-dark-1440x900.png) |
| Video 模型目录 | [`video-node-model-catalog-with-estimated-duration.png`](../pages/canvas/screenshots/video-node-model-catalog-with-estimated-duration.png) | [`video-model-catalog-dark-1440x900.png`](../../../screenshots/video-model-catalog-dark-1440x900.png) |
| 输出规格 | [`video-node-output-aspect-resolution-duration-audio-count.png`](../pages/canvas/screenshots/video-node-output-aspect-resolution-duration-audio-count.png) | 同一节点编辑器的输出弹层，由模型能力动态生成 |
| 输入驱动模式 | [`video-node-generation-modes-dependent-on-inputs.png`](../pages/canvas/screenshots/video-node-generation-modes-dependent-on-inputs.png) | E2E 覆盖全能参考、动作迁移和数字人的可用/禁用态 |

## 当前官网实测几何

当前登录态 DOM 中，编辑器挂在节点内部而不是通用右侧抽屉：

- 根节点类名包含 `node-floating-ui nodrag nowheel nopan`；
- 以 `left: 50%`、节点底部负间距和向下平移锚定；
- 原始宽度固定为 `660px`；
- 图缩放约 `0.325` 时，浮层自身使用约 `3.074` 的逆缩放，因此屏幕宽度仍为
  `660px`；
- 当前工具区包含参考、标记、角色库、运镜和特效；底栏包含模型、生成模式、输出摘要、
  辅助操作、积分和生成动作。

本地 `e2e/video-editor.spec.ts` 分别在 `33% / 50% / 100%` 验证浮层宽度为
`660±2px`，并验证 Video 双击不会打开通用 `NodeInspector`。

## 模型与参数契约

模型目录按当前官网可见顺序冻结 36 个 Video 项。每一项只有本地 descriptor，不调用
官网服务；动态价格、账户权益和供应状态不作为官网内部事实复制。

`VideoModelCapabilities` 统一描述：

- 画幅、清晰度、时长、数量；
- 音频为 `unsupported / optional / required`；
- generation mode；
- 每种 mode 所需图片、视频、音频或任意媒体数量；
- 模型切换后的默认输出。

切换模型时，Canvas 与 Storyboard 都调用同一个 `normalizeOutputForModel()`：保留仍合法的
值，其余回落到模型默认值。创建任务前 `compileNode()` 再执行一次相同归一化和素材依赖
校验，直接写 mutation 或导入旧草稿也不会绕过约束。

代表性验证：

| 模型 | 本地验证 |
|---|---|
| Seedance 2.5 / 2.0 VIP | 全能参考、音频、15 秒与标准数量摘要。 |
| Minimax H3 Max | 自动移除音频控制，把非法 15 秒回落到 5 秒，并保留合法画幅/清晰度。 |
| Kling3.0 动作迁移 | 只展示动作迁移；缺少一条视频参考时禁用并给出精确原因。 |
| OmniHuman 1.5 | 强制有声；缺少音频参考时数字人模式禁用。 |

## Canvas / Storyboard 单一状态

Canvas 的节点浮层与 Storyboard 的“再生成配置”复用同一个
`VideoModelCatalog`、能力 registry、输出格式化和归一化 helper。两处编辑的都是
`WorkflowNode.data`，不存在 Storyboard 专属副本。E2E 会在 Storyboard 切换模型，再回到
Workflow 双击同一节点确认模型和规格完全一致。

## 键盘与层级

- 模型目录打开后搜索框自动聚焦；
- 上/下方向键移动活动项，`Enter` 选择；
- `Escape` 先关闭模型目录，再关闭节点编辑器；
- 点击空画布关闭节点编辑器；
- 浮层阻断节点拖拽、画布滚轮和平移事件。

## 保留差异

| 差异 | 原因 |
|---|---|
| 模型图标使用稳定的本地 family mark | 不复制官网受版本和 CDN 控制的图标资产。 |
| `baseCredits` 与预计耗时是确定性 fixture | 官网价格和排队耗时会随账户、活动和供应动态变化。 |
| 运行结果来自本地 mock provider | 当前仓库只负责前端；未来 provider 按 OpenAPI/ExecutionSpec 接入。 |
| 登录项目媒体替换为原创本地雨夜城市素材 | 不把私有项目素材固化到公开 fixture。 |

## 自动化证据

`e2e/video-editor.spec.ts` 覆盖：

1. 节点浮层取代通用抽屉及三档逆缩放；
2. 36 项目录、搜索、键盘选择和 Escape 层级；
3. Minimax 输出归一化与 AutoLink 持久化；
4. 动作迁移/数字人的输入依赖、音频策略和错误提示；
5. Storyboard 与 Canvas 的目录复用和单一节点状态；
6. 两张像素截图由 Playwright snapshot 锁定。
