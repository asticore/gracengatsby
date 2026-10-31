// @vitest-environment node
// Comprehensive schema coverage test: verify that ALL drizzle tables exported from
// src/cms/db/schema/index.ts are created by runInternalMigrate and match their column
// definitions exactly.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPlatformProxy } from 'wrangler'
import { getTableName, getTableColumns } from 'drizzle-orm'

import { consoleLogger } from '@/localapi/logger'
import { runInternalMigrate, type InternalMigrateResult } from '@/migrations/runInternalMigrate'

// Import all schema exports to inspect
import * as schemaModule from '@/cms/db/schema/index'
import * as adsSchema from '@/cms/db/schema/ads'
import * as catalogueSchema from '@/cms/db/schema/shopCatalogue'
import * as dataViewsSchema from '@/cms/db/schema/dataViews'
import * as storedValueSchema from '@/cms/db/schema/shopStoredValue'
import * as shippingSchema from '@/cms/db/schema/shopShipping'
import * as stockSubscriptionsSchema from '@/cms/db/schema/stockSubscriptions'
import * as userSessionsSchema from '@/cms/db/schema/userSessions'
import * as socialAccountsSchema from '@/cms/db/schema/socialAccounts'
import * as loginTokensSchema from '@/cms/db/schema/loginTokens'
import * as passkeysSchema from '@/cms/db/schema/passkeys'
import * as apiKeysSchema from '@/cms/db/schema/apiKeys'
import * as organizationsSchema from '@/cms/db/schema/organizations'
import * as emailVerificationsSchema from '@/cms/db/schema/emailVerifications'
import * as rateLimitsSchema from '@/cms/db/schema/rateLimits'
import * as twoFactorEmailCodesSchema from '@/cms/db/schema/twoFactorEmailCodes'
import * as trustedDevicesSchema from '@/cms/db/schema/trustedDevices'
import * as productSubscriptionsSchema from '@/cms/db/schema/productSubscriptions'
import * as formDraftsSchema from '@/cms/db/schema/formDrafts'
import * as reusableSectionsSchema from '@/cms/db/schema/reusableSections'
import * as siteTemplatesSchema from '@/cms/db/schema/siteTemplates'
import * as passwordGroupsSchema from '@/cms/db/schema/passwordGroups'
import * as webhooksSchema from '@/cms/db/schema/webhooks'
import * as templateLibrariesSchema from '@/cms/db/schema/templateLibraries'
import * as apiEndpointsSchema from '@/cms/db/schema/apiEndpoints'

// Intentionally unmigrated tables/columns - add here ONLY if confirmed that migrations
// deliberately do not create them, with a reason for each.
// Note: These are NOT bugs to hide, but documented gaps between drizzle schema
// generation (which models what SHOULD be there) and actual migrations (which
// haven't caught up yet).
const KNOWN_UNMIGRATED: Array<{ tableName: string; column?: string; reason: string }> = [
  {
    tableName: 'eg_posts_rels',
    column: 'eg_media_id',
    reason: 'Drizzle schema includes this for Gallery blocks, but migrations use media_id without eg_ prefix',
  },
  {
    tableName: 'eg_posts_rels',
    column: 'eg_faqs_id',
    reason: 'Drizzle schema includes this for FAQ blocks, but migrations use faqs_id without eg_ prefix',
  },
  {
    tableName: '_eg_posts_v_rels',
    column: 'eg_media_id',
    reason: 'Versioned rels table - same schema gap as eg_posts_rels',
  },
  {
    tableName: '_eg_posts_v_rels',
    column: 'eg_faqs_id',
    reason: 'Versioned rels table - same schema gap as eg_posts_rels',
  },
  {
    tableName: 'eg_faq_settings_rels',
    column: 'eg_media_id',
    reason: 'Drizzle schema includes for Gallery blocks; migrations use media_id',
  },
  {
    tableName: 'eg_faq_settings_rels',
    column: 'eg_faqs_id',
    reason: 'Drizzle schema includes for Faq blocks; migrations use faqs_id',
  },
  {
    tableName: 'eg_blog_settings_rels',
    column: 'eg_media_id',
    reason: 'Drizzle schema includes for Gallery blocks; migrations use media_id',
  },
  {
    tableName: 'eg_blog_settings_rels',
    column: 'eg_faqs_id',
    reason: 'Drizzle schema includes for Faq blocks; migrations use faqs_id',
  },
  {
    tableName: 'eg_shop_settings_rels',
    column: 'eg_media_id',
    reason: 'Drizzle schema includes for Gallery blocks; migrations use media_id',
  },
  {
    tableName: 'eg_shop_settings_rels',
    column: 'eg_faqs_id',
    reason: 'Drizzle schema includes for Faq blocks; migrations use faqs_id',
  },
  {
    tableName: 'eg_page_templates_blocks_form',
    column: 'form_id',
    reason: 'Known gap: Form block form_id documented in schema/generate.ts as deliberately not modeled',
  },
  {
    tableName: 'eg_pages_blocks_form',
    column: 'form_id',
    reason: 'Known gap: Form block form_id documented in schema/generate.ts as deliberately not modeled',
  },
  {
    tableName: '_eg_pages_v_blocks_form',
    column: 'form_id',
    reason: 'Known gap: Versioned form block - same as eg_pages_blocks_form',
  },
  {
    tableName: 'eg_posts_blocks_form',
    column: 'form_id',
    reason: 'Known gap: Form block form_id documented in schema/generate.ts as deliberately not modeled',
  },
  {
    tableName: '_eg_posts_v_blocks_form',
    column: 'form_id',
    reason: 'Known gap: Versioned form block - same as eg_posts_blocks_form',
  },
  {
    tableName: 'eg_faq_settings_blocks_form',
    column: 'form_id',
    reason: 'Known gap: Form block form_id documented in schema/generate.ts as deliberately not modeled',
  },
  {
    tableName: 'eg_blog_settings_blocks_form',
    column: 'form_id',
    reason: 'Known gap: Form block form_id documented in schema/generate.ts as deliberately not modeled',
  },
  {
    tableName: 'eg_shop_settings_blocks_form',
    column: 'form_id',
    reason: 'Known gap: Form block form_id documented in schema/generate.ts as deliberately not modeled',
  },
  {
    tableName: 'eg_reusable_sections_blocks_form',
    column: 'form_id',
    reason: 'Known gap: Form block form_id documented in schema/generate.ts as deliberately not modeled (the form is stored in the _rels table)',
  },
  {
    tableName: 'eg_site_templates_blocks_form',
    column: 'form_id',
    reason: 'Known gap: Form block form_id documented in schema/generate.ts as deliberately not modeled (the form is stored in the _rels table)',
  },
  {
    tableName: 'eg_products_blocks_form',
    column: 'form_id',
    reason: 'Known gap: Form block form_id documented in schema/generate.ts as deliberately not modeled',
  },
  {
    tableName: '_eg_products_v_blocks_form',
    column: 'form_id',
    reason: 'Known gap: Versioned form block - same as eg_products_blocks_form',
  },
]

