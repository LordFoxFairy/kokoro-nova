# LibTV 复刻调研索引

> 目标站点：<https://www.liblib.tv/>
>
> 调研目标：为 LibTV 能力复刻建立可追溯的页面、流程、状态和协议证据。
> 截图只记录产品界面，不保存明文手机号、Access Key、Cookie、Token
> 或其他凭据。

## 阅读路径

1. 从下方页面覆盖表定位产品 surface。
2. 进入对应页面目录的 `README.md` 查看入口、状态和截图说明。
3. 在 `flows/` 查看跨页面用户旅程。
4. 在 [information-architecture/](information-architecture/) 查看应用地图、
   内容模型和导航规则。
5. 在 `architecture/` 查看从产品行为推导出的服务边界。
6. 在 `references/` 查看官方 Skills、OpenAPI、ComfyUI 和 NovaVideo 对照研究。
7. Video 节点当前实现与官网几何、模型联动的逐项对照见
   [`visual/video-model-editor-comparison.md`](visual/video-model-editor-comparison.md)。
8. 公开 TV Show、Skill、账户三条发现路径的当前实现缺口与收敛顺序见
   [`visual/2026-09-04-public-discovery-fidelity-audit.md`](visual/2026-09-04-public-discovery-fidelity-audit.md)。
9. 当前 `main` 的七个复刻 surface 统一验收门见
   [`REPLICATION_ACCEPTANCE_MATRIX.md`](REPLICATION_ACCEPTANCE_MATRIX.md)；逐页差距、优先级和
   `1440×900` 截图配对分别见 [`PAGE_GAP_CHECKLIST.md`](PAGE_GAP_CHECKLIST.md)、
   [`PRIORITIZED_PARITY_BACKLOG.md`](PRIORITIZED_PARITY_BACKLOG.md) 和
   [`SCREENSHOT_INDEX.md`](SCREENSHOT_INDEX.md)。
10. 线程目标逐项的已证实/未证实证据与不可降级放行顺序见
    [`GOAL_COMPLETION_AUDIT.md`](GOAL_COMPLETION_AUDIT.md)。
11. Clip Editor 与 Text/Script 的官网事实、本地 fixture 与未证实能力边界见
    [`audits/clip-editor-evidence-audit.md`](audits/clip-editor-evidence-audit.md) 和
    [`audits/text-script-evidence-audit.md`](audits/text-script-evidence-audit.md)；运行时错误
    envelope 的跨 transport 迁移矩阵见
    [`../../api/ERROR_ENVELOPE_MIGRATION_MATRIX.md`](../../api/ERROR_ENVELOPE_MIGRATION_MATRIX.md)。
12. frontend-only/mock 的 P0/P1/P2 能力缺口、官网证据等级和逐项验收方法见
    [`audits/frontend-capability-gap-audit.md`](audits/frontend-capability-gap-audit.md)；特殊 transport
    的运行时/文档边界见 [`../../api/SPECIAL_TRANSPORT_CONTRACT_AUDIT.md`](../../api/SPECIAL_TRANSPORT_CONTRACT_AUDIT.md)，
    演示、视觉回归与 CI/GHCR 的质量门见
    [`../../quality/DEMO_AND_VISUAL_QA_AUDIT.md`](../../quality/DEMO_AND_VISUAL_QA_AUDIT.md)。

完整覆盖状态统一查看 [FEATURE_MATRIX.md](FEATURE_MATRIX.md)，不要仅凭页面有截图就判断能力已完成。

## 页面覆盖

| 页面 / surface | 路径 | 当前状态 | 已记录重点 |
| --- | --- | --- | --- |
| 首页 | [pages/home/](pages/home/) | 进行中 | 登录/未登录首页、附件、模型、生成模式、Skill 选择器、TV Show |
| 首次登录引导 | [pages/onboarding/](pages/onboarding/) | 进行中 | 渠道问卷第一步 |
| 账户与全局菜单 | [pages/account/](pages/account/) | 已采集登录核心态 | 菜单、通知、主题、水印、个人中心、CLI 和共享账户域 |
| Skill 广场与详情 | [pages/skills/](pages/skills/) | 进行中 | 收藏、四图轮播、原图、源码、13 节规范及作者表单 |
| Agent 会话 | [pages/agent/](pages/agent/) | 进行中 | 三条真实会话、`ask_human`、额度门、分享、上下文、设置与 [CLI/Skill 完整归档](pages/agent/CLI_SKILL_ARCHIVE.md) |
| Project 与无限画布 | [pages/canvas/](pages/canvas/) | 进行中 | 项目文件夹、项目卡管理、独立 Canvas chrome、媒体工具、Agent 上下文、协作跟随与跨浏览器编辑驱逐 |
| Storyboard 投影 | [pages/canvas/](pages/canvas/) | 进行中 | 同一 workflow document 的动态列、筛选/展开、详情、剪辑入口与 Agent 联动 |
| TV Show | [pages/showcase/](pages/showcase/) | 已采集核心态 | 分类、搜索/推荐回退、详情、只读工作流/故事板、复制登录门槛 |
| 模型与资产 | [pages/models-assets/](pages/models-assets/) | 进行中 | 模型选择、上传、生成历史、角色和跨产品共享资产页 |
| 会员、积分与账单 | [pages/billing/](pages/billing/) | 已采集查询核心态 | 方案、充值、余额顺序、三类账本、订阅/订单与 FAQ；真实支付/结算待补 |

