# LibTV 公开产品地图

研究范围：未登录公开首页、Skill、CLI、TV Show 和作品详情。动态价格、模型和活动只记录为“目录/权益存在”，不固化为产品常量。

## 用户角色

| 角色 | 主要入口 | 核心目标 |
| --- | --- | --- |
| 游客/观众 | 首页、TV Show、作品详情 | 发现和观看作品，作者允许时查看只读制作过程。 |
| Web 创作者 | 首页创作框、画布、Skill | 用提示词、附件、模型或 Skill 创建和编辑作品。 |
| Skill 使用者 | Skill 市场、Agent | 发现、收藏、添加并执行结构化创作流程。 |
| Skill 作者 | 我的 Skill、CLI | 创建和维护可复用流程；Web 发布流仍待确认。 |
| Agent/自动化用户 | CLI | 管理 workspace/project/group/node、上传素材并运行模型。 |
| 团队用户 | 账户、CLI scope | 在团队空间内共享项目与配额；权限矩阵待确认。 |
| 会员/付费用户 | 会员超市、充值 | 获得积分、并发、存储、加速和功能权益。 |

## 信息架构

1. 首页：活动、创作启动、推荐 Skill、TV Show。
2. Skill：市场、收藏、我的、详情与使用。
3. Workspace/Project/Canvas：容器、画布文件、工作流/故事板和节点。
4. Agent/CLI：自然语言规划、命令、任务和结果。
5. Assets/Models：上传、生成历史、角色/风格/特效、模型 schema。
6. TV Show：分类、搜索、作品详情、播放和公开制作过程。
7. Account/Billing：个人/团队、会员、积分、存储、订单、发票、凭据。

## 核心旅程

### Web 创作

自然语言/Skill -> 附件与模型 -> 生成策略 -> 登录/额度校验 ->
创建或进入画布 -> Agent 计划 -> 人工确认或自动执行 -> 节点任务 ->
生成资产 -> 编辑/发布。

### CLI 创作

安装 -> `login web` -> 选择个人/团队 scope -> create/use workspace 和
project -> upload -> 创建节点/边 -> 用户确认 -> `--run` ->
轮询节点状态 -> 返回画布与媒体链接。

### 公开发现

TV Show 分类/搜索 -> 作品详情 -> 立即观看 -> 作者允许时进入只读工作流/故事板 -> 可能的复制/创建入口。

## 公开状态与限制

- 作品制作过程分为未公开和公开只读两种状态。
- 生成任务可能持续十几分钟以上，官方建议轮询状态而不是重复提交。
- 失败是否扣费/返还取决于当前规则，不能假定所有失败都免费。
- 订阅积分、会员权益、并发和模型单价会变化。
- 首页发送后究竟总是新建画布还是复用当前项目，未登录公开页面无法确认。
- Skill 创建、审核、版本和运行隔离机制未公开。
- 团队角色、权限和资产所有权细则未公开。

## 官方入口

- <https://www.liblib.tv/>
- <https://www.liblib.tv/skill>
- <https://www.liblib.tv/cli>
- <https://resonate.feishu.cn/wiki/Loxfw6XHziYRk0kKzdjcFfp9nhb>
- <https://resonate.feishu.cn/wiki/RjelwT2UoidnTMka2nCc2chGnud>
