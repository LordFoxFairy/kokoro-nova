import { createHash } from "node:crypto";
import path from "node:path";

export const DEFAULT_E2E_PORT = 3210;
export const DEFAULT_E2E_DATA_DIR = ".data-e2e";
export const DEFAULT_E2E_DIST_DIR = ".next-e2e";

type Env = Record<string, string | undefined>;

export type E2ERunnerMode = "isolated" | "external" | "production";

export type E2ERunnerPlan = {
  mode: E2ERunnerMode;
  /** Absolute workspace path used to namespace runner-owned process metadata. */
  workspaceDir: string;
  baseURL: string;
  /** Absolute when this runner owns the server; supplied verbatim for external services. */
  serverDataDir: string;
  /** Absolute path used only for diagnostics. */
  nextDistDir?: string;
  /** Relative path passed to Next; Next.js does not support an absolute distDir. */
  nextDistDirEnv?: string;
  port?: number;
  startsServer: boolean;
  fixturePreflight: boolean;
};

function text(env: Env, key: string) {
  const value = env[key]?.trim();
  return value || undefined;
}

function normalizeUrl(value: string, key: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(
      `${key} must be an absolute http(s) URL; received ${JSON.stringify(value)}`,
    );
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(
      `${key} must use http:// or https://; received ${JSON.stringify(value)}`,
    );
  }

  url.hash = "";
  url.search = "";
  return url.toString().replace(/\/$/, "");
}

function portFrom(env: Env) {
  const raw = text(env, "E2E_PORT");
  if (!raw) return DEFAULT_E2E_PORT;
  if (!/^\d+$/.test(raw))
    throw new Error(
      `E2E_PORT must be an integer; received ${JSON.stringify(raw)}`,
    );

  const port = Number(raw);
  if (!Number.isSafeInteger(port) || port < 1024 || port > 65_535) {
    throw new Error(
      `E2E_PORT must be between 1024 and 65535; received ${JSON.stringify(raw)}`,
    );
  }
  if (port === 3200)
    throw new Error(
      "E2E_PORT=3200 is reserved for the interactive dev server; choose an isolated port.",
    );
  return port;
}

function resolveDataDir(cwd: string, value: string) {
  return path.isAbsolute(value) ? value : path.resolve(cwd, value);
}

function resolveNextDistDir(cwd: string, value: string) {
  if (path.isAbsolute(value)) {
    throw new Error(
      "E2E_NEXT_DIST_DIR must be relative to the repository; Next.js does not support an absolute distDir.",
    );
  }

  const normalized = path.normalize(value);
  if (normalized === ".." || normalized.startsWith(`..${path.sep}`)) {
    throw new Error("E2E_NEXT_DIST_DIR must stay inside the repository.");
  }
  return {
    absolute: path.resolve(cwd, normalized),
    environmentValue: normalized,
  };
}

/**
 * Build a single source of truth for the runner, preflight and failure reporter.
 *
 * `E2E_BASE_URL` is deliberately a strict external-service mode: no local
 * server is spawned and port 3200 is rejected before any HTTP request happens.
 * This prevents an isolated E2E invocation from silently using the interactive
 * workspace currently open at :3200.
 */
export function resolveE2ERunnerPlan(
  env: Env = process.env,
  cwd = process.cwd(),
): E2ERunnerPlan {
  const externalBaseURL = text(env, "E2E_BASE_URL");
  const productionBaseURL = text(env, "PROD_URL");

  if (externalBaseURL && productionBaseURL) {
    throw new Error(
      "E2E_BASE_URL and PROD_URL are mutually exclusive. Run one target per Playwright invocation.",
    );
  }

  if (externalBaseURL) {
    const baseURL = normalizeUrl(externalBaseURL, "E2E_BASE_URL");
    if (new URL(baseURL).port === "3200") {
      throw new Error(
        "E2E_BASE_URL must not target :3200. Start an isolated fixture service and use its URL instead.",
      );
    }

    return {
      mode: "external",
      workspaceDir: cwd,
      baseURL,
      serverDataDir:
        text(env, "E2E_SERVER_DATA_DIR") ??
        text(env, "E2E_DATA_DIR") ??
        "<not supplied>",
      startsServer: false,
      fixturePreflight: true,
    };
  }

  if (productionBaseURL) {
    return {
      mode: "production",
      workspaceDir: cwd,
      baseURL: normalizeUrl(productionBaseURL, "PROD_URL"),
      serverDataDir: "<production store; fixture preflight disabled>",
      startsServer: true,
      fixturePreflight: false,
    };
  }

  const port = portFrom(env);
  const dataDir = resolveDataDir(
    cwd,
    text(env, "E2E_DATA_DIR") ?? DEFAULT_E2E_DATA_DIR,
  );
  const nextDist = resolveNextDistDir(
    cwd,
    text(env, "E2E_NEXT_DIST_DIR") ?? DEFAULT_E2E_DIST_DIR,
  );
  return {
    mode: "isolated",
    workspaceDir: cwd,
    baseURL: `http://127.0.0.1:${port}`,
    serverDataDir: dataDir,
    nextDistDir: nextDist.absolute,
    nextDistDirEnv: nextDist.environmentValue,
    port,
    startsServer: true,
    fixturePreflight: true,
  };
}

/**
 * Persist server ownership metadata under the OS temp directory, never in
 * fixture storage or the repository. The path survives a killed Playwright
 * parent long enough for the next run to reclaim only its own process.
 */
export function resolveIsolatedServerControlFile(
  plan: E2ERunnerPlan,
  tempDir: string,
) {
  if (plan.mode !== "isolated" || !plan.port) {
    throw new Error("Only an isolated runner owns a server control file.");
  }

  const workspaceHash = createHash("sha256")
    .update(plan.workspaceDir)
    .digest("hex");
  return path.join(
    tempDir,
    "libtv-playwright-runner",
    workspaceHash,
    `${plan.port}.json`,
  );
}

/** Environment passed verbatim to the local server launcher. */
export function isolatedServerEnvironment(
  plan: E2ERunnerPlan,
  tempDir: string,
): Record<string, string> {
  if (plan.mode !== "isolated" || !plan.port || !plan.nextDistDirEnv) {
    throw new Error("Only an isolated runner can start the local server launcher.");
  }
  return {
    E2E_ISOLATED_PORT: String(plan.port),
    E2E_ISOLATED_CONTROL_FILE: resolveIsolatedServerControlFile(plan, tempDir),
    E2E_ISOLATED_WORKSPACE_DIR: plan.workspaceDir,
    DATA_DIR: plan.serverDataDir,
    NEXT_DIST_DIR: plan.nextDistDirEnv,
  };
}

export function resolvePreflightTimeout(env: Env = process.env) {
  const raw = text(env, "E2E_PREFLIGHT_TIMEOUT_MS");
  if (!raw) return 30_000;
  if (!/^\d+$/.test(raw))
    throw new Error(
      `E2E_PREFLIGHT_TIMEOUT_MS must be an integer; received ${JSON.stringify(raw)}`,
    );

  const timeout = Number(raw);
  if (!Number.isSafeInteger(timeout) || timeout < 1_000 || timeout > 120_000) {
    throw new Error(
      `E2E_PREFLIGHT_TIMEOUT_MS must be between 1000 and 120000; received ${JSON.stringify(raw)}`,
    );
  }
  return timeout;
}

export function runnerDiagnostics(plan: E2ERunnerPlan) {
  return `mode=${plan.mode} baseURL=${plan.baseURL} serverDataDir=${plan.serverDataDir}${plan.nextDistDir ? ` nextDistDir=${plan.nextDistDir}` : ""}`;
}
