import { createHash } from 'crypto'

import { hashPassword, verifyPassword } from '@/localapi/auth'

import { isCommonPassword } from './commonPasswords'
import { HISTORY_LIMIT, SHIPPED_MIN_LENGTH, type PasswordPolicy } from './passwordPolicyDefaults'

export { DEFAULT_PASSWORD_POLICY, HISTORY_LIMIT, MAX_POLICY_LENGTH, SHIPPED_MIN_LENGTH, type PasswordPolicy } from './passwordPolicyDefaults'

/**
 * The configurable password rules (Security settings > Passwords).
 *
 * Every default here reproduces what the site did before the rules existed,
 * so switching nothing on changes nothing. The length floor is 8 for
 * customers, a reset and a change, exactly as before. Admins had no minimum
 * at all, so the length rule only reaches them once the owner raises the
 * minimum above 8 (see `effectiveMinLength`).
 *
 * Nothing here is applied retroactively. An existing password is never checked
 * against the rules, and never invalidated. The rules bite only when a
 * password is set or changed.
 */

export type PasswordContext = {
  /** The account's email address; its name before the @ is refused when blockCommon is on. */
  email?: string | null
  /**
   * True for a write made on the admin screens (the Users editor). Those screens
   * had no password minimum before the policy existed, so for them the length
   * floor only applies once the owner raises it above the shipped 8.
   */
  adminScreen?: boolean
}

export type PasswordHistoryEntry = { salt: string; hash: string }

const BREACH_RANGE_URL = 'https://api.pwnedpasswords.com/range/'
const BREACH_TIMEOUT_MS = 2000

/**
 * The shortest password this write may use. Admin-screen writes keep today's
 * no-minimum behaviour unless the owner has raised the setting above 8. Every
 * other write (registration, reset, a customer's own change) is held to the
 * setting, which is 8 by default, as it always was.
 */
export const effectiveMinLength = (policy: PasswordPolicy, context: PasswordContext = {}): number => {
  if (context.adminScreen && policy.minLength <= SHIPPED_MIN_LENGTH) return 1
  return policy.minLength
}

export const lengthProblem = (min: number): string => `Choose a password of at least ${min} characters.`

/**
 * Every rule that can be checked without the network or the database. Returns
 * plain-language problems, empty when the password passes. The first problem
 * is the one a form shows; the list is there for tests and for the admin
 * screen.
 */
export const validatePassword = (
  password: string,
  context: PasswordContext,
  policy: PasswordPolicy,
): string[] => {
  const min = effectiveMinLength(policy, context)
  if (!password || password.length < min) return [lengthProblem(min)]

  const problems: string[] = []
  if (policy.requireMixedCase && !(/[a-z]/.test(password) && /[A-Z]/.test(password))) {
    problems.push('Include both upper-case and lower-case letters.')
  }
  if (policy.requireNumber && !/[0-9]/.test(password)) {
    problems.push('Include at least one number.')
  }
  if (policy.requireSymbol && !/[^A-Za-z0-9]/.test(password)) {
    problems.push('Include at least one symbol, such as ! or #.')
  }
  if (policy.blockCommon) {
    if (isCommonPassword(password)) {
      problems.push('That password is too common. Choose something less easy to guess.')
    }
    const name = emailName(context.email)
    if (name && password.toLowerCase().includes(name)) {
      problems.push('Do not use the name part of your email address in the password.')
    }
  }
  return problems
}

/** The part of an address before the @, lower case. Short names are ignored: "al" would match half of all passwords. */
export const emailName = (email: string | null | undefined): string | null => {
  if (!email) return null
  const name = email.split('@')[0]?.trim().toLowerCase() ?? ''
  return name.length >= 3 ? name : null
}

/**
 * Asks the Pwned Passwords range API whether this password has appeared in a
 * known breach. Only the first five hex characters of the SHA-1 leave the
 * server; the match against the remaining suffix happens here. Fails OPEN: a
 * network error, a timeout or an unexpected reply returns false, so a flaky
 * third party can never stop anyone choosing a password.
 */
