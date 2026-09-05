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
