import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_E2E_DATA_DIR,
  DEFAULT_E2E_DIST_DIR,
  DEFAULT_E2E_PORT,
  isolatedServerEnvironment,
  resolveE2ERunnerPlan,
  resolveIsolatedServerControlFile,
  resolvePreflightTimeout,
} from "./runner-config";

describe("resolveE2ERunnerPlan", () => {
  it("starts the default suite on an isolated service rather than :3200", () => {
    const plan = resolveE2ERunnerPlan({}, "/repo");
    expect(plan).toMatchObject({
      mode: "isolated",
      baseURL: `http://127.0.0.1:${DEFAULT_E2E_PORT}`,
      serverDataDir: path.join("/repo", DEFAULT_E2E_DATA_DIR),
      nextDistDir: path.join("/repo", DEFAULT_E2E_DIST_DIR),
      nextDistDirEnv: DEFAULT_E2E_DIST_DIR,
      startsServer: true,
      fixturePreflight: true,
    });
  });

  it("gives the owned isolated server a stable control file outside fixture data", () => {
    const plan = resolveE2ERunnerPlan({}, "/repo");
    expect(resolveIsolatedServerControlFile(plan, "/tmp/e2e-control")).toMatch(
      /^\/tmp\/e2e-control\/libtv-playwright-runner\/[a-f0-9]{64}\/3210\.json$/,
    );
  });

  it("passes only the isolated server coordinates to the launcher", () => {
    const plan = resolveE2ERunnerPlan({}, "/repo");
    expect(isolatedServerEnvironment(plan, "/tmp/e2e-control")).toMatchObject({
      E2E_ISOLATED_PORT: "3210",
      E2E_ISOLATED_WORKSPACE_DIR: "/repo",
      DATA_DIR: "/repo/.data-e2e",
      NEXT_DIST_DIR: ".next-e2e",
    });
    expect(
      isolatedServerEnvironment(plan, "/tmp/e2e-control").E2E_ISOLATED_CONTROL_FILE,
    ).toMatch(/^\/tmp\/e2e-control\/libtv-playwright-runner\/[a-f0-9]{64}\/3210\.json$/);
  });

  it("accepts an external isolated service without starting or probing :3200", () => {
    const plan = resolveE2ERunnerPlan(
      {
        E2E_BASE_URL: "http://127.0.0.1:4567/",
        E2E_SERVER_DATA_DIR: "/tmp/kokoro-e2e",
      },
      "/repo",
    );
    expect(plan).toMatchObject({
      mode: "external",
      baseURL: "http://127.0.0.1:4567",
      serverDataDir: "/tmp/kokoro-e2e",
      startsServer: false,
      fixturePreflight: true,
    });
  });

  it("rejects external and local configuration that would use :3200", () => {
    expect(() =>
      resolveE2ERunnerPlan({ E2E_BASE_URL: "http://localhost:3200" }),
    ).toThrow(/must not target :3200/);
    expect(() => resolveE2ERunnerPlan({ E2E_PORT: "3200" })).toThrow(
      /reserved/,
    );
  });

  it("rejects absolute or escaping Next output directories", () => {
    expect(() =>
      resolveE2ERunnerPlan({ E2E_NEXT_DIST_DIR: "/tmp/not-supported" }),
    ).toThrow(/must be relative/);
    expect(() =>
      resolveE2ERunnerPlan({ E2E_NEXT_DIST_DIR: "../outside" }),
    ).toThrow(/inside the repository/);
  });

  it("keeps production smoke separate from fixture preflight", () => {
    const plan = resolveE2ERunnerPlan({ PROD_URL: "http://127.0.0.1:3300/" });
    expect(plan).toMatchObject({
      mode: "production",
      baseURL: "http://127.0.0.1:3300",
      fixturePreflight: false,
    });
  });

  it("rejects ambiguous target modes and invalid preflight timeouts", () => {
    expect(() =>
      resolveE2ERunnerPlan({
        E2E_BASE_URL: "http://127.0.0.1:4567",
        PROD_URL: "http://127.0.0.1:3300",
      }),
    ).toThrow(/mutually exclusive/);
    expect(resolvePreflightTimeout({ E2E_PREFLIGHT_TIMEOUT_MS: "12000" })).toBe(
      12_000,
    );
    expect(() =>
      resolvePreflightTimeout({ E2E_PREFLIGHT_TIMEOUT_MS: "10" }),
    ).toThrow(/between 1000 and 120000/);
  });
});
