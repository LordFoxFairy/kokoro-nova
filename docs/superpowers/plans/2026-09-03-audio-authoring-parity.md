# Audio/TTS、音色库与音乐生成高保真实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 在纯前端本地 fixture 中复刻 LibTV 官网当前 Audio 节点的 660px 节点附着创作器、六模型能力切换、TTS 标记、音色库/筛选/收藏/克隆及音乐模式，并同步可执行 API 契约、视觉基线和回归测试。

**Architecture:** Audio 节点沿用 Image/Video 的节点附着编辑器边界，但将模型能力和可持久化创作状态收敛到独立 `audio-authoring` 领域模块。画布边仍是参考依赖的唯一事实，`NodeData.extra.audioAuthoring` 只保存可重放参数、音色选择及本地克隆状态；现有 Canvas revision mutation、Job API 和本地 WAV provider 继续作为唯一写入与执行路径。

**Tech Stack:** Next.js App Router、React 19、TypeScript、Zod、Vitest、React Flow、Playwright、YAML OpenAPI、确定性本地 mock/fixture。

## Global Constraints

- 本计划只是 LibTV 全能力复刻总目标中的一个里程碑；完成本计划不代表总目标完成。
- LibTV 官网当前登录态界面、既有脱敏截图与网络契约研究是事实来源；不复制官网私有项目、空间 ID 或用户素材。
- 当前仓库只实现前端和本地 mock；浏览器运行时不得调用 LibTV 或其他远程生成服务。
- 所有模型、音色、录音、生成、分页、筛选和错误状态必须由确定性 fixture 重放。
- 用户只在官网登录失效、验证码或二次验证时介入；本地音色克隆不访问麦克风。
- 所有快速连续参数修改必须通过现有 `commitWith` revision 机制提交，避免闭包覆盖新状态。
- 用户未跟踪的 `.gitignore` 保持原样；测试改写的 `next-env.d.ts` 和无关截图在提交前恢复。
- 每项生产行为先写失败测试并观察预期失败，再实现最小代码使其通过。

---

## 官网冻结事实

### 创作器与模型目录

- Audio 节点双击后展示节点附着、反向缩放的深色创作器，屏幕宽度固定为 `660px`。
- 新节点默认模型为 `Seed Audio 1.0`，提示词 placeholder 为“描述你想要的音频效果，可用 @ 引用音频”，底部摘要为“中文 · 24k · wav”，最大 `2000` 字。
- 当前模型目录固定六项且保持顺序：
  1. `Seed Audio 1.0`：多模态音频生成；
  2. `Minimax-speech-2.8-hd`：高质量文字转语音；
  3. `Minimax-speech-2.8-turbo`：快速文字转语音；
  4. `Eleven V3`：可定制文字转语音；
  5. `Eleven Music V3`：智能音乐生成；
  6. `Mureka V8`：多风格与自然人声音乐生成。

### 模型专属参数

- Seed Audio：语种 `中文/英文`，采样率 `8k/16k/24k/48k`，格式 `wav/mp3/pcm/ogg_opus`。
- Minimax Speech：最大 `50000` 字；支持停顿和语气词插入；音色、语速、声调、音量；音高、强度、音色调节；音效 `无/空旷回音/礼堂广播/电话失真/电音`。
- Eleven V3：最大 `5000` 字；音色；稳定性 `活泼的/自然的/沉稳的`。
- Eleven Music V3：最大 `5000` 字；音乐时长，官网当前默认 `30秒`。
- Mureka V8：`描述生音乐` 最大 `1024` 字并支持“纯乐器”；`歌词生音乐` 最大 `3000` 字。

### 标记、音色与克隆

- 停顿预设为 `0.25s/0.5s/1.0s/1.5s/自定义`，序列化语法为 `<#秒数#>`。
- 语气词固定 21 项：笑声、轻笑、咳嗽、清嗓子、正常换气、喘气、吸气、呼气、倒吸气、吸鼻子、叹气、喷鼻息、打嗝、咂嘴、哼唱、嘶嘶声、嗯、口哨、喷嚏、抽泣、鼓掌；序列化语法为 `(名称)`。
- 音色库标签为 `音色库/我的音色/收藏音色`，首屏 20 条；fixture 暴露 `327` 条、`17` 页、`20条/页` 的分页语义。
- 筛选项为语言、口音、性别、年龄；口音在未选择语言时禁用；年龄为青年、成年、儿童、老年。
- 克隆流程为固定朗读文本 → 模拟录音 → 勾选授权 → 生成本地音色；任何条件不齐时生成按钮禁用。

