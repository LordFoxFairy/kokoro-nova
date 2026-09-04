# Showcase / 作品广场工作流

作品广场是前端-only 的公开发现 surface。所有响应来自本地确定性 fixture；浏览器不会携带或读取 LibTV 线上凭证，也不会调用外部接口。

## 浏览与详情

| UI 行为 | 本地 operation | 说明 |
| --- | --- | --- |
| 目录、分类与搜索 | `GET /api/showcase` | 返回稳定的公开 discovery projection。分类与全文匹配在前端完成，未匹配时保留该分类的推荐作品。 |
| 打开作品详情 | `GET /api/showcase/{snapshotId}` | 返回作者、媒体、统计、相邻作品和公开快照 id。 |
| 查看制作过程 | `GET /api/publish/{snapshotId}` | 返回发布时冻结的只读工作流文档；编辑器不在公开页面挂载。 |

目录与详情的 schema 分别是 `ShowcaseListResponse` 与 `ShowcaseDetailResponse`，详见 [`openapi.yaml`](openapi.yaml) 的 `Showcase` tag。

## 收藏与分享

| UI 行为 | 本地边界 | 结果 |
| --- | --- | --- |
| 收藏 / 取消收藏 | `GET /api/account` | 未登录展示登录门；已登录时收藏 id 存在浏览器 `localStorage` 的 `kokoro-nova/showcase-favourites`。这是前端 mock 的个人偏好缓存，不会修改公开作品统计。 |
| 分享 | 浏览器 Clipboard API | 复制当前公开详情链接；Clipboard 不可用时仍保留页面浏览。 |

收藏没有额外 mock route：它刻意是客户端偏好，不应把公开发现 projection 变成带会话的服务端状态。后端接入时可在这一 seam 替换为用户收藏 endpoint，而不影响 `GET /api/showcase*` 的匿名缓存语义。

## 复制到我的项目

复制只会在 `GET /api/account` 表明当前 fixture 是登录态时开始。流程复用已经版本化的项目和画布 API，而不是创建第二套 Showcase 写接口：

1. `POST /api/projects` 创建命名为 `作品标题 · 副本` 的新私有项目和空画布。
2. 从 `GET /api/publish/{snapshotId}` 取得的冻结 document 被转换为 canonical canvas mutations：`addNode`、`addEdge`、`addGroup`、`setViewport`。
3. `POST /api/canvases/{canvasId}` 以初始 revision `1` 执行 mutation，返回新的 revision 与 document。
4. UI 打开 `/canvas?projectId=PROJECT_ID&canvasId=CANVAS_ID`；后续编辑只影响新项目。

这个顺序保留了现有的 optimistic-lock 和 mutation 校验边界。任何一步失败都会停在确认弹窗并显示本地错误，不会修改原公开快照。

## 验收夹具

`e2e/showcase-interactions.spec.ts` 使用 `authenticated-populated` 场景，验证收藏状态以及“公开快照 → 新项目/画布”的复制闭环。匿名 `public-showcase` 场景仍显示现有的登录门。
