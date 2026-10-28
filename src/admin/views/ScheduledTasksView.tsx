import { getAdminUi } from '@/admin/i18n/serverUi'
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
  const { t } = await getAdminUi()
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
        <h1 className="sh-title">{t('st.lit.scheduled_tasks')}</h1>
        <p className="sh-muted">
          The jobs the site runs on a timer, what each one last did, and the changes still waiting to go live.
        </p>
        <p className={stale ? 'sh-bad' : 'sh-muted'}>
          {tick
            ? `The scheduled jobs last ran ${formatAgo(tick, now)} (${formatWhen(tick, timeZone)}).`
            : 'The scheduled jobs have never run.'}
        </p>
      </header>

      <CollapsibleCard id="scheduled-tasks-jobs" title={t('st.lit.jobs')}>
        <table className="sh-table">
          <thead>
            <tr>
              <th scope="col">{t('st.lit.job')}</th>
              <th scope="col">{t('st.lit.runs')}</th>
              <th scope="col">{t('st.lit.last_run')}</th>
              <th scope="col">{t('st.lit.result')}</th>
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
                    {!last ? '-' : last.ok === null ? t('st.lit.not_finished') : last.ok ? t('st.lit.worked') : <span className="sh-error">{`Failed: ${last.error ?? 'unknown error'}`}</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </CollapsibleCard>

      <CollapsibleCard id="scheduled-tasks-pending" title={t('st.lit.waiting_to_go_live')}>
        {pending.length === 0 ? (
          <p className="sh-muted">{t('st.lit.nothing_is_scheduled_to_publish_or_unpub')}</p>
        ) : (
          <table className="sh-table">
            <thead>
              <tr>
                <th scope="col">{t('st.lit.when')}</th>
                <th scope="col">{t('st.lit.action')}</th>
                <th scope="col">{t('st.lit.item')}</th>
                <th scope="col">{t('st.lit.open')}</th>
              </tr>
            </thead>
            <tbody>
              {pending.map((item) => (
                <tr key={`${item.collection}:${item.docId}:${item.action}`}>
                  <td>{formatWhen(item.when, timeZone)}</td>
                  <td>{item.action}</td>
                  <td>{item.title ?? `${item.collection} #${item.docId}`}</td>
                  <td>
                    <a href={item.href}>{t('st.lit.open')}</a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CollapsibleCard>

      <CollapsibleCard id="scheduled-tasks-history" title={t('st.lit.last_20_runs')}>
        {history.length === 0 ? (
          <p className="sh-muted">{t('st.lit.no_runs_recorded_yet')}</p>
        ) : (
          <table className="sh-table">
            <thead>
              <tr>
                <th scope="col">{t('st.lit.when')}</th>
                <th scope="col">{t('st.lit.job')}</th>
                <th scope="col">{t('st.lit.result')}</th>
                <th scope="col">{t('st.lit.took')}</th>
              </tr>
            </thead>
            <tbody>
              {history.map((run) => (
                <tr key={`${run.job}:${run.startedAt}`}>
                  <td>{formatWhen(run.startedAt, timeZone)}</td>
                  <td>{CRON_JOBS.find((job) => job.name === run.job)?.label ?? run.job}</td>
                  <td>
                    {run.ok === null ? t('st.lit.not_finished') : run.ok ? t('st.lit.worked') : <span className="sh-error">{`Failed: ${run.error ?? 'unknown error'}`}</span>}
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
