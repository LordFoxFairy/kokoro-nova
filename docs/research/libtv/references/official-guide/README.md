# 官方《LibTV 使用指南》视觉索引

来源：<https://resonate.feishu.cn/wiki/Loxfw6XHziYRk0kKzdjcFfp9nhb>

采集日期：2026-07-21。该文档持续更新，截图反映采集时内容。若指南与当前 Web UI 冲突，以当前站内实测为产品行为基准，并把差异记为版本漂移。

## 总览与基础节点

| 主题 | 截图 |
| --- | --- |
| 指南与最新功能 | [guide-overview-and-latest-features.png](screenshots/guide-overview-and-latest-features.png) |
| 文本节点 | [text-node-purpose-and-generator.png](screenshots/text-node-purpose-and-generator.png) |
| 图片节点 | [image-node-purpose-and-generator.png](screenshots/image-node-purpose-and-generator.png) |
| 视频节点 | [video-node-purpose-and-generator.png](screenshots/video-node-purpose-and-generator.png) |
| 音频节点 | [audio-node-purpose-and-generator.png](screenshots/audio-node-purpose-and-generator.png) |
| 脚本节点 v2 | [script-node-v2-end-to-end-pipeline.png](screenshots/script-node-v2-end-to-end-pipeline.png) |
| 常用节点操作 | [common-node-operations-assets-copy-duplicate.png](screenshots/common-node-operations-assets-copy-duplicate.png) |
| 工作流操作 | [workflow-grouping-and-save-operations.png](screenshots/workflow-grouping-and-save-operations.png) |
| 指南中的旧版左栏 | [canvas-left-sidebar-documented-five-functions.png](screenshots/canvas-left-sidebar-documented-five-functions.png) |

脚本节点 v2 的官方流程：剧本拆解 -> 角色/场景/道具资产提取 -> 分镜调整 -> 提示词合成 -> 批量生图 -> 批量生成视频片段。

## Slash 预设与叙事工具

| 主题 | 截图 |
| --- | --- |
| 入口与预设面板 | [slash-entry-and-preset-panel.png](screenshots/slash-entry-and-preset-panel.png) |
| 多机位九宫格 | [slash-multi-camera-nine-grid.png](screenshots/slash-multi-camera-nine-grid.png) |
| 剧情推演四宫格 | [slash-story-progression-four-grid.png](screenshots/slash-story-progression-four-grid.png) |
| 25 宫格连贯分镜 | [slash-coherent-storyboard-25-grid.png](screenshots/slash-coherent-storyboard-25-grid.png) |
| 电影级光影矫正 | [slash-cinematic-lighting-correction.png](screenshots/slash-cinematic-lighting-correction.png) |
| 角色三视图 | [slash-character-three-view.png](screenshots/slash-character-three-view.png) |
| 画面推演 3 秒后 | [slash-scene-progression-three-seconds.png](screenshots/slash-scene-progression-three-seconds.png) |
| 故事板 | [slash-storyboard-10-15-second-breakdown.png](screenshots/slash-storyboard-10-15-second-breakdown.png) |
| 调度故事板 | [slash-directed-storyboard-blocking-camera.png](screenshots/slash-directed-storyboard-blocking-camera.png) |
| 人像质感调节 | [slash-portrait-realism-adjustment.png](screenshots/slash-portrait-realism-adjustment.png) |
| 情绪调节 | [slash-expression-adjustment-25-emotions.png](screenshots/slash-expression-adjustment-25-emotions.png) |

普通故事板强调人物、动作、镜头和前后画面衔接；调度故事板进一步补充站位、机位、调度线和镜头衔接。两者应建模成不同模板/Skill，而不是一个布尔参数。

## 图像工具

| 主题 | 截图 |
| --- | --- |
| 720 度全景 | [image-tool-720-panorama.png](screenshots/image-tool-720-panorama.png) |
| 多角度 | [image-tool-multi-angle.png](screenshots/image-tool-multi-angle.png) |
| 打光 | [image-tool-relighting.png](screenshots/image-tool-relighting.png) |
| 九宫格 | [image-tool-nine-grid.png](screenshots/image-tool-nine-grid.png) |
| 基础编辑 | [image-tool-basic-editing.png](screenshots/image-tool-basic-editing.png) |
| 宫格切分 | [image-tool-grid-splitting.png](screenshots/image-tool-grid-splitting.png) |
| 标注 | [image-tool-annotation.png](screenshots/image-tool-annotation.png) |
| 旋转与镜像 | [image-tool-rotate-mirror.png](screenshots/image-tool-rotate-mirror.png) |
| 分镜组 | [image-tool-storyboard-group.png](screenshots/image-tool-storyboard-group.png) |

## 视频工具

| 主题 | 截图 |
| --- | --- |
| 视频高清 | [video-tool-upscale.png](screenshots/video-tool-upscale.png) |
| 视频解析 | [video-tool-analysis.png](screenshots/video-tool-analysis.png) |
| 视频剪辑 | [video-tool-trim.png](screenshots/video-tool-trim.png) |
| 多轨视频合成 | [video-tool-multitrack-composition.png](screenshots/video-tool-multitrack-composition.png) |
| 人声/背景音分离 | [video-tool-vocal-background-separation.png](screenshots/video-tool-vocal-background-separation.png) |
| 音视频分离 | [video-tool-audio-video-separation.png](screenshots/video-tool-audio-video-separation.png) |

