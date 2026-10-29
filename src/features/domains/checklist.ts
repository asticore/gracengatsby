/**
 * The copyable DNS and Worker checklist for the Domains screen. Pure, so it can be tested and copied as text.
 *
 * The CMS cannot create DNS or Worker routes, and it does not check them (no Cloudflare credentials are stored), so the
 * checklist describes what to do in Cloudflare and each row says the status is not checked here.
 */

export type ChecklistDomain = { host: string; status?: string; isPrimary?: boolean }

export function dnsChecklistFor(domains: readonly ChecklistDomain[]): string {
  const lines: string[] = [
    'Domain checklist (Cloudflare, same account as this site):',
    '',
  ]
  if (domains.length === 0) {
    lines.push('No domains are registered yet. Add a row above, save, then come back here.')
    return lines.join('\n')
  }
  for (const domain of domains) {
    const tags = [domain.isPrimary ? 'primary' : null, domain.status === 'disabled' ? 'disabled, not served' : null].filter(Boolean)
    lines.push(`[ ] ${domain.host}${tags.length ? ` (${tags.join(', ')})` : ''}`)
    lines.push('    1. Workers & Pages > this site\'s Worker > Settings > Domains & Routes > Add > Custom domain')
    lines.push(`    2. Enter ${domain.host} and save`)
    lines.push(`    3. DNS: Cloudflare creates the record when the custom domain is added (same account); check it under DNS`)
    lines.push(`    4. Open https://${domain.host}/ and confirm the site loads`)
    lines.push('')
  }
  lines.push('Status is not checked automatically; tick each step once it is done in Cloudflare.')
  return lines.join('\n')
}

/** The per-row hint shown next to a domain on the Domains screen. */
export function dnsHintFor(domain: ChecklistDomain): string {
  if (domain.status === 'disabled') return 'Disabled: not served, so no Worker step is needed until it is enabled.'
  return 'Not checked here. Attach this host to the Worker under Domains & Routes in Cloudflare.'
}
