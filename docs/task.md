# NovaVideo 任务状态

目标：复刻 LibTV 的网页能力，重点是**工作流无限画布 + 故事板**，后续交由其他团队对接真实模型。

技术栈：Next.js 15 (App Router) + TypeScript + Tailwind v4 + @xyflow/react + zustand。
开发端口 `3200`。验证命令：`pnpm typecheck` / `pnpm lint` / `pnpm test` / `pnpm build` / `pnpm e2e`。

> **`pnpm build` 必须跑。** Next.js 只允许 route 文件导出固定的几个名字，
> `tsc --noEmit` 接受多余的导出而 `next build` 会拒绝——曾经出现过
> typecheck / lint / test / e2e **全绿但生产构建挂掉**的情况。
>
> ~~别在 `pnpm dev` 运行时跑 `pnpm build`~~ —— **已结构性修掉**（第十轮）：
> 生产构建现在落在 `.next-prod`，与 dev 的 `.next` 不再共用，两条命令可以同时跑。

## 已完成

- [x] 领域模型：`Space / Folder / Project / Canvas / WorkflowDocument / Node / Edge / Group`
- [x] 可编辑 `WorkflowDocument` 与冻结 `ExecutionSpec` 分离（`src/domain/compile.ts`）
- [x] 唯一写入路径 `applyMutations` + `expectedRevision` 乐观锁；客户端 `commitWith` 串行化
- [x] 边合法性：类型约束、重复边抑制、循环依赖拒绝
- [x] 工作流画布：平移/缩放/小地图/网格吸附/连线显隐/自动整理/撤销重做
- [x] 11 种节点类型 + 节点检查器（模型目录、输出参数、运镜库、音色库、镜头表）
- [x] 普通组 / 分镜组（画幅、宫格、序号、拼接、转普通组），转分镜组资格校验
- [x] 工具箱预设（一次创建成组节点与依赖边）、风格库、特效库、角色库、生成历史
- [x] 全套快捷键 + 快捷键面板
- [x] 资产管理侧栏（画布元素 / 个人 / Agent 三层）
- [x] 故事板：音频/文本/图片/视频四列投影、视频筛选、列展开、媒体详情、参考元素回溯
- [x] 视频合成剪辑器（时间线、转场、字幕、导出门槛）
- [x] Agent 面板：会话、ask_human、mutation 提案确认门、上下文 chip、@ 引用、额度门
- [x] 生成管线：报价 → 确认门 → 预占 → 运行 → 结算/返还，可插拔 `GenerationProvider`
- [x] 内置离线 provider（SVG 静帧、真实 WAV、ffmpeg MP4）
- [x] 项目/文件夹管理页（重命名、副本、移动、删除、精确名删除文件夹）
- [x] 积分账本（获取/消耗/返还，`logicalChargeId` 幂等）
- [x] Video 专项：节点挂载式 660px 逆缩放编辑器、36 项版本化模型目录、能力/素材依赖
      联动、AutoLink、Storyboard 同组件同状态复用与 Mock Models API/OpenAPI

## 修过的关键 bug

- 并发提交竞态：两次快速操作共用同一 `revision`，后者 409 后**静默丢弃用户编辑**。
  改为提交队列串行化 + 409 时 rebase 重放一次。
- 节点放置竞态：位置在提交前计算，导致连续新建节点重叠。改为在队列内用最新文档计算。
- `ReactFlowProvider` 嵌套两层：工具栏、快捷键、侧栏定位拿到的是空 provider，
  缩放/适应画布/定位全部静默失效。改为只保留 `CanvasWorkspace` 一层。
- 新建节点会跑到视口外且不跟随，改为必要时平移相机。

## 后续补完（本轮）

- [x] 领域层单元测试 70 项（mutations / compile / storyboard / models），经变异测试验证
- [x] README、ARCHITECTURE、HANDOFF 文档
- [x] 导演台：俯视走位图 + 机位预览双视口，真透视投影、机位/角色/道具编辑、镜头表
- [x] 脚本 V2：剧本解析 → 镜头表 → 资产准备 → 提示词合成，批量生图/生视频有门控
- [x] 资产库有内容态：分类、搜索、标签筛选、批量（上限 50）、软删除、文件夹
- [x] 故事板图片工具：裁剪/旋转、打光、多角度、情绪、全景、九宫格预设
- [x] 故事板视频再生成配置（模型/画幅/分辨率/时长/数量/运镜/特效）
- [x] E2E 11 项全绿，含三个全屏编辑器的真实浏览器渲染验证

