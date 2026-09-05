import { describe, expect, it } from "vitest";

import { AccountProfileResponseSchema } from "../account";
import {
  ACCOUNT_SECTIONS,
  moveAccountSection,
  sectionFromQuery,
} from "@/components/account/account-navigation";

const fixture = {
  identity: {
    displayName: "LibTV 创作者",
    maskedAccount: "188****2606",
    uuidMasked: "a2d7••••91c4",
    accessKeyLabel: "Access key",
    avatarInitial: "L",
  },
  membership: {
    label: "免费用户",
    status: "active",
    benefit: "Seedream 4.5 限时 5 折",
    daysRemaining: 1,
  },
  wallet: {
    availableCredits: 100,
    commonCredits: 20,
    libTvCredits: 80,
    storageUsedGb: 0,
    storageTotalGb: 3,
  },
  preferences: {
    theme: "dark",
    aiWatermark: true,
    recommendations: true,
  },
  notifications: [
    {
      id: "notice-welcome",
      title: "Agent 全面上线",
      body: "使用 LibTV Agent 快速开始你的创作。",
      createdAt: "2026-09-04T12:00:00.000Z",
      unread: true,
    },
  ],
  unreadCount: 1,
};

describe("account domain contract", () => {
  it("accepts the deterministic identity, wallet and preferences fixture", () => {
    const parsed = AccountProfileResponseSchema.parse(fixture);

    expect(parsed.wallet.availableCredits).toBe(100);
    expect(parsed.identity.maskedAccount).toBe("188****2606");
    expect(parsed.preferences.theme).toBe("dark");
  });

  it("keeps account navigation keyboard movement cyclic and query-compatible", () => {
    expect(moveAccountSection("overview", "ArrowDown")).toBe("wallet");
    expect(moveAccountSection("overview", "ArrowUp")).toBe("team");
    expect(moveAccountSection("wallet", "Home")).toBe("overview");
    expect(moveAccountSection("wallet", "End")).toBe("team");
    expect(moveAccountSection("wallet", "Enter")).toBeNull();
    expect(sectionFromQuery("store")).toBe("wallet");
    expect(sectionFromQuery("membership")).toBe("membership");
    expect(sectionFromQuery("team")).toBe("team");
    expect(sectionFromQuery("unknown")).toBe(ACCOUNT_SECTIONS[0].id);
  });
});
