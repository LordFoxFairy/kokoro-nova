import type { AccountSectionId } from "@/contracts/account";

export const ACCOUNT_SECTIONS: {
  id: AccountSectionId;
  label: string;
  shortLabel: string;
}[] = [
  { id: "overview", label: "账户概览", shortLabel: "概览" },
  { id: "wallet", label: "积分与消费", shortLabel: "积分" },
  { id: "membership", label: "会员与发票", shortLabel: "会员" },
  { id: "notifications", label: "通知中心", shortLabel: "通知" },
  { id: "preferences", label: "偏好设置", shortLabel: "偏好" },
  { id: "credentials", label: "CLI & Skill", shortLabel: "CLI" },
];

const QUERY_ALIASES: Record<string, AccountSectionId> = {
  store: "wallet",
  membership: "membership",
  notification: "notifications",
  notifications: "notifications",
  preference: "preferences",
  preferences: "preferences",
  cli: "credentials",
  credentials: "credentials",
};

export function sectionFromQuery(
  value: string | null | undefined,
): AccountSectionId {
  if (!value) return ACCOUNT_SECTIONS[0].id;
  if (AccountSectionIdGuard(value)) return value;
  return QUERY_ALIASES[value] ?? ACCOUNT_SECTIONS[0].id;
}

function AccountSectionIdGuard(value: string): value is AccountSectionId {
  return ACCOUNT_SECTIONS.some((section) => section.id === value);
}

export function moveAccountSection(
  current: AccountSectionId,
  key: string,
): AccountSectionId | null {
  const index = Math.max(
    0,
    ACCOUNT_SECTIONS.findIndex((section) => section.id === current),
  );
  if (key === "Home") return ACCOUNT_SECTIONS[0].id;
  if (key === "End") return ACCOUNT_SECTIONS[ACCOUNT_SECTIONS.length - 1].id;
  if (key !== "ArrowDown" && key !== "ArrowUp") return null;
  const delta = key === "ArrowDown" ? 1 : -1;
  const next =
    (index + delta + ACCOUNT_SECTIONS.length) % ACCOUNT_SECTIONS.length;
  return ACCOUNT_SECTIONS[next].id;
}
