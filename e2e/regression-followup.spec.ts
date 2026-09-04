import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

/**
 * State/response regression only. The lane deliberately requires an explicit
 * temporary base URL so an accidental default run cannot touch the main 3200
 * service or its .data directory.
 */
const REGRESSION_BASE_URL = process.env.REGRESSION_BASE_URL
const PROJECT_URL = '/canvas?projectId=prj_video_demo&canvasId=can_video_main'
const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 1024, height: 768 },
  { width: 768, height: 700 },
] as const

const STATUS_FIXTURES = [
  ['video-awaiting-confirmation', '等待确认'],
  ['video-queued', '排队中'],
  ['video-running', '生成中'],
  ['video-succeeded', '生成完成'],
  ['video-failed', '生成失败'],
  ['video-cancelled', '已取消'],
  ['video-compliance-blocked', '素材合规校验未通过'],
] as const

// This suite deliberately mutates deterministic scenarios and is designed to
// run against a disposable DATA_DIR. Keep the everyday `pnpm e2e` command
// side-effect free for a developer's active local preview; CI/regression jobs
// opt in with REGRESSION_BASE_URL and an isolated server.
test.skip(!REGRESSION_BASE_URL, '需要 REGRESSION_BASE_URL 指向隔离本地服务')

test.use({
  baseURL: REGRESSION_BASE_URL ?? 'http://127.0.0.1:PORT',
  locale: 'zh-CN',
  deviceScaleFactor: 1,
})

async function selectScenario(request: APIRequestContext, scenarioId: string) {
  const response = await request.post('/api/dev/scenario', { data: { scenarioId } })
  expect(response.ok()).toBe(true)
}

async function openVideoScenario(page: Page, request: APIRequestContext, scenarioId: string) {
  await selectScenario(request, scenarioId)
  await page.goto(PROJECT_URL)
  await expect(page.getByTestId('workflow-canvas')).toBeVisible()
  return page.getByTestId('node-node_video_01')
}

async function expectNoPageOverflow(page: Page) {
  const geometry = await page.evaluate(() => ({
    width: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth,
  }))
  expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.width)
  expect(geometry.bodyWidth).toBeLessThanOrEqual(geometry.width)
}

async function pauseFirstProjectListResponse(page: Page) {
  let release!: () => void
  const paused = new Promise<void>((resolve) => {
    release = resolve
  })

  await page.route('**/api/projects', async (route) => {
    const url = new URL(route.request().url())
    if (route.request().method() !== 'GET' || url.pathname !== '/api/projects') {
      await route.continue()
      return
    }
    await paused
    await route.continue()
  })

  return release
}

