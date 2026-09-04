import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

const fixtureCover = '/fixtures/libtv/media/city-night-poster.webp'

async function selectScenario(request: APIRequestContext) {
  const response = await request.post('/api/dev/scenario', { data: { scenarioId: 'authenticated-populated' } })
  expect(response.ok()).toBe(true)
}

async function openProjectMenu(page: Page, projectId: string) {
  const card = page.getByTestId(`project-card-${projectId}`)
  await expect(card).toBeVisible()
  await card.getByRole('button', { name: '项目操作' }).click()
}

test.describe('项目生命周期持久化', () => {
  test.afterEach(async ({ request }) => {
    await request.post('/api/dev/scenario', { data: { scenarioId: 'authenticated-empty' } })
  })

  test('本地示例封面、复制、重载、移动、回收和恢复保留同一项目状态', async ({ page, request }) => {
    await selectScenario(request)
    await page.goto('/project')
    await expect(page.getByTestId('project-grid')).toBeVisible()

    await openProjectMenu(page, 'prj_video_demo')
    await page.getByRole('menuitem', { name: '选择示例封面' }).hover()
    await page.getByRole('menuitem', { name: '城市夜景' }).click()
    await expect(page.getByTestId('project-cover-prj_video_demo')).toHaveAttribute('src', fixtureCover)

    await openProjectMenu(page, 'prj_video_demo')
    const copyCreated = page.waitForResponse((response) => {
      const url = new URL(response.url())
      return response.request().method() === 'PUT' && url.pathname === '/api/projects/prj_video_demo' && response.ok()
    })
    await page.getByRole('menuitem', { name: '创建副本' }).click()
    const copied = await (await copyCreated).json() as { id: string }
    await expect(page.getByTestId(`project-card-${copied.id}`)).toBeVisible()

    await page.reload()
    await expect(page.getByTestId('project-grid')).toBeVisible()
    await expect(page.getByTestId(`project-cover-${copied.id}`)).toHaveAttribute('src', fixtureCover)

    const folderCreated = page.waitForResponse((response) => {
      const url = new URL(response.url())
      return response.request().method() === 'POST' && url.pathname === '/api/folders' && response.ok()
    })
    await page.getByTestId('new-folder').click()
    const folder = await (await folderCreated).json() as { id: string; name: string }
    await expect(page.getByTestId(`folder-card-${folder.id}`)).toBeVisible()

    await openProjectMenu(page, copied.id)
    await page.getByRole('menuitem', { name: '移动至文件夹' }).hover()
    await page.getByRole('menuitem', { name: folder.name }).click()
    await expect(page.getByTestId(`project-card-${copied.id}`)).toHaveCount(0)

    await page.getByTestId(`folder-card-${folder.id}`).getByRole('button').first().click()
    await expect(page.getByTestId(`project-card-${copied.id}`)).toBeVisible()
    await expect(page.getByTestId(`project-cover-${copied.id}`)).toHaveAttribute('src', fixtureCover)

    await openProjectMenu(page, copied.id)
    await page.getByRole('menuitem', { name: '删除项目' }).click()
    await page.getByTestId('confirm-dialog').getByTestId('confirm-submit').click()
    await expect(page.getByTestId(`project-card-${copied.id}`)).toHaveCount(0)

    await page.getByRole('button', { name: '回收站' }).click()
    const recycleEntry = page.getByTestId(`recycle-project-${copied.id}`)
    await expect(recycleEntry).toBeVisible()
    await recycleEntry.getByRole('button', { name: '恢复' }).click()
    await expect(recycleEntry).toHaveCount(0)
    await expect(page.getByTestId(`project-card-${copied.id}`)).toBeVisible()
    await expect(page.getByTestId(`project-cover-${copied.id}`)).toHaveAttribute('src', fixtureCover)
  })
})
