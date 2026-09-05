# Kokoro Nova Video / Canvas / Workflow 事实核对与缺口清单

核对日期：2026-09-04。范围是本地 Kokoro Nova fixture、`docs/research/libtv` 已归档的官方观察、Canvas/Video 源码和相关 E2E；本轮只读，不启动或修改 3200 服务，不执行付费生成。

## 证据与结论

| Surface | 已核对事实 | 本地证据 | 当前结论 |
| --- | --- | --- | --- |
| Canvas shell | 官网是独立深色全屏编辑器；顶栏含项目/画布、工作流/故事板、发布/积分/账户/Agent，底部有主工具轨和状态轨。 | `CanvasWorkspace.tsx`、`TopBar.tsx`、`BottomToolbar.tsx`；`e2e/canvas-parity.spec.ts` 的 shell、菜单和几何断言。 | `VERIFIED_LOCAL`；账户、发布和积分仍是 local seam。 |
| Workflow document | 工作流与故事板消费同一 `WorkflowDocument`；节点、边、revision、撤销/重做、viewport 保存和刷新恢复已形成本地持久语义。 | `src/domain/mutations.ts`、`src/lib/editor-store.ts`、`projectStoryboard()`；`e2e/workflow.spec.ts`、`e2e/canvas-parity.spec.ts`。 | `VERIFIED_LOCAL`；真正服务端冲突合并和断线回连仍缺证据。 |
| 混合节点 | 同一画布可共存文本、图片、视频、音频、Script V2、导演台、工具箱、风格/特效等节点；Script V2 以阶段摘要和打开入口呈现。 | `NodeCard.tsx`、`CanvasWorkspace.tsx`；`2026-09-04-live-project-readonly.md`；`e2e/kokoro-nova-parity.spec.ts`、`e2e/workflow.spec.ts`。 | `VERIFIED_LOCAL`（确定性 fixture）；不应为 Storyboard 或 Script V2 建第二份文档。 |
| Storyboard | 音频/文本复合左轨、图片/视频动态列、视频全部/成片/片段筛选、详情/定位/副本/Agent 引用和剪辑入口已覆盖。 | `src/components/storyboard/*`；`e2e/canvas-parity.spec.ts`、`e2e/video-compositor.spec.ts`。 | 投影核心 `VERIFIED_LOCAL`；官网有效输入和真实网络导出仍待观察。 |
| Video node | 660px 逆缩放编辑器、36 项模型、模型能力联动、参考边、编号 `@` 引用、局部元素、23 项运镜、收藏/搜索/Escape、Storyboard 复用已覆盖。 | `VideoNodeEditor.tsx`、`VideoModelCatalog.tsx`；`e2e/video-editor.spec.ts`。 | `VERIFIED_LOCAL`；真实运行/取消/失败/变换成功和账户动态权限未确认。 |
| Material / character | 风格/特效目录具备 scope、搜索、分类、商用、模型、分页、详情、收藏和显式“应用后创建节点”；角色库要求先选角色，再展示四类参考并应用四个图片节点。 | `LibraryPanels.tsx`、`src/contracts/materials.ts`、`src/server/materials.ts`；`e2e/material-catalog.spec.ts`、`e2e/character-library.spec.ts`。 | `VERIFIED_LOCAL`；目录失效、权限和输出消费规则仍是后续 seam。 |
| Generation history | 官网只读复核看到 `本画布 / 图片 0 / 视频 0 / 音频 0` 范围、所有评级、时间倒序、批量操作和空态；本地目前只有图片/视频/音频 tab 与新旧排序。 | 官方观察：`2026-09-04-live-project-readonly.md`；本地：`LibraryPanels.tsx:733-825`。 | **明确缺口**：history query/filter/batch 还未达到官方 UI 事实。 |
| Compositor | 本地已覆盖空时间线、裁切、分割、变速、重排、独立音轨、转场、字幕、刷新恢复、失败重试和成功 MP4 fixture。 | `e2e/video-compositor.spec.ts`、`e2e/compositor-reliability.spec.ts`、`src/contracts/compose.ts`、`src/server/compose.ts`。 | `VERIFIED_LOCAL`（local renderer）；官网有效输入/导出请求的网络证据仍为 `PARTIAL`。 |

## 按优先级的可执行验收清单

### P0：首屏与共享文档边界

