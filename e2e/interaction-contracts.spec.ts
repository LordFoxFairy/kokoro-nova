import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

import {
  POPULATED_CANVAS,
  openCanvasFixture,
  selectCanvasScenario,
} from "./helpers/canvas-fixtures";

type PublishedSnapshotResponse = {
  snapshot: {
    document: unknown;
  };
};

type CanvasResponse = {
  canvas: {
    document: unknown;
    revision: number;
  };
};

async function resetAuthenticatedFixture(request: APIRequestContext) {
  await selectCanvasScenario(request, "authenticated-populated");
  const reset = await request.post("/api/dev/reset");
  expect(reset.ok()).toBe(true);
}

async function readPublishedSnapshot(request: APIRequestContext) {
  const response = await request.get("/api/publish/pub_city_night_01");
  expect(response.ok()).toBe(true);
  return (await response.json()) as PublishedSnapshotResponse;
}

async function openPublicProcess(page: Page) {
  await page.goto("/showcase/pub_city_night_01");
  await expect(page.getByTestId("showcase-detail")).toBeVisible();
  await page.getByTestId("showcase-process").click();
  await expect(page.getByTestId("public-canvas-view")).toBeVisible();
}

test.describe("关键本地 mock 交互契约", () => {
  test.beforeEach(async ({ request }) => {
    await resetAuthenticatedFixture(request);
  });

  test("editor account entry preserves the observed store alias and selected account section", async ({
    page,
    request,
  }) => {
    await openCanvasFixture(page, request, POPULATED_CANVAS);

    await page.getByRole("link", { name: "积分超市", exact: true }).click();
    await expect(page).toHaveURL(/\/account\?tab=store$/);
    await expect(
      page.getByRole("tab", { name: "积分与消费", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId("account-wallet-summary")).toBeVisible();
  });

  test("skill favourite keeps its prior state on a local failure and recovers through retry", async ({
    page,
  }) => {
    let favouriteAttempts = 0;
    await page.route("**/api/skills/skill-storyboard-breakdown", async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }

      favouriteAttempts += 1;
      if (favouriteAttempts === 1) {
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: "本地收藏 mock 暂时不可用" }),
        });
        return;
      }
      await route.continue();
    });

    await page.goto("/skills");
    const favourite = page.getByTestId(
      "skill-favourite-skill-storyboard-breakdown",
    );
    await expect(favourite).toHaveAttribute("aria-pressed", "false");

    await favourite.click();
    await expect(page.getByTestId("skill-favourite-retry").locator("..")).toContainText(
      "本地收藏 mock 暂时不可用",
    );
    await expect(favourite).toHaveAttribute("aria-pressed", "false");

    await page.getByTestId("skill-favourite-retry").click();
    await expect(favourite).toHaveAttribute("aria-pressed", "true");
    expect(favouriteAttempts).toBe(2);
  });

  test("cloning crosses from frozen public process into an independently editable private canvas", async ({
    page,
    request,
  }) => {
    const frozenBefore = await readPublishedSnapshot(request);

    await openPublicProcess(page);
    await expect(page.getByTestId("public-workflow")).toBeVisible();
    await expect(page.getByTestId("workflow-canvas")).toHaveCount(0);
    await expect(page.getByTestId("add-node-button")).toHaveCount(0);

    await page.getByTestId("clone-project").click();
    await expect(page.getByTestId("showcase-clone-dialog")).toBeVisible();
    await page.getByTestId("showcase-clone-confirm").click();
    const openCopy = page.getByTestId("showcase-clone-open-project");
    await expect(openCopy).toBeVisible();
    const copyHref = await openCopy.getAttribute("href");
    expect(copyHref).toMatch(/^\/canvas\?projectId=prj_[^&]+&canvasId=cvs_[^&]+$/);

    const copyUrl = new URL(copyHref!, "http://fixture.local");
    const copyCanvasId = copyUrl.searchParams.get("canvasId");
    expect(copyCanvasId).toBeTruthy();

    await openCopy.click();
    await expect(page).toHaveURL(/\/canvas\?projectId=prj_[^&]+&canvasId=cvs_[^&]+$/);
    await expect(page.getByTestId("workflow-canvas")).toBeVisible();
    const addNode = page.getByTestId("add-node-button");
    await expect(addNode).toBeEnabled();

    const beforePrivate = await request.get(`/api/canvases/${copyCanvasId}`);
    expect(beforePrivate.ok()).toBe(true);
    const privateBefore = (await beforePrivate.json()) as CanvasResponse;

    const persisted = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === `/api/canvases/${copyCanvasId}` &&
        response.ok(),
    );
    await addNode.click();
    await page.getByRole("menu").first().getByRole("menuitem", { name: "文本", exact: true }).click();
    await persisted;

    const afterPrivate = await request.get(`/api/canvases/${copyCanvasId}`);
    expect(afterPrivate.ok()).toBe(true);
    const privateAfter = (await afterPrivate.json()) as CanvasResponse;
    expect(privateAfter.canvas.revision).toBe(privateBefore.canvas.revision + 1);

    const frozenAfter = await readPublishedSnapshot(request);
    expect(frozenAfter.snapshot.document).toEqual(frozenBefore.snapshot.document);
  });
});