---

## 文件边界与接口

### 新建

- `src/domain/audio-authoring.ts`：模型族、版本化状态、严格读取/规范化、停顿/语气词 token 和音色筛选的纯函数。
- `src/domain/__tests__/audio-authoring.test.ts`：六模型、状态迁移、token、筛选与克隆前置条件的领域测试。
- `src/components/audio/AudioModelCatalog.tsx`：六项目录、搜索、键盘选择和 Escape 分层。
- `src/components/audio/VoiceLibraryDialog.tsx`：三标签、20 条首屏、筛选、收藏、试听和本地克隆状态机。
- `src/components/canvas/AudioNodeEditor.tsx`：660px 创作器和按模型族切换的参数界面。
- `src/contracts/__tests__/audio-authoring-examples.test.ts`：OpenAPI 示例与 runtime Zod schema 的双向验证。
- `docs/api/AUDIO_AUTHORING_STATE.md`：状态字段、迁移、UI 映射和未来后端接入规则。
- `docs/api/examples/canvas-audio-authoring-update-request.json`、`canvas-audio-authoring-update-response.json`：可执行 Canvas mutation 样本。
- `e2e/audio-editor.spec.ts`：交互、持久化、生成、分页/筛选/克隆和视觉基线。

### 修改

- `src/domain/models.ts`：新增 `AudioModelCapabilities` 和六项官网目录，导出查询与输出规范化 helper。
- `src/domain/libraries.ts`：替换为当前 21 项 cue，并扩展确定性 20 条首屏音色 fixture。
- `src/domain/types.ts`：只在必要时扩展通用 `OutputSpec`；Audio 专属状态留在 `extra.audioAuthoring`。
- `src/domain/factory.ts`：新 Audio 节点默认 Seed Audio 与 v1 状态。
- `src/components/canvas/NodeCard.tsx`、`WorkflowCanvas.tsx`、`CanvasWorkspace.tsx`：挂载新编辑器、排除通用 drawer、接线参考选择和原子提交。
- `src/contracts/canvas.ts`：增加 Audio v1 状态与自定义音色 runtime schema。
- `docs/api/openapi.yaml`：升级版本并描述 Audio schemas/examples。
- `docs/research/libtv/FEATURE_MATRIX.md`、`docs/research/libtv/visual/canvas-workflow-comparison.md`、`docs/task.md`：更新已实现能力与保留差异。

### 稳定接口

```ts
export type AudioModelFamily =
  | 'multimodal'
  | 'tts-minimax'
  | 'tts-eleven'
  | 'music-eleven'
  | 'music-mureka'

export interface AudioModelCapabilities {
  family: AudioModelFamily
  maxCharacters: number
  acceptsReferences: readonly ('text' | 'audio')[]
  supportsVoice: boolean
  supportsPauseTokens: boolean
  supportsCueTokens: boolean
  defaults: AudioAuthoringState['settings']
}

export interface AudioAuthoringState {
  schemaVersion: 1
  settings: {
    language: 'zh' | 'en'
    sampleRate: '8k' | '16k' | '24k' | '48k'
    format: 'wav' | 'mp3' | 'pcm' | 'ogg_opus'
    voiceId: string
    speed: number
    pitch: number
    volume: number
    effectPitch: number
    effectStrength: number
    timbre: number
    soundEffect: 'none' | 'echo' | 'hall' | 'telephone' | 'electronic'
    stability: 'lively' | 'natural' | 'steady'
    musicDurationSeconds: number
    murekaMode: 'description' | 'lyrics'
    instrumental: boolean
  }
  favoriteVoiceIds: string[]
  customVoices: LocalVoice[]
  advancedOpen: boolean
}

export function defaultAudioAuthoringState(modelId?: string): AudioAuthoringState
export function readAudioAuthoringState(extra: Record<string, unknown>, modelId: string): AudioAuthoringState
export function normalizeAudioAuthoringForModel(modelId: string, state: AudioAuthoringState): AudioAuthoringState
export function insertAudioToken(prompt: string, selectionStart: number, selectionEnd: number, token: string): { prompt: string; caret: number }
export function canGenerateClonedVoice(input: { hasRecording: boolean; consent: boolean; name: string }): boolean
```

---

### Task 1: 锁定 Audio 领域契约和六模型能力

**Files:**
- Create: `src/domain/__tests__/audio-authoring.test.ts`
- Create: `src/domain/audio-authoring.ts`
- Modify: `src/domain/models.ts`
- Modify: `src/domain/libraries.ts`

