import { useEffect, useState } from 'react'

/**
 * The start times already full on one day, for an appointment field.
 *
 * Asks /api/form-slots once per (api base, form, field, day) and forgets the
 * answer when the day changes. An empty list is the answer until the request
 * lands, and also when it fails: the server rule still refuses a full slot, so
 * a failed hint costs nothing but the grey-out.
 */

export const SLOT_ENDPOINT_PATH = '/api/form-slots'

export function useTakenSlots(apiBase: string | undefined, formKey: string | undefined, fieldName: string | undefined, date: string): string[] {
  const base = (apiBase || '').replace(/\/$/, '')
  const requestKey = formKey && fieldName && date ? `${base}|${formKey}|${fieldName}|${date}` : ''
  const [answer, setAnswer] = useState<{ key: string; taken: string[] }>({ key: '', taken: [] })

  useEffect(() => {
    if (!requestKey || !formKey || !fieldName) return
    const controller = new AbortController()
    const query = `form=${encodeURIComponent(formKey)}&field=${encodeURIComponent(fieldName)}&date=${encodeURIComponent(date)}`
    fetch(`${base}${SLOT_ENDPOINT_PATH}?${query}`, { cache: 'no-store', signal: controller.signal, headers: { Accept: 'application/json' } })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: unknown) => {
        const taken = body && typeof body === 'object' ? (body as { taken?: unknown }).taken : undefined
        if (Array.isArray(taken)) setAnswer({ key: requestKey, taken: taken.filter((time): time is string => typeof time === 'string') })
      })
      .catch((): void => undefined)
    return () => controller.abort()
  }, [base, requestKey, formKey, fieldName, date])

  return answer.key === requestKey ? answer.taken : []
}
