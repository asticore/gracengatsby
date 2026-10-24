import { PROVIDERS, isUsable, type ProviderId } from './providers'
import { readSocialConfig } from './settings'
import { defaultSocialStore } from './store'
import { userHasPassword } from './runtime'
import { isCustomerOnly } from './service'
import type { Engine } from '@/engine'

export type ConnectionView = {
  linked: Array<{ provider: ProviderId; label: string; email: string | null; createdAt: string; lastLoginAt: string | null }>
  available: Array<{ id: ProviderId; label: string }>
  hasPassword: boolean
}

/** What the Connected accounts panel shows for one signed-in user. */
export async function viewConnections(engine: Engine, user: { id: number | string; roles?: unknown }): Promise<ConnectionView> {
  const id = Number(user.id)
  const config = await readSocialConfig(engine)
  const staff = !isCustomerOnly(user.roles)
  const rows = await defaultSocialStore.listForUser(id).catch((): never[] => [])
  const linked = rows.map((r) => ({
    provider: r.provider,
    label: PROVIDERS[r.provider]?.label ?? r.provider,
    email: r.email,
    createdAt: r.createdAt,
    lastLoginAt: r.lastLoginAt,
  }))
  const taken = new Set(rows.map((r) => r.provider))
  const canLink = !staff || config.allowAdminSocialLogin
  const available = canLink
    ? (Object.keys(PROVIDERS) as ProviderId[])
        .filter((p) => isUsable(p, config.providers[p]) && !taken.has(p))
        .map((p) => ({ id: p, label: PROVIDERS[p].label }))
    : []
  return { linked, available, hasPassword: linked.length > 0 ? await userHasPassword(id) : true }
}
