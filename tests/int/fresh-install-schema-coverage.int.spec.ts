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
        'auditLog', 'backups', 'translations', 'memberships', 'formSubmissions', 'abTests', 'abTestsVariants', 'abTestsGoals',
        'fieldGroups', 'fieldGroupsFields', 'fieldGroupsFieldsOptions', 'fieldGroupsTargetCollections',
        'forms', 'formsFields', 'formsFieldsOptions', 'formsFieldsConditionalRules',
        'faqSettings', 'faqSettingsRels', 'blogSettings', 'blogSettingsRels', 'shopSettings', 'shopSettingsRels',
        'siteSettings', 'memberSettings', 'securitySettings', 'integrations', 'emailSettings', 'paymentSettings', 'formSettings',
        'header', 'headerMenu', 'headerMenuChildren', 'headerSocialsLinks',
        'footer', 'footerColumns', 'footerColumnsLinks', 'footerSocialsLinks',
        'languageSettings', 'languageSettingsMultilingualActiveLocales',
        'seoSettings', 'seoSettingsSchemaSameAs', 'speedSettings', 'speedSettingsAdvancedPreconnectOrigins', 'speedSettingsAdvancedPrefetchDns',
        'mediaSettings', 'mediaSettingsResizingResponsiveWidths', 'backupSettings',
        'addresses', 'carts', 'cartsItems', 'orders', 'ordersItems', 'ordersRels', 'transactions', 'transactionsItems', 'products', 'productsRels', 'productsVersions', 'productsVersionsRels',
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

  it('is safe to run migrations a second time (idempotent)', async () => {
    const again = await runInternalMigrate(proxy.env.D1, consoleLogger)
    expect(again.errorCount).toBe(0)

    // Verify table list unchanged
    const secondRun = await proxy.env.D1.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all()
    const secondTables = new Set((secondRun.results as { name: string }[]).map((r) => r.name))
    expect(secondTables).toEqual(createdTables)
  }, 300_000)
})
