# Asset ingestion and library-folder contract

这份文档补齐资产库中“文件进入系统”这一段交接边界。它与
[`ASSET_LIFECYCLE.md`](ASSET_LIFECYCLE.md) 的职责不同：本页描述上传暂存、取消、资产文件夹和
生成产物入库；生命周期页描述已经入库的可用性投影、恢复和媒体失效。

## Routes

```text
GET    /api/assets/folders
POST   /api/assets/folders
POST   /api/assets/upload
DELETE /api/assets/upload?token=UPLOAD_TOKEN
POST   /api/assets
```

资产文件夹和项目文件夹是两棵独立的导航树。文件夹只属于当前 local space，上传时可通过
`folderId` 归属；项目文件夹的删除不会删除资产文件夹，反之亦然。

### Asset folders

`GET /api/assets/folders` 返回 `{ folders, counts }`。`counts` 以文件夹 ID 为 key，只统计
未撤销资产。`POST /api/assets/folders` 不读取 body，立即创建名称为“未命名文件夹”的文件夹；
后续资产 PATCH 才设置 `folderId`。两条 operation 都返回本地稳定对象和 ISO 时间字段。

### Upload request

`POST /api/assets/upload` 使用 `multipart/form-data`，不是 JSON：

| part | 必填 | 约束 |
|---|---:|---|
| `files` | 是 | 一个或多个文件；单次最多 50 个 |
| `namespace` | 否 | `personal` 或 `agent`；省略默认为 `personal` |
| `folderId` | 否 | 当前 space 中已存在的资产文件夹 ID |
| `uploadToken` | 否 | `^[A-Za-z0-9_-]{16,64}$`；用于取消和并发收敛 |

每个文件最多 50 MiB。当前 mock 接受 `image/png`、`image/jpeg`、`image/webp`、`image/svg+xml`、
`video/mp4`、`video/webm`、`audio/wav` 和 `audio/mpeg`（浏览器常见的 wav/mp3 别名会归一化）。
扩展名不可信：服务端按 MIME 选择规范化文件名，并用 magic bytes 检查内容。SVG 在落盘前清理
脚本；不通过内容门的文件只进入 `rejected`，不能成为库资产。

成功体是逐文件结果：

```json
{
  "assets": [
    {
      "id": "asset_fixture_01",
      "state": "committed",
      "namespace": "personal",
      "folderId": null,
      "url": "/api/media/uploads/upl_fixture_01/person.png"
    }
  ],
  "rejected": [
    { "name": "bad.txt", "reason": "不接受的文件类型：text/plain" }
  ]
}
```

`assets` 使用 OpenAPI 的 `Asset` 成功体；读取 `GET /api/assets` 时再投影为带
`lifecycle` 的 `AssetLifecycleView`。一次请求可以部分成功，调用方必须逐项展示或重试
`rejected`，不能因一个文件失败而丢弃已经提交的其它文件。

处理顺序是 **stage → persist staging row → content gate → commit**。`staging` 行不能被普通
列表作为可用资产返回；超过 5 分钟仍未完成内容门的暂存行会在后续上传时清扫。

### Cancellation and race semantics

客户端为可取消上传生成一个符合上述 pattern 的 `uploadToken`，并把它同时放入表单和取消 URL：

```text
DELETE /api/assets/upload?token=UPLOAD_TOKEN
→ { "revoked": 1 }
```

取消票据有 30 分钟保留期。取消是幂等的：不存在的 token 也会先写入取消 tombstone，因此随后
抵达的同 token 上传不会被提交。服务端必须把上传和取消排进同一状态写入序列，保持三种顺序
都成立：取消先于 claim、发生在内容门期间、发生在 commit 之后。被取消的行保留为
`state: revoked` 以维持 asset ID 可追溯性，但其媒体字节必须删除。

### Generated artifact registration

`POST /api/assets` 仍是 JSON，用于把已有生成产物登记到资产库：

```json
{
  "artifactId": "artifact_fixture_01",
  "name": "城市夜景",
  "namespace": "personal",
  "tags": ["场景"]
}
```

`artifactId` 必须指向当前 space 的已存在产物。同一产物重复登记返回同一资产，不创建第二条
库记录；成功体是 `AssetLifecycleView`。未来后端应以数据库唯一约束或等价幂等键保留这个语义。

## Backend handoff

1. 用对象存储的 quarantine key 替换本地 `MEDIA_DIR/uploads`，在 content gate 完成前不发布
   可读取 URL。
2. 保留每文件 50 MiB、每请求 50 文件、MIME allowlist、magic-byte 检查、SVG 清理和
   `rejected[]` 的部分成功形状。
3. 用事务/队列保证 `uploadToken` claim、cancel tombstone 和 commit 的先后关系；取消不应
   通过浏览器删除资产或直接操作对象存储路径来模拟。
4. 将 asset-folder 外键约束到 workspace，并在授权后再解析 `folderId`；跨 workspace 的 ID
   统一按不可见资源处理。
5. 资产列表继续返回 `AssetLifecycleView`，上传和产物登记可以返回 `Asset`/已提交资源，但
   页面不应读取 provider envelope、对象存储凭证或绝对路径。

OpenAPI 中对应的机器可读 schema 是 `AssetFolderListResponse`、`UploadAssetRequest`、
`UploadAssetResponse`、`CancelAssetUploadResponse`、`RegisterAssetRequest` 和
`AssetLifecycleView`。当前本地 fixture 的非 2xx 仍可能使用旧 `{ "error": "message" }` 形状；
后端交接目标仍是 [`ERRORS.md`](ERRORS.md) 的规范化 `ErrorResponse`。
