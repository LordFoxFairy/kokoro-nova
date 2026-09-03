# 2026-09-03 登录态项目列表

## 捕获条件

- 页面：`https://www.liblib.tv/project`；
- 入口：首页“查看全部”；
- 登录态：是；
- 视图：桌面浏览器；
- 证据：可见页面、DOM、单次导航后的 XHR/Fetch 事件与脱敏 response schema；
- 数据处理：项目、文件夹、账户和请求关联标识全部省略。

## 可见结构

页面按以下顺序展示：顶部活动/账户栏、`全部项目` 标题、搜索框、回收站、
`新建文件夹`、`开始创作` 卡片、文件夹/项目卡片和终点文案 `没有更多了`。

项目名点击会切换为内联重命名输入框；项目卡更多按钮使用独立菜单。已有截图和菜单
动作见 [`pages/canvas/README.md`](../../pages/canvas/README.md)。

## 列表请求

### `POST /api/canvas/folder/entries`

```json
{
  "id": 0,
  "spaceTypes": [1, 10],
  "page": 1,
  "pageSize": 20,
  "orderBy": "created_at_desc",
  "onlyFolder": false
}
```

```ts
type ProjectFolderEntry = {
  id: string
  name: string
  description: string
  parentFolderId: number
  spaceType: number
  depth: number
  coverUrl: string
  ownerId: number
  createdBy: number
  isFolder: boolean
  teamId: number
  fileCnt: number
  createAt: string
  updateAt: string
  creatorNickname: string
  shareAgentConversation: boolean
}

type ProjectFolderEntriesResponse = {
  code: number
  data: {
    folders: ProjectFolderEntry[]
    total: number
  }
  msg: string
  trace_id: string
}
```

`folders` 同时承载文件夹和项目条目，前端通过 `isFolder`、`spaceType` 等字段区分，
而不是分别请求两个无限列表。首页只查 `spaceTypes: [10]`、`onlyFolder: true`、
`pageSize: 5`；完整项目页改为 `[1, 10]`、`onlyFolder: false`、`pageSize: 20`。

## 对本地 mock 的直接约束

1. 项目页列表采用 20 条分页并默认 `created_at_desc`；
2. 同一返回列表必须能混排项目和文件夹；
3. 搜索、回收站和新建文件夹是项目页固定顶层入口；
4. 首页“最近项目”和项目页“全部项目”不能共用一组写死数组；
5. 条目类型判定与卡片动作由 `isFolder`/规范化 `kind` 驱动。