test.describe('状态与响应式回归（本地临时服务）', () => {
  test.describe.configure({ mode: 'serial' })

  test.beforeEach(() => {
    expect(REGRESSION_BASE_URL, '请使用 REGRESSION_BASE_URL 指向临时端口').toBeTruthy()
  })

  test.afterEach(async ({ request }) => {
    await selectScenario(request, 'authenticated-empty')
  })

  for (const viewport of VIEWPORTS) {
    test.describe(`${viewport.width}×${viewport.height}`, () => {
      test.use({ viewport })

      test('项目空态、loading、错误与 retry 保持可见', async ({ page, request }) => {
        await selectScenario(request, 'authenticated-empty')

        const releaseProjects = await pauseFirstProjectListResponse(page)
        await page.goto('/project')
        await expect(page.locator('[aria-busy="true"]')).toBeVisible()
        await releaseProjects()
        await expect(page.getByTestId('project-empty-state')).toBeVisible()
        await expectNoPageOverflow(page)

        let failOnce = true
        await page.route('**/api/projects', async (route) => {
          const url = new URL(route.request().url())
          if (route.request().method() === 'GET' && url.pathname === '/api/projects' && failOnce) {
            failOnce = false
            await route.fulfill({
              status: 503,
              contentType: 'application/json',
              body: JSON.stringify({ error: '本地状态回归错误夹具' }),
            })
            return
          }
          await route.continue()
        })
        await page.reload()
        await expect(page.getByTestId('project-load-error')).toBeVisible()
        await expect(page.getByTestId('project-retry')).toBeEnabled()
        await page.getByTestId('project-retry').click()
        await expect(page.getByTestId('project-empty-state')).toBeVisible()
      })

      test('画布主 rail、Storyboard 与页面边界保持可操作', async ({ page, request }) => {
        await selectScenario(request, 'authenticated-populated')
        await page.goto(PROJECT_URL)
        await expect(page.getByTestId('workflow-canvas')).toBeVisible()
        await expectNoPageOverflow(page)

        const primaryRail = page.getByTestId('canvas-primary-rail')
        const addNode = page.getByTestId('add-node-button')
        await expect(primaryRail).toBeVisible()
        const railGeometry = await addNode.evaluate((element) => {
          const rect = element.getBoundingClientRect()
          return { left: rect.left, right: rect.right, width: window.innerWidth }
        })
        expect(railGeometry.left).toBeGreaterThanOrEqual(0)
        expect(railGeometry.right).toBeLessThanOrEqual(railGeometry.width)

        await page.getByTestId('view-storyboard').click()
        await expect(page.getByTestId('storyboard-view')).toBeVisible()
        await expect(page.getByTestId('open-clip-editor')).toBeVisible()
        await expectNoPageOverflow(page)
        if (viewport.width <= 768) {
          await expect(page.getByTestId('storyboard-scroll-hint')).toBeVisible()
        }
      })

      test('视频状态标签与恢复入口保持可见', async ({ page, request }) => {
        for (const [fixture, label] of STATUS_FIXTURES) {
          const node = await openVideoScenario(page, request, fixture)
          const status = node.getByTestId('job-status-job_video_01')
          await expect(status).toContainText(label)

          if (fixture === 'video-queued' || fixture === 'video-running') {
            await expect(node.getByText(fixture === 'video-running' ? '58%' : '0%', { exact: true })).toBeVisible()
            await expect(node.getByRole('button', { name: '取消生成', exact: true })).toBeVisible()
          }
          if (fixture === 'video-failed') {
            await expect(node.getByRole('button', { name: '重试', exact: true })).toBeEnabled()
          }
          if (fixture === 'video-cancelled') {
            await expect(node.getByRole('button', { name: '重新生成', exact: true })).toBeEnabled()
          }
          if (fixture === 'video-compliance-blocked') {
            await page.getByTestId('view-storyboard').click()
            await expect(page.getByTestId('storyboard-status-node_video_01')).toContainText('合规阻断')
            await page.getByTestId('view-workflow').click()
          }
          if (fixture === 'video-awaiting-confirmation') {
            await expect(page.getByTestId('confirm-gate')).toBeVisible()
            await expect(page.getByTestId('quote-expired')).toBeVisible()
            await expect(page.getByTestId('confirm-generate')).toBeDisabled()
          }
        }
      })
    })
  }

  test('有效视频报价确认后扣减本地积分并收敛到运行态', async ({ page, request }) => {
    const node = await openVideoScenario(page, request, 'video-awaiting-valid-confirmation')
    const gate = page.getByTestId('confirm-gate')
    await expect(gate).toBeVisible()
    await expect(page.getByTestId('quote-expired')).toHaveCount(0)
    await expect(page.getByTestId('confirm-generate')).toBeEnabled()

    let releaseTransition!: () => void
    const transitionBlocked = new Promise<void>((resolve) => {
      releaseTransition = resolve
    })
    await page.route('**/api/jobs/job_video_01', async (route) => {
      const request = route.request()
      if (request.method() !== 'POST' || new URL(request.url()).pathname !== '/api/jobs/job_video_01') {
        await route.continue()
        return
      }
      await transitionBlocked
      await route.continue()
    })

    const transitionPromise = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/jobs/job_video_01',
    )
    await page.getByTestId('confirm-generate').click()
    await expect(page.getByTestId('confirm-generate')).toBeDisabled()
    await expect(page.getByTestId('confirm-action-status')).toContainText('正在确认')
    releaseTransition()

    const transition = await transitionPromise
    expect(transition.ok()).toBe(true)
    await expect(gate).toBeHidden()
    await expect(node.getByTestId('job-status-job_video_01')).toContainText('生成中')
    await expect(page.getByTestId('credit-balance')).toContainText('408')
  })

  test('画布错误态提供 retry 且不渲染半成品工作区', async ({ page }) => {
    await page.goto('/canvas?projectId=missing-regression-project&canvasId=missing-regression-canvas')
    await expect(page.getByTestId('canvas-load-error')).toBeVisible()
    await expect(page.getByTestId('canvas-load-error').getByRole('button', { name: '重试', exact: true })).toBeEnabled()
    await expect(page.getByTestId('workflow-canvas')).toHaveCount(0)
  })

  test('768px Storyboard 媒体详情在横向内容上保持焦点闭环', async ({ page, request }) => {
    await page.setViewportSize({ width: 768, height: 700 })
    await selectScenario(request, 'video-succeeded')
    await page.goto(PROJECT_URL)
    await page.getByTestId('view-storyboard').click()
    await expect(page.getByTestId('storyboard-scroll-hint')).toBeVisible()

    await page.getByTestId('storyboard-card-node_video_01').click()
    const detail = page.getByTestId('media-detail')
    await expect(detail).toBeVisible()
    await expectNoPageOverflow(page)

    for (let index = 0; index < 16; index += 1) {
      await page.keyboard.press('Tab')
      const focusedWithinDetail = await detail.evaluate((element) => element.contains(document.activeElement))
      expect(focusedWithinDetail).toBe(true)
    }

    await page.keyboard.press('Escape')
    await expect(detail).toHaveCount(0)
    await expect(page.getByTestId('storyboard-card-node_video_01')).toBeFocused()
  })
})
