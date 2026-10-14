/**
 * Pure checks on a sending domain's DNS records: SPF, DMARC and a DKIM note.
 *
 * The records themselves are fetched in dnsLookup.ts. Everything here takes the
 * text the DNS server returned and says what it means, so it can be tested
 * without the network.
 *
 * DKIM cannot be checked directly: the record's name (the selector) is chosen by
 * the provider, and this site does not know it. So the report gives the
 * provider's own instructions instead of a pass or fail.
 */

export type CheckLevel = 'good' | 'needs-work' | 'missing' | 'info'

export type CheckLine = { label: string; level: CheckLevel; message: string }

export type SpfCheck = CheckLine & { record: string | null }

export type DmarcCheck = CheckLine & { policy: string | null }

export type DomainReport = {
  domain: string
  spf: SpfCheck
  dmarc: DmarcCheck
  dkim: CheckLine
  /** Overall level: the worst of SPF and DMARC. DKIM is advice only. */
  overall: CheckLevel
}

/**
 * The text an SPF record must mention so mail from this provider passes. A hint,
 * not a guarantee: providers change their hosts, so the message says to check
 * the provider's own instructions too.
 */
export const SPF_INCLUDE_HINT: Record<string, string> = {
  resend: 'amazonses.com',
  'ses-api': 'amazonses.com',
  mailgun: 'mailgun.org',
  postmark: 'spf.mtasv.net',
  sendgrid: 'sendgrid.net',
  cloudflare: 'cloudflare.net',
  brevo: 'sendinblue.com',
  mandrill: 'spf.mandrillapp.com',
}

export const DKIM_INSTRUCTIONS: Record<string, string> = {
  resend: 'In the Resend dashboard, open Domains and copy the DKIM and SPF records it shows into your DNS.',
  'ses-api': 'In the Amazon SES console, open Verified identities for the domain and add the three DKIM CNAME records to your DNS.',
  mailgun: 'In the Mailgun dashboard, open Sending, Domains, then the domain, and add the DKIM TXT record it shows.',
  postmark: 'In the Postmark dashboard, open Sender Signatures and add the DKIM TXT record for the domain.',
  sendgrid: 'In SendGrid, open Sender Authentication and add the DNS records it shows for the domain.',
  cloudflare: 'In Cloudflare, open Email Sending and add the DNS records it shows for the domain.',
  brevo: 'In Brevo, open Senders, Domains and add the DNS records it shows for the domain.',
  mandrill: 'In Mailchimp, open Transactional Email, Settings, Domains, and add the DNS records it shows for the domain.',
}

const DOMAIN_PATTERN = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i

/** The domain part of an address, lower-cased, or null when it is not a usable domain. */
export const senderDomain = (address: string | null | undefined): string | null => {
  const at = (address ?? '').trim().lastIndexOf('@')
  if (at < 0) return null
  const domain = (address ?? '').trim().slice(at + 1).toLowerCase()
  return DOMAIN_PATTERN.test(domain) ? domain : null
}

/**
 * Turns the text of one TXT answer into the record it holds. A long record is
 * split into quoted pieces that join with nothing between them, so
 * '"v=spf1 " "include:x ~all"' becomes 'v=spf1 include:x ~all'.
 */
export const parseTxtData = (data: string): string => {
  const pieces = [...data.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((match) => match[1].replace(/\\(.)/g, '$1'))
  return pieces.length > 0 ? pieces.join('') : data.trim()
}

const recordsStarting = (records: string[], prefix: string): string[] =>
  records.map(parseTxtData).filter((record) => record.trim().toLowerCase().startsWith(prefix))

/** Checks the SPF record at the domain itself. */
export const parseSpf = (records: string[], provider: string | null): SpfCheck => {
  const found = recordsStarting(records, 'v=spf1')
  const label = 'SPF'
  if (found.length === 0) {
    return {
      label,
      level: 'missing',
      record: null,
      message: 'No SPF record. Add a TXT record at the domain that starts with v=spf1 and lists your sending provider.',
    }
  }
  if (found.length > 1) {
    return {
      label,
      level: 'needs-work',
      record: found[0],
      message: 'More than one SPF record. Receivers reject a domain with two, so merge them into one record.',
    }
  }
  const record = found[0]
  const hint = provider ? SPF_INCLUDE_HINT[provider] : undefined
  if (hint && !record.toLowerCase().includes(hint)) {
    return {
      label,
      level: 'needs-work',
      record,
      message: `The SPF record does not mention ${hint}, which is where ${provider} sends mail from. Add it, or check the provider's own instructions.`,
    }
  }
  return { label, level: 'good', record, message: 'An SPF record is present and lists your sending provider.' }
}

/** Checks the DMARC record at _dmarc.<domain>. The policy says what receivers should do with mail that fails. */
export const parseDmarc = (records: string[]): DmarcCheck => {
  const found = recordsStarting(records, 'v=dmarc1')
  const label = 'DMARC'
  if (found.length === 0) {
    return {
      label,
      level: 'missing',
      policy: null,
      message: 'No DMARC record. Add a TXT record at _dmarc.<your domain> starting with v=DMARC1; p=none; to start.',
    }
  }
  const match = /(?:^|;)\s*p\s*=\s*(none|quarantine|reject)\b/i.exec(found[0])
  const policy = match ? match[1].toLowerCase() : null
  if (!policy) {
    return { label, level: 'needs-work', policy: null, message: 'The DMARC record has no valid p= policy (none, quarantine or reject).' }
  }
  if (policy === 'none') {
    return {
      label,
      level: 'info',
      policy,
      message: 'DMARC is present with p=none, which only monitors. Move to quarantine or reject once mail passes.',
    }
  }
  return { label, level: 'good', policy, message: `DMARC is present with p=${policy}.` }
}

/** The DKIM line. Advice only: the selector is the provider's, so this cannot be looked up. */
export const dkimNote = (provider: string | null): CheckLine => ({
  label: 'DKIM',
  level: 'info',
  message: provider && DKIM_INSTRUCTIONS[provider]
    ? DKIM_INSTRUCTIONS[provider]
    : 'DKIM records are set by your email provider. Check its dashboard for the records to add.',
})

const WORST: Record<CheckLevel, number> = { good: 0, info: 0, 'needs-work': 1, missing: 2 }

/** Combines the SPF and DMARC results into one overall level. */
export const overallLevel = (levels: CheckLevel[]): CheckLevel =>
  levels.reduce<CheckLevel>((worst, level) => (WORST[level] > WORST[worst] ? level : worst), 'good')

/** The full report for one domain, from the TXT records found at the domain and at _dmarc. */
export const summariseDomain = (
  domain: string,
  domainRecords: string[],
  dmarcRecords: string[],
  provider: string | null,
): DomainReport => {
  const spf = parseSpf(domainRecords, provider)
  const dmarc = parseDmarc(dmarcRecords)
  return {
    domain,
    spf,
    dmarc,
    dkim: dkimNote(provider),
    overall: overallLevel([spf.level, dmarc.level]),
  }
}