- [~] **P0-CANVAS-01：History 查询态补齐。** `HistoryPanel` 已增加 `scope = canvas | image | video | audio` 与确定性新旧排序；`projectHistoryArtifacts()` 只投影可插入的 image/video/audio artifact，不写入 `WorkflowDocument`，并有 `library-panels` 单测。仍需补评级筛选、批量操作入口和一条桌面 E2E；空集合必须继续显示全部控件。
- [ ] **P0-CANVAS-02：混合节点回归门。** 固定含 text/image/video/audio/script 的 scenario，断言 Workflow → Storyboard → reload 后 node/edge/revision 不变；Script V2 和媒体卡都可回到源节点。现有 `kokoro-nova-parity` 只覆盖新建 video/script 的窄拓扑，需要混合 fixture 作为独立最小切片。
- [ ] **P0-VIDEO-01：视频生成状态与成本门统一。** 每种媒体至少有 awaiting confirmation、queued、running、succeeded、failed、cancelled；停止/重试/刷新保持同一 job，ledger 只出现一条 reserve + settle/release 链。继续保持 deterministic fixture，不做真实付费生成。

### P1：后端承接与恢复

- [ ] **P1-VIDEO-02：能力/权限错误矩阵。** 为模型切换、参考素材数量/类型、分辨率/时长/有声能力和过期报价建立 server mock 错误；E2E 断言 disabled 原因、可见错误、恢复后不重复提交。
- [ ] **P1-STORY-01：剪辑输出归属。** 明确 compose 成功 artifact 的 project/canvas/node 归属，并补媒体缺失、源节点删除、导出取消/失败/重试后的故事板卡片。保持 compositor 时间线作为唯一编辑状态，不复制成第二个文档。
- [ ] **P1-CANVAS-03：协作恢复。** 用两个隔离客户端覆盖 optimistic conflict、租约释放、断线回连、跟随退出和被驱逐刷新；现有本地 presence/租约测试不能替代冲突合并证明。

### P2：高级目录与动态数据

- [ ] **P2-VIDEO-03：目录版本与账户过滤。** 为 Video 36 项、运镜 23 项、风格/特效/角色目录增加 catalog version、未知字段兼容和按账户能力过滤；UI 不把当日官网名称当成永久后端枚举。
- [ ] **P2-STORY-02：官网有效媒体证据。** 在不提交付费任务的前提下，补齐官网有效输入、媒体变体、导出门槛和失败/取消证据；未观察状态继续标记 `PARTIAL`/`PENDING`。

## 最小可独立实现切片

1. **History parity slice（推荐下一步）**：只改 `LibraryPanels.tsx`、`src/contracts` 的 history query（若需要）、panel 单测和一条 E2E；不触碰 workflow reducer，完成官方空态范围/筛选/排序/批量入口。
2. **Mixed-document regression slice**：只新增混合 scenario、`projectStoryboard()` 回归断言和刷新 E2E；不新增产品 UI，先锁住文档/revision 约束。
3. **Job/ledger lifecycle slice**：复用现有 Jobs、`ConfirmGate`、ledger seam，先给 video，再推广到 image/audio/text；不接远端模型，不改真实账户。
4. **Compositor ownership slice**：为成功/失败/取消/重试结果补 artifact 归属与故事板恢复断言；复用现有 local MP4 renderer。
5. **Presence conflict slice**：在独立客户端 fixture 中补冲突/回连；与前三个切片无文件级依赖，可并行实现。

## 文档一致性修正

- `PAGE_GAP_CHECKLIST.md` 和 `visual/2026-09-04-public-discovery-fidelity-audit.md` 仍称 `HomeShowcaseItem` 与 `ShowcaseEntryProjection` 是两套发现 projection；当前源码已有共享 `ShowcaseEntryProjectionBaseSchema`、`SHOWCASE_DISCOVERY_CATALOG` 和稳定 `id === snapshotId`，并有 `src/contracts/__tests__/showcase.test.ts` 锁定这一点。两处已改为“共享 projection 已完成，仍缺动态分页/媒体与认证状态”。

## 核对限制

- `e2e/canvas-parity.spec.ts` 的冷启动审计记录为 14 passed（见 `2026-09-04-e2e-fixture-audit.md`）。
- 本轮尝试运行 `pnpm typecheck && pnpm lint && pnpm test` 时，pnpm 先尝试安装缺失依赖；registry 下载超时，未得到新的测试结果，也未修改源码。
