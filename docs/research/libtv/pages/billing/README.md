# 会员、积分与账单

本页证据同时来自未登录公开会员弹层，以及登录后账户菜单和 LiblibAI 共享账户页。
研究只浏览方案、切换标签、展开规则和打开只读明细；没有点击开通、支付、充值确认、
下载明细、开票或任何会产生交易的动作。

## 入口与产品分层

首页顶部有两个相邻但职责不同的入口：

- “开通会员”进入个人/团队订阅方案，购买持续权益、月度积分、并发和存储。
- “会员超市”进入模型超市，购买模型专享积分包，并可设置积分消耗顺序。

这两个入口不能在复刻中合并成一个充值页。订阅、模型点数包和通用充值具有
不同的 entitlement、有效期、退款规则和账本余额池。

## 模型超市

截图：

- [model-supermarket-packs-consumption-order-entry.png](screenshots/model-supermarket-packs-consumption-order-entry.png)
- [consumption-order-dialog-unauthenticated.png](screenshots/consumption-order-dialog-unauthenticated.png)

已观察：

- 商品卡按模型区分 Seedance 2.0、Lib Image 等专享积分包。
- 卡片展示积分量、首购加赠、预估最大产量、价格、会员购买门槛和登录动作。
- 部分模型权益附带 1080P 等 entitlement，不能只把商品理解为通用积分。
- 模型超市积分在当前规则中到账后 6 个月有效，到期清零且不退不换。
- “设置消耗顺序”会打开独立弹层；未登录时同时出现“未登录”反馈，但仍可看到
  恢复默认、取消和应用动作，以及赠送生成次数早于四类积分使用的说明。

## 登录态积分消耗顺序

触发路径：头像 -> 设置消耗顺序。

截图：
[consumption-order-dialog-authenticated-default.png](screenshots/consumption-order-dialog-authenticated-default.png)

登录态弹层明确展示四个可拖拽余额池：免费积分、模型卡积分、订阅积分和通用充值积分。
每项附带来源解释，顶部可恢复默认，底部可取消或应用。大类内部仍按最早到期子项优先；
赠送生成次数属于非积分权益并最先核销。本轮没有拖拽、恢复默认或应用，保持原顺序。

## 创作会员

截图：

- [membership-creator-pricing-tiers.png](screenshots/membership-creator-pricing-tiers.png)
- [membership-creator-annual-pricing-and-entitlements.png](screenshots/membership-creator-annual-pricing-and-entitlements.png)
- [membership-creator-quarterly-period.png](screenshots/membership-creator-quarterly-period.png)
- [membership-creator-monthly-period.png](screenshots/membership-creator-monthly-period.png)
- [membership-creator-entitlements-and-output-entry.png](screenshots/membership-creator-entitlements-and-output-entry.png)

已观察：

- 创作会员提供连续包年、连续包季、连续包月切换。
- 方案卡展示档位、活动价/原价、月积分、积分单价、预估图片/视频产量和开通动作。
- 高档方案的积分可在两个月度配额间选择，因此订单项必须保存用户选中的配额，
  不能只从会员档位反推。
- 权益包括并发任务、云存储、去品牌水印、商用、加速、每日登录积分和训练权益。
- 独家功能包括脚本策划、智能分镜、宫格生成/切分、镜头聚焦、多模态主体库、
  视频剪辑和 720 度全景等；具体组合随方案变化。

## 团队版会员

截图：

- [membership-team-pricing-seats-and-points.png](screenshots/membership-team-pricing-seats-and-points.png)
- [membership-team-quarterly-period.png](screenshots/membership-team-quarterly-period.png)
- [membership-team-monthly-period.png](screenshots/membership-team-monthly-period.png)
- [membership-team-benefits-and-enterprise.png](screenshots/membership-team-benefits-and-enterprise.png)
- [membership-team-output-estimates-and-faq-entry.png](screenshots/membership-team-output-estimates-and-faq-entry.png)

已观察：

- 团队版同样提供年、季、月周期，并以“席位数”步进器计算合计金额。
- 每席位月积分汇总为团队共享配额；部分档位也允许选择两种每席位积分配额。
- 团队权益增加多人画布协作、团队共享资产库、席位管理、积分用量管控、
  项目权限管理、团队资产隔离、快速开票和更高并发/存储。
- 企业版作为单独联系销售入口，覆盖更多席位/积分、集中采购、对公支付和合规。
- 页面提供“每月生成数量/每席位”估算表；估值随模型参数变化，只用于说明展示结构，
  不能作为计费承诺或固定换算率。

免费账户从[账户菜单](../account/screenshots/profile-menu-authenticated-overview.png)
点击“创建团队”，会直接打开已归档的
[团队版会员方案](screenshots/membership-team-pricing-seats-and-points.png)，而非创建表单。
这支持“团队创建受订阅 entitlement 约束”的推断；成员邀请、角色和创建成功态尚未观察。

## 通用积分充值

触发路径：头像 -> 充值。

截图：
[general-points-recharge-packs-and-custom-slider.png](screenshots/general-points-recharge-packs-and-custom-slider.png)

已观察：

- 顶部展示脱敏账户、非会员状态、余额总额和通用/LibTV 专属拆分。
- 固定包为 7,500、15,000、30,000 通用积分，对应页面快照价 500、1,000、2,000 元。
- 固定包要求入门版及以上会员；当前非会员只能看到升级会员门槛。
- 自定义充值同时提供滑杆和数值输入，当前边界展示 600 至 499,950 积分。
- 页面再次声明通用积分有效期 2 年，支付后不退不换。

