# Image 节点创作器、参考与派生工具高保真实施计划

> 本计划是 LibTV 全能力复刻总目标中的一个可验证里程碑；完成本计划不代表总目标完成。

## 目标

以当前已登录 LibTV 官网 Image 节点和既有冻结截图为事实来源，在纯前端本地 fixture 中补齐完整的图片创作闭环：

- 双击 Image 节点打开与节点空间绑定、反向缩放的 `660px` 深色创作器，不再落到通用右侧抽屉；
- 提示词、画布参考、局部标记、风格、图片模型、输出参数、预设、提示词优化、高级设置、报价与生成全部在同一创作器内完成；
- 输出面板覆盖官网观察到的低/标准/高画质、`1K/2K/4K`、13 种比例与 `1/2/4` 张，并由模型能力表约束与规范化；
- 模型目录固定官网已观察到的 7 个图片模型、耗时、说明、搜索与键盘/Escape 层级；
- “参考”进入独立画布选择模式，边是唯一依赖事实；“标记”写入确定性的本地归一化区域；
- “风格”复用本地风格市场，但应用时创建并连接风格节点到当前 Image，而不是落下无来源的孤立节点；
- “预设”覆盖官网可见的分镜叙事、质感、空间机位与设定图目录，选择后写回当前节点的 prompt/output/metadata；
- 已生成 Image 展示官网式派生工具条；图片工具统一创建带来源边和 typed `ImageTransformSpec` 的待确认节点，原图永不原位改写；
- Canvas mock API、OpenAPI、可执行示例、单元测试、Playwright 流程和 `1440×900` 视觉基线同步更新。

## 官网事实基线

### 当前深色 Image 节点

- 节点被选中后，已有产物上方/下缘出现工具条：人像质感调节、全景、多角度、打光、九宫格、高清、元素编辑、图层分离、宫格切分、下载与展开；
- 节点下方创作器顶部有“标记 / 风格”，空节点还可从画布添加“参考”；
- 提示词占据主体，placeholder 为“可直接文字生图，或上传图片输入文字指令对图片进行编辑，如：将背景改为雪夜”；
- 底栏依次为模型、输出摘要、预设、辅助动作、积分与生成；高级设置包含智能引用 `AutoLink`。

### 输出参数

- 画质：低画质、标准画质、高画质；
- 清晰度：`1K / 2K / 4K`；
- 比例：`1:1 / 1:2 / 2:1 / 9:16 / 16:9 / 3:4 / 4:3 / 3:2 / 2:3 / 5:4 / 4:5 / 21:9 / 9:21`；
- 生成数量：`1 / 2 / 4` 张；四组参数共同驱动报价。

### 模型与预设

- 冻结模型目录：Lib Image、Lib Navo Pro、Lib Navo 2、Seedream 5.0 Pro、Midjourney V8.1、Midjourney V7、Midjourney Niji 7；
- 冻结预设分组：分镜叙事、质感调节、空间与机位、设定图；
- 风格市场具备风格广场、我的收藏、最近使用、搜索、分类和“仅看可商用”。

## 领域契约

### Image 模型能力

在模型 registry 中新增 `ImageModelCapabilities`：

- `qualities`、`resolutions`、`aspectRatios`、`counts`；
- 每个模型自己的 defaults；
- `imageModelOutputOptions(modelId)`；
- `normalizeImageOutputForModel(modelId, output)`，用于 UI、导入草稿和编译前防漂移。

### Image 扩展状态

保存在 `NodeData.extra`：

- `advanced.autoLink`: 智能引用开关；
- `imagePreset`: `{ id, name }`；
- `imageStyle`: `{ nodeId, presetId, name }`；
- `elementMarks`: 与 Video 共用的归一化选区结构；
- `imageTransform`: `ImageTransformSpec`，描述派生工具、源节点、参数、报价与 schema 版本。

`ImageTransformSpec` 不替代图边：来源关系仍由 `WorkflowEdge` 表达，extra 只保存可重放参数。

