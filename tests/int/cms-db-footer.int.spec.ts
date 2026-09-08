// @vitest-environment node
// See tests/int/cms-db-faqs.int.spec.ts for why: server-only suite (jsdom
// breaks wrangler's bundled esbuild), and @/engage.config must be the side
// entering the @/engine <-> @/engage.config circular import.
import type { Engine } from '@/engine'

import '@/engage.config'

import { getEngine } from '@/engine'
import { describe, expect, it } from 'vitest'

import { findFooter, updateFooter } from '@/cms/db'

/**
 * Footer: same two field shapes as header.ts's own suite (see its doc
 * comment) - `columns[].links[]` (array-in-array, already-proven) and
 * `socials.links` (array-in-group, the new shape both globals introduce) -
 * plus `contact`, a plain scalar-only group (already-proven, same mechanism
 * as MemberSettings/SecuritySettings).
 */
describe('cms/db - footer global', () => {
  let engine: Engine

  it('reads a global updated by Payload: columns.links (array-in-array), contact (plain group), socials.links (array-in-group)', async () => {
    engine = await getEngine()
    const page = await engine.create({ collection: 'pages', data: { title: 'Shipping & Returns' } })

    await engine.updateGlobal({
      slug: 'footer',
      data: {
        layout: 'columns-4',
        bottomText: 'Considered pieces for evenings worth dressing up for.',
        columns: [
          {
            title: 'Help',
            links: [
              { label: 'Shipping & Returns', linkType: 'page', page: page.id },
              { label: 'Contact', linkType: 'custom', customUrl: '/contact' },
            ],
          },
        ],
        contact: { email: 'hello@example.com', phone: '+61 400 000 000' },
        socials: { show: true, links: [{ platform: 'Pinterest', url: 'https://pinterest.com/x' }] },
      },
    })

    const viaOurs = await findFooter()
    expect(viaOurs?.layout).toBe('columns-4')
    expect(viaOurs?.columns).toHaveLength(1)
    expect(viaOurs?.columns?.[0].links).toHaveLength(2)
    expect(viaOurs?.columns?.[0].links?.[0].page).toBe(page.id)
    expect(viaOurs?.columns?.[0].links?.[1].customUrl).toBe('/contact')
    expect(viaOurs?.contact?.email).toBe('hello@example.com')
    expect(viaOurs?.contact?.phone).toBe('+61 400 000 000')
    expect(viaOurs?.socials?.show).toBe(true)
    expect(viaOurs?.socials?.links).toHaveLength(1)
    expect(viaOurs?.socials?.links?.[0].platform).toBe('Pinterest')
  })

  it('writes a global (columns.links + socials.links) Payload can read back', async () => {
    const page = await engine.create({ collection: 'pages', data: { title: 'FAQ' } })

    const ours = await updateFooter({
      columns: [
        { title: 'Shop', links: [{ label: 'FAQ', linkType: 'page', page: page.id }] } as never,
      ],
      socials: { show: true, links: [{ platform: 'Facebook', url: 'https://facebook.com/x' }] } as never,
    })
    expect(ours.columns).toHaveLength(1)
    expect(ours.columns?.[0].links).toHaveLength(1)
    expect(ours.socials?.links).toHaveLength(1)

    const viaPayload = await engine.findGlobal({ slug: 'footer', depth: 0 })
    const payloadColumns = viaPayload.columns as { links?: { page?: number }[] }[]
    expect(payloadColumns[0].links?.[0]?.page).toBe(page.id)
    const payloadSocials = viaPayload.socials as { links?: { platform?: string }[] } | undefined
    expect(payloadSocials?.links?.[0]?.platform).toBe('Facebook')
  })

  it('replaces columns wholesale on update and leaves socials.links untouched when omitted from the payload', async () => {
    await updateFooter({
      columns: [{ title: 'Original', links: [] } as never],
      socials: { show: true, links: [{ platform: 'X', url: 'https://x.com/a' }] } as never,
    })

    const updated = await updateFooter({ columns: [{ title: 'Replaced', links: [] } as never] })
    expect(updated.columns).toHaveLength(1)
    expect(updated.columns?.[0].title).toBe('Replaced')
    // `socials` wasn't in this update's payload at all - untouched, same
    // "key present = replace wholesale" contract every other special field
    // in this data layer has.
    expect(updated.socials?.links).toHaveLength(1)
    expect(updated.socials?.links?.[0].platform).toBe('X')

    const viaPayload = await engine.findGlobal({ slug: 'footer' })
    expect((viaPayload.columns as { title?: string }[])[0].title).toBe('Replaced')
  })
})
