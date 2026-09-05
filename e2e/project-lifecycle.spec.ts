import { expect, test, type APIRequestContext } from '@playwright/test'

const fixtureCover = '/fixtures/libtv/media/city-night-poster.webp'

async function selectScenario(request: APIRequestContext) {
  const response = await request.post('/api/dev/scenario', { data: { scenarioId: 'authenticated-empty' } })
  expect(response.ok()).toBe(true)
}

test.describe('项目生命周期持久化', () => {
  test.afterEach(async ({ request }) => {
    await selectScenario(request)
  })

  test('文件夹与项目管理动作在刷新后保留，并清理测试生成物', async ({ page, request }) => {
    await selectScenario(request)
    await page.goto('/project')
    await expect(page.getByRole('heading', { name: '全部项目' })).toBeVisible()

    const folderCreated = page.waitForResponse((response) => {
      const url = new URL(response.url())
      return response.request().method() === 'POST' && url.pathname === '/api/folders' && response.ok()
    })
    await page.getByTestId('new-folder').click()
    const folder = await (await folderCreated).json() as { id: string; name: string }
    const folderCard = page.getByTestId(`folder-card-${folder.id}`)
    await expect(folderCard).toBeVisible()

    await folderCard.getByRole('button', { name: '文件夹操作' }).click()
    await page.getByRole('menuitem', { name: '重命名' }).click()
    const renamedFolder = page.waitForResponse((response) => {
      const url = new URL(response.url())
      return response.request().method() === 'PATCH' && url.pathname === `/api/folders/${folder.id}` && response.ok()
    })
    await page.getByTestId('folder-rename-input').fill('Nova 回归文件夹')
    await page.getByTestId('folder-rename-input').press('Enter')
    await renamedFolder
    await expect(page.getByTestId('project-operation-feedback')).toContainText('名称已更新')
    await expect(folderCard).toContainText('Nova 回归文件夹')

    const projectCreated = page.waitForResponse((response) => {
      const url = new URL(response.url())
      return response.request().method() === 'POST' && url.pathname === '/api/projects' && response.ok()
    })
    await page.getByTestId('start-create').click()
    const created = await (await projectCreated).json() as { project: { id: string; name: string }; canvas: { id: string } }
    await page.waitForURL(/\/canvas\?projectId=/)
    await expect(page.getByTestId('workflow-canvas')).toBeVisible()

    await page.goto('/project')
    const projectCard = page.getByTestId(`project-card-${created.project.id}`)
    await expect(projectCard).toBeVisible()

    await projectCard.getByRole('button', { name: '项目操作' }).click()
    await page.getByRole('menuitem', { name: '选择示例封面' }).hover()
    await page.getByRole('menuitem', { name: '城市夜景' }).click()
    await expect(page.getByTestId(`project-cover-${created.project.id}`)).toHaveAttribute('src', fixtureCover)

    await projectCard.getByRole('button', { name: '项目操作' }).click()
    const copyCreated = page.waitForResponse((response) => {
      const url = new URL(response.url())
      return response.request().method() === 'PUT' && url.pathname === `/api/projects/${created.project.id}` && response.ok()
    })
    await page.getByRole('menuitem', { name: '创建副本' }).click()
    const copied = await (await copyCreated).json() as { id: string; name: string }
    const copyCard = page.getByTestId(`project-card-${copied.id}`)
    await expect(copyCard).toBeVisible()
    await expect(page.getByTestId(`project-cover-${copied.id}`)).toHaveAttribute('src', fixtureCover)

    await copyCard.getByRole('button', { name: '项目操作' }).click()
    await page.getByRole('menuitem', { name: '移动至文件夹' }).hover()
    await page.getByRole('menuitem', { name: 'Nova 回归文件夹', exact: true }).click()
    await expect(copyCard).toHaveCount(0)

    await expect(page.getByTestId(`project-card-${copied.id}`)).toHaveCount(0)

    await page.reload()
    await expect(page.getByTestId(`folder-card-${folder.id}`)).toContainText('Nova 回归文件夹')
    await expect(page.getByTestId(`project-card-${created.project.id}`)).toBeVisible()
    await expect(page.getByTestId(`project-cover-${created.project.id}`)).toHaveAttribute('src', fixtureCover)
    await expect(page.getByTestId(`project-card-${copied.id}`)).toHaveCount(0)

    await page.getByTestId(`folder-card-${folder.id}`).getByRole('button').first().click()
    await expect(page.getByRole('heading', { name: 'Nova 回归文件夹' })).toBeVisible()
    await expect(page.getByTestId(`project-card-${copied.id}`)).toBeVisible()
    await expect(page.getByTestId(`project-cover-${copied.id}`)).toHaveAttribute('src', fixtureCover)
  })
})
