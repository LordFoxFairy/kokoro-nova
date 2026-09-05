# TV Show 作品广场

入口：官网首页下方 `TV Show`

## 页面职责

TV Show 是公开作品发现与创作复用入口。它把作品浏览、沉浸式播放、
制作过程展示和复制项目串成一条由公开内容进入私有创作空间的链路。

## 作品目录

截图：

- [catalog-categories-search-and-cards.png](screenshots/catalog-categories-search-and-cards.png)
- [catalog-category-tv-toolbox-filter.png](screenshots/catalog-category-tv-toolbox-filter.png)
- [catalog-search-query-results.png](screenshots/catalog-search-query-results.png)
- [catalog-search-no-exact-match-fallback.png](screenshots/catalog-search-no-exact-match-fallback.png)

- 顶部提供搜索和分类筛选，当前可见分类包括全部、AI 漫剧精卫计划、
  广告导演请就位、精选画布、专业影视、短剧漫剧、商业广告、动漫游戏、
  教育生活和 TV 工具箱。
- 作品以媒体卡片呈现，并同时暴露标题、作者、作者等级和浏览/互动数据。
- 目录本身无需登录，可作为公开内容分发面；登录只在进入创作动作时要求。
- 分类切换保持分类栏和搜索框，替换下方作品集合；TV 工具箱筛选态已截图。
- 搜索为显式提交而非逐字即时过滤，查询后出现清空动作，分类栏暂时隐藏。
- 输入明显不存在的验证词仍返回作品集合，没有无结果空态。现象更接近语义检索
  或推荐回退；内部算法未公开，复刻验收应保留回退行为而非声称算法一致。

## 作品详情

截图：

- [detail-author-metadata-and-actions.png](screenshots/detail-author-metadata-and-actions.png)
- [detail-like-authentication-gate.png](screenshots/detail-like-authentication-gate.png)

- 详情页使用作品媒体作为沉浸式背景，展示作者、等级、标题、更新时间和
  “含 AI 生成内容”标识。
- 核心动作是“立即观看”和“查看制作过程”，另有收藏/喜欢和分享入口。
- 页面底部保留相邻作品带，可在不返回目录的情况下连续浏览。
- 未登录点击喜欢会在详情上叠加统一登录弹层，并保留当前作品上下文；认证成功后
  应恢复原喜欢意图，而不是把用户丢回首页。

## 立即观看与播放器

截图：

- [player-controls-speed-quality-volume-fullscreen.png](screenshots/player-controls-speed-quality-volume-fullscreen.png)
- [player-paused-controls.png](screenshots/player-paused-controls.png)
- [player-quality-menu-auto-480-720-original.png](screenshots/player-quality-menu-auto-480-720-original.png)
- [player-browser-fullscreen.png](screenshots/player-browser-fullscreen.png)

- “立即观看”切换为沉浸式播放器，顶部保留返回和查看制作过程。
- 视频默认自动播放并在结束后循环，没有单独的 ended/replay 页面。
- 控制条包含播放/暂停、当前时间/总时长、可点击进度、倍速、清晰度、音量和全屏。
- 倍速按钮按 1x、1.5x、2x 循环，而不是打开下拉菜单。
- 当前样例的清晰度菜单为自动、480p 流畅、720p 高清和 834p 原画质；原画质
  标签取决于源媒体，不能固化为 834p。
- 音量按钮在当前音量与静音之间切换；全屏使用浏览器 Fullscreen API。

## 公开制作过程：工作流

截图：[public-production-process-readonly-workflow.png](screenshots/public-production-process-readonly-workflow.png)

- “查看制作过程”在详情页上打开覆盖式大画布，不离开当前作品。
- 工作流视图展示公开项目的真实节点、分组、素材缩略图和连线；样例中还
  出现了离群节点检测与逐个定位。
- 浏览者可以缩放、切换小地图和隐藏连线，但顶部明确标记只读模式。
- 公开视图把作品详情与可编辑工程隔离；复刻时不应把公开 workflow 文档
  直接当作用户有写权限的项目。

## 公开制作过程：故事板

截图：[public-production-process-readonly-storyboard.png](screenshots/public-production-process-readonly-storyboard.png)

- 故事板不是简单的时间线截图，而是按音频、文本、图片、视频归类的
  可浏览素材视图。
- 素材条目保留名称、时长、分辨率、预览和参考元素入口；只读状态下相关
  编辑动作禁用。
- 工作流与故事板消费同一份公开项目快照，但提供不同的读取投影。

## 复制项目与登录门槛

截图：[copy-project-authentication-gate.png](screenshots/copy-project-authentication-gate.png)

- “只读模式，如需创建请点击”对应“复制项目”动作。
- 未登录用户点击后，公开画布继续留在背景，前景打开统一登录弹层。
- 这说明复制并非原地解锁，而应创建属于当前用户的新项目副本；认证、
  授权和资源归属检查应在复制命令侧完成。

## 复刻语义

建议将公开内容拆为三个独立对象：

1. `ShowcaseEntry`：标题、作者、封面/播放媒体、分类、统计和发布状态。
2. `PublishedProjectSnapshot`：发布时冻结的只读 workflow、storyboard 和素材引用。
3. `CloneProjectCommand`：经认证后从快照创建新的私有项目和可写资源引用。

公开快照应版本化并与作者的工作中项目解耦。作者继续修改原项目时，已经
发布的作品不应静默变化；复制动作也不应让新用户继承作者的私有素材权限。

## 待补状态

- 已登录复制的确认、原子创建、成功弹层与打开新副本已由 `e2e/public-discovery.spec.ts` 的隔离 local fixture 验证；目标 workspace 选择、进度细节和失败重试仍待补。
- 播放器加载中、缓冲、媒体失败、字幕/多音轨和移动端控制。
- 收藏、喜欢、分享后的反馈和计数更新。
- 搜索/分类加载中、分页/无限滚动、接口失败和真正的后端空集合。
- 作者发布、审核、更新版本、下架和删除流程。
