import type { FormDoc } from './types'

import { normaliseFormConfig } from './config'
import { buildPayload, deliver, MAX_ATTEMPTS, summariseAttempts, type WebhookAttempt } from './webhooks'
import { getFormSettings } from './settings'
import { FORMS_SLUG, SUBMISSIONS_SLUG } from './slugs'
import { isStoredFile } from './upload'
import { withResolvedFields } from './layout'

/**
 * Housekeeping that runs from the existing 5-minute cron (see
 * src/app/(engage)/api/cron/publish-scheduled/route.ts):
 *
 *  - retention: entries older than the form's retention (or the site default
 *    from Settings > Forms) are deleted, files included. 0 means keep forever.
 *  - webhook retries: deliveries that failed are tried again with a growing
 *    delay (see webhooks.ts).
 *
 * Both are bounded per run so a large backlog is worked off over several runs
 * rather than in one long request.
 */

export type MaintenanceEngine = {
  find: (args: Record<string, unknown>) => Promise<{ docs: unknown[]; totalDocs?: number }>
  findByID: (args: Record<string, unknown>) => Promise<unknown>
  update: (args: Record<string, unknown>) => Promise<unknown>
  delete: (args: Record<string, unknown>) => Promise<unknown>
  findGlobal: (args: Record<string, unknown>) => Promise<unknown>
  logger: { info: (...args: unknown[]) => void; warn: (...args: unknown[]) => void }
}

const MAX_DELETES_PER_RUN = 200
const MAX_RETRIES_PER_RUN = 25
const DAY_MS = 86_400_000

/** Removes the R2 objects an entry's answers point at. Never throws. */
export async function deleteEntryFiles(values: unknown, bucket?: { delete: (keys: string | string[]) => Promise<void> }): Promise<number> {
  const keys: string[] = []
  const collect = (value: unknown) => {
    if (Array.isArray(value)) value.forEach(collect)
    else if (isStoredFile(value)) keys.push(value.key)
  }
  if (values && typeof values === 'object') Object.values(values as Record<string, unknown>).forEach(collect)
  if (keys.length === 0) return 0
  try {
    const target = bucket || (await (await import('./upload')).getUploadBucket())
    await target.delete(keys)
    return keys.length
  } catch {
    return 0
  }
}

/** Deletes entries past their retention window. Returns how many went. */
export async function pruneSubmissions(engine: MaintenanceEngine, now = new Date()): Promise<number> {
  const site = await getFormSettings(engine as never)
  const forms = (await engine.find({ collection: FORMS_SLUG, limit: 500, depth: 0, pagination: false })).docs as FormDoc[]

  let deleted = 0
  const windows: { formId: number | string | null; days: number }[] = forms.map((form) => {
    const own = normaliseFormConfig(form.formConfig).retentionDays
    return { formId: form.id as number | string, days: own !== undefined ? own : site.retentionDays }
  })

  for (const { formId, days } of windows) {
    if (!days || days <= 0 || deleted >= MAX_DELETES_PER_RUN) continue
    const cutoff = new Date(now.getTime() - days * DAY_MS).toISOString()
    const old = await engine.find({
      collection: SUBMISSIONS_SLUG,
      where: { and: [{ form: { equals: formId } }, { createdAt: { less_than: cutoff } }] },
      limit: MAX_DELETES_PER_RUN - deleted,
      depth: 0,
      overrideAccess: true,
    })
    for (const entry of old.docs as { id: number; values?: unknown }[]) {
      await deleteEntryFiles(entry.values)
      await engine.delete({ collection: SUBMISSIONS_SLUG, id: entry.id, overrideAccess: true })
      deleted += 1
    }
  }

  if (deleted > 0) engine.logger.info({ deleted }, 'Form entries past retention were deleted')
  return deleted
}

/** Retries webhook deliveries that are due. Returns how many were attempted. */
export async function retryDueWebhooks(engine: MaintenanceEngine, now = new Date(), fetcher: typeof fetch = fetch): Promise<number> {
  const due = await engine.find({
    collection: SUBMISSIONS_SLUG,
    where: { and: [{ webhookState: { equals: 'retry' } }, { webhookRetryAt: { less_than_equal: now.toISOString() } }] },
    limit: MAX_RETRIES_PER_RUN,
    depth: 0,
    overrideAccess: true,
  })

  let attempted = 0
  for (const entry of due.docs as { id: number; form?: number | { id: number }; values?: Record<string, unknown>; submittedAt?: string; createdAt?: string; webhookDeliveries?: WebhookAttempt[] }[]) {
    const formId = typeof entry.form === 'object' ? entry.form?.id : entry.form
    if (!formId) continue
    const form = (await engine.findByID({ collection: FORMS_SLUG, id: formId, depth: 0 }).catch((): null => null)) as FormDoc | null
    if (!form) continue
    attempted += await runWebhookRetry(engine, form, entry, now, fetcher, false)
  }
  return attempted
}

/**
 * One round of retries for one entry. `force` (the manual "retry now" button)
 * also retries webhooks that already used all their attempts, giving them one
 * more go.
 */
export async function runWebhookRetry(
  engine: Pick<MaintenanceEngine, 'update'>,
  form: FormDoc,
  entry: { id: number | string; values?: Record<string, unknown>; submittedAt?: string; createdAt?: string; webhookDeliveries?: WebhookAttempt[] },
  now: Date,
  fetcher: typeof fetch,
  force: boolean,
): Promise<number> {
  const resolved = withResolvedFields(form)
  const config = normaliseFormConfig(form.formConfig)
  const log: WebhookAttempt[] = Array.isArray(entry.webhookDeliveries) ? [...entry.webhookDeliveries] : []
  let attempted = 0

  for (const hook of config.webhooks || []) {
    if (hook.enabled === false || !hook.url) continue
    const mine = log.filter((attempt) => attempt.webhookId === hook.id)
    const last = mine[mine.length - 1]
    if (last?.ok) continue
    const attemptNumber = (last?.attempt || 0) + 1
    if (attemptNumber > MAX_ATTEMPTS && !force) continue
    const payload = buildPayload(resolved, resolved.fields, entry.id, entry.values || {}, entry.submittedAt || entry.createdAt || now.toISOString(), `${entry.id}-${hook.id}-${attemptNumber}`)
    log.push(await deliver(hook, payload, attemptNumber, fetcher, () => now.getTime()))
    attempted += 1
  }

  const summary = summariseAttempts(log)
  await engine.update({
    collection: SUBMISSIONS_SLUG,
    id: entry.id,
    overrideAccess: true,
    data: { webhookDeliveries: log, webhookState: summary.state, webhookRetryAt: summary.retryAt || '' },
  })
  return attempted
}
