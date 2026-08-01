# Agent 会话

Agent 在首页创作框和画布右侧面板中复用同一组输入能力，但画布内会额外携带工作流、节点和资源上下文。

## 已观察能力

| 能力 | 证据 | 结论 |
| --- | --- | --- |
| 新会话与分享 | [agent-new-conversation-share-disabled.png](screenshots/agent-new-conversation-share-disabled.png) | 面板头部标明“新对话”；新对话按钮和分享按钮均禁用，分享按钮文案为“新对话无法分享”。 |
| 历史空态 | [agent-history-empty-state.png](screenshots/agent-history-empty-state.png) | 历史对话弹层有明确空态“暂无历史对话”。 |
| 节点上下文 | [画布选中节点](../canvas/screenshots/text-node-selected-context-chip.png)、[故事板参考节点](../canvas/screenshots/storyboard-reference-added-to-agent-context.png)、[故事板视频产物](screenshots/agent-storyboard-generated-video-context-chip.png) | 三种入口都可注入可定位 context chip 并启用发送；清空后发送重新禁用，本轮均未发送。 |
| `@` 选择器 | [基础节点与模型](screenshots/agent-at-mention-selector-nodes-and-models.png)、[工具箱组与产物](screenshots/agent-at-mention-toolbox-group-and-generated-output.png)、[展开全部节点](screenshots/agent-at-mention-expanded-all-canvas-nodes-and-models.png) | “加载更多”可展开当前组、预设子节点和七个基线节点；有组和示例媒体时仍只有节点、模型两类，没有工作流或资源分组。 |
| `@` 无匹配 | [agent-at-mention-no-matching-node-or-model.png](screenshots/agent-at-mention-no-matching-node-or-model.png) | 不存在的查询同时显示“无匹配节点”和“无匹配模型”，未提交消息。 |
| 输入附件 | [首页附件菜单](../home/screenshots/attachment-source-menu.png) | 支持本地上传和资产库选择。 |
| 图片模型 | [agent-model-selector-image-catalog.png](screenshots/agent-model-selector-image-catalog.png) | Agent 模型选择器可切换图片/视频，图片目录展示名称、简介和“添加模型”动作；目录是动态数据。 |
| 视频模型 | [agent-model-selector-video-catalog.png](screenshots/agent-model-selector-video-catalog.png) | 视频筛选被选中时仍以同一弹层展示视频模型目录；未添加模型。 |
| 模型上下文 | [agent-image-model-inserted-as-context-chip.png](screenshots/agent-image-model-inserted-as-context-chip.png) | 点击“添加模型 Lib Image”会把模型作为 context chip 写入输入框并启用发送；清空后发送重新禁用，本轮未发送。 |
| Skill 选择器 | [agent-skill-selector-authenticated-categories-and-create.png](screenshots/agent-skill-selector-authenticated-categories-and-create.png) | 登录态包含创建/全部、通用/收藏/我的、搜索、卡片添加/详情和查看全部 Skill。 |
| Skill 个性化空态 | [收藏空态](screenshots/agent-skill-selector-favorites-empty.png)、[我的空态](screenshots/agent-skill-selector-my-empty.png) | 当前账户的收藏与我的列表为空；这是登录后真实空态，不是认证门。 |
| Skill 创建入口 | [agent-skill-create-options-conversation-or-custom.png](screenshots/agent-skill-create-options-conversation-or-custom.png) | 创建入口分为“将本次对话转化为 Skill”和“创建自定义 Skill”；未创建或保存。 |
| 推荐 Skill 注入 | [agent-suggested-skill-inserted-as-context-chip.png](screenshots/agent-suggested-skill-inserted-as-context-chip.png) | 点击推荐的“皮克斯动画广告”会把 Skill 作为 context chip 加入输入框并启用发送；随后已清空，未提交。 |
| 生成模式 | [手动与自动](../home/screenshots/generation-mode-manual-vs-auto.png) | 手动模式每次生成前询问；自动模式允许 Agent 自动生成。 |
| 只读请求提交前 | [agent-read-only-request-manual-mode-ready.png](screenshots/agent-read-only-request-manual-mode-ready.png) | 真实请求明确禁止 mutation、媒体生成和积分消耗；提交前已确认手动模式。 |
| 首次发送确认 | [agent-first-send-settings-confirmation-manual-auto-generation-off.png](screenshots/agent-first-send-settings-confirmation-manual-auto-generation-off.png) | 首次发送先确认免费轮次、人像协议、自动生成和通知；自动生成保持关闭后才确认发送。 |
| 处理中 | [agent-read-only-request-thinking-and-retrieval-status.png](screenshots/agent-read-only-request-thinking-and-retrieval-status.png) | 标题会先采用完整请求，正文显示用户消息、素材检索摘要、“思考中”和可点击的处理中按钮。 |
| 工具轨迹 | [agent-read-only-tool-trace-expanded.png](screenshots/agent-read-only-tool-trace-expanded.png) | 折叠摘要可展开为“未找到可用素材 / 已找到相关素材 / 已读取画布内容”三个阶段。 |
| 只读结果 | [agent-read-only-analysis-result-supported-node-subset.png](screenshots/agent-read-only-analysis-result-supported-node-subset.png) | Agent 输出节点表、连线、坐标和总结，但只返回 text/image/video/audio 四类，漏掉 Web 可见的导演台、脚本 V2、视频合成；画布实际仍为 7 节点、1 边。 |
| 分享门 | [agent-share-generate-link-public-read-only-modal.png](screenshots/agent-share-generate-link-public-read-only-modal.png) | 有内容后分享启用；生成前说明持链者只有浏览权限、不可编辑。本轮未创建公开链接。 |
| 历史与删除 | [有内容列表](screenshots/agent-history-populated-conversation-and-delete-action.png)、[删除确认](screenshots/agent-history-delete-confirmation.png) | 完成后自动标题为“只读分析画布节点”，列表显示相对时间和删除；删除有二次确认，本轮取消并保留会话。 |
| 刷新恢复 | [agent-conversation-restored-after-reload-with-history.png](screenshots/agent-conversation-restored-after-reload-with-history.png) | 页面刷新后自动恢复当前会话、消息、工具摘要和回复；新建空会话后也可从历史切回。 |
| Mutation 请求提交前 | [agent-mutation-plan-request-manual-mode-ready.png](screenshots/agent-mutation-plan-request-manual-mode-ready.png) | 第二轮真实请求处于手动模式，要求只提出计划并等待确认、禁止写画布、运行模型或消耗积分。 |
| 通用审批边界 | [agent-mutation-plan-request-unsupported-no-approval-final.png](screenshots/agent-mutation-plan-request-unsupported-no-approval-final.png) | Agent 明确表示当前没有创建文本节点的工具，也不存在通用的“计划后暂停等待确认”模式；仅在信息不足或不可逆操作时可能调用 `ask_human`。本轮未创建节点、未运行模型、余额仍为 100。 |
| 多会话历史 | [agent-history-two-conversations-auto-titles.png](screenshots/agent-history-two-conversations-auto-titles.png) | 第二轮自动标题为“Agent节点创建确认测试”，与第一轮“只读分析画布节点”按相对时间并列；两条会话均保留。 |
| `ask_human` 请求 | [agent-ask-human-missing-requirements-manual-mode-ready.png](screenshots/agent-ask-human-missing-requirements-manual-mode-ready.png) | 第三轮手动模式请求故意缺少主题、风格、时长、画幅和素材，并禁止所有 mutation、模型、媒体和积分消耗。 |
| `ask_human` 控件 | [agent-ask-human-question-answer-ignore-submit-controls.png](screenshots/agent-ask-human-question-answer-ignore-submit-controls.png) | 会话进入“询问中”，出现独立“询问用户”分组、问题、自由回答框、附件、“忽略”和“提交”；不是普通助手文本。 |
| 忽略与恢复 | [忽略后工具记录](screenshots/agent-ask-human-ignored-question-tool-summary.png)、[刷新后问题恢复](screenshots/agent-ask-human-question-restored-after-reload.png) | “忽略”先收为“询问与选项 / A. 其他”；刷新时头部暂时禁用并显示“请稍候”，随后同一问题重新恢复为待回答，忽略未持久化。 |
| 回答与额度门 | [停止回答待提交](screenshots/agent-ask-human-stop-answer-ready-to-submit.png)、[回答短暂入记录](screenshots/agent-ask-human-answer-recorded-after-quota-gate.png)、[免费次数用光](screenshots/agent-free-trial-exhausted-membership-upsell.png) | 提交“停止任务”后短暂显示“询问与回答”，但续跑被全屏会员门拦截；刷新又回到原待回答问题，说明额度失败前回答也未持久化。 |
| 三条会话历史 | [agent-history-three-conversations-including-clarification.png](screenshots/agent-history-three-conversations-including-clarification.png) | 历史新增自动标题“视频制作需求澄清”；与前两条会话并列，删除动作仍逐条提供。 |
| Agent 设置 | [settings-collaboration-and-notifications.png](screenshots/settings-collaboration-and-notifications.png) | 设置包含真人生成协议、自动消费积分的协作开关、浏览器通知和声音。 |
| Seedance 2.0 人像承诺书 | [seedance-2-model-safety-commitment.png](screenshots/seedance-2-model-safety-commitment.png) | 承诺书分为素材合法权益、生成内容责任和违规限制三段；只有先勾选承诺，才会启用“同意并使用”。本轮关闭退出，未签署。 |
| CLI 与 Skill | [CLI / Skill 完整归档](CLI_SKILL_ARCHIVE.md) | Agent 面板会新开 CLI 页面；已完整归档 AI Agent 安装、三平台手动安装、11 个命令页、案例、节点类型、模型 Schema、安装脚本和 Skill 总览，共 180 张连续截图。 |

