# TV Show 浏览与复制流程

## 已观察公开链路

1. 游客进入 TV Show 目录，使用分类或搜索浏览作品卡。
2. 打开详情，查看作者/等级、标题、更新时间和 AI 内容标识。
3. “立即观看”进入沉浸式媒体播放；默认循环，控制条提供播放/暂停、进度、倍速、清晰度、音量和全屏。
4. “查看制作过程”在当前详情上打开覆盖式只读画布。
5. 工作流视图展示节点、分组、连线、小地图、缩放和离群节点定位。
6. 故事板按音频、文本、图片、视频展示公开素材及媒体元数据。
7. 点击“复制项目”时保留只读背景并打开统一登录层。

对应截图统一在 [TV Show 页面文档](../pages/showcase/README.md)。

## 目标复制语义

1. 登录成功后恢复 `cloneProject` intent，并重新读取 source snapshot 状态。
2. 检查 PublishedProjectSnapshot 是否公开、未下架且允许复制。
3. 用户选择目标 workspace/文件夹；精确 UI 待观察。
4. 服务端创建 CloneProjectCommand，记录 source snapshot version 和幂等键。
5. 创建新的私有 Project/Canvas/WorkflowDocument，不给 source project 写权限。
6. 对公开 Asset 建安全引用；必须私有化或缺失的素材执行复制/替换/剔除策略。
7. 模型、Skill、节点类型或主体/音色不可用时，创建后明确标记 stale/missing，
   不能静默换模型产生不同结果。
8. 完成后进入新项目，并保留来源 attribution；失败可重试且不产生重复副本。

## 发布反向流程

作者侧尚待站内验证，建议验收链路为：

```text
Project revision -> 发布配置 -> 素材/版权/合规检查
-> 冻结 PublishedProjectSnapshot -> 审核
-> Published -> 更新版本 | 下架 | 删除
```

ShowcaseEntry 的统计、分类和推荐可更新，但已发布 snapshot 不应随工作中项目
静默变化。更新作品应生成新 snapshot version，并保留历史审计。

## 本地样本已覆盖

- `/api/showcase` 提供独立的 `ShowcaseEntry` discovery projection，不把作者、统计或播放器状态写入冻结快照。
- `/api/showcase/:snapshotId` 返回详情媒体、作者/互动元数据和相邻作品带；媒体源只使用 `public/fixtures/libtv` 或 `/api/media` 本地 fixture。
- 详情页的“喜欢”保留作品上下文并打开登录门；“分享”写入本地当前 URL 的剪贴板（不可用时仍给出确定性反馈）。
- 播放器清晰度菜单固定为自动、480p 流畅、720p 高清与由源媒体元数据推导的原画质标签；公开制作过程仍复用冻结 snapshot 的 Workflow/Storyboard 只读投影。

## 待采集验收态

- 播放器加载、播放、暂停、清晰度、字幕、音量、全屏和媒体错误。
- 喜欢/收藏/分享成功与未登录门槛。
- 已登录复制确认、workspace 选择、素材说明、进度、成功和失败。
- 不可复制、已下架、审核中、资源失效和节点/模型不兼容。
- 作者发布配置、公开制作过程开关、审核、更新和下架。
