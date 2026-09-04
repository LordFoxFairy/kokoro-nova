# Audio / TTS / 音色库 / 音乐生成契约

本页定义画布 Audio 节点从模型目录、参考选择、文本标记、音色管理到生成任务的长期数据契约。
当前仓库使用确定性本地 fixture 和 WAV provider；未来真实后端可以替换 transport/provider，但不能
改变 Canvas 文档、Job 状态机或模型 capability 的语义。

## 1. 数据所有权

| 数据 | 唯一事实来源 | 说明 |
|---|---|---|
| Audio 输入参考 | `WorkflowDocument.edges` 中 `target = AUDIO_NODE_ID` 的边 | 允许 text/audio；决定编译输入与参考卡顺序 |
| 提示词与 TTS 标记 | `audioNode.data.prompt` | `<#秒数#>` 与 `(语气词)` 是可直接执行的文本 |
| 当前模型 | `audioNode.data.modelId` | 必须存在于 `GET /api/models?media=audio` |
| 模型族执行参数 | `audioNode.data.output` | Job 报价与 provider 快照需要的当前 family 可见字段；隐藏字段不得越过 provider 边界 |
| 完整创作状态 | `audioNode.data.extra.audioAuthoring` | 严格、版本化、用于刷新恢复与模型切换 |
| 生成结果 | `audioNode.data.artifacts` | Job 成功后由 runner 原子写回的本地 Audio Artifact |

弹层开关、搜索词、当前分页、过滤弹窗草稿、试听进度和模拟录音中的计时属于临时组件状态，
不写入 Canvas。`advancedOpen` 当前保留在 v1 中，供未来跨会话恢复高级面板偏好；现有 UI 打开
弹层时可以只维护本地状态。

## 2. Audio 模型目录

`GET /api/models?media=audio&q=` 返回 `ModelCatalogResponse`，每一项 Audio 模型必须携带
`audioCapabilities`。可执行样本见
[`examples/models-audio.response.json`](examples/models-audio.response.json)。目录顺序冻结为：

| modelId | 显示名 | family | 最大字符 | 本地基础积分 |
|---|---|---:|---:|---:|
| `seed-audio-1` | Seed Audio 1.0 | `multimodal` | 2,000 | 1 |
| `minimax-speech-2.8-hd` | Minimax-speech-2.8-hd | `tts-minimax` | 50,000 | 1 |
| `minimax-speech-2.8-turbo` | Minimax-speech-2.8-turbo | `tts-minimax` | 50,000 | 1 |
| `eleven-v3` | Eleven V3 | `tts-eleven` | 5,000 | 2 |
| `eleven-music-v3` | Eleven Music V3 | `music-eleven` | 5,000 | 60 |
| `mureka-v8` | Mureka V8 | `music-mureka` | 1,024（歌词模式 3,000） | 60 |

表中的积分是本地确定性报价，不表示官网实时价格。真实后端应通过新目录版本更新报价，不能在
一次已创建 Job 的 `Quote` 上追改。

```ts
type AudioModelFamily =
  | 'multimodal'
  | 'tts-minimax'
  | 'tts-eleven'
  | 'music-eleven'
  | 'music-mureka'

type AudioModelCapabilities = {
  family: AudioModelFamily
  maxCharacters: number
  acceptsReferences: Array<'text' | 'audio'>
  supportsVoice: boolean
  supportsPauseTokens: boolean
  supportsCueTokens: boolean
  defaults: AudioSettings
}
```

## 3. `AudioAuthoringState` v1

```ts
type AudioAuthoringState = {
  schemaVersion: 1
  settings: AudioSettings
  favoriteVoiceIds: string[]
  customVoices: AudioVoice[]
  advancedOpen: boolean
}

type AudioSettings = {
  language: 'zh' | 'en'
  sampleRate: '8k' | '16k' | '24k' | '48k'
  format: 'wav' | 'mp3' | 'pcm' | 'ogg_opus'
  voiceId: string
  speed: number                 // 0.5..2
  pitch: number                 // -12..12
  volume: number                // 0..2
  effectPitch: number           // -100..100
  effectStrength: number        // -100..100
  timbre: number                // -100..100
  soundEffect: 'none' | 'echo' | 'hall' | 'telephone' | 'electronic'
  stability: 'lively' | 'natural' | 'steady'
  musicDurationSeconds: 30 | 60 | 120
  murekaMode: 'description' | 'lyrics'
  instrumental: boolean
}
```

