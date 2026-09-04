# Kokoro Nova 前端样本边界

## 一句话定义

Kokoro Nova 当前是 **frontend-only 的 LibTV 高保真交互样本**：复刻官网可见的
能力布局、页面层级、节点编辑器、故事板、视频工作流和状态反馈；当前阶段不包含
真实后端、真实登录、真实模型调用、真实计费或真实 LibTV API 代理。

这不是把产品能力削成静态稿。页面仍然通过本地 Route Handler、确定性 mock provider、
文件型 fixture store 和真实的前端状态机走完整演示链路，只是所有副作用都停留在本机。

## 目标与非目标

| 范围 | 当前样本要做到 | 当前样本不做 |
| --- | --- | --- |
| 视觉与布局 | 对齐 LibTV 的信息架构、密度、画布/故事板/编辑器层级、1440×900 演示基准 | 复用官网私有代码、私有脚本或带签名的远程资源 |
| 交互 | 覆盖创建、编辑、连线、引用、模型/输出选择、确认门、任务进度、取消、重试、撤销、刷新恢复、导出等可见闭环 | 把真实账户或真实支付动作接入样本 |
| 数据 | 使用稳定的本地 scenario、样本媒体、固定时钟和可重复 ID | 保存 Cookie、Authorization、Access Key、真实账户/项目/任务/资产标识 |
| API | 让 UI 只依赖本地 typed client；用 Zod + OpenAPI 描述未来后端可实现的契约 | 浏览器直连 `api.liblib.tv`、`im.liblib.tv` 或其他生产服务 |
| 生成 | 真实执行编译、报价、积分预留、provider、轮询、产物写回和合成器路径；产物是本地 SVG/WAV/MP4/TXT fixture | 消耗线上积分、调用远程模型或承诺线上生成质量 |

## 运行时拓扑

```text
React / Zustand UI
        │
        ▼
src/lib/api.ts（typed local transport）
        │
        ▼
Next.js Route Handlers（/api/*，本地 mock envelope）
        │
        ├── src/domain/*       纯函数、不依赖 React/服务端
        ├── src/server/store.ts 文件型持久化（DATA_DIR）
        └── src/server/generation/mock-provider.ts
                                  ↓
                         .data/media/ 本地样本产物
```

`pnpm dev` 使用 `3200/.data/.next`；`pnpm demo` 使用隔离的
`3300/.demo-data/.next-demo`。端口、数据目录和 Next dist 目录都可以由环境变量覆盖，
详见 [`DEMO_RUNBOOK.md`](DEMO_RUNBOOK.md)。

## 按产品 surface 的复刻边界

| Surface | 本地事实源 | 演示闭环 |
| --- | --- | --- |
| 首页 / 项目 | `src/mocks/home.ts`、project routes | 创建项目、最近项目、文件夹、重命名、复制、回收站 |
| Workflow Canvas | `WorkflowDocument` + `applyMutations` | 节点、连线、分组、视口、引用、多人 presence、undo/redo |
| Image / Video / Audio / Text | `src/domain/models.ts` 与各 authoring state | catalog、参数联动、报价、确认、任务、产物 |
| Script V2 | `node.data.extra.scriptV2` | 剧本 → 镜头 → 资产 → 双轨提示词 → 批量节点 |
| Storyboard | `projectStoryboard(document)` | 四列投影、详情抽屉、引用、再生成、剪辑入口 |
| Video Compositor | `CompositeDocument` 写回 videoComposite 节点 | 时间线、裁切、变速、转场、字幕、音轨、导出 |
| Agent / Assets / Skills / Showcase / Account | 各自 local route + fixture | 提案确认、上传生命周期、技能浏览、冻结快照、账本视图 |

所有能改变画布的入口最终都经过同一份 `WorkflowDocument` reducer；故事板不是第二份
可编辑文档。生成任务冻结 `ExecutionSpec`，因此用户继续编辑节点时，已经排队的本地
任务仍能按提交时的输入完成并写回。

## 未来后端接入 seam

未来后端只替换边界，不重写页面交互：

1. 以 [`docs/api/openapi.yaml`](api/openapi.yaml) 和 `src/contracts/**` 实现同名 HTTP
   route、状态码、错误 envelope 和幂等语义；
2. 将 `src/server/store.ts` 换成数据库/对象存储适配器；
3. 在 `src/server/generation/provider.ts` 后注册真实 provider；
4. 将认证放在部署层或 server-side adapter，保持组件和浏览器端不接触凭证；
5. 保留 `expectedRevision`、`workflowDigest`、`invocationId`、`idempotencyKey` 和
   ConfirmGate 语义，避免并发编辑、重复提交和重复计费回归。

因此，当前的 API docs 不是“以后再补”的说明文，而是后端接手时的可执行输入；本地
mock 只是该契约的确定性实现。

## 完成判定

一个 surface 只有同时满足以下条件，才算进入可演示状态：

- 首屏与主要状态在 1440×900 下有稳定视觉基准；
- 关键动作有可见成功、进行中、失败、取消和空态反馈；
- 刷新后仍能恢复应持久化的状态，临时 UI 状态不会污染文档；
- 写入通过 typed contract 和 revision guard，且一次用户动作对应一个 undo frame；
- 至少有一条 Playwright 主流程和对应的纯 domain/contract 测试；
- 文档明确标注 `network-confirmed`、`bundle-confirmed` 与本地归一化的边界。

