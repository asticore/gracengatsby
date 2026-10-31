// @vitest-environment node
// Design model, unified: the grouped-design migration on a real (local) D1.
// Stored v1 flat designs become grouped, typed v2 and flat-without-groups values stay exactly as
// stored, what a block renders is unchanged, and a second run changes nothing.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPlatformProxy } from 'wrangler'
import { drizzle } from 'drizzle-orm/d1'

import { consoleLogger } from '@/localapi/logger'
import { migrations } from '@/migrations'
import { runInternalMigrate } from '@/migrations/runInternalMigrate'
import * as migration from '@/migrations/20270126_100000_design_grouped'
import { canonicalJson, convertDesignsInTree, groupStoredV1Design } from '@/lib/design/storedGrouped'
import { readFlatDesign } from '@/lib/design/upgrade'
import { blockStyleField } from '@/blocks/styleField'
import { SectionBlock } from '@/blocks/Section'

const V1_HERO: Record<string, unknown> = { bgType: 'color', bgColor: '#111827', paddingTop: 80, paddingBottom: 80, textColor: '#ffffff', borderRadius: 8, unknownKey: 'kept' }
const V1_COLUMN = { bgType: 'color', bgColor: '#eeeeee', paddingTop: 12 }
const V1_NESTED = { textColor: '#000000', hideMobile: true }
const TYPED_V2: Record<string, unknown> = { schemaVersion: 2, color: { text: { desktop: { normal: '#111111' } } } }
const FLAT_EMPTY = {}
const FLAT_UNKNOWN_ONLY = { notAStyleKey: 'x' }

describe('design grouped migration - pure conversion', () => {
  it('groups a v1 flat design and reads back the same flat design', () => {
    const grouped = groupStoredV1Design(V1_HERO)
    expect(grouped).not.toBeNull()
    expect(grouped?.schemaVersion).toBe(2)
    expect(canonicalJson(readFlatDesign(grouped as Record<string, unknown>))).toBe(canonicalJson(V1_HERO))
  })

  it('leaves typed v2, empty and unknown-only values alone', () => {
    expect(groupStoredV1Design(TYPED_V2 as Record<string, unknown>)).toBeNull()
    expect(groupStoredV1Design(FLAT_EMPTY)).toBeNull()
    expect(groupStoredV1Design(FLAT_UNKNOWN_ONLY)).toBeNull()
  })

  it('the write hooks store designs grouped and leave typed values alone', () => {
    type Hook = (args: { value: unknown }) => unknown
    const designHook = (blockStyleField as unknown as { hooks: { beforeChange: Hook[] } }).hooks.beforeChange[0]
    const grouped = designHook({ value: V1_HERO }) as Record<string, unknown>
    expect(grouped.schemaVersion).toBe(2)
    expect(designHook({ value: TYPED_V2 })).toEqual(TYPED_V2)
    const columnsField = (SectionBlock.fields as unknown as Array<{ name: string; hooks: { beforeChange: Hook[] } }>).find((f) => f.name === 'columns')
    const tree = [{ _id: 'c1', design: V1_COLUMN, blocks: [] }]
    const out = columnsField!.hooks.beforeChange[0]({ value: tree }) as Array<{ design: Record<string, unknown> }>
    expect(out[0].design.schemaVersion).toBe(2)
  })

  it('converts every design inside a column tree and never enters props', () => {
    const tree = [{ blockType: 'section', design: V1_HERO, columns: [{ design: V1_COLUMN, blocks: [{ blockType: 'element', design: V1_NESTED, props: { design: V1_NESTED } }] }] }]
    const count = { converted: 0 }
    const out = convertDesignsInTree(tree, count) as typeof tree
    expect(count.converted).toBe(3)
    expect((out[0].design as { schemaVersion: number }).schemaVersion).toBe(2)
    expect(out[0].columns[0].blocks[0].props.design).toEqual(V1_NESTED)
  })
})

