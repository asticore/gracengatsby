import { adminHref } from '@/features/security/adminPath'
import { getAdminRoot } from '@/features/security/settings'
import { useAdminT } from '@/admin/i18n/AdminUiProvider'
import { redirect } from 'next/navigation'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { getAdminContext } from '@/admin/auth'
import { CollapsibleCard } from '@/admin/components/CollapsibleCard'
import { formatBytes } from '@/features/cleanup/size'
import { gatherSiteHealth, type SiteHealthReport } from '@/features/health/collect'
import { formatAgo, formatDuration, formatPercent, formatWhen } from '@/features/health/format'
import './site-health.css'

/**
 * Server wrapper for the Site health screen at /admin/site-health. Admin only.
 * Reads the report directly (the same data the /api/admin-site-health route returns).
 */
export async function SiteHealthView() {
  const context = await getAdminContext()
  if (!context.isAdmin) redirect(adminHref('', await getAdminRoot()))

  const { env } = await getCloudflareContext({ async: true })
  const report = await gatherSiteHealth(context.engine, env.D1, env.R2)
  return <SiteHealthPage report={report} />
}

function SiteHealthPage({ report }: { report: SiteHealthReport }) {
  const t = useAdminT()
  const timeZone = report.site.timezone
  return (
    <div className="sh">
      <header className="sh-head">
        <h1 className="sh-title">{t('sh.lit.site_health')}</h1>
        <p className="sh-muted">
          A check of storage, the scheduled jobs, versions and the main site settings. Checked {formatWhen(report.generatedAt, timeZone)}.
        </p>
      </header>

      <section className="sh-warnings" aria-label={t('sh.lit.things_to_look_at')}>
        {report.warnings.length === 0 ? (
          <p className="sh-ok">{t('sh.lit.nothing_needs_attention')}</p>
        ) : (
          <ul className="sh-warning-list">
            {report.warnings.map((warning) => (
              <li key={warning.text} className={`sh-warning sh-warning--${warning.level}`}>
                {warning.text}
              </li>
            ))}
          </ul>
        )}
      </section>

      <CollapsibleCard id="site-health-storage" title={t('sh.lit.storage')}>
        <StorageBlock report={report} />
      </CollapsibleCard>
      <CollapsibleCard id="site-health-jobs" title={t('sh.lit.scheduled_jobs')}>
        <JobsBlock report={report} />
      </CollapsibleCard>
      <CollapsibleCard id="site-health-versions" title={t('sh.lit.versions')}>
        <VersionsBlock report={report} />
      </CollapsibleCard>
      <CollapsibleCard id="site-health-site" title={t('sh.lit.site')}>
        <SiteBlock report={report} />
      </CollapsibleCard>
    </div>
  )
}

