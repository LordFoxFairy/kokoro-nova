# Clip Editor / Video Compositor 证据审计

- 审计日期：2026-09-05
- 范围：`src/components/storyboard/ClipEditor.tsx`、`src/domain/composite.ts`、`src/contracts/compose.ts`、`src/server/compose.ts`、相关 canvas/storyboard projection、local fixture 与 `e2e/video-compositor.spec.ts` / `e2e/compositor-reliability.spec.ts`。
- 官网事实来源：`docs/research/libtv/pages/canvas/README.md` 的已保存官网登录态截图说明，以及 `docs/research/libtv/visual/canvas-workflow-comparison.md`。没有把本地路由、local ffmpeg、fixture 或测试拦截当作官网 API/行为的证据。
- 判定词：**直接验证** = 已登录官网 UI/截图直接可见；**local mock 验证** = 源码、fixture、测试或本地实际渲染可重复证明；**官网未证实** = 当前证据没有观察到真实官网有效输入、失败或网络契约；**缺口** = 完整时间线目标仍缺实现、状态证据或视觉验收。

## 1. 事实边界

官网已保存证据直接覆盖的是故事板中的剪辑入口与空编辑态，而不是一段成功合成后的完整剪辑会话。官网当前账户没有为有效片段、独立音轨或成片导出继续触发付费/生成路径；`video-compositor-comparison.md` 也明确把“有效片段时间线”和“片段裁切与检查器”标为本地基线、官网待实测。因此下列 local 能力属于可复现前端契约，不应升级为“已还原官网真实执行行为”或“已捕获官网 API”。

`ClipEditor` 的持久化入口是同一 `WorkflowDocument` 中 `videoComposite.data.extra.composite` 的 v1 文档；旧 `timeline/transitions/subtitles` 只在读取边界迁移。local 合成 HTTP 契约为 `POST /api/compose` 与 `GET|POST /api/compose/{taskId}`，使用 Zod `ComposeRequest` / `ComposeTask`，并由本地任务文件、受限本地媒体目录和 ffmpeg 驱动。这是未来后端的交接契约，不是从 LibTV 官网网络请求推导出的真实端点。

## 2. 已直接验证的官网 UI / 状态证据

| 范围 | 直接可见证据 | 已确认结论 | 证据位置 |
| --- | --- | --- | --- |
| 画布中的故事板入口 | 同一项目可在 `工作流` / `故事板` 间切换，且不离开当前项目 | 剪辑属于画布/故事板工作区上下文，而非首页独立页面 | `pages/canvas/2026-09-04-live-project-readonly.md`；`pages/canvas/README.md` |
| 故事板投影 | 音频、文本、图片、视频按同一画布内容投影；视频列有 `全部 / 成片 / 片段` | 剪辑输入应来自当前工作流的媒体投影；视频筛选与任务状态是不同维度 | `pages/canvas/README.md` “故事板视图与媒体详情” |
| 进入编辑器 | “剪辑”进入内嵌视频合成器，打开详情时不会自动把当前视频放进时间线 | 编辑器有独立的空时间线初始状态，不可把“打开详情”推导为“自动添加片段” | `storyboard-video-editor-empty-timeline-controls.png`、`pages/canvas/README.md` |
| 空时间线动作门槛 | 空态下裁切、分割、速度动作 disabled | “无可编辑片段”是明确状态，关键剪辑动作不是隐藏 | 同上 |
| 转场空选择态 | 转场库可见淡入淡出、黑场、白场；未选片段时属性和删除 disabled | 三种转场名称、未选择门槛和禁用投影已直接观察到 | `storyboard-video-editor-transition-library-and-properties.png`、`pages/canvas/README.md` |
| 字幕空态 | 字幕/文本为独立面板和时间线轨道；可见搜索和新建字幕入口 | 字幕不是视频卡详情里的单一字段，而是编辑器的独立轨道/工具状态 | `storyboard-video-editor-subtitle-panel-empty-state.png`、`pages/canvas/README.md` |
| 导出空态 | 导出目标为本地或画布；空时间线时两项 disabled | 导出目标和空内容门槛已观察到；尚未观察可用后的结果 | `storyboard-video-editor-export-local-or-canvas-disabled.png`、`pages/canvas/README.md` |
| 外层视觉关系 | 深色全屏画布、Storyboard 列和右侧编辑工作区的层级可从截图/对比文档观察 | 组件必须保持 Storyboard 内嵌工作区语义，不应改为居中 modal | `visual/canvas-workflow-comparison.md`、`visual/video-compositor-comparison.md` |