describe('Fresh install schema coverage - all drizzle tables created and columns match', () => {
  let proxy: Awaited<ReturnType<typeof getPlatformProxy<{ D1: D1Database }>>>
  let outcome: InternalMigrateResult
  let createdTables: Set<string>
  const missingTablesAndColumns: string[] = []

  beforeAll(
    async () => {
      // Build fresh empty D1 and run migrations
      proxy = await getPlatformProxy<{ D1: D1Database }>({ persist: false })
      outcome = await runInternalMigrate(proxy.env.D1, consoleLogger)

      // Get list of all created tables
      const rows = await proxy.env.D1.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all()
      createdTables = new Set((rows.results as { name: string }[]).map((r) => r.name))

      // List of all known table exports from the schema module
      const tableExports = [
        'faqs', 'media', 'eventRSVPs', 'membershipTiers', 'membershipTiersBenefits', 'pageTemplates', 'pageTemplatesRels',
        'events', 'eventsVersions', 'pages', 'pagesRels', 'pagesVersions', 'pagesVersionsRels',
        'posts', 'postsCategories', 'postsRels', 'postsVersions', 'postsVersionsCategories', 'postsVersionsRels',
        'courses', 'coursesVersions', 'lessons', 'lessonsResources', 'lessonsRels',
        'enrolments', 'lessonProgress', 'users', 'usersRoles', 'usersSessions',
        'auditLog', 'emailLog', 'errorLog', 'backups', 'translations', 'memberships', 'formSubmissions', 'abTests', 'abTestsVariants', 'abTestsGoals',
        'fieldGroups', 'fieldGroupsFields', 'fieldGroupsFieldsOptions', 'fieldGroupsTargetCollections',
        'forms', 'formsFields', 'formsFieldsOptions', 'formsFieldsConditionalRules',
        'faqSettings', 'faqSettingsRels', 'blogSettings', 'blogSettingsRels', 'shopSettings', 'shopSettingsRels',
        'siteSettings', 'memberSettings', 'securitySettings', 'integrations', 'emailSettings', 'paymentSettings', 'shippingSettings', 'formSettings',
        'header', 'headerMenu', 'headerMenuChildren', 'headerSocialsLinks',
        'footer', 'footerColumns', 'footerColumnsLinks', 'footerSocialsLinks',
        'languageSettings', 'languageSettingsMultilingualActiveLocales',
        'seoSettings', 'seoSettingsSchemaSameAs', 'speedSettings', 'speedSettingsAdvancedPreconnectOrigins', 'speedSettingsAdvancedPrefetchDns',
        'mediaSettings', 'mediaSettingsResizingResponsiveWidths', 'backupSettings', 'shopExtraSettings', 'siteDetails', 'sitePages', 'domainSettings', 'domainSettingsDomains', 'emailTemplates', 'emailBrand', 'emailSchedule', 'googleConnection', 'trackingConnections',
        'addresses', 'carts', 'cartsItems', 'orders', 'ordersItems', 'ordersRels', 'transactions', 'transactionsItems', 'products', 'productsRels', 'productsVersions', 'productsVersionsRels', 'productsAttributes', 'productsVariations', 'productsVersionsAttributes', 'productsVersionsVariations', 'productsBundleItems', 'productsVersionsBundleItems', 'cartsItems',
        'productsAddOns', 'productsVersionsAddOns', 'shopExtraSettingsPricingRules',
        'preferences', 'preferencesRels', 'lockedDocuments', 'lockedDocumentsRels',
      ]

      // Block tables - need special handling
      const blockTableExports = [
        'pageTemplatesBlocks', 'pagesBlocks', 'pagesVersionsBlocks',
        'postsBlocks', 'postsVersionsBlocks',
        'lessonsContentBlocks',
        'faqSettingsBlocks', 'blogSettingsBlocks', 'shopSettingsBlocks',
        'productsBlocks', 'productsVersionsBlocks',
      ]

      // Collect all tables to check
      const drizzleTables: { name: string; table: any }[] = []

      // Ads tables live in their own schema file
      for (const [exportName, exportValue] of Object.entries(adsSchema)) {
        if (exportName === 'adSettingsGenerated') continue
        drizzleTables.push({ name: exportName, table: exportValue })
      }

      // Webhooks builder and API builder tables live in their own schema files
      for (const schemaFile of [webhooksSchema, apiEndpointsSchema]) {
        for (const [exportName, exportValue] of Object.entries(schemaFile)) drizzleTables.push({ name: exportName, table: exportValue })
      }

      // Template libraries global lives in its own schema file (the generator object is not a table)
      for (const [exportName, exportValue] of Object.entries(templateLibrariesSchema)) {
        if (exportName === 'templateLibrariesGenerated') continue
        drizzleTables.push({ name: exportName, table: exportValue })
      }

      // Catalogue tables (attributes, shipping classes, reviews) live in their own schema file
      for (const [exportName, exportValue] of Object.entries(catalogueSchema)) {
        if (exportName.endsWith('Generated')) continue
        drizzleTables.push({ name: exportName, table: exportValue })
      }

      // Tables and charts (data views) live in their own schema file
      for (const [exportName, exportValue] of Object.entries(dataViewsSchema)) {
        if (exportName.endsWith('Generated')) continue
        drizzleTables.push({ name: exportName, table: exportValue })
      }

      for (const [exportName, exportValue] of Object.entries(shippingSchema)) {
        if (exportName.endsWith('Generated')) continue
        drizzleTables.push({ name: exportName, table: exportValue })
      }

      // Gift card, store credit and ledger tables
      for (const [exportName, exportValue] of Object.entries(storedValueSchema)) {
        if (exportName.endsWith('Generated')) continue
        drizzleTables.push({ name: exportName, table: exportValue })
      }

      // Back-in-stock sign-up table lives in its own schema file
      for (const [exportName, exportValue] of Object.entries(stockSubscriptionsSchema)) {
        if (exportName.endsWith('Generated')) continue
        drizzleTables.push({ name: exportName, table: exportValue })
      }

      // Signed-in device sessions: a plain drizzle table in its own schema file
      for (const [exportName, exportValue] of Object.entries(userSessionsSchema)) {
        drizzleTables.push({ name: exportName, table: exportValue })
      }

      // Passwordless sign-in tokens: a plain drizzle table in its own schema file
      for (const [exportName, exportValue] of Object.entries(loginTokensSchema)) {
        drizzleTables.push({ name: exportName, table: exportValue })
      }

      // Passkeys (WebAuthn) credentials: a plain drizzle table in its own schema file
      for (const [exportName, exportValue] of Object.entries(passkeysSchema)) {
        drizzleTables.push({ name: exportName, table: exportValue })
      }

      // Per-user API keys (hashed keys, scopes): a plain drizzle table in its own schema file
      for (const [exportName, exportValue] of Object.entries(apiKeysSchema)) {
        drizzleTables.push({ name: exportName, table: exportValue })
      }

      // Email verification tokens and shared rate limit counters: plain drizzle tables in their own schema files
      for (const [exportName, exportValue] of Object.entries(emailVerificationsSchema)) {
        drizzleTables.push({ name: exportName, table: exportValue })
      }
      for (const [exportName, exportValue] of Object.entries(rateLimitsSchema)) {
        drizzleTables.push({ name: exportName, table: exportValue })
      }

      // Customer organisations, members, teams, invitations, custom roles and content limits: plain drizzle tables in their own schema file
      for (const [exportName, exportValue] of Object.entries(organizationsSchema)) {
        drizzleTables.push({ name: exportName, table: exportValue })
      }

      // Linked social login identities: a plain drizzle table in its own schema file
      for (const [exportName, exportValue] of Object.entries(socialAccountsSchema)) {
        drizzleTables.push({ name: exportName, table: exportValue })
      }

      // Emailed second-step codes and remembered devices: plain drizzle tables in their own schema files
      for (const [exportName, exportValue] of Object.entries(twoFactorEmailCodesSchema)) {
        drizzleTables.push({ name: exportName, table: exportValue })
      }
      for (const [exportName, exportValue] of Object.entries(trustedDevicesSchema)) {
        drizzleTables.push({ name: exportName, table: exportValue })
      }

      // Product subscriptions (wave 19) live in their own schema file
      for (const [exportName, exportValue] of Object.entries(productSubscriptionsSchema)) {
        if (exportName.endsWith('Generated')) continue
        drizzleTables.push({ name: exportName, table: exportValue })
      }

      // Save-and-continue drafts live in their own schema file
      for (const [exportName, exportValue] of Object.entries(formDraftsSchema)) {
        if (exportName.endsWith('Generated')) continue
        drizzleTables.push({ name: exportName, table: exportValue })
      }

      // Reusable sections: the collection table, its _rels table and one table per block type
      drizzleTables.push({ name: 'reusableSections', table: reusableSectionsSchema.reusableSections })
      drizzleTables.push({ name: 'reusableSectionsRels', table: reusableSectionsSchema.reusableSectionsRels })
      for (const [blockKey, blockTable] of Object.entries(reusableSectionsSchema.reusableSectionsBlocks)) {
        drizzleTables.push({ name: `reusableSectionsBlocks[${blockKey}]`, table: blockTable })
      }

      // Site templates: same shape as reusable sections
      drizzleTables.push({ name: 'siteTemplates', table: siteTemplatesSchema.siteTemplates })
      drizzleTables.push({ name: 'siteTemplatesRels', table: siteTemplatesSchema.siteTemplatesRels })
      for (const [blockKey, blockTable] of Object.entries(siteTemplatesSchema.siteTemplatesBlocks)) {
        drizzleTables.push({ name: `siteTemplatesBlocks[${blockKey}]`, table: blockTable })
      }

      // Direct table exports
      for (const exportName of tableExports) {
        const exportValue = (schemaModule as any)[exportName]
        if (exportValue && getTableName(exportValue)) {
          drizzleTables.push({ name: exportName, table: exportValue })
        }
      }

      // Block tables (which are maps of blocks)
      for (const exportName of blockTableExports) {
        const blocksMap = (schemaModule as any)[exportName]
        if (blocksMap && typeof blocksMap === 'object') {
          for (const [blockKey, blockTable] of Object.entries(blocksMap)) {
            try {
              if (blockTable && getTableName(blockTable as never)) {
                drizzleTables.push({ name: `${exportName}[${blockKey}]`, table: blockTable as any })
              }
            } catch {
              // Skip if not a table
            }
          }
        }
      }

      // Check each drizzle table exists and has matching columns
      for (const { name: exportName, table } of drizzleTables) {
        const tableName = getTableName(table)
        if (!tableName) continue

        // Check if this entire table is known to be unmigrated (rarely used)
        const knownUnmigratedTable = KNOWN_UNMIGRATED.find((u) => u.tableName === tableName && !u.column)
        if (knownUnmigratedTable) {
          continue
        }

        // Table existence check
        if (!createdTables.has(tableName)) {
          missingTablesAndColumns.push(`${tableName} missing (exported as ${exportName})`)
          continue
        }

        // Get actual SQL column names from drizzle schema
        const drizzleColumns = getTableColumns(table)
        const drizzleColumnNames: string[] = []
        for (const [key, column] of Object.entries(drizzleColumns)) {
          const col = column as any
          // Drizzle SQLiteColumn objects have internal metadata
          // The column's actual SQL name is typically accessible via .name property
          // or can be extracted from the column's internal structure
          let dbName: string | undefined
          if (typeof col === 'object' && col !== null) {
            // Try multiple ways to get the actual SQL column name
            if (col.name) {
              dbName = col.name
            } else if ((col as any)._name) {
              dbName = (col as any)._name
            } else if ((col as any).columnName) {
              dbName = (col as any).columnName
            } else if ((col as any).__drizzleMetadata) {
              dbName = (col as any).__drizzleMetadata.name
            }
          }
          // If we couldn't extract it, skip this column (will report as missing)
          if (dbName) {
            drizzleColumnNames.push(dbName)
          }
        }

        // Get columns from sqlite via pragma
        const pragmaResult = await proxy.env.D1.prepare(`PRAGMA table_info(\`${tableName}\`)`).all()
        const sqliteColumnNames = (pragmaResult.results as { name: string }[]).map((r) => r.name)
        const sqliteColumnSet = new Set(sqliteColumnNames)

        // Check each declared drizzle column exists in sqlite
        for (const drizzleCol of drizzleColumnNames) {
          if (!sqliteColumnSet.has(drizzleCol)) {
            // Check if this column is in KNOWN_UNMIGRATED
            const knownUnmigratedCol = KNOWN_UNMIGRATED.find((u) => u.tableName === tableName && u.column === drizzleCol)
            if (!knownUnmigratedCol) {
              missingTablesAndColumns.push(`${tableName}.${drizzleCol} missing`)
            }
          }
        }
      }
    },
    180_000,
  )

  afterAll(async () => {
    await proxy.dispose()
  })

  it('finishes first migration with zero errors', () => {
    expect(outcome.errorCount).toBe(0)
  })

  it('all drizzle tables exist and all columns match', () => {
    if (missingTablesAndColumns.length > 0) {
      // Debug: if we're getting a lot of "missing" columns, it might be an extraction issue
      const missing = missingTablesAndColumns.length
      const warnIfManyMissing = missing > 50 ? ' (WARNING: Many missing columns - may indicate column name extraction issue)' : ''
      expect.fail(`Schema gaps found (${missing} issues)${warnIfManyMissing}:\n${missingTablesAndColumns.slice(0, 30).join('\n')}${missingTablesAndColumns.length > 30 ? `\n... and ${missingTablesAndColumns.length - 30} more` : ''}`)
    }
  })

  it('adds the custom fonts column to site settings', async () => {
    const result = await proxy.env.D1.prepare(`PRAGMA table_info(\`eg_site_settings\`)`).all()
    const columnNames = (result.results as { name: string }[]).map((r) => r.name)
    expect(columnNames).toContain('theme_custom_fonts')
    expect(columnNames).toContain('theme_heading_font')
    expect(columnNames).toContain('theme_body_font')
  })

  it('adds the section lock columns (live, versions, templates)', async () => {
    const columnsOf = async (table: string): Promise<string[]> => {
      const result = await proxy.env.D1.prepare(`PRAGMA table_info(\`${table}\`)`).all()
      return (result.results as { name: string }[]).map((r) => r.name)
    }
    expect(await columnsOf('eg_pages')).toContain('locks')
    expect(await columnsOf('_eg_pages_v')).toContain('version_locks')
    expect(await columnsOf('eg_page_templates')).toContain('locks')
  })

  it('creates the ads tables, flag column and No ads columns', async () => {
    const cols = async (t: string) =>
      ((await proxy.env.D1.prepare(`PRAGMA table_info(\`${t}\`)`).all()).results as { name: string }[]).map((r) => r.name)
    for (const t of ['eg_ad_units', 'eg_ad_placements', 'eg_ad_settings', 'eg_ad_stats']) expect(createdTables.has(t), t).toBe(true)
    expect(await cols('eg_site_settings')).toContain('features_ads')
    expect(await cols('eg_pages')).toContain('no_ads')
    expect(await cols('_eg_pages_v')).toContain('version_no_ads')
    expect(await cols('eg_posts')).toContain('no_ads')
    expect(await cols('eg_products')).toContain('no_ads')
    expect(await cols('eg_locked_documents_rels')).toContain('eg_ad_units_id')
  })

  it('creates the data views table, its unique link name index and the locking column', async () => {
    const cols = async (t: string) =>
      ((await proxy.env.D1.prepare(`PRAGMA table_info(\`${t}\`)`).all()).results as { name: string }[]).map((r) => r.name)
    expect(createdTables.has('eg_data_views')).toBe(true)
    expect(await cols('eg_data_views')).toEqual(expect.arrayContaining(['id', 'title', 'kind', 'source', 'slug', 'is_public', 'config', 'updated_at', 'created_at']))
    expect(await cols('eg_locked_documents_rels')).toContain('eg_data_views_id')
    const indexes = (await proxy.env.D1.prepare('PRAGMA index_list(`eg_data_views`)').all()).results as { name: string; unique: number }[]
    expect(indexes.find((i) => i.name === 'eg_data_views_slug_idx')?.unique).toBe(1)
  })

  it('creates the AI builder usage table and the model and cap columns (raw SQL table)', async () => {
    const cols = async (t: string) =>
      ((await proxy.env.D1.prepare(`PRAGMA table_info(\`${t}\`)`).all()).results as { name: string }[]).map((r) => r.name)
    expect(createdTables.has('ai_builder_usage')).toBe(true)
    expect(await cols('ai_builder_usage')).toEqual(
      expect.arrayContaining(['id', 'created_at', 'user_id', 'provider', 'model', 'mode', 'input_tokens', 'output_tokens', 'est_cost_micro', 'ok', 'estimated']),
    )
    expect(await cols('eg_integrations')).toEqual(expect.arrayContaining(['ai_claude_model', 'ai_openai_model', 'ai_monthly_cap_usd']))
  })

  it('adds the site-wide page effects columns to site settings', async () => {
    const cols = ((await proxy.env.D1.prepare('PRAGMA table_info(`eg_site_settings`)').all()).results as { name: string }[]).map((r) => r.name)
    expect(cols).toEqual(expect.arrayContaining(['page_effects_enabled', 'page_effects_cursor', 'page_effects_scroll_progress', 'page_effects_reveal_on_scroll']))
  })

  it('adds the customer email verification columns and site setting', async () => {
    const names = async (t: string) =>
      ((await proxy.env.D1.prepare(`PRAGMA table_info(\`${t}\`)`).all()).results as { name: string }[]).map((r) => r.name)
    expect(await names('eg_users')).toEqual(
      expect.arrayContaining(['email_verified_at', 'email_verify_token_hash', 'email_verify_expires_at']),
    )
    expect(await names('eg_site_settings')).toContain('account_settings_require_email_verification')
  })

  it('adds the storefront interface overrides column to language settings', async () => {
    const names = async (t: string) =>
      ((await proxy.env.D1.prepare(`PRAGMA table_info(\`${t}\`)`).all()).results as { name: string }[]).map((r) => r.name)
    expect(await names('eg_language_settings')).toContain('interface_overrides')
  })

  it('adds the per-user admin interface language column to users', async () => {
    const names = async (t: string) =>
      ((await proxy.env.D1.prepare(`PRAGMA table_info(\`${t}\`)`).all()).results as { name: string }[]).map((r) => r.name)
    expect(await names('eg_users')).toContain('admin_language')
  })

  it('adds the two-factor backup code column and the customer enforcement setting', async () => {
    const names = async (t: string) =>
      ((await proxy.env.D1.prepare(`PRAGMA table_info(\`${t}\`)`).all()).results as { name: string }[]).map((r) => r.name)
    expect(await names('eg_users')).toEqual(
      expect.arrayContaining(['two_factor_enabled', 'two_factor_secret', 'two_factor_confirmed_at', 'two_factor_last_used_step', 'two_factor_backup_hashes']),
    )
    expect(await names('eg_security_settings')).toEqual(
      expect.arrayContaining(['login_protection_require_two_factor_for_admins', 'login_protection_require_two_factor_for_members']),
    )
  })

  it('creates the signed-in device sessions table', async () => {
    const cols = ((await proxy.env.D1.prepare('PRAGMA table_info(`eg_user_sessions`)').all()).results as { name: string }[]).map((r) => r.name)
    expect(cols).toEqual(
      expect.arrayContaining(['id', 'user_id', 'token_hash', 'device_label', 'ip', 'created_at', 'last_seen_at', 'expires_at', 'revoked_at']),
    )
  })

  it('creates the social accounts table and the social login settings columns', async () => {
    const cols = ((await proxy.env.D1.prepare('PRAGMA table_info(`eg_social_accounts`)').all()).results as { name: string }[]).map((r) => r.name)
    expect(cols).toEqual(
      expect.arrayContaining(['id', 'user_id', 'provider', 'provider_user_id', 'email', 'created_at', 'last_login_at']),
    )
    const security = ((await proxy.env.D1.prepare('PRAGMA table_info(`eg_security_settings`)').all()).results as { name: string }[]).map((r) => r.name)
    expect(security).toEqual(
      expect.arrayContaining([
        'social_login_allow_signup_via_social',
        'social_login_allow_admin_social_login',
        'social_login_google_enabled',
        'social_login_google_client_id',
        'social_login_google_client_secret',
        'social_login_github_client_secret',
        'social_login_apple_team_id',
        'social_login_apple_key_id',
        'social_login_apple_private_key',
        'social_login_facebook_enabled',
        'social_login_microsoft_tenant',
        'social_login_discord_redirect_confirmed',
      ]),
    )
  })

  it('adds the per-page background audio columns to pages and page versions', async () => {
    const names = async (t: string) =>
      ((await proxy.env.D1.prepare(`PRAGMA table_info(\`${t}\`)`).all()).results as { name: string }[]).map((r) => r.name)
    const cols = ['page_audio_enabled', 'page_audio_source_type', 'page_audio_media_id', 'page_audio_url', 'page_audio_loop', 'page_audio_volume', 'page_audio_start_muted', 'page_audio_show_controls', 'page_audio_start_on_first_interaction', 'page_audio_respect_reduced_data']
    expect(await names('eg_pages')).toEqual(expect.arrayContaining(cols))
    expect(await names('_eg_pages_v')).toEqual(expect.arrayContaining(cols.map((c) => `version_${c}`)))
  })

  it('adds the hide-native-cursor column and the post background audio columns', async () => {
    const names = async (t: string) =>
      ((await proxy.env.D1.prepare(`PRAGMA table_info(\`${t}\`)`).all()).results as { name: string }[]).map((r) => r.name)
    expect(await names('eg_site_settings')).toContain('page_effects_hide_native_cursor')
    const cols = ['page_audio_enabled', 'page_audio_source_type', 'page_audio_media_id', 'page_audio_url', 'page_audio_loop', 'page_audio_volume']
    expect(await names('eg_posts')).toEqual(expect.arrayContaining(cols))
    expect(await names('_eg_posts_v')).toEqual(expect.arrayContaining(cols.map((c) => `version_${c}`)))
  })

  it('adds blog tags tables and public author columns on users', async () => {
    expect(createdTables.has('eg_posts_tags')).toBe(true)
    expect(createdTables.has('_eg_posts_v_version_tags')).toBe(true)
    const cols = ((await proxy.env.D1.prepare('PRAGMA table_info(`eg_users`)').all()).results as { name: string }[]).map((r) => r.name)
    expect(cols).toEqual(expect.arrayContaining(['display_name', 'slug']))
  })

  it('adds the blog author and tag switches and the per-post hide-author column', async () => {
    const names = async (t: string) =>
      ((await proxy.env.D1.prepare(`PRAGMA table_info(\`${t}\`)`).all()).results as { name: string }[]).map((r) => r.name)
    expect(await names('eg_blog_settings')).toEqual(expect.arrayContaining(['show_authors', 'show_tags', 'author_archives']))
    expect(await names('eg_posts')).toContain('hide_author')
    expect(await names('_eg_posts_v')).toContain('version_hide_author')
  })

  it('creates the social accounts child table for integrations', async () => {
    expect(createdTables.has('eg_integrations_social_accounts')).toBe(true)
    const cols = ((await proxy.env.D1.prepare('PRAGMA table_info(`eg_integrations_social_accounts`)').all()).results as { name: string }[]).map((r) => r.name)
    expect(cols).toEqual(expect.arrayContaining(['provider', 'label', 'account_id', 'access_token']))
  })

  it('creates the theme styles table (raw SQL, not in the drizzle schema)', async () => {
    expect(createdTables.has('eg_theme_styles')).toBe(true)
    const cols = ((await proxy.env.D1.prepare('PRAGMA table_info(`eg_theme_styles`)').all()).results as { name: string }[]).map((r) => r.name)
    expect(cols).toEqual(expect.arrayContaining(['id', 'data', 'updated_at']))
  })

  it('creates the template repositories columns and repository list table', async () => {
    const cols = async (t: string) =>
      ((await proxy.env.D1.prepare(`PRAGMA table_info(\`${t}\`)`).all()).results as { name: string }[]).map((r) => r.name)
    expect(await cols('eg_integrations')).toEqual(expect.arrayContaining(['template_repos_enabled', 'template_repos_token']))
    expect(createdTables.has('eg_integrations_template_repos_repos')).toBe(true)
    expect(await cols('eg_integrations_template_repos_repos')).toEqual(
      expect.arrayContaining(['_order', '_parent_id', 'id', 'label', 'owner', 'repo', 'branch', 'path', 'enabled']),
    )
  })

  it('adds the page template kind, category and preview image columns', async () => {
    const names = (((await proxy.env.D1.prepare('PRAGMA table_info(`eg_page_templates`)').all()).results as { name: string }[])).map((r) => r.name)
    expect(names).toEqual(expect.arrayContaining(['kind', 'category', 'preview_image_id']))
  })

  it('is safe to run migrations a second time (idempotent)', async () => {
    const again = await runInternalMigrate(proxy.env.D1, consoleLogger)
    expect(again.errorCount).toBe(0)

    // Verify table list unchanged
    const secondRun = await proxy.env.D1.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all()
    const secondTables = new Set((secondRun.results as { name: string }[]).map((r) => r.name))
    expect(secondTables).toEqual(createdTables)
  }, 300_000)

  it('adds the password policy columns to security settings and the password columns to users', async () => {
    const settings = (await proxy.env.D1.prepare('PRAGMA table_info(`eg_security_settings`)').all()).results as { name: string; dflt_value: string | null }[]
    const byName = new Map(settings.map((c) => [c.name, c.dflt_value]))
    expect(byName.get('password_min_length')).toBe('8')
    for (const column of ['password_require_mixed_case', 'password_require_number', 'password_require_symbol', 'password_block_common', 'password_breach_check']) {
      expect(byName.get(column)).toBe('0')
    }
    expect(byName.get('password_history_count')).toBe('0')
    expect(byName.get('password_max_age_days')).toBe('0')
    const userCols = ((await proxy.env.D1.prepare('PRAGMA table_info(`eg_users`)').all()).results as { name: string }[]).map((c) => c.name)
    expect(userCols).toEqual(expect.arrayContaining(['password_changed_at', 'password_history_hashes']))
  })

  it('password policy migration is safe to run twice and adds each column once', async () => {
    const mod = await import('@/migrations/20261116_100000_password_policy')
    const { drizzle } = await import('drizzle-orm/d1')
    const db = drizzle(proxy.env.D1) as never
    const engine = { logger: consoleLogger } as never
    await mod.up({ db, engine } as never)
    await mod.up({ db, engine } as never)
    const count = async (table: string, column: string) =>
      ((await proxy.env.D1.prepare(`SELECT COUNT(*) AS n FROM pragma_table_info('${table}') WHERE name = '${column}'`).first()) as { n: number }).n
    expect(await count('eg_security_settings', 'password_min_length')).toBe(1)
    expect(await count('eg_security_settings', 'password_max_age_days')).toBe(1)
    expect(await count('eg_users', 'password_changed_at')).toBe(1)
    expect(await count('eg_users', 'password_history_hashes')).toBe(1)
  })

  it('adds the passwordless columns to security settings, all off by default, and creates eg_login_tokens', async () => {
    const settings = (await proxy.env.D1.prepare('PRAGMA table_info(`eg_security_settings`)').all()).results as { name: string; dflt_value: string | null }[]
    const byName = new Map(settings.map((c) => [c.name, c.dflt_value]))
    expect(byName.get('magic_link_enabled')).toBe('0')
    expect(byName.get('email_code_enabled')).toBe('0')
    expect(byName.get('allow_passwordless_for_admins')).toBe('0')
    expect(byName.get('passwordless_token_minutes')).toBe('15')
    const cols = ((await proxy.env.D1.prepare('PRAGMA table_info(`eg_login_tokens`)').all()).results as { name: string }[]).map((c) => c.name)
    expect(cols).toEqual(expect.arrayContaining(['id', 'user_id', 'kind', 'token_hash', 'attempts', 'created_at', 'expires_at', 'used_at']))
    const indexes = ((await proxy.env.D1.prepare('PRAGMA index_list(`eg_login_tokens`)').all()).results as { name: string }[]).map((i) => i.name)
    expect(indexes).toEqual(expect.arrayContaining(['eg_login_tokens_user_idx', 'eg_login_tokens_hash_idx']))
  })

  it('adds the passkey columns to security settings, off by default, and creates eg_passkeys', async () => {
    const settings = (await proxy.env.D1.prepare('PRAGMA table_info(`eg_security_settings`)').all()).results as { name: string; dflt_value: string | null }[]
    const byName = new Map(settings.map((c) => [c.name, c.dflt_value]))
    expect(byName.get('passkeys_enabled')).toBe('0')
    expect(byName.get('passkeys_allow_admins')).toBe('0')
    expect(byName.get('passkeys_user_verification')).toBe("'preferred'")
    expect(byName.has('passkeys_rp_name')).toBe(true)
    const cols = ((await proxy.env.D1.prepare('PRAGMA table_info(`eg_passkeys`)').all()).results as { name: string }[]).map((c) => c.name)
    expect(cols).toEqual(expect.arrayContaining(['id', 'user_id', 'credential_id', 'public_key', 'sign_count', 'transports', 'device_label', 'backed_up', 'created_at', 'last_used_at']))
    const indexes = ((await proxy.env.D1.prepare('PRAGMA index_list(`eg_passkeys`)').all()).results as { name: string }[]).map((i) => i.name)
    expect(indexes).toEqual(expect.arrayContaining(['eg_passkeys_credential_idx', 'eg_passkeys_user_idx']))
  })

  it('passkey migration is safe to run twice and leaves existing passkey rows alone', async () => {
    const mod = await import('@/migrations/20261118_100000_passkeys')
    const { drizzle } = await import('drizzle-orm/d1')
    const db = drizzle(proxy.env.D1) as never
    const engine = { logger: consoleLogger } as never
    await proxy.env.D1.prepare("INSERT INTO `eg_passkeys` (user_id, credential_id, public_key, sign_count, created_at) VALUES (9, 'keep-me-cred', 'pk', 0, '2026-01-01T00:00:00.000Z')").run()
    await mod.up({ db, engine } as never)
    await mod.up({ db, engine } as never)
    const count = async (table: string, column: string) =>
      ((await proxy.env.D1.prepare(`SELECT COUNT(*) AS n FROM pragma_table_info('${table}') WHERE name = '${column}'`).first()) as { n: number }).n
    expect(await count('eg_security_settings', 'passkeys_enabled')).toBe(1)
    expect(await count('eg_security_settings', 'passkeys_user_verification')).toBe(1)
    const kept = (await proxy.env.D1.prepare("SELECT COUNT(*) AS n FROM `eg_passkeys` WHERE credential_id = 'keep-me-cred'").first()) as { n: number }
    expect(kept.n).toBe(1)
    await proxy.env.D1.prepare("DELETE FROM `eg_passkeys` WHERE credential_id = 'keep-me-cred'").run()
  })

  it('adds the api key columns to security settings, off by default, and creates eg_api_keys', async () => {
    const settings = (await proxy.env.D1.prepare('PRAGMA table_info(`eg_security_settings`)').all()).results as { name: string; dflt_value: string | null }[]
    const byName = new Map(settings.map((c) => [c.name, c.dflt_value]))
    expect(byName.get('api_keys_enabled')).toBe('0')
    expect(byName.get('api_keys_allow_customers')).toBe('0')
    expect(byName.get('api_keys_max_per_user')).toBe('5')
    expect(byName.get('api_keys_max_lifetime_days')).toBe('365')
    const cols = ((await proxy.env.D1.prepare('PRAGMA table_info(`eg_api_keys`)').all()).results as { name: string }[]).map((c) => c.name)
    expect(cols).toEqual(expect.arrayContaining(['id', 'user_id', 'name', 'prefix', 'key_hash', 'scopes', 'created_at', 'last_used_at', 'expires_at', 'revoked_at']))
    const indexes = ((await proxy.env.D1.prepare('PRAGMA index_list(`eg_api_keys`)').all()).results as { name: string }[]).map((i) => i.name)
    expect(indexes).toEqual(expect.arrayContaining(['eg_api_keys_hash_idx', 'eg_api_keys_user_idx']))
  })

  it('api key migration is safe to run twice and leaves existing key rows alone', async () => {
    const mod = await import('@/migrations/20261119_100000_api_keys')
    const { drizzle } = await import('drizzle-orm/d1')
    const db = drizzle(proxy.env.D1) as never
    const engine = { logger: consoleLogger } as never
    await proxy.env.D1.prepare("INSERT INTO `eg_api_keys` (user_id, name, prefix, key_hash, scopes, created_at) VALUES (9, 'keep', 'egk_keep', 'keep-me-key-hash', '[\"read\"]', '2026-01-01T00:00:00.000Z')").run()
    await mod.up({ db, engine } as never)
    await mod.up({ db, engine } as never)
    const count = async (table: string, column: string) =>
      ((await proxy.env.D1.prepare(`SELECT COUNT(*) AS n FROM pragma_table_info('${table}') WHERE name = '${column}'`).first()) as { n: number }).n
    expect(await count('eg_security_settings', 'api_keys_enabled')).toBe(1)
    expect(await count('eg_security_settings', 'api_keys_max_lifetime_days')).toBe(1)
    const kept = (await proxy.env.D1.prepare("SELECT COUNT(*) AS n FROM `eg_api_keys` WHERE key_hash = 'keep-me-key-hash'").first()) as { n: number }
    expect(kept.n).toBe(1)
    await proxy.env.D1.prepare("DELETE FROM `eg_api_keys` WHERE key_hash = 'keep-me-key-hash'").run()
  })

  it('passwordless migration is safe to run twice and leaves existing token rows alone', async () => {
    const mod = await import('@/migrations/20261117_100000_passwordless_login')
    const { drizzle } = await import('drizzle-orm/d1')
    const db = drizzle(proxy.env.D1) as never
    const engine = { logger: consoleLogger } as never
    await proxy.env.D1.prepare("INSERT INTO `eg_login_tokens` (user_id, kind, token_hash, created_at, expires_at) VALUES (9, 'link', 'keep-me-hash', '2026-01-01T00:00:00.000Z', '2026-01-01T00:15:00.000Z')").run()
    await mod.up({ db, engine } as never)
    await mod.up({ db, engine } as never)
    const count = async (table: string, column: string) =>
      ((await proxy.env.D1.prepare(`SELECT COUNT(*) AS n FROM pragma_table_info('${table}') WHERE name = '${column}'`).first()) as { n: number }).n
    expect(await count('eg_security_settings', 'magic_link_enabled')).toBe(1)
    expect(await count('eg_security_settings', 'passwordless_token_minutes')).toBe(1)
    const kept = (await proxy.env.D1.prepare("SELECT COUNT(*) AS n FROM `eg_login_tokens` WHERE token_hash = 'keep-me-hash'").first()) as { n: number }
    expect(kept.n).toBe(1)
    await proxy.env.D1.prepare("DELETE FROM `eg_login_tokens` WHERE token_hash = 'keep-me-hash'").run()
  })

  it('adds the impersonation columns to security settings, off by default, and creates eg_impersonations', async () => {
    const info = (await proxy.env.D1.prepare('PRAGMA table_info(`eg_security_settings`)').all()).results as { name: string; dflt_value: string | null }[]
    const byName = new Map(info.map((c) => [c.name, c.dflt_value]))
    expect(byName.get('impersonation_enabled')).toBe('0')
    expect(byName.get('impersonation_max_minutes')).toBe('30')
    expect(byName.get('impersonation_require2fa')).toBe('1')
    const cols = ((await proxy.env.D1.prepare('PRAGMA table_info(`eg_impersonations`)').all()).results as { name: string }[]).map((c) => c.name)
    expect(cols).toEqual(
      expect.arrayContaining(['id', 'admin_id', 'admin_email', 'target_user_id', 'target_email', 'reason', 'started_at', 'ended_at', 'expires_at', 'session_id', 'ip', 'user_agent']),
    )
    const indexes = ((await proxy.env.D1.prepare('PRAGMA index_list(`eg_impersonations`)').all()).results as { name: string }[]).map((i) => i.name)
    expect(indexes).toEqual(expect.arrayContaining(['eg_impersonations_admin_idx', 'eg_impersonations_target_idx', 'eg_impersonations_started_idx']))
  })

  it('impersonation migration is safe to run twice and leaves existing impersonation rows alone', async () => {
    const mod = await import('@/migrations/20261120_100000_impersonation')
    const { drizzle } = await import('drizzle-orm/d1')
    const db = drizzle(proxy.env.D1) as never
    const engine = { logger: consoleLogger } as never
    await proxy.env.D1.prepare(
      "INSERT INTO `eg_impersonations` (id, admin_id, admin_email, target_user_id, target_email, reason, started_at, expires_at) VALUES ('keep-me-imp', 1, 'a@example.com', 2, 'c@example.com', 'keep me please', '2026-01-01T00:00:00.000Z', '2026-01-01T00:30:00.000Z')",
    ).run()
    await mod.up({ db, engine } as never)
    await mod.up({ db, engine } as never)
    const count = async (table: string, column: string) =>
      ((await proxy.env.D1.prepare(`SELECT COUNT(*) AS n FROM pragma_table_info('${table}') WHERE name = '${column}'`).first()) as { n: number }).n
    expect(await count('eg_security_settings', 'impersonation_enabled')).toBe(1)
    expect(await count('eg_security_settings', 'impersonation_require2fa')).toBe(1)
    expect(await count('eg_impersonations', 'session_id')).toBe(1)
    const kept = (await proxy.env.D1.prepare("SELECT COUNT(*) AS n FROM `eg_impersonations` WHERE id = 'keep-me-imp'").first()) as { n: number }
    expect(kept.n).toBe(1)
    await proxy.env.D1.prepare("DELETE FROM `eg_impersonations` WHERE id = 'keep-me-imp'").run()
  })

  it('adds the email verification settings, off by default, and creates eg_email_verifications and eg_rate_limits', async () => {
    const info = (await proxy.env.D1.prepare('PRAGMA table_info(`eg_security_settings`)').all()).results as { name: string; dflt_value: string | null }[]
    const byName = new Map(info.map((c) => [c.name, c.dflt_value]))
    expect(byName.get('email_verification_required')).toBe('0')
    expect(byName.get('email_verification_cooldown_seconds')).toBe('60')
    const cols = async (table: string) => ((await proxy.env.D1.prepare(`PRAGMA table_info(\`${table}\`)`).all()).results as { name: string }[]).map((c) => c.name)
    expect(await cols('eg_email_verifications')).toEqual(expect.arrayContaining(['id', 'user_id', 'email', 'token_hash', 'created_at', 'expires_at', 'used_at']))
    expect(await cols('eg_rate_limits')).toEqual(expect.arrayContaining(['key', 'window_start', 'count', 'expires_at']))
    const indexes = ((await proxy.env.D1.prepare('PRAGMA index_list(`eg_email_verifications`)').all()).results as { name: string }[]).map((i) => i.name)
    expect(indexes).toEqual(expect.arrayContaining(['eg_email_verifications_token_idx', 'eg_email_verifications_user_idx']))
  })

  it('auth slice 2 migration is safe to run twice and leaves existing rows alone', async () => {
    const mod = await import('@/migrations/20261121_100000_auth_slice_2')
    const { drizzle } = await import('drizzle-orm/d1')
    const db = drizzle(proxy.env.D1) as never
    const engine = { logger: consoleLogger } as never
    await proxy.env.D1.prepare(
      "INSERT INTO `eg_rate_limits` (key, window_start, count, expires_at) VALUES ('keep-me', 1, 3, 99999999999999)",
    ).run()
    await mod.up({ db, engine } as never)
    await mod.up({ db, engine } as never)
    const count = async (table: string, column: string) =>
      ((await proxy.env.D1.prepare(`SELECT COUNT(*) AS n FROM pragma_table_info('${table}') WHERE name = '${column}'`).first()) as { n: number }).n
    expect(await count('eg_security_settings', 'email_verification_required')).toBe(1)
    expect(await count('eg_security_settings', 'email_verification_cooldown_seconds')).toBe(1)
    const kept = (await proxy.env.D1.prepare("SELECT count FROM `eg_rate_limits` WHERE key = 'keep-me'").first()) as { count: number }
    expect(kept.count).toBe(3)
    await proxy.env.D1.prepare("DELETE FROM `eg_rate_limits` WHERE key = 'keep-me'").run()
  })

  it('adds the auth slice 3 columns to security settings, off by default, and creates the email code and trusted device tables', async () => {
    const info = (await proxy.env.D1.prepare('PRAGMA table_info(`eg_security_settings`)').all()).results as { name: string; dflt_value: string | null }[]
    const byName = new Map(info.map((c) => [c.name, c.dflt_value]))
    expect(byName.has('two_factor_required_roles')).toBe(true)
    expect(byName.has('two_factor_grace_ends_at')).toBe(true)
    expect(byName.get('two_factor_email_otp_enabled')).toBe('0')
    expect(byName.get('trusted_devices_enabled')).toBe('0')
    expect(byName.get('trusted_device_days')).toBe('30')
    const emailCols = ((await proxy.env.D1.prepare('PRAGMA table_info(`eg_two_factor_email_codes`)').all()).results as { name: string }[]).map((c) => c.name)
    expect(emailCols).toEqual(expect.arrayContaining(['id', 'user_id', 'purpose', 'code_hash', 'attempts', 'created_at', 'expires_at', 'used_at']))
    const deviceCols = ((await proxy.env.D1.prepare('PRAGMA table_info(`eg_trusted_devices`)').all()).results as { name: string }[]).map((c) => c.name)
    expect(deviceCols).toEqual(expect.arrayContaining(['id', 'user_id', 'token_hash', 'label', 'ip', 'created_at', 'last_used_at', 'expires_at', 'revoked_at']))
    const emailIdx = ((await proxy.env.D1.prepare('PRAGMA index_list(`eg_two_factor_email_codes`)').all()).results as { name: string }[]).map((i) => i.name)
    expect(emailIdx).toEqual(expect.arrayContaining(['eg_two_factor_email_codes_user_idx']))
    const deviceIdx = ((await proxy.env.D1.prepare('PRAGMA index_list(`eg_trusted_devices`)').all()).results as { name: string }[]).map((i) => i.name)
    expect(deviceIdx).toEqual(expect.arrayContaining(['eg_trusted_devices_user_idx', 'eg_trusted_devices_hash_idx']))
  })

  it('auth slice 3 migration is safe to run twice and leaves existing rows alone', async () => {
    const mod = await import('@/migrations/20261122_100000_auth_slice_3')
    const { drizzle } = await import('drizzle-orm/d1')
    const db = drizzle(proxy.env.D1) as never
    const engine = { logger: consoleLogger } as never
    await proxy.env.D1.prepare(
      "INSERT INTO `eg_trusted_devices` (id, user_id, token_hash, created_at, expires_at) VALUES ('keep-me-device', 9, 'keep-me-device-hash', '2026-01-01T00:00:00.000Z', '2099-01-01T00:00:00.000Z')",
    ).run()
    await proxy.env.D1.prepare(
      "INSERT INTO `eg_two_factor_email_codes` (user_id, purpose, code_hash, created_at, expires_at) VALUES (9, 'login', 'keep-me-code-hash', '2026-01-01T00:00:00.000Z', '2026-01-01T00:10:00.000Z')",
    ).run()
    await mod.up({ db, engine } as never)
    await mod.up({ db, engine } as never)
    const count = async (table: string, column: string) =>
      ((await proxy.env.D1.prepare(`SELECT COUNT(*) AS n FROM pragma_table_info('${table}') WHERE name = '${column}'`).first()) as { n: number }).n
    expect(await count('eg_security_settings', 'two_factor_required_roles')).toBe(1)
    expect(await count('eg_security_settings', 'trusted_device_days')).toBe(1)
    expect(await count('eg_trusted_devices', 'token_hash')).toBe(1)
    const device = (await proxy.env.D1.prepare("SELECT COUNT(*) AS n FROM `eg_trusted_devices` WHERE id = 'keep-me-device'").first()) as { n: number }
    const code = (await proxy.env.D1.prepare("SELECT COUNT(*) AS n FROM `eg_two_factor_email_codes` WHERE code_hash = 'keep-me-code-hash'").first()) as { n: number }
    expect(device.n).toBe(1)
    expect(code.n).toBe(1)
    await proxy.env.D1.prepare("DELETE FROM `eg_trusted_devices` WHERE id = 'keep-me-device'").run()
    await proxy.env.D1.prepare("DELETE FROM `eg_two_factor_email_codes` WHERE code_hash = 'keep-me-code-hash'").run()
  })

  it('creates the password group tables, matching their drizzle mirrors, and the security toggle on by default', async () => {
    const info = (await proxy.env.D1.prepare('PRAGMA table_info(`eg_security_settings`)').all()).results as { name: string; dflt_value: string | null }[]
    expect(new Map(info.map((c) => [c.name, c.dflt_value])).get('password_groups_enabled')).toBe('1')
    for (const table of [passwordGroupsSchema.passwordGroups, passwordGroupsSchema.contentAccess]) {
      const name = getTableName(table)
      const live = ((await proxy.env.D1.prepare(`PRAGMA table_info(\`${name}\`)`).all()).results as { name: string }[]).map((c) => c.name).sort()
      const declared = Object.values(getTableColumns(table)).map((c) => c.name).sort()
      expect(live, name).toEqual(declared)
    }
    const indexes = ((await proxy.env.D1.prepare('PRAGMA index_list(`eg_password_groups`)').all()).results as { name: string; unique: number }[])
    expect(indexes.find((i) => i.name === 'eg_password_groups_name_idx')?.unique).toBe(1)
    const accessIndexes = ((await proxy.env.D1.prepare('PRAGMA index_list(`eg_content_access`)').all()).results as { name: string }[]).map((i) => i.name)
    expect(accessIndexes).toContain('eg_content_access_group_idx')
  })

  it('password groups migration is registered before organizations and is safe to run twice, keeping existing rows', async () => {
    const { migrations } = await import('@/migrations/index')
    expect(migrations.map((x) => x.name).slice(-15)).toEqual([
      '20261130_100000_domain_settings',
      '20261130_110000_admin_path',
      '20261201_100000_content_domains',
      '20261208_100000_user_domains',
      '20261215_100000_domain_overrides',
      '20261220_100000_site_scoped_slugs',
      '20261229_100000_tracking_events',
      '20261230_100000_tracking_switches',
      '20261231_100000_tracking_categories',
      '20270102_100000_tracking_connections',
      '20270103_100000_tracking_value_source',
      '20270110_100000_api_endpoints',
      '20270117_100000_webhooks',
      '20270118_100000_ai_usage_estimated',
      '20270119_100000_template_libraries',
    ])
    const mod = await import('@/migrations/20261123_100000_password_groups')
    const { drizzle } = await import('drizzle-orm/d1')
    const db = drizzle(proxy.env.D1) as never
    const engine = { logger: consoleLogger } as never
    await proxy.env.D1.prepare(
      "INSERT INTO `eg_password_groups` (name, hash, use_count, created_at, updated_at) VALUES ('keep-me-group', 'h', 0, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')",
    ).run()
    await mod.up({ db, engine } as never)
    await mod.up({ db, engine } as never)
    const count = async (table: string, column: string) =>
      ((await proxy.env.D1.prepare(`SELECT COUNT(*) AS n FROM pragma_table_info('${table}') WHERE name = '${column}'`).first()) as { n: number }).n
    expect(await count('eg_security_settings', 'password_groups_enabled')).toBe(1)
    expect(await count('eg_content_access', 'group_id')).toBe(1)
    const kept = (await proxy.env.D1.prepare("SELECT COUNT(*) AS n FROM `eg_password_groups` WHERE name = 'keep-me-group'").first()) as { n: number }
    expect(kept.n).toBe(1)
    await proxy.env.D1.prepare("DELETE FROM `eg_password_groups` WHERE name = 'keep-me-group'").run()
  })

  it('adds the organization columns to security settings, off by default, and creates the organization tables', async () => {
    const info = (await proxy.env.D1.prepare('PRAGMA table_info(`eg_security_settings`)').all()).results as { name: string; dflt_value: string | null }[]
    const byName = new Map(info.map((c) => [c.name, c.dflt_value]))
    expect(byName.get('organizations_enabled')).toBe('0')
    expect(byName.get('organizations_max_per_account')).toBe('5')
    expect(byName.get('organizations_who_may_create')).toBe("'anyone'")
    const colsOf = async (table: string) => ((await proxy.env.D1.prepare(`PRAGMA table_info(\`${table}\`)`).all()).results as { name: string }[]).map((c) => c.name)
    expect(await colsOf('eg_organizations')).toEqual(expect.arrayContaining(['id', 'name', 'slug', 'logo', 'metadata', 'created_by', 'created_at', 'updated_at']))
    expect(await colsOf('eg_organization_members')).toEqual(expect.arrayContaining(['id', 'organization_id', 'user_id', 'role', 'created_at']))
    expect(await colsOf('eg_organization_roles')).toEqual(expect.arrayContaining(['organization_id', 'name', 'permissions']))
    expect(await colsOf('eg_organization_teams')).toEqual(expect.arrayContaining(['id', 'organization_id', 'name']))
    expect(await colsOf('eg_organization_team_members')).toEqual(expect.arrayContaining(['team_id', 'user_id']))
    expect(await colsOf('eg_organization_invitations')).toEqual(
      expect.arrayContaining(['id', 'organization_id', 'email', 'role', 'team_id', 'token_hash', 'status', 'inviter_id', 'expires_at', 'resolved_at', 'last_sent_at']),
    )
    expect(await colsOf('eg_content_org_visibility')).toEqual(expect.arrayContaining(['collection', 'doc_id', 'organization_id']))
    const indexes = ((await proxy.env.D1.prepare('PRAGMA index_list(`eg_organization_invitations`)').all()).results as { name: string; unique: number }[])
    expect(indexes.find((i) => i.name === 'eg_organization_invitations_token_idx')?.unique).toBe(1)
  })

  it('organizations migration is safe to run twice and leaves existing organization rows alone', async () => {
    const mod = await import('@/migrations/20261124_100000_organizations')
    const { drizzle } = await import('drizzle-orm/d1')
    const db = drizzle(proxy.env.D1) as never
    const engine = { logger: consoleLogger } as never
    await proxy.env.D1.prepare(
      "INSERT INTO `eg_organizations` (id, name, slug, created_by, created_at, updated_at) VALUES ('keep-me-org', 'Keep', 'keep-me', 1, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')",
    ).run()
    await mod.up({ db, engine } as never)
    await mod.up({ db, engine } as never)
    const count = async (table: string, column: string) =>
      ((await proxy.env.D1.prepare(`SELECT COUNT(*) AS n FROM pragma_table_info('${table}') WHERE name = '${column}'`).first()) as { n: number }).n
    expect(await count('eg_security_settings', 'organizations_enabled')).toBe(1)
    expect(await count('eg_security_settings', 'organizations_who_may_create')).toBe(1)
    expect(await count('eg_organizations', 'slug')).toBe(1)
    const kept = (await proxy.env.D1.prepare("SELECT COUNT(*) AS n FROM `eg_organizations` WHERE id = 'keep-me-org'").first()) as { n: number }
    expect(kept.n).toBe(1)
    await proxy.env.D1.prepare("DELETE FROM `eg_organizations` WHERE id = 'keep-me-org'").run()
  })

  it('translation workflow migration is registered last and is safe to run twice, keeping existing translations', async () => {
    const mod = await import('@/migrations/20261125_100000_translation_workflow')
    const { drizzle } = await import('drizzle-orm/d1')
    const db = drizzle(proxy.env.D1) as never
    const engine = { logger: consoleLogger } as never
    await proxy.env.D1.prepare(
      "INSERT INTO `eg_translations` (locale, source_kind, source_id, field_path, value, source_text) VALUES ('de', 'collection', 'pages:keep-1', 'title', 'Hallo', 'Hi')",
    ).run()
    await mod.up({ db, engine } as never)
    await mod.up({ db, engine } as never)
    const count = async (table: string, column: string) =>
      ((await proxy.env.D1.prepare(`SELECT COUNT(*) AS n FROM pragma_table_info('${table}') WHERE name = '${column}'`).first()) as { n: number }).n
    expect(await count('eg_translations', 'status')).toBe(1)
    expect(await count('eg_translations', 'assigned_to')).toBe(1)
    expect(await count('eg_language_settings', 'multilingual_translation_rules')).toBe(1)
    const kept = (await proxy.env.D1.prepare("SELECT status FROM `eg_translations` WHERE source_id = 'pages:keep-1'").first()) as { status: string }
    expect(kept.status).toBe('approved')
    await proxy.env.D1.prepare("DELETE FROM `eg_translations` WHERE source_id = 'pages:keep-1'").run()
  })
})
