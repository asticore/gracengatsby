import { redirect } from 'next/navigation'

import { getAdminContext, hasAdminPanelAccess, isAdminUser } from '@/admin/auth'
import { listAllApiKeys, listMyApiKeys } from '@/features/apiKeys/actions'
import { ApiKeysPanel } from '@/features/apiKeys/components/ApiKeysPanel'
import { getSecuritySettings } from '@/features/security/settings'
import { getEngine } from '@/lib/engine'

/**
 * /admin/security/api-keys. Off unless the owner turns API keys on. Admins see every key
 * on the site and can revoke any of them (each revoke is audited); their own keys can be
 * created here too.
 */
export async function ApiKeysView() {
  const context = await getAdminContext()
  if (!hasAdminPanelAccess(context.user)) redirect('/admin/login')
  const engine = await getEngine()
  const settings = await getSecuritySettings(engine as never)
  const admin = isAdminUser(context.user)

  if (!settings.apiKeys.enabled) {
    return (
      <div style={{ maxWidth: 820, padding: '1.5rem' }}>
        <p>API keys are turned off on this site. The site owner can turn them on under Security settings.</p>
      </div>
    )
  }

  const result = admin ? await listAllApiKeys() : await listMyApiKeys()
  return (
    <div style={{ maxWidth: 960, padding: '1.5rem' }}>
      <p>
        An API key lets a script call the REST API as you, limited to its scopes. A key can never do more than your own account can. Keys
        are shown once at creation; only a hash is kept.
      </p>
      <ApiKeysPanel initial={result.ok && result.keys ? result.keys : []} showOwner={admin} />
    </div>
  )
}
