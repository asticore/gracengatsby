import type { DomainReport } from '@/features/email/dnsCheck'
import type { TemplateTestRow } from '@/features/email/testRunSend'

/** Calls for the Email testing screen. Every call reports its own failure instead of throwing. */

/** Flat on purpose: this project compiles with strictNullChecks off, where narrowing a union on `ok` does not work. */
export type RunResult<T> = { ok: boolean; data?: T; error?: string }

export type SendOneResponse = { row: TemplateTestRow; to: string }
export type SendAllResponse = { rows: TemplateTestRow[]; to: string }
export type DnsResponse = { report: DomainReport & { lookupError?: string } }

const ENDPOINT = '/api/admin-email-test-run'

export async function postEmailTest<T>(body: Record<string, unknown>): Promise<RunResult<T>> {
  try {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = (await response.json().catch(() => ({}))) as T & { error?: string }
    if (!response.ok) {
      return { ok: false, error: data.error || 'The test could not be run. Are you still signed in as an admin?' }
    }
    return { ok: true, data }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'The test could not be run.' }
  }
}

/** The text-message test. Uses the route built for the Communications connections; the body is empty and the route reads its own saved test number. */
export async function postTestText(): Promise<RunResult<{ ok?: boolean; error?: string; message?: string }>> {
  // The text-message test reads its own saved test number, so the body is empty.
  try {
    const response = await fetch('/api/internal-sms-test', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    })
    const data = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string; message?: string }
    if (!response.ok) return { ok: false, error: data.error || 'The text message could not be sent.' }
    return { ok: true, data }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'The text message could not be sent.' }
  }
}
