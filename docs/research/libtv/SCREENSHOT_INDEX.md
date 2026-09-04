# LibTV 复刻截图索引

审核日期：2026-09-04。截图分为两类：

- `pages/*/screenshots/`：官网直接观察或官网登录态只读研究证据，触发路径与观察结论以对应页面 `README.md` 为准。
- `docs/screenshots/`：Kokoro Nova 本地 mock 的回归基线；不是官网像素证据。文件名含 `1440x900` 的截图已用 CSS viewport 基线采集；部分旧的 showcase/account 截图使用 DPR 2，物理位图为 `2880×1800`。

不归档 Access Key、Cookie、Token、验证码、真实 UUID 或未脱敏账号；账户类截图只保留产品已经脱敏显示的内容。

## 1440×900 核心配对

| Surface | 官网研究截图（证据） | 本地基线（实现） | 覆盖的关键状态 | 相关验证 |
| --- | --- | --- | --- | --- |
| 首页 Home | [home-authenticated-desktop-1440x900-2026-09-03.png](pages/home/screenshots/home-authenticated-desktop-1440x900-2026-09-03.png)<br>[home-composer-focused-empty-desktop-1440x900-hires.png](pages/home/screenshots/home-composer-focused-empty-desktop-1440x900-hires.png)<br>[home-composer-valid-draft-send-enabled-desktop-1440x900-hires.png](pages/home/screenshots/home-composer-valid-draft-send-enabled-desktop-1440x900-hires.png) | [libtv-home-local-1440x900.png](../../screenshots/libtv-home-local-1440x900.png) | 首屏、空 composer、合法草稿、TV Show 首层 | `e2e/home-project.spec.ts`、`e2e/home-visual-parity.spec.ts` |
| Project | [project-authenticated-desktop-1440x900-2026-09-03.png](pages/home/screenshots/project-authenticated-desktop-1440x900-2026-09-03.png)<br>[project-list-canonical-desktop-1440x900-hires.png](pages/canvas/screenshots/project-list-canonical-desktop-1440x900-hires.png)<br>[project-card-actions-menu-desktop-1440x900-hires.png](pages/canvas/screenshots/project-card-actions-menu-desktop-1440x900-hires.png) | [libtv-project-local-1440x900.png](../../screenshots/libtv-project-local-1440x900.png)<br>[libtv-project-collapsed-local-1440x900.png](../../screenshots/libtv-project-collapsed-local-1440x900.png) | 四列管理、收起侧栏、卡片菜单 | `e2e/home-project.spec.ts`、`e2e/home-visual-parity.spec.ts` |
| Canvas / Workflow | [canvas-authenticated-current-dark-desktop-1440x900-2026-09-03.png](pages/canvas/screenshots/canvas-authenticated-current-dark-desktop-1440x900-2026-09-03.png)<br>[canvas-add-node-current-dark-desktop-1440x900-2026-09-03.png](pages/canvas/screenshots/canvas-add-node-current-dark-desktop-1440x900-2026-09-03.png)<br>[canvas-workflow-collaboration-following-desktop-1440x900-hires.png](pages/canvas/screenshots/canvas-workflow-collaboration-following-desktop-1440x900-hires.png) | [libtv-canvas-empty-local-1440x900.png](../../screenshots/libtv-canvas-empty-local-1440x900.png)<br>[libtv-canvas-add-menu-local-1440x900.png](../../screenshots/libtv-canvas-add-menu-local-1440x900.png)<br>[libtv-canvas-populated-local-1440x900.png](../../screenshots/libtv-canvas-populated-local-1440x900.png) | 独立编辑器、添加菜单、节点图、协作跟随 | `e2e/canvas-parity.spec.ts`、`e2e/kokoro-nova-parity.spec.ts` |
| Storyboard | [storyboard-authenticated-current-dark-desktop-1440x900-2026-09-03.png](pages/canvas/screenshots/storyboard-authenticated-current-dark-desktop-1440x900-2026-09-03.png)<br>[storyboard-image-column-expanded-desktop-1440x900-hires.png](pages/canvas/screenshots/storyboard-image-column-expanded-desktop-1440x900-hires.png)<br>[storyboard-video-filter-menu-all-final-clips-desktop-1440x900-hires.png](pages/canvas/screenshots/storyboard-video-filter-menu-all-final-clips-desktop-1440x900-hires.png)<br>[storyboard-with-agent-ask-human-desktop-1440x900-hires.png](pages/canvas/screenshots/storyboard-with-agent-ask-human-desktop-1440x900-hires.png) | [libtv-storyboard-local-1440x900.png](../../screenshots/libtv-storyboard-local-1440x900.png) | 动态列、展开、视频筛选、Agent 侧栏 | `e2e/canvas-parity.spec.ts`、`e2e/workflow.spec.ts` |
| Skills | [market-overview.png](pages/skills/screenshots/market-overview.png)<br>[skill-detail-example-carousel-01-of-04.png](pages/skills/screenshots/skill-detail-example-carousel-01-of-04.png)<br>[skill-detail-example-original-image-lightbox.png](pages/skills/screenshots/skill-detail-example-original-image-lightbox.png)<br>[skill-author-create-editor-fields-and-file-tree.png](pages/skills/screenshots/skill-author-create-editor-fields-and-file-tree.png) | [skills-market-dark-1440x900.png](../../screenshots/skills-market-dark-1440x900.png)<br>[skills-detail-carousel-dark-1440x900.png](../../screenshots/skills-detail-carousel-dark-1440x900.png)<br>[skills-detail-lightbox-dark-1440x900.png](../../screenshots/skills-detail-lightbox-dark-1440x900.png) | 市场首屏、详情轮播、原图层、作者表单差距 | `e2e/skills-parity.spec.ts` |
| TV Show | [catalog-categories-search-and-cards.png](pages/showcase/screenshots/catalog-categories-search-and-cards.png)<br>[player-controls-speed-quality-volume-fullscreen.png](pages/showcase/screenshots/player-controls-speed-quality-volume-fullscreen.png)<br>[public-production-process-readonly-workflow.png](pages/showcase/screenshots/public-production-process-readonly-workflow.png)<br>[public-production-process-readonly-storyboard.png](pages/showcase/screenshots/public-production-process-readonly-storyboard.png) | [showcase-gallery-catalog.png](../../screenshots/showcase-gallery-catalog.png)<br>[showcase-gallery-filters.png](../../screenshots/showcase-gallery-filters.png)<br>[showcase-detail.png](../../screenshots/showcase-detail.png)<br>[showcase-detail-player.png](../../screenshots/showcase-detail-player.png)<br>[showcase-public-workflow.png](../../screenshots/showcase-public-workflow.png)<br>[showcase-public-storyboard.png](../../screenshots/showcase-public-storyboard.png) | 目录、筛选、详情、播放器、只读制作过程 | `e2e/public-discovery.spec.ts` |
| Account | [profile-menu-authenticated-overview.png](pages/account/screenshots/profile-menu-authenticated-overview.png)<br>[profile-menu-dark-mode.png](pages/account/screenshots/profile-menu-dark-mode.png)<br>[ai-watermark-removal-rules-and-toggle.png](pages/account/screenshots/ai-watermark-removal-rules-and-toggle.png)<br>[notifications-official-tab-unread-message.png](pages/account/screenshots/notifications-official-tab-unread-message.png) | [account-ledger.png](../../screenshots/account-ledger.png) | 官网账户菜单/偏好/通知 vs 本地账本；缺菜单基线 | `src/components/account/__tests__/account-surfaces.test.ts`；需新增 Account E2E |

## 首页 Home 状态索引

| 状态 | 官网截图 | 本地实现基线 | 说明 |
| --- | --- | --- | --- |
| 已登录首屏 | [authenticated-overview.png](pages/home/screenshots/authenticated-overview.png) | [libtv-home-local-1440x900.png](../../screenshots/libtv-home-local-1440x900.png) | 活动、导航、快捷创作、最近项目、Agent 和 TV Show 层级 |
| 创作器空态 | [home-composer-focused-empty-desktop-1440x900-hires.png](pages/home/screenshots/home-composer-focused-empty-desktop-1440x900-hires.png) | 同首屏基线中的 composer 空态 | 发送 disabled；输入区获得焦点不改变下方层级 |
| 有效草稿 | [home-composer-valid-draft-send-enabled-desktop-1440x900-hires.png](pages/home/screenshots/home-composer-valid-draft-send-enabled-desktop-1440x900-hires.png) | `e2e/home-project.spec.ts` 运行态 | 发送 enabled；下一步仍缺完整 CreationContext 菜单 |
| 附件来源 | [home-attachment-source-menu-desktop-1440x900-hires.png](pages/home/screenshots/home-attachment-source-menu-desktop-1440x900-hires.png) | local 仅保留按钮和 mock seam | 个人资产库空态与本地上传的差距列在 Home gap checklist |
| 模型 / Skill / 生成模式 | [home-model-selector-desktop-1440x900-hires.png](pages/home/screenshots/home-model-selector-desktop-1440x900-hires.png)<br>[home-model-selector-video-tab-desktop-1440x900-hires.png](pages/home/screenshots/home-model-selector-video-tab-desktop-1440x900-hires.png)<br>[home-skill-selector-desktop-1440x900-hires.png](pages/home/screenshots/home-skill-selector-desktop-1440x900-hires.png)<br>[home-generation-mode-manual-vs-auto-desktop-1440x900-hires.png](pages/home/screenshots/home-generation-mode-manual-vs-auto-desktop-1440x900-hires.png) | local `SkillGallery` 有部分相同视觉；首页 composer 入口待补 | 这些截图是 P0 CreationContext 的直接验收参照 |
| 登录二维码过期 | [login-dialog-qr-expired.png](pages/home/screenshots/login-dialog-qr-expired.png) | local 仅有通用登录提示 | 需保留显式刷新入口，不实现真实二维码/认证 |

## Project / Canvas / Storyboard 状态索引

| 状态 | 研究证据 | local 基线/说明 |
| --- | --- | --- |
| 项目首屏与侧栏收起 | [project-list-canonical-desktop-1440x900-hires.png](pages/canvas/screenshots/project-list-canonical-desktop-1440x900-hires.png) · [project-rename-inline-editor-desktop-1440x900-hires.png](pages/canvas/screenshots/project-rename-inline-editor-desktop-1440x900-hires.png) | [libtv-project-local-1440x900.png](../../screenshots/libtv-project-local-1440x900.png) · [libtv-project-collapsed-local-1440x900.png](../../screenshots/libtv-project-collapsed-local-1440x900.png) |
| 项目卡菜单与删除门 | [project-card-actions-menu-desktop-1440x900-hires.png](pages/canvas/screenshots/project-card-actions-menu-desktop-1440x900-hires.png) · [project-delete-confirmation-dialog-desktop-1440x900-hires.png](pages/canvas/screenshots/project-delete-confirmation-dialog-desktop-1440x900-hires.png) | local 有菜单/确认实现；封面、移动、副本缺完整 E2E |
| 画布空态与添加菜单 | [canvas-authenticated-current-dark-desktop-1440x900-2026-09-03.png](pages/canvas/screenshots/canvas-authenticated-current-dark-desktop-1440x900-2026-09-03.png) · [canvas-add-node-current-dark-desktop-1440x900-2026-09-03.png](pages/canvas/screenshots/canvas-add-node-current-dark-desktop-1440x900-2026-09-03.png) | [libtv-canvas-empty-local-1440x900.png](../../screenshots/libtv-canvas-empty-local-1440x900.png) · [libtv-canvas-add-menu-local-1440x900.png](../../screenshots/libtv-canvas-add-menu-local-1440x900.png) |
| 工作流有内容态 | [workflow-populated-connected-text-image-nodes.png](pages/canvas/screenshots/workflow-populated-connected-text-image-nodes.png) | [libtv-canvas-populated-local-1440x900.png](../../screenshots/libtv-canvas-populated-local-1440x900.png) |
| 故事板列与筛选 | [storyboard-populated-text-image-video-columns.png](pages/canvas/screenshots/storyboard-populated-text-image-video-columns.png) · [storyboard-video-filter-menu-all-final-clips-desktop-1440x900-hires.png](pages/canvas/screenshots/storyboard-video-filter-menu-all-final-clips-desktop-1440x900-hires.png) | [libtv-storyboard-local-1440x900.png](../../screenshots/libtv-storyboard-local-1440x900.png) |
| 故事板 Agent / 详情 | [storyboard-with-agent-ask-human-desktop-1440x900-hires.png](pages/canvas/screenshots/storyboard-with-agent-ask-human-desktop-1440x900-hires.png) · [storyboard-reference-detail-text-node-pending-confirmation.png](pages/canvas/screenshots/storyboard-reference-detail-text-node-pending-confirmation.png) | local 已有侧栏、详情、定位和副本；失败/导出待补 |

## Skills 与 TV Show 状态索引

| Surface | 官网状态截图 | local 状态截图 | 关键差距 |
| --- | --- | --- | --- |
| Skills 市场 | [skill-market-authenticated-favorites-empty.png](pages/skills/screenshots/skill-market-authenticated-favorites-empty.png) · [skill-market-card-favorited-active-state.png](pages/skills/screenshots/skill-market-card-favorited-active-state.png) | [skills-market-dark-1440x900.png](../../screenshots/skills-market-dark-1440x900.png) | local 已覆盖收藏/搜索/分类；composer 三个上下文按钮无动作 |
| Skills 详情 | [detail-hero-and-actions.png](pages/skills/screenshots/detail-hero-and-actions.png) · [detail-executable-spec.png](pages/skills/screenshots/detail-executable-spec.png) · [skill-detail-share-click-tooltip-no-modal.png](pages/skills/screenshots/skill-detail-share-click-tooltip-no-modal.png) | [skills-detail-carousel-dark-1440x900.png](../../screenshots/skills-detail-carousel-dark-1440x900.png) · [skills-detail-lightbox-dark-1440x900.png](../../screenshots/skills-detail-lightbox-dark-1440x900.png) | local 详情链路已可演示；作者/发布/版本失效待补 |
| TV Show 目录 | [catalog-categories-search-and-cards.png](pages/showcase/screenshots/catalog-categories-search-and-cards.png) · [catalog-search-query-results.png](pages/showcase/screenshots/catalog-search-query-results.png) · [catalog-search-no-exact-match-fallback.png](pages/showcase/screenshots/catalog-search-no-exact-match-fallback.png) | [showcase-gallery-catalog.png](../../screenshots/showcase-gallery-catalog.png) · [showcase-gallery-filters.png](../../screenshots/showcase-gallery-filters.png) | local 有 local 空态与 retry；分页/真正空集合/官网 URL 待补 |
| TV Show 详情 / 播放器 | [detail-author-metadata-and-actions.png](pages/showcase/screenshots/detail-author-metadata-and-actions.png) · [player-controls-speed-quality-volume-fullscreen.png](pages/showcase/screenshots/player-controls-speed-quality-volume-fullscreen.png) · [player-quality-menu-auto-480-720-original.png](pages/showcase/screenshots/player-quality-menu-auto-480-720-original.png) | [showcase-detail.png](../../screenshots/showcase-detail.png) · [showcase-detail-player.png](../../screenshots/showcase-detail-player.png) | local 有控件与质量菜单；缓冲/媒体失败/字幕/多音轨待补 |
| TV Show 公开过程 | [public-production-process-readonly-workflow.png](pages/showcase/screenshots/public-production-process-readonly-workflow.png) · [public-production-process-readonly-storyboard.png](pages/showcase/screenshots/public-production-process-readonly-storyboard.png) · [copy-project-authentication-gate.png](pages/showcase/screenshots/copy-project-authentication-gate.png) | [showcase-public-workflow.png](../../screenshots/showcase-public-workflow.png) · [showcase-public-storyboard.png](../../screenshots/showcase-public-storyboard.png) | local 已覆盖只读过程与未登录门；登录后 clone 归属/错误待补 |

## Account 状态索引

| 状态 | 官网研究截图 | local 基线 | 判定 |
| --- | --- | --- | --- |
| 账户菜单 | [profile-menu-authenticated-overview.png](pages/account/screenshots/profile-menu-authenticated-overview.png) | `AccountRail` 只有账户入口；[account-ledger.png](../../screenshots/account-ledger.png) 是账本页 | 需新增深色菜单基线 |
| 暗色主题 | [profile-menu-dark-mode.png](pages/account/screenshots/profile-menu-dark-mode.png) | 无持久主题控件 | `PENDING` |
| AI 水印 | [ai-watermark-removal-rules-and-toggle.png](pages/account/screenshots/ai-watermark-removal-rules-and-toggle.png) | 无 local contract | `PENDING` |
| 通知 | [notifications-official-tab-unread-message.png](pages/account/screenshots/notifications-official-tab-unread-message.png) · [notifications-received-likes-empty-state.png](pages/account/screenshots/notifications-received-likes-empty-state.png) | 无 local route | `PENDING` |
| 账本 | [points-ledger-acquired-tab-expiry-batches.png](pages/billing/screenshots/points-ledger-acquired-tab-expiry-batches.png) · [points-ledger-consumed-tab-redacted.png](pages/billing/screenshots/points-ledger-consumed-tab-redacted.png) | [account-ledger.png](../../screenshots/account-ledger.png) | local domain projection 已覆盖，外层账户壳缺失 |

## 截图采集与重采命令

```bash
pnpm exec playwright test e2e/home-visual-parity.spec.ts --project=chromium
pnpm exec playwright test e2e/canvas-parity.spec.ts --project=chromium
pnpm exec playwright test e2e/skills-parity.spec.ts --project=chromium
pnpm exec playwright test e2e/public-discovery.spec.ts --project=chromium
file docs/screenshots/*1440x900*.png
```

运行视觉基线前使用隔离 `DATA_DIR`/临时端口，避免 scenario 或 `.data/` 污染开发预览；生成的截图先逐张检查尺寸，再只保留刻意更新的文件。