所有字段都是必填项，避免不同模型族之间切换时丢失用户仍可恢复的参数。UI 只展示当前 family
支持的字段；隐藏字段不会提交到 provider，但保留在 v1 状态中。模型切换必须调用同一
normalize 规则：

1. 从新模型 `defaults` 创建完整设置；
2. 自定义音色和收藏列表跨模型保留；
3. 当前模型不支持的可见控制回到该 family 默认值；
4. 数值越界时 clamp，非法枚举回退；
5. 写入 `{ modelId, output, extra.audioAuthoring }` 的同一次 `updateNode` mutation。

默认 Seed 状态为 `zh / 24k / wav`，默认 voice 为 `voice-girl`，速度 `1`、音高 `0`、音量 `1`，
音乐时长 `30` 秒。

## 4. 模型族 UI 映射

| family | 可见参数 |
|---|---|
| `multimodal` | 语言、采样率、输出格式；文字/音频参考 |
| `tts-minimax` | 音色、停顿、21 个语气词、速度/声调/音量、效果音高/强度/音色、5 个音效 |
| `tts-eleven` | 音色、稳定性 `lively/natural/steady` |
| `music-eleven` | 描述文本、30/60/120 秒时长 |
| `music-mureka` | 描述/歌词模式、描述模式纯乐器开关、30/60/120 秒时长 |

节点持久化时必须从规范化后的 `AudioAuthoringState.settings` 派生
`data.output`，而不是复用旧模型留下的 output。各 family 的精确投影如下：

| family | `data.output` / `ExecutionSpec.output` |
|---|---|
| `multimodal` | `language`、`sampleRate`、`format` |
| `tts-minimax` | `voiceId`、`speed`、`pitch`、`volume`、`effectPitch`、`effectStrength`、`timbre`、`soundEffect` |
| `tts-eleven` | `voiceId`、`stability` |
| `music-eleven` | `durationSeconds` |
| `music-mureka` 描述模式 | `durationSeconds`、`murekaMode`、`instrumental` |
| `music-mureka` 歌词模式 | `durationSeconds`、`murekaMode`；不提交隐藏的 `instrumental` |

Mureka 的 `audioCapabilities.maxCharacters` 表示描述模式上限 1,024；歌词模式由 UI 与 runtime
规则扩展到 3,000。后端如果需要完全声明两种上限，可在后续 capability 版本增加
`maxCharactersByMode`，并同步升级 runtime schema 与客户端；当前 v1 严格客户端会拒绝未声明字段，
不会静默保留或自行猜测。

## 5. TTS 标记

Minimax Speech 直接把可执行标记写入 `data.prompt`：

- 停顿：`<#0.25#>`、`<#0.5#>`、`<#1#>`、`<#1.5#>` 或 `0 < seconds <= 10` 的自定义值；
- 语气词：`(笑声)`、`(轻笑)`、`(咳嗽)` 等冻结的 21 项；
- 插入操作替换当前文本选择区，并把 caret 移到 token 之后；
- 可视 chip 是 prompt 的派生视图，不是第二份状态；
- 后端冻结 `ExecutionSpec.prompt` 时必须保留原始 token，不做自然语言改写。

## 6. 参考边与编译

Audio 节点只接受 text/audio 来源。Image、Video、Style 和 Effect 候选在画布选择模式中保持可见但
禁用，并返回“音频节点不接受…输入”的原因。添加/移除复用
`POST /api/canvases/{canvasId}`：

```json
{
  "expectedRevision": 7,
  "label": "选择画布参考",
  "mutations": [
    {
      "op": "addEdge",
      "edge": {
        "id": "edge_text_audio_contract",
        "source": "node_text_contract",
        "target": "node_audio_contract",
        "createdAt": "2026-09-03T12:00:00.000Z"
      }
    }
  ]
}
```

编译器按入边顺序解析输入：Text 来源读取非空 prompt；Audio 来源只在已有 Artifact 时写入其本地
URL。Audio 节点自身 prompt 与上游 Text 使用换行合并为 `ExecutionSpec.prompt`。自连、重复边、
闭环和媒体不兼容由共享 DAG mutation 层拒绝。编译时再次严格读取并规范化
`extra.audioAuthoring`，再按上表派生和冻结 `ExecutionSpec.output`；即使节点中残留旧模型或手工
写入的 `data.output`，也不会进入不可变 Job/provider 快照。

## 7. 音色目录、收藏与本地克隆

公开音色目录是确定性 fixture：总数 327、每页 20、共 17 页，首屏名称和标签固定。当前版本在
浏览器内执行搜索、分页与组合过滤；它不引入一个运行时不存在的临时 endpoint。未来后端可在
不改变 `AudioAuthoringState` 的前提下把目录替换为分页资源。

