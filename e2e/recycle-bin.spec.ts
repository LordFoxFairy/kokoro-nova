import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

async function selectScenario(request: APIRequestContext, scenarioId = 'authenticated-populated') {
  const response = await request.post('/api/dev/scenario', { data: { scenarioId } })
  expect(response.ok()).toBe(true)
}

async function openProjects(page: Page, request: APIRequestContext) {
  await selectScenario(request)
  await page.goto('/project')
  await expect(page.getByTestId('project-grid')).toBeVisible()
}

async function recycleProject(page: Page, projectId = 'prj_video_demo') {
  const card = page.getByTestId(`project-card-${projectId}`)
  await expect(card).toBeVisible()
  await card.getByRole('button', { name: '项目操作' }).click()
  await page.getByRole('menuitem', { name: '删除项目' }).click()
  const dialog = page.getByTestId('confirm-dialog')
  await expect(dialog).toContainText('移入回收站')
  await dialog.getByTestId('confirm-submit').click()
  await expect(card).toHaveCount(0)
}

test.describe('项目回收站闭环', () => {
  test.afterEach(async ({ request }) => {
    await selectScenario(request, 'authenticated-empty')
  })

  test('软删除从项目和画布查询隐藏，回收站恢复全部保留画布', async ({ page, request }) => {
    await openProjects(page, request)
    await recycleProject(page)

    const projects = await request.get('/api/projects')
    expect((await projects.json()).projects.some((project: { id: string }) => project.id === 'prj_video_demo')).toBe(false)
    expect((await request.get('/api/canvases/can_video_main')).status()).toBe(404)

    await page.getByRole('button', { name: '回收站' }).click()
    const recycleBin = page.getByTestId('recycle-bin-dialog')
    const entry = recycleBin.getByTestId('recycle-project-prj_video_demo')
    await expect(entry).toContainText('还可保留 30 天')
    await expect(entry).toContainText('1 个画布')
    await entry.getByRole('button', { name: '恢复' }).click()
    await expect(entry).toHaveCount(0)
    await expect(page.getByTestId('project-card-prj_video_demo')).toBeVisible()
    expect((await request.get('/api/canvases/can_video_main')).ok()).toBe(true)
  })

  test('永久删除要求完整项目名确认，并级联移除回收项目', async ({ page, request }) => {
    await openProjects(page, request)
    await recycleProject(page)
    await page.getByRole('button', { name: '回收站' }).click()

    const entry = page.getByTestId('recycle-project-prj_video_demo')
    await entry.getByRole('button', { name: '永久删除' }).click()
    const confirmation = entry.getByTestId('recycle-confirm-prj_video_demo')
    const confirm = confirmation.getByRole('button', { name: '确认永久删除' })
    await expect(confirm).toBeDisabled()
    await confirmation.getByRole('textbox').fill(await entry.getByRole('heading', { level: 3 }).innerText())
    await expect(confirm).toBeEnabled()
    await confirm.click()
    await expect(entry).toHaveCount(0)
    await expect(page.getByTestId('recycle-bin-dialog')).toContainText('回收站为空')
    expect((await request.get('/api/canvases/can_video_main')).status()).toBe(404)
  })
})
