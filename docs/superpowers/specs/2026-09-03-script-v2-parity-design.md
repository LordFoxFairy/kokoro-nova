# LibTV Script V2 高保真复刻设计

**日期：** 2026-09-03  
**状态：** 已纳入用户确认的长期大目标  
**仓库边界：** 纯前端子仓库；生成、持久化、报价、素材和异步任务均为确定性本地 mock

## 1. 目标与完成定义

本里程碑把当前简化的脚本向导升级为 LibTV 官网可观察到的 Script V2 完整垂直切片，而不是只复制一张表格。完成时，本地实现必须同时具备：

1. 画布节点内的脚本生成器、模型目录、空态入口和资源态工具条；
2. `确认镜头 → 准备资产 → 合成提示词` 三阶段全屏工作区；
3. 镜头表编辑、资产生命周期、双轨提示词状态机、批量分镜图与批量视频物化；
4. 刷新恢复、并发写入保护、撤销语义、禁用原因和错误反馈；
5. 可替换为真实后端的版本化本地契约、Mock API、示例与 OpenAPI；
6. 单元、契约、浏览器交互和 1440×900 视觉基准。

“交互一致”以官网当前行为为准：相同入口、文案、阶段门槛、弹层层级、键盘关闭顺序、状态反馈和结果拓扑。内部实现继续使用本仓库 React/Zustand/Next.js 架构，不复制官网私有源码，也不依赖官网运行时。

## 2. 事实来源与证据等级

### 2.1 已观察界面（`observed`）

- 节点空态有三个入口：`剧本生成分镜脚本`、`角色生成分镜脚本`、`自己编写分镜脚本`。
- 节点附着生成器的默认模型为 `GVLM 3.1`，输入提示为 `描述剧情片段、故事，为你生成分镜脚本`，默认报价 6。
- Script 文本模型目录顺序为 `GVLM 3.1`、`CVLM 5.5`、`GVLM 3.1 Flash`，并显示 20s/10s/15s 与档位说明。
- 全屏工作区顶栏固定为三阶段，并显示每阶段完成度和 `N/3 完成后可批量生视频`。
- 镜头表列顺序固定为：`镜号 / 时长 / 画面描述 / 景别 / 光影氛围 / 对白·旁白 / 音效 / 运镜 / 最终提示词 / 操作`。
- 时长为 5–15 秒整数；文本单元格通过弹层编辑，失焦自动保存；行支持拖拽、颜色标签和删除。
- 景别固定为：`大远景、远景、全景、中远景、中景、中近景、近景、特写、大特写、头肩景、半身景、全身景`。
- 资产分为角色、场景、道具；来源为 `AI生成 / 从当前画布选择 / 本地上传 / 个人资产库`。
- AI 资产默认 `Lib Image / 标准 / 2K / 2:1`，当前报价 18；质量支持低/标准/高，分辨率支持 1K/2K/4K，画幅由模型能力决定。
- 单镜提示词弹窗分为 `分镜图提示词` 和 `视频运动提示词`，支持 `智能合成 / 自动拼接`、模型选择、重算、进度、失败和撤销。
- 批量提示词弹窗支持镜头多选、全选、详情展开、合成模式、模型与汇总报价。
- 节点资源态工具条包含 `重新生成 / 批量生成分镜 / 批量生视频 / 下载`；不满足门槛时禁用并给出原因。

对应截图位于 `docs/research/libtv/pages/canvas/screenshots/script-*.png`。

### 2.2 网络确认（`network-confirmed`）

- 脚本状态随节点通过 `POST /api/canvas/nodes/batch` 保存，节点 `data` 为 JSON 字符串。
- 报价使用 `POST /api/task/generation/power/calculator`，成功响应形状为 `{ code, data: { power }, msg, trace_id }`。
- 初次脚本生成使用场景 `script-generate-v2`；提示词重算使用 `script-recompute-prompts-v2`。
- 初次生成默认 provider/model 为 `aurora / aurora-3-prime`，taskType 为 `text`。
- AI 资产报价使用 `provider: lib-image`、`model: lib-image-2`、`taskType: image` 以及质量、分辨率、画幅参数。

研究文档和示例只保留字段结构，不保存官网项目、节点、请求、会话、账户或 trace 的真实值。

### 2.3 Bundle 推断（`bundle-inferred`）

