import type { AccountProfileResponse } from "@/contracts/account";

export const ACCOUNT_PROFILE_FIXTURE: Omit<AccountProfileResponse, "wallet"> = {
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
