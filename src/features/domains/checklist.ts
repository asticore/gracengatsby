/**
 * The copyable DNS and Worker checklist for the Domains screen. Pure, so it can be tested and copied as text.
 *
 * The CMS cannot create DNS or Worker routes, and it does not check them (no Cloudflare credentials are stored), so the
 * checklist describes what to do in Cloudflare and each row says the status is not checked here.
 *
 * Text comes from the admin UI strings. The default translator reads English, so callers without a locale (tests,
 * server-side copies) keep the same output; the admin passes its own translator.
 */
import { t as englishT, type UiStringKey, type UiStringVars } from '@/features/uiStrings'

export type ChecklistTranslate = (key: UiStringKey, vars?: UiStringVars) => string

const englishTranslate: ChecklistTranslate = (key, vars) => englishT(key, 'en', vars)

export type ChecklistDomain = { host: string; status?: string; isPrimary?: boolean }

export function dnsChecklistFor(domains: readonly ChecklistDomain[], tr: ChecklistTranslate = englishTranslate): string {
  const lines: string[] = [tr('dns.heading'), '']
  if (domains.length === 0) {
    lines.push(tr('dns.none'))
    return lines.join('\n')
  }
  for (const domain of domains) {
    const tags = [domain.isPrimary ? tr('dns.tagPrimary') : null, domain.status === 'disabled' ? tr('dns.tagDisabled') : null].filter(Boolean)
    lines.push(tags.length ? tr('dns.rowTagged', { host: domain.host, tags: tags.join(', ') }) : tr('dns.row', { host: domain.host }))
    lines.push(`    1. ${tr('dns.step1')}`)
    lines.push(`    2. ${tr('dns.step2', { host: domain.host })}`)
    lines.push(`    3. ${tr('dns.step3')}`)
    lines.push(`    4. ${tr('dns.step4', { host: domain.host })}`)
    lines.push('')
  }
  lines.push(tr('dns.footer'))
  return lines.join('\n')
}

/** The per-row hint shown next to a domain on the Domains screen. */
export function dnsHintFor(domain: ChecklistDomain, tr: ChecklistTranslate = englishTranslate): string {
  return domain.status === 'disabled' ? tr('dns.hintDisabled') : tr('dns.hintDefault')
}