## 又修掉的 bug

- ReactFlow 受控选择被两个 handler 同时写入，互相覆盖导致**无限渲染循环**打空画布。
  改为单一所有者（`onNodesChange` 的 select 流），并加差异守卫。
- 传给 ReactFlow 的 `snapGrid`/`panOnDrag`/`proOptions`/`multiSelectionKeyCode`
  每次渲染都是新字面量，会被同步进内部 store 触发再渲染，已提升为模块常量。
- d3-zoom 的 dblclick 处理会 `stopImmediatePropagation`，吞掉双击建节点，已关闭 `zoomOnDoubleClick`。
- 导演台节点默认 `extra.scene` 是 `{cameras:1}`（数字），传给 `cloneScene` 直接崩。
- `.float` 自定义 utility 与 Tailwind `float-*` 撞名，Agent 按钮变白底白字。
- E2E 之间共享 `.data` 导致状态泄漏，新增 dev-only `/api/dev/reset` 并在 beforeEach 调用。

## 第三轮完成

- [x] 资产真实上传：multipart 落盘、MIME 白名单、50MB/50 文件上限、
      `staging → committed` 真实两阶段（校验不过不留残片）、XHR 真实进度、
      PNG/JPEG 头部解析尺寸、放弃的 staging 行有 TTL 清理
- [x] 发布与公开只读快照：不可变快照（冻结时 `jobId` 归零 + 深拷贝）、
      `/showcase` 画廊、只读详情页（工作流/故事板双投影，复用 `projectStoryboard`）、
      撤销后详情路由立即 404、编辑器分享按钮接上真实发布
- [x] 补 `eslint.config.mjs`（ESLint 9 flat + FlatCompat 桥接），首次运行清掉 8 处死代码
- [x] 嵌套 Dialog 的 Esc：改用模块级 dialog 栈，只有最顶层响应

## 第三轮修掉的 bug

- **隔离区可被绕过**：`GET /api/assets` 只过滤 `!== 'revoked'`，未过内容闸门的
  `staging` 行会被列进资产库。改为只列 `committed`。
- **上传 SVG 的存储型 XSS**：`/api/media` 以 `image/svg+xml` 内联返回，SVG 作为文档
  打开会在本源执行脚本。加 `Content-Security-Policy: default-src 'none'; sandbox`
  与 `X-Content-Type-Options: nosniff`。
- **TopBar 内的弹层被画布节点盖住**：分享/删除画布对话框渲染在
  `pointer-events-none z-30` 的顶栏容器内，继承了该层叠上下文，节点卡片浮在其上并吞掉点击。
  已把弹层提到该容器之外。

## 第四轮完成

- [x] 上传取消真正撤销服务端提交：客户端上传令牌 + 撤销端点，覆盖
      「取消早于 / 期间 / 晚于 commit」三种竞态，磁盘字节一并清除
- [x] SVG 消毒器（`src/server/svg-sanitize.ts`）：元素/属性白名单 + 重新序列化，
      URL scheme 先解码再匹配（具名/数字实体、缺分号、控制字符、NUL）
- [x] **消毒器已接入上传校验链路**，并把清洗后的字节写回磁盘 —— 落盘的永远只是
      序列化器写出来的内容。同时删掉了原来那个基于正则的 `hasActiveContent`：
      它对 `<svg:script>` 返回 false，留着只会被人误当成安全检查复用
- [x] `/api/media` 加 CSP sandbox + nosniff（纵深防御，独立于消毒器）
- [x] 文档修正：`GET /api/assets` 只返回 `committed`；补齐 upload / publish /
      dev-reset 三组端点；删掉「没有上传端点」「/api/assets 无前端调用方」等已过期表述

## 第四轮修掉的安全问题

- **消毒器是死代码**：模块写好了但零调用点，线上仍在用正则闸门。
  实测 9 个 payload 里 7 个会被原样存盘，其中 `<svg:script>` 是**无需交互、
  直接自动执行**的存储型 XSS（正则要求 `<script` 紧邻，`<svg:script` 不匹配）。已接线。
