import { resolveTwilio } from '@/features/sms/twilio'

import { loadEmailSettings, loadSmsSettings } from './connectionLoad'
import { summariseProviderState, type ProviderStateSummary } from './providerState'

/**
 * What the Email testing screen needs to know about connections, read from the
 * same places the send path reads them (Integrations, then the legacy Email
 * settings fields). Server only: it asks the engine.
 *
 * Built on Task B's loaders so the screen and the sender can never disagree
 * about whether a provider is connected.
 */

type FindGlobal = (args: { slug: string; depth: number; overrideAccess: boolean }) => Promise<unknown>

export type EmailTestingSettings = {
  summary: ProviderStateSummary
  smsConnected: boolean
  smsLabel: string | null
  fromEmail: string | null
  testRecipient: string | null
}

const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value.trim() : null)

export async function readEmailTestingSettings(engine: { findGlobal: FindGlobal }): Promise<EmailTestingSettings> {
  const settings = await loadEmailSettings(engine)
  const sms = await loadSmsSettings(engine)
  const smsConnected = resolveTwilio(sms).config !== null

  return {
    summary: summariseProviderState(settings),
    smsConnected,
    smsLabel: smsConnected ? 'Twilio' : null,
    fromEmail: text(settings.fromEmail),
    testRecipient: text(settings.testing?.testRecipient),
  }
}

/** One plain sentence for the top of the connection card. */
export function connectionHeadline(summary: ProviderStateSummary): string {
  if (summary.emailConnected && summary.defaultLabel) return `Email is connected. Sending through ${summary.defaultLabel}.`
  if (summary.defaultLabel) return `${summary.defaultLabel} is chosen as the default, but it is not fully connected yet.`
  return 'No email provider is connected yet. Connect one on the Integrations page.'
}