describe('design grouped migration - D1', () => {
  let proxy: Awaited<ReturnType<typeof getPlatformProxy<{ D1: D1Database }>>>

  const design = async (table: string, id: number, column = 'design'): Promise<string | null> => {
    const row = (await proxy.env.D1.prepare(`SELECT \`${column}\` AS v FROM \`${table}\` WHERE rowid = ?`).bind(id).first()) as { v: string | null } | null
    return row?.v ?? null
  }

  beforeAll(async () => {
    proxy = await getPlatformProxy<{ D1: D1Database }>({ persist: false })
    const result = await runInternalMigrate(proxy.env.D1, consoleLogger)
    expect(result.errorCount).toBe(0)
    await proxy.env.D1.prepare("INSERT OR IGNORE INTO `eg_pages` (`id`, `title`, `slug`) VALUES (1, 'Design fixture', 'design-fixture')").run()
  }, 300_000)

  afterAll(async () => {
    await proxy.dispose()
  })

  it('is registered last', () => {
    expect(migrations.at(-1)?.name).toBe('20270126_100000_design_grouped')
  })

  it('converts stored v1 rows, keeps typed and empty rows, and is idempotent', async () => {
    const hero = await proxy.env.D1.prepare(
      "INSERT INTO `eg_pages_blocks_hero` (`_order`, `_parent_id`, `_path`, `id`, `design`) VALUES (1, 1, 'hero-v1', 'hero-v1', ?) RETURNING rowid AS rid",
    ).bind(JSON.stringify(V1_HERO)).first<{ rid: number }>()
    const typed = await proxy.env.D1.prepare(
      "INSERT INTO `eg_pages_blocks_hero` (`_order`, `_parent_id`, `_path`, `id`, `design`) VALUES (2, 1, 'hero-typed', 'hero-typed', ?) RETURNING rowid AS rid",
    ).bind(JSON.stringify(TYPED_V2)).first<{ rid: number }>()
    const empty = await proxy.env.D1.prepare(
      "INSERT INTO `eg_pages_blocks_hero` (`_order`, `_parent_id`, `_path`, `id`, `design`) VALUES (3, 1, 'hero-empty', 'hero-empty', ?) RETURNING rowid AS rid",
    ).bind(JSON.stringify(FLAT_EMPTY)).first<{ rid: number }>()
    const section = await proxy.env.D1.prepare(
      "INSERT INTO `eg_pages_blocks_section` (`_order`, `_parent_id`, `_path`, `id`, `columns`, `design`) VALUES (4, 1, 'section-v1', 'section-v1', ?, ?) RETURNING rowid AS rid",
    )
      .bind(
        JSON.stringify([{ _id: 'c1', widthDesktop: { value: 12, unit: 'fraction' }, design: V1_COLUMN, blocks: [{ blockType: 'element', design: V1_NESTED, props: { design: V1_NESTED } }] }]),
        JSON.stringify(V1_HERO),
      )
      .first<{ rid: number }>()
    if (!hero || !typed || !empty || !section) throw new Error('fixture rows were not inserted')

    const db = drizzle(proxy.env.D1) as never
    const engine = { logger: consoleLogger } as never
    await migration.up({ db, engine } as never)

    const heroNow = JSON.parse((await design('eg_pages_blocks_hero', hero.rid)) as string) as Record<string, unknown>
    expect(heroNow.schemaVersion).toBe(2)
    expect(heroNow.groups).toBeDefined()
    expect(canonicalJson(readFlatDesign(heroNow))).toBe(canonicalJson(V1_HERO))

    expect(JSON.parse((await design('eg_pages_blocks_hero', typed.rid)) as string)).toEqual(TYPED_V2)
    expect(await design('eg_pages_blocks_hero', empty.rid)).toBe(JSON.stringify(FLAT_EMPTY))

    const sectionNow = JSON.parse((await design('eg_pages_blocks_section', section.rid, 'columns')) as string) as Array<{ design: Record<string, unknown>; blocks: Array<{ design: Record<string, unknown>; props: { design: unknown } }> }>
    expect(sectionNow[0].design.schemaVersion).toBe(2)
    expect(canonicalJson(readFlatDesign(sectionNow[0].design))).toBe(canonicalJson(V1_COLUMN))
    expect(canonicalJson(readFlatDesign(sectionNow[0].blocks[0].design))).toBe(canonicalJson(V1_NESTED))
    expect(sectionNow[0].blocks[0].props.design).toEqual(V1_NESTED)
    expect(JSON.parse((await design('eg_pages_blocks_section', section.rid)) as string).schemaVersion).toBe(2)

    const before = [await design('eg_pages_blocks_hero', hero.rid), await design('eg_pages_blocks_section', section.rid, 'columns')]
    await migration.up({ db, engine } as never)
    const after = [await design('eg_pages_blocks_hero', hero.rid), await design('eg_pages_blocks_section', section.rid, 'columns')]
    expect(after).toEqual(before)
  }, 300_000)

  it('a second internal migrate run after the conversion has zero errors', async () => {
    const again = await runInternalMigrate(proxy.env.D1, consoleLogger)
    expect(again.errorCount).toBe(0)
  }, 300_000)
})
