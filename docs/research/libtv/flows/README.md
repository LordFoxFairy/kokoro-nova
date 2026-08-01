# LibTV 跨页面流程索引

本目录把单页能力串为可验收的用户旅程。证据标记沿用总矩阵：

- `OBSERVED`：当前站内真实 UI 或交互已观察。
- `OFFICIAL`：官方指南、Skill、OpenAPI、CLI 或 ComfyUI 源码确认。
- `PENDING`：需要登录、真实任务、费用或实现后故障注入才能确认。

## 流程目录

| 流程 | 文档 | 当前闭合程度 |
| --- | --- | --- |
| 登录与引导 | [login-onboarding.md](login-onboarding.md) | 登录入口完整，问卷仅第一步 |
| Web/Agent 创作 | [web-agent-creation.md](web-agent-creation.md) | 入口/配置部分完整，提交后待补 |
| Skill 驱动创作 | [skill-driven-creation.md](skill-driven-creation.md) | 市场/详情部分完整，执行待补 |
| 素材驱动编辑 | [asset-editing.md](asset-editing.md) | 入口与官方工具完整，运行态待补 |
| 节点生成任务 | [generation-job.md](generation-job.md) | 目标设计；官方状态枚举未知 |
| TV Show 复用 | [showcase-clone.md](showcase-clone.md) | 未登录链路完整，登录后复制待补 |
| 会员、积分与订阅 | [billing-and-subscription.md](billing-and-subscription.md) | 公开规则与登录查询链路完整，支付/结算待补 |
| Agent OpenAPI | [agent-openapi.md](agent-openapi.md) | 官方客户端契约完整 |
| CLI 自动化 | [cli-automation.md](cli-automation.md) | 官方命令契约完整，实机错误待补 |

## 全局门槛

任一创作入口最终都应经过相同的服务端门槛：

1. 身份与 workspace/project 权限。
2. 输入 schema、节点类型和依赖图验证。
3. 素材所有权、URL 安全与人像/音色合规。
4. 模型可用性、会员权益、并发和余额预占。
5. 幂等提交、Job/attempt 持久化和可取消执行。
6. Artifact 落对象存储、Asset 登记、画布 revision 回写和账本结算。
7. 有序事件通知、刷新/断线恢复和最终审计。

页面、Agent、CLI 和兼容 OpenAPI 不能各自绕开这套门槛。
