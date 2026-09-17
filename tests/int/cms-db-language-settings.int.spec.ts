// @vitest-environment node
// See tests/int/cms-db-faqs.int.spec.ts for why: server-only suite (jsdom
// breaks wrangler's bundled esbuild), and @/engage.config must be the side
// entering the @/engine <-> @/engage.config circular import.
import type { RealEngine as Engine } from './helpers/realEngine'

import '@/engage.config'

import { getRealEngine as getEngine } from './helpers/realEngine'
import { describe, expect, it } from 'vitest'

import { findLanguageSettings, updateLanguageSettings } from '@/cms/db'

describe('cms/db - language-settings global', () => {
  let engine: Engine

  it('reads a global updated by Payload: select field', async () => {
    engine = await getEngine()
    await engine.updateGlobal({
      slug: 'language-settings',
      data: {
        defaultLanguage: 'es',
      },
    })

    const viaOurs = await findLanguageSettings()
    expect(viaOurs?.defaultLanguage).toBe('es')
  })

  it('writes a global Payload can read back', async () => {
    const ours = await updateLanguageSettings({
      defaultLanguage: 'fr',
    })
    expect(ours.defaultLanguage).toBe('fr')

    const viaPayload = await engine.findGlobal({ slug: 'language-settings', depth: 0 })
    expect((viaPayload as any).defaultLanguage).toBe('fr')
  })
})
