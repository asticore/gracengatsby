import { summariseDomain, type DomainReport } from './dnsCheck'

/**
 * Fetches a domain's TXT records over DNS-over-HTTPS and builds the report.
 *
 * Uses Cloudflare's public resolver so it works from a Worker. Never throws: a
 * lookup that times out or returns something unexpected becomes a result with
 * `ok: false` and a plain reason, because this runs from a button on a screen
 * whose job is to explain what is wrong.
 */

export const DNS_TIMEOUT_MS = 4000
const DOH_URL = 'https://cloudflare-dns.com/dns-query'

export type TxtLookup = { ok: boolean; records: string[]; error?: string }

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

/** The TXT records for one name. An empty list is a real answer (no record), not a failure. */
export const lookupTxt = async (name: string, fetchImpl: FetchLike = fetch): Promise<TxtLookup> => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), DNS_TIMEOUT_MS)
  try {
    const url = `${DOH_URL}?name=${encodeURIComponent(name)}&type=TXT`
    const response = await fetchImpl(url, { headers: { accept: 'application/dns-json' }, signal: controller.signal })
    if (!response.ok) return { ok: false, records: [], error: `The DNS lookup failed (${response.status}).` }

    const body = (await response.json()) as { Answer?: Array<{ type?: number; data?: unknown }> }
    const answers = Array.isArray(body?.Answer) ? body.Answer : []
    const records = answers
      .filter((answer) => answer?.type === 16 && typeof answer.data === 'string')
      .map((answer) => answer.data as string)
    return { ok: true, records }
  } catch (error) {
    const aborted = error instanceof Error && error.name === 'AbortError'
    return {
      ok: false,
      records: [],
      error: aborted ? 'The DNS lookup took too long. Try again in a moment.' : 'The DNS lookup could not be completed.',
    }
  } finally {
    clearTimeout(timer)
  }
}

/** Looks up SPF (at the domain) and DMARC (at _dmarc) and reports on both. Never throws. */
export const checkSenderDomain = async (
  domain: string,
  provider: string | null,
  fetchImpl: FetchLike = fetch,
): Promise<DomainReport & { lookupError?: string }> => {
  const [domainLookup, dmarcLookup] = await Promise.all([
    lookupTxt(domain, fetchImpl),
    lookupTxt(`_dmarc.${domain}`, fetchImpl),
  ])
  const report = summariseDomain(domain, domainLookup.records, dmarcLookup.records, provider)
  const lookupError = domainLookup.error ?? dmarcLookup.error
  if (!lookupError) return report

  // A failed lookup must not read as "no record": say the check did not finish.
  return {
    ...report,
    spf: domainLookup.ok ? report.spf : { label: 'SPF', level: 'info', record: null, message: domainLookup.error ?? 'SPF could not be checked.' },
    dmarc: dmarcLookup.ok ? report.dmarc : { label: 'DMARC', level: 'info', policy: null, message: dmarcLookup.error ?? 'DMARC could not be checked.' },
    overall: 'info',
    lookupError,
  }
}
