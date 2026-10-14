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
  if (!context.isAdmin) redirect('/admin')

  const { env } = await getCloudflareContext({ async: true })
  const report = await gatherSiteHealth(context.engine, env.D1, env.R2)
  return <SiteHealthPage report={report} />
}

function SiteHealthPage({ report }: { report: SiteHealthReport }) {
  const timeZone = report.site.timezone
  return (
    <div className="sh">
      <header className="sh-head">
        <h1 className="sh-title">Site health</h1>
        <p className="sh-muted">
          A check of storage, the scheduled jobs, versions and the main site settings. Checked {formatWhen(report.generatedAt, timeZone)}.
        </p>
      </header>

      <section className="sh-warnings" aria-label="Things to look at">
        {report.warnings.length === 0 ? (
          <p className="sh-ok">Nothing needs attention.</p>
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

      <CollapsibleCard id="site-health-storage" title="Storage">
        <StorageBlock report={report} />
      </CollapsibleCard>
      <CollapsibleCard id="site-health-jobs" title="Scheduled jobs">
        <JobsBlock report={report} />
      </CollapsibleCard>
      <CollapsibleCard id="site-health-versions" title="Versions">
        <VersionsBlock report={report} />
      </CollapsibleCard>
      <CollapsibleCard id="site-health-site" title="Site">
        <SiteBlock report={report} />
      </CollapsibleCard>
    </div>
  )
}

function StorageBlock({ report }: { report: SiteHealthReport }) {
  const { storage } = report
  const databaseText =
    storage.databaseBytes === null
      ? 'Not available on this database'
      : `${formatBytes(storage.databaseBytes)} of ${formatBytes(storage.databaseLimitBytes)} (${formatPercent(storage.databasePercent)})`
  return (
    <>
      <dl className="sh-facts">
        <dt title="Total size of the site database. The limit shown is the paid-plan limit for one database.">Database size</dt>
        <dd>{databaseText}</dd>
        <dt title="Files stored in the media bucket (R2).">Media bucket</dt>
        <dd>
          {storage.r2 === null
            ? 'Not available'
            : `${storage.r2.objects} files, ${formatBytes(storage.r2.bytes)}${storage.r2.sampled ? ' (first 1000 files only)' : ''}`}
        </dd>
      </dl>
      <h3 className="sh-subhead">Largest tables by rows</h3>
      {storage.topTables.length === 0 ? (
        <p className="sh-muted">No tables could be counted.</p>
      ) : (
        <table className="sh-table">
          <thead>
            <tr>
              <th scope="col">Table</th>
              <th scope="col" className="sh-num">Rows</th>
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
      {storage.tablesCapped && <p className="sh-muted">Only the first 60 tables were counted.</p>}
    </>
  )
}

function JobsBlock({ report }: { report: SiteHealthReport }) {
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
            <th scope="col">Job</th>
            <th scope="col">Runs</th>
            <th scope="col">Last run</th>
            <th scope="col">Result</th>
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
              <td>{job.last === null ? '-' : job.last.ok === null ? 'Not finished' : job.last.ok ? 'Worked' : `Failed: ${job.last.error ?? 'unknown error'}`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}

function VersionsBlock({ report }: { report: SiteHealthReport }) {
  return (
    <dl className="sh-facts">
      <dt>App</dt>
      <dd>{report.versions.app}</dd>
      <dt>Next.js</dt>
      <dd>{report.versions.next}</dd>
      <dt title="The software the site runs on.">Runtime</dt>
      <dd>{report.versions.runtime}</dd>
    </dl>
  )
}

function yesNo(value: boolean | null, yes: string, no: string): string {
  return value === null ? 'Unknown' : value ? yes : no
}

function SiteBlock({ report }: { report: SiteHealthReport }) {
  const { site } = report
  return (
    <dl className="sh-facts">
      <dt>Site address</dt>
      <dd>{site.url}</dd>
      <dt>Time zone</dt>
      <dd>{site.timezone ?? 'Unknown'}</dd>
      <dt>Features on</dt>
      <dd>{site.featuresOn.length > 0 ? site.featuresOn.join(', ') : 'None'}</dd>
      <dt>Email</dt>
      <dd>
        {site.emailConnected
          ? `Connected${site.emailProvider ? ` (${site.emailProvider})` : ''}`
          : yesNo(site.emailConnected, 'Connected', 'Not connected')}
      </dd>
      <dt>Last backup</dt>
      <dd>{site.backupsOn ? formatWhen(site.lastBackupAt, site.timezone) : 'Backups are off'}</dd>
      <dt>Maintenance mode</dt>
      <dd>{yesNo(site.maintenanceOn, 'On', 'Off')}</dd>
      <dt>Search engine indexing</dt>
      <dd>{yesNo(site.siteIndexable, 'Allowed', 'Asked not to index')}</dd>
      <dt>IndexNow</dt>
      <dd>{yesNo(site.indexNowOn, 'On', 'Off')}</dd>
    </dl>
  )
}