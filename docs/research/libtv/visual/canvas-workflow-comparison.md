# LibTV Canvas / Workflow / Storyboard 视觉对比

本文固定纯前端复刻在 <code>1440×900</code> Chrome CSS viewport 下的画布里程碑。
官网登录态是产品事实来源；本地截图由确定性 scenario 重建，不读取官网 Cookie、Token 或
CDN，不保存私有项目素材。

## 基线对

| 状态 | 官网证据 | 本地基线 |
|---|---|---|
| 工作流空画布 | [<code>canvas-new-blank-success-and-starter-shortcuts.png</code>](../pages/canvas/screenshots/canvas-new-blank-success-and-starter-shortcuts.png) | [<code>libtv-canvas-empty-local-1440x900.png</code>](../../../screenshots/libtv-canvas-empty-local-1440x900.png) |
| 工作流有内容态 | [<code>canvas-authenticated-current-dark-desktop-1440x900-2026-09-03.png</code>](../pages/canvas/screenshots/canvas-authenticated-current-dark-desktop-1440x900-2026-09-03.png) | [<code>libtv-canvas-populated-local-1440x900.png</code>](../../../screenshots/libtv-canvas-populated-local-1440x900.png) |
| 添加节点菜单 | [<code>canvas-add-node-current-dark-desktop-1440x900-2026-09-03.png</code>](../pages/canvas/screenshots/canvas-add-node-current-dark-desktop-1440x900-2026-09-03.png) | [<code>libtv-canvas-add-menu-local-1440x900.png</code>](../../../screenshots/libtv-canvas-add-menu-local-1440x900.png) |
| 故事板 | [<code>storyboard-authenticated-current-dark-desktop-1440x900-2026-09-03.png</code>](../pages/canvas/screenshots/storyboard-authenticated-current-dark-desktop-1440x900-2026-09-03.png) | [<code>libtv-storyboard-local-1440x900.png</code>](../../../screenshots/libtv-storyboard-local-1440x900.png) |
| Video 节点编辑器 | [<code>video-node-default-seedance-controls-and-advanced-settings.png</code>](../pages/canvas/screenshots/video-node-default-seedance-controls-and-advanced-settings.png) | [<code>video-node-editor-dark-1440x900.png</code>](../../../screenshots/video-node-editor-dark-1440x900.png) |
| Video 模型目录 | [<code>video-node-model-catalog-with-estimated-duration.png</code>](../pages/canvas/screenshots/video-node-model-catalog-with-estimated-duration.png) | [<code>video-model-catalog-dark-1440x900.png</code>](../../../screenshots/video-model-catalog-dark-1440x900.png) |
| Audio Seed 创作器 | [<code>audio-node-default-tts-composer.png</code>](../pages/canvas/screenshots/audio-node-default-tts-composer.png) | [<code>audio-seed-editor-dark-1440x900.png</code>](../../../screenshots/audio-seed-editor-dark-1440x900.png) |
| Audio 六模型目录 | [<code>audio-node-model-catalog-speech-music-multimodal.png</code>](../pages/canvas/screenshots/audio-node-model-catalog-speech-music-multimodal.png) | [<code>audio-model-catalog-dark-1440x900.png</code>](../../../screenshots/audio-model-catalog-dark-1440x900.png) |
| Minimax 高级参数 | [<code>audio-node-default-tts-controls-and-voice-effects.png</code>](../pages/canvas/screenshots/audio-node-default-tts-controls-and-voice-effects.png) | [<code>audio-minimax-advanced-dark-1440x900.png</code>](../../../screenshots/audio-minimax-advanced-dark-1440x900.png) |
| Audio 音色库 | [<code>audio-node-voice-library-tabs-clone-filter-and-pagination.png</code>](../pages/canvas/screenshots/audio-node-voice-library-tabs-clone-filter-and-pagination.png) | [<code>audio-voice-library-1440x900.png</code>](../../../screenshots/audio-voice-library-1440x900.png) |
| Audio 音色克隆 | [<code>audio-node-voice-cloning-consent-and-recording-flow.png</code>](../pages/canvas/screenshots/audio-node-voice-cloning-consent-and-recording-flow.png) | [<code>audio-voice-clone-1440x900.png</code>](../../../screenshots/audio-voice-clone-1440x900.png) |
| Mureka 音乐模式 | [<code>audio-node-model-catalog-speech-music-multimodal.png</code>](../pages/canvas/screenshots/audio-node-model-catalog-speech-music-multimodal.png) | [<code>audio-mureka-editor-dark-1440x900.png</code>](../../../screenshots/audio-mureka-editor-dark-1440x900.png) |

