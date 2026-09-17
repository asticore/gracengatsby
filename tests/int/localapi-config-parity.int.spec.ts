// @vitest-environment node
// See tests/int/cms-db-faqs.int.spec.ts for why: server-only suite (jsdom
// breaks wrangler's bundled esbuild), and @/engage.config must be the side
// entering the @/engine <-> @/engage.config circular import.
//
// Write-both-ways proof for src/localapi/config.ts: builds this app's own
// `.config`/`.collections` shape from the SAME 21 collection/17 global
// config objects `engage.config.ts` itself passes to `buildConfig()` (the
// exact same imports, same files), then compares the result field-by-field
// against a live, real `getEngine()`'s own sanitized `engine.config`/
// `engine.collections` - not a hand-written expectation, since a
// hand-written one could silently drift from what Payload's sanitizer
// actually does.
import '@/engage.config'

import { getRealEngine as getEngine } from './helpers/realEngine'
import { describe, expect, it } from 'vitest'

import { buildEngineCollectionEntries, buildEngineCollectionsMap, buildEngineConfig, buildEngineGlobalEntries, SHOP_PLUGIN_COLLECTION_ENTRIES } from '@/localapi/config'

// The exact same 21 collections, same imports, engage.config.ts itself uses.
import { Users } from '@/collections/Users'
import { Media } from '@/collections/Media'
import { Events } from '@/collections/Events'
import { EventRSVPs } from '@/collections/EventRSVPs'
import { Pages } from '@/collections/Pages'
import { PageTemplates } from '@/collections/PageTemplates'
import { Posts } from '@/collections/Posts'
import { Faqs } from '@/collections/Faqs'
import { FieldGroups } from '@/collections/FieldGroups'
import { AuditLog } from '@/features/security'
import { Forms, FormSubmissions } from '@/features/forms'
import { Backups } from '@/features/backups'
import { Translations } from '@/features/multilingual/translationsCollection'
import { MembershipTiers, Memberships } from '@/features/members'
import { Courses, Lessons, Enrolments, LessonProgress } from '@/features/courses'
import { ABTests } from '@/features/abTesting'

// The exact same 17 globals, same imports, engage.config.ts itself uses.
import { Header } from '@/globals/Header'
import { Footer } from '@/globals/Footer'
import { SiteSettings } from '@/globals/SiteSettings'
import { Integrations } from '@/globals/Integrations'
import { BlogSettings } from '@/globals/BlogSettings'
import { FaqSettings } from '@/globals/FaqSettings'
import { ShopSettings } from '@/globals/ShopSettings'
import { SeoSettings } from '@/globals/SeoSettings'
import { SpeedSettings } from '@/globals/SpeedSettings'
import { MediaSettings } from '@/globals/MediaSettings'
import { EmailSettings } from '@/globals/EmailSettings'
import { BackupSettings } from '@/globals/BackupSettings'
import { MemberSettings } from '@/globals/MemberSettings'
import { SecuritySettings } from '@/globals/SecuritySettings'
import { LanguageSettings } from '@/globals/LanguageSettings'
import { PaymentSettings } from '@/globals/PaymentSettings'
import { FormSettings } from '@/globals/FormSettings'

const APP_COLLECTIONS = [
  Users, Media, Events, EventRSVPs, Pages, PageTemplates, Posts, Faqs, FieldGroups,
  AuditLog, Forms, FormSubmissions, Backups, Translations, MembershipTiers, Memberships,
  Courses, Lessons, Enrolments, LessonProgress, ABTests,
] as unknown as Parameters<typeof buildEngineCollectionEntries>[0]

const APP_GLOBALS = [
  Header, Footer, SiteSettings, Integrations, BlogSettings, FaqSettings, ShopSettings,
  SeoSettings, SpeedSettings, MediaSettings, EmailSettings, BackupSettings, MemberSettings,
  SecuritySettings, LanguageSettings, PaymentSettings, FormSettings,
] as unknown as Parameters<typeof buildEngineGlobalEntries>[0]

