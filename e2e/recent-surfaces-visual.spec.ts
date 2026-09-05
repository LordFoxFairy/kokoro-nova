import { expect, test, type Page } from '@playwright/test'

import { openCanvasFixture, selectCanvasScenario } from './helpers/canvas-fixtures'
import { waitForStableVisuals } from './helpers/visual-stability'

/**
 * 1440×900 visual contracts for recently added local-only surfaces.  These
 * fixtures intentionally set every server-side scenario before navigating,
 * rather than depending on the state persisted by any neighbouring journey.
 */
test.use({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
})

async function expectStableBaseline(page: Page, name: string) {
  await waitForStableVisuals(page)
  await expect(page).toHaveScreenshot(name, {
    animations: 'disabled',
    caret: 'hide',
    scale: 'css',
    maxDiffPixelRatio: 0.0001,
  })
}

/**
 * A visible <video> may still be using the poster's intrinsic dimensions.
 * The browser replaces those with the stream dimensions after metadata lands,
 * which changes the object-contain projection without a React state update.
 * Capture the post-metadata state so neighbouring serial journeys cannot turn
 * this visual contract into a timing race.
 */
async function stabilizeShowcaseVideo(page: Page) {
  const video = page.getByTestId('showcase-player-video')
  await expect(video).toBeVisible()
  await expect.poll(async () => video.evaluate((element) => (
    element.readyState >= HTMLMediaElement.HAVE_METADATA
      && element.videoWidth === 1280
      && element.videoHeight === 720
  ))).toBe(true)

  await video.evaluate((element) => {
    element.pause()
    element.currentTime = 0
    element.dispatchEvent(new Event('timeupdate'))
    element.dispatchEvent(new Event('canplay'))
  })
  await expect(video).toHaveJSProperty('currentTime', 0)
}

async function resetAuthenticatedPopulated(page: Page) {
  const selected = await page.request.post('/api/dev/scenario', {
    data: { scenarioId: 'authenticated-populated' },
  })
  expect(selected.ok()).toBe(true)
  const reset = await page.request.post('/api/dev/reset')
  expect(reset.ok()).toBe(true)
  const signIn = await page.request.post('/api/identity', {
    data: { action: 'signIn', returnTo: '/' },
  })
  expect(signIn.ok(), `POST /api/identity returned ${signIn.status()}: ${await signIn.text()}`).toBe(true)
}

test.describe('recent surface visual baselines', () => {
  test('Skill authoring workspace exposes the versioned local draft workbench', async ({ page }) => {
    const reset = await page.request.post('/api/dev/reset')
    expect(reset.ok()).toBe(true)

    await page.goto('/skill/create')
    const studio = page.getByTestId('skill-author-studio')
    await expect(studio.getByTestId('skill-author-empty')).toBeVisible()
    await studio.getByTestId('skill-author-create').click()
    await expect(studio.getByTestId('skill-author-name')).toBeVisible()
    await expect(studio.locator('[aria-busy]')).toHaveAttribute('aria-busy', 'false')

    await expectStableBaseline(page, 'skill-author-workbench-1440x900.png')
  })

  test('account team workspace presents members and local shared asset permissions', async ({ page }) => {
    await resetAuthenticatedPopulated(page)

    await page.goto('/account?tab=team')
    await expect(page.getByTestId('account-team-ready')).toContainText('Kokoro 创作组')
    await expect(page.getByTestId('account-shared-assets')).toContainText('雨夜城市分镜参考')
    await page.evaluate(() => {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
      document.documentElement.scrollTop = 0
      document.body.scrollTop = 0
    })
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0)
    // Keep this baseline scoped to the team/asset projection. Adjacent
    // invitation-management controls have their own interaction coverage and
    // must not shift the projection frame while that command surface evolves.
    await page.addStyleTag({
      content: '[data-testid="account-team-commands"], [data-testid^="team-member-toggle-"] { display: none !important; }',
    })
    // Refresh time is deliberately live UI state. Freeze only its text inside
    // this browser frame, retaining its layout while avoiding clock-based diffs.
    await page.getByTestId('account-refresh-status').evaluate((element) => {
      element.textContent = '已更新'
    })

    await expectStableBaseline(page, 'account-team-shared-assets-1440x900.png')
  })

  test('TV Show player keeps the explicit quality selector above local playback controls', async ({ page }) => {
    const selected = await page.request.post('/api/dev/scenario', {
      data: { scenarioId: 'public-showcase' },
    })
    expect(selected.ok()).toBe(true)
    const reset = await page.request.post('/api/dev/reset')
    expect(reset.ok()).toBe(true)

    await page.goto('/showcase/pub_city_night_01')
    await page.getByTestId('showcase-watch').click()
    await stabilizeShowcaseVideo(page)
    await expect(page.getByTestId('showcase-player-buffering')).toHaveCount(0)
    await page.getByTestId('showcase-player-quality').click()
    await expect(page.getByTestId('showcase-player-quality-menu')).toBeVisible()

    await expectStableBaseline(page, 'tv-show-player-quality-menu-1440x900.png')
  })

  test('canvas follower lease state remains visible alongside remote presence controls', async ({ browser }) => {
    const editorContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
    const followerContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
    await editorContext.addInitScript(() => {
      sessionStorage.setItem('novavideo.presence.self', JSON.stringify({
        id: 'visual-editor', name: '视觉编辑者', color: '#4c7ef3',
      }))
    })
    await followerContext.addInitScript(() => {
      sessionStorage.setItem('novavideo.presence.self', JSON.stringify({
        id: 'visual-follower', name: '视觉跟随者', color: '#d9528f',
      }))
    })
    const editor = await editorContext.newPage()
    const follower = await followerContext.newPage()

    try {
      await selectCanvasScenario(editor.request, 'authenticated-populated')
      await openCanvasFixture(editor, editor.request)
      await expect(editor.getByTestId('presence-lease-active')).toBeVisible({ timeout: 20_000 })

      await follower.goto(editor.url())
      await expect(follower.getByTestId('workflow-canvas')).toBeVisible()
      await expect(follower.getByTestId('presence-lease-blocked')).toBeVisible({ timeout: 20_000 })
      const editorAvatar = follower.locator('[data-testid^="presence-avatar-"]').first()
      await expect(editorAvatar).toBeVisible({ timeout: 20_000 })
      await editorAvatar.click()
      await expect(follower.getByTestId('presence-follow-banner')).toBeVisible()

      await expectStableBaseline(follower, 'canvas-presence-follower-lease-1440x900.png')
    } finally {
      await editorContext.close()
      await followerContext.close()
    }
  })
})