- Script V2 任务模式为 `generate-full`、`recognize-assets-only`、`recompute-batch-shots`。
- 重算单批最多 20 镜，附加上下文最多 100 镜；大批量串行拆分，并保存 batch run 状态用于恢复。
- 生成结果支持外层 `texts[0]` 内嵌 JSON，也支持直接 JSON；资产识别模式允许没有 shots。
- 图片提示词建议 200–400 个非空白字符且至少 8 个视觉名词；视频提示词建议至少 350 个字符、3 个运动动词和 1 个时序连接词。校验产生警告而不是静默丢弃结果。
- 智能重算按每个 shot/track 记录 operation id 与输入 fingerprint；返回时只写回仍匹配的操作，输入变化则标记 `stale`。
- 手工编辑状态不会被异步旧结果覆盖；批量覆盖前需要确认，自动拼接后可在 20 秒窗口内撤销一次。

## 3. 状态模型

Script V2 的唯一持久化入口为 `node.data.extra.scriptV2`。旧的 `extra.draft`、`extra.shots`、`extra.assets` 只由兼容读取器迁移，新的写入不再制造两份真相。

```ts
type ScriptV2PromptTrack = 'image' | 'video'
type ScriptV2PromptState =
  | 'none'
  | 'synced'
  | 'stale'
  | 'generating'
  | 'user_edited'
  | 'user_edited_stale'

interface ScriptV2State {
  version: 1
  entry: 'screenplay' | 'character' | 'manual' | null
  activeStage: 'shots' | 'assets' | 'prompts'
  title: string
  originalStoryText: string
  styleDescription: string | null
  rows: ScriptV2Row[]
  assets: {
    characters: ScriptV2Asset[]
    scenes: ScriptV2Asset[]
    props: ScriptV2Asset[]
  }
  generator: ScriptV2GeneratorState
  promptComposer: ScriptV2PromptComposerState
  promptBatchRuns: ScriptV2PromptBatchRun[]
}
```

### 3.1 镜头行

每行拥有稳定 `id` 和 `hiddenUuid`、1 起始 `shotNumber`、5–15 秒 `durationSeconds`，并持久化官网可写字段：

- `plotDescription`、`plotDescriptionEntityRefs`；
- `characters`、`sceneAssetIds`、`propTags`、`propAssetIds`；
- `shotSize`、`cinematics.cameraMovement`、`cinematics.lighting`；
- `lightingAndAtmosphere`、`dialogue`、`dialogueLines`、`audioEffects`、`voiceover`、`bgm`、`sfx`；
- `imageGenerationPrompt`、`videoMotionPrompt`、两组 prompt entity refs；
- `imageToVideoMotionPrompt`、`userEditedImageToVideoMotionPrompt`；
- `imageVersions`、`videoVersions`、`colorLabel`；
- `textHash`、`payloadHash`、两条独立 prompt state。

任何会影响合成输入的字段变化必须重新计算 fingerprint，并把原 `synced` 变为 `stale`、原 `user_edited` 变为 `user_edited_stale`。纯排序和颜色标签不使提示词失效。

### 3.2 资产

资产角色固定为 `character / scene / prop`，状态为 `pending / generating / ready / failed / lost`。资产保存稳定 id、名称、描述、缩略图、本地来源、关联画布节点、主资产标记、合规状态、生成设置、版本和时间。

阶段完成规则：

- 没有资产时，“准备资产”视为完成；
- 存在资产时，每个非 lost 资产必须 `ready` 且有缩略图或关联节点；
- pending/generating/failed 资产显示差额并阻断阶段底部“下一步”；
- 用户仍可直接点击阶段 3 查看提示词，但全局批量视频保持禁用。

删除资产时若被镜头引用，必须显示影响确认：`仅删除资产，保留文字` 或 `同时移除镜头引用`。两种模式都使受影响 prompt 失效。

### 3.3 双轨提示词

图片轨与视频轨独立保存、独立编辑和独立状态，但智能重算一次请求同时返回两轨。文本编辑采用 500ms debounce；关闭弹窗、切换镜头或开始重算前必须 flush。

`自动拼接` 完全在前端、确定性且免费；`智能合成` 通过本地 mock Script run 模拟报价、排队、进度和结果。operation id + fingerprint 防止迟到结果覆盖新输入。批量智能合成按 20 镜拆批、串行运行、可刷新恢复，并呈现成功/跳过/失败统计。

## 4. UI 与交互结构

### 4.1 画布节点

节点卡保留官网的深色资源形态和三段进度。空态显示三个入口；进入生成器后，附着面板采用 counter-scale，画布为 25%、50% 或 100% 时仍保持约 660 CSS 像素的可读宽度。

