import { z } from 'zod'

export const NotificationItemSchema = z.object({
  id: z.string().min(1).max(160),
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(1_000),
  createdAt: z.string().datetime(),
  unread: z.boolean(),
}).strict()

export const NotificationSummarySchema = z.object({
  unreadCount: z.number().int().nonnegative(),
  totalCount: z.number().int().nonnegative(),
  items: z.array(NotificationItemSchema).max(3),
}).strict().refine((value) => value.unreadCount <= value.totalCount, '未读数不能大于通知总数')

export const NotificationsResponseSchema = z.object({
  notifications: NotificationSummarySchema,
}).strict()

export const UpdateNotificationsRequestSchema = z.object({
  action: z.literal('markAllRead'),
}).strict()

export type NotificationItem = z.infer<typeof NotificationItemSchema>
export type NotificationSummary = z.infer<typeof NotificationSummarySchema>
export type NotificationsResponse = z.infer<typeof NotificationsResponseSchema>
