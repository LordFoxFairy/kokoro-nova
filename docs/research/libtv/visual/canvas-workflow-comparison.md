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

## 确定性截图素材

本地有内容 scenario 用原创的雨夜霓虹城市画面代替官网登录项目中的私有角色图，并使用
与实际文件一致的 <code>1280×720</code> 元数据。本地 MP4 为 H.264、10 秒，故事板和
工作流复用同一份 artifact，保证截图可重放且不需要外网。

## 保留差异与后续边界

| 差异 | 原因 | 后续验收 |
|---|---|---|
| 基线内容是 4 节点/3 条边，官网证据项目曾显示 7 节点/1 条边 | 本地 scenario 固定“故事→首帧→视频→合成”的可回放业务链，不复制私有项目数据。 | 节点目录专项为每一节点类型增加独立成功/空/失败基线。 |
| 项目名、积分数和头像是 fixture 值 | 只复制布局与状态，不携带真实账户识别信息。 | 保持确定性，不做像素级文案伪装。 |
| 模型选择器、条件参数和媒体详情工具未全部做完当前官网状态 | 这些是下一批次，不属于本次共享 shell 里程碑。 | 按图片/视频/音频/脚本模型目录分别增加依赖参数和状态 E2E。 |
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
Agent proposal、双击新建和图片衍生工具。
