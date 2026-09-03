# LibTV 前端高保真复刻设计

**日期：** 2026-09-03  
**状态：** 用户已确认完整目标范围  
**仓库边界：** 纯前端子仓库，所有服务端能力均由本地 mock API 与 fixture 表达

## 1. 目标

以 LibTV 官网当前公开态和登录态产品为主要事实来源，完整复刻其能力布局、页面信息架构、工作流画布、故事板及视频创作与剪辑体验。最终交付以“一模一样的用户体验”为验收目标：官网可观察到的页面、布局、内容结构、交互、状态变化、数据关联、快捷键、异常反馈、刷新恢复与跨视图同步都必须在本仓库中有对应实现；内部代码沿用本仓库的 React 技术栈，不要求与官网内部代码相同。

本仓库不接真实数据库、鉴权服务、计费服务、生成模型或 ComfyUI 运行时。所有 API、长任务、素材和业务数据均由确定性的本地 mock/fixture 提供，但 API 契约按未来真实后端可实现的形式设计。

## 2. 事实来源与证据规则

产品事实按以下优先级记录：

1. LibTV 官网实际可见界面与真实交互结果；
2. 浏览器网络请求和响应；
3. 官网下发的前端 bundle、路由和静态资源；
4. 为补齐演示闭环而定义的本地 mock 行为。

GitHub 项目、LibTV Skills、ComfyUI 和类似产品只用于理解通用实现模式，不作为 LibTV 产品行为的判定依据。文档中的每项结论标注为 `observed`、`network-confirmed`、`bundle-inferred` 或 `mock-designed`，避免把推断写成官网事实。

需要登录态时，由用户在已打开的 LibTV 浏览器标签页中完成登录、验证码或账户选择；研究过程不保存 Cookie、Token、Access Key、手机号或验证码。素材下载后本地化，不使用官网远程地址作为测试依赖。

登录完成后持续复用同一个浏览器 profile 和官网标签页，由浏览器维护会话凭证。页面出现疑似过期状态时，先在原标签页刷新并以实际页面状态和网络响应验证会话；只有官网明确要求重新登录、验证码或人工确认时再次呼叫用户。研究文档仅记录认证方式、请求头字段名、状态码和脱敏后的协议形状，不落盘会话值。

### 2.1 项目级 Skill 使用规则

执行过程中需要专门能力时，可以从 GitHub 选择合适的 Skill 安装到当前项目目录。安装遵循以下约束：

- 仅在当前项目中使用，不修改无关项目；
- 固定仓库 URL、commit SHA 和版本；
- 安装前检查 `SKILL.md`、依赖、许可证和脚本内容；
- 在项目研究文档中记录来源、用途和固定版本；
- Skill 只帮助研究、设计、实现或验证，不改变“LibTV 官网是产品事实来源”的规则；
- 安装后仍由本项目测试和人工视觉检查证明结果，不以 Skill 自报成功作为完成证据。

## 3. 验收边界

### 3.1 必须覆盖

- 首页与创作入口；
- 项目、文件夹与多画布管理；
- 工作流/故事板双视图；
- 节点创建、编辑、拖拽、缩放、连线、分组、选择、复制、删除、撤销与重做；
- 文本、图片、视频、视频合成、导演台、音频、脚本、风格、特效和资产节点；
- Agent 面板及其上下文引用、确认和执行状态；
- 素材库、生成历史与媒体详情；
- Skill、TV Show、公开制作过程和账户/积分的前端界面；
- 视频生成配置、任务状态、结果详情、故事板映射和多轨剪辑；
- 官网可观察到的加载、空白、禁用、确认、运行、成功、失败、取消、重试和冲突状态；
- 与前端行为对应的 mock API、OpenAPI 和示例数据。

### 3.2 明确不在本仓库实现

- 真实账户认证、团队权限和用户管理；
- 真实支付、积分扣费和发票；
- 真实模型调用、GPU 调度与内容审核；
- 真实对象存储、数据库、消息队列和多实例协作；
- ComfyUI、第三方模型平台或 LibTV 私有服务的实际连接。

这些能力的页面、请求、返回与状态仍需由 mock 完整呈现，保证未来后端可以按契约替换。

## 4. 产品信息架构

```text
首页
├── 快速创作入口
├── LibTV Agent
├── Skill 入口
└── TV Show

项目
├── 文件夹
├── 项目列表
└── 多画布
    ├── 工作流
    │   ├── 节点与连线
    │   ├── 分组与预设
    │   ├── 素材/角色/历史/工具箱
    │   └── Agent
    └── 故事板
        ├── 文本
        ├── 图片
        ├── 视频
        ├── 音频
        └── 媒体详情与剪辑

全局 Surface
├── Skill 市场与详情
├── TV Show 与只读制作过程
├── 素材库
└── 账户、积分与账单
```

