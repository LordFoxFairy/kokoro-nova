# Skill 作者工作流（local mock）

此域是纯前端可重复 fixture，持久化在当前 local workspace；`POST /api/dev/reset` 会清空作者草稿。它不调用 LibTV 后端，也不含真实凭据。

作者工作台的官网同构入口是 `GET /skill/create`；`GET /skills/create` 保留为 Kokoro Nova 既有链接的兼容入口。两个路径原地渲染同一个本地工作台，不重定向，也不改变 API 契约。

## 生命周期

```text
POST /api/skills/author
  → draft
PATCH /api/skills/author/SKILL_ID   # 编辑名称、简介、场景、使用方法、输出、类型、封面、版本、标签与文件树
POST  /api/skills/author/SKILL_ID { action: "submit_review" }
  → in_review (approved) | draft (changes_requested)
POST  /api/skills/author/SKILL_ID { action: "publish" }
  → published
GET /api/skills?collection=我的      # 仅 published 投影可见
POST /api/skills/author/SKILL_ID { action: "unpublish" }
  → unpublished，立即从“我的”移除
```

`publish` 只接受已通过审核的 `in_review` 版本；如果绕过 UI 直接发布不完整草稿，返回 `422` 和可行动的校验文案。已发布记录必须先下架才能编辑，避免审核版本发生静默漂移。保存修改会清空旧审核并回到 `draft`。

## 作者表单与版本化快照

每个版本化草稿同时保存：`usageScenarios`（使用场景）、`howToUse`（如何使用）、`outputContent`（输出内容）、`outputTypes`（图片 `image`、视频 `video`、音频 `audio`、文本 `text`）与可选 `cover`。前三项与至少一种输出类型均为审核必填（草稿阶段允许输出类型为空）；`cover` 可以为 `null`，或站内路径/HTTP(S) 地址。发布后这些字段随同固定 `version` 冻结，并投影到“我的”卡片和详情；下架后重新编辑会清除审核，避免旧审核覆盖新字段。

## 文件树与版本

每个草稿至少有一个文件，根目录 `SKILL.md` 是审核要求。`version` 必须符合 `MAJOR.MINOR.PATCH`；这里的版本是可复现运行快照的选择键，发布后的市场卡携带该固定版本。`references.json` 与 `notes/*.md` 为确定性模板/扩展示例，不代表真实上传。

完整 published 响应见 [`examples/skills-authoring-lifecycle.response.json`](examples/skills-authoring-lifecycle.response.json)。
