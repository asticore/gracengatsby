import type { SmsSettingsDoc } from '../email/types'

/**
 * The pure half of text messaging (wave 16). Twilio is the only provider. This
 * file reads the saved settings, checks a number, and builds and reads the
 * request to Twilio's Messages API. No network call here, so it can be tested
 * on its own. The send itself lives in index.ts.
 */

export type TwilioConfig = {
  accountSid: string
  authToken: string
  fromNumber?: string
  messagingServiceSid?: string
}

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

/** International format: a plus sign, then 7 to 15 digits, first digit not zero. */
export const PHONE_PATTERN = /^\+[1-9]\d{6,14}$/

export function isValidPhone(value: string): boolean {
  return PHONE_PATTERN.test(value)
}

/**
 * The Twilio config, or the list of what is still blank. A sender is needed
 * too: a From number or a messaging service. Either one is enough.
 */
export function resolveTwilio(sms: SmsSettingsDoc | null | undefined): { config: TwilioConfig | null; missing: string[] } {
  const twilio = sms?.twilio ?? {}
  const accountSid = text(twilio.accountSid)
  const authToken = text(twilio.authToken)
  const fromNumber = text(twilio.fromNumber)
  const messagingServiceSid = text(twilio.messagingServiceSid)

  const missing = [
    ...(accountSid ? [] : ['account SID']),
    ...(authToken ? [] : ['auth token']),
    ...(fromNumber || messagingServiceSid ? [] : ['a From number or messaging service SID']),
  ].map((item) => `Twilio ${item}`)

  if (missing.length > 0) return { config: null, missing }
  return {
    config: {
      accountSid,
      authToken,
      ...(fromNumber ? { fromNumber } : {}),
      ...(messagingServiceSid ? { messagingServiceSid } : {}),
    },
    missing: [],
  }
}

/** The request for one text message. The sender is the messaging service when set, else the From number. */
export function buildTwilioRequest(config: TwilioConfig, to: string, body: string): {
  url: string
  headers: Record<string, string>
  form: string
} {
  const params = new URLSearchParams()
  params.set('To', to)
  params.set('Body', body)
  if (config.messagingServiceSid) params.set('MessagingServiceSid', config.messagingServiceSid)
  else if (config.fromNumber) params.set('From', config.fromNumber)

  return {
    url: `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(config.accountSid)}/Messages.json`,
    headers: {
      Authorization: `Basic ${btoa(`${config.accountSid}:${config.authToken}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    form: params.toString(),
  }
}

/** Twilio answers 201 with the message `sid` on success, and an error body with `message` otherwise. */
export function parseTwilioResponse(status: number, body: unknown): { ok: boolean; id?: string; error?: string } {
  const data = (body ?? {}) as { sid?: unknown; message?: unknown; code?: unknown }
  if (status >= 200 && status < 300 && typeof data.sid === 'string') {
    return { ok: true, id: data.sid }
  }
  const message = typeof data.message === 'string' && data.message ? data.message : `Twilio returned ${status}`
  const code = typeof data.code === 'number' ? ` (error ${data.code})` : ''
  return { ok: false, error: `${message}${code}` }
}