- **`/\host` 反斜杠 authority 逃逸**：`isSafeUrl` 只挡 `//` 和 `\` 开头，
  但 WHATWG 解析器把反斜杠当斜杠，`/\evil.example/x.png` 会解析成外站绝对地址
  （存储型外链信标）。折叠两种拼写后再判断。
- **取消令牌两端不一致**：POST 会 `trim()` 而 DELETE 不会，导致带空白的令牌
  上传成功却撤销不了 —— 正好废掉这个端点存在的意义。

## 第五轮完成

- [x] **级联删除统一**：删会话 / 删项目 / 删文件夹三条路径各自推导级联且已经跑偏——
      只有删会话会清消息。抽到 `store.ts` 的 `deleteSessions` / `deleteProjects`，
      三处共用，并加了 5 条测试钉住（含"孤儿消息"这条回归）。
- [x] **`pagehide` 误撤销**：原逻辑把所有 `validating` 中的上传一并撤销。这些是字节
      已 100% 传完、用户从未点取消的上传，校验中按 F5 就被静默销毁；而站内软导航
      不触发 `pagehide`，同样意图下点链接却能存活。收窄为只撤销用户真正取消的。

## 第六轮完成

- [x] **时间线导出成片**：`composeTimeline` 用 ffmpeg 真实渲染——按 in/out 裁切、
      逐片段变速、三种转场（淡入淡出/黑场/白场，经 signalstats 逐帧验证是真混合
      而非硬切）、字幕。剪辑器的「导出到本地 / 导出到画布」接上真实渲染。
      **字幕降级已如实标注**：本机 ffmpeg 未编译 libfreetype，走 muxed 字幕轨而非烧录。
- [x] **上传并发压测**：批量上限、并发一致性、交错取消、内存增长、目录卫生。
      实测结论写进测试注释：**没有流式路径，峰值内存随 in-flight 字节线性增长 2–4 倍**
      （32 请求 × 8MB = 256MB in-flight → 峰值 +624MB）。这是如实记录的限制，不是通过的断言。

## 第六轮修掉的安全问题

- **符号链接穿越**（`compose.ts` 与 `/api/media` 两处）：原先只做文本层
  `path.resolve` + `startsWith`，不解引用。MEDIA_DIR 里的软链会被原样交给读取方，
  可读到目录外任意文件。改为 realpath 后重新校验包含关系（root 自身也可能是软链，
  两端都要解引用）。已加 5 条回归测试，并用变异法确认：撤掉修复后恰好那两条软链用例失败。

## 第七轮完成

- [x] **Skill 技能库**：`/skills` 与 `/skills/[skillId]`。13 个 Skill、6 个分类，
      全部/收藏/我的三种集合，搜索与分类筛选，收藏可从卡片直接切换并持久化。
      详情页把 executable spec 渲染成有标题的结构分节，不是 JSON dump。
- [x] **账户与积分**：`/account`。余额、四项汇总（累计获取/已结算消耗/已返还/冻结中）、
      积分用途（价格由模型目录推导）、以及 获取/消耗/返还 三本明细。
      `GET /api/ledger` 此前**没有任何前端调用方**，现在有了。
- [x] **导航接线**：`/skills`、`/showcase`、`/account` 三个页面此前**全站没有任何入口链接**，
      点不到就等于不存在。已在首页接上。
- [x] **两处 Skill 存根接上真目录**：首页与 Agent 面板的技能菜单原本是 3 条硬编码字符串，
      现在读 `SKILL_CATALOGUE`；Agent 侧改为注入带版本的 context chip 而不是往草稿里拼句子。

## 待办

- [x] **协作 presence / 跟随** —— 已完成。我此前把它标成"明确不做"，理由是
      「需要此处不存在的实时传输层」——**这个判断是错的**：App Router 的 route handler
      直接返回 `text/event-stream` 的 `ReadableStream` 就是 SSE，本来就在技术栈里。
      已实现：SSE 扇出、心跳、TTL 过期、远程光标、头像堆、跟随相机（本地平移 / Esc /
      取消按钮三条独立逃逸路径）。

      **状态边界经实测守住**：presence 全程不碰 `.data/workspace.json`
      （跑完 SSE + 心跳 + 滥用探测后 md5 与 mtime 一字节未变），不走
      `withState` / `applyMutations`——光标移动不是文档编辑。

      **部署限制（如实记录）**：进程内扇出只在**单实例**内成立，多实例需要共享总线
      （与文件 store 换 Postgres 是同一类问题）。
- [x] ~~取消令牌表会随请求线性增长~~ —— **这条我之前写错了**。复查发现
      `sweepUploadTickets` 已经接在 upload 路由的两个 handler 里，令牌表被 30 分钟
      TTL 界住，不是无界增长。残留的只是"窗口内每次写都全量重写文档"，而这属于
      单文件 JSON store 的固有特性（换 Postgres 即消失），不是令牌特有的问题。

## 第八轮完成

- [x] **补齐交接文档**：`presence` / `skills` / `account` / `compose` 四组接口此前在
      HANDOFF 与 README 里**零处提及**。已补上契约、约束与两条不可破坏的性质
      （presence 不进持久化文档、跟随必须可逃逸），以及字幕烧录降级与单实例扇出两个限制。
- [x] **修生产构建**：`src/app/api/ledger/route.ts` 导出了 `buildCharges` / `projectLedger`
      等非法名字。已把投影拆到 `src/server/ledger-view.ts`，路由只留 `GET` 与 `dynamic`。

## 第九轮完成

- [x] **生产构建冒烟**：此前**没有任何东西跑过构建产物**——E2E 全部打在 `next dev` 上。
      而生产模式与 dev 有实质差异（Strict Mode 双调用消失、打包与 server component
      边界是真的、`NODE_ENV` 门控生效）。新增 `e2e/production.spec.ts`：对 `next start`
      跑通「建项目 → 建节点 → 提示词 → 确认门 → 真实生成 → 产物 → 故事板投影」全链路，
      并验证 `/api/dev/reset` 在生产下确实 **403**。未设 `PROD_URL` 时自动跳过，
      默认套件仍指向 dev。
- [x] `pnpm verify`（typecheck + lint + test + build）与 `pnpm e2e:prod` 两个脚本。

## 第十轮完成

- [x] **`.next` 共用坑结构性修掉**：`next.config.ts` 的 `distDir` 改为读 `NEXT_DIST_DIR`，
      `build` / `start` 脚本设成 `.next-prod`。此前这个坑是靠本文顶部一条加粗警告挡的，
      而它**又一次发生了**——接手时 3200 上挂着一个 18:35 启动、18:37 被 build 打成 500
      的孤儿 dev server，Playwright 的 `reuseExistingServer` 探到端口占用就复用它，
      于是 `pnpm e2e` 直接 EADDRINUSE 起不来。文档挡不住的东西改用结构挡。
      验证方式是复现原场景：dev 跑着时跑 build，前后各 curl 一次，都是 200。
- [x] **`pnpm e2e:prod` 不再自伤**：`playwright.config.ts` 的 `webServer` 原先无条件起
      `pnpm dev -p 3200`，哪怕测试目标是 3300 的生产服务器——而 dev 会重写正在被测的
      那份产物。现在按 `PROD_URL` 分支：设了就用 `next start` 伺服 `.next-prod`，
      没设才起 dev。顺带 `e2e:prod` 变成自带服务器，不用再手工先起一个。
- [x] **HANDOFF 第 5 节「明确没有实现的部分」逐条对代码核实**。这节的开场白是
      "不要从类型定义反推功能存在"，但它自己有 6 条把**已经做完**的东西列成了"没有"
      （presence / ledger 前端调用方 / skills / compose 导出端点 / server 层单测 /
      级联删除孤儿消息），与同文件第 4 节的接口表直接矛盾。交接文档这样错的方向最坏：
      接手方会照着重造一遍。已全部改成带文件:行号的可验证表述，并标注核实轮次。
      同时**保留**了两条复查后确认仍然准确的（画布侧栏资产页是 `AssetSidebar.tsx:57`
      的硬编码空数组；`compile.ts` 确实不读 timeline/transitions/subtitles）。
- [x] 顺带把测试覆盖写成实测表格：`src/server/generation/` 与 `agent.ts` 引用数**为 0**，
      而这两个恰是 HANDOFF 第 1、3 节让接手方动的模块。

## 交接注意

- 真实模型接入只需实现 `src/server/generation/provider.ts` 的 `GenerationProvider`
  并 `registerProvider`，后注册者覆盖内置 mock。
- 存储层只有 `src/server/store.ts` 知道持久化细节，换 Postgres 只需重写该文件。
- Agent 换成真实 LLM 只需替换 `src/server/agent.ts` 的 `planTurn`，协议保持不变。
