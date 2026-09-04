import type {
  FullResult,
  Reporter,
  TestCase,
  TestResult,
} from "@playwright/test/reporter";
import { resolveE2ERunnerPlan, runnerDiagnostics } from "./runner-config";

function target() {
  try {
    return runnerDiagnostics(resolveE2ERunnerPlan());
  } catch (error) {
    return `runner-plan-error=${error instanceof Error ? error.message : String(error)}`;
  }
}

/**
 * The list reporter owns normal output. This reporter only adds actionable
 * target metadata to unexpected outcomes, so a trace can be matched to the
 * exact isolated URL and workspace data directory that produced it.
 */
export default class IsolatedObservabilityReporter implements Reporter {
  onTestEnd(test: TestCase, result: TestResult) {
    if (result.status === test.expectedStatus) return;

    const errors = result.errors
      .map((error) => error.message?.split("\n")[0])
      .filter(Boolean)
      .join(" | ");
    console.error(
      `[e2e-observability] unexpected=${result.status} expected=${test.expectedStatus} test=${test.titlePath().join(" › ")} ${target()}${errors ? ` error=${errors}` : ""}`,
    );
  }

  onError(error: Error) {
    console.error(
      `[e2e-observability] runner error ${target()} error=${error.message}`,
    );
  }

  onEnd(result: FullResult) {
    if (result.status !== "passed") {
      console.error(`[e2e-observability] run=${result.status} ${target()}`);
    }
  }
}
