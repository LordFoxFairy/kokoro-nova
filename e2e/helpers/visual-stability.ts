import type { Page } from '@playwright/test'

/**
 * Make screenshot capture wait for a semantic render boundary instead of an
 * arbitrary delay. This avoids recording catalogue/media loading frames while
 * retaining a tight visual-diff threshold.
 */
export async function waitForStableVisuals(page: Page) {
  await page.addStyleTag({
    content: `
      nextjs-portal { display: none !important; }
      /* Presence is a live lease, not part of the deterministic visual state. */
      [data-testid="presence-lease-acquiring"],
      [data-testid="presence-lease-active"] { visibility: hidden !important; }
      *, *::before, *::after {
        animation-duration: 0s !important;
        animation-delay: 0s !important;
        transition-duration: 0s !important;
        transition-delay: 0s !important;
      }
    `,
  })
  await page.evaluate(async () => {
    await document.fonts.ready
    await Promise.all(
      Array.from(document.images).map(async (image) => {
        if (!image.complete) {
          await new Promise<void>((resolve) => {
            image.addEventListener('load', () => resolve(), { once: true })
            image.addEventListener('error', () => resolve(), { once: true })
          })
        }
        if (image.naturalWidth > 0) await image.decode().catch(() => undefined)
      }),
    )
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
  })
}