节点生成器包含：多行故事输入、参考素材摘要、三模型目录、翻译开关、6 积分报价和提交按钮。Escape 顺序为模型目录 → 节点生成器 → 取消节点选中。`自己编写分镜脚本` 直接建立一行空镜头并打开全屏工作区。

资源态卡显示三阶段概览、镜头数量和 `打开脚本节点 →`。节点上方工具条中的重新生成、批量分镜、批量视频和 CSV 下载使用同一份 state 与门槛函数。

### 4.2 全屏工作区

- 覆盖画布但保持产品主题；关闭按钮有 `关闭 (ESC)` 可访问名称。
- 顶部阶段条显示标题、动态副标题、全局完成度；可点击已查看阶段。
- 表格横向滚动，第一列和操作列保持可定位；行拖拽时只提交一次持久化 mutation。
- 单元格弹层不因表格滚动丢失；失焦保存；Escape 只关闭最内层弹层。
- 时长编辑器包含数字步进器、`范围 5–15 秒；失焦自动保存` 和保存按钮。
- 每个文本字段支持 `@资产名` 插入，并同步 entity refs。
- 行操作菜单支持清除、红、黄、绿、蓝、灰标签以及删除。
- 底部固定 `添加镜头` 和当前阶段主动作。

### 4.3 资产阶段

角色、场景、道具分区始终可见，每区展示计数、卡片和添加入口。添加时先创建 pending 卡，再打开四来源弹窗；取消来源选择不会丢弃 pending 卡，以复现官网生命周期。

AI 表单复用本地 Image 模型能力矩阵，默认显示 `Lib Image / 标准 / 2K / 2:1 / 18`。画布选择只列出可用图片节点；本地上传使用对象 URL 预览但不上传网络；个人资产库复用本地 `/api/assets`。

资产卡支持详情编辑和更多菜单：选择图片、AI 生角色/场景/道具、跳转至节点、清除图片、保存到个人资产、删除。缺图和无关联节点时，相关动作必须保持禁用并显示原因。

一键生成资产弹窗按三个角色分组，支持逐项勾选、提示词编辑、全选、模型配置、汇总报价和串行本地生成。

### 4.4 提示词阶段与批量物化

单镜详情弹窗宽约 760px，批量弹窗宽约 800px，均禁止点击遮罩意外关闭。提示词状态文案为 `未生成 / 已生成 / 内容已变更 / 需重算 / 合成中`。

`批量生成分镜` 创建一个 storyboard group 和每镜一个 Image 节点，提示词来自 image track；`批量生视频` 创建一个 normal group 和每镜一个 Video 节点，提示词来自 video track，时长继承镜头时长。两者使用单个 revision transaction，建立 Script → 输出节点的边，完成后选中并 fitView；一次 undo 移除整个批次。

批量动作先显示确认/配置弹窗，不直接消耗积分。输出节点仍经过现有通用 ConfirmGate 与 Job 状态机，保证本地 mock 和未来后端使用同一安全边界。

CSV 下载包含镜头字段以及资产表，UTF-8 BOM、正确转义逗号/引号/换行，文件名来源于脚本标题。

## 5. 本地 API 与任务设计

### 5.1 规范化 API

官网原始协议继续只记录在研究文档；本地长期契约新增 Script V2 资源：

- `POST /api/script-v2/quotes`：对 initial generation、asset image、single/batch prompt recompute、storyboard batch、video batch 报价；
- `POST /api/script-v2/runs`：用 `idempotencyKey` 提交确定性任务，返回 queued run；
- `GET /api/script-v2/runs/{runId}`：轮询并按固定时钟推进 running/succeeded/failed/cancelled；
- `POST /api/script-v2/runs/{runId}`：`cancel` 或 `retry`；
- 持久化仍使用 `POST /api/canvases/{canvasId}` 的 revision-guarded mutation。

所有请求和响应都由 Zod 在 Route Handler 与 typed client 两端校验。run 结果使用 operation 判别联合，禁止 `unknown` 结果穿过 API 边界。

### 5.2 确定性 fixture

初次生成根据故事文本产生 4 镜，镜号、id、资产与提示词在相同输入下稳定；角色入口同时产生一份角色资产；资产生成返回本地 SVG；提示词重算产生满足最低结构的双轨文本；失败、取消和 stale writeback 由可选 scenario/fixture 控制。

本地 run 不调用官网、ComfyUI 或任何远端模型，不读取或刷新官网 Cookie。官方登录会话只用于研究和截图。

