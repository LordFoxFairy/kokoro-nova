import { z } from "zod";

const IsoTimestampSchema = z.string().datetime();

export const AccountSectionIdSchema = z.enum([
  "overview",
  "wallet",
  "membership",
  "notifications",
  "preferences",
  "credentials",
]);

export const AccountIdentitySchema = z
  .object({
    displayName: z.string().min(1).max(120),
    maskedAccount: z.string().min(1).max(120),
    uuidMasked: z.string().min(1).max(120),
    accessKeyLabel: z.string().min(1).max(120),
    avatarInitial: z.string().min(1).max(2),
  })
  .strict();

export const AccountMembershipSchema = z
  .object({
    label: z.string().min(1).max(80),
    status: z.enum(["active", "trial", "expired"]),
    benefit: z.string().min(1).max(200),
    daysRemaining: z.number().int().nonnegative(),
  })
  .strict();

export const AccountWalletSchema = z
  .object({
    availableCredits: z.number().finite().nonnegative(),
    commonCredits: z.number().finite().nonnegative(),
    libTvCredits: z.number().finite().nonnegative(),
    storageUsedGb: z.number().finite().nonnegative(),
    storageTotalGb: z.number().finite().nonnegative(),
  })
  .strict();

export const AccountPreferencesSchema = z
  .object({
    theme: z.enum(["light", "dark"]),
    aiWatermark: z.boolean(),
    recommendations: z.boolean(),
  })
  .strict();

export const AccountNotificationSchema = z
  .object({
    id: z.string().min(1).max(200),
    title: z.string().min(1).max(200),
    body: z.string().min(1).max(2_000),
    createdAt: IsoTimestampSchema,
    unread: z.boolean(),
  })
  .strict();

export const AccountProfileResponseSchema = z
  .object({
    identity: AccountIdentitySchema,
    membership: AccountMembershipSchema,
    wallet: AccountWalletSchema,
    preferences: AccountPreferencesSchema,
    notifications: z.array(AccountNotificationSchema),
    unreadCount: z.number().int().nonnegative(),
  })
  .strict();

export type AccountSectionId = z.infer<typeof AccountSectionIdSchema>;
export type AccountProfileResponse = z.infer<
  typeof AccountProfileResponseSchema
>;
