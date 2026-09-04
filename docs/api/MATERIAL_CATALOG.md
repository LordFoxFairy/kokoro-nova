# 风格/特效目录契约

风格库和特效库是画布素材库中的两个独立目录入口，不是个人资产列表的别名。当前
Next.js route 只使用本地确定性 fixture，预览由卡片的 `hue` 在前端生成，不包含官网
远端 URL、Cookie 或凭证。

## Routes

```text
GET  /api/materials?kind=style|effect&scope=market|favorites|recent
     &category=全部&q=关键词&commercialOnly=true&modelId=MODEL_ID
     &offset=0&limit=6
GET  /api/materials/MATERIAL_ID
POST /api/materials/MATERIAL_ID { "action": "favourite" | "unfavourite" }
```

`GET` 返回版本、当前查询、分类和模型 facets，以及带 `hasMore/nextOffset` 的分页页。
卡片包含 `modelId/modelLabel/modelIds`、收藏、可商用、作者、使用次数和说明。未知的
`kind`、`scope`、分类、分页或布尔值返回 `400`；`fixture=empty` 和 `fixture=error` 是
只供本地 Playwright 验证的确定性空态与 `503` 错误态。

收藏动作表达目标状态而不是 flip，因此重复请求幂等；收藏列表按本地 workspace space
保存，`resetStore` 会回到冻结 fixture 默认值。

## UI 边界

目录筛选、详情和收藏只改变目录查询/收藏状态，不写入 `WorkflowDocument`。用户点击
明确的“应用”或“应用并创建”后，画布才通过同一 `mutateCanvas` 事务创建 `style` 或
`effect` 专用节点；为 Image 应用风格时同时创建 style → image 边与 `imageStyle` 元数据。
Video 的特效入口创建独立 effect 节点。

## Examples

- [`materials-style.response.json`](examples/materials-style.response.json)
- [`materials-detail.response.json`](examples/materials-detail.response.json)
- [`materials-favourite.request.json`](examples/materials-favourite.request.json)
- [`materials-favourite.response.json`](examples/materials-favourite.response.json)
