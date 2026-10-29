import { describe, expect, it } from 'vitest'

import { builtInEmailTemplates, toRenderTokens } from '@/features/email/builtInTemplates'
import { EMAIL_TEMPLATE_DEFAULTS } from '@/features/email/templateDefaults'
import { DEFAULT_EMAIL_TEMPLATES } from '@/features/ecommerce/server/emails'
import { ADMIN_UI_LOCALES, UI_STRING_SOURCE, type UiStringKey } from '@/features/uiStrings'

const EMAIL_KEYS = Object.keys(UI_STRING_SOURCE).filter((key) => key.startsWith('email.')) as UiStringKey[]
const tokens = (text: string) => [...text.matchAll(/\{([A-Za-z][A-Za-z0-9_]*)\}/g)].map((m) => m[1]).sort().join(',')

describe('email wording in the reader language', () => {
  it('keeps the English key source identical to the built-in account wording', () => {
    for (const [name, tpl] of Object.entries(EMAIL_TEMPLATE_DEFAULTS)) {
      if (!UI_STRING_SOURCE[`email.${name}.subject` as UiStringKey]) continue
      expect(toRenderTokens(UI_STRING_SOURCE[`email.${name}.subject` as UiStringKey])).toBe(tpl.subject)
      expect(toRenderTokens(UI_STRING_SOURCE[`email.${name}.body` as UiStringKey])).toBe(tpl.body)
    }
  })

  it('keeps the English key source identical to the built-in order wording', () => {
    for (const [kind, tpl] of Object.entries(DEFAULT_EMAIL_TEMPLATES)) {
      expect(toRenderTokens(UI_STRING_SOURCE[`email.order.${kind}.subject` as UiStringKey])).toBe(tpl.subject)
      expect(toRenderTokens(UI_STRING_SOURCE[`email.order.${kind}.body` as UiStringKey])).toBe(tpl.body)
    }
  })

  it('returns the original built-in objects for English or no locale', async () => {
    expect(await builtInEmailTemplates(null)).toBe(EMAIL_TEMPLATE_DEFAULTS)
    expect(await builtInEmailTemplates('en')).toBe(EMAIL_TEMPLATE_DEFAULTS)
    expect(await builtInEmailTemplates('xx-unsupported')).toBe(EMAIL_TEMPLATE_DEFAULTS)
  })

  it('translates account wording for a supported language and keeps the placeholders', async () => {
    const de = await builtInEmailTemplates('de')
    expect(de.accountReset.subject).not.toBe(EMAIL_TEMPLATE_DEFAULTS.accountReset.subject)
    expect(tokens(de.accountReset.body)).toBe(tokens(EMAIL_TEMPLATE_DEFAULTS.accountReset.body))
  })

  it('keeps every email placeholder identical to English in every language', async () => {
    const { loadRawStrings } = await import('@/features/uiStrings')
    for (const locale of ADMIN_UI_LOCALES.filter((l) => l !== 'en')) {
      const raw = await loadRawStrings(locale)
      for (const key of EMAIL_KEYS) {
        const value = raw[key]
        expect(value, `${locale} ${key}`).toBeTruthy()
        expect(tokens(value as string), `${locale} ${key}`).toBe(tokens(UI_STRING_SOURCE[key]))
      }
    }
  })
})
