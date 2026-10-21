import { describe, expect, it } from 'vitest'

import { isExcludedPath } from '@/features/site/maintenance'

describe('maintenance exclusions', () => {
  it('lets the editor canvas load while maintenance is on', () => {
    expect(isExcludedPath('/visual-editor-canvas')).toBe(true)
    expect(isExcludedPath('/visual-editor-canvas?x=1')).toBe(true)
  })
  it('still covers normal pages', () => {
    expect(isExcludedPath('/about')).toBe(false)
    expect(isExcludedPath('/visual-editor-canvasfoo')).toBe(false)
  })
})
