import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { createElement as h } from 'react'
import { MediaPicker } from '@/views/visualEditor/MediaPicker'
import { appendMediaIds, filenameToAlt, validateFiles } from '@/views/visualEditor/mediaPickerUpload'

const file = (name: string, size = 10) => new File([new Uint8Array(size)], name, { type: 'image/png' })

describe('media picker upload helpers', () => {
  it('turns file names into alt text', () => {
    expect(filenameToAlt('harbour_sunset-2.JPG')).toBe('harbour sunset 2')
  })
  it('validates type and size', () => {
    const rules = { accept: ['.png'], maxBytes: 100 }
    const r = validateFiles([file('a.png'), file('b.exe'), file('c.png', 500)], rules)
    expect(r.accepted.map((f) => f.name)).toEqual(['a.png'])
    expect(r.rejected).toHaveLength(2)
    expect(validateFiles([file('a.png'), file('b.png')], rules, true).rejected).toHaveLength(1)
  })
  it('appends ids without duplicates', () => {
    expect(appendMediaIds([1, 2], [2, 3, '4'])).toEqual([1, 2, 3, 4])
  })
})

describe('MediaPicker', () => {
  afterEach(cleanup)
  it('renders the upload controls and library', async () => {
    ;(global as any).fetch = vi.fn(async (url: string) => ({
      ok: true,
      json: async () => (String(url).includes('admin-media-upload') ? { accept: ['.png'], maxBytes: 1048576 } : { docs: [{ id: 1, url: '/x.png', alt: 'x' }] }),
    }))
    render(h(MediaPicker, { onSelect: vi.fn(), onClose: vi.fn() }))
    expect(screen.getByRole('button', { name: 'Upload' })).toBeTruthy()
    expect(screen.getByRole('status')).toBeTruthy()
    await waitFor(() => expect(screen.getByText(/up to 1 MB each/)).toBeTruthy())
    await waitFor(() => expect(screen.getByAltText('x')).toBeTruthy())
  })
})