## 6. 外部协议适配

为了后续真实后端接入，提供纯函数：

- `serializeOfficialScriptNode(state)`：本地 camelCase state → 已确认的官网节点 data 形状；
- `buildOfficialScriptGenerationEnvelope(input)`：构造 `script-generate-v2` 脱敏示例；
- `buildOfficialPromptRecomputeEnvelope(input)`：构造最多 20 镜的 `script-recompute-prompts-v2` 请求；
- `parseOfficialScriptResult(payload)`：兼容 direct JSON 与 `texts[0]` JSON；
- `resolvePromptWriteback(...)`：按 operation id/fingerprint 合并结果；
- `migrateLegacyScriptDraft(extra)`：读取当前简化 draft。

这些 adapter 只用于契约测试和未来接线，不在本地运行时访问官网。

## 7. 组件和文件边界

```text
src/domain/script-v2.ts                 状态、迁移、纯 reducer、门槛、指纹、序列化
src/domain/script-v2-mock.ts            确定性生成/识别/重算/批量拓扑
src/contracts/script-v2.ts              Zod API 与持久化 schemas
src/server/script-v2.ts                 run repository 与固定时钟推进
src/app/api/script-v2/...               Route Handlers
src/components/script/ScriptV2NodeEditor.tsx
src/components/script/ScriptV2Workspace.tsx
src/components/script/ScriptV2ShotTable.tsx
src/components/script/ScriptV2Assets.tsx
src/components/script/ScriptV2Prompts.tsx
src/components/script/ScriptV2Dialogs.tsx
```

`ScriptWizard.tsx` 暂时保留为兼容导出，避免一次提交同时影响旧版 `scriptLegacy`；V2 与旧版不再共享状态或界面。

## 8. 可访问性、键盘与视觉约束

- 所有图标按钮有中文 aria-label；表格保留语义 table/row/cell。
- 焦点被弹窗捕获并在关闭后返回触发按钮；Tab 不进入遮罩后的画布。
- Escape 按最内层编辑器、详情弹窗、批量弹窗、全屏工作区、节点生成器依次关闭。
- 禁用按钮仍可通过 tooltip/aria-describedby 获得原因。
- 1440×900 基线至少覆盖：节点空态、节点生成器、模型目录、镜头阶段、景别菜单、资产阶段、来源弹窗、AI 表单、提示词阶段、单镜提示词、批量提示词、批量视频确认。
- 视觉比较以布局、间距、层级、字体尺度、颜色、控件尺寸和遮罩强度为主要指标；动态 ID、时间和光标不进入基线。

## 9. 验收矩阵

### Domain

- 旧 draft 无损迁移；未知/损坏字段安全回退；稳定 id 不随刷新变化。
- 5–15 秒、12 景别、密集镜号、拖拽排序、颜色标签和删除规则全覆盖。
- prompt state、fingerprint、20 镜拆批、100 镜上下文、stale/late result、撤销窗口全覆盖。
- 资产 pending/generating/ready/failed/lost、引用删除、实体引用清洗全覆盖。

### API

- 每个 request/response/example 通过 Zod；OpenAPI operationId 与 route manifest 一致。
- idempotency、轮询、取消、重试、revision conflict 和错误码有测试。
- tracked 文件不存在官网真实 project/node/session/request/trace id、Cookie、Token 或远程私有素材地址。

### Browser

- 三入口、模型目录、附着缩放和 Escape 分层。
- 三阶段导航、所有单元格编辑、失焦保存、拖拽、标签、删除和刷新恢复。
- 四种资产来源、资产详情、批量资产选择与状态阻断。
- 双轨提示词编辑、500ms debounce、智能/自动合成、批量选择、stale 防覆盖和撤销。
- 批量分镜/视频的单事务拓扑、ConfirmGate、一次 undo 和 CSV 下载。

### Quality gates

- `pnpm typecheck`
- `pnpm lint`
- `pnpm test`
- `pnpm build`
- `pnpm e2e --reporter=line`
- `git diff --check`
- 视觉基线只更新 Script V2 相关图片；恢复 `next-env.d.ts` 和所有无关截图。

## 10. 非目标与后续工作

本里程碑不连接官网真实 API、不执行付费生成、不保存官网凭证、不实现真实对象存储或 ComfyUI。旧版脚本、逐帧拉片、导演台深度复刻、全局资产管理和完整视频编辑仍属于总目标后续里程碑；Script V2 完成不会把总目标标记为完成。