## 一比一桌面实现基准

以下三张固定为 `1440x900` CSS 视口并保留完整画布背景，用于实现 Agent 抽屉与画布、
浮层和模态框之间的真实空间关系，而不是只复刻孤立组件。

| 基准态 | 截图 | 复刻时重点 |
| --- | --- | --- |
| `ask_human` 主面板 | [agent-ask-human-canonical-desktop-1440x900-hires.png](screenshots/agent-ask-human-canonical-desktop-1440x900-hires.png) | 右侧固定抽屉包含标题工具条、消息区、结构化询问卡和底部忽略/提交；工作流按剩余宽度展示。 |
| 历史对话浮层 | [agent-history-canonical-desktop-1440x900-hires.png](screenshots/agent-history-canonical-desktop-1440x900-hires.png) | 历史列表由头部时钟按钮锚定并覆盖消息区；当前会话使用浅灰选中态，时间右对齐。 |
| Agent 设置模态框 | [agent-settings-canonical-desktop-1440x900-hires.png](screenshots/agent-settings-canonical-desktop-1440x900-hires.png) | 居中模态框覆盖画布和 Agent，保留统一遮罩；协议告警、分组、开关、禁用态和底部动作完整可见。 |

## 目标交互契约

以下输入与输出由入口 UI、官方 Skill/OpenAPI/CLI 和复刻目标综合而来。节点引用、
模型与 Skill 选择已直接观察；即使项目含普通组和示例媒体，本轮 `@` 仍未出现
工作流/资源分组。只读读取、工具阶段、完成、历史、分享门和刷新恢复已实测。
当前 Agent 又明确否定通用“计划-等待-确认”模式，并暴露文本节点创建工具缺口；
`ask_human` 的提问、忽略、回答、刷新和额度阻断已实测；媒体生成的逐次确认、
有额度时的成功续跑、付费任务进度和错误输出仍待验证。