工作流与故事板是同一份 `WorkflowDocument` 的两个投影，不维护两份独立数据。任何节点、任务或产物变化都必须在两个视图中一致呈现。

## 5. 前端架构

```text
Page / Feature Component
          ↓
Domain Store + View Model
          ↓
Typed API Client
          ↓
Next.js Mock Route Handler
          ↓
Scenario Repository
          ↓
JSON Fixture + Local Media
```

建议目录边界：

```text
src/
  app/                       页面与 mock Route Handlers
  components/                共享和现有组件
  features/                  按 canvas/storyboard/video/assets/agent 切分
  domain/                    工作流、任务、故事板和时间线纯逻辑
  contracts/                 API 与事件的版本化类型和 Zod Schema
  api/client/                页面唯一允许调用的 API Client
  mocks/fixtures/            结构化业务数据
  mocks/scenarios/           可切换状态场景
  mocks/repository/          mock 数据读写与时序模拟
public/fixtures/libtv/       本地图片、视频、封面和头像
docs/research/libtv/         官网研究证据
docs/api/                    面向未来后端的正式契约
```

页面组件不直接 import fixture，业务组件不直接调用 `fetch`，mock 路由不持有 UI 状态。真实后端接入时只替换 API Client 的 base URL 和传输实现。

## 6. Workflow 设计

继续保留两个模型：

- `WorkflowDocument`：可编辑节点、边、组、视口和 UI 配置；
- `ExecutionSpec`：从选定目标反向解析依赖后冻结的执行快照。

工作流必须支持：

- 节点和边的稳定 ID；
- 端口/媒体类型校验；
- 重复边与循环依赖拒绝；
- 输入变化驱动的视频模式变化；
- 组、分镜组和预设工作流；
- 批量移动、复制、删除和自动整理；
- 本地 undo/redo 与 mock revision 冲突；
- 节点任务状态和产物回写；
- 工作流到故事板的纯投影。

ComfyUI 仅作为未来 adapter 边界：`WorkflowDocument -> ExecutionSpec -> ComfyPrompt`。当前 mock 执行消费 `ExecutionSpec`，前端不会直接保存底层 ComfyUI 节点图。

## 7. Video 纵向能力

视频是第一优先级的完整垂直切片。

### 7.1 视频节点

- 文生视频；
- 单图首帧；
- 双图首尾帧；
- 视频生视频；
- 图片、视频、角色和资产多参考；
- 模型、模式、画幅、分辨率、时长、数量与音频参数；
- 运镜、特效和高级配置；
- 参数可用性随输入和模型能力联动；
- 生成确认、积分报价和合规提示的 mock 状态。

### 7.2 任务状态

```text
draft
  -> awaiting_confirmation
  -> queued
  -> running
  -> succeeded | failed | cancelled | compliance_blocked
```

mock 场景必须允许测试每个状态、进度变化、取消竞争、失败重试和成功后产物回写，且场景可通过固定 fixture 或明确的 scenario 参数复现。

### 7.3 故事板与详情

- 视频列支持全部、成片和片段筛选；
- 结果卡展示状态、模型、时长和成本；
- 详情包含播放器、参考输入、提示词和再生成配置；
- 详情内的参数变化可创建新的 mock Job；
- 产物可设为关键元素、复制、删除或加入时间线。

### 7.4 视频合成器

- 多轨视频、图片、音频和字幕；
- 拖放、排序、裁切、分割、变速、吸附和缩放；
- 淡入淡出、黑场和白场转场；
- 播放头、时间标尺和同步预览；
- 空时间线禁用导出；
- 导出到本地与导出回画布；
- 导出任务完整模拟 loading/progress/success/failure。

当前阶段输出使用本地 MP4 fixture，交互和 API 仍按真实异步任务设计。

## 8. Mock 数据与素材

所有 mock 数据必须具备确定性 ID、时间、排序和关联关系。最少提供以下数据集：

- 空账户；
- 有项目、有节点和有素材账户；
- 完整视频创作项目；
- 任务运行、成功、失败、取消和合规阻断项目；
- 多画布与 revision 冲突项目；
- TV Show 与公开只读快照；
- Skill、模型目录、资产库和积分明细。

官网素材下载到 `public/fixtures/libtv/`，并在 manifest 中记录本地路径、来源页面、用途、媒体类型、尺寸/时长和采集日期。测试只引用本地路径。

## 9. API 契约与文档

`docs/api/openapi.yaml` 使用 OpenAPI 3.1，作为未来后端和前端 mock 的共同契约。配套文档包括：