function StorageBlock({ report }: { report: SiteHealthReport }) {
  const t = useAdminT()
  const { storage } = report
  const databaseText =
    storage.databaseBytes === null
      ? 'Not available on this database'
      : `${formatBytes(storage.databaseBytes)} of ${formatBytes(storage.databaseLimitBytes)} (${formatPercent(storage.databasePercent)})`
  return (
    <>
      <dl className="sh-facts">
        <dt title={t('sh.lit.total_size_of_the_site_database_the_limi')}>{t('sh.lit.database_size')}</dt>
        <dd>{databaseText}</dd>
        <dt title={t('sh.lit.files_stored_in_the_media_bucket_r2')}>{t('sh.lit.media_bucket')}</dt>
        <dd>
          {storage.r2 === null
            ? 'Not available'
            : `${storage.r2.objects} files, ${formatBytes(storage.r2.bytes)}${storage.r2.sampled ? ' (first 1000 files only)' : ''}`}
        </dd>
      </dl>
      <h3 className="sh-subhead">{t('sh.lit.largest_tables_by_rows')}</h3>
      {storage.topTables.length === 0 ? (
        <p className="sh-muted">{t('sh.lit.no_tables_could_be_counted')}</p>
      ) : (
        <table className="sh-table">
          <thead>
            <tr>
              <th scope="col">{t('sh.lit.table')}</th>
              <th scope="col" className="sh-num">{t('sh.lit.rows')}</th>
            </tr>
          </thead>
          <tbody>
            {storage.topTables.map((table) => (
              <tr key={table.name}>
                <td>{table.name}</td>
                <td className="sh-num">{table.rows.toLocaleString('en-AU')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {storage.tablesCapped && <p className="sh-muted">{t('sh.lit.only_the_first_60_tables_were_counted')}</p>}
    </>
  )
}

function JobsBlock({ report }: { report: SiteHealthReport }) {
  const t = useAdminT()
  const timeZone = report.site.timezone
  const { cron } = report
  return (
    <>
      <p className={cron.stale ? 'sh-bad' : 'sh-muted'}>
        {cron.neverRan
          ? 'The scheduled jobs have never run.'
          : `The scheduled jobs last ran ${formatAgo(cron.lastTickAt, new Date(report.generatedAt))} (${formatWhen(cron.lastTickAt, timeZone)}).`}
      </p>
      <table className="sh-table">
        <thead>
          <tr>
            <th scope="col">{t('sh.lit.job')}</th>
            <th scope="col">{t('sh.lit.runs')}</th>
            <th scope="col">{t('sh.lit.last_run')}</th>
            <th scope="col">{t('sh.lit.result')}</th>
          </tr>
        </thead>
        <tbody>
          {report.jobs.map((job) => (
            <tr key={job.name} className={job.enabled ? undefined : 'sh-off'}>
              <td>{job.label}</td>
              <td>{job.enabled ? job.schedule : 'Feature off'}</td>
              <td>
                {job.last ? formatWhen(job.last.startedAt, timeZone) : 'Never'}
                {job.last && formatDuration(job.last.durationMs) ? ` (${formatDuration(job.last.durationMs)})` : ''}
              </td>
              <td>{job.last === null ? '-' : job.last.ok === null ? t('sh.lit.not_finished') : job.last.ok ? t('sh.lit.worked') : `Failed: ${job.last.error ?? 'unknown error'}`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}

function VersionsBlock({ report }: { report: SiteHealthReport }) {
  const t = useAdminT()
  return (
    <dl className="sh-facts">
      <dt>{t('sh.lit.app')}</dt>
      <dd>{report.versions.app}</dd>
      <dt>Next.js</dt>
      <dd>{report.versions.next}</dd>
      <dt title={t('sh.lit.the_software_the_site_runs_on')}>{t('sh.lit.runtime')}</dt>
      <dd>{report.versions.runtime}</dd>
    </dl>
  )
}

function yesNo(value: boolean | null, yes: string, no: string, unknown: string): string {
  return value === null ? unknown : value ? yes : no
}

function SiteBlock({ report }: { report: SiteHealthReport }) {
  const t = useAdminT()
  const { site } = report
  return (
    <dl className="sh-facts">
      <dt>{t('sh.lit.site_address')}</dt>
      <dd>{site.url}</dd>
      <dt>{t('sh.lit.time_zone')}</dt>
      <dd>{site.timezone ?? t('sh.lit.unknown')}</dd>
      <dt>{t('sh.lit.features_on')}</dt>
      <dd>{site.featuresOn.length > 0 ? site.featuresOn.join(', ') : 'None'}</dd>
      <dt>{t('sh.lit.email')}</dt>
      <dd>
        {site.emailConnected
          ? `Connected${site.emailProvider ? ` (${site.emailProvider})` : ''}`
          : yesNo(site.emailConnected, t('sh.lit.connected'), t('sh.lit.not_connected'), t('sh.lit.unknown'))}
      </dd>
      <dt>{t('sh.lit.last_backup')}</dt>
      <dd>{site.backupsOn ? formatWhen(site.lastBackupAt, site.timezone) : 'Backups are off'}</dd>
      <dt>{t('sh.lit.maintenance_mode')}</dt>
      <dd>{yesNo(site.maintenanceOn, t('sh.lit.on'), t('sh.lit.off'), t('sh.lit.unknown'))}</dd>
      <dt>{t('sh.lit.search_engine_indexing')}</dt>
      <dd>{yesNo(site.siteIndexable, t('sh.lit.allowed'), t('sh.lit.asked_not_to_index'), t('sh.lit.unknown'))}</dd>
      <dt>IndexNow</dt>
      <dd>{yesNo(site.indexNowOn, t('sh.lit.on'), t('sh.lit.off'), t('sh.lit.unknown'))}</dd>
    </dl>
  )
}