```ts
type AudioVoice = {
  id: string
  name: string
  language: string
  accent: string
  gender: '男' | '女' | '中性' | 'Character'
  age: '儿童' | '青年' | '成年' | '老年'
  tags: string[]
  source: 'custom'
  createdAt: string              // ISO 8601
}
```

- `favoriteVoiceIds` 保存收藏后的稳定且唯一的 voice ID；重复 ID 在 runtime 边界被拒绝；目录项详情仍由目录提供；
- `customVoices` 保存本地克隆的最小可重放 metadata；不存原始录音二进制；
- `settings.voiceId` 可以指向公开音色或 `customVoices`；删除自定义音色前必须先处理当前选择；
- 试听固定读取 `/fixtures/libtv/media/compositor-bed.wav`，不会访问远程 URL；
- 本地克隆只有“有录音结果 + 非空名称 + 明示勾选授权”三项同时满足时才生成；
- 当前模拟录音不会调用 `getUserMedia`。真实后端应通过 Assets 上传录音、异步 Job 生成 voice ID，
  再用 Canvas mutation 写回 `customVoices`，而不是把临时上传 URL 或凭证写入文档。

## 8. Canvas mutation 样本

完整更新请求：
[`canvas-audio-authoring-update-request.json`](examples/canvas-audio-authoring-update-request.json)。
它展示 Minimax 模型、TTS token、该模型族完整执行输出、自定义音色、收藏与完整 v1 状态的一次原子写入。

对应响应：
[`canvas-audio-authoring-update-response.json`](examples/canvas-audio-authoring-update-response.json)。
响应始终返回递增 `revision` 与完整 `WorkflowDocument`，客户端用它替换本地已确认版本。嵌套
`data` 是替换语义，因此提交时必须保留 prompt/model/output/references/artifacts/jobId 和其他
`extra` 字段。

## 9. 生成、确认与 Artifact

Audio 与 Image/Video 使用同一 Job API：

1. `POST /api/jobs` 只接收 `{ canvasId, nodeId }`，编译并冻结 `ExecutionSpec + Quote`；
   Audio 编译器只从严格解析、规范化后的 authoring state 派生 family-specific output，忽略节点中
   可能过期的 `data.output`；
2. 返回 `awaiting_confirmation`，不扣积分；
3. `POST /api/jobs/{jobId}` 发送 `{ "action": "confirm" }` 后预留积分并进入 queued/running；
4. `GET /api/jobs/{jobId}` 轮询；成功响应携带最新 document/revision；
5. 本地 provider 生成稳定 WAV 与封面，Artifact 写回 Audio 节点并投影到 Storyboard Audio 列；
6. Storyboard 详情复用同一 Artifact URL 提供浏览器播放与下载。

本地媒体 URL 必须位于 `/api/media/` 或 `/fixtures/libtv/`。组件不读取官网登录凭证，也不会从
Canvas 文档恢复 cookie/token。

## 10. 读取、迁移和错误规则

刷新恢复顺序：

1. 获取 Canvas 文档与模型目录版本；
2. 根据 `modelId` 查找 `AudioModelCapabilities`；
3. 严格解析 `extra.audioAuthoring.schemaVersion === 1`；
4. 合法 v1 状态执行数值 clamp 与 family defaults；
5. 缺失、未知版本或结构错误时回退该模型完整 defaults，不部分信任残缺对象；
6. 根据入边恢复参考卡，根据 Artifact 恢复播放器；
7. 无效收藏 ID 会被丢弃；合法自定义音色 metadata 保留；当前 `voiceId` 缺失时 UI 回退到
   该模型族的确定性默认音色。

| 情况 | 行为 |
|---|---|
| prompt 为空且无可执行媒体输入 | Job 创建返回 `400` |
| modelId 不存在 | `400`，未知模型 |
| revision 过期 | `409`，拉取最新文档并最多重放一次 |
| Audio 状态 enum/range/version 非法 | runtime schema 拒绝；读取端回退 defaults |
| 余额不足 | 确认门禁用，不提交 provider |
| 任务失败/取消 | Artifact 不写回；按 Job 状态机释放预留积分 |

OpenAPI 对应 schema：`AudioSettings`、`AudioVoice`、`AudioAuthoringState`、
`AudioModelCapabilities`。运行时 Zod 位于 `src/contracts/audio.ts`，Canvas 边界从
`src/contracts/local.ts` 复用同一 schema，模型响应边界从 `src/contracts/models.ts` 复用，避免
文档与运行时对同一字段产生两套规则。
