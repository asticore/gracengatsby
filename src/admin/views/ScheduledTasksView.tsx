import { redirect } from 'next/navigation'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { getAdminContext } from '@/admin/auth'
import { CollapsibleCard } from '@/admin/components/CollapsibleCard'
import { CRON_JOBS } from '@/features/cron/registry'
import { isCronStale } from '@/features/cron/model'
import { lastTickAt, latestRunPerJob, loadPendingActions, recentBackupRuns, recentRuns, type CronRunRow } from '@/features/cron/history'
import { formatAgo, formatDuration, formatWhen } from '@/features/health/format'
import { getFeatureFlags } from '@/utilities/features'
import { loadSiteDetails } from '@/features/site/details'
import './site-health.css'

/**
 * Server wrapper for the Scheduled tasks screen at /admin/scheduled-tasks.
 * Shows every timed job, its last result, the last 20 runs and the scheduled
 * publishes still waiting. Admin only. Read-only: nothing here runs a job.
 */
export async function ScheduledTasksView() {
  const context = await getAdminContext()
  if (!context.isAdmin) redirect('/admin')

  const { env } = await getCloudflareContext({ async: true })
  const db = env.D1
  const now = new Date()
  const [latest, cronRuns, backupRuns, tick, pending, flags, details] = await Promise.all([
    latestRunPerJob(db),
    recentRuns(db, 20),
    recentBackupRuns(db, 20),
    lastTickAt(db),
    loadPendingActions(db),
    getFeatureFlags(),
    loadSiteDetails(),
  ])

  const lastByJob = new Map<string, CronRunRow>(latest.map((run) => [run.job, run]))
  const history = [...cronRuns, ...backupRuns]
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .slice(0, 20)
  const timeZone = details?.timezone ?? null
  const stale = isCronStale(tick, now)

  return (
    <div className="st">
      <header className="sh-head">
        <h1 className="sh-title">Scheduled tasks</h1>
        <p className="sh-muted">
          The jobs the site runs on a timer, what each one last did, and the changes still waiting to go live.
        </p>
        <p className={stale ? 'sh-bad' : 'sh-muted'}>
          {tick
            ? `The scheduled jobs last ran ${formatAgo(tick, now)} (${formatWhen(tick, timeZone)}).`
            : 'The scheduled jobs have never run.'}
        </p>
      </header>

      <CollapsibleCard id="scheduled-tasks-jobs" title="Jobs">
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
            {CRON_JOBS.map((job) => {
              const enabled = job.feature === null || Boolean(flags[job.feature])
              const last = job.source === 'backups' ? (backupRuns[0] ?? null) : (lastByJob.get(job.name) ?? null)
              const duration = formatDuration(last?.durationMs ?? null)
              return (
                <tr key={job.name} className={enabled ? undefined : 'sh-off'}>
                  <td>
                    <strong>{job.label}</strong>
                    <br />
                    <span className="sh-muted">{job.description}</span>
                  </td>
                  <td>{enabled ? job.schedule : 'Feature off'}</td>
                  <td>
                    {last ? formatWhen(last.startedAt, timeZone) : 'Never'}
                    {duration ? ` (${duration})` : ''}
                  </td>
                  <td>
                    {!last ? '-' : last.ok === null ? 'Not finished' : last.ok ? 'Worked' : <span className="sh-error">{`Failed: ${last.error ?? 'unknown error'}`}</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </CollapsibleCard>

      <CollapsibleCard id="scheduled-tasks-pending" title="Waiting to go live">
        {pending.length === 0 ? (
          <p className="sh-muted">Nothing is scheduled to publish or unpublish.</p>
        ) : (
          <table className="sh-table">
            <thead>
              <tr>
                <th scope="col">When</th>
                <th scope="col">Action</th>
                <th scope="col">Item</th>
                <th scope="col">Open</th>
              </tr>
            </thead>
            <tbody>
              {pending.map((item) => (
                <tr key={`${item.collection}:${item.docId}:${item.action}`}>
                  <td>{formatWhen(item.when, timeZone)}</td>
                  <td>{item.action}</td>
                  <td>{item.title ?? `${item.collection} #${item.docId}`}</td>
                  <td>
                    <a href={item.href}>Open</a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CollapsibleCard>

      <CollapsibleCard id="scheduled-tasks-history" title="Last 20 runs">
        {history.length === 0 ? (
          <p className="sh-muted">No runs recorded yet.</p>
        ) : (
          <table className="sh-table">
            <thead>
              <tr>
                <th scope="col">When</th>
                <th scope="col">Job</th>
                <th scope="col">Result</th>
                <th scope="col">Took</th>
              </tr>
            </thead>
            <tbody>
              {history.map((run) => (
                <tr key={`${run.job}:${run.startedAt}`}>
                  <td>{formatWhen(run.startedAt, timeZone)}</td>
                  <td>{CRON_JOBS.find((job) => job.name === run.job)?.label ?? run.job}</td>
                  <td>
                    {run.ok === null ? 'Not finished' : run.ok ? 'Worked' : <span className="sh-error">{`Failed: ${run.error ?? 'unknown error'}`}</span>}
                  </td>
                  <td>{formatDuration(run.durationMs) ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CollapsibleCard>
    </div>
  )
}