价格、购买门槛和边界是 2026-07-22 的动态页面快照，复刻时必须由版本化商品配置驱动。

## 积分明细与余额批次

触发路径：头像 -> 积分余额。入口在新标签打开 `liblib.art/calculation`。

截图：

- [points-ledger-acquired-tab-expiry-batches.png](screenshots/points-ledger-acquired-tab-expiry-batches.png)
- [points-ledger-consumed-tab-redacted.png](screenshots/points-ledger-consumed-tab-redacted.png)
- [points-ledger-returned-tab-empty.png](screenshots/points-ledger-returned-tab-empty.png)

页面首先按会员订阅、通用充值、模型卡和免费积分展示余额视图，并提供升级会员、
充值、选购模型卡和设置消耗顺序入口。明细分为三张账页：

| 账页 | 字段与行为 |
| --- | --- |
| 已获取 | 获取时间、来源、生效时间、到期时间、积分值、合计和分页。 |
| 已消耗 | 消耗时间、任务类型、模型、项目名、任务详情、任务 ID、积分值和合计。 |
| 已返还 | 返还时间、任务/模型/项目/详情/任务 ID、返还积分和合计。 |

获取页真实显示同一余额来源下的独立生效/到期批次，支持“最早到期先用”的账本设计。
消耗与返还页提供日期、任务类型和模型筛选；三页均有下载明细和分页。本轮截图中的
个人任务 ID 已在浏览器 DOM 中替换为 `JOB_NO_REDACTED` 后归档，没有修改服务端数据。

## 订阅、购买记录与发票

触发路径：头像 -> 订阅与开发票。入口在新标签打开 `liblib.art/transaction`。

截图：

- [subscription-management-empty-state.png](screenshots/subscription-management-empty-state.png)
- [purchase-records-empty-state-and-invoice-entry.png](screenshots/purchase-records-empty-state-and-invoice-entry.png)

订阅计划管理页展示当前会员；测试账户为空。购买记录表定义交易时间、商品名称、
订单编号、交易金额、交易状态和操作列；当前无记录。FAQ 指定发票从购买记录发起，
因此“操作”列应承载订单详情与可开票状态，而不是为发票建立脱离订单的入口。

## FAQ 规则证据

每组规则均保留展开态截图：

- [faq-points-expiration-rules.png](screenshots/faq-points-expiration-rules.png)
- [faq-membership-and-points-refund-rules.png](screenshots/faq-membership-and-points-refund-rules.png)
- [faq-failed-generation-points-return.png](screenshots/faq-failed-generation-points-return.png)
- [faq-points-consumption-order.png](screenshots/faq-points-consumption-order.png)
- [faq-how-to-get-more-points.png](screenshots/faq-how-to-get-more-points.png)
- [faq-installment-payment.png](screenshots/faq-installment-payment.png)
- [faq-invoice-and-contact.png](screenshots/faq-invoice-and-contact.png)
- [faq-seven-day-benefit-protection.png](screenshots/faq-seven-day-benefit-protection.png)

当前公开规则：

| 规则 | 已观察行为 |
| --- | --- |
| 会员积分 | 按月发放，自到账 31 天有效；到期清零并发放下一周期配额。 |
| 通用充值积分 | 自到账 2 年有效；到期清零，不退不换。 |
| 模型专享积分 | 自到账 6 个月有效；到期清零，不退不换。 |
| 每日登录积分 | 当日有效，次日清零；当前页面展示 20 积分。 |
| 默认消耗顺序 | 免费积分 -> 模型专享积分 -> 订阅会员积分 -> 通用充值积分。 |
| 同类余额池 | 子类型按到期时间优先消耗最早到期项。 |
| 赠送生成次数 | 属于非积分权益，优先于四类积分使用。 |
| 失败返还 | 生成失败后对应积分在 2 小时内返还原账户，并在原明细记录展示返还提示。 |
| 退款 | 会员和积分即时生效，通常不支持退款/转让；重复扣款或系统异常走客服处理。 |
| 发票 | 从“订阅与开票 -> 购买记录”申请。 |
| 7 天权益保护 | 同档位新活动赠品更高可按条件补差；不退订单价差，每笔同模型赠品限一次。 |

以上是 2026-07-21/22 页面公开文案快照。额度、折扣、模型、有效期和政策必须由
版本化商业配置与规则引擎驱动，不能散落为前端常量。

## 目标领域边界

- Entitlement：会员档位、模型可用性、并发、存储和加速权益。
- Wallet：按来源、模型、workspace 和到期时间聚合的可用余额视图，不直接替代账本。
- Quote：绑定价格版本、有效期、余额池顺序和最大金额的生成前报价。
- Ledger：不可变双分录的 reservation、charge、release 和 adjustment。
- Order/Subscription/Invoice：支付、续费、取消、退款和发票的独立生命周期。

账本扣减需保存实际命中的余额批次与顺序版本；失败返还必须引用原始 charge，
不能通过直接修改余额完成。赠送生成次数作为 entitlement counter 单独核销，
不伪装成积分流水。

## 待补状态

- 登录态消耗顺序拖拽/保存、恢复默认、跨设备同步和并发修改。
- 生成前积分预估、余额不足、预占、结算、失败返还和迟到结果的真实任务证据。
- 订阅状态、自动续费、取消、订单详情、支付方式和发票表单。
- 通用充值可购买态、自定义边界校验、支付确认和支付结果。
- 积分明细下载格式、筛选组合、真实失败返还和关联任务详情。
- 加载、价格过期、支付失败、重复支付和权限不足。