> 当前官网截图由应用内浏览器保存，宿主合成层对页面内容有放大与右侧裁切。所以配色、
> 密度和层级以当前深色图为准，几何同时使用官网 DOM 实测与未裁切的
> <code>*-hires.png</code> 交叉校验。

## 已对齐几何

| 区域 | 本地实测契约 | 结论 |
|---|---|---|
| 顶部身份组 | <code>x=16</code>, <code>y=16</code>, <code>h=32</code> | 项目、画布和工作流/故事板切换与当前官网同一行。 |
| 右上操作组 | <code>y=16</code>, <code>h=32</code>, <code>right=1424</code> | 顺序为分享、积分超市、会员权益、积分、账户、Agent。 |
| 底部主工具条 | <code>y=840</code>, <code>h=48</code>, <code>bottom=888</code>, <code>centerX=720</code> | 固定在画布底部中央，不因图节点移动。 |
| 左下状态条 | <code>x=22</code>, <code>bottom≈882</code>, <code>h=28</code> | 资产、整理、小地图、连线、吸附和缩放在同一状态轨。 |
| 故事板默认列 | <code>470 / 456 / 457px</code>, <code>gap=12</code>, <code>y=72</code> | 文本/音频共享左轨，图片和视频均分余下宽度。 |
| Agent 停靠 | <code>w=340</code>, <code>right=1440</code> | 主编辑区收缩到 <code>1100px</code>，列重排而不被覆盖。 |
| 剪辑入口 | <code>56×56</code>, <code>right/bottom=20</code> | 圆形入口固定在当前可见故事板右下角；Agent 打开后随主区内缩。 |
| Audio 节点创作器 | <code>w=660±2px</code>，画布 zoom 变化后保持屏幕宽度 | 节点附着并反向缩放；高级参数向上展开，避免与底部工具条争抢点击或被视口裁切。 |

上述数值由 <code>e2e/canvas-parity.spec.ts</code> 的 bounding-box 断言锁定，不是文档中的
手工估算。

## 已对齐视觉和交互

- 编辑器独立使用 <code>#141414</code> 画布、<code>#242424</code> 浮层与白色 alpha
  字色阶，token 只作用于 <code>[data-app-shell='editor']</code>，不影响登录态首页/项目页。
- 空画布展示“双击画布 自由生成节点”和四个启动卡；首帧图生视频、音频生视频会真正创建
  两节点一条边，不是装饰按钮。
- 添加菜单以实测顺序固定：
  <code>文本 / 图片 / 视频 / 智能剪辑 Beta / 导演台 NEW / 逐帧拉片 SD 2.5 /
  音频 / 脚本 / 素材库 / 上传 / 从生成历史选择</code>；二级菜单和
  <code>Escape</code> 焦点返回已有 E2E。
- 有产物的图片/视频节点把名称和尺寸放在媒体上方，去除浅色卡片框；媒体保持主视觉，
  状态、模型、积分在底部渐变层中可用。
- 节点端口为 <code>20px</code>，默认隐藏，悬浮/选中/连线时显示；边为
  <code>1.25px</code> 冷灰贝塞尔曲线，选中态使用青色。
- 保存的 viewport 会恢复到 React Flow，底部缩放读数与实际 transform 同步；本地
  有内容基线固定为 <code>50%</code>。
- 工作流与故事板仍是同一个 <code>WorkflowDocument</code> 的两种投影；切换前后
  revision 和 document 逐字段一致。
- 图片/视频列可展开与恢复，视频保留 <code>全部 / 成片 / 片段</code> 筛选；剪辑入口
  可打开本地 Clip Editor，<code>Escape</code> 可关闭。
