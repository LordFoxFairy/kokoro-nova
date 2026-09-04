import { execFileSync } from "node:child_process";
import os from "node:os";
import { defineConfig, devices } from "@playwright/test";
import {
  isolatedServerEnvironment,
  resolveE2ERunnerPlan,
} from "./e2e/helpers/runner-config";

const runner = resolveE2ERunnerPlan();
const serverNodeEnv = (process.env.NODE_ENV ?? "test") as NodeJS.ProcessEnv["NODE_ENV"];
const inheritedServerEnv: Record<string, string> = {
  ...Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  ),
  NODE_ENV: serverNodeEnv,
};
const isolatedServerEnv =
  runner.mode === "isolated"
    ? isolatedServerEnvironment(runner, os.tmpdir())
    : undefined;

// Playwright checks the configured URL before it launches `webServer`. Reclaim
// our recorded orphan synchronously first, so that check never mistakes :3210
// for a reusable service. This helper refuses all unmarked listeners.
if (runner.mode === "isolated" && process.env.E2E_ISOLATED_RECLAIMED !== "1") {
  execFileSync(process.execPath, ["e2e/helpers/isolated-server.ts", "--reclaim"], {
    cwd: runner.workspaceDir,
    env: {
      ...inheritedServerEnv,
      ...isolatedServerEnv,
      NODE_ENV: serverNodeEnv,
    },
    stdio: "inherit",
  });
  // Playwright evaluates the config again in worker processes. Carry this
  // parent-only preflight result forward so workers never tear down the server
  // that the parent just launched.
  process.env.E2E_ISOLATED_RECLAIMED = "1";
}

/**
 * E2E has a dedicated default server at :3210 with independent Next output and
 * fixture storage. The interactive `pnpm dev` process remains at :3200 and is
 * never reused by this config. `E2E_BASE_URL` is an external-service mode: it
 * does not start a process and its target is validated by global setup.
 */
const webServer =
  runner.mode === "production"
    ? {
        command: `NEXT_DIST_DIR=.next-prod pnpm exec next start -p ${new URL(runner.baseURL).port || "3000"}`,
        url: runner.baseURL,
        reuseExistingServer: true,
        timeout: 120_000,
      }
    : runner.mode === "isolated"
      ? {
          command: "node e2e/helpers/isolated-server.ts",
          url: runner.baseURL,
          // The launcher reclaims only a recorded runner-owned orphan. An
          // unmarked listener fails instead of being reused or terminated.
          reuseExistingServer: false,
          timeout: 120_000,
          env: {
            ...inheritedServerEnv,
            ...isolatedServerEnv,
          },
        }
      : undefined;

/**
 * The desktop baseline is 1440x900 — the same viewport the research
 * screenshots were captured at, so layout comparisons stay meaningful.
 */
export default defineConfig({
  testDir: "./e2e",
  // Helper unit tests live beside runner code and are executed by Vitest, not Chromium.
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  globalSetup: "./e2e/helpers/e2e-preflight.ts",
  reporter: [["list"], ["./e2e/helpers/isolated-observability-reporter.ts"]],
  use: {
    // Spread first: the device preset carries its own viewport/scale factor.
    ...devices["Desktop Chrome"],
    baseURL: runner.baseURL,
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    locale: "zh-CN",
    trace: "retain-on-failure",
  },
  webServer,
});