官方更新公告还记录了视频区域标记加文字指令的二次编辑、字幕擦除、首尾帧截取、变速和最长 20 分钟合成；需要在当前 Web 节点内继续核实。

## 音频工具

| 主题 | 截图 |
| --- | --- |
| 音频截取 | [audio-tool-trim.png](screenshots/audio-tool-trim.png) |
| 音频变速 | [audio-tool-speed.png](screenshots/audio-tool-speed.png) |

- 截取在音频波形上选择区间，并把保留段产出为新的音频节点。
- 变速在节点顶部工具栏进入，使用快/慢滑杆调整后同样产生新节点。
- 两种操作都保留源音频节点，符合非破坏编辑和结果可追溯原则。

## 图像与视频生成器

| 主题 | 截图 |
| --- | --- |
| 风格库 | [image-generator-style.png](screenshots/image-generator-style.png) |
| 焦点编辑 | [image-generator-focus-edit.png](screenshots/image-generator-focus-edit.png) |
| 镜头聚焦 | [image-generator-lens-focus.png](screenshots/image-generator-lens-focus.png) |
| 摄像机控制 | [image-generator-camera-control.png](screenshots/image-generator-camera-control.png) |
| 视频主体库 | [video-generator-subject-library.png](screenshots/video-generator-subject-library.png) |

- 风格库支持分类、关键词搜索、收藏、最近使用和模型过滤，选中后把风格模板
  注入生成器；适用模型是动态目录，不应硬编码。
- 焦点编辑进入沉浸模式，从画布的一张或多张图片识别并框选元素，再把元素
  名称标签和补充提示词带回生成器。
- 镜头聚焦针对单图框选细节或分镜，自带写实意图推理，并可追加表情、动作、
  元素细节或拍摄角度等提示词。
- 摄像机控制面向写实图像，提供相机型号、镜头、焦距和光圈等摄影参数。
- 视频主体库用多张图片或单段视频创建角色、商品、宠物或人物主体；图片模式
  支持智能补全额外视角，之后可在支持的模型中跨次复用。

## 模型、合规与音色

| 主题 | 截图 |
| --- | --- |
| 图像模型目录 | [model-catalog-image.png](screenshots/model-catalog-image.png) |
| 视频模型目录 | [model-catalog-video.png](screenshots/model-catalog-video.png) |
| Seedance 使用须知 | [seedance-usage-notice.png](screenshots/seedance-usage-notice.png) |
| Seedance 审核标准 | [seedance-review-standards.png](screenshots/seedance-review-standards.png) |
| 两种合规校验 | [seedance-two-compliance-checks.png](screenshots/seedance-two-compliance-checks.png) |
| Seedance 提示词优化 | [seedance-prompt-optimization.png](screenshots/seedance-prompt-optimization.png) |
| 视频模型能力矩阵 | [model-capability-video-matrix.png](screenshots/model-capability-video-matrix.png) |
| 语言模型目录 | [model-catalog-language.png](screenshots/model-catalog-language.png) |
| 音频模型目录 | [model-catalog-audio.png](screenshots/model-catalog-audio.png) |
| 音色克隆 | [audio-voice-cloning.png](screenshots/audio-voice-cloning.png) |
| 声音模型能力矩阵 | [model-capability-audio-matrix.png](screenshots/model-capability-audio-matrix.png) |

- 模型目录按媒体类型分段，模型名称、会员限制、并发和单价均是动态数据。
- Seedance 真人素材存在审核边界；官方示例列出原创个人/原创影视角色素材，
  同时提示版权内容、明星和公众人物受严格限制。
- 合规提供“单素材校验”和另一条组合素材流程；通过后素材带专属标识。实际
  失败提示、有效期和积分处理仍需登录态验证。
- 提示词优化把自然语言重写为模型更易执行的结构化指令，应建模为显式预处理
  步骤并保留原始输入，不能静默覆盖。
- 音色克隆由录制样本创建可持续复用的“我的音色”，入口位于音频节点的
  Minimax Speech 高级设置；授权、审核、样本时长和删除语义仍待验证。

## 快捷键

截图：[canvas-global-keyboard-shortcuts.png](screenshots/canvas-global-keyboard-shortcuts.png)

官方指南确认项目菜单可打开完整快捷键面板，Windows 与 macOS 使用不同修饰
键，并支持组合快捷键及跨画布复制时携带连线。当前站内快捷键弹层另见画布
页面，两份证据需要在实现时统一为同一命令注册表。

## 导演台

| 主题 | 截图 |
| --- | --- |
| 功能与 GPU 要求 | [director-console-overview-and-gpu-requirement.png](screenshots/director-console-overview-and-gpu-requirement.png) |
| 基础路径 | [director-console-basic-path.png](screenshots/director-console-basic-path.png) |
| 进阶用法 | [director-console-advanced-usage.png](screenshots/director-console-advanced-usage.png) |
| 使用示例 | [director-console-examples.png](screenshots/director-console-examples.png) |

导演台是轻量 3D 构图节点：用人体与几何体搭场景、多机位截图，
把构图参考交给图片/视频模型。官方提示依赖浏览器图形加速；
复刻时应把 3D 编辑状态、截图资产和生成节点分开保存。

## 已知版本漂移

- 指南左栏仍描述五项功能；当前 Web UI 已出现工具箱、角色库、快捷键等更多入口。
- 官方更新公告比正文目录更快，部分新功能尚无稳定章节。
- 模型名称、积分、会员权益和并发均为动态数据，不应从截图固化为后端常量。
