import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { createElement as h } from 'react'
import { EditLockBanner } from '@/admin/views/EditLockBanner'

describe('EditLockBanner component', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({
      shouldAdvanceTime: true,
    })
    ;(global as any).fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ held: true }),
    })
    ;(global as any).navigator = {
      sendBeacon: vi.fn(),
    }
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('renders nothing and makes no fetch when id is undefined', () => {
    const onLockedByOther = vi.fn()
    const { container } = render(
      h(EditLockBanner, {
        collectionSlug: 'pages',
        id: undefined,
        onLockedByOther,
      })
    )
    expect(container.firstChild).toBeNull()
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('POSTs acquire action to /api/admin-edit-lock on mount with collection and id', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ held: true }),
    })
    const onLockedByOther = vi.fn()

    render(
      h(EditLockBanner, {
        collectionSlug: 'pages',
        id: 42,
        onLockedByOther,
      })
    )

    // Advance timers to let promises resolve
    await vi.runOnlyPendingTimersAsync()

    expect(global.fetch).toHaveBeenCalledWith('/api/admin-edit-lock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        collection: 'pages',
        id: 42,
        action: 'acquire',
      }),
    })
  })

  it('calls onLockedByOther(false) when response is {held:true}', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ held: true }),
    })
    const onLockedByOther = vi.fn()

    render(
      h(EditLockBanner, {
        collectionSlug: 'pages',
        id: 42,
        onLockedByOther,
      })
    )

    // Advance timers to let promises resolve
    await vi.runOnlyPendingTimersAsync()

    expect(onLockedByOther).toHaveBeenCalledWith(false)
  })

  it('sends heartbeat POST after advancing timers by 20s', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ held: true }),
    })

    const { unmount } = render(
      h(EditLockBanner, {
        collectionSlug: 'pages',
        id: 42,
      })
    )

    // Wait for acquire to complete
    await vi.runOnlyPendingTimersAsync()

    const initialCallCount = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.length
    expect(initialCallCount).toBeGreaterThan(0) // at least acquire

    // Advance 20 seconds
    vi.advanceTimersByTime(20000)
    await vi.runOnlyPendingTimersAsync()

    // Should have more calls now (heartbeat)
    const afterHeartbeatCount = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.length
    expect(afterHeartbeatCount).toBeGreaterThan(initialCallCount)

    // Last call should be heartbeat
    expect(global.fetch).toHaveBeenLastCalledWith('/api/admin-edit-lock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        collection: 'pages',
        id: 42,
        action: 'heartbeat',
      }),
    })

    unmount()
  })

  it('shows warning with correct label and calls onLockedByOther(true) when another user holds the lock', async () => {
    let callCount = 0
    ;(global.fetch as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      callCount++
      // First call is acquire, return locked by other
      if (callCount === 1) {
        return {
          ok: true,
          json: async () => ({
            held: false,
            by: { userId: 2, label: 'other@x.com' },
          }),
        }
      }
      // Block further calls to prevent heartbeat from firing
      return new Promise(() => {})
    })

    const onLockedByOther = vi.fn()

    const { container, unmount } = render(
      h(EditLockBanner, {
        collectionSlug: 'pages',
        id: 42,
        onLockedByOther,
      })
    )

    // Wait for acquire only
    await vi.runOnlyPendingTimersAsync()

    expect(onLockedByOther).toHaveBeenCalledWith(true)
    const text = container.textContent || ''
    // The banner should contain the user's label
    expect(text.includes('other@x.com')).toBe(true)

    unmount()
  })

  it('clicking Take over editing POSTs takeover and hides banner when response is {held:true}', async () => {
    let callCount = 0
    ;(global.fetch as ReturnType<typeof vi.fn>).mockImplementation(async (url, options) => {
      callCount++
      const body = JSON.parse(options?.body || '{}')

      // First call is acquire
      if (callCount === 1) {
        return {
          ok: true,
          json: async () => ({
            held: false,
            by: { userId: 2, label: 'other@x.com' },
          }),
        }
      }

      // Second call is takeover
      if (body.action === 'takeover') {
        return {
          ok: true,
          json: async () => ({ held: true }),
        }
      }

      // Block further calls
      return new Promise(() => {})
    })

    const onLockedByOther = vi.fn()
    const { container, queryByRole, unmount } = render(
      h(EditLockBanner, {
        collectionSlug: 'pages',
        id: 42,
        onLockedByOther,
      })
    )

    // Wait for acquire
    await vi.runOnlyPendingTimersAsync()

    const button = queryByRole('button', { name: /take over editing/i })
    expect(button).toBeTruthy()

    const { fireEvent } = await import('@testing-library/react')
    fireEvent.click(button!)

    // Wait for takeover call
    await vi.runOnlyPendingTimersAsync()

    // Should have called takeover
    const takeovers = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.filter((call) => {
      const body = JSON.parse(call[1]?.body || '{}')
      return body.action === 'takeover'
    })
    expect(takeovers.length).toBeGreaterThan(0)

    // Banner should disappear
    expect(container.querySelector('.edit-lock-banner')).toBeNull()

    unmount()
  })

  it('shows Taken over by message with Take back button after heartbeat returns {held:false, by}', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ held: true }),
    })

    const { container, queryByRole, unmount } = render(
      h(EditLockBanner, {
        collectionSlug: 'pages',
        id: 42,
      })
    )

    // Wait for acquire
    await vi.runOnlyPendingTimersAsync()

    // Mock the heartbeat to return held:false with a new user
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        held: false,
        by: { userId: 3, label: 'stolen@x.com' },
      }),
    })

    // Advance 20 seconds for heartbeat
    vi.advanceTimersByTime(20000)
    await vi.runOnlyPendingTimersAsync()

    const text = container.textContent || ''
    expect(text.includes('Taken over by')).toBe(true)
    expect(text.includes('stolen@x.com')).toBe(true)

    const takeBackButton = queryByRole('button', { name: /take back/i })
    expect(takeBackButton).toBeTruthy()

    unmount()
  })

  it('unmounting sends release via navigator.sendBeacon when available', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ held: true }),
    })

    const { unmount } = render(
      h(EditLockBanner, {
        collectionSlug: 'pages',
        id: 42,
      })
    )

    // Wait for acquire
    await vi.runOnlyPendingTimersAsync()

    unmount()

    expect(navigator.sendBeacon).toHaveBeenCalledWith(
      '/api/admin-edit-lock',
      expect.any(Blob)
    )
  })

  it('uses fetch keepalive fallback when navigator.sendBeacon is not available', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ held: true }),
    })

    // Remove sendBeacon
    ;(global.navigator as any) = { sendBeacon: undefined }

    const { unmount } = render(
      h(EditLockBanner, {
        collectionSlug: 'pages',
        id: 42,
      })
    )

    // Wait for acquire
    await vi.runOnlyPendingTimersAsync()

    unmount()

    // Should have called fetch with keepalive for release
    const releaseCalls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.filter(
      (call) =>
        call[0] === '/api/admin-edit-lock' &&
        call[1]?.body?.includes?.('release')
    )
    expect(releaseCalls.length).toBeGreaterThan(0)
  })

  it('fetch that rejects never throws and component keeps rendering', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('Network error')
    )

    const { container, unmount } = render(
      h(EditLockBanner, {
        collectionSlug: 'pages',
        id: 42,
      })
    )

    // Wait and should not throw
    await vi.runOnlyPendingTimersAsync()

    // Component should still be there (or null, but no crash)
    expect(container).toBeTruthy()

    unmount()
  })
})