```text
docs/api/README.md
docs/api/openapi.yaml
docs/api/ERRORS.md
docs/api/JOB_STATES.md
docs/api/WORKFLOW_CONCURRENCY.md
docs/api/examples/
docs/api/schemas/
```

接口按以下 tag 分组：

- Projects / Folders / Canvases；
- Workflow / Mutations；
- Generation Jobs；
- Video Generation / Composition；
- Assets / Upload / Media；
- Agent Sessions / Messages；
- Skills；
- Publish / Showcase；
- Ledger；
- Presence。

每个接口必须记录 UI 触发动作、请求、成功响应、错误响应、空态、异步状态变化、幂等规则、revision 规则和对应 mock scenario。官网真实协议与本地规范化协议分栏记录，避免为了迁就偶然的前端实现而污染长期契约。

## 10. 官网研究产物

```text
docs/research/libtv/
  pages/<surface>/README.md
  pages/<surface>/screenshots/
  api/ENDPOINTS.md
  api/AUTH.md
  api/ERRORS.md
  api/JOB_STATES.md
  api/captures/
  api/examples/
  interactions/FLOW_MATRIX.md
  interactions/STATE_MATRIX.md
  interactions/SHORTCUTS.md
  assets/MANIFEST.json
```

每条交互证据使用统一格式：

```text
前置状态 -> 用户动作 -> 可见反馈 -> 网络请求 -> 数据变化 -> 恢复/失败行为
```

每条 API 证据使用统一格式：

```text
页面/动作 -> method/path -> request -> response -> UI 消费字段 -> 证据等级
```

## 11. 视觉与交互验收

主验收环境固定为 Chrome、1440×900 桌面视口。每个主要 surface 至少覆盖：

- 初始页面；
- 主菜单/弹层打开；
- 有内容状态；
- 一个长任务状态；
- 一个失败或冲突状态；
- 关键操作完成状态。

视觉回归关注布局边界、间距、字号、颜色、阴影、层级、裁切和滚动，不用动画中间帧作为稳定截图。交互回归使用 Playwright 覆盖鼠标、键盘、拖拽、跨视图同步和刷新恢复。

### 11.1 “一模一样”的证明方式

每个官网 surface 建立由路由、前置数据、视口、滚动位置、弹层状态和交互步骤组成的可重复基准。证明分四层：

1. **能力覆盖一致**：官网能力矩阵中的每项都有实现、明确状态或证据充分的“不适用”说明；最终验收不保留未解释缺口。
2. **交互一致**：关键路径逐步对照，点击目标、拖拽规则、键盘行为、菜单关闭条件、禁用条件、焦点和恢复结果一致。
3. **视觉一致**：固定 Chrome、1440×900、字体、DPR、fixture 和动画时钟，对官网截图与本地截图执行叠图和像素差异检查；动态时间、随机推荐和视频播放帧使用明确遮罩，其余差异逐项修正。
4. **协议一致**：每个已观察官网请求都有脱敏 capture、字段说明、触发动作和 UI 消费关系；本地 mock 可确定性重放对前端有影响的成功与错误形状。

视觉检查既包含自动截图差异，也包含人工检查层级、裁切、滚动、弹层锚点、拖拽反馈和动画节奏。单个静态首页相似不构成完成，必须覆盖完整能力和状态矩阵。

## 12. 验证门槛

每个实现批次必须通过：

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm e2e
```

完成整个目标还要求：

- 官网核心 surface 与能力矩阵不存在未解释缺口；
- Workflow、故事板和 Video 主链路全部有 E2E；
- OpenAPI 覆盖所有 mock 路由；
- mock fixture 能稳定复现所有重要状态；
- 1440×900 视觉基准已人工检查；
- API 文档、TypeScript 合同、mock 实现和页面调用保持一致。
- 登录态研究在会话有效期间完成，所有必要页面和状态均有可追溯证据；
- 项目级安装的 Skill 均固定版本并记录来源，且没有成为未声明的运行时依赖；
- 用户从首页进入项目、完成工作流搭建、视频配置、模拟生成、故事板查看、剪辑和导出的体验与官网逐步对照通过。

## 13. 实施顺序

1. 逐项审计现有代码、研究证据和能力矩阵；
2. 登录官网补齐当前版本的页面、交互与网络证据；
3. 固化 contracts、API Client、scenario mock 和 OpenAPI 骨架；
4. 修正全局导航、项目页和工作台外壳；
5. 打磨 Workflow 画布与故事板共享模型；
6. 完成 Video 节点、详情、任务状态和合成器；
7. 补齐 Agent、Skill、资产、TV Show 和账户等外围 surface；
8. 完成视觉回归、E2E、文档一致性和全量验证。

该顺序允许官网研究与现有代码审计持续进行，但任何产品行为都以官网新证据优先修订。