describe('localapi/config parity - this module vs a live getEngine()', () => {
  it('routes and serverURL match real, sanitized Payload defaults', async () => {
    const engine = await getEngine()
    const ours = buildEngineConfig({ collections: [], globals: [] })
    expect(ours.routes.admin).toBe(engine.config.routes.admin)
    expect(ours.routes.api).toBe(engine.config.routes.api)
    expect(ours.serverURL).toBe(engine.config.serverURL)
  })

  it("every one of this app's own 21 collections matches real Payload's sanitized slug/admin.group/labels", async () => {
    const engine = await getEngine()
    const real = new Map((engine.config.collections as Array<{ slug: string; admin?: { group?: unknown }; labels?: { plural?: unknown; singular?: unknown } }>).map((c) => [c.slug, c]))
    const ours = buildEngineCollectionEntries(APP_COLLECTIONS)

    expect(ours).toHaveLength(21)
    for (const entry of ours) {
      const realEntry = real.get(entry.slug)
      expect(realEntry, `real engine.config.collections has no entry for "${entry.slug}"`).toBeDefined()
      expect(entry.admin?.group).toEqual(realEntry?.admin?.group)
      expect(entry.labels).toEqual(realEntry?.labels)
    }
  })

  it("the 5 shop-plugin thin-shape entries' labels resolve to the same text real Payload's own LabelFunctions produce", async () => {
    // The ecommerce plugin's real labels are i18n LabelFunctions
    // (`({t}) => t('plugin-ecommerce:products')`), not plain strings - see
    // src/localapi/config.ts's own header comment. Comparing the raw values
    // structurally would never match (function !== string) even when both
    // sides render identical text, so this resolves the real function with
    // the plugin's own confirmed English translations (from
    // `@payloadcms/plugin-ecommerce`'s `translations/languages/en.js`) and
    // compares the resulting STRING - the actual observable behavior
    // `resolveLabel` (src/components/admin/shared/resolveEntities.ts) cares
    // about.
    const EN_TRANSLATIONS: Record<string, string> = {
      'plugin-ecommerce:products': 'Products',
      'plugin-ecommerce:product': 'Product',
      'plugin-ecommerce:carts': 'Carts',
      'plugin-ecommerce:cart': 'Cart',
      'plugin-ecommerce:orders': 'Orders',
      'plugin-ecommerce:order': 'Order',
      'plugin-ecommerce:transactions': 'Transactions',
      'plugin-ecommerce:transaction': 'Transaction',
      'plugin-ecommerce:addresses': 'Addresses',
      'plugin-ecommerce:address': 'Address',
    }
    const t = (key: string): string => EN_TRANSLATIONS[key] ?? key
    const resolveText = (value: unknown): string =>
      typeof value === 'function' ? (value as (args: { t: (key: string) => string }) => string)({ t }) : (value as string)

    const engine = await getEngine()
    const real = new Map(
      (engine.config.collections as Array<{ slug: string; admin?: { group?: unknown }; labels?: { plural?: unknown; singular?: unknown }; auth?: unknown }>).map((c) => [c.slug, c]),
    )

    for (const entry of SHOP_PLUGIN_COLLECTION_ENTRIES) {
      const realEntry = real.get(entry.slug)
      expect(realEntry, `real engine.config.collections has no entry for "${entry.slug}"`).toBeDefined()
      expect(entry.admin?.group).toEqual(realEntry?.admin?.group)
      expect(resolveText(entry.labels.plural)).toBe(resolveText(realEntry?.labels?.plural))
      expect(resolveText(entry.labels.singular)).toBe(resolveText(realEntry?.labels?.singular))
      expect(realEntry?.auth).toBeFalsy()
    }
  })

  it("every one of this app's own 17 globals matches real Payload's sanitized slug/admin.group/label", async () => {
    const engine = await getEngine()
    const real = new Map((engine.config.globals as Array<{ slug: string; admin?: { group?: unknown }; label?: unknown }>).map((g) => [g.slug, g]))
    const ours = buildEngineGlobalEntries(APP_GLOBALS)

    expect(ours).toHaveLength(17)
    for (const entry of ours) {
      const realEntry = real.get(entry.slug)
      expect(realEntry, `real engine.config.globals has no entry for "${entry.slug}"`).toBeDefined()
      expect(entry.admin?.group).toEqual(realEntry?.admin?.group)
      expect(entry.label).toEqual(realEntry?.label)
    }
  })

  it("users' auth config matches real Payload's live sanitized auth-defaults object exactly", async () => {
    const engine = await getEngine()
    const realUsers = (engine.config.collections as Array<{ slug: string; auth?: unknown }>).find((c) => c.slug === 'users')
    const [ours] = buildEngineCollectionEntries([Users] as unknown as Parameters<typeof buildEngineCollectionEntries>[0])

    expect(realUsers?.auth).toBeTruthy()
    expect(ours.auth).toEqual(realUsers?.auth)
  })

  it('engine.collections.users.config.auth is the SAME object shape our buildEngineCollectionsMap produces', async () => {
    const engine = await getEngine()
    const realAuth = (engine.collections as unknown as Record<string, { config: { auth?: unknown } }>).users?.config.auth

    const entries = buildEngineCollectionEntries([Users] as unknown as Parameters<typeof buildEngineCollectionEntries>[0])
    const map = buildEngineCollectionsMap(entries)

    expect(map.users?.config.auth).toEqual(realAuth)
  })
})
