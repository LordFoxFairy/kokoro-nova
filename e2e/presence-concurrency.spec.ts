import { expect, test } from '@playwright/test'

import { POPULATED_CANVAS, openCanvasFixture, selectCanvasScenario } from './helpers/canvas-fixtures'

test('presence: a rejected follower takes the editor lease only after release without changing the workflow document', async ({ browser }) => {
  const aliceContext = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const bobContext = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const alice = await aliceContext.newPage()
  const bob = await bobContext.newPage()

  try {
    await selectCanvasScenario(alice.request, 'authenticated-populated')
    const beforeResponse = await alice.request.get(`/api/canvases/${POPULATED_CANVAS.canvasId}`)
    expect(beforeResponse.ok()).toBe(true)
    const before = await beforeResponse.json() as { canvas: { revision: number; document: unknown } }

    await openCanvasFixture(alice, alice.request)
    await expect(alice.getByTestId('presence-lease-active')).toBeVisible({ timeout: 20_000 })

    await bob.goto(alice.url())
    await expect(bob.getByTestId('workflow-canvas')).toBeVisible()
    await expect(bob.getByTestId('presence-lease-blocked')).toBeVisible({ timeout: 20_000 })

    // Lease rejection does not turn Bob into an offline tab: he can follow
    // Alice's camera while the server holds her editor seat.
    const aliceAvatar = bob.locator('[data-testid^="presence-avatar-"]').first()
    await expect(aliceAvatar).toBeVisible({ timeout: 20_000 })
    await aliceAvatar.click()
    await expect(bob.getByTestId('presence-follow-banner')).toBeVisible()

    // Unmounting Alice releases her token-guarded lease. Bob remains on the
    // same canvas and explicitly transitions from follower to editor.
    await alice.goto('/project')
    await expect(bob.locator('[data-testid^="presence-avatar-"]')).toHaveCount(0, { timeout: 20_000 })
    await bob.getByTestId('presence-lease-retry').click()
    await expect(bob.getByTestId('presence-lease-active')).toBeVisible({ timeout: 20_000 })

    const afterResponse = await bob.request.get(`/api/canvases/${POPULATED_CANVAS.canvasId}`)
    expect(afterResponse.ok()).toBe(true)
    const after = await afterResponse.json() as { canvas: { revision: number; document: unknown } }
    expect(after.canvas.revision).toBe(before.canvas.revision)
    expect(after.canvas.document).toEqual(before.canvas.document)
  } finally {
    await aliceContext.close()
    await bobContext.close()
  }
})
