import { beforeEach, describe, expect, it, vi } from 'vitest'
import { notFound as notFoundOriginal } from 'next/navigation'

const { notFound } = vi.hoisted(() => ({
  notFound: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  notFound,
}))

const mockEngine = {
  findByID: vi.fn(),
}

vi.mock('@/lib/engine', () => ({
  getEngine: vi.fn(async () => mockEngine),
}))

import PreviewPage from '@/app/(frontend)/preview/[collection]/[id]/page'
import { signPreviewToken } from '@/utilities/previewToken'

describe('Preview page route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.ENGAGE_SECRET = 'test-secret-12345'
    notFound.mockImplementation(() => {
      throw new Error('notFound')
    })
  })

  it('calls notFound when token is missing', async () => {
    const result = PreviewPage({
      params: Promise.resolve({ collection: 'pages', id: '123' }),
      searchParams: Promise.resolve({}),
    })
    await expect(result).rejects.toThrow('notFound')
    expect(notFound).toHaveBeenCalled()
  })

  it('calls notFound when token is invalid', async () => {
    const result = PreviewPage({
      params: Promise.resolve({ collection: 'pages', id: '123' }),
      searchParams: Promise.resolve({ token: 'invalid.token' }),
    })
    await expect(result).rejects.toThrow('notFound')
    expect(notFound).toHaveBeenCalled()
  })

  it('calls notFound when token does not match collection', async () => {
    const token = await signPreviewToken({ collection: 'posts', id: 123 })
    const result = PreviewPage({
      params: Promise.resolve({ collection: 'pages', id: '123' }),
      searchParams: Promise.resolve({ token }),
    })
    await expect(result).rejects.toThrow('notFound')
    expect(notFound).toHaveBeenCalled()
  })

  it('calls notFound when token does not match id', async () => {
    const token = await signPreviewToken({ collection: 'pages', id: 123 })
    const result = PreviewPage({
      params: Promise.resolve({ collection: 'pages', id: '456' }),
      searchParams: Promise.resolve({ token }),
    })
    await expect(result).rejects.toThrow('notFound')
    expect(notFound).toHaveBeenCalled()
  })

  it('calls notFound when document is not found', async () => {
    const token = await signPreviewToken({ collection: 'pages', id: 123 })
    mockEngine.findByID.mockResolvedValue(null)

    const result = PreviewPage({
      params: Promise.resolve({ collection: 'pages', id: '123' }),
      searchParams: Promise.resolve({ token }),
    })
    await expect(result).rejects.toThrow('notFound')
    expect(notFound).toHaveBeenCalled()
  })

  it('calls notFound when engine.findByID throws', async () => {
    const token = await signPreviewToken({ collection: 'pages', id: 123 })
    mockEngine.findByID.mockRejectedValue(new Error('Database error'))

    const result = PreviewPage({
      params: Promise.resolve({ collection: 'pages', id: '123' }),
      searchParams: Promise.resolve({ token }),
    })
    await expect(result).rejects.toThrow('notFound')
    expect(notFound).toHaveBeenCalled()
  })

  it('reads draft version with overrideAccess true', async () => {
    const token = await signPreviewToken({ collection: 'pages', id: 123 })
    const mockDoc = { title: 'Test Page', blocks: [] as unknown[] }
    mockEngine.findByID.mockResolvedValue(mockDoc)

    const result = PreviewPage({
      params: Promise.resolve({ collection: 'pages', id: '123' }),
      searchParams: Promise.resolve({ token }),
    })

    try {
      await result
    } catch {
      // Component render might fail, that's ok - we're testing the API call
    }

    expect(mockEngine.findByID).toHaveBeenCalledWith({
      collection: 'pages',
      id: 123,
      draft: true,
      overrideAccess: true,
      depth: 2,
    })
  })

  it('renders page content when valid', async () => {
    const token = await signPreviewToken({ collection: 'pages', id: 123 })
    const mockDoc = {
      title: 'Test Page',
      blocks: [{ id: 'block1', type: 'text', text: 'Hello' }] as unknown[],
      _ancestors: [] as unknown[],
    }
    mockEngine.findByID.mockResolvedValue(mockDoc)

    const result = await PreviewPage({
      params: Promise.resolve({ collection: 'pages', id: '123' }),
      searchParams: Promise.resolve({ token }),
    })

    expect(result).toBeTruthy()
    expect(result?.props?.children).toBeTruthy()
    expect(notFound).not.toHaveBeenCalled()
  })

  it('renders post content when valid', async () => {
    const token = await signPreviewToken({ collection: 'posts', id: 456 })
    const mockDoc = {
      title: 'Test Post',
      blocks: [{ id: 'block1', type: 'text', text: 'Post content' }] as unknown[],
      content: '{}',
      featuredImage: { url: '/image.jpg', alt: 'Image' },
    }
    mockEngine.findByID.mockResolvedValue(mockDoc)

    const result = await PreviewPage({
      params: Promise.resolve({ collection: 'posts', id: '456' }),
      searchParams: Promise.resolve({ token }),
    })

    expect(result).toBeTruthy()
    expect(result?.props?.children).toBeTruthy()
    expect(notFound).not.toHaveBeenCalled()
  })

  it('calls notFound for unknown collection', async () => {
    const token = 'any.token'
    const result = PreviewPage({
      params: Promise.resolve({ collection: 'unknown', id: '123' }),
      searchParams: Promise.resolve({ token }),
    })
    await expect(result).rejects.toThrow('notFound')
  })
})