## 跨页面流程

完整步骤、状态门槛和恢复规则见 [flows/](flows/)。

| 流程 | 状态 | 预期覆盖 |
| --- | --- | --- |
| 登录与首次引导 | 进行中 | [登录 -> 问卷 -> 首页](flows/login-onboarding.md) |
| 自由提示词创作 | 进行中 | [输入/上下文已采集；提交、生成和结果待授权](flows/web-agent-creation.md) |
| Skill 驱动创作 | 进行中 | [选择 -> 详情 -> 添加 -> 确认 -> 产出](flows/skill-driven-creation.md) |
| 素材驱动编辑 | 进行中 | [上传 -> 引用 -> 编辑 -> 新产物](flows/asset-editing.md) |
| TV Show 复用 | 进行中 | [浏览 -> 制作过程 -> 登录 -> 复制](flows/showcase-clone.md) |
| 会员与积分 | 进行中 | [方案/点数包 -> 报价 -> 预占 -> 结算/返还](flows/billing-and-subscription.md) |
| CLI / 外部 Agent | 官方契约 | [CLI](flows/cli-automation.md) / [OpenAPI](flows/agent-openapi.md) |

## 参考资料

| 资料 | 路径 | 用途 |
| --- | --- | --- |
| LibTV 官方使用指南 | [references/official-guide/](references/official-guide/) | 基础节点、Slash、图像/视频工具、导演台视觉证据 |
| LibTV CLI | [references/libtv-cli/](references/libtv-cli/) | workspace/project/node/model/NDJSON 契约 |
| LibTV Agent OpenAPI | [references/libtv-agent-openapi/](references/libtv-agent-openapi/) | session/message/upload、轮询、CLI 1.1.1 边界 |
| LibTV 公开产品地图 | [references/public-product/](references/public-product/) | 角色、信息架构、核心旅程、公开状态与限制 |
| ComfyUI 官方源码 | [references/comfyui/](references/comfyui/) | 图编译、验证、队列、缓存、事件、资产与插件边界 |
| GA + Redis 草案 | [architecture/ga-redis-boundary.md](architecture/ga-redis-boundary.md) | NovaVideo 服务边界、Streams、状态机和持久对象 |
| 编排方案比较 | [architecture/orchestration-options.md](architecture/orchestration-options.md) | Postgres queue、Temporal、Redis-centric 三种方案 |

当前共归档 572 张语义命名截图，其中已建立 `1440x900` 的首页、项目管理、
工作流、故事板、Agent 和画布核心入口完整桌面实现基准。截图数量不是完成标准；
页面的空态、进行中、
成功、失败、权限和计费状态仍需按覆盖表继续补齐。

## 截图命名约定

截图放在所属页面的 `screenshots/` 下，名称直接描述状态，不使用无语义流水号：

```text
<surface>-<state-or-action>.png
```

例如：

- `authenticated-overview.png`
- `login-dialog-qr-expired.png`
- `detail-executable-spec.png`
- `generation-running.png`
- `generation-failed.png`

长页面或复杂弹层按信息段拆图；同一能力的空态、运行中、成功、失败分别保留。每张图必须在页面 `README.md` 中说明触发路径与观察结论。

## 证据等级

- **已观察**：当前站内真实 UI、交互或网络行为直接可见；登录态另行注明。
- **官方源码**：来自 LibTV 官方 Skills/OpenAPI 或 ComfyUI 官方源码。
- **推断**：由多个行为或协议迹象推导，必须写明依据。
- **待确认**：受权限、付费、真实生成成本或缺少 GA 实现限制，尚未验证。

## 安全边界

- 不截图或记录明文 Access Key、Cookie、Token、验证码。
- 不提交付费生成、充值、购买、删除项目或其他不可逆操作。
- 需要真实运行才能观察的状态，先记录提交前界面，再单独取得授权。
- 账户标识只保留产品已经脱敏展示的形式。
- Playwright storage state 只保存在被 Git 忽略且权限为 `600` 的本地目录，
  不把 Cookie、Token 或登录二维码归档到 `docs/`。
