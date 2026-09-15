import { describe, expect, it } from 'vitest'

import {
  buildEngineCollectionEntries,
  buildEngineCollectionsMap,
  buildEngineConfig,
  buildEngineGlobalEntries,
  DEFAULT_ROUTES,
  DEFAULT_SERVER_URL,
  SHOP_PLUGIN_COLLECTION_ENTRIES,
} from '@/localapi/config'

describe('localapi/config - unit tests (mocked collection/global configs)', () => {
  describe('buildEngineCollectionEntries', () => {
    it('passes explicit labels through unchanged', () => {
      const [entry] = buildEngineCollectionEntries([{ slug: 'faqs', labels: { plural: 'FAQs', singular: 'FAQ' } }])
      expect(entry.labels).toEqual({ plural: 'FAQs', singular: 'FAQ' })
    })

    it('falls back to the real, hardcoded auto-label for events/media/users', () => {
      const entries = buildEngineCollectionEntries([{ slug: 'events' }, { slug: 'media' }, { slug: 'users' }])
      expect(entries.map((e) => e.labels)).toEqual([
        { plural: 'Events', singular: 'Event' },
        { plural: 'Media', singular: 'Media' },
        { plural: 'Users', singular: 'User' },
      ])
    })

    it('throws for an unknown label-less slug rather than silently falling back to the raw slug', () => {
      expect(() => buildEngineCollectionEntries([{ slug: 'widgets' }])).toThrow(/no auto-label fallback/)
    })

    it('passes admin.group through unchanged, including false', () => {
      const entries = buildEngineCollectionEntries([
        { slug: 'events', admin: { group: 'Content' } },
        { slug: 'media', admin: { group: false } },
        { slug: 'users' },
      ])
      expect(entries[0].admin?.group).toBe('Content')
      expect(entries[1].admin?.group).toBe(false)
      expect(entries[2].admin).toBeUndefined()
    })

    it('leaves auth undefined for a collection with no auth field', () => {
      const [entry] = buildEngineCollectionEntries([{ slug: 'faqs', labels: { plural: 'FAQs', singular: 'FAQ' } }])
      expect(entry.auth).toBeUndefined()
    })

    it('expands `auth: true` to the real, full sanitized shape with real Payload defaults', () => {
      const [entry] = buildEngineCollectionEntries([{ slug: 'users', auth: true }])
      expect(entry.auth).toEqual({
        cookies: { sameSite: 'Lax', secure: false },
        forgotPassword: {},
        lockTime: 600_000,
        loginWithUsername: false,
        maxLoginAttempts: 5,
        tokenExpiration: 7200,
        useSessions: true,
        verify: false,
        strategies: [],
      })
    })

    it('an explicit auth object overrides individual defaults but keeps the rest', () => {
      const [entry] = buildEngineCollectionEntries([{ slug: 'users', auth: { maxLoginAttempts: 3, verify: true } }])
      expect(entry.auth?.maxLoginAttempts).toBe(3)
      expect(entry.auth?.verify).toEqual({})
      expect(entry.auth?.lockTime).toBe(600_000)
      expect(entry.auth?.useSessions).toBe(true)
    })
  })

  describe('buildEngineGlobalEntries', () => {
    it('passes label through unchanged', () => {
      const [entry] = buildEngineGlobalEntries([{ slug: 'site-settings', label: 'General' }])
      expect(entry.label).toBe('General')
    })

    it('throws for a global with no label rather than guessing a fallback', () => {
      expect(() => buildEngineGlobalEntries([{ slug: 'mystery-settings' }])).toThrow(/declares no `label`/)
    })

    it('passes admin.group through unchanged', () => {
      const [entry] = buildEngineGlobalEntries([{ slug: 'site-settings', label: 'General', admin: { group: 'Settings' } }])
      expect(entry.admin?.group).toBe('Settings')
    })
  })

  describe('buildEngineCollectionsMap', () => {
    it('keys each entry by its own slug, wrapped in { config }', () => {
      const entries = buildEngineCollectionEntries([{ slug: 'users', auth: true }, { slug: 'faqs', labels: { plural: 'FAQs', singular: 'FAQ' } }])
      const map = buildEngineCollectionsMap(entries)
      expect(Object.keys(map)).toEqual(['users', 'faqs'])
      expect(map.users?.config.auth?.verify).toBe(false)
      expect(map.faqs?.config.auth).toBeUndefined()
    })
  })

  describe('buildEngineConfig', () => {
    it('applies the real default routes and serverURL when not overridden', () => {
      const config = buildEngineConfig({ collections: [], globals: [] })
      expect(config.routes).toEqual(DEFAULT_ROUTES)
      expect(config.serverURL).toBe(DEFAULT_SERVER_URL)
    })

    it('lets routes/serverURL be overridden', () => {
      const config = buildEngineConfig({ collections: [], globals: [], routes: { admin: '/my-admin' }, serverURL: 'https://example.com' })
      expect(config.routes).toEqual({ admin: '/my-admin', api: '/api' })
      expect(config.serverURL).toBe('https://example.com')
    })

    it('does not append the shop-plugin entries unless passed via extraCollections', () => {
      const config = buildEngineConfig({ collections: [{ slug: 'users', auth: true }], globals: [] })
      expect(config.collections).toHaveLength(1)
      const withShop = buildEngineConfig({ collections: [{ slug: 'users', auth: true }], globals: [], extraCollections: SHOP_PLUGIN_COLLECTION_ENTRIES })
      expect(withShop.collections).toHaveLength(6)
      expect(withShop.collections.slice(1)).toEqual(SHOP_PLUGIN_COLLECTION_ENTRIES)
    })
  })

  describe('SHOP_PLUGIN_COLLECTION_ENTRIES', () => {
    it('matches the real, English-translation-confirmed shape: 5 entries, Ecommerce group, plain-string labels, no auth', () => {
      expect(SHOP_PLUGIN_COLLECTION_ENTRIES.map((e) => e.slug)).toEqual(['products', 'carts', 'orders', 'transactions', 'addresses'])
      expect(SHOP_PLUGIN_COLLECTION_ENTRIES.map((e) => e.labels)).toEqual([
        { plural: 'Products', singular: 'Product' },
        { plural: 'Carts', singular: 'Cart' },
        { plural: 'Orders', singular: 'Order' },
        { plural: 'Transactions', singular: 'Transaction' },
        { plural: 'Addresses', singular: 'Address' },
      ])
      for (const entry of SHOP_PLUGIN_COLLECTION_ENTRIES) {
        expect(entry.admin?.group).toBe('Ecommerce')
        expect(entry.auth).toBeUndefined()
      }
    })
  })
})
