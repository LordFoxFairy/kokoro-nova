# Text 生成、富文本文档与启动 Workflow 契约

本页定义画布 Text 节点的长期状态、模型目录、富文本文档、下游编译、生成产物和三个
启动 Workflow。当前仓库只运行确定性本地 mock；未来真实后端替换 transport/provider 时，
Canvas 文档、mutation、Job 和 Artifact 的语义保持不变。

## 1. 数据所有权

| 数据 | 唯一事实来源 | 说明 |
|---|---|---|
| 生成提示词 | `textNode.data.prompt` | `generator` 模式的可执行文本 |
| 手写富文本 | `textNode.data.extra.textAuthoring.document` | `document` 模式的结构化纯文本块，不保存 HTML |
| 当前模式/意图 | `textNode.data.extra.textAuthoring.mode/intent` | 控制生成器、手写卡和启动 Workflow |
| 当前模型 | `textNode.data.modelId` | 必须存在于 `GET /api/models?media=text` |
| Text 输入参考 | 指向 Text 节点的 `WorkflowDocument.edges` | 当前允许 text/image；编译时按图解析 |
| 生成结果 | `textNode.data.artifacts` | Job 成功后写回 `.txt` URL 与内联 `textContent` |
| Storyboard 文本卡 | 对同一 Canvas 文档的投影 | 不维护第二份文本内容 |

模型目录、背景弹层开关、模型搜索词、当前焦点块和复制 toast 属于组件临时状态。
`translationEnabled` 与 `expanded` 是明确的跨刷新创作偏好，因此进入版本化状态。

## 2. Text 模型目录

`GET /api/models?media=text&q=` 返回 `ModelCatalogResponse`。顺序和显示字段以当前
官网登录态目录为基线，执行能力与积分是本地规范化契约：

| modelId | 显示名 | 耗时标签 | 描述 | 本地积分 | providerModelId |
|---|---|---:|---|---:|---|
| `gvlm-3.1` | GVLM 3.1 | 20s | 多模态文本模型Pro | 6 | `aurora-3-prime` |
| `cvlm-5.5` | CVLM 5.5 | 10s | 超智能大语言模型 | 9 | `cvlm-5.5` |
| `gvlm-3.1-flash` | GVLM 3.1 Flash | 15s | 多模态文本模型lite | 3 | `aurora-3-flash` |
| `qwen-3-vl-flash` | Qwen 3 VL Flash | 10s | Qwen 3 VL Flash | 4 | `qwen-3-vl-flash` |

只有默认 GVLM 3.1 的 6 积分在本轮官网界面中直接观察到；其余积分、字符上限和 provider
映射是确定性本地 adapter 配置，不声明为官网动态计费事实。完整响应见
[`examples/models-text.response.json`](examples/models-text.response.json)。

```ts
type TextModelCapabilities = {
  family: 'multimodal' | 'language'
  maxCharacters: number
  acceptsReferences: Array<'text' | 'image'>
  providerModelId: string
  scene: 'text-generate'
  supportsTranslation: boolean
}
```

## 3. `TextAuthoringState` v1

```ts
type TextAuthoringState = {
  schemaVersion: 1
  mode: 'generator' | 'document'
  intent: 'free' | 'text2video' | 'caption' | 'text2music' | null
  document: {
    background: 'charcoal' | 'slate' | 'indigo' | 'paper' | 'sand'
    blocks: TextBlock[]             // 1..200
  }
  translationEnabled: boolean
  expanded: boolean
}

type TextBlock = {
  id: string                       // 1..100 chars；文档内归一化为唯一值
  kind:
    | 'paragraph'
    | 'heading-1'
    | 'heading-2'
    | 'heading-3'
    | 'bullet-list'
    | 'ordered-list'
    | 'divider'
  text: string                     // 所有非 divider 块合计最多 50,000 字符
  marks: Array<'bold' | 'italic'>   // 去重
}
```

默认状态是 `generator / intent:null / charcoal / 单个空 paragraph`，翻译与展开均关闭。
读取端只接受完整 v1；缺字段、未知版本或非法外形整体回退默认状态。合法但越界的导入数据会：

1. 最多保留 200 个合法块；
2. 总文本截断到 50,000 字符；
3. 重复块 ID 追加稳定序号；
4. 非法 kind、mark 和 background 回退或丢弃；
5. `divider.text` 固定为空；
6. 至少保留一个空段落。

## 4. 安全富文本边界

编辑器不把 `innerHTML` 写入 Canvas，也不在渲染时执行存储 HTML。格式只由 `kind + marks`
表达；粘贴事件读取 `text/plain`。渲染使用 React 文本节点，因此脚本、事件属性、远程图片和
富链接都不能越过 mutation 边界。

纯文本投影按块顺序工作：忽略 divider、trim 每块、丢弃空块，再以换行连接。标题、段落和
列表保留文字，不把 Markdown/HTML 标记注入下游 prompt。

## 5. UI 状态机

```text
新建 Text
  ├─ 双击 ─> generator 浮层 ─> 选模型/翻译/参考/生成
  ├─ 自己编写内容 ─> document 卡 ─> 工具栏 ─> 全屏展开
  ├─ 文生视频 ─> Text -> Video 原子组
  ├─ 图片反推提示词 ─> Image -> Text 原子组
  └─ 文字生音乐 ─> Text -> Audio 原子组
```

