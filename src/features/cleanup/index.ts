/**
 * Per-feature database cleanup: see what a switched-off feature is still
 * costing, and reclaim it.
 *
 * Read cleanup.ts for the guardrails, tables.ts for how a feature's tables are
 * discovered from the live schema, and size.ts for why some size figures are
 * estimates.
 */

export { cleanupDbFromD1, type CleanupDb, type IndexRecord } from './db'
export { confirmationPhraseFor, runCleanup, type CleanupPlan, type CleanupRequest } from './cleanup'
export { getCleanupDb, isAuthorisedDatabaseRequest, hasAdminSession } from './guard'
export { planIndexRenames, tidyIndexNames, type IndexRename, type IndexTidyReport } from './indexNames'
export { isBookkeepingTable, SHARED_PARENTS } from './protectedTables'
export { formatBytes, surveySizes, type SizeReport } from './size'
export { surveyDatabase, tablesForFeature, type DatabaseSurvey, type FeatureSurvey } from './survey'
export { assignTables, dropOrder, inFamily, resolveParents, type OwnedTable } from './tables'
