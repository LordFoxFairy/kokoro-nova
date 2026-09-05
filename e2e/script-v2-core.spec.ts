import { expect, test, type Page } from '@playwright/test'

async function resetFixture(page: Page) {
  const selected = await page.request.post('/api/dev/scenario', {
    data: { scenarioId: 'authenticated-empty' },
  })
  expect(selected.ok()).toBe(true)
  const reset = await page.request.post('/api/dev/reset')
  expect(reset.ok()).toBe(true)
}

function waitForCanvasMutation(page: Page) {
  return page.waitForResponse((response) => {
    const url = new URL(response.url())
    return response.request().method() === 'POST' && /^\/api\/canvases\/[^/]+$/.test(url.pathname) && response.ok()
  })
}

async function openManualScriptWorkspace(page: Page) {
  await page.goto('/project')
  await page.getByTestId('start-create').click()
  await page.waitForURL(/\/canvas\?projectId=/)
  await expect(page.getByTestId('workflow-canvas')).toBeVisible()

  await page.getByTestId('add-node-button').click()
  await page.getByRole('menuitem', { name: '脚本', exact: true }).hover()
  const nodePersisted = waitForCanvasMutation(page)
  await page.getByRole('menuitem', { name: '脚本 V2', exact: true }).click()
  await nodePersisted

  const node = page.locator('[data-node-type="script"]').first()
  const entryPersisted = waitForCanvasMutation(page)
  await node.getByRole('button', { name: '自己编写分镜脚本', exact: true }).click()
  await entryPersisted

  const workspace = page.getByTestId('script-v2-workspace')
  await expect(workspace).toBeVisible()
  return { node, workspace }
}

test('script v2 core preserves the official three-stage, editable-shot and gated-batch workflow', async ({ page }) => {
  await resetFixture(page)
  const { node, workspace } = await openManualScriptWorkspace(page)

  const stages = workspace.getByTestId('script-v2-stages').getByRole('button')
  await expect(stages).toHaveCount(3)
  await expect(stages.nth(0)).toHaveAccessibleName('确认镜头 1个镜头已就绪')
  await expect(stages.nth(1)).toHaveAccessibleName('准备资产 0/0 已生成')
  await expect(stages.nth(2)).toHaveAccessibleName('合成提示词 0/1 已合成')
  await expect(workspace.getByRole('columnheader')).toHaveText([
    '镜号', '时长', '画面描述', '景别', '光影氛围', '对白·旁白', '音效', '运镜', '最终提示词', '操作',
  ])
  await expect(node.getByRole('button', { name: '批量生成分镜', exact: true })).toBeDisabled()
  await expect(node.getByRole('button', { name: '批量生视频', exact: true })).toBeDisabled()

  const stagePersisted = waitForCanvasMutation(page)
  await workspace.getByRole('button', { name: '下一步：准备资产', exact: true }).click()
  await stagePersisted
  await expect(workspace.getByTestId('script-v2-assets')).toBeVisible()

  const promptPersisted = waitForCanvasMutation(page)
  await stages.nth(2).click()
  await promptPersisted
  await expect(workspace.getByTestId('script-v2-prompt-stage')).toBeVisible()
})
