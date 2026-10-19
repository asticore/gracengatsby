// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const { getAdminContext, readSettings } = vi.hoisted(() => ({ getAdminContext: vi.fn(), readSettings: vi.fn() }))
vi.mock('@/admin/auth', () => ({ getAdminContext }))
vi.mock('@/features/templateRepos/settings', () => ({ readTemplateRepoSettings: readSettings }))

import { collectAssets, relinkAssets } from '@/features/templateRepos/assets'
import { sanitizeTemplateTree } from '@/features/templateRepos/sanitize'
import { ASSET_LIMITS, insertTemplateAssets, sha256Hex } from '@/features/templateRepos/insertAssets'
import { treeToStaticHtml } from '@/features/templateRepos/exportHtml'
import { clearTemplateRepoCache, loadManifest, testRepoAccess } from '@/features/templateRepos/fetch'
import { renderElement } from '@/components/blocks/elements/renderElement'
import { isUnknownElementType, unknownElementTitle, UNKNOWN_ELEMENT_DETAIL } from '@/lib/elements/unknownElement'
import { exportPage, parsePageImport } from '@/views/visualEditor/editorClipboard'
import type { SectionNode } from '@/lib/sectionTree'
import type { TemplateFile, TemplateRepoConfig } from '@/features/templateRepos/types'

const tree = (): SectionNode[] =>
  [
    {
      blockType: 'section',
      design: { bgImage: 5, bgImageUrl: '/media/old5.jpg', bgType: 'image' },
      columns: [
        {
          blocks: [
            { blockType: 'element', elementType: 'image', props: { image: 7 } },
            {
              blockType: 'section',
              design: { bgType: 'slideshow', bgSlideIds: [8, 9], bgSlides: ['/media/s8.jpg', '/media/s9.jpg'] },
              columns: [{ blocks: [{ blockType: 'element', elementType: 'image-gallery', props: { images: [10, { id: 11, url: '/media/g11.jpg' }] } }] }],
            },
          ],
        },
        { blocks: [{ blockType: 'hero', backgroundImage: 12, heading: 'x' }] },
      ],
    },
    { blockType: 'element', elementType: 'heading', props: { text: 'Hi' }, design: { background: { type: 'image', imageUrl: { desktop: 'https://old.example/a.png' } } } },
  ] as unknown as SectionNode[]

describe('collectAssets / relinkAssets', () => {
  it('finds ids and urls in props, design keys, slideshows and nested columns', () => {
    const refs = collectAssets(tree())
    expect(refs.ids.sort((a, b) => a - b)).toEqual([5, 7, 8, 9, 10, 11, 12])
    expect(refs.urls).toEqual(expect.arrayContaining(['/media/old5.jpg', '/media/s8.jpg', '/media/s9.jpg', '/media/g11.jpg', 'https://old.example/a.png']))
  })

  it('rewrites ids and urls and leaves unmapped ones and the input alone', () => {
    const input = tree()
    const before = JSON.stringify(input)
    const out = relinkAssets(input, {
      '5': { id: 105, url: '/m/n5.jpg' },
      '7': { id: 107 },
      '8': { id: 108, url: '/m/n8.jpg' },
      '11': { id: 111, url: '/m/n11.jpg' },
      '12': { id: 112 },
      'https://old.example/a.png': { id: 0, url: '/m/a.png' },
    }) as any[]
    expect(JSON.stringify(input)).toBe(before)
    const section = out[0]
    expect(section.design.bgImage).toBe(105)
    expect(section.design.bgImageUrl).toBe('/m/n5.jpg')
    expect(section.columns[0].blocks[0].props.image).toBe(107)
    const inner = section.columns[0].blocks[1]
    expect(inner.design.bgSlideIds).toEqual([108, 9])
    expect(inner.design.bgSlides).toEqual(['/m/n8.jpg', '/media/s9.jpg'])
    expect(inner.columns[0].blocks[0].props.images).toEqual([10, { id: 111, url: '/m/n11.jpg' }])
    expect(section.columns[1].blocks[0].backgroundImage).toBe(112)
    expect(out[1].design.background.imageUrl).toEqual({ desktop: '/m/a.png' })
  })

  it('maps by url alone when there is no id', () => {
    const out = relinkAssets(tree(), { '/media/s9.jpg': { id: 0, url: '/m/s9.jpg' } }) as any[]
    expect(out[0].columns[0].blocks[1].design.bgSlides[1]).toBe('/m/s9.jpg')
  })
})

