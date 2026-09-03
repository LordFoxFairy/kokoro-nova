# Video 模型目录、能力联动与节点浮层实施计划

> 本计划是总目标中的一个可验证里程碑，不代表 LibTV 全能力复刻完成。

## 目标

把当前官网 Video 节点已观察到的模型目录、生成模式、输出参数和高级设置，落成可重复的纯前端本地实现：

- Video 编辑器从通用右侧抽屉迁移为挂在节点下方的浮层；
- 浮层在任意画布缩放下保持约 `660px` 屏幕宽度；
- 模型目录覆盖当前官网可见的 36 个 Video 模型；
- 每个模型使用版本化、本地、强类型能力描述驱动可见参数与合法值；
- 切换模型会确定性地归一化旧参数，而不是留下不可提交状态；
- 提供 `GET /api/models` mock 契约、OpenAPI、示例和前端使用说明；
- 通过领域测试、路由测试、Playwright 交互测试和 `1440×900` 视觉基线。

## 官网事实基线

- 节点编辑器是 `.node-floating-ui`，绝对定位在节点底部，带 `nodrag nowheel nopan`；
- 浮层通过当前画布 zoom 的倒数缩放，屏幕宽度固定为 `660px`；
- 当前 Video 模型目录为单列卡片列表，卡片展示名称、预计耗时和一句能力摘要；
- 当前编辑器工具区包含：参考、标记、角色库、运镜；存在特效引用时显示替换；
- 底栏包含模型、生成类型、输出摘要、辅助操作、积分和生成按钮；
- 当前登录样本的生成类型为“全能参考”，输出摘要为画幅、清晰度、时长、数量和音频状态；
- 高级设置包含联网搜索、自动校验素材、智能引用 AutoLink。

官网动态价格、权限和模型供应状态只作为展示字段，不把账户权益或私有数据固化进 fixture。

## 本地领域契约

### `ModelDefinition.capabilities`

Video 模型增加以下能力元数据：

- `aspectRatios`
- `resolutions`
- `durationsSeconds`
- `counts`
- `audio`
- `modes`
- `referenceRequirements`
- `membershipTier`
- `availability`

### 归一化规则

`normalizeOutputForModel(modelId, output, availableModes)`：

1. 保留仍合法的值；
2. 非法值回落到该模型的首选默认值；
3. 不支持音频时强制 `withAudio=false`；
4. 模型能力与已连接输入共同决定 generation mode；
5. 编译时再次归一化，避免绕过 UI 后提交非法 spec。

## 实施清单

### 1. 领域与模型目录（TDD）

- [x] 先写失败测试：36 个 Video 模型、稳定排序、唯一 ID、代表模型能力。
- [x] 扩展 `ModelDefinition` 与 Video 能力类型。
- [x] 补齐官网当前可见模型目录和本地 provider/icon key。
- [x] 实现 `modelOutputOptions`、`normalizeOutputForModel`、`modesForVideoModel`。
- [x] 编译器按模型能力过滤 mode 并归一化 output。
- [x] 新建 Video 节点默认采用当前官网基线模型和 `16:9 / 720p / 5s / 1个`。

### 2. 本地 API 与文档（TDD）

- [x] 先写失败路由测试：媒体筛选、搜索、稳定版本、能力 shape、非法 media。
- [x] 实现 `GET /api/models?media=video&q=`，仅返回本地 descriptor。
- [x] 增加 `docs/api/examples/models-video.response.json`。
- [x] 更新 `docs/api/openapi.yaml` 的 Models tag、path、schemas 与示例。
- [x] 更新 API README，说明官网证据与本地规范化契约的边界。

### 3. Video 节点浮层与模型目录（TDD/E2E）

- [x] 先写失败 E2E：双击 Video 节点打开浮层，右侧抽屉不出现。
- [x] 浮层跟随节点且逆缩放，屏幕宽度在 33%/50%/100% 下保持 `660±2px`。
- [x] 实现参考快捷动作、prompt、底栏输出摘要和高级设置。
- [x] 实现可搜索、可滚动、键盘可操作的模型目录；Escape 先关目录再关浮层。
- [x] 模型切换后动态渲染画幅、清晰度、时长、音频、数量和生成模式。
- [x] 数量单位在 Video 中统一为“个”。
- [x] 增加智能引用 AutoLink，并写回 `NodeData.extra.advanced.autoLink`。
- [x] 代表模型覆盖：Seedance 2.5、Minimax H3 Max、Kling3.0 动作迁移、OmniHuman 1.5。

### 4. 故事板复用

- [x] Media detail 的再生成区域复用同一能力 helper 和目录组件。
- [x] 模型切换后同样归一化参数，不产生 Canvas/Storyboard 双份状态。

### 5. 验证与证据

- [x] 单元测试与路由测试通过。
- [x] Playwright 覆盖目录搜索、选择、依赖参数、AutoLink、Escape 层级与逆缩放。
- [x] 新增确定性 `1440×900` Video 浮层和模型目录截图基线。
- [x] `pnpm typecheck`、`pnpm lint`、`pnpm test`、`pnpm build`、`pnpm e2e` 全部通过。
- [x] 更新 `FEATURE_MATRIX.md`、画布研究 README 和视觉对比记录。
- [x] 确认运行时只引用 `/api/*` 与本地 `/fixtures/*`/`/api/media/*`，没有官网域名依赖。

## 完成边界

本计划完成后，继续拆分并推进：

1. Image/Audio/Text 模型目录与参数依赖；
2. Script V2 与 Legacy；
3. 工具箱、风格、特效、角色、历史和资产；
4. 完整 Video clip editor、时间线、字幕、音轨、转场与导出；
5. 最终全站视觉、可访问性、响应式和 API 审计。
