// @vitest-environment node
// See tests/int/cms-db-faqs.int.spec.ts for why: server-only suite (jsdom
// breaks wrangler's bundled esbuild), and @/engage.config must be the side
// entering the @/engine <-> @/engage.config circular import.
import type { Engine } from '@/engine'

import '@/engage.config'

import { getEngine } from '@/engine'
import { describe, expect, it } from 'vitest'

import { findLanguageSettings, updateLanguageSettings } from '@/cms/db'

/**
 * LanguageSettings - the second GLOBAL this data layer models (after
 * FaqSettings, Phase 18). Everything here lives inside the one `multilingual`
 * group; `activeLocales` is a hasMany `select` nested inside that group -
 * see ../../src/cms/db/globals/languageSettings.ts's doc comment for why
 * this is NOT yet a fully-provable shape: `generateTable(LanguageSettings)`
 * throws today ("hasMany select \"activeLocales\" inside group
 * \"multilingual\" is not supported yet"), confirmed by actually calling it -
 * this suite therefore only becomes runnable once ../../src/cms/db/schema/
 * generate.ts and ../../src/cms/db/generic.ts gain the proposed group-nested
 * array/select-table extension described there, and schema/index.ts is wired
 * accordingly. Kept in the same write-both-ways parity shape as every other
 * global/collection suite regardless, so it is ready to run unmodified once
 * that lands.
 */
describe('cms/db - language-settings global (proof of concept, not wired in)', () => {
  let engine: Engine

  it('reads a global updated by Payload: scalars + hasMany select, both nested in a group', async () => {
    engine = await getEngine()
    await engine.updateGlobal({
      slug: 'language-settings',
      data: {
        multilingual: {
          enabled: true,
          defaultLocale: 'en-AU',
          activeLocales: ['en-AU', 'en-US'],
          fallbackToDefault: true,
          showLanguageSwitcher: true,
          switcherPosition: 'footer',
        },
      },
    })

    const viaOurs = await findLanguageSettings()
    expect(viaOurs?.multilingual?.enabled).toBe(true)
    expect(viaOurs?.multilingual?.defaultLocale).toBe('en-AU')
    expect(viaOurs?.multilingual?.activeLocales).toEqual(['en-AU', 'en-US'])
    expect(viaOurs?.multilingual?.switcherPosition).toBe('footer')
  })

  it('writes a global (scalars + grouped hasMany select) Payload can read back', async () => {
    const ours = await updateLanguageSettings({
      multilingual: {
        enabled: true,
        defaultLocale: 'en-US',
        activeLocales: ['en-US', 'fr-FR', 'es-ES'],
        fallbackToDefault: false,
      },
    })
    expect(ours.multilingual?.defaultLocale).toBe('en-US')
    expect(ours.multilingual?.activeLocales).toEqual(['en-US', 'fr-FR', 'es-ES'])

    const viaPayload = await engine.findGlobal({ slug: 'language-settings', depth: 0 })
    expect((viaPayload.multilingual as { activeLocales?: string[] })?.activeLocales).toEqual(['en-US', 'fr-FR', 'es-ES'])
    expect((viaPayload.multilingual as { fallbackToDefault?: boolean })?.fallbackToDefault).toBe(false)
  })

  it('replaces activeLocales wholesale on update, preserving order', async () => {
    await updateLanguageSettings({ multilingual: { activeLocales: ['en-AU', 'fr-FR'] } })
    const first = await findLanguageSettings()
    expect(first?.multilingual?.activeLocales).toEqual(['en-AU', 'fr-FR'])

    const updated = await updateLanguageSettings({ multilingual: { activeLocales: ['de-DE'] } })
    expect(updated.multilingual?.activeLocales).toEqual(['de-DE'])

    const viaPayload = await engine.findGlobal({ slug: 'language-settings' })
    expect((viaPayload.multilingual as { activeLocales?: string[] })?.activeLocales).toEqual(['de-DE'])
  })
})
