/**
 * What the scope picker turns its choices into. Pure, so it is tested without a browser.
 * The server validates the result again (`validateScopes`); this only builds the list.
 */

export type ScopeMode = 'read-all' | 'all' | 'custom'

export type PickedScopes = Record<string, { read: boolean; write: boolean }>

export function buildScopes(mode: ScopeMode, picked: PickedScopes): string[] {
  if (mode === 'all') return ['*']
  if (mode === 'read-all') return ['*:read']
  const scopes: string[] = []
  for (const slug of Object.keys(picked).sort()) {
    if (picked[slug]?.read) scopes.push(`${slug}:read`)
    if (picked[slug]?.write) scopes.push(`${slug}:write`)
  }
  return scopes
}
