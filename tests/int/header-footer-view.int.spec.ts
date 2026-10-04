import { describe, it, expect, beforeEach } from 'vitest'
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react'
import { createElement as h } from 'react'
import { HeaderFooterTabs } from '@/admin/views/HeaderFooterTabs'

const renderTabs = () =>
  render(
    h(HeaderFooterTabs, {
      header: h('input', { 'data-testid': 'header-input', defaultValue: '' }),
      footer: h('input', { 'data-testid': 'footer-input', defaultValue: '' }),
      headerLabel: 'Header',
      footerLabel: 'Footer',
    }),
  )

describe('HeaderFooterTabs', () => {
  beforeEach(() => {
    cleanup()
    window.location.hash = ''
  })

  it('renders both tabs and the page title', () => {
    renderTabs()
    expect(screen.getByRole('tab', { name: 'Header' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Footer' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Header and footer' })).toBeTruthy()
  })

  it('shows the header panel first and hides the footer panel', () => {
    renderTabs()
    expect(screen.getByRole('tab', { name: 'Header' }).getAttribute('aria-selected')).toBe('true')
    expect(document.getElementById('header-panel')?.hidden).toBe(false)
    expect(document.getElementById('footer-panel')?.hidden).toBe(true)
  })

  it('switches panels, keeps both mounted and keeps unsaved input', () => {
    renderTabs()
    fireEvent.change(screen.getByTestId('header-input'), { target: { value: 'typed' } })
    fireEvent.click(screen.getByRole('tab', { name: 'Footer' }))
    expect(document.getElementById('footer-panel')?.hidden).toBe(false)
    expect(document.getElementById('header-panel')?.hidden).toBe(true)
    expect((screen.getByTestId('header-input') as HTMLInputElement).value).toBe('typed')
    expect(screen.getByTestId('footer-input')).toBeTruthy()
  })

  it('remembers the tab in the URL hash', () => {
    renderTabs()
    fireEvent.click(screen.getByRole('tab', { name: 'Footer' }))
    expect(window.location.hash).toBe('#footer')
  })

  it('opens the footer tab when the hash says so', async () => {
    window.location.hash = '#footer'
    renderTabs()
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Footer' }).getAttribute('aria-selected')).toBe('true'))
  })

  it('links tabs to panels with aria attributes', () => {
    renderTabs()
    const tab = screen.getByRole('tab', { name: 'Footer' })
    expect(tab.getAttribute('aria-controls')).toBe('footer-panel')
    expect(document.getElementById('footer-panel')?.getAttribute('aria-labelledby')).toBe('footer-tab')
  })
})
