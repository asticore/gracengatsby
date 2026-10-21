import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const FILES = ['src/views/VisualEditor.tsx', 'src/views/visualEditor/ElementLibrary.tsx']

const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

describe('editor first render is hydration safe', () => {
  for (const f of FILES) {
    const src = strip(readFileSync(join(process.cwd(), f), 'utf8'))
    it(`${f} has no browser reads in lazy useState initialisers`, () => {
      const inits = [...src.matchAll(/useState(?:<[^>]*>)?\(\s*\(\)\s*=>[\s\S]{0,300}?\)\s*\n/g)].map((m) => m[0])
      for (const i of inits) expect(i).not.toMatch(/localStorage|window\.|navigator|Date\.now|Math\.random|loadList/)
    })
    it(`${f} has no render-time navigator or parsePath reads`, () => {
      expect(src).not.toMatch(/useMemo\([^)]*parsePath/)
      expect(src).not.toMatch(/typeof navigator !== 'undefined' &&/)
    })
  }
  it('VisualEditor reads the URL only after mount', () => {
    const src = readFileSync(join(process.cwd(), FILES[0]), 'utf8')
    expect(src).toContain('setRoute(parsePath())')
    expect(src).not.toMatch(/const route = useMemo/)
  })
})
