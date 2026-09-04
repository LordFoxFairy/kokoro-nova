import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

async function selectScenario(request: APIRequestContext, scenarioId: string) {
  const response = await request.post('/api/dev/scenario', { data: { scenarioId } })
  expect(response.ok()).toBe(true)
}

async function openProjects(page: Page, request: APIRequestContext) {
  await selectScenario(request, 'authenticated-populated')
  await page.goto('/project')
  await expect(page.getByTestId('project-grid')).toBeVisible()
}

test.describe('项目管理交互夹具', () => {
  test.afterEach(async ({ request }) => {
    await selectScenario(request, 'authenticated-empty')
  })

  test('动作按钮仅在卡片悬停或键盘聚焦时显示，并支持 Escape 关闭菜单', async ({ page, request }) => {
    await openProjects(page, request)

    const card = page.locator('[data-testid^="project-card-"]').first()
    const more = card.getByRole('button', { name: '项目操作' })
    await expect(more).toHaveCSS('opacity', '0')

    await card.hover()
    await expect(more).toHaveCSS('opacity', '1')
    await more.click()
    await expect(page.getByRole('menu')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('menu')).toHaveCount(0)
    await expect(more).toBeFocused()

    await more.press('Enter')
    await expect(page.getByRole('menu')).toBeVisible()
    await page.getByRole('menuitem', { name: '重命名' }).click()
    const rename = card.getByTestId('project-rename-input')
    await rename.fill('这次改名取消')
    await rename.press('Escape')
    await expect(card.getByText('这次改名取消', { exact: true })).toHaveCount(0)
    await expect(card.getByText('未命名', { exact: true })).toBeVisible()

    await more.press('Enter')
    await expect(page.getByRole('menu')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(more).toBeFocused()
  })

  test('移动子菜单可通过键盘打开，项目删除确认可通过 Escape 关闭并保留触发焦点', async ({ page, request }) => {
    await openProjects(page, request)

    await page.getByTestId('new-folder').click()
    const folder = page.locator('[data-testid^="folder-card-"]').first()
    await expect(folder).toBeVisible()

    const projectMore = page.locator('[data-testid^="project-more-"]').first()
    await projectMore.click()
    for (let index = 0; index < 5; index += 1) await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowRight')
    await expect(page.getByRole('menuitem', { name: '未命名文件夹' })).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(page.getByRole('menu')).toHaveCount(0)
    await projectMore.press('Enter')
    await page.getByRole('menuitem', { name: '删除项目' }).click()
    const dialog = page.getByTestId('confirm-dialog')
    await expect(dialog).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(projectMore).toBeFocused()
  })

  test('移动至文件夹子菜单在悬停时保持打开并可选择目标文件夹', async ({ page, request }) => {
    await openProjects(page, request)

    await page.getByTestId('new-folder').click()
    const folder = page.locator('[data-testid^="folder-card-"]').first()
    await expect(folder).toBeVisible()

    const project = page.locator('[data-testid^="project-card-"]').first()
    const projectTestId = await project.getAttribute('data-testid')
    expect(projectTestId).toBeTruthy()
    await project.getByRole('button', { name: '项目操作' }).click()
    const move = page.getByRole('menuitem', { name: '移动至文件夹' })
    await expect(move).toBeVisible()
    await move.hover()

    const destination = page.getByRole('menuitem', { name: '未命名文件夹', exact: true })
    await expect(destination).toBeVisible()
    await destination.click()
    await expect(page.getByTestId(projectTestId as string)).toHaveCount(0)
    await expect(folder).toContainText('1 个项目')
  })

  test('文件夹删除要求精确名称，并展示封面图与项目数量', async ({ page, request }) => {
    await openProjects(page, request)
    await page.getByTestId('new-folder').click()

    const folder = page.locator('[data-testid^="folder-card-"]').first()
    await expect(folder.getByText('未命名文件夹', { exact: true })).toBeVisible()
    await expect(folder).toContainText('0 个项目')
    await expect(folder.locator('[data-testid="folder-cover-placeholder"]')).toBeVisible()

    await folder.getByRole('button', { name: '文件夹操作' }).click()
    await page.getByRole('menuitem', { name: '删除文件夹' }).click()
    const dialog = page.getByTestId('confirm-dialog')
    const submit = dialog.getByTestId('confirm-submit')
    await expect(submit).toBeDisabled()
    await dialog.getByTestId('confirm-input').fill('未命名文件夹')
    await expect(submit).toBeEnabled()
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
  })

  test('项目列表桌面卡片保留 1440×900 视觉基线', async ({ page, request }) => {
    await openProjects(page, request)
    await page.screenshot({ path: 'docs/screenshots/project-manager-actions-1440x900.png', scale: 'css' })
  })
})
