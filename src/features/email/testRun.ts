/**
 * Pure rules for the Testing screen's send actions: how often a batch may run,
 * which addresses a test may go to, and how many templates one batch sends.
 * No engine and no network, so the rules can be tested on their own.
 */

/** Most templates sent in one batch. */
export const BATCH_LIMIT = 10
/** Minimum time between two batches for the same admin. */
export const BATCH_INTERVAL_MS = 10_000

export type Refusal = { status: number; error: string }

/** Refuses a batch that starts too soon after the last one for the same admin. */
export const batchRefusal = (lastStartedAt: number | undefined, now: number): Refusal | null => {
  if (lastStartedAt === undefined || now - lastStartedAt >= BATCH_INTERVAL_MS) return null
  const wait = Math.ceil((BATCH_INTERVAL_MS - (now - lastStartedAt)) / 1000)
  return { status: 429, error: `Wait ${wait} seconds before sending another batch.` }
}

/** The template keys one batch sends: the known ones, in order, capped at BATCH_LIMIT. */
export const batchKeys = (known: readonly string[]): string[] => known.slice(0, BATCH_LIMIT)

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const same = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase()

/**
 * The address a test goes to. Tests may go only to the signed-in admin's own
 * address or to the stored test recipient, so the screen cannot be used to mail
 * an arbitrary person. Leaving the address blank picks the test recipient, then
 * the admin's own address.
 */
export const chooseRecipient = (
  requested: unknown,
  adminEmail: string | null,
  testRecipient: string | null,
): { to: string } | { error: string } => {
  const asked = typeof requested === 'string' ? requested.trim() : ''
  if (asked) {
    if (!EMAIL_PATTERN.test(asked)) return { error: 'That is not a valid email address.' }
    const allowed = [adminEmail, testRecipient].filter((address): address is string => Boolean(address))
    if (!allowed.some((address) => same(address, asked))) {
      return { error: 'Tests can only go to your own address or the test recipient in Sender and testing.' }
    }
    return { to: asked }
  }
  const fallback = testRecipient || adminEmail
  if (!fallback) return { error: 'No address to send to. Sign in with an email address or set a test recipient.' }
  return { to: fallback }
}

/** Whether a template key is one this screen knows how to send. */
export const isKnownKey = (key: unknown, known: readonly string[]): key is string =>
  typeof key === 'string' && known.includes(key)
