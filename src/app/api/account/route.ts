import { AccountProfileResponseSchema } from "@/contracts/account";
import { ACCOUNT_PROFILE_FIXTURE } from "@/mocks/account";
import { SCENARIO_CATALOG } from "@/mocks/scenarios/catalog";
import { handle } from "@/server/http";
import { activeScenarioId, DEFAULT_SPACE_ID, readState } from "@/server/store";

export const dynamic = "force-dynamic";

/**
 * Shared-account projection for the local LibTV shell. Identity and preference
 * values are deterministic fixtures; the available wallet always comes from
 * the same persisted balance that powers the ledger route.
 */
export async function GET() {
  return handle(async () => {
    const [state, scenarioId] = await Promise.all([
      readState(),
      activeScenarioId(),
    ]);
    const authenticated =
      SCENARIO_CATALOG[scenarioId].viewer === "authenticated";
    const availableCredits = authenticated
      ? (state.balances[DEFAULT_SPACE_ID] ?? 0)
      : 0;
    const commonCredits = authenticated ? Math.min(20, availableCredits) : 0;
    const profile = {
      ...ACCOUNT_PROFILE_FIXTURE,
      identity: authenticated
        ? ACCOUNT_PROFILE_FIXTURE.identity
        : {
            ...ACCOUNT_PROFILE_FIXTURE.identity,
            displayName: "公开浏览者",
            maskedAccount: "未登录",
          },
      unreadCount: authenticated ? ACCOUNT_PROFILE_FIXTURE.unreadCount : 0,
      notifications: authenticated ? ACCOUNT_PROFILE_FIXTURE.notifications : [],
      wallet: {
        availableCredits,
        commonCredits,
        libTvCredits: Math.max(0, availableCredits - commonCredits),
        storageUsedGb: 0,
        storageTotalGb: 3,
      },
    };
    return AccountProfileResponseSchema.parse(profile);
  });
}
