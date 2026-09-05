import { expect, test } from '@playwright/test'

test.use({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })

async function resetAnonymous(page: import('@playwright/test').Page) {
  const scenario = await page.request.post('/api/dev/scenario', { data: { scenarioId: 'anonymous' } })
  expect(scenario.ok()).toBe(true)
  const reset = await page.request.post('/api/dev/reset')
  expect(reset.ok()).toBe(true)
}

test('public creative intent returns to an editable home draft after deterministic sign-in', async ({ page }) => {
  await resetAnonymous(page)
  await page.goto('/')

  const prompt = '雨夜城市里的纸飞机短片'
  await page.getByTestId('home-composer').fill(prompt)
  await page.getByTestId('home-agent-send').click()
  const dialog = page.getByTestId('home-login-dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('将保留当前创意')

  const signIn = page.waitForRequest((request) => request.url().includes('/api/identity') && request.method() === 'POST')
  await dialog.getByRole('button', { name: '登录并继续' }).click()
  const signInRequest = await signIn
  expect(signInRequest.postDataJSON()).toMatchObject({
    action: 'signIn',
    returnTo: '/?resume=home',
    continuation: { kind: 'home-creative', source: 'composer', prompt },
  })

  await page.waitForURL(/\/?resume=home$/)
  await expect(page.getByTestId('home-login-resumed')).toContainText('已恢复刚才的创意')
  await expect(page.getByTestId('home-composer')).toHaveValue(prompt)
  await expect(page.getByTestId('home-agent-send')).toBeEnabled()
})

test('project login keeps route context and exposes loading, error and retry states', async ({ page }) => {
  await resetAnonymous(page)
  let signInAttempts = 0
  await page.route('**/api/identity', async (route) => {
    if (route.request().method() === 'POST' && signInAttempts++ === 0) {
      await new Promise((resolve) => setTimeout(resolve, 350))
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: '本地登录服务暂时不可用' }) })
      return
    }
    await route.continue()
  })

  await page.goto('/project?folderId=folder_demo')
  const gate = page.getByTestId('project-login-gate')
  await expect(gate).toBeVisible()
  await expect(gate).toContainText('需要登录后访问私有项目')
  await gate.getByRole('button', { name: '登录并返回' }).click()
  await expect(page.getByTestId('project-login-loading')).toBeVisible()
  await expect(page.getByTestId('project-login-error')).toContainText('本地登录服务暂时不可用')

  const retry = page.waitForRequest((request) => request.url().includes('/api/identity') && request.method() === 'POST')
  await page.getByTestId('project-login-retry').click()
  const retryRequest = await retry
  expect(retryRequest.postDataJSON()).toMatchObject({
    action: 'signIn',
    returnTo: '/project?folderId=folder_demo',
    continuation: { kind: 'project-route', route: '/project?folderId=folder_demo' },
  })
  await page.waitForURL('/project?folderId=folder_demo')
  await expect(page.getByTestId('project-loading').or(page.getByTestId('project-empty-state'))).toBeVisible()
})
