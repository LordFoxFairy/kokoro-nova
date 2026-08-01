# LibTV CLI 契约

来源：登录后页面 <https://www.liblib.tv/cli> 的内嵌官方文档。这里记录公开命令契约，不记录 Access Key、Cookie 或请求头。

## 安装与文档树

触发路径：头像 -> CLI & Skill；入口在新标签打开 `/cli`。

截图：

- [CLI 安装与文档树](../../pages/agent/screenshots/cli-install-and-documentation-tree.png)
- [手动安装与网页登录](screenshots/manual-install-os-options-and-web-login.png)

页面提供两种安装方式：

- “通过 AI Agent 安装”给出可直接发送给 Agent 的 Skill 包地址。
- “手动安装”分 macOS/Linux、Windows PowerShell 和 Windows CMD，并以
  `libtv login web` 完成首次登录。

当前页面快照版本为 `1.1.1`。安装 URL、版本和脚本必须视为可变发布元数据；实现时
需要固定版本、校验和和签名，不应长期硬编码页面快照中的下载地址。

文档覆盖：

```text
account / group / image / login / logout / model / node / project
script / upload / workspace
```

同时提供 pipe/workflow、模型 schema 和各节点类型示例。

## 对象绑定

- `workspace use` 写入 `workspaceId`，并清空旧的 `projectUuid` 和 `groupNodeKey`。
- `project use` 写入 `.libtv/project.json` 中的 `projectUuid`，同时同步真实 `workspaceId/teamId`。
- `group use` 写入 `groupNodeKey`。
- 官方术语中 workspace 是项目/工作区容器，project 是真正的画布。

## Project

截图：[project-command-lifecycle.png](screenshots/project-command-lifecycle.png)

- `create`：创建空画布。
- `list/ls`：列出画布。
- `update`：修改名称、描述、封面和文件夹。
- `use/unuse`：绑定或解除当前画布。
- 默认详情包含画布 ID、名称、位置、节点和边摘要。

## Node

截图：[node-command-contract.png](screenshots/node-command-contract.png)

- 查询、创建、更新、删除、列出、连边、执行现有节点。
- `node create` 要求节点类型，可附带模型参数、数据、位置、上下游边和 `--run`。
- 节点可用 ID 或精确显示名定位；自动化和管道应优先使用 ID。
- prompt 可用 `{{Node "name"}}` 引用已连接的媒体节点。
- stdin/stdout 支持 NDJSON，适合外部 Agent 组合命令。

### 合规行为

生成前会检查上游人像图片。通过后转换为 `asset://assetId`；非人像可使用 URL 并携带豁免。任一图片校验失败会中止本次运行。

## Model Schema

`model search` 支持按模型和类型查找，并返回完整 schema。Schema 关键字段：

- `properties`：参数定义。
- `config`：模型配置。
- `modeType.items`：输入模式到上游媒体数量 `[min, max]` 的映射。
- `rules`：提示词、媒体和特定 mode 的条件组合。
- `mixed2videoConfig`：视频混合输入配置。

复刻时模型目录应是版本化 schema registry，前端、CLI、GA 和 worker 共享同一验证来源。

## API 设计含义

- Web 与 CLI 必须落到同一个权限、计费、合规和画布 mutation 层。
- 本地绑定文件只能是客户端便利功能，服务端必须再次校验用户、团队、workspace 和 project scope。
- `--run` 需要幂等键；查询与执行必须分开，防止轮询误触发重复生成。
- NDJSON 管道适合 Agent，但错误输出也必须结构化并保留 correlation ID。
