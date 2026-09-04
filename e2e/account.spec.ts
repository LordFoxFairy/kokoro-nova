import { expect, test } from "@playwright/test";

const SHOTS = "docs/screenshots";

test.beforeEach(async ({ request }) => {
  const selected = await request.post("/api/dev/scenario", {
    data: { scenarioId: "authenticated-empty" },
  });
  expect(selected.ok()).toBe(true);
  const reset = await request.post("/api/dev/reset");
  expect(reset.ok()).toBe(true);
});

test("account surface renders the dark shared identity shell and wallet baseline", async ({
  page,
}) => {
  const accountRoute = /\/api\/account$/;
  await page.route(accountRoute, async (route) => {
    const response = await route.fetch();
    await new Promise((resolve) => setTimeout(resolve, 350));
    await route.fulfill({ response });
  });
  await page.goto("/account");
  await expect(
    page.getByRole("status", { name: "正在加载账户" }),
  ).toBeVisible();
  await expect(page.getByTestId("account-identity-mini")).toBeVisible();
  await page.unroute(accountRoute);
  await expect(page.getByTestId("account-identity-card")).toContainText(
    "188****2606",
  );
  await expect(page.getByTestId("account-identity-card")).toContainText(
    "通用 20 · LibTV 80",
  );
  await expect(page.getByTestId("account-page")).toHaveAttribute(
    "data-account-theme",
    "dark",
  );

  await page.screenshot({
    path: `${SHOTS}/libtv-account-local-1440x900.png`,
    scale: "css",
  });

  await page.getByRole("tab", { name: "积分与消费", exact: true }).click();
  await expect(page.getByTestId("account-wallet-summary")).toContainText("100");
  await page.getByTestId("ledger-tab-earned").click();
  await expect(page.getByTestId("ledger-list-earned")).toContainText("100");
});

test("account navigation supports keyboard paths and preserves stale data on refresh errors", async ({
  page,
}) => {
  await page.goto("/account");
  const overview = page.getByRole("tab", { name: "账户概览", exact: true });
  await overview.press("ArrowDown");
  await expect(
    page.getByRole("tab", { name: "积分与消费", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await page.getByRole("tab", { name: "积分与消费", exact: true }).press("End");
  await expect(
    page.getByRole("tab", { name: "CLI & Skill", exact: true }),
  ).toBeFocused();
  await expect(page.getByTestId("account-credentials")).toBeVisible();

  const ledgerRoute = /\/api\/ledger\?limit=20$/;
  await page.route(ledgerRoute, async (route) => {
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "账本服务暂时不可用" }),
    });
  });
  await page.getByRole("tab", { name: "积分与消费", exact: true }).click();
  await page.getByTestId("account-refresh").click();
  await expect(
    page.getByRole("alert").filter({ hasText: "仍显示上次成功读取的账户" }),
  ).toBeVisible();
  await expect(page.getByTestId("account-wallet-summary")).toContainText("100");

  await page.unroute(ledgerRoute);
  await page.getByTestId("account-retry").click();
  await expect(page.getByTestId("account-wallet-summary")).toBeVisible();
  await expect(
    page.getByRole("alert").filter({ hasText: "仍显示上次成功读取的账户" }),
  ).toHaveCount(0);
});
