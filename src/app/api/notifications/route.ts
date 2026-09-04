import { NotificationsResponseSchema, UpdateNotificationsRequestSchema } from '@/contracts/notifications'
import { handle, parseJsonBody } from '@/server/http'
import { markAllLocalNotificationsRead, readNotificationSummary } from '@/server/identity'

export const dynamic = 'force-dynamic'

export async function GET() {
  return handle(async () => NotificationsResponseSchema.parse({ notifications: await readNotificationSummary() }))
}

export async function POST(request: Request) {
  return handle(async () => {
    await parseJsonBody(request, UpdateNotificationsRequestSchema)
    return NotificationsResponseSchema.parse({ notifications: await markAllLocalNotificationsRead() })
  })
}
