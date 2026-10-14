import { getEngine } from '@/lib/engine'
import { loadSmsSettings } from '../email/connectionLoad'

import { buildTwilioRequest, isValidPhone, parseTwilioResponse, resolveTwilio } from './twilio'

/**
 * Sends text messages (wave 16). Twilio only. `sendSms` never throws: a text
 * that cannot go out comes back as a structured result, the same as email, so
 * whatever asked for the text is not broken by it.
 *
 * A send is refused up front when no connection is saved, which is the normal
 * state on a fresh install and says so plainly.
 */

export type SmsResult = {
  ok: boolean
  id?: string
  reason?: 'not-configured' | 'invalid-number' | 'invalid-message' | 'provider-rejected'
  error?: string
}

const MAX_BODY = 1600

export async function sendSms(to: string, body: string): Promise<SmsResult> {
  try {
    const trimmedBody = typeof body === 'string' ? body.trim() : ''
    if (!trimmedBody) return { ok: false, reason: 'invalid-message', error: 'The text has no message.' }
    if (trimmedBody.length > MAX_BODY) {
      return { ok: false, reason: 'invalid-message', error: `The text is longer than ${MAX_BODY} characters.` }
    }

    const number = typeof to === 'string' ? to.trim() : ''
    if (!isValidPhone(number)) {
      return {
        ok: false,
        reason: 'invalid-number',
        error: 'The phone number must be in international format, such as +61400000000.',
      }
    }

    const engine = await getEngine()
    const sms = await loadSmsSettings(engine as unknown as Parameters<typeof loadSmsSettings>[0])
    const { config, missing } = resolveTwilio(sms)
    if (!config) {
      return { ok: false, reason: 'not-configured', error: `Still missing: ${missing.join(', ')}.` }
    }

    const request = buildTwilioRequest(config, number, trimmedBody)
    const response = await fetch(request.url, { method: 'POST', headers: request.headers, body: request.form })
    const payload: unknown = await response.json().catch((): null => null)
    const parsed = parseTwilioResponse(response.status, payload)

    if (!parsed.ok) {
      return { ok: false, reason: 'provider-rejected', error: parsed.error }
    }
    return { ok: true, id: parsed.id }
  } catch (error) {
    return {
      ok: false,
      reason: 'provider-rejected',
      error: `Could not reach Twilio: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

/** Sends the fixed test text to the saved test number. Never reads a number from the request. */
export async function sendTestText(): Promise<SmsResult & { to?: string }> {
  try {
    const engine = await getEngine()
    const sms = await loadSmsSettings(engine as unknown as Parameters<typeof loadSmsSettings>[0])
    const to = typeof sms?.testPhone === 'string' ? sms.testPhone.trim() : ''
    if (!to) {
      return { ok: false, reason: 'not-configured', error: 'Set a test phone number on the Integrations page, save, then try again.' }
    }
    const result = await sendSms(to, 'This is a test text confirming your text message settings work.')
    return { ...result, to }
  } catch (error) {
    return { ok: false, reason: 'provider-rejected', error: error instanceof Error ? error.message : String(error) }
  }
}
