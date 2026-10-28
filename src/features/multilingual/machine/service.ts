/**
 * Runs a machine translation for one language, or tests a provider's connection.
 *
 * The order of checks is the order of cost: settings first, then the key, then the
 * monthly character limit, then the AI spend cap, then the network. Each refusal is
 * a stable `code` so the bulk route and the auto-draft path can report it the same
 * way. Usage is recorded only for calls that the provider answered.
 */

import { readUsageSummary, recordUsage, type UsageD1 } from '@/features/ai/builderUsage'
import { getMultilingualSettings, type MultilingualSettings } from '../settings'
import { checkCharBudget, keysFromIntegrations, keysPresent, providerFor, type KeysPresent } from './config'
import { charsUsedThisMonth, recordCharUsage } from './usage'
import {
  aiProviderOf,
  MachineError,
  MACHINE_PROVIDER_LABELS,
  translateWithProvider,
  type MachineDeps,
  type MachineErrorCode,
  type MachineProviderId,
} from './providers'
import { AI_MODELS } from '@/features/ai/models'

type EngineLike = {
  findGlobal: (args: { slug: string; depth?: number; overrideAccess?: boolean }) => Promise<Record<string, unknown>>
}

export type MachineOutcome =
  | { ok: true; provider: MachineProviderId; translations: string[]; chars: number }
  | { ok: false; code: MachineErrorCode | 'disabled' | 'no_provider' | 'limit' | 'ai_cap'; message: string; provider: MachineProviderId | null }

export type MachineContext = {
  engine: EngineLike
  d1?: UsageD1
  now?: Date
  deps?: MachineDeps
}

/** Reads the machine translation keys from Integrations. Server code only: the result holds the keys. */
export async function readMachineKeys(engine: EngineLike): Promise<ReturnType<typeof keysFromIntegrations>> {
  const doc = await engine
    .findGlobal({ slug: 'integrations', depth: 0, overrideAccess: true })
    .catch((): null => null)
  return keysFromIntegrations(doc)
}

/** Which providers have a key set. Safe to send to the browser. */
export async function machineKeysPresent(engine: EngineLike): Promise<KeysPresent> {
  return keysPresent(await readMachineKeys(engine))
}

const fail = (
  code: Extract<MachineOutcome, { ok: false }>['code'],
  message: string,
  provider: MachineProviderId | null,
): MachineOutcome => ({ ok: false, code, message, provider })

/**
 * Translates the given source strings into one language. Returns the translations in
 * the same order, or a refusal with a code and a message that is safe to show.
 */
export async function translateTexts(
  args: MachineContext & {
    locale: string
    texts: string[]
    /** The language the texts are written in (the default locale). */
    source: string
    /** Force a provider, ignoring the per-language setting. Used by the test action. */
    provider?: MachineProviderId | null
    settings?: MultilingualSettings
  },
): Promise<MachineOutcome> {
  const settings = args.settings ?? (await getMultilingualSettings(args.engine))
  const machine = settings.machine
  if (!settings.enabled || !machine.enabled) return fail('disabled', 'Machine translation is switched off.', null)

  const provider = args.provider ?? providerFor(machine, args.locale)
  if (!provider) return fail('no_provider', `No machine translation provider is chosen for ${args.locale}.`, null)

  const keys = await readMachineKeys(args.engine)
  const apiKey = keys[provider]
  if (!apiKey) {
    return fail('no_key', `No ${MACHINE_PROVIDER_LABELS[provider]} API key is set in Integrations.`, provider)
  }

  const chars = args.texts.reduce((n, text) => n + text.length, 0)
  const used = await charsUsedThisMonth({ d1: args.d1, now: args.now })
  const budget = checkCharBudget({ used, requested: chars, limit: machine.monthlyCharLimit })
  if (!budget.ok) {
    return fail('limit', `This would go over the monthly limit of ${machine.monthlyCharLimit} characters.`, provider)
  }

  const ai = aiProviderOf(provider)
  if (ai) {
    const capUsd = await readAiCap(args.engine)
    const spend = await readUsageSummary(capUsd, { d1: args.d1, now: args.now })
    if (spend.capReached) {
      return fail('ai_cap', 'The monthly AI spend cap in Integrations has been reached.', provider)
    }
  }

  try {
    const translations = await translateWithProvider(
      provider,
      { texts: args.texts, source: args.source, target: args.locale },
      { apiKey, deeplPlan: keys.deeplPlan },
      args.deps,
    )
    await recordCharUsage({ provider, locale: args.locale, chars, ok: true }, { d1: args.d1, now: args.now })
    if (ai) {
      // Shared with Build with AI, so one cap covers both. Tokens are estimated from characters.
      await recordUsage(
        {
          userId: null,
          provider: ai,
          model: AI_MODELS[ai],
          mode: 'translate',
          inputTokens: Math.ceil(chars / 4),
          outputTokens: Math.ceil(translations.reduce((n, t) => n + t.length, 0) / 4),
          ok: true,
          estimated: true,
        },
        { d1: args.d1, now: args.now },
      )
    }
    return { ok: true, provider, translations, chars }
  } catch (error) {
    if (error instanceof MachineError) {
      await recordCharUsage({ provider, locale: args.locale, chars: 0, ok: false }, { d1: args.d1, now: args.now })
      return fail(error.code, error.message, provider)
    }
    throw error
  }
}

/**
 * Sends one short string to the provider. Used by the Test connection button. Not
 * counted against the character limit: it is a handful of characters, and counting
 * it would make checking a key cost part of the budget.
 */
export async function testMachineProvider(args: MachineContext & { provider: MachineProviderId }): Promise<MachineOutcome> {
  const keys = await readMachineKeys(args.engine)
  const apiKey = keys[args.provider]
  if (!apiKey) return fail('no_key', `No ${MACHINE_PROVIDER_LABELS[args.provider]} API key is set in Integrations.`, args.provider)
  try {
    const translations = await translateWithProvider(
      args.provider,
      { texts: ['Hello'], source: 'en', target: 'fr' },
      { apiKey, deeplPlan: keys.deeplPlan },
      args.deps,
    )
    return { ok: true, provider: args.provider, translations, chars: 5 }
  } catch (error) {
    if (error instanceof MachineError) return fail(error.code, error.message, args.provider)
    throw error
  }
}

async function readAiCap(engine: EngineLike): Promise<number> {
  const doc = await engine.findGlobal({ slug: 'integrations', depth: 0, overrideAccess: true }).catch((): null => null)
  const cap = Number((doc as Record<string, unknown> | null)?.aiMonthlyCapUsd)
  return Number.isFinite(cap) && cap > 0 ? cap : 0
}