export const checkBreached = async (
  password: string,
  options: { fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<boolean> => {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch
  const timeoutMs = options.timeoutMs ?? BREACH_TIMEOUT_MS
  try {
    const digest = createHash('sha1').update(password, 'utf8').digest('hex').toUpperCase()
    const prefix = digest.slice(0, 5)
    const suffix = digest.slice(5)

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetchImpl(`${BREACH_RANGE_URL}${prefix}`, {
        method: 'GET',
        headers: { 'Add-Padding': 'true', 'User-Agent': 'gracengatsby-password-policy' },
        signal: controller.signal,
      })
      if (!response.ok) return false
      const body = await response.text()
      for (const line of body.split(/\r?\n/)) {
        const [candidate, count] = line.trim().split(':')
        if (candidate?.toUpperCase() === suffix) return Number(count) > 0
      }
      return false
    } finally {
      clearTimeout(timer)
    }
  } catch {
    return false
  }
}

/** Reads the stored history column, tolerating anything. A damaged value is an empty history, never an error. */
export const parseHistory = (raw: unknown): PasswordHistoryEntry[] => {
  if (typeof raw !== 'string' || raw.trim() === '') return []
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((e): e is PasswordHistoryEntry => !!e && typeof e === 'object' && typeof (e as PasswordHistoryEntry).salt === 'string' && typeof (e as PasswordHistoryEntry).hash === 'string')
      .slice(0, HISTORY_LIMIT)
  } catch {
    return []
  }
}

export const serializeHistory = (entries: PasswordHistoryEntry[]): string => JSON.stringify(entries.slice(0, HISTORY_LIMIT))

/** The stored history with a newly set password at the front, capped at HISTORY_LIMIT. */
export const pushHistory = (entries: PasswordHistoryEntry[], password: string): PasswordHistoryEntry[] => {
  const { salt, hash } = hashPassword(password)
  return [{ salt, hash }, ...entries].slice(0, HISTORY_LIMIT)
}

/**
 * True when the candidate matches one of the last `count` passwords. Uses the
 * same salted hash scheme the engine uses, so a stored entry is checked the
 * same way a sign-in is.
 */
export const reusesRecentPassword = (
  password: string,
  entries: PasswordHistoryEntry[],
  count: number,
): boolean => {
  if (count <= 0) return false
  return entries.slice(0, count).some((entry) => verifyPassword(password, entry.salt, entry.hash))
}

/**
 * Forced password change after the maximum age. `since` is the last time the
 * password was set, or the account's creation date for an account that has
 * never changed it. Off (0 days) never fires.
 */
export const passwordChangeDue = (since: string | null | undefined, maxAgeDays: number, now: Date = new Date()): boolean => {
  if (maxAgeDays <= 0 || !since) return false
  const started = Date.parse(since)
  if (!Number.isFinite(started)) return false
  return now.getTime() - started > maxAgeDays * 24 * 60 * 60 * 1000
}

/**
 * Everything that needs the network or stored history, on top of
 * validatePassword. Returns the same plain-language problem list.
 */
export const passwordProblems = async (
  password: string,
  context: PasswordContext,
  policy: PasswordPolicy,
  history: PasswordHistoryEntry[] = [],
  options: { fetchImpl?: typeof fetch } = {},
): Promise<string[]> => {
  const problems = validatePassword(password, context, policy)
  if (problems.length > 0) return problems
  if (policy.historyCount > 0 && reusesRecentPassword(password, history, policy.historyCount)) {
    return [`You cannot reuse one of your last ${policy.historyCount} passwords.`]
  }
  if (policy.breachCheck && (await checkBreached(password, { fetchImpl: options.fetchImpl }))) {
    return ['That password has appeared in a known data breach. Choose a different one.']
  }
  return []
}

/**
 * The line under a password field. Built from the active rules only, so the
 * default site reads exactly as it did before: "At least 8 characters."
 */
export const passwordHint = (policy: PasswordPolicy): string => {
  const parts: string[] = [`At least ${policy.minLength} characters.`]
  const classes: string[] = []
  if (policy.requireMixedCase) classes.push('upper and lower case letters')
  if (policy.requireNumber) classes.push('a number')
  if (policy.requireSymbol) classes.push('a symbol')
  if (classes.length > 0) parts.push(`Include ${joinWords(classes)}.`)
  if (policy.blockCommon) parts.push('Common passwords and your email name are not allowed.')
  if (policy.breachCheck) parts.push('Passwords from known data breaches are not allowed.')
  if (policy.historyCount > 0) parts.push(`You cannot reuse your last ${policy.historyCount} passwords.`)
  return parts.join(' ')
}

const joinWords = (words: string[]): string => {
  if (words.length <= 1) return words.join('')
  return `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`
}
