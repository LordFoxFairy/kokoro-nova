import { expect, test, type Locator, type Page } from '@playwright/test'

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

async function createScriptV2Node(page: Page) {
  await page.goto('/project')
  await page.getByTestId('start-create').click()
  await page.waitForURL(/\/canvas\?projectId=/)
  await expect(page.getByTestId('workflow-canvas')).toBeVisible()

  const addNode = page.getByTestId('add-node-button')
  await addNode.click()
  await expect(page.getByRole('menu')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('menu')).toHaveCount(0)
  await expect(addNode).toBeFocused()

  await addNode.click()
  await page.getByRole('menuitem', { name: '脚本', exact: true }).hover()
  const nodeSaved = waitForCanvasMutation(page)
  await page.getByRole('menuitem', { name: '脚本 V2', exact: true }).click()
  await nodeSaved

  const node = page.locator('[data-node-type="script"]').first()
  await expect(node).toBeVisible()
  await expect(node.locator('[data-testid^="node-shell-"]')).toHaveAttribute('data-selected', 'true')
  return node
}

async function openManualWorkspace(page: Page, node: Locator) {
  const manualEntry = node.getByRole('button', { name: '自己编写分镜脚本', exact: true })
  const workspaceSaved = waitForCanvasMutation(page)
  await manualEntry.click()
  await workspaceSaved
  const workspace = page.getByTestId('script-v2-workspace')
  await expect(workspace).toBeVisible()
  return workspace
}

async function persistedImagePrompt(page: Page) {
  const projectId = new URL(page.url()).searchParams.get('projectId')
  if (!projectId) throw new Error('projectId missing from canvas URL')
  const response = await page.request.get(`/api/projects/${projectId}`)
  expect(response.ok()).toBe(true)
  const payload = await response.json() as {
    canvases: Array<{
      document: {
        nodes: Array<{
          type: string
          data: { extra?: { scriptV2?: { rows: Array<{ imageGenerationPrompt: string }> } } }
        }>
      }
    }>
  }
  return payload.canvases[0]?.document.nodes.find((candidate) => candidate.type === 'script')
    ?.data.extra?.scriptV2?.rows[0]?.imageGenerationPrompt
}

test('canvas and Script V2 overlays restore focus without clearing selection or a persisted draft', async ({ page }) => {
  await resetFixture(page)
  const node = await createScriptV2Node(page)

  const generatorTrigger = node.getByRole('button', { name: '剧本生成分镜脚本', exact: true })
  const generatorSaved = waitForCanvasMutation(page)
  await generatorTrigger.click()
  await generatorSaved
  await expect(page.getByTestId('script-v2-generator')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('script-v2-generator')).toHaveCount(0)
  await expect(generatorTrigger).toBeFocused()

  const workspace = await openManualWorkspace(page, node)
  const promptsStageSaved = waitForCanvasMutation(page)
  await workspace.getByTestId('script-v2-stages').getByRole('button', { name: /^合成提示词/ }).click()
  await promptsStageSaved
  const draftTrigger = workspace.getByRole('button', { name: '查看镜头 1 最终提示词', exact: true })
  await draftTrigger.click()
  const editor = page.getByTestId('script-v2-prompt-detail-dialog')
  await expect(editor).toBeVisible()
  const draft = '雨夜车站中，旅人将旧录音带交给守灯人。'
  await editor.getByRole('textbox', { name: '第 1 镜分镜图提示词', exact: true }).fill(draft)

  // Escape flushes the debounced local draft before it closes the detail layer.
  const draftSaved = waitForCanvasMutation(page)
  await page.keyboard.press('Escape')
  await draftSaved
  await expect(editor).toHaveCount(0)
  await expect(draftTrigger).toBeFocused()
  await expect(node.locator('[data-testid^="node-shell-"]')).toHaveAttribute('data-selected', 'true')
  await expect.poll(() => persistedImagePrompt(page)).toBe(draft)
})
