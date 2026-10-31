import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const headersMock = vi.hoisted(() => vi.fn())
vi.mock('next/headers', () => ({ headers: headersMock }))

import { storedLogo } from '@/features/email/designRender'
import { configuredSiteOrigin, originForHost, requestSiteOrigin } from '@/utilities/siteOrigin'

const ORIGINAL = process.env.SITE_URL

beforeEach(() => {
  delete process.env.SITE_URL
  headersMock.mockReset()
})

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.SITE_URL
  else process.env.SITE_URL = ORIGINAL
})

describe('site origin helper', () => {
  it('returns an empty origin when SITE_URL is unset', () => {
    expect(configuredSiteOrigin()).toBe('')
  })

  it('trims SITE_URL and drops trailing slashes', () => {
    process.env.SITE_URL = '  https://example.com/  '
    expect(configuredSiteOrigin()).toBe('https://example.com')
  })

  it('accepts only a plain host for the request origin', () => {
    expect(originForHost('shop.example.org')).toBe('https://shop.example.org')
    expect(originForHost('shop.example.org:8443')).toBe('https://shop.example.org:8443')
    expect(originForHost('evil.com/path')).toBe('')
    expect(originForHost('')).toBe('')
    expect(originForHost(null)).toBe('')
  })

  it('prefers SITE_URL over the request host', async () => {
    process.env.SITE_URL = 'https://configured.example'
    headersMock.mockResolvedValue(new Map([['host', 'other.example']]))
    expect(await requestSiteOrigin()).toBe('https://configured.example')
  })

  it('uses the request host when SITE_URL is unset', async () => {
    headersMock.mockResolvedValue(new Map([['host', 'new-install.example']]))
    expect(await requestSiteOrigin()).toBe('https://new-install.example')
  })

  it('fails soft outside a request scope', async () => {
    headersMock.mockRejectedValue(new Error('no request scope'))
    expect(await requestSiteOrigin()).toBe('')
  })

  it('leaves a root-relative logo relative when SITE_URL is unset', () => {
    const stored = { logo: { id: 7, url: '/media/logo.png' } }
    expect(storedLogo(stored)).toEqual({ id: 7, url: '' })
  })

  it('makes a root-relative logo absolute when SITE_URL is set', () => {
    process.env.SITE_URL = 'https://example.com'
    const stored = { logo: { id: 7, url: '/media/logo.png' } }
    expect(storedLogo(stored)).toEqual({ id: 7, url: 'https://example.com/media/logo.png' })
  })

  it('no source file falls back to a hard-coded production domain', () => {
    const offenders: string[] = []
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name)
        if (statSync(full).isDirectory()) walk(full)
        else if (/\.(ts|tsx)$/.test(name) && /gracengatsby\.com/.test(readFileSync(full, 'utf8'))) offenders.push(full)
      }
    }
    walk(join(process.cwd(), 'src'))
    expect(offenders).toEqual([])
  })
})
