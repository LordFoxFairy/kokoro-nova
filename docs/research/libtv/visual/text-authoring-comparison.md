# LibTV Text 创作器视觉、交互与 Workflow 对比

本文固定 Text 里程碑在 `1440×900` Chrome CSS viewport 下的官网事实、本地实现和
自动化证据。官网用于观察当前布局与协议；本地运行只使用确定性 mock、结构化文本和本地
`.txt` 产物。

## 基线对

| 状态 | 官网证据 | 本地基线 |
|---|---|---|
| 空 Text 与四入口 | [text-node-arranged-full-card.png](../pages/canvas/screenshots/text-node-arranged-full-card.png) | [text-node-editor-dark-1440x900.png](../../../screenshots/text-node-editor-dark-1440x900.png) 的背景节点 |
| Text 生成器 | 当前登录态 DOM/交互记录；[官方指南旧版](../references/official-guide/screenshots/text-node-purpose-and-generator.png) | [text-node-editor-dark-1440x900.png](../../../screenshots/text-node-editor-dark-1440x900.png) |
| 四模型目录 | 当前登录态目录实测 | [text-model-catalog-dark-1440x900.png](../../../screenshots/text-model-catalog-dark-1440x900.png) |
| 手写工具栏 | 当前登录态工具栏实测 | [text-document-toolbar-dark-1440x900.png](../../../screenshots/text-document-toolbar-dark-1440x900.png) |
| 展开编辑 | 官网免费账户显示付费门；本地实现完整能力态 | [text-expanded-editor-dark-1440x900.png](../../../screenshots/text-expanded-editor-dark-1440x900.png) |
| 三个启动 Workflow | 当前登录态可逆实例化与 DOM/网络观察 | `e2e/text-editor.spec.ts` 的三组 topology + undo 断言 |

## 几何与层级

| 区域 | 本地断言 | 对齐策略 |
|---|---|---|
| 节点附着生成器 | 屏幕宽度 `660±2px` | 画布缩放时做 inverse scale；保持固定可读宽度 |
| 手写卡 | `350×200px` | document 模式写回节点 size，不复用媒体生成卡尺寸 |
| 模型目录 | 4 行，耗时与描述同列 | 锚定模型按钮上方，选中项有明确 check |
| 工具栏 | 12 个可访问按钮 | 工具顺序与可见文案冻结，背景 palette 独立一层 |
| 全屏编辑 | 顶栏 + 工具栏 + 大文档面 | 复用同一 persisted document，不创建草稿副本 |

## 已对齐交互

- 双击 Text 节点打开深色 660px 生成器，不打开通用 `NodeInspector`；
- prompt、翻译偏好和模型跨关闭/刷新恢复；
- 四模型目录顺序、耗时、描述和默认积分冻结；
- Escape 逐层关闭模型目录、展开编辑器和节点创作器；
- 手写模式支持 H1/H2/H3/正文、粗体、斜体、无序/有序列表、分割线、五种背景、复制与展开；
- 内容以安全 block tree 持久化，粘贴只取纯文本，不保存/执行 HTML；
- 文生视频、图片反推提示词、文字生音乐一次创建节点、边和组，一次 undo 完整回滚；
- Text Job 经过确认门、生成确定性 `.txt` 和内联 `textContent`，Storyboard 立即读取同一产物。

## API 与状态对齐

- `GET /api/models?media=text` 返回四项 versioned registry 与 `TextModelCapabilities`；
- 所有 Text 编辑与 starter 使用 revision-guarded Canvas mutation；
- document 上游编译使用纯文本投影，generator 上游使用 prompt；
- 官网 `text_resource/text_generate` vocabulary 只存在于 adapter 边界；
- 完整 schema、样本、错误和后端交接见
  [`docs/api/TEXT_AUTHORING_STATE.md`](../../../api/TEXT_AUTHORING_STATE.md)；
- 脱敏官网 batch/calculator 证据见
  [Text API 捕获](../api/captures/2026-09-03-text-authoring.md)。

## 明确保留差异

| 差异 | 原因 | 后续验收 |
|---|---|---|
| 官网免费账户的展开编辑被付费墙拦截；本地展示完整编辑能力 | 目标是可测试的全能力前端 fixture，而不是复制账户权益限制 | 权益专项再补同一入口的 paywall scenario |
| 非默认模型积分和字符上限为本地 fixture | 官网价格/权限动态且本轮未做付费动作 | 真实后端通过版本化 model registry 替换 |
| Text 结果来自确定性本地 provider | 当前子仓库没有真实推理服务 | 保持 Jobs/Artifact 契约，后续只换 provider |
| 模型 family mark 为本地图形 | 不固化官网动态 CDN 图标 | 保持命中区、层级、文案和状态一致 |

## 自动化证据

`e2e/text-editor.spec.ts` 覆盖 8 条产品流程：

1. 660px 浮层、默认值和通用 inspector 互斥；
2. 四模型目录、选择与 Escape 栈；
3. prompt/translation/model 刷新持久化；
4. 富文本工具栏、背景、复制、展开和持久化；
5. 三个 starter 的图拓扑、组名和单次 undo；
6. 两阶段确认、内联 Text Artifact 与 Storyboard 投影。

领域、契约和 OpenAPI 分别由
`src/domain/__tests__/text-authoring.test.ts`、
`src/domain/__tests__/compile.test.ts`、
`src/contracts/__tests__/text-authoring-examples.test.ts` 和
`src/contracts/__tests__/openapi.test.ts` 锁定。
