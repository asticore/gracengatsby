/**
 * The embed element's iframe only exists in the browser after the visitor accepts marketing cookies.
 * Server markup (checked in elements-wave48) holds the placeholder only; these tests cover the client side.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createElement as h } from 'react'

import { CONSENT_COOKIE_NAME, CONSENT_STORAGE_KEY, LEGACY_CONSENT_STORAGE_KEY, makeChoices } from '@/features/consent/consent'
import { resetConsentStoreForTests, saveConsent } from '@/features/consent/store'
import { WAVE48_COMPONENTS } from '@/components/blocks/elements/Wave48Elements'

const EmbedComponent = WAVE48_COMPONENTS.embed!

const youtube = (extra: Record<string, unknown> = {}) =>
  h(EmbedComponent, { provider: 'youtube', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', title: 'Clip', ...extra })

describe('embed consent gate (browser)', () => {
  beforeEach(() => {
    resetConsentStoreForTests()
    document.cookie = `${CONSENT_COOKIE_NAME}=; Max-Age=0; Path=/`
    window.localStorage.clear()
    window.localStorage.removeItem(LEGACY_CONSENT_STORAGE_KEY)
  })

  afterEach(() => {
    cleanup()
    resetConsentStoreForTests()
    window.localStorage.removeItem(CONSENT_STORAGE_KEY)
  })

  it('shows the placeholder with the provider name and no iframe until marketing is accepted', () => {
    const { container } = render(youtube())
    expect(container.querySelector('iframe')).toBeNull()
    expect(screen.getByText(/YouTube embed/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Accept and load' })).toBeTruthy()
  })

  it('creates the iframe with the no-cookie source, sandbox and lazy loading after Accept and load', () => {
    const { container } = render(youtube())
    fireEvent.click(screen.getByRole('button', { name: 'Accept and load' }))
    const frame = container.querySelector('iframe')
    expect(frame).not.toBeNull()
    expect(frame!.getAttribute('src')).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ')
    expect(frame!.getAttribute('loading')).toBe('lazy')
    expect(frame!.getAttribute('sandbox')).toContain('allow-scripts')
    expect(frame!.getAttribute('title')).toBe('Clip')
  })

  it('renders the iframe straight away when marketing was already accepted', () => {
    saveConsent(makeChoices({ marketing: true }))
    const { container } = render(youtube())
    expect(container.querySelector('iframe')).not.toBeNull()
    expect(screen.queryByRole('button', { name: 'Accept and load' })).toBeNull()
  })

  it('Load once shows the iframe for this view without saving a choice', () => {
    const { container } = render(youtube())
    fireEvent.click(screen.getByRole('button', { name: 'Load once' }))
    expect(container.querySelector('iframe')).not.toBeNull()
    expect(window.localStorage.getItem(CONSENT_STORAGE_KEY)).toBeNull()
  })

  it('keeps an escaped title as plain text on the iframe', () => {
    saveConsent(makeChoices({ marketing: true }))
    const { container } = render(youtube({ title: '"><script>x</script>' }))
    expect(container.querySelector('script')).toBeNull()
    expect(container.querySelector('iframe')!.getAttribute('title')).toBe('"><script>x</script>')
  })
})