describe('sanitizeTemplateTree', () => {
  it('keeps html elements but empties their content, and drops code keys', () => {
    const out = sanitizeTemplateTree([
      { blockType: 'element', elementType: 'html', props: { html: '<b>x</b>' }, onclick: 'x()' },
      { blockType: 'section', columns: [{ blocks: [{ blockType: 'element', elementType: 'heading', props: { text: '<script>1</script>', onload: 'y' }, design: { customCss: '</style><script>' } }] }] },
    ] as any[]) as any[]
    expect(out).toHaveLength(2)
    expect(out[0].props.html).toBe('')
    expect(out[0].onclick).toBeUndefined()
    const heading = out[1].columns[0].blocks[0]
    expect(heading.props.text).toBe('')
    expect(heading.props.onload).toBeUndefined()
    expect(heading.design.customCss).toBeUndefined()
  })
  it('keeps html content only with the opt-in', () => {
    const out = sanitizeTemplateTree([{ blockType: 'element', elementType: 'html', props: { html: '<b>x</b>' } }] as any[], { allowRawHtml: true }) as any[]
    expect(out[0].props.html).toBe('<b>x</b>')
  })
})

const repo: TemplateRepoConfig = { label: 'r', owner: 'acme', repo: 'templates', branch: 'main', path: '', enabled: true }
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4])
const templateWith = (assets: Array<Record<string, string>>): TemplateFile => ({
  format: 'engage-template',
  schemaVersion: 1,
  kind: 'section',
  tree: [{ blockType: 'element', elementType: 'image', props: { image: 7 } }, { blockType: 'element', elementType: 'html', props: { html: '<i>a</i>' } }],
  assets,
  requires: {},
})
const bytesResponse = (bytes: Uint8Array) => new Response(bytes as unknown as BodyInit, { status: 200 })

describe('insertTemplateAssets', () => {
  const create = () => vi.fn(async (_file: unknown, _alt: string) => ({ id: 900, url: '/media/new.png' }))

  it('downloads, verifies the hash, saves, relinks and sanitises', async () => {
    const hash = await sha256Hex(PNG)
    const fetchImpl = vi.fn(async (_url: string) => bytesResponse(PNG))
    const createMedia = create()
    const result = await insertTemplateAssets(
      { repo, token: null, template: templateWith([{ id: '7', path: 'templates/a/p.png', alt: 'A', sha256: hash }]) },
      { fetchImpl, createMedia },
    )
    expect(result.ok).toBe(true)
    expect(fetchImpl.mock.calls[0][0]).toBe('https://raw.githubusercontent.com/acme/templates/main/templates/a/p.png')
    expect(createMedia).toHaveBeenCalledTimes(1)
    expect((result.value!.tree[0] as any).props.image).toBe(900)
    expect((result.value!.tree[1] as any).props.html).toBe('')
    expect(result.value!.idMap['7']).toEqual({ id: 900, url: '/media/new.png' })
  })

  it('refuses too many assets', async () => {
    const assets = Array.from({ length: ASSET_LIMITS.maxAssets + 1 }, (_, i) => ({ id: String(i + 1), path: `templates/a/${i}.png`, alt: '', sha256: '' }))
    const fetchImpl = vi.fn()
    const result = await insertTemplateAssets({ repo, token: null, template: templateWith(assets) }, { fetchImpl, createMedia: create() })
    expect(result.ok).toBe(false)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('refuses an oversize file and saves nothing', async () => {
    const big = new Uint8Array(ASSET_LIMITS.maxBytes + 1)
    big.set(PNG)
    const createMedia = create()
    const result = await insertTemplateAssets(
      { repo, token: null, template: templateWith([{ id: '7', path: 'templates/a/p.png', alt: '', sha256: '' }]) },
      { fetchImpl: async () => bytesResponse(big), createMedia },
    )
    expect(result.ok).toBe(false)
    expect(createMedia).not.toHaveBeenCalled()
  })

  it('refuses a file that is not an allowed image type', async () => {
    const createMedia = create()
    const result = await insertTemplateAssets(
      { repo, token: null, template: templateWith([{ id: '7', path: 'templates/a/p.png', alt: '', sha256: '' }]) },
      { fetchImpl: async () => bytesResponse(new TextEncoder().encode('<svg onload=1></svg>')), createMedia },
    )
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/PNG, JPEG or WebP/)
    expect(createMedia).not.toHaveBeenCalled()
  })

  it('refuses a hash mismatch', async () => {
    const createMedia = create()
    const result = await insertTemplateAssets(
      { repo, token: null, template: templateWith([{ id: '7', path: 'templates/a/p.png', alt: '', sha256: 'ab'.repeat(32) }]) },
      { fetchImpl: async () => bytesResponse(PNG), createMedia },
    )
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/checksum/)
    expect(createMedia).not.toHaveBeenCalled()
  })

  it('never fetches a host that is not allowlisted, whatever the template says', async () => {
    const fetchImpl = vi.fn(async (_url: string) => bytesResponse(PNG))
    for (const path of ['https://evil.example/x.png', '//evil.example/x.png', '../x.png', 'a\\b.png']) {
      const result = await insertTemplateAssets(
        { repo, token: null, template: templateWith([{ id: '7', path, alt: '', sha256: '' }]) },
        { fetchImpl, createMedia: create() },
      )
      expect(result.ok, path).toBe(false)
    }
    expect(fetchImpl).not.toHaveBeenCalled()
    const hosts = new Set<string>()
    await insertTemplateAssets(
      { repo, token: 'tok', template: templateWith([{ id: '7', path: 'templates/a/p.png', alt: '', sha256: '' }]) },
      { fetchImpl: async (url: string) => (hosts.add(new URL(url).host), bytesResponse(PNG)), createMedia: create() },
    )
    expect([...hosts]).toEqual(['api.github.com'])
  })
})