### 直接证据尚未覆盖的细节

上述截图确认了可见控件、禁用态与层级，不足以确认精确 CSS 数值、实际请求、长时间线滚动规则、键盘快捷键、媒体同步、渲染器、产物归属或错误文案。`canvas-workflow-comparison.md` 中 `33.38%` 素材列、约 `255px` 时间线高度等数值是本地视觉/几何契约，不应标记为官网 DOM 实测，除非后续原始 DOM 记录明确给出对应编辑器元素。

## 3. 已由 local mock / 源码 / 自动化验证的能力

| 能力或状态 | 当前 local 契约 | 验证锚点 | 官网证据等级 |
| --- | --- | --- | --- |
| 嵌入式编辑器与焦点收拢 | Storyboard 中以 source rail + workspace 展开；不是 dialog；`Escape` 依次关闭导出菜单、工具面板、编辑器并回到剪辑入口 | `e2e/video-compositor.spec.ts` 空态用例；`ClipEditor` 的键盘处理 | 层级直接可见；焦点顺序未证实 |
| 数据模型与迁移 | `extra.composite` v1 存 clips、audioTracks、subtitles、playhead、zoom、sourceAudioMuted；旧三数组迁移、边界修复 | `src/domain/composite.ts`；`src/domain/__tests__/composite.test.ts` | 未证实 |
| 视频素材选择 | 仅当前文档中本地、有效时长的 video 可加入；`videoComposite` 成片不能回灌为输入；按钮与 HTML5 drag/drop 都可添加 | `collectSources` / `isComposableMediaSource`；`e2e/video-compositor.spec.ts` | 入口/空态直接可见；有效输入未证实 |
| 片段编辑 | 选中、删除、拖拽重排、按钮重排、入/出点、拖拽裁切、键盘微调、播放头分割、0.5×/1×/2× UI 变速 | `ClipEditor.tsx`；video compositor E2E 的 persistence/trim 场景 | 未证实 |
| 时间线状态 | 播放头定位、原生 video 同步、空格播放/暂停、回到开始、缩放、适配、全屏请求；分割合法性和即时反馈 | `ClipEditor.tsx`；`compositor-reliability.spec.ts` | 未证实 |
| 历史与刷新 | 编辑通过画布 mutation 递增 revision；undo/redo 后有反馈；关闭、重开和刷新恢复选择前的持久化时间线 | compositor E2E persistence；reliability E2E undo/redo/reload | 未证实 |
| 转场 | 每个前片段保存 `fade` / `to-black` / `to-white` 和 `0.08..2s` duration，影响有效总时长和规范化渲染请求 | `setTransition` / `effectiveTransitionDuration`；E2E transition scene | 名称/未选禁用直接可见；应用与成片未证实 |
| 字幕 | 字幕/文本 tab、搜索、创建、编辑、显隐、删除、独立轨道和预览叠加；导出只发送文本与时间段 | `createSubtitle*`；ClipEditor subtitle panel；E2E persistence | 面板/轨道/搜索/新建直接可见；编辑/导出未证实 |
| 独立音轨 | audio 素材可加入独立轨道，拥有入/出点、时间线 start、`0..2` gain、mute 与持久化；视频源音频可逐片段静音 | `appendAudioTrack` / `setAudioTrack*`；audio E2E 用例 | 未证实 |
| 合成请求 | `ComposeRequest` 仅接收规范化 clips/audioTracks/subtitles；不接收 canvasId、nodeId、destination；服务端重新解析 | `src/contracts/compose.ts`；`docs/api/COMPOSE_LIFECYCLE.md`；contract tests | 未证实，且明确是 local API |
| 本地任务状态机 | `queued → rendering → succeeded | failed | cancelled`；失败可原 task id retry，取消不改时间线；刷新恢复活动/失败 task | `src/server/compose.ts`；compose server tests；reliability E2E | 未证实 |
| 输出与隔离 | 成功 local 渲染登记一个 Asset/Artifact；“添加到画布”创建 video 节点；本地下载与画布导出复用请求；fixture 仅从 `/api/media/` / `MEDIA_DIR` 读取 | compositor E2E export/real MP4；server compose tests；`src/server/store.ts` | 导出目标直接可见；成功/失败/产物未证实 |
| 1440×900 回归 | 空态、转场、字幕、有效时间线、裁切五张 compositor 截图基线；画布/故事板另有基线 | `e2e/video-compositor.spec.ts-snapshots/`；`visual/video-compositor-comparison.md` | 仅空态三组与导出门槛有官网配对 |
| 响应式与可访问性 | 800px 宽度改为上下堆叠；trim handle 为 slider，播放头有数值和键盘支持 | compositor E2E compact/trim 场景；ClipEditor unit tests | 未证实 |