- Video 编辑器挂在节点底部，以画布 zoom 的倒数缩放，在 <code>33% / 50% / 100%</code>
  下均保持 <code>660±2px</code> 屏幕宽度；36 项模型目录、输入依赖、输出联动和
  Storyboard 复用详见
  [<code>video-model-editor-comparison.md</code>](video-model-editor-comparison.md)。
- Audio 编辑器复用同一 660px 逆缩放边界；六模型目录以 capability 切换 Seed、Minimax、
  Eleven Speech、Eleven Music 与 Mureka 控件，参数弹层在 1440×900 内完整可见。
- 打开 Image、Video 或 Audio 节点创作器会退出批量画布选择态；节点保持官网证据中的灰色边框，
  避免受控 ReactFlow 在双击首帧产生随机青色高亮。
- Audio 音色库使用 960×760 浅色模态层，固定三标签、20 条首屏、327 条/17 页语义；筛选
  与克隆是独立顶层，Escape 每次只关闭最上层。
- Audio 参考选择沿用蓝色全画布候选覆盖层，只允许 text/audio；进入选择态时 edge hit-area
  关闭 pointer events，避免曲线吞掉候选点击，退出后恢复普通边交互。
- Audio Job 仍走报价确认门与本地 provider，成功后真实 WAV 同时出现在节点播放器、
  Storyboard Audio 列和媒体详情下载入口。

## 确定性截图素材

本地有内容 scenario 用原创的雨夜霓虹城市画面代替官网登录项目中的私有角色图，并使用
与实际文件一致的 <code>1280×720</code> 元数据。本地 MP4 为 H.264、15 秒，故事板和
工作流复用同一份 artifact，保证截图可重放且不需要外网。

## 保留差异与后续边界

| 差异 | 原因 | 后续验收 |
|---|---|---|
| 基线内容是 4 节点/3 条边，官网证据项目曾显示 7 节点/1 条边 | 本地 scenario 固定“故事→首帧→视频→合成”的可回放业务链，不复制私有项目数据。 | 节点目录专项为每一节点类型增加独立成功/空/失败基线。 |
| 项目名、积分数和头像是 fixture 值 | 只复制布局与状态，不携带真实账户识别信息。 | 保持确定性，不做像素级文案伪装。 |
| Text 模型目录仍未达到 Video/Image/Audio 专项的能力粒度 | Video、Image 与 Audio 已完成版本化目录、条件参数和节点创作器；Text 仍使用通用 drawer。 | 为 Text/Script 分别增加模型目录、成功/失败状态与视觉 E2E。 |
| Clip Editor 已可用，但未达到官网完整时间线的视觉和交互密度 | 本次只验收故事板入口、空时间线和已有 mock 合成链路不回归。 | 独立 Video 专项覆盖素材拖放、裁切、分割、变速、转场、字幕、音轨、预览和导出。 |
| 系统字体的中文 glyph 可因 macOS/浏览器版本有小幅度量差 | 本地不引入未授权官网字体文件。 | 最终交付在固定 Chrome/macOS 基线上做视觉 diff。 |

## 自动化证据

<code>e2e/canvas-parity.spec.ts</code> 覆盖：

1. 空画布顶部/底部几何、深色背景、四个启动卡和可访问名称；
2. 添加菜单精确顺序、badge、二级菜单、<code>Escape</code> 和焦点恢复；
3. 两个启动工作流的真实节点/边创建；
4. 有内容画布的 <code>50%</code> viewport、媒体标题/尺寸、透明媒体 shell、
   <code>20px</code> 端口、<code>1.25px</code> 贝塞尔边和选中态；
5. 故事板文档同一性、默认/展开/Agent 几何、剪辑入口与键盘关闭。

工作流回归另由 <code>e2e/workflow.spec.ts</code> 覆盖连线、生成确认、分组、工具箱、
Agent proposal、双击新建和图片衍生工具；<code>e2e/audio-editor.spec.ts</code> 另覆盖六模型、TTS 标记、音色库/克隆、参考边、本地 WAV 生成和六张视觉基线。
