/**
 * Which language to write to a recipient in.
 *
 * Order of preference: the customer's own portal language (profile preference,
 * then the cookie and browser, as the portal resolves it), else null, which
 * means English. The Email feature reaches for the engine, so the account
 * modules are imported at call time.
 */

/** The portal language of the visitor making the current request, or null when languages are off or there is no request. */
export async function requestLocale(): Promise<string | null> {
  try {
    const { currentPortalLocale } = await import('@/features/multilingual/portalLocaleServer')
    return await currentPortalLocale()
  } catch {
    return null
  }
}

type FindEngine = {
  find: (args: never) => Promise<{ docs: unknown[] }>
}

/** The language a customer chose in their account, looked up by the address an email is going to. Null when there is no account or no choice. */
export async function localeForRecipient(engine: FindEngine, email: string): Promise<string | null> {
  try {
    const { USERS_SLUG } = await import('@/features/accounts/types')
    const { readPreferences } = await import('@/features/accounts/preferences')
    const { docs } = await engine.find({
      collection: USERS_SLUG,
      where: { email: { equals: email } },
      limit: 1,
      pagination: false,
      depth: 0,
      overrideAccess: true,
    } as never)
    const user = docs[0] as { id?: unknown } | undefined
    if (!user || user.id === undefined || user.id === null) return null
    const prefs = await readPreferences(engine as never, { ...user, collection: USERS_SLUG } as never)
    return prefs.locale
  } catch {
    return null
  }
}