## 4. 官网未证实、不得写入“真实 LibTV 契约”的项目

1. **网络与任务接口**：`/api/compose*`、`ComposeRequest` 字段、task ID、HTTP 状态、轮询频率、localStorage 恢复键与错误 envelope 全为本地后端交接设计；没有官网 payload 证据。
2. **有效片段操作**：素材拖入、选中、裁切、分割、变速、重排、删除、播放头/预览同步、缩放、适配、全屏、Undo/Redo 的成功行为均未在官网有效素材上完成观察。
3. **合成语义**：ffmpeg 的裁切、转场重叠、音频混音、补静音、字幕 burn-in 或 `mov_text` 降级、20 分钟/40 视频/16 音轨/100 字幕上限是 local renderer 约束，不能当作官网限制。
4. **音频轨能力**：独立音轨、音量范围、静音、时间线位置和源音频开关没有官网有效输入证据。
5. **字幕细节**：字幕文本持久化、显示切换、编辑、时间区间、预览 overlay、预设文本 tab、导出形态未被官网截图证明；当前直接证据只到面板/轨道/搜索/新建入口。
6. **可用导出与产物归属**：官网仅直接显示“本地/画布”及空态禁用，未证实启用条件、生成任务、是否创建资产/节点、下载格式、失败与重试。
7. **精确编辑器几何和视觉微细节**：source rail 宽度、timeline 高度、卡片密度、色值、timeline scale、控件图标、响应式折叠阈值与可访问性名称大多是本地实现/回归基线，尚非完整官网 DOM 采样。

## 5. 完整时间线目标仍缺的动作、状态与视觉证据

以下是相对于“完整 Video 创作与剪辑体验”的审计缺口；它们不是对当前产品代码的改动指令。每项只有在同时取得官网可见证据、local 可重放状态和 1440×900 基线后，才可从“缺口”转为已验收。

| 维度 | 当前情况 | 仍缺的可验收范围 |
| --- | --- | --- |
| 官网有效时间线 | 只直接观察空编辑态与工具入口 | 至少一条已添加片段、已选择片段、转场已应用、字幕已有内容、导出可用/终态的官网登录态只读证据；如账户状态不具备，必须保留“未证实”标签 |
| 素材生命周期 | local 有有效/无效/排除 source，但无完整导入表现证据 | 上传/生成中/可用/失败/删除或源素材丢失后的 source rail、时间线引用和恢复投影；每个状态要有不会误删既有编辑的证据 |
| 剪辑模型 | 已有顺序单视频轨 + 独立音轨 + 字幕轨 | 多轨视频层、轨道排序/锁定/显隐/命名、插入/覆盖/吸附、ripple/roll/slip 编辑、多选/框选与批量移动的状态机或明确的产品边界证据 |
| 片段属性 | 已有 in/out、speed、mute、transition | 画面 transform（裁切/位置/缩放/旋转）、不透明度、色彩/滤镜、淡入淡出、帧级/时间码精度、反向/冻结帧及其预览与导出一致性 |
| 音频 | 已有独立音轨 trim/start/gain/mute | 波形、淡入淡出、音量关键帧、声道/ducking、音画同步误差、音频缺失/解码失败和预览/导出一致性 |
| 字幕与文本 | 已有手动文本和基本时间段 | 自动识别/导入、样式/位置/动画、安全区、多语言、批量编辑、重叠冲突、文本与字幕 tab 的确切区别、烧录/外挂字幕选择及失败态 |
| 预览 | 使用单原生 `<video>` 与当前 active clip 映射 | 多轨合成预览、转场/叠字/音轨实际预览、缓冲/媒体 metadata/seek 失败、浏览器 autoplay 与全屏退出恢复；需要固定 media metadata 后截图避免竞态 |
| 导出 | local 有队列、取消、失败重试、产物登记 | 导出格式/分辨率/码率/帧率/封面/命名/范围选择、进度精度、并发/重复提交、配额/权限、下载失败、任务超时、刷新/跨会话恢复与成片去重 |
| 协作与一致性 | 单编辑器 revision、undo/redo 有 local 覆盖 | 多人或多标签页同时编辑时间线、冲突/租约/只读/恢复、撤销作用域、长时间渲染中编辑与关闭行为；需与现有 canvas presence 语义交叉验收 |
| 视觉系统 | 五张 local compositor 基线，三组空态有官网配对 | 有内容、音轨、字幕、转场、导出进行/失败/成功、长时间线溢出、窄屏、键盘焦点和错误态的官网/本地成对证据；不得用私有官网素材填充 fixture |

