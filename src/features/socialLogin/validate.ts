import { PROVIDER_IDS, PROVIDERS, emptyProviderConfig, missingCredentials, type ProviderConfig, type ProviderId } from './providers'
import { capitalise } from './util'

/**
 * Server-side guard for the settings form: a provider cannot be switched on
 * while credentials are missing. The admin screen shows the same message, but
 * this is the check that counts - an API call to the global cannot skip it.
 */

type Bag = Record<string, unknown> | null | undefined

const str = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

/** Reads a group value whether it is nested (`socialLogin.googleEnabled`) or flat (`socialLoginGoogleEnabled`). */
const pick = (doc: Bag, key: string): unknown => {
  if (!doc) return undefined
  const group = doc.socialLogin as Bag
  if (group && key in group) return group[key]
  const flat = `socialLogin${capitalise(key)}`
  return flat in doc ? doc[flat] : undefined
}

/** The provider's settings after applying `data` over `existing`. */
export const mergedProvider = (id: ProviderId, data: Bag, existing: Bag): ProviderConfig => {
  const read = (key: string): unknown => {
    const incoming = pick(data, `${id}${key}`)
    return incoming !== undefined ? incoming : pick(existing, `${id}${key}`)
  }
  const cfg = emptyProviderConfig()
  cfg.enabled = read('Enabled') === true
  cfg.clientId = str(read('ClientId'))
  cfg.clientSecret = str(read('ClientSecret'))
  cfg.teamId = str(read('TeamId'))
  cfg.keyId = str(read('KeyId'))
  cfg.privateKey = str(read('PrivateKey'))
  return cfg
}

/** A message naming what is missing, or null when every enabled provider is complete. */
export const socialSwitchProblem = (data: Bag, existing: Bag): string | null => {
  for (const id of PROVIDER_IDS) {
    const cfg = mergedProvider(id, data, existing)
    if (!cfg.enabled) continue
    const missing = missingCredentials(id, cfg)
    if (missing.length > 0) {
      return `${PROVIDERS[id].label} sign-in cannot be switched on yet. Save the ${missing.join(', ')} first.`
    }
  }
  return null
}

/** Global `beforeChange` hook. Throws so the save is refused with the message. */
export const refuseSocialSwitchWithoutCredentials = (args: { data?: Bag; originalDoc?: Bag }): Bag => {
  const problem = socialSwitchProblem(args.data, args.originalDoc)
  if (problem) throw new Error(problem)
  return args.data
}
