# LibTV 内容模型

## 核心实体

<!-- markdownlint-disable MD013 -->

| 实体 | 用户含义 | 标识/版本 | 主要界面 | 权限边界 |
| --- | --- | --- | --- | --- |
| Account | 登录身份、个人设置和凭据 | account id | 账户菜单、设置 | 仅本人 |
| Workspace | 个人或团队资源空间 | workspace id | 切换器、CLI | 成员与角色 |
| Membership | 账户在 workspace 中的身份 | account + workspace | 团队管理 | owner/admin/member 待确认 |
| Project | 一次完整创作及其资源容器 | project id + revision | 项目页、CLI | workspace 级 |
| Canvas | 项目中的无限画布 | canvas id + revision | 工作流/故事板 | 继承项目 |
| WorkflowDocument | 可编辑节点、位置、分组和连线 | schema version + revision | 工作流视图 | 继承画布 |
| Node | 文本、图片、视频、音频、脚本等执行单元 | node id + type version | 画布节点、CLI | 继承画布 |
| Asset | 上传或生成的媒体内容 | asset id + content hash | 资产库、节点、故事板 | owner/workspace + usage scope |
| AgentSession | 围绕目标与上下文的 ReAct 会话 | session id + event cursor | 首页、Agent 页、画布侧栏 | account/workspace/project scope |
| Skill | Agent 可加载的版本化能力包 | skill id + version | Skill 广场、会话选择器 | public/private + owner |
| Model | 可调用模型及动态参数 schema | model id + revision | 模型选择器、节点 | entitlement + region |
| GenerationJob | 节点或 Agent 发起的长任务 | job id + attempt | 进度、历史、通知 | 继承调用上下文 |
| Artifact | Job 产生、可绑定为 Asset 的结果 | artifact id + hash | 节点结果、历史 | 先私有，发布时显式授权 |
| ShowcaseEntry | TV Show 的公开目录条目 | entry id + publication state | 目录、详情 | 公开读取，作者管理 |
| PublishedProjectSnapshot | 发布时冻结的制作过程 | snapshot id + version | 只读工作流/故事板 | 公开读取或隐藏 |
| Wallet/LedgerEntry | 积分池、预占、扣费和返还 | ledger id | 会员、积分、账单 | account/workspace 财务角色 |

<!-- markdownlint-enable MD013 -->

## 关系

- Account 通过 Membership 加入一个或多个 Workspace。
- Workspace 拥有多个 Project；Project 拥有多个 Canvas 和 AgentSession。
- Canvas 保存一个 WorkflowDocument；WorkflowDocument 引用 Node、Group、Edge
  和 Asset，但不直接内嵌大媒体文件。
- Node 可提交一个或多个 GenerationJob；Job 产生 Artifact，确认后可登记为 Asset。
- AgentSession 引用 Skill、Model、Asset、Project、Canvas 或 Node 作为上下文，
  通过命令修改 workflow，而不是绕过 Project 服务直接写数据库。
- ShowcaseEntry 指向一个不可变 PublishedProjectSnapshot；快照只持有可公开的
  Asset 引用。复制时由 CloneProjectCommand 生成新的 Project 和资源引用。
- Wallet/LedgerEntry 关联实际 GenerationJob/计费事件，用于幂等扣费和追溯。

## 同名概念边界

- **项目 vs 画布**：项目负责资源、权限和生命周期；画布负责空间编辑。
- **工作流 vs 故事板**：工作流展示依赖图；故事板按媒体和叙事用途投影结果。
- **历史 vs 版本**：当前“历史”已观察为生成资产历史，不等于 workflow revision。
- **素材 vs 产物**：素材是可复用 Asset；产物是某次 Job 的 Artifact，登记后
  才进入资产库。
- **分享 vs 发布**：分享可针对私有对象生成受控链接；发布把冻结快照放入
  TV Show，两者权限与审核语义不能混用。

## 页面类型

| 实体 | 列表/集合 | 详情 | 创建/编辑 | 关联视图 |
| --- | --- | --- | --- | --- |
| Project | workspace 项目列表 | 项目工作台 | 新项目、项目设置 | 画布、Agent、资产、发布 |
| Canvas | 项目内切换器 | 工作流/故事板 | 画布编辑器 | 节点、分组、历史 |
| Asset | 资产库、生成历史 | 素材预览/元数据 | 上传、裁切、登记 | 节点引用、公开许可 |
| AgentSession | 会话历史 | 消息与执行事件 | 新会话、设置 | 项目/节点上下文、CLI |
| Skill | 市场、收藏、我的 | 说明、示例、规范 | 作者工具待确认 | 会话使用、版本 |
| ShowcaseEntry | TV Show 目录 | 沉浸详情 | 发布流待确认 | 只读制作过程、复制 |