**Interfaces:**
- Produces: 上述 `AudioAuthoringState`、`AudioModelCapabilities` 和五个纯 helper。
- Consumes: `ModelDefinition`、`OutputSpec` 和现有 `MODELS` registry。

- [x] **Step 1: 写失败测试**：断言六模型顺序、名称、说明、模型族、最大字符数和默认值；断言模型 ID 唯一。
- [x] **Step 2: 运行 `pnpm vitest run src/domain/__tests__/audio-authoring.test.ts`**，确认因导出不存在而失败。
- [x] **Step 3: 实现六模型 registry 和能力查询**，移除四项过期 Audio 模型。
- [x] **Step 4: 写失败测试**：旧/非法状态切换模型后被 clamp，合法值保留，未知 extra 不被 reader 信任。
- [x] **Step 5: 实现 `default/read/normalizeAudioAuthoringState`**，所有数组复制且结果可序列化。
- [x] **Step 6: 写失败测试并实现 token 插入、21 cue、停顿范围和克隆前置条件**。
- [x] **Step 7: 重跑领域测试和 `src/domain/__tests__/models.test.ts`**，确认通过。

### Task 2: 把 Audio 状态接入节点和运行时契约

**Files:**
- Modify: `src/domain/factory.ts`
- Modify: `src/contracts/canvas.ts`
- Modify: `src/mocks/scenarios/video-project.ts`
- Modify: `src/contracts/__tests__/canvas.test.ts`

**Interfaces:**
- Consumes: `defaultAudioAuthoringState()`。
- Produces: `NodeData.extra.audioAuthoring` 的 Zod-validated v1 JSON。

- [x] **Step 1: 写失败测试**：新建 Audio 节点默认为 `seed-audio-1`、空 prompt 和 v1 状态；过期 fixture 可迁移。
- [x] **Step 2: 运行目标测试并确认预期失败**。
- [x] **Step 3: 更新 factory 与 populated fixture**，不改既有确定性 ID。
- [x] **Step 4: 写失败 contract test**：合法 Audio 状态通过，非法 enum/range/schemaVersion 拒绝。
- [x] **Step 5: 实现严格 Zod schema 并重跑目标测试**。

### Task 3: 实现六项 Audio 模型目录

**Files:**
- Create: `src/components/audio/AudioModelCatalog.tsx`
- Test: `e2e/audio-editor.spec.ts`

**Interfaces:**
- Props: `{ selectedId: string; onSelect(modelId: string): void; onClose(): void }`。
- Produces: `data-testid="audio-model-catalog"` 和 `audio-model-option-${id}`。

- [x] **Step 1: 写失败 E2E**：目录恰好六项、顺序一致、搜索过滤、Enter 选择、Escape 仅关闭目录。
- [x] **Step 2: 运行 `pnpm playwright test e2e/audio-editor.spec.ts --grep "model catalogue"` 并确认失败**。
- [x] **Step 3: 实现目录**，复用现有本地 icon tile、Dialog focus/keyboard 规则，不引入远程素材。
- [x] **Step 4: 重跑目标 E2E 并确认通过**。

### Task 4: 实现 660px Audio 节点附着创作器

**Files:**
- Create: `src/components/canvas/AudioNodeEditor.tsx`
- Modify: `src/components/canvas/NodeCard.tsx`
- Modify: `src/components/canvas/WorkflowCanvas.tsx`
- Modify: `src/components/canvas/CanvasWorkspace.tsx`
- Modify: `src/components/canvas/NodeInspector.tsx`
- Test: `e2e/audio-editor.spec.ts`

**Interfaces:**
- Props 与 Image/Video editor 对齐：node、project、zoom、commit、run、selection callbacks。
- Produces: `data-testid="audio-node-editor"`、`audio-model-selector`、`audio-run`。

- [x] **Step 1: 写失败 E2E**：双击 Audio 只打开节点编辑器；通用 inspector 不出现；在 33%/50%/100% 缩放下宽度均为 `658–662px`。
- [x] **Step 2: 运行几何测试并确认失败**。
- [x] **Step 3: 按现有 inverse-scale editor 架构挂载 Audio 编辑器**，点击画布关闭，Escape 分层关闭。
- [x] **Step 4: 实现 prompt blur 持久化、成本、运行和进度入口**，写入均走 `commitWith`。
- [x] **Step 5: 重跑几何与基本交互测试并确认通过**。

### Task 5: 实现五类模型专属编辑状态

**Files:**
- Modify: `src/components/canvas/AudioNodeEditor.tsx`
- Test: `e2e/audio-editor.spec.ts`