## 6. 下一切片验收矩阵（只读审计版）

下一切片的完成判定应以证据闭环为准，而非仅“组件能点击”。优先级仅表示审计顺序，不代表已批准的实现改动。

| ID | 切片 | 需要直接官网证据 | 需要 local 可重放场景 | 必须验证的状态 / 不变量 | 1440×900 基线 | 通过标准 |
| --- | --- | --- | --- | --- | --- | --- |
| CE-01 | 有效视频时间线事实采集 | 一段可见素材加入、选中、可编辑的只读 UI；若不可得，记录阻断和截图边界 | `empty`、`one-clip`、`two-clip` 固定 fixture | 打开不自动添加；选择只改变 UI；刷新前后同一 `composite` | empty、one selected、two clips | 不将 local 结果标作官网成功流程 |
| CE-02 | 剪辑基础动作闭环 | 任何可观察的裁切/分割/速度/删除/排序反馈 | 每种动作成功、非法边界、撤销、重做、刷新 | 时间线总时长、clip order、in/out、speed 始终规范化；失败不破坏先前文档 | selected、trim、split-invalid、reordered | 单元 + Playwright 对持久化 document 和画面同时断言 |
| CE-03 | 多轨与素材故障边界 | source rail/轨道可见规则的官网截图或明确“未证实” | video/audio valid、pending、missing、invalid、deleted source | 无效输入不可导出；素材失效不能静默改写既有片段；错误可恢复 | audio mix、missing source、empty source rail | 每一素材状态有确定 fixture、错误文案和无数据丢失断言 |
| CE-04 | 转场、字幕、预览一致性 | 已有三转场/字幕入口；补充有效内容证据或保持未证实 | applied transition、visible/hidden subtitle、preview seek | timeline 几何、预览时间、导出 request 同源；字幕边界与转场 overlap 被规范化 | transition applied、subtitle populated、preview seek | UI、persisted v1 document、normalized request 三者一致 |
| CE-05 | 合成任务与导出恢复 | 可用导出/结果若官网允许只读观察；否则只保留目标名称与空态事实 | queued/rendering/succeeded/failed/cancelled/retry/refresh | 取消不写产物；failed 复用 task id；succeeded 恰好一个产物；重复轮询不重复提交 | menu enabled、progress、failure/retry、success | route/contract/server/E2E 均验证，且 docs 标注 local-only API |
| CE-06 | 视觉与可访问性收口 | 所有已获得官网状态的截图/DOM 几何记录 | 1440×900 + compact fixture | 禁用、焦点、Escape 收拢、slider 键盘、媒体 metadata 稳定后截图 | 本矩阵中每个关键状态 | 视觉 diff 稳定复跑；没有把宿主裁切或 poster/metadata 竞态作为基线 |

## 7. 现状结论

当前 Clip Editor 已形成覆盖空态、常见单轨剪辑、独立音频、三类转场、手动字幕、持久化、local 合成任务与导出的**高覆盖 local mock 纵切**；其中空时间线、三类转场入口/禁用态、字幕/文本面板和空导出门槛有直接官网 UI 证据。它尚不是“官网完整时间线已一比一验证”：有效输入、成功/失败导出、真实 API、音频/字幕细节、多轨高级编辑、协作和完整视觉状态均缺官网事实或完整成对验收。
