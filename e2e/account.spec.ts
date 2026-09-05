import { expect, test } from "@playwright/test";

const SHOTS = process.env.VISUAL_ARTIFACTS_DIR ?? "test-results/documentation";

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
  await expect(page.getByTestId("account-identity-card")).toContainText("UUID");
  await expect(page.getByTestId("account-identity-card")).toContainText("cd••••5d");
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
  const team = page.getByRole("tab", { name: "团队与共享资产", exact: true });
  await expect(team).toBeFocused();
  await expect(team).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("account-team-empty")).toBeVisible();
  await team.press("ArrowUp");
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

test("account notification and preference actions use the shared local APIs", async ({
  page,
}) => {
  await page.goto("/account?tab=notifications");
  await page.getByRole("button", { name: "一键已读" }).click();
  await expect(page.getByTestId("account-action-feedback")).toContainText(
    "已将 2 条通知标为已读",
  );
  await expect(
    page.getByRole("tab", { name: "官方通知", exact: false }),
  ).not.toContainText("2");

  await page.getByRole("tab", { name: "偏好设置", exact: true }).click();
  await page.getByRole("button", { name: "浅色" }).click();
  await expect(page.getByTestId("account-page")).toHaveAttribute(
    "data-account-theme",
    "light",
  );

  await page.goto("/");
  await page.getByTestId("local-identity-trigger-rail").click();
  await expect(page.getByRole("button", { name: "浅色模式" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("account purchase and subscription actions report their deterministic local result", async ({
  page,
}) => {
  await page.goto("/account");
  await page
    .getByTestId("account-membership-card")
    .getByRole("button", { name: "开通会员" })
    .click();
  await expect(page.getByTestId("account-action-feedback")).toContainText(
    "本地订阅方案已准备就绪",
  );

  await page.goto("/account?tab=wallet");
  await page.getByRole("button", { name: "充值" }).click();
  await expect(page.getByTestId("account-action-feedback")).toContainText("本地充值入口已准备就绪");

  await page.getByRole("tab", { name: "会员与发票", exact: true }).click();
  await expect(page.getByTestId("account-external-handoffs")).toBeVisible();
  await page.getByRole("button", { name: "开通会员" }).click();
  await expect(page.getByTestId("account-action-feedback")).toContainText("账单服务接手");
  await page.getByTestId("account-handoff-invoice").click();
  await expect(page.getByTestId("account-action-feedback")).toContainText("当前确定性 fixture 没有购买记录");
});

test('account team workspace projects loading, shared assets and retryable error states', async ({ page, request }) => {
  const selected = await request.post('/api/dev/scenario', { data: { scenarioId: 'authenticated-populated' } });
  expect(selected.ok()).toBe(true);
  const reset = await request.post('/api/dev/reset');
  expect(reset.ok()).toBe(true);
  const signIn = await request.post('/api/identity', { data: { action: 'signIn', returnTo: '/' } });
  expect(signIn.ok()).toBe(true);

  let releaseTeamResponse: (() => void) | undefined;
  const teamResponseGate = new Promise<void>((resolve) => {
    releaseTeamResponse = resolve;
  });
  let markTeamRequest: (() => void) | undefined;
  const teamRequestStarted = new Promise<void>((resolve) => {
    markTeamRequest = resolve;
  });
  await page.route(/\/api\/team$/, async (route) => {
    const response = await route.fetch();
    markTeamRequest?.();
    await teamResponseGate;
    await route.fulfill({ response });
  });
  await page.goto('/account?tab=team');
  await teamRequestStarted;
  // The team response stays deferred until the base account surface is ready,
  // so this proves the real in-panel loading state instead of timing a delay.
  await expect(page.getByRole('status', { name: '正在加载团队与共享资产' })).toBeVisible();
  releaseTeamResponse?.();
  await expect(page.getByTestId('account-team-ready')).toContainText('Kokoro 创作组');
  await page.unroute(/\/api\/team$/);
  await expect(page.getByTestId('account-shared-assets')).toContainText('雨夜城市分镜参考');
  await expect(page.getByTestId('account-shared-assets')).toContainText('可编辑');
  await expect(page.getByTestId('account-shared-assets')).toContainText('仅查看');

  await page.route(/\/api\/shared-assets$/, async (route) => {
    await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: '共享资产服务暂时不可用' }) });
  });
  await page.getByTestId('account-team-reload').click();
  await expect(page.getByRole('alert').filter({ hasText: '团队与共享资产暂时不可用' })).toBeVisible();
  await page.unroute(/\/api\/shared-assets$/);
  await page.getByRole('button', { name: '重试团队与资产' }).click();
  await expect(page.getByTestId('account-shared-assets')).toBeVisible();
});

test('account team workspace distinguishes empty membership from the local permission gate', async ({ page, request }) => {
  await page.goto('/account?tab=team');
  await expect(page.getByTestId('account-team-empty')).toContainText('尚未加入团队');
  await expect(page.getByTestId('account-shared-assets')).toContainText('暂无共享资产');

  const signedOut = await request.post('/api/identity', { data: { action: 'signOut', returnTo: '/account?tab=team' } });
  expect(signedOut.ok()).toBe(true);
  await page.getByTestId('account-team-reload').click();
  await expect(page.getByTestId('account-team-permission')).toContainText('需要登录后查看团队');
  await expect(page.getByTestId('account-shared-assets')).toHaveCount(0);
});


test("account exposes masked Access Key lifecycle and deterministic external-service handoffs", async ({ page }) => {
  await page.goto("/account?tab=credentials");
  await page.getByTestId("access-key-create").click();
  await expect(page.getByTestId("account-action-feedback")).toContainText("已创建脱敏 Access Key");
  await expect(page.getByTestId("account-credentials")).toContainText("lvtk_••••••••01");
  await page.getByTestId("access-key-rotate").click();
  await expect(page.getByTestId("account-credentials")).toContainText("generation 2");
  await page.getByTestId("access-key-revoke").click();
  await expect(page.getByTestId("account-credentials")).toContainText("状态：revoked");
  await expect(page.getByTestId("account-credentials")).not.toContainText("sk-");

  await page.getByRole("tab", { name: "会员与发票", exact: true }).click();
  await expect(page.getByTestId("account-external-handoffs")).toContainText("账单服务接手");
  await expect(page.getByTestId("account-external-handoffs")).toContainText("模型目录服务负责");
  await page.getByTestId("account-handoff-invoice").click();
  await expect(page.getByTestId("account-action-feedback")).toContainText("当前确定性 fixture 没有购买记录");
});

test("account team commands create a local alias invitation and update a non-owner role", async ({ page, request }) => {
  const selected = await request.post("/api/dev/scenario", { data: { scenarioId: "authenticated-populated" } });
  expect(selected.ok()).toBe(true);
  const reset = await request.post("/api/dev/reset");
  expect(reset.ok()).toBe(true);
  const signIn = await request.post("/api/identity", { data: { action: "signIn", returnTo: "/" } });
  expect(signIn.ok()).toBe(true);

  await page.goto("/account?tab=team");
  await page.getByTestId("team-invite-alias").fill("本地协作者");
  await page.getByTestId("team-invite-submit").click();
  await expect(page.getByTestId("team-pending-invites")).toContainText("本地协作者（成员）");
  await page.getByTestId("team-member-toggle-member_liu").click();
  await expect(page.getByTestId("account-team-ready")).toContainText("刘 · 刘同学 · 成员");
});
