# 项目回收站契约

项目删除是**软删除**：`DELETE /api/projects/{projectId}` 将项目移入回收站，保留其全部画布文档、生成记录和 Agent 会话 30 天。普通项目列表、首页最近项目、项目详情与画布读写都将回收项目视为不存在；资产回收逻辑与本流程完全独立。

项目管理器的封面使用固定的本地 fixture（城市夜景、电影首帧、云端宫殿），而不是上传或远程 URL。`PATCH /api/projects/{projectId}` 只接受这些 URL 或 `null`；因此封面、复制件和回收恢复后的卡片在重新加载后都有确定结果。

```text
DELETE /api/projects/PROJECT_ID
→ { "deleted": "PROJECT_ID", "recycled": true }

GET /api/recycle-bin
→ { "projects": [ ... ], "purgedProjectIds": [] }

POST /api/recycle-bin/PROJECT_ID
→ { "project": { ... }, "restoredToRoot": false, "canvasCount": 2 }

DELETE /api/recycle-bin/PROJECT_ID
→ { "deleted": "PROJECT_ID", "permanentlyDeleted": true }
```

## 状态与不变量

| 状态 | 正常列表 / 画布 API | 回收站 | 画布与会话 |
|---|---|---|---|
| active | 可见、可编辑 | 不可见 | 正常保留 |
| recycled | `404` | 可恢复或永久删除 | 原对象不变，保留到期时间 |
| expired / permanently deleted | `404` | 不可见 | 级联删除画布、项目会话和消息 |

- `recycledAt` 与 `recycleExpiresAt` 是 ISO 时间；到期时间固定为移入后 30×24 小时。
- `GET /api/recycle-bin` 在一次串行状态写入中先永久清理已到期条目，再返回剩余条目；`daysRemaining` 为向上取整的可见天数。
- 恢复时会使用 `recycleOriginalFolderId`。文件夹仍存在则回到该文件夹，否则置 `folderId: null`，并返回 `restoredToRoot: true`。
- 新建项目与移动项目都会验证 `folderId`：它必须是当前空间中存在的文件夹；不存在、跨空间或空字符串都会得到 `400 { "error": "目标文件夹不存在" }`，状态不会写入。
- 复制会深拷贝画布文档并保留项目的本地示例封面和当前有效文件夹；回收元数据不会带入副本。项目列表读取磁盘状态，所以复制、重载、移动、软删除和恢复是同一条可重放的本地生命周期。
- 永久删除仅接收已在回收站的项目，并用既有 `deleteProjects()` 级联移除画布、Agent sessions 和 messages。
- UI 的永久删除确认必须输入完整项目名；API 保持无 body、幂等安全的 `404` 边界，避免传递任何真实上游凭证。

## 后端接手

未来 repository 需要把 `recycledAt`、`recycleExpiresAt`、`recycleOriginalFolderId` 作为项目表字段（或等价审计记录），把 active scopes 作为所有项目和画布查询的强制条件。到期清理可由队列任务执行，但读取契约仍返回同样的列表和 `purgedProjectIds`；不能由前端删除本地画布来模拟恢复。
