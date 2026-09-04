# 首页 CreationContext（local mock）

> Contract version: `2026-09-04.1` · scope: 首页 `HomeAgentComposer`

`CreationContext` 是首页首次 Agent 请求的**版本化、可恢复快照**。它不同于
`AgentSession`：用户在首页填写灵感时尚未创建 project/canvas；提交后 mock 先冻结
`CreationAgentRequest`，再创建项目。未来 gateway 以 `request.id` 将这份不变快照关联到
新会话，不能重新从页面状态或 URL 推断上下文。

## 组成与不变量

```ts
CreationContext = {
  version: '2026-09-04.1'
  attachments: CreationAttachment[] // 最多 12，local-upload | personal-asset
  model: CreationModel | null       // id + label + media + catalogVersion
  skill: CreationSkill | null       // id + label + version
  references: CreationReference[]   // 最多 8，只引用 personal asset
  generationMode: 'manual' | 'auto'
}
```

- 本地上传只保存当前浏览器的 `blob:` 预览和稳定上传 fingerprint；个人资产只能引用
  local fixture 的 asset id。远端 URL 在 Zod schema 边界拒绝。
- 附件/参考按 id 去重，发送、重试、刷新后得到相同顺序与 target state。
- 模型和 Skill 是明确的可取消单选；保存版本防止未来 catalogue 更新后把旧选择解释为新能力。
- 浏览器以 `localStorage[kokoro.creation-context:2026-09-04.1]` 恢复刷新状态；每次变更同时
  `PUT` 到本地 mock mirror。服务重启时浏览器副本仍是恢复源。

## 操作

```text
GET  /api/creation-context
PUT  /api/creation-context
POST /api/creation-context
```

`PUT` 接收 `{ scope: 'home', context }`，是幂等的完整 target state 写入；成功返回同样的
`{ scope, context }`。`POST` 接收 `{ scope: 'home', prompt, context }`，返回：

```json
{
  "request": {
    "id": "creation-request-0001",
    "scope": "home",
    "prompt": "一支雨夜城市短片",
    "context": { "version": "2026-09-04.1", "attachments": [], "model": null, "skill": null, "references": [], "generationMode": "manual" },
    "createdAt": "2026-09-04T00:00:00.000Z"
  }
}
```

`POST` 不生成媒体、不调用真实 Agent，也不消耗积分；它只冻结未来 `AgentSession` 的首条输入。
首页项目创建导航会带 `creationRequestId`，使后续会话绑定不依赖脆弱的 prompt 解析。

## UI 映射

- pop-up **添加附件**：本地上传、个人资产附件、个人资产参考；每个 chip 均可移除；
- button **选择模型**：图片/视频目录，已选择模型可取消；
- button **Skill**：目录选择 + 首页三张“使用 Skill …”建议卡；
- pop-up **生成模式**：手动/自动；
- 无 prompt 时发送按钮固定 disabled，只有 prompt 与完整 Context 成功冻结后才创建项目。

所有页面数据、图片和 API 都是本地 deterministic mock；不复制远端素材、Cookie、token 或上游 API。
