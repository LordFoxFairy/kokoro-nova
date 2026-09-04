import type { FullConfig } from "@playwright/test";
import {
  resolveE2ERunnerPlan,
  resolvePreflightTimeout,
  runnerDiagnostics,
} from "./runner-config";

type ScenarioEnvelope = {
  scenario?: { id?: unknown };
  state?: {
    projects?: unknown;
    canvases?: unknown;
    jobs?: unknown;
    assets?: unknown;
  };
};

function preflightError(
  plan: ReturnType<typeof resolveE2ERunnerPlan>,
  detail: string,
  cause?: unknown,
) {
  const error =
    cause instanceof Error
      ? ` Cause: ${cause.message}`
      : cause
        ? ` Cause: ${String(cause)}`
        : "";
  return new Error(
    `[e2e-preflight] ${detail}. ${runnerDiagnostics(plan)}.${error}`,
  );
}

async function fetchWithin(url: string, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal, redirect: "manual" });
  } finally {
    clearTimeout(timer);
  }
}

function assertScenarioEnvelope(
  payload: ScenarioEnvelope,
  plan: ReturnType<typeof resolveE2ERunnerPlan>,
) {
  if (
    typeof payload?.scenario?.id !== "string" ||
    payload.scenario.id.length === 0
  ) {
    throw preflightError(
      plan,
      "fixture endpoint returned an invalid scenario envelope",
    );
  }

  for (const key of ["projects", "canvases", "jobs", "assets"] as const) {
    if (typeof payload.state?.[key] !== "number") {
      throw preflightError(
        plan,
        `fixture endpoint omitted numeric state.${key}`,
      );
    }
  }
}

/**
 * Fail before the first browser starts when the requested target is unhealthy
 * or isn't the deterministic fixture service. No reset is issued here: every
 * existing spec controls its own scenario, and a global write would introduce
 * cross-spec timing instead of isolation.
 */
export default async function e2ePreflight(_config: FullConfig) {
  const plan = resolveE2ERunnerPlan();
  const timeoutMs = resolvePreflightTimeout();

  console.log(
    `[e2e-preflight] validating ${runnerDiagnostics(plan)} timeoutMs=${timeoutMs}`,
  );

  let home: Response;
  try {
    home = await fetchWithin(
      new URL("/", `${plan.baseURL}/`).toString(),
      timeoutMs,
    );
  } catch (cause) {
    throw preflightError(plan, "service did not respond to GET /", cause);
  }
  if (!home.ok)
    throw preflightError(plan, `GET / returned HTTP ${home.status}`);

  if (!plan.fixturePreflight) {
    console.log(
      `[e2e-preflight] production target ready; fixture validation intentionally skipped. ${runnerDiagnostics(plan)}`,
    );
    return;
  }

  let response: Response;
  try {
    response = await fetchWithin(
      new URL("/api/dev/scenario", `${plan.baseURL}/`).toString(),
      timeoutMs,
    );
  } catch (cause) {
    throw preflightError(
      plan,
      "fixture endpoint did not respond to GET /api/dev/scenario",
      cause,
    );
  }
  if (!response.ok)
    throw preflightError(
      plan,
      `GET /api/dev/scenario returned HTTP ${response.status}`,
    );

  let payload: ScenarioEnvelope;
  try {
    payload = (await response.json()) as ScenarioEnvelope;
  } catch (cause) {
    throw preflightError(plan, "fixture endpoint returned invalid JSON", cause);
  }
  assertScenarioEnvelope(payload, plan);
  console.log(
    `[e2e-preflight] fixture ready scenario=${payload.scenario?.id}. ${runnerDiagnostics(plan)}`,
  );
}
