import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (f: string) => readFileSync(join(process.cwd(), f), 'utf8')
const styles = read('src/views/visualEditor/visualEditor.styles.ts')
const lib = read('src/views/visualEditor/ElementLibrary.tsx')

const rule = (sel: string) => {
  const i = styles.indexOf(`\n${sel} {`)
  expect(i).toBeGreaterThan(-1)
  return styles.slice(i, styles.indexOf('}', i))
}

describe('element library layout', () => {
  it('only the dock body scrolls in the library chain', () => {
    expect(rule('.ve-dock__body')).toMatch(/overflow-y:\s*auto/)
    for (const sel of ['.ve-library', '.ve-library__body', '.ve-library__grid']) {
      expect(rule(sel)).not.toMatch(/overflow(-y)?:\s*(auto|scroll)/)
    }
    expect(styles).toMatch(/\.ve-dock__body \.ve-panel__body \{ overflow: visible/)
  })
  it('controls are sticky inside the single scroller', () => {
    expect(rule('.ve-library__controls')).toMatch(/position:\s*sticky/)
  })
  it('compact is the default density with labels exposed', () => {
    expect(lib).toContain("useState<'compact' | 'comfortable'>('compact')")
    expect(lib).toContain('ve-library--${density}')
    expect(lib).toContain('aria-label={`${block.label}: ${block.description}`}')
    expect(lib).toContain('title={`${block.label}: ${block.description}`}')
    expect(styles).toContain('.ve-library--compact .ve-library__grid')
  })
})
