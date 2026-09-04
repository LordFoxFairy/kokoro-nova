import { AuthenticatedShell } from '@/components/shell/AuthenticatedShell'
import { AccountPage } from '@/components/account/AccountPage'

export const dynamic = 'force-dynamic'

export default function Page() {
  return (
    <AuthenticatedShell>
      <AccountPage />
    </AuthenticatedShell>
  )
}