describe('manifest refresh and token test', () => {
  it('bypassCache refetches, and the token check sends HEAD without leaking the token', async () => {
    clearTemplateRepoCache()
    const manifest = JSON.stringify({ schemaVersion: 1, name: 'm', categories: [], templates: [] })
    const fetchImpl = vi.fn(async () => new Response(manifest))
    await loadManifest(repo, null, { fetchImpl })
    await loadManifest(repo, null, { fetchImpl })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    await loadManifest(repo, null, { fetchImpl, bypassCache: true })
    expect(fetchImpl).toHaveBeenCalledTimes(2)

    const head = vi.fn(async (_url: string, _init?: RequestInit) => new Response(null, { status: 401 }))
    const bad = await testRepoAccess(repo, 'SECRET-TOKEN', { fetchImpl: head })
    expect(head.mock.calls[0][1]?.method).toBe('HEAD')
    expect(bad.ok).toBe(false)
    expect(JSON.stringify(bad)).not.toContain('SECRET-TOKEN')
    const good = await testRepoAccess(repo, 'SECRET-TOKEN', { fetchImpl: async () => new Response(null, { status: 200 }) })
    expect(good.ok).toBe(true)
    expect(JSON.stringify(good)).not.toContain('SECRET-TOKEN')
  })
})

describe('unknown elements', () => {
  const unknownTree = [{ blockType: 'element', elementType: 'made-up-widget', props: { a: 1 } }] as unknown as SectionNode[]

  it('import keeps them and lists them', () => {
    const res = parsePageImport(JSON.stringify({ format: 'engage-template', schemaVersion: 1, kind: 'page', tree: unknownTree }))
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.summary.nodes).toHaveLength(1)
      expect(res.summary.unknownTypes).toContain('element:made-up-widget')
    }
  })

  it('the editor placeholder names the type and says it is kept, not shown live', () => {
    expect(isUnknownElementType('made-up-widget')).toBe(true)
    expect(isUnknownElementType('heading')).toBe(false)
    expect(unknownElementTitle('made-up-widget')).toContain('made-up-widget')
    expect(UNKNOWN_ELEMENT_DETAIL).toMatch(/not shown on the live page/)
  })

  it('renders nothing on the live page and is left out of the static export', () => {
    expect(renderElement('made-up-widget', { a: 1 })).toBeNull()
    expect(renderToStaticMarkup(React.createElement(React.Fragment, null, renderElement('made-up-widget', {})))).toBe('')
    const out = treeToStaticHtml(unknownTree)
    expect(out.skipped[0]).toMatch(/made-up-widget/)
    expect(out.html).toContain('<!-- Not exported: unknown element made-up-widget -->')
  })
})

describe('treeToStaticHtml', () => {
  it('makes a standalone document, inlines block design css, comments out server blocks', () => {
    const { html, skipped } = treeToStaticHtml(
      [
        { blockType: 'element', elementType: 'heading', props: { text: 'Hello <b>' }, design: { bgType: 'color', bgColor: '#ff0000', paddingTop: 20 } },
        { blockType: 'productGrid' },
        { blockType: 'element', elementType: 'html', props: { html: '<script>x</script>' } },
      ] as unknown as SectionNode[],
      { title: 'A <page>' },
    )
    expect(html.startsWith('<!doctype html>')).toBe(true)
    expect(html).toContain('<title>A &lt;page&gt;</title>')
    expect(html).toContain('Hello')
    expect(html).not.toContain('<script>')
    expect(html).toContain('#ff0000')
    expect(skipped.join('|')).toMatch(/productGrid/)
    expect(html).toContain('<!-- Not exported: productGrid block')
  })
})

describe('export document', () => {
  it('carries assets and requires', () => {
    const data = JSON.parse(exportPage(tree()).text)
    expect(data.assets.map((a: { id: string }) => a.id)).toEqual(expect.arrayContaining(['5', '7', '/media/old5.jpg']))
    expect(data.requires.elements).toEqual(['heading', 'image', 'image-gallery'])
    expect(data.requires.minEngageVersion).toBe('1')
    expect(parsePageImport(JSON.stringify(data)).ok).toBe(true)
  })
})
