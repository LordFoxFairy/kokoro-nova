# 2026-09-03 登录态首页刷新

## 捕获条件

- 页面：`https://www.liblib.tv/`
- 动作：在已有登录会话中刷新首页；
- 视图：桌面浏览器；
- 证据：浏览器可访问性树、XHR/Fetch 请求事件、脱敏 request body 与 response schema；
- 数据处理：仅保留字段名、数据类型和非身份型查询常量。

本批网络事件缓冲标记为 `truncated`，因此这里是已确认集合，不声称覆盖首页发出的
全部请求。后续捕获采用“动作前游标 -> 单一动作 -> 立即读取事件”的方式补齐。

## 可见界面与请求对应

| 可见区域 | 已确认数据请求 |
|---|---|
| 顶部活动条与轮播 | `landing-activities/*`, `banner/community/getBanner` |
| 会员、积分和通知摘要 | `member/account`, `member/memberPower/list`, `tv/msg/msgCounter` |
| 最近项目与文件夹 | `canvas/project/list`, `canvas/folder/entries` |
| 首页推荐 Skill | `community/skill/tag/list`, `community/skill/template/feed/stream` |
| TV Show 分类与作品 | `community/tag/list`, `community/project/template/feed/stream` |

## 已确认请求

### `POST /api/canvas/project/list`

```json
{
  "page": 1,
  "pageSize": 5,
  "orderBy": "updated_at_desc",
  "projectSpaceId": 0
}
```

响应：

```ts
type ProjectListResponse = {
  code: number
  data: {
    projectMetaList: unknown[]
    total: number
  }
  msg: string
  trace_id: string
}
```

本次样本的 `projectMetaList` 为空，因此项目条目字段需要从项目页或下一次有内容响应确认。

### `POST /api/canvas/folder/entries`

```json
{
  "id": 0,
  "onlyFolder": true,
  "spaceTypes": [10],
  "page": 1,
  "pageSize": 5,
  "orderBy": "updated_at_desc"
}
```

```ts
type FolderEntriesResponse = {
  code: number
  data: {
    folders: Array<{
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
    }>
    total: number
  }
  msg: string
  trace_id: string
}
```

### `POST /api/community/skill/template/feed/stream`

首页会按不同 `tagId` 并行请求小批量推荐 Skill。已确认请求形状：

```json
{
  "tagId": 4004,
  "page": 1,
  "pageSize": 1
}
```

响应条目的已确认字段：

```ts
type SkillFeedItem = {
  templateUuid: string
  skillUuid: string
  skillKey: string
  name: string
  version: string
  description: string
  resultType: number
  coverUrl: string
  snapshotId: number
  auditStatus: number
  evalResult: string
  tags: CommunityTag[]
  isLike: boolean
  likeCount: number
  usePv: number
  useUv: number
  publishAt: string
  ownerId: number
  ownerName: string
  ownerAvatar: string
  useScenario: string
  inputType: string
  outputContent: string
  sourceType: number
  nickname: string
  avatar: string
  namespace: string
  showMarkdown: boolean
  caseItems: Array<{
    productionCaseUrl: string
    canvasCasePower: number
  }>
  cornerTag: string
}

type SkillFeedResponse = {
  code: number
  data: { list: SkillFeedItem[]; total: number; hasMore: boolean }
  msg: string
  trace_id: string
}
```

### `POST /api/community/project/template/feed/stream`

```json
{
  "page": 2,
  "pageSize": 20,
  "requestId": "<REQUEST_ID>"
}
```

`requestId` 是推荐请求关联字段，mock 中使用确定性值即可，不复用官网值。

```ts
type ProjectTemplateFeedItem = {
  templateUuid: string
  projectUuid: string
  name: string
  description: string
  coverUrl: string
  finalOutput: string
  snapshotId: number
  auditStatus: number
  ownerId: number
  ownerUuid: string
  avatar: string
  nickname: string
  isLike: boolean
  likeCount: number
  tags: CommunityTag[]
  isTop: boolean
  score: number
  auditBy: number
  socialMediaUrl: string
  createAt: string
  updateAt: string
  publishAt: string
  recommendOtherRes: {
    utLogMap: Record<string, string>
  }
}

type ProjectTemplateFeedResponse = {
  code: number
  data: { list: ProjectTemplateFeedItem[]; total: number; hasMore: boolean }
  msg: string
  trace_id: string
}
```

推荐评分与召回字段只用于官网推荐系统，本地 mock 不需要模拟排序算法；fixture 固定顺序，
但保留开放字段以复刻响应形状。

### `GET /api/www/account/list`

```ts
type AccountListResponse = {
  code: number
  msg: null
  data: {
    accounts: Array<{
      accountId: number
      accountName: string
      accountType: number
      ownerType: number
      ownerUuid: string
      isActive: boolean
      owner: boolean
      teamRole: null | string
      source: null | string
      memberAccount: {
        memberName: string
        accountLevel: number
        effective: boolean
      }
    }>
  }
}
```

### `GET /api/www/member/account?isApp=false`

首页实际消费的重点字段组：

```ts
type MemberAccountSummary = {
  accountLevel: number
  accountLevelName: string
  accountLevelDesc: string
  effective: boolean
  member: boolean
  trainMember: boolean
  attr: {
    usablePower: number
    libtvUsablePower: number
    libtvTotalPower: number
    usedPower: number
    rechargeUsablePower: number
    freeUsablePower: number
    agentFree: number
    concurrent: number
    usedSpace: number
  }
}
```

完整响应还有会员日期、训练会员、冻结会员和活动积分等字段；待账户页捕获时再确定 UI
消费关系，首页 mock 只需使用这里列出的摘要字段。

### `POST /api/www/tv/msg/msgCounter`

请求体为空对象：

```json
{}
```

```ts
type MessageCounter = {
  officialMsgCount: number
  replyMsgCount: number
  returnPicMsgCount: number
  likeMsgCount: number
  followCount: number
  isMsg: number
  totalMsg: number
}
```

### `POST /api/www/banner/community/getBanner`

```json
{ "bannerType": 39 }
```

```ts
type CommunityBanner = {
  url: string
  pic: string
  title: string
  startTime: string
  endTime: string
  displayOrder: number
  type: number
  extendInfo: null | unknown
}
```

## 对本地 mock 的直接约束

1. 首页最近项目与文件夹必须分开查询并按 `updated_at_desc` 展示；
2. 首页只取前 5 项，完整项目页负责分页；
3. Skill 推荐是按 tag 分批请求，不是一个写死的三卡数组；
4. TV Show feed 使用 `page/pageSize/hasMore`，应支持加载更多；
5. 会员摘要、通知计数和活动配置是独立请求，单个失败不应清空整个首页；
6. API envelope 同时存在 `msg: string` 与 `msg: null`，归一化 client 需要兼容两种形状；
7. `trace_id` 用于诊断，不进入页面领域状态。

