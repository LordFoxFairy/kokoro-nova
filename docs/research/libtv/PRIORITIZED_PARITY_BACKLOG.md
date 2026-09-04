# LibTV 复刻可执行优先级

审核日期：2026-09-04。排序依据：对首屏可信度和跨页闭环的影响 > 对后续后端承接的阻塞程度 > 实现成本。每项都以 local fixture、typed contract、交互测试和 `1440×900` 基线作为完成条件；真实付费生成和账户写入继续保持 `COST_GATED`。

## P0 — 先消除“看起来像，但接不起来”的断点

| ID | 目标 | 建议改动面 | 完成定义 | 依赖 |
| --- | --- | --- | --- | --- |
| P0-01 | 统一身份与登录回跳 | `src/contracts` 新增 local identity/session projection；首页、Project、Skills、Showcase login gate、`AccountRail` 共享 | `anonymous → login gate → returnTo` 可在首页、项目、Skill 使用、TV Show 复制四处复现；刷新不丢草稿；不读取真实凭据 | 无；先于其它账户入口 |
| P0-02 | 统一 CreationContext | `HomeAgentComposer`、`SkillGallery` composer、Agent panel、canvas starter 共用附件/模型/Skill/参考/生成模式字段 | 四类上下文都能打开、选择、移除；序列化请求包含稳定 id/version；Skill 详情添加后返回 composer 且保留版本 | P0-01 的 session fixture |
| P0-03 | 首页与 TV Show 共用发现 projection | `HomeShowcaseItem`、`ShowcaseEntryProjection`、fixtures、home/showcase routes | 同一个 entry 在首页、目录、详情的标题/作者/分类/统计/process 能力一致；公开媒体不写入 workflow snapshot | 无；可与 P0-02 并行 |
| P0-04 | Account menu 与 ledger 分层 | `AccountRail`、`AccountPage`、`LedgerView`；新增 identity/preferences/notification mock seam | 顶栏账户入口展开官网同层级菜单；余额池能跳账本；主题/水印/通知入口有明确 `PENDING` 或 local 状态，不再用静态链接冒充已实现 | P0-01 |
| P0-05 | 七个 surface 的最小视觉守门 | `e2e/*parity.spec.ts`、`docs/screenshots/` | Home、Project、Canvas、Storyboard、Skills、TV Show、Account 各有一张 `1440×900` CSS baseline；每个关键菜单/弹层至少一张状态图；截图固定字体、动画、媒体加载和 DPR | 页面当前实现；Account 需要先有菜单 |

## P1 — 补齐关键状态与后端承接 seam

| ID | 目标 | 建议改动面 | 完成定义 | 依赖 |
| --- | --- | --- | --- | --- |
| P1-01 | Job 状态机可演示且不重复扣费 | `src/contracts/libtv-generation.ts`、Jobs mock、`ConfirmGate`、ledger projection | 每种媒体至少覆盖 pending/running/succeeded/failed/cancelled；停止、重试、刷新恢复；ledger 只写一条 reserve + settle/release 链 | P0-04 账本 projection |
| P1-02 | Project / folder 生命周期 E2E | `ProjectListPage`、project/folder routes、fixtures | 创建 → 重命名 → 封面 → 副本 → 移动 → 刷新 → 删除；回收站恢复/永久删除另有 scenario；确认门状态可访问 | P0-01 |
| P1-03 | Storyboard / compositor 状态闭环 | `StoryboardView`、`ClipEditor`、compose mock | 混合节点切换保持 document/revision；媒体缺失、渲染成功、取消、失败、重试均有卡片与 API 结果；导出资产归属明确 | P1-01 可复用 Job 语义 |
| P1-04 | TV Show 公共读取状态 | `ShowcaseGallery`、`ShowcaseDetailView`、`PublicCanvasView` | cursor 分页、加载更多、陈旧数据刷新、空集合、媒体缓冲/失败/重试；相邻作品与只读 snapshot 版本固定 | P0-03 |
| P1-05 | Skills 使用闭环 | `SkillGallery`、`SkillDetail`、Agent session mock | 选 Skill → 固定 `skillId + version` → 登录/确认门 → Agent session → 产物引用；失效版本和权限不足有明确错误 | P0-01、P0-02 |
| P1-06 | Canvas 协作与恢复 | `presence-client`、canvas store、server presence mock | 两个隔离客户端覆盖租约、乐观冲突、断线回连、跟随退出、被驱逐刷新；不产生第二份 Storyboard 文档 | P1-01 之外独立 |

## P2 — 账户域和高级产品面

| ID | 目标 | 建议改动面 | 完成定义 | 依赖 |
| --- | --- | --- | --- | --- |
| P2-01 | Skill 作者工作台 | 新增 local author route、版本/发布 mock | 草稿、文件树、`SKILL.md`、输出类型、版本、审核/发布/下架；运行中的会话绑定不可变版本 | P1-05 |
| P2-02 | 账户共享域 | identity/preferences/notifications/team/asset/subscription/transaction mock | 头像菜单的身份、主题、水印、通知、存储、团队、订阅/发票、CLI & Skill 入口各有独立 schema；共享域与 ledger/Jobs 解耦 | P0-04 |
| P2-03 | 真实动态目录适配 | models/skills/showcase schema 与版本策略 | 模型/Skill/作品目录可替换 fixture；UI 不把官网当日名称写死；未知字段前向兼容 | P0-02、P0-03 |
| P2-04 | 高级导演/工具箱/资产权限 | Director、toolbox、asset library、character/style/effects | 创建、编辑、版本、权限、失效和恢复的 local scenario；成功输出不绕过统一 Job/ledger seam | P1-01 |

## 推荐切片顺序

### Slice A：跨页身份与首屏闭环

做 `P0-01 → P0-02 → P0-03`。交付后应能从首页启动文本/Skill/TV Show 三种意图，登录门关闭和回跳都不丢上下文；它是后续所有“后端可承接”的共同输入模型。

### Slice B：账户菜单与公开/私有边界

做 `P0-04 → P1-04`。先让账户菜单不再与积分账本混为一页，再把 TV Show 的公共目录、详情、只读过程和 clone gate 固定为独立 projection。这样首页、公开内容和私有工程的权限关系能被单独演示。

### Slice C：生成与故事板闭环

做 `P1-01 → P1-03`。用 deterministic Job 做运行中/成功/失败/取消，不进行真实付费生成；把 held/settled/released ledger 关联到可定位的 project/canvas/node。

### Slice D：作者与共享账户域

做 `P1-05 → P2-02`。Skill 的作者能力、团队、通知、偏好和外部账户入口需要在产品面明确后，再接真实服务；不把这些域硬塞进 `WorkflowDocument`。

## 每个切片的放行清单

- [ ] 先更新 local fixture 与 typed route contract，再改组件。
- [ ] 至少一个成功、一个空态/错误态、一个权限或计费门。
- [ ] 交互测试断言可访问名称、disabled 条件、Escape/Enter 和刷新恢复。
- [ ] `1440×900` CSS viewport 基线通过，物理 PNG 尺寸与测试配置一致。
- [ ] 验证共享 id/version 在页面、API、domain projection 和 server mock 间不漂移。
- [ ] `pnpm typecheck && pnpm lint && pnpm test && pnpm build` 通过；需要浏览器时再运行对应的隔离 E2E。
- [ ] 检查 Git 变更只包含本切片文件；不触碰用户自有 `.gitignore`，不暂存凭据或运行目录。