### 输入

- 自然语言文本。
- 本地或资产库附件。
- 可选模型。
- 可选 Skill。
- `@` 节点和模型引用；输入框文案还宣称工作流、资源引用，但含组与示例媒体的
  当前项目仍未显示这两类对象。
- 手动/自动生成策略。

### 输出

- 对话消息；当前没有观察到通用的计划审批输出。
- 画布节点、边和分组的 mutation。
- 图片、视频、音频等异步生成任务。
- 进度、结果、失败原因和可继续操作的上下文。

### 风险门

- 免费用户当前 UI 显示每日会话额度。
- 常规设置曾显示每日 1 轮，首次发送确认显示每日 3 轮；实现不可把活动额度
  硬编码为固定值，应以服务端 entitlement 为准。
- 当前设置显示每日 3 轮；第三条会话的 `ask_human` 回答尝试续跑时出现“免费体验
  次数已用光”。不能仅据此断言会话、消息或工具续跑的具体计数单位。
- 自动模式可能直接消耗积分，开关文案必须明确。
- 手动模式文案是“每次生成前询问”，不等同于所有画布 mutation 都先展示计划；
  当前 Agent 明确表示不存在通用执行前审批，仅可能因信息缺失或不可逆操作调用
  `ask_human`。
- 真人生成依赖安全协议与上游图片合规结果；Seedance 2.0 承诺书未勾选时
  “同意并使用”不可用，未签署账户会在遇到人像时避开该模型。
- 新会话、生成中、完成、部分失败和失败需要可恢复，而不是只保留瞬时聊天消息。

## 建议状态机

以下是 NovaVideo 的复刻建议，不是 LibTV 已观察状态或官方状态枚举。若追求
1:1 当前行为，必须把通用 `AWAITING_CONFIRMATION` 视为条件分支，而非固定阶段：

```text
RECEIVED -> PLANNING -> AWAITING_CONFIRMATION -> APPLYING -> GENERATING
-> COMPLETED | PARTIAL_FAILED | FAILED
```

单个远程任务：

```text
QUEUED -> LEASED -> RUNNING -> CANCELLING
-> SUCCEEDED | FAILED | CANCELLED | COMPLIANCE_BLOCKED
```

交互工具至少还需要：

```text
RUNNING -> AWAITING_HUMAN -> RUNNING
                         -> ENTITLEMENT_BLOCKED
```

回答或忽略必须先原子写入工具结果，再校验下一次 Agent 续跑额度。当前实测在额度
阻断后刷新会重新出现原问题，复刻时不应保留这一丢失用户决策的行为。

## 待补状态

- 对话重命名，以及分享链接创建、撤销和匿名访问效果。
- `@` 工作流和资源分组的触发条件，以及引用失效、权限不足和跨画布定位。
- 手动媒体生成的逐次确认，以及有可用额度时 `ask_human` 回答后的成功续跑。
- `ask_human` 忽略、回答和额度失败之间的持久化修复与幂等恢复。
- 当前工具集支持的 mutation 类型；文本节点创建已由 Agent 明确报告不支持。
- 生成中、取消、重试、部分失败和恢复。
- Agent 生成或修改图时的节点级 diff。
- 断网、Redis/GA 超时和并发冲突后的恢复语义。
