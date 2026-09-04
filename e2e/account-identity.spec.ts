import { expect, test, type Page } from '@playwright/test'

test.use({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
})

async function expectVisualBaseline(page: Page, name: string) {
  await page.addStyleTag({ content: 'nextjs-portal { display: none !important; } [data-testid="home-campaign-image"] { visibility: hidden !important; }' })
  await page.evaluate(() => document.fonts.ready)
  await expect(page).toHaveScreenshot(name, {
    animations: 'disabled',
    caret: 'hide',
    scale: 'css',
    maxDiffPixelRatio: 0.0001,
  })
}

async function resetIdentity(page: import('@playwright/test').Page) {
  const scenario = await page.request.post('/api/dev/scenario', { data: { scenarioId: 'authenticated-populated' } })
  expect(scenario.ok()).toBe(true)
  const reset = await page.request.post('/api/dev/reset')
  expect(reset.ok()).toBe(true)
  const signIn = await page.request.post('/api/identity', { data: { action: 'signIn', returnTo: '/' } })
  expect(signIn.ok()).toBe(true)
  const preferences = await page.request.patch('/api/preferences', { data: { theme: 'dark', aiWatermark: true } })
  expect(preferences.ok()).toBe(true)
}

test.beforeEach(async ({ page }) => {
  await resetIdentity(page)
})

test('home identity menu exposes redacted account groups with keyboard dismissal and local preferences', async ({ page }) => {
  await page.goto('/')
  const trigger = page.getByTestId('local-identity-trigger-rail')
  await expect(trigger).toBeVisible()
  await trigger.focus()
  await page.keyboard.press('Enter')
  const menu = page.getByTestId('local-identity-menu-rail')
  await expect(menu).toBeVisible()
  await expect(menu).toContainText('微信用户cd385d')
  await expect(menu).toContainText('cd385d••••••9a21')
  await expect(menu).toContainText('•••• •••• •••• ••••')
  await expect(menu).toContainText('免费用户')
  await expect(menu).toContainText('积分余额 20 点')
  await expect(menu).toContainText('存储空间')
  await expect(menu).toContainText('订阅与开发票')
  await expect(menu).toContainText('CLI & Skill')
  await expect(menu).toContainText('通知')
  await expectVisualBaseline(page, 'account-identity-menu-dark-1440x900.png')

  await page.keyboard.press('Escape')
  await expect(menu).toHaveCount(0)
  await expect(trigger).toBeFocused()

  await trigger.click()
  await page.getByRole('button', { name: '浅色模式' }).click()
  await expect(page.locator('[data-app-shell="authenticated"]')).toHaveAttribute('data-local-theme', 'light')
  await page.getByRole('menuitemcheckbox', { name: 'AI 水印设置' }).click()
  await expect(page.getByRole('menuitemcheckbox', { name: 'AI 水印设置' })).toHaveAttribute('aria-checked', 'false')
  await page.getByRole('button', { name: '全部通知已读' }).click()
  await expect(menu.getByText('通知', { exact: false })).toContainText('0')
  await expectVisualBaseline(page, 'account-identity-menu-light-preferences-1440x900.png')
})

test('canvas identity menu completes logout/login returnTo without exposing credentials', async ({ page }) => {
  await page.goto('/canvas?projectId=prj_video_demo&canvasId=can_video_main')
  const trigger = page.getByTestId('local-identity-trigger-editor')
  await expect(trigger).toBeVisible()
  await trigger.click()
  const menu = page.getByTestId('local-identity-menu-editor')
  await expect(menu).toContainText('个人中心')
  await expect(menu).toContainText('退出登录')
  await menu.getByRole('menuitem', { name: /退出登录/ }).click()
  await expect(menu).toContainText('已退出登录')
  await expect(menu).toContainText('/canvas?projectId=prj_video_demo&canvasId=can_video_main')
  await menu.getByRole('button', { name: '登录并返回' }).click()
  await expect(page).toHaveURL(/\/canvas\?projectId=prj_video_demo&canvasId=can_video_main/)
  await expect(trigger).toHaveAttribute('aria-label', /微信用户cd385d/)
})
