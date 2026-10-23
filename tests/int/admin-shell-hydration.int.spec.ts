import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (f: string) => readFileSync(join(process.cwd(), f), 'utf8')

describe('admin shell providers are hydration safe', () => {
  it('ThemeProvider starts from the server value and reads storage after mount', () => {
    const src = read('src/admin/context/ThemeContext.tsx')
    expect(src).toContain("useState<ThemePref>('auto')")
    expect(src).toContain('setThemeState(getInitialTheme())')
    expect(src).not.toMatch(/useState<ThemePref>\(getInitialTheme\)/)
  })
  it('NavProvider initial state has no browser reads', () => {
    const src = read('src/admin/context/NavContext.tsx')
    expect(src).not.toMatch(/useState\(getInitial/)
    expect(src).toContain('setCollapsedState(getInitialCollapsed())')
  })
})
