# LibTV 视频合成器对比

本文固定故事板视频合成能力在 `1440×900` Chrome CSS viewport 下的官网证据、本地实现
边界与回归基线。官网观察只用于确定布局、交互和状态；本地合成只读取仓库 fixture 与
`/api/media/`，不依赖官网登录态、Cookie、远端 CDN 或真实生成服务。

## 基线对

| 状态 | 官网证据 | 本地基线 |
|---|---|---|
| 空时间线与导出门槛 | [`storyboard-video-editor-export-local-or-canvas-disabled.png`](../pages/canvas/screenshots/storyboard-video-editor-export-local-or-canvas-disabled.png) | [`libtv-video-compositor-empty-local-1440x900.png`](../../../screenshots/libtv-video-compositor-empty-local-1440x900.png) |
| 转场库与属性 | [`storyboard-video-editor-transition-library-and-properties.png`](../pages/canvas/screenshots/storyboard-video-editor-transition-library-and-properties.png) | [`libtv-video-compositor-transition-local-1440x900.png`](../../../screenshots/libtv-video-compositor-transition-local-1440x900.png) |
| 字幕面板与轨道 | [`storyboard-video-editor-subtitle-panel-empty-state.png`](../pages/canvas/screenshots/storyboard-video-editor-subtitle-panel-empty-state.png) | [`libtv-video-compositor-subtitle-local-1440x900.png`](../../../screenshots/libtv-video-compositor-subtitle-local-1440x900.png) |
| 有效片段时间线 | 官网当前账户没有生成专用素材以继续付费路径 | [`libtv-video-compositor-timeline-local-1440x900.png`](../../../screenshots/libtv-video-compositor-timeline-local-1440x900.png) |

## 几何与层级契约

- 合成器是 Storyboard 内嵌模式，不使用 dialog 或居中 modal；
- 页面保留 `33.38%` 的素材列，右侧为合成工作区；在 1440×900 下分别约为
  `x=16 / width=470` 与 `x=498 / right=1424`；
- 底部时间线距离工作区边缘 8px，高 255px；标题栏保留“视频合成”、导出下拉和关闭；
- 空时间线不会自动加入打开详情时的素材，裁切、分割、播放和导出项保持禁用；
- Escape 按导出菜单 → 当前工具面板 → 合成器顺序收拢，关闭后焦点回到“剪辑”入口。

## 持久化文档

`videoComposite.data.extra.composite` 是版本化 v1 文档，包含 `clips`、`audioTracks`、
`subtitles`、`playheadSeconds`、`zoom` 与 `sourceAudioMuted`。每个片段保存来源节点/产物、
裁切、倍速、静音和片尾转场；旧 `timeline/transitions/subtitles` 数组只在读取边界迁移，
组件始终消费强类型文档。所有编辑通过画布 mutation 增加 revision，关闭、重开与刷新后
仍可恢复；它不是 Storyboard 的第二份状态。

## 已实现交互

- 素材按钮添加或拖入；视频片段可选择、播放头定位、设置入/出点、分割、
  `0.5×/1×/2×` 变速、按钮/拖拽重排、静音和删除；
- 原生 video 预览与播放头同步，支持空格播放/暂停、回到开始、缩放、适配和全屏；
- 三种转场为淡入淡出、黑场与白场，保存在前一片段并允许调整 `0.08..2s`；
- 字幕/文本页签、搜索、新建、编辑、显隐、删除、独立轨道与预览叠加；
- 独立音轨支持裁切、时间线起点、`0..2` 增益、静音与删除；视频源音频也可逐片段静音；
- 本地或画布导出复用同一规范化请求，失败保留编辑态；成功结果登记个人资产，画布导出
  再创建视频节点。

## API 与真实本地渲染

`POST /api/compose` 的正式契约位于 [`docs/api/openapi.yaml`](../../../api/openapi.yaml)，
运行时 Zod 位于 `src/contracts/compose.ts`。服务端 ffmpeg 处理裁切、倍速、源音频同步、
无声片段补齐、独立音轨放置/混音、转场重叠、字幕烧录或 timed-text 降级，并限制最多
40 段视频、16 条音轨、100 条字幕与 20 分钟时间线。fixture 视频在初始化时复制进受
`MEDIA_DIR` 保护的本地媒体树，E2E 会实际调用 route、读取返回 MP4 并验证字节。

## 有意保留的差异

| 差异 | 原因 |
|---|---|
| 有效时间线使用原创雨夜城市素材 | 不把登录项目里的私有媒体固化进 fixture。 |
| 合成使用本机 ffmpeg | 当前是纯前端子仓库的可重复 mock；未来后端直接实现同一 OpenAPI。 |
| 字幕可能返回 `muxed` | 本机 ffmpeg 没有文字渲染能力时，用 `mov_text` 保留准确时间，不伪称已烧录。 |
| 官网有效输入/失败态仍标记待实测 | 本地实现结果不冒充官网尚未触发的网络事实。 |

## 自动化证据

`e2e/video-compositor.spec.ts` 覆盖内嵌几何、空态门槛、四张像素基线、转场与字幕面板、
片段分割/变速/拖拽重排、持久化、刷新恢复、规范化请求、画布导出以及真实本地 MP4。
领域层和服务端测试另覆盖旧文档迁移、边界修复、总时长、音频混合、转场图、字幕和
媒体 realpath 信任边界。