## 实施顺序

### 1. 领域 TDD

- [x] 先写失败测试：7 个官网图片模型的顺序、唯一 ID、耗时与能力表。
- [x] 先写失败测试：非法旧参数按模型 defaults 规范化，合法 13 比例/3 画质/3 分辨率/3 数量保留。
- [x] 先写失败测试：Image 引用候选、边切换和局部元素只允许有效图片来源。
- [x] 先写失败测试：图片工具派生节点携带来源边、typed transform spec，且不修改源节点。

### 2. Image 节点创作器

- [x] 新增 `ImageNodeEditor` 与 `ImageModelCatalog`；宽度在 `33% / 50% / 100%` 图缩放下都稳定为 `660px`。
- [x] 提示词 blur 持久化；报价、运行、取消和生成进度复用现有 Job API。
- [x] 输出面板、模型目录、预设面板和高级设置均为单层 popover；Escape 每次只关闭最上层。
- [x] 选择模型时同步规范化输出；重新打开/刷新后状态一致。

### 3. 参考、标记、风格与预设

- [x] 把现有 Video 专用画布选择入口泛化为 Image/Video 共用，保留现有 Video 行为和测试。
- [x] Image 参考模式支持添加/取消图边并返回目标节点；标记模式创建确定性矩形并回显 chip。
- [x] 风格市场应用时创建 style 节点、连接到目标 Image，并保存 imageStyle metadata。
- [x] 预设按官网目录展示；选择后原子写回 prompt、output 和 imagePreset。

### 4. 已生成图片与派生工具

- [x] 选中已生成图片时显示完整工具条；已有全景、多角度、打光、裁剪、情绪编辑器可从节点直接打开。
- [x] 增补高清、元素编辑、图层分离、宫格切分的可重复本地请求模板。
- [x] 把 Storyboard 与 Canvas 两处派生逻辑收敛到同一领域 helper，生成节点永远带来源边和 `ImageTransformSpec`。
- [x] 九宫格仍选择冻结预设并创建待确认节点；不触发官网或付费生成。

### 5. API 文档、E2E 与视觉验证

- [x] 新增 `docs/api/IMAGE_AUTHORING_STATE.md` 与 Canvas mutation 请求示例。
- [x] OpenAPI 升级版本，显式描述 `ImageModelCapabilities`、`ImagePresetSelection`、`ImageStyleSelection` 与 `ImageTransformSpec`。
- [x] Playwright 覆盖创作器几何、7 模型搜索/键盘、13 比例、画质/分辨率/数量、持久化、参考边、风格边、预设和派生节点。
- [x] 新增 Image 默认创作器、输出面板、模型目录、参考选择和已生成工具条的 `1440×900` 基线。
- [x] 运行 `pnpm verify`、目标 E2E 和全量 `pnpm e2e`；恢复 `next-env.d.ts` 及无关截图。

## 验收条件

1. Image 双击只打开节点附着创作器，通用 `NodeInspector` 不出现；
2. 创作器在三档画布缩放下屏幕宽度保持 `658–662px`；
3. 输出面板恰好暴露官网观察到的 3×3×13×3 参数集合，模型切换后不保留非法组合；
4. 参考/风格选择都可由 Canvas API 读回真实边，返回节点与退出语义互不混淆；
5. 任一图片工具都创建新待确认节点，源节点 JSON 不变，并保存可重放的 transform spec；
6. 页面运行时只访问本地 `/api/*` 与 `/fixtures/*`，视觉基线为 `1440×900`；
7. `typecheck / lint / unit / build / e2e` 全绿，用户的未跟踪 `.gitignore` 保持不变。

## 后续总目标切片

本里程碑完成后继续推进 Text 节点创作器、Audio/TTS 与音色库、角色库创建/编辑、Script 双版本成功态、AssetSidebar 真实投影、编译器对合成时间线的消费、公开态/账户页补齐和最终全站像素审计。
