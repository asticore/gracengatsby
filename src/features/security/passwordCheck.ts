import type { Engine } from '@/engine'

import { getSecuritySettings } from './settings'
import { passwordChangeDue, passwordHint, passwordProblems, type PasswordContext, type PasswordHintSay } from './passwordPolicy'
import { DEFAULT_PASSWORD_POLICY, type PasswordPolicy } from './passwordPolicyDefaults'
import { readPasswordStateById } from './passwordStore'

/**
 * The one place a password is checked against the owner's rules, for the
 * account-side and admin-side paths. Returns the first plain-language problem,
 * or null when the password may be used.
 *
 * `who` names the account when there is one (a change or an admin edit), so the
 * no-reuse and email-name rules can read its history and address. For a brand
 * new account (registration) there is no history yet, only the address typed in.
 */
export const passwordProblemFor = async (
  engine: Engine,
  password: string,
  who: { id?: number | string | null; email?: string | null },
  options: Pick<PasswordContext, 'adminScreen'> & { fetchImpl?: typeof fetch } = {},
): Promise<string | null> => {
  const settings = await getSecuritySettings(engine)
  const id = who.id === undefined || who.id === null ? null : Number(who.id)
  const state = id !== null && Number.isInteger(id) ? await readPasswordStateById(id).catch((): null => null) : null
  const problems = await passwordProblems(
    password,
    { email: who.email ?? state?.email ?? null, adminScreen: options.adminScreen === true },
    settings.passwordPolicy,
    state?.history ?? [],
    { fetchImpl: options.fetchImpl },
  )
  return problems[0] ?? null
}

/** True when the account must choose a new password before carrying on (maximum age, opted in). Never a lockout. */
export const passwordChangeIsDue = async (engine: Engine, userId: number | string): Promise<boolean> => {
  const settings = await getSecuritySettings(engine)
  if (settings.passwordPolicy.maxAgeDays <= 0) return false
  const id = Number(userId)
  if (!Number.isInteger(id)) return false
  const state = await readPasswordStateById(id).catch((): null => null)
  if (!state) return false
  return passwordChangeDue(state.passwordChangedAt ?? state.createdAt, settings.passwordPolicy.maxAgeDays)
}

/** What a password form needs from the server: the length floor and the line that describes the active rules. */
export const passwordRulesOf = (policy: PasswordPolicy, say?: PasswordHintSay): { minLength: number; hint: string } => ({
  minLength: policy.minLength,
  hint: passwordHint(policy, say),
})

/** The form rules for the account screens, read from the Security settings. */
export const passwordFormRules = async (engine: Engine, say?: PasswordHintSay): Promise<{ minLength: number; hint: string }> => {
  const settings = await getSecuritySettings(engine).catch((): null => null)
  return passwordRulesOf(settings?.passwordPolicy ?? DEFAULT_PASSWORD_POLICY, say)
}