**Interfaces:**
- Consumes: `audioModelCapabilities()` 和 `normalizeAudioAuthoringForModel()`。
- Produces: 模型切换后的原子 `{ modelId, prompt?, extra.audioAuthoring }` patch。

- [x] **Step 1: 写失败 E2E**：Seed 输出弹层恰好显示 2×4×4 选项并刷新后保留。
- [x] **Step 2: 写失败 E2E**：Minimax 展示两种 token、音色、基础三滑杆、效果三滑杆和五音效；一键重置恢复 defaults。
- [x] **Step 3: 写失败 E2E**：Eleven Speech 仅展示音色与三稳定性；Eleven Music 展示音乐时长；Mureka 在描述/歌词切换时更新字数限制和纯乐器可见性。
- [x] **Step 4: 运行三组测试并确认分别因控件不存在而失败**。
- [x] **Step 5: 实现按 capability 渲染、参数规范化和实时摘要/字数/报价**。
- [x] **Step 6: 重跑测试并确认刷新后的 Canvas API JSON 与 UI 一致**。

### Task 6: 实现停顿、语气词和富 token 视图

**Files:**
- Modify: `src/components/canvas/AudioNodeEditor.tsx`
- Test: `e2e/audio-editor.spec.ts`

**Interfaces:**
- Consumes: `insertAudioToken()`、`PAUSE_PRESETS`、`PARALINGUISTIC_CUES`。
- Produces: prompt 中的精确 `<#0.25#>` / `(喘气)` 文本和独立可视 chip overlay。

- [x] **Step 1: 写失败 E2E**：在当前选区插入预设、自定义停顿与 cue，caret 落在 token 后，API prompt 精确可读回。
- [x] **Step 2: 写失败 E2E**：21 个 cue 完整、无重复；自定义停顿拒绝空值、非数字、`<=0` 和 `>10`。
- [x] **Step 3: 运行目标测试并确认失败**。
- [x] **Step 4: 实现菜单、输入校验和不改语义文本的 token chip overlay**。
- [x] **Step 5: 重跑目标测试并确认通过**。

### Task 7: 实现音色库、筛选、收藏、试听和本地克隆

**Files:**
- Create: `src/components/audio/VoiceLibraryDialog.tsx`
- Modify: `src/components/canvas/AudioNodeEditor.tsx`
- Modify: `src/domain/libraries.ts`
- Test: `e2e/audio-editor.spec.ts`

**Interfaces:**
- Props: `{ state: AudioAuthoringState; selectedVoiceId: string; onChange(next: AudioAuthoringState): void; onClose(): void }`。
- Produces: `voice-library-dialog`、`voice-filter-dialog`、`voice-clone-dialog`。

- [x] **Step 1: 写失败 E2E**：三标签、首屏 20 条、327/17 分页文案、搜索、语言/口音/性别/年龄筛选。
- [x] **Step 2: 写失败 E2E**：收藏跨标签持久化，选择音色写回节点；试听按钮只播放/停止确定性本地 WAV。
- [x] **Step 3: 写失败 E2E**：克隆按钮状态严格遵循录音与授权，录音为可取消计时 mock，生成后进入“我的音色”并可选择。
- [x] **Step 4: 运行目标测试并确认失败**。
- [x] **Step 5: 实现 Dialog 分层、筛选依赖、收藏和本地 preview**；禁止调用 `getUserMedia`。
- [x] **Step 6: 实现并持久化克隆状态机**，生成 ID 由节点 ID 与序号确定性派生。
- [x] **Step 7: 重跑三组 E2E 和 Canvas contract tests**。

### Task 8: 泛化 Audio 参考选择并验证生成闭环

**Files:**
- Modify: `src/components/canvas/CanvasWorkspace.tsx`
- Modify: `src/components/canvas/WorkflowCanvas.tsx`
- Modify: `src/components/canvas/AudioNodeEditor.tsx`
- Modify: `src/domain/video-references.ts` 或新增通用别名
- Test: `e2e/audio-editor.spec.ts`

**Interfaces:**
- Consumes: 现有 Canvas selection transaction 与 DAG 校验。
- Produces: text/audio → Audio 边；不接受 image/video/style 输入。

- [x] **Step 1: 写失败领域/E2E**：Audio 参考模式只启用 text/audio，循环边禁用，添加/取消后返回编辑器。
- [x] **Step 2: 运行测试并确认失败**。
- [x] **Step 3: 泛化 selection guard 与候选标签，不改变 Video/Image 既有行为**。
- [x] **Step 4: 写失败 E2E**：运行 Audio Job 后出现本地 WAV artifact、可播放/下载，并投影到故事板 Audio 列。
- [x] **Step 5: 接线现有 Job API/provider，重跑生成闭环测试**。

