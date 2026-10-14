import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { THEME_SCRIPT, THEME_STORAGE_KEY } from '@/admin/context/themeScript'

/**
 * Wave 16: the pre-paint theme script must set data-theme before first paint
 * for 'light' and 'dark', remove it for 'auto' (or anything else), and never
 * throw when localStorage is blocked.
 */

type FakeStorage = { getItem: (key: string) => string | null }

function runScript(storage: FakeStorage | (() => never)) {
  const documentElement = { dataset: {} as Record<string, string | undefined> }
  const fakeWindow = {
    get localStorage(): FakeStorage {
      if (typeof storage === 'function') return storage()
      return storage
    },
  }
  const fakeDocument = { documentElement }
  // The script is the exact string RootLayout injects; evaluate it as a body.
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const fn = new Function('window', 'document', THEME_SCRIPT)
  fn(fakeWindow, fakeDocument)
  return documentElement.dataset
}

function storageWith(value: string | null, seen: string[] = []): FakeStorage {
  return {
    getItem: (key: string) => {
      seen.push(key)
      return value
    },
  }
}

describe('admin pre-paint theme script', () => {
  it('uses the same storage key as ThemeContext', () => {
    expect(THEME_STORAGE_KEY).toBe('ac-theme')
    const seen: string[] = []
    runScript(storageWith('dark', seen))
    expect(seen).toEqual(['ac-theme'])
  })

  it('sets data-theme to dark when stored preference is dark', () => {
    expect(runScript(storageWith('dark')).theme).toBe('dark')
  })

  it('sets data-theme to light when stored preference is light', () => {
    expect(runScript(storageWith('light')).theme).toBe('light')
  })

  it('removes data-theme when stored preference is auto', () => {
    const dataset = { theme: 'dark' as string | undefined }
    const documentElement = { dataset }
    const fakeWindow = { localStorage: storageWith('auto') }
    new Function('window', 'document', THEME_SCRIPT)(fakeWindow, { documentElement })
    expect(documentElement.dataset.theme).toBeUndefined()
    expect('theme' in documentElement.dataset).toBe(false)
  })

  it('removes data-theme when nothing is stored', () => {
    const dataset = { theme: 'light' as string | undefined }
    const documentElement = { dataset }
    new Function('window', 'document', THEME_SCRIPT)({ localStorage: storageWith(null) }, { documentElement })
    expect('theme' in documentElement.dataset).toBe(false)
  })

  it('treats unknown stored values as auto', () => {
    expect('theme' in runScript(storageWith('purple'))).toBe(false)
    expect('theme' in runScript(storageWith(''))).toBe(false)
  })

  it('does not throw when localStorage access throws, and falls back to auto', () => {
    const throwing = () => {
      throw new Error('SecurityError: storage disabled')
    }
    let dataset: Record<string, string | undefined> = {}
    expect(() => {
      dataset = runScript(throwing as () => never)
    }).not.toThrow()
    expect('theme' in dataset).toBe(false)
  })

  it('does not throw when getItem throws', () => {
    const storage: FakeStorage = {
      getItem: () => {
        throw new Error('quota or blocked')
      },
    }
    expect(() => runScript(storage)).not.toThrow()
    expect('theme' in runScript(storage)).toBe(false)
  })

  it('overrides a stale data-theme already on the element', () => {
    const dataset = { theme: 'dark' as string | undefined }
    const documentElement = { dataset }
    new Function('window', 'document', THEME_SCRIPT)({ localStorage: storageWith('light') }, { documentElement })
    expect(documentElement.dataset.theme).toBe('light')
  })

  it('script text is pure ASCII', () => {
    expect(/^[\x00-\x7f]*$/.test(THEME_SCRIPT)).toBe(true)
  })

  it('source file is pure ASCII and ends with exactly one newline', () => {
    const src = readFileSync(join(process.cwd(), 'src/admin/context/themeScript.ts'), 'utf8')
    expect(/^[\x00-\x7f]*$/.test(src)).toBe(true)
    expect(src.endsWith('\n')).toBe(true)
    expect(src.endsWith('\n\n')).toBe(false)
  })
})
