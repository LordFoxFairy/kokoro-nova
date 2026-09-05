# TV Show 目录、分页与复制项目

所有 TV Show 数据均来自本地 deterministic mock：目录只消费发布快照的 discovery projection；不会读取 LibTV 线上 Cookie、Token、素材或接口。

## 目录

`GET /api/showcase?category=全部&q=&offset=0&limit=4` 返回 `ShowcaseListResponse`。`offset`/`limit` 是稳定的本地 offset pagination；`nextOffset: null` 表示目录结束。分类与搜索均随请求提交，避免逐字请求。官网观察到无精确匹配时仍展示当前分类推荐，因此 `page.searchFallback=true` 明确标注回退；后端不得把它误报为搜索命中。

目录的测试夹具是显式的：`fixture=empty` 返回空数组和 `total=0`，`fixture=error` 返回 `503`。它们只用于本地 UI 状态验证。

## 目录续页与媒体失败状态

客户端以 `page.nextOffset` 作为唯一续页输入：滚动至目录尾部时自动发出下一页请求，`加载更多`按钮是键盘和辅助技术可用的同一续页命令。客户端不得推算 offset、重复附加同一页，或在失败时替换已成功读取的条目；续页失败保留当前目录并通过重试重新请求同一个 `nextOffset`。

`ShowcaseMedia.url` 是播放器交付地址。目录 API 的成功响应不承诺浏览器媒体解码一定成功：媒体请求、解码或网络交付失败时，播放器显示本地“视频加载失败”状态，并使用相同 URL 重新挂载媒体元素重试；它不会写入公开快照，也不会改变目录或作品详情契约。

示例：[分页目录响应](examples/showcase-page.response.json)。

## 复制公开快照

`POST /api/publish/{snapshotId}/clone` 是唯一写入边界。登录态在同一个 workspace transaction 中创建私有 `project` 和初始 `canvas`，深拷贝冻结 document；公开快照、原作者项目和素材归属均不被修改。匿名状态返回 `401`，客户端保留只读公开过程与登录门上下文。

复制 UI 依次呈现确认、`正在复制…`、成功入口或可重试错误，供未来后端替换为异步任务时保持相同状态机。

示例：[复制响应](examples/showcase-clone.response.json)。

## 播放清单、缓冲与质量回退

`GET /api/showcase/{snapshotId}/playback` 返回 `ShowcasePlaybackManifest`。这是播放器唯一的
source-selection 读取边界：`variants[].url` 必须以 `/api/media/` 开头，且当前 mock 只生成
仓库已种子的本地 fixture URL；响应中不存在远端流地址、Cookie、签名或 token。

播放器先显示 `manifest-loading`，清单到达后由 `<video>` 的 `loadstart` / `waiting` / `canplay`
事件显示 `buffering` / `ready`。选择“自动”时从 `initialQuality` 开始并严格按
`fallbackOrder` 依次尝试；某个本地媒体请求或浏览器解码错误会切换到下一个变体。用户手动选择
`480p`、`720p` 或 `original` 后只尝试该变体，绝不静默改变其选择。全部候选失败时显示错误和
“重试播放”；重试从同一确定性候选顺序重新挂载媒体元素，不发起写操作，也不改变详情、目录或
公开快照。

## 本地喜欢、分享反馈与复制失败重试

`GET /api/showcase/{snapshotId}/engagement` 返回当前 deterministic fixture viewer 对该公开快照的
`liked`、投影 `likeCount`、`shareCount`、站内 `shareUrl` 与反馈文本。`POST` body 为
`{ "action": "like" | "unlike" | "share" }`，要求本地登录态；它只写入 workspace 旁的
viewer-local fixture state。`likeCount` 仅在基础公开投影上加当前 viewer 的一次喜欢，不会修改
`PublishedSnapshot` 的冻结 document、媒体、作者数据或公开目录。重置 scenario 时互动状态随 workspace
一起恢复默认值。

分享动作返回站内相对 `shareUrl`，页面随后尽力写入浏览器剪贴板并展示反馈；剪贴板不可用不会改变
已记录的本地分享反馈。未来后端将把此 projection 替换为按 subject 聚合的 interaction 数据，仍须保持
公开快照不可变。

可执行样本：匿名可读的[初始互动 projection](examples/showcase-engagement.initial.response.json)、已登录
viewer 的 [like 请求](examples/showcase-engagement.request.json) 与[喜欢后的 projection](examples/showcase-engagement.like.response.json)。
匿名 POST 稳定返回 `401`；未知或已下架的 snapshot 返回 `404`；非法 `action` 返回 `400`。这些错误均为
`ErrorResponse`，交互写入不会影响冻结公开快照。

复制公开快照失败时，确认框保留已加载的只读 workflow/storyboard 与明确的“重试复制”命令。失败响应
在成功 transaction 前不创建 project/canvas；重试只重新请求 `POST /api/publish/{snapshotId}/clone`。
因此网络失败、刷新或重试不能使原始公开快照变为私有副本，也不能留下半创建项目。
