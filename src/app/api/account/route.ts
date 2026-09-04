import { AccountProfileResponseSchema } from "@/contracts/account";
import { ACCOUNT_PROFILE_FIXTURE } from "@/mocks/account";
import { handle } from "@/server/http";
import {
  readLocalIdentity,
  readLocalPreferences,
  readNotificationSummary,
} from "@/server/identity";
import { DEFAULT_SPACE_ID, readState } from "@/server/store";

export const dynamic = "force-dynamic";

/**
 * Shared-account projection for the local LibTV shell. Identity and preference
 * values are deterministic fixtures; the available wallet always comes from
 * the same persisted balance that powers the ledger route.
 */
export async function GET() {
  return handle(async () => {
    const [state, localIdentity, preferences, notifications] = await Promise.all([
      readState(),
      readLocalIdentity(),
      readLocalPreferences(),
      readNotificationSummary(),
    ]);
    const authenticated = localIdentity.session.status === "authenticated";
    const availableCredits = authenticated
      ? (state.balances[DEFAULT_SPACE_ID] ?? 0)
      : 0;
    const commonCredits = authenticated ? Math.min(20, availableCredits) : 0;
    const profile = {
      ...ACCOUNT_PROFILE_FIXTURE,
      identity: localIdentity.identity
        ? {
            displayName: localIdentity.identity.displayName,
            maskedAccount: localIdentity.identity.maskedAccount,
            uuidMasked: localIdentity.identity.uuidMasked,
            accessKeyLabel: localIdentity.identity.accessKey.label,
            avatarInitial: localIdentity.identity.avatarInitial,
          }
        : {
            ...ACCOUNT_PROFILE_FIXTURE.identity,
            displayName: "公开浏览者",
            maskedAccount: "未登录",
          },
      preferences: {
        ...ACCOUNT_PROFILE_FIXTURE.preferences,
        ...preferences,
      },
      unreadCount: authenticated ? notifications.unreadCount : 0,
      notifications: authenticated ? notifications.items : [],
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
