import pkg from '../../../package.json'

import type { Engine } from '@/engine'
import { FEATURES, type FeatureKey } from '@/features/registry'
import { CRON_JOBS } from '@/features/cron/registry'
import { isCronStale } from '@/features/cron/model'
import { lastTickAt, latestRunPerJob, recentBackupRuns, type CronRunRow } from '@/features/cron/history'
import { loadEmailSettings } from '@/features/email/connectionLoad'
import { summariseConnections } from '@/features/email/connectionStatus'
import { getBaseUrl } from '@/features/seo/settings'
import { loadSiteDetails } from '@/features/site/details'
import { getFeatureFlags } from '@/utilities/features'

import { buildWarnings, D1_DATABASE_LIMIT_BYTES, enabledFeatureNames, percentOf, type Warning } from './model'
import { databaseBytes, r2Summary, topTables, type R2Summary, type TableCount } from './storage'

/**
 * Gathers everything the Site health screen shows. Each reading is wrapped on
 * its own, so one unreadable setting shows as "unknown" rather than blanking
 * the whole screen.
 */

export type JobHealth = {
  name: string
  label: string
  schedule: string
  enabled: boolean
  last: CronRunRow | null
}

export type SiteHealthReport = {
  generatedAt: string
  storage: {
    databaseBytes: number | null
    databaseLimitBytes: number
    databasePercent: number | null
    topTables: TableCount[]
    tablesCounted: number
    tablesCapped: boolean
    r2: R2Summary | null
  }
  cron: { lastTickAt: string | null; stale: boolean; neverRan: boolean }
  jobs: JobHealth[]
  versions: { app: string; next: string; runtime: string }
  site: {
    url: string
    timezone: string | null
    featuresOn: string[]
    emailConnected: boolean | null
    emailProvider: string | null
    lastBackupAt: string | null
    backupsOn: boolean
    maintenanceOn: boolean | null
    indexNowOn: boolean | null
    siteIndexable: boolean | null
  }
  warnings: Warning[]
}

const FEATURE_LABELS: Record<string, string> = Object.fromEntries(FEATURES.map((feature) => [feature.key, feature.label]))

async function settle<T>(read: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await read()
  } catch {
    return fallback
  }
}

/** The newest backup run as a run row, so it can sit in the job list. Null when there are no backups yet. */
export async function latestBackupRun(db: D1Database): Promise<CronRunRow | null> {
  const [run] = await recentBackupRuns(db, 1)
  return run ?? null
}

async function lastSuccessfulBackup(db: D1Database): Promise<string | null> {
  try {
    const result = await db
      .prepare("SELECT finished_at FROM `eg_backups` WHERE status IN ('success', 'partial') AND finished_at IS NOT NULL ORDER BY finished_at DESC LIMIT 1")
      .all()
    return (result.results?.[0] as { finished_at?: string } | undefined)?.finished_at ?? null
  } catch {
    return null
  }
}

const globalValue = async <T>(engine: Engine, slug: string): Promise<T | null> =>
  settle(async () => (await engine.findGlobal({ slug, depth: 0, overrideAccess: true })) as T, null)

export async function gatherSiteHealth(engine: Engine, db: D1Database, bucket: R2Bucket | undefined, now: Date = new Date()): Promise<SiteHealthReport> {
  const flags = await settle(() => getFeatureFlags(), {} as Record<FeatureKey, boolean>)
  const flagMap = flags as unknown as Record<string, boolean>

  const sizeBytes = await settle(() => databaseBytes(db), null)
  const tables = await settle(() => topTables(db), { tables: [], counted: 0, capped: false })
  const r2 = await settle(() => r2Summary(bucket), null)

  const runs = await settle(() => latestRunPerJob(db), [] as CronRunRow[])
  const tick = await settle(() => lastTickAt(db), null)
  const lastRuns = new Map(runs.map((run) => [run.job, run]))
  const backupRun = await settle(() => latestBackupRun(db), null)

  const jobs: JobHealth[] = CRON_JOBS.map((job) => ({
    name: job.name,
    label: job.label,
    schedule: job.schedule,
    enabled: job.feature === null || Boolean(flagMap[job.feature]),
    last: job.source === 'backups' ? backupRun : (lastRuns.get(job.name) ?? null),
  }))

  const siteSettings = await globalValue<{ seo?: { siteIndexable?: boolean | null } | null }>(engine, 'site-settings')
  const sitePages = await globalValue<{ maintenance?: { enabled?: boolean | null } | null }>(engine, 'site-pages')
  const seoSettings = await globalValue<{ indexNow?: { enabled?: boolean | null } | null }>(engine, 'seo-settings')
  const emailSummary = await settle(async () => summariseConnections(await loadEmailSettings(engine as never)), null)
  const details = await settle(() => loadSiteDetails(), null)
  const lastBackupAt = await settle(() => lastSuccessfulBackup(db), null)

  const cronStale = isCronStale(tick, now)
  const cronNeverRan = !tick
  const databasePercent = percentOf(sizeBytes, D1_DATABASE_LIMIT_BYTES)
  const maintenanceOn = sitePages ? Boolean(sitePages.maintenance?.enabled) : null
  const siteIndexable = siteSettings ? siteSettings.seo?.siteIndexable !== false : null
  const emailConnected = emailSummary ? emailSummary.emailConnected : null
  const backupsOn = Boolean(flagMap.backups)
  const failedJobs = jobs.filter((job) => job.enabled && job.last?.ok === false).map((job) => ({ label: job.label, error: job.last?.error ?? 'Unknown error' }))

  const warnings = buildWarnings(
    {
      cronStale: cronStale && !cronNeverRan,
      cronNeverRan,
      databasePercent,
      backupsEnabled: backupsOn,
      lastBackupAt,
      emailConnected: emailConnected !== false,
      siteIndexable: siteIndexable !== false,
      maintenanceOn: maintenanceOn === true,
      failedJobs,
    },
    now,
  )

  return {
    generatedAt: now.toISOString(),
    storage: {
      databaseBytes: sizeBytes,
      databaseLimitBytes: D1_DATABASE_LIMIT_BYTES,
      databasePercent,
      topTables: tables.tables,
      tablesCounted: tables.counted,
      tablesCapped: tables.capped,
      r2,
    },
    cron: { lastTickAt: tick, stale: cronStale, neverRan: cronNeverRan },
    jobs,
    versions: {
      app: `${pkg.name} ${pkg.version}`,
      next: String((pkg.dependencies as Record<string, string>).next ?? 'unknown'),
      runtime: typeof process !== 'undefined' && typeof process.version === 'string' ? process.version : 'Cloudflare Workers',
    },
    site: {
      url: getBaseUrl(),
      timezone: details?.timezone ?? null,
      featuresOn: enabledFeatureNames(flagMap, FEATURE_LABELS),
      emailConnected,
      emailProvider: emailSummary?.defaultLabel ?? null,
      lastBackupAt,
      backupsOn,
      maintenanceOn,
      indexNowOn: seoSettings ? Boolean(seoSettings.indexNow?.enabled) : null,
      siteIndexable,
    },
    warnings,
  }
}