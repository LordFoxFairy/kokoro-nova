# Script V2 桌面视觉对照

- 本地基线：`e2e/script-v2.spec.ts-snapshots/`，Playwright `Desktop Chrome`，CSS viewport `1440×900`，`scale: css`。
- 官网事实：登录态 Canvas 的 [Script 节点观察](../research/libtv/pages/canvas/README.md#脚本节点)；逐屏证据见同目录 `screenshots/`。
- 本地运行环境：`authenticated-empty` fixture、隔离 `DATA_DIR`；不使用账号 Cookie、真实积分、远端模型或私有媒体。

| 本地基线 | 对照官网证据 | 锁定的布局与状态 |
| --- | --- | --- |
| `script-v2-node-empty-1440x900-darwin.png` | `script-node-default-generator-and-three-entry-paths.png` | 深色无限画布中的脚本节点、三条入口、选中外框和底部工具轨。 |
| `script-v2-generator-1440x900-darwin.png` | `script-node-default-generator-and-three-entry-paths.png` | 节点附着式生成器、剧情输入、模型/翻译控制和报价位置。 |
| `script-v2-model-catalog-1440x900-darwin.png` | `script-node-language-model-catalog-with-latency.png` | 生成器上的模型浮层、GVLM/CVLM 目录与预计耗时层级。 |
| `script-v2-shots-1440x900-darwin.png` | `script-v2-manual-storyboard-confirm-shots-table.png` | 全屏三阶段壳、顶部阶段导航、镜头表列序、批量行动作与暗色密度。 |
| `script-v2-assets-1440x900-darwin.png` | `script-v2-prepare-assets-characters-scenes-props.png` | 角色/场景/道具三分组、空资产卡、底部阶段门槛和下一步动作。 |
| `script-v2-prompts-1440x900-darwin.png` | `script-v2-compose-prompts-phase-and-batch-action.png` | 双轨最终提示词阶段、完成计数、批量分镜/视频动作。 |
| `script-v2-prompt-detail-1440x900-darwin.png` | `script-v2-compose-prompts-phase-and-batch-action.png` | 单镜头双提示词详情、独立状态、模型/模式控制与关闭层级。 |
| `script-v2-batch-image-1440x900-darwin.png` | `script-v2-compose-prompts-phase-and-batch-action.png` | 选镜批量分镜确认层、模型与画质配置、预估积分和确认门。 |

## 已知且刻意保留的差异

1. 每次“生成”都返回确定性的本地 fixture；不会出现官网的真实排队、账户权益或积分扣减。
2. 画布、节点、任务和素材标识均为本地 mock 标识；视觉基线不固化任何远端项目、账户或媒体 URL。
3. 官网有部分付费/审核后的后续状态尚未在公开观察中取得；本地以可重复的 loading、失败、重试、确认和持久化状态覆盖接口边界。

## 验证

```bash
pnpm e2e --grep 'preserves desktop visual baselines'
```

需要隔离演示数据时，按 `docs/DEMO_RUNBOOK.md` 的 demo 启动方式运行对应 Playwright 命令。
