// @vitest-environment node
// The example library in docs/template-library-example is what authors copy. It must always parse, every
// item must load, every picture must be a real image, and a picture reference must be re-pointed at the
// media item that was saved for it.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { parseLibraryText } from '@/features/templateLibraries/manifest'
import { insertTemplateAssets } from '@/features/templateRepos/insertAssets'
import { parseTemplate, cleanRelativePath } from '@/features/templateRepos/manifest'
import { sniffImageType } from '@/features/templateRepos/fetch'
import type { TemplateRepoConfig } from '@/features/templateRepos/types'

const ROOT = path.join(process.cwd(), 'docs', 'template-library-example')
const read = (relative: string): Uint8Array => new Uint8Array(readFileSync(path.join(ROOT, relative)))
const text = (relative: string): string => readFileSync(path.join(ROOT, relative), 'utf8')
const config: TemplateRepoConfig = { label: 'Example', owner: 'acme', repo: 'example-library', branch: 'main', path: '', enabled: true }

describe('example template library (docs/template-library-example)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('has a valid library.json whose items all load', () => {
    const library = parseLibraryText(text('library.json'))
    expect(library.ok, library.ok ? '' : library.error).toBe(true)
    if (!library.ok) return
    for (const item of library.value.items) {
      expect(cleanRelativePath(item.file, { strict: true })).toBe(item.file)
      const file = parseTemplate(text(item.file))
      expect(file.ok ? '' : file.error, item.slug).toBe('')
      if (file.ok) expect(file.value.kind).toBe(item.kind)
      expect(sniffImageType(read(item.preview)), item.preview).toMatch(/^image\//)
    }
  })

  it('re-points a picture reference at the saved media item', async () => {
    const file = parseTemplate(text('items/intro-split.json'))
    expect(file.ok).toBe(true)
    if (!file.ok) return
    const picture = read('images/intro-photo.png')
    vi.stubGlobal('fetch', vi.fn(async () => new Response(picture as BodyInit, { status: 200, headers: { 'content-type': 'image/png' } })))
    const saved: string[] = []
    const result = await insertTemplateAssets(
      { repo: config, token: null, template: file.value },
      {
        createMedia: async (uploaded) => {
          saved.push(uploaded.name)
          return { id: 999, url: '/media/999.png' }
        },
      },
    )
    expect(result.ok).toBe(true)
    expect(saved).toHaveLength(1)
    if (result.ok) {
      const text = JSON.stringify(result.value.tree)
      expect(text).toContain('"id":999')
      expect(text).not.toContain('"intro-photo"')
    }
  })
})
