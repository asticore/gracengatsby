// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { isPickerRequest, NOINDEX_HEADER_VALUE, PICKER_QUERY } from '@/features/security/noindex'
import { isNoindexPath } from '@/features/security/noindex'

describe('visual picker headers and access', () => {
  it('marks a picker request by its query flag only', () => {
    expect(isPickerRequest(new URL('https://x.test/shop?eg-event-picker=1'))).toBe(true)
    expect(isPickerRequest(new URL('https://x.test/shop?eg-event-picker=0'))).toBe(false)
    expect(isPickerRequest(new URL('https://x.test/shop'))).toBe(false)
    expect(PICKER_QUERY).toBe('eg-event-picker')
  })

  it('sends noindex for the picker value, the same header the admin paths get', () => {
    expect(NOINDEX_HEADER_VALUE).toBe('noindex, nofollow, noarchive')
    expect(isNoindexPath('/api/admin-tracking-events')).toBe(true)
    expect(isNoindexPath('/shop')).toBe(false)
  })
})
