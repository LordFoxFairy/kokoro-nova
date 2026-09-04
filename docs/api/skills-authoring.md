# Skill 作者工作流（local mock）

此域是纯前端可重复 fixture，持久化在当前 local workspace；`POST /api/dev/reset` 会清空作者草稿。它不调用 LibTV 后端，也不含真实凭据。

## 生命周期

```text
POST /api/skills/author
  → draft
PATCH /api/skills/author/SKILL_ID   # 编辑名称、简介、分类、语义版本、标签与文件树
POST  /api/skills/author/SKILL_ID { action: "submit_review" }
  → in_review (approved) | draft (changes_requested)
POST  /api/skills/author/SKILL_ID { action: "publish" }
  → published
GET /api/skills?collection=我的      # 仅 published 投影可见
POST /api/skills/author/SKILL_ID { action: "unpublish" }
  → unpublished，立即从“我的”移除
```

`publish` 只接受已通过审核的 `in_review` 版本；如果绕过 UI 直接发布不完整草稿，返回 `422` 和可行动的校验文案。已发布记录必须先下架才能编辑，避免审核版本发生静默漂移。保存修改会清空旧审核并回到 `draft`。

## 文件树与版本

每个草稿至少有一个文件，根目录 `SKILL.md` 是审核要求。`version` 必须符合 `MAJOR.MINOR.PATCH`；这里的版本是可复现运行快照的选择键，发布后的市场卡携带该固定版本。`references.json` 与 `notes/*.md` 为确定性模板/扩展示例，不代表真实上传。

完整 published 响应见 [`examples/skills-authoring-lifecycle.response.json`](examples/skills-authoring-lifecycle.response.json)。