### Task 9: 同步 API 文档、OpenAPI 与可执行样本

**Files:**
- Create: `docs/api/AUDIO_AUTHORING_STATE.md`
- Create: `docs/api/examples/canvas-audio-authoring-update-request.json`
- Create: `docs/api/examples/canvas-audio-authoring-update-response.json`
- Create: `src/contracts/__tests__/audio-authoring-examples.test.ts`
- Modify: `docs/api/openapi.yaml`
- Modify: `src/contracts/route-manifest.ts`

**Interfaces:**
- Produces: OpenAPI `AudioModelCapabilities`、`AudioAuthoringState`、`AudioVoice`、`AudioSettings` schemas。
- Consumes: `CanvasMutationRequest/Response`，不新造与运行时不一致的独立 endpoint。

- [x] **Step 1: 写失败 contract test**：读取两个 JSON 样本，以 runtime schema 和 OpenAPI example 双重验证。
- [x] **Step 2: 运行目标测试并确认因文件/schema 不存在而失败**。
- [x] **Step 3: 编写专门状态文档和脱敏样本**，覆盖 defaults、迁移、枚举、范围、分页 fixture、克隆 mock 与真实后端替换边界。
- [x] **Step 4: OpenAPI 升级到 `1.6.0-audio-authoring-state` 并新增 schemas/example**。
- [x] **Step 5: 重跑 OpenAPI、Canvas 与 example contract tests**。

### Task 10: 视觉基线、全量回归、文档收口与提交

**Files:**
- Modify: `docs/research/libtv/FEATURE_MATRIX.md`
- Modify: `docs/research/libtv/visual/canvas-workflow-comparison.md`
- Modify: `docs/task.md`
- Create: `docs/screenshots/audio-*.png`
- Create: `e2e/__snapshots__/audio-editor.spec.ts-snapshots/*.png`

**Interfaces:**
- Produces: 默认 Seed、Minimax TTS、音色库、筛选/克隆、Mureka 音乐五组 `1440×900` 基线。

- [x] **Step 1: 为五个官网状态写 visual assertions，并只接受有意差异的基线更新**。
- [x] **Step 2: 运行 `pnpm playwright test e2e/audio-editor.spec.ts --update-snapshots`，逐张检查 1440×900 截图**。
- [x] **Step 3: 更新能力矩阵、对照文档和 `docs/task.md`，明确已实现项与生成结果/真实计费等保留差异**。
- [x] **Step 4: 运行 `pnpm verify`，读取完整输出，确认 typecheck/lint/unit/build 为零失败**。
- [x] **Step 5: 运行 `pnpm e2e`，读取完整输出，确认除 production-only 预期跳过外为零失败**。
- [x] **Step 6: 恢复 `next-env.d.ts` 与无关被改写截图；确认 `git status --short` 中 `.gitignore` 仍未跟踪且未被修改**。
- [x] **Step 7: 审阅 diff，确认无官网私有 ID/素材/远程 URL，再提交 `feat: replicate audio authoring workflows`**。

---

## 验收条件

1. Audio 双击只打开节点附着创作器，通用 `NodeInspector` 不出现；创作器在三档画布缩放下保持 `658–662px`。
2. 模型目录恰好六项，模型切换只展示对应参数并原子规范化持久化状态。
3. Seed 的 2×4×4 输出集合、Minimax 的 21 cue/5 音效、Eleven 稳定性和两类音乐模式均有运行时测试。
4. 音色库展示三标签、20 条首屏、327/17 fixture 分页、组合筛选、收藏、试听和无麦克风克隆闭环。
5. 所有 token、音色、参数、自定义音色与参考边刷新后可从 Canvas API 读回，非法旧状态有确定性迁移。
6. Audio Job 只调用本地 `/api/*`，产出本地 WAV 并投影到故事板；没有远程模型、音频或用户私有素材请求。
7. API 状态文档、OpenAPI、runtime Zod 和 JSON examples 同步，并由 contract tests 执行验证。
8. 五组 `1440×900` 视觉基线、全量 `pnpm verify` 和 `pnpm e2e` 通过；`.gitignore` 保持用户未跟踪状态。

## 后续总目标切片

Audio 里程碑提交后继续推进 Text 节点创作器、Script 双版本完整成功态、角色库创建/编辑、AssetSidebar 真实投影、合成编译器消费、公开态与账户页补齐，以及最终全站像素/交互/API 审计。
