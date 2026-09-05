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

async function addScriptV2Node(page: Page) {
  await page.goto('/project')
  await page.getByTestId('start-create').click()
  await page.waitForURL(/\/canvas\?projectId=/)
  await expect(page.getByTestId('workflow-canvas')).toBeVisible()

  await page.getByTestId('add-node-button').click()
  await page.getByRole('menuitem', { name: '脚本', exact: true }).hover()
  const nodeSaved = waitForCanvasMutation(page)
  await page.getByRole('menuitem', { name: '脚本 V2', exact: true }).click()
  await nodeSaved

  const node = page.locator('[data-node-type="script"]').first()
  await expect(node).toBeVisible()
  return node
}

function nodeShell(node: Locator) {
  return node.locator('[data-testid^="node-shell-"]')
}

test('script v2 keeps the three entry buttons in keyboard order and restores the generator layer before selection', async ({ page }) => {
  await resetFixture(page)
  const node = await addScriptV2Node(page)
  const entries = node.getByTestId('script-v2-entry-list').getByRole('button')

  await expect(entries).toHaveText([
    '剧本生成分镜脚本',
    '角色生成分镜脚本',
    '自己编写分镜脚本',
  ])
  await entries.nth(0).focus()
  await expect(entries.nth(0)).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(entries.nth(1)).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(entries.nth(2)).toBeFocused()

  const generatorSaved = waitForCanvasMutation(page)
  await entries.nth(0).click()
  await generatorSaved

  const generator = page.getByTestId('script-v2-generator')
  const modelTrigger = generator.getByRole('button', { name: /GVLM 3\.1/ })
  await expect(generator).toBeVisible()
  await modelTrigger.click()

  const catalog = page.getByTestId('script-v2-model-catalog')
  await expect(catalog).toBeVisible()
  await expect(modelTrigger).toBeFocused()
  await expect(catalog.getByRole('option')).toHaveText([
    /GVLM 3\.1/, /CVLM 5\.5/, /GVLM 3\.1 Flash/,
  ])

  await page.keyboard.press('Escape')
  await expect(catalog).toHaveCount(0)
  await expect(generator).toBeVisible()
  await expect(modelTrigger).toBeFocused()

  await page.keyboard.press('Escape')
  await expect(generator).toHaveCount(0)
  await expect(nodeShell(node)).toHaveAttribute('data-selected', 'true')

  await page.keyboard.press('Escape')
  await expect(nodeShell(node)).toHaveAttribute('data-selected', 'false')
})
