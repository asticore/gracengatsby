import { describe, expect, it } from 'vitest'
import type { DocumentPanelInfo } from '@/admin/views/DocumentPanel'

describe('DocumentPanel Preview button', () => {
  const baseInfo: DocumentPanelInfo = {
    canCreate: true,
    canDelete: true,
    canPreview: false,
    collectionSlug: 'pages',
    draftsEnabled: true,
    id: 123,
    label: 'Page',
  }

  it('DocumentPanelInfo type includes canPreview field', () => {
    const info: DocumentPanelInfo = { ...baseInfo, canPreview: false }
    expect(info.canPreview).toBe(false)
  })

  it('canPreview can be set to true for pages', () => {
    const info: DocumentPanelInfo = { ...baseInfo, canPreview: true, collectionSlug: 'pages' }
    expect(info.canPreview).toBe(true)
    expect(info.collectionSlug).toBe('pages')
  })

  it('canPreview can be set to true for posts', () => {
    const info: DocumentPanelInfo = { ...baseInfo, canPreview: true, collectionSlug: 'posts' }
    expect(info.canPreview).toBe(true)
    expect(info.collectionSlug).toBe('posts')
  })

  it('canPreview is false when id is undefined', () => {
    const info: DocumentPanelInfo = { ...baseInfo, canPreview: false, id: undefined }
    expect(info.id).toBeUndefined()
    expect(info.canPreview).toBe(false)
  })
})