- 节点附着生成器屏幕宽度固定 `660±2px`，通过画布 zoom 的倒数缩放保持可读；
- 嵌套模型目录先消费 `Escape`，第二次 `Escape` 才关闭编辑器；
- 手写工具栏固定为背景、H1/H2/H3/正文、粗体、斜体、两类列表、分割线、复制和展开；
- `expanded` 与同一 document 绑定，关闭全屏不会复制或合并另一份内容；
- 手写卡关闭编辑态且为空时显示“请编写内容，开始你的创作。”；
- 双击空节点不会触发位于点击命中区下方的 starter；单击 starter 延迟到双击判定结束后执行。

## 6. 下游编译与 provider 投影

`compileNode()` 解析指向目标节点的入边。上游 Text 为 `document` 时使用结构化文档的
纯文本投影，为 `generator` 时使用 `data.prompt`。目标节点自己的 prompt 与所有上游
text 输入按顺序换行合并，随后冻结进不可变 `ExecutionSpec`。背景、marks、expanded、
translation 偏好和 authoring metadata 不进入 provider output。

官网当前 Text 节点 payload 的 adapter-facing 投影为：

```ts
type TextProviderParams = {
  action: 'text_generate' | 'text_resource'
  generatorType: 'default'
  content: string[]
  params: {
    prompt: string
    model: string
    count: 1
    scene?: 'text-generate'
    textList: string[]
    imageList: string[]
    videoList: string[]
    audioList: string[]
  }
}
```

`generator` 使用 `text_generate`、非空 `params.prompt` 和空 `content`；
`document` 使用 `text_resource`、空 prompt 和按块排列的 `content`。本地 Jobs API
不直接暴露这套官网字段；`textProviderParams()` 是未来上游 adapter 的显式边界。
`translationEnabled` 尚无 shape-confirmed 官网请求字段，当前只持久化，不虚构 provider 参数。

## 7. 三个原子启动 Workflow

每个 starter 通过一次 `POST /api/canvases/{canvasId}` 提交完整 mutation 数组；服务端
要么接受全部节点/边/组，要么全部拒绝。一次 undo 删除整个新图。

| intent | 图拓扑 | 分组名 | 冻结默认值 |
|---|---|---|---|
| `text2video` | Text → Video | `预设 - 文生视频` | Video: Seedance 2.0 Fast、16:9、720p、5s、1、静音 |
| `caption` | Image → Text | `预设 - 图片反推提示词` | Text prompt 要求主体、环境、光影、镜头语言、风格关键词 |
| `text2music` | Text → Audio | `预设 - 文字生音乐` | Audio: Mureka V8、描述模式、30s、纯音乐 |

可执行 mutation 样本：

- [文生视频](examples/canvas-text-starter-text2video.request.json)
- [图片反推提示词](examples/canvas-text-starter-caption.request.json)
- [文字生音乐](examples/canvas-text-starter-music.request.json)
- [手写文档更新](examples/canvas-text-authoring-update-request.json)

创建后客户端选择并适配新 group；选择/viewport 是 UI 行为，不增加第二次业务 mutation。

## 8. 生成、Artifact 与 Storyboard

Text 复用通用两阶段 Job：

1. `POST /api/jobs` 冻结 `ExecutionSpec + Quote`，返回 `awaiting_confirmation`；
2. `POST /api/jobs/{jobId}` 以 `{"action":"confirm"}` 确认后运行；
3. 本地 provider 根据冻结 prompt 生成确定性 UTF-8 `.txt`；
4. Artifact 同时返回 `url` 与 `textContent`；
5. runner 在同一工作流修订中写回节点；
6. Storyboard 从同一 Artifact 投影内联文本，不额外下载文件才能显示。

```ts
type TextArtifact = {
  kind: 'text'
  url: string
  thumbnailUrl: null
  width: null
  height: null
  durationSeconds: null
  modelId: string
  textContent?: string | null
}
```

`textContent` 可选以兼容历史 Artifact；新本地 Text 任务必须同时写 `.txt` 和内联内容。

## 9. 错误、迁移与真实后端交接

| 情况 | 规范行为 |
|---|---|
| 无 prompt 且没有可执行媒体输入 | Job 创建返回 `400` |
| modelId 不在 Text registry | `400`，未知模型 |
| Canvas revision 过期 | `409`，读取最新文档并最多重放一次 |
| Text v1 缺字段/未知版本 | 读取端整体回退默认状态 |
| 富文本越界 | 导入 reader 规范化；HTTP runtime schema 拒绝非法 payload |
| 余额不足 | 确认门禁用，不提交 provider |
| Job 失败/取消 | 不写 Artifact；按统一状态机释放预留积分 |

后端接入步骤：

1. 保持 `src/api/client.ts`、Canvas mutation、Jobs 和 Artifact schema；
2. 让真实 `GET /api/models?media=text` 通过同一 Zod schema；
3. 在 provider adapter 中把 `ExecutionSpec` 映射为官网/自有生成协议；
4. 认证头只由 transport 注入，Canvas 文档永不保存 token/cookie；
5. 用本页四个 examples 和场景 E2E 作为消费者契约测试；
6. 若新增流式文本，只替换 Job 进度 transport，不修改最终 Artifact 与 Storyboard 投影。

运行时实现位于 `src/contracts/text.ts`、`src/domain/text-authoring.ts`、
`src/domain/text-workflows.ts` 和 `src/domain/compile.ts`。
