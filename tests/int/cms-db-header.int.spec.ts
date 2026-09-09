// @vitest-environment node
// See tests/int/cms-db-faqs.int.spec.ts for why: server-only suite (jsdom
// breaks wrangler's bundled esbuild), and @/engage.config must be the side
// entering the @/engine <-> @/engage.config circular import.
import type { Engine } from '@/engine'

import '@/engage.config'

import { getEngine } from '@/engine'
import { describe, expect, it } from 'vitest'

import { findHeader, updateHeader } from '@/cms/db'

/**
 * Header: the first global in this data layer with a top-level `array`
 * field at all (`menu`), and the first field shape anywhere in this app's
 * config - collection or global - of an `array` nested directly inside a
 * top-level `group` (`socials.links`) rather than inside another array's own
 * subfields. See src/cms/db/schema/index.ts's `withoutSocialsLinks` doc
 * comment and src/cms/db/globals/header.ts's `liftSocialsLinks` doc comment
 * for the full confirmation of why generate.ts/generic.ts don't have a
 * first-class path for that second shape yet, and how it's modeled here
 * without changing either shared file.
 *
 * `menu[].children[]` (array nested directly inside an array's own
 * subfields, no group involved) and `menu[].page` (a plain, non-hasMany
 * relationship column) are both already-proven shapes - FieldGroups'/Forms'
 * `options` for the former, EventRSVPs'/every other single relationship
 * field for the latter - so this suite's real news is `socials.links`.
 */
describe('cms/db - header global', () => {
  let engine: Engine

  it('reads a global updated by Payload: menu.children (array-in-array), a plain relationship field, and socials.links (array-in-group)', async () => {
    engine = await getEngine()
    const page = await engine.create({ collection: 'pages', data: { title: `Shop ${Date.now()}` } })

    await engine.updateGlobal({
      slug: 'header',
      data: {
        sticky: true,
        desktopLayout: 'logo-center',
        announcementBar: { enabled: true, text: 'Free shipping over $100', dismissible: false },
        menu: [
          {
            label: 'Shop',
            linkType: 'page',
            page: page.id,
            children: [{ label: 'New In', linkType: 'custom', customUrl: '/new' }],
          },
          { label: 'About', linkType: 'custom', customUrl: '/about' },
        ],
        socials: { show: true, links: [{ platform: 'Instagram', url: 'https://instagram.com/x' }] },
      },
    })

    const viaOurs = await findHeader()
    expect(viaOurs?.sticky).toBe(true)
    expect(viaOurs?.desktopLayout).toBe('logo-center')
    expect(viaOurs?.announcementBar?.enabled).toBe(true)
    expect(viaOurs?.announcementBar?.dismissible).toBe(false)
    expect(viaOurs?.menu).toHaveLength(2)
    expect(viaOurs?.menu?.[0].page).toBe(page.id)
    expect(viaOurs?.menu?.[0].children).toHaveLength(1)
    expect(viaOurs?.menu?.[0].children?.[0].customUrl).toBe('/new')
    expect(viaOurs?.menu?.[1].customUrl).toBe('/about')
    expect(viaOurs?.socials?.show).toBe(true)
    expect(viaOurs?.socials?.links).toHaveLength(1)
    expect(viaOurs?.socials?.links?.[0].platform).toBe('Instagram')
  })

  it('writes a global (menu.children + socials.links) Payload can read back', async () => {
    const page = await engine.create({ collection: 'pages', data: { title: `About ${Date.now()}` } })

    const ours = await updateHeader({
      menu: [
        { label: 'About', linkType: 'page', page: page.id, children: [] } as never,
      ],
      socials: { show: true, links: [{ platform: 'TikTok', url: 'https://tiktok.com/@x' }] } as never,
    })
    expect(ours.menu).toHaveLength(1)
    expect(ours.socials?.links).toHaveLength(1)
    expect(ours.socials?.links?.[0].platform).toBe('TikTok')

    const viaPayload = await engine.findGlobal({ slug: 'header', depth: 0 })
    expect((viaPayload.menu as { page?: number }[])[0].page).toBe(page.id)
    const payloadSocials = viaPayload.socials as { links?: { platform?: string }[] } | undefined
    expect(payloadSocials?.links?.[0]?.platform).toBe('TikTok')
  })

  it('replaces menu wholesale on update and leaves socials.links untouched when omitted from the payload', async () => {
    await updateHeader({
      menu: [{ label: 'Original', linkType: 'custom', customUrl: '/a' } as never],
      socials: { show: true, links: [{ platform: 'X', url: 'https://x.com/a' }] } as never,
    })

    const updated = await updateHeader({ menu: [{ label: 'Replaced', linkType: 'custom', customUrl: '/b' } as never] })
    expect(updated.menu).toHaveLength(1)
    expect(updated.menu?.[0].label).toBe('Replaced')
    // `socials` wasn't in this update's payload at all - untouched, same
    // "key present = replace wholesale" contract every other special field
    // in this data layer has.
    expect(updated.socials?.links).toHaveLength(1)
    expect(updated.socials?.links?.[0].platform).toBe('X')

    const viaPayload = await engine.findGlobal({ slug: 'header' })
    expect((viaPayload.menu as { label?: string }[])[0].label).toBe('Replaced')
  })
})
