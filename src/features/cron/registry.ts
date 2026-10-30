import type { FeatureKey } from '@/features/registry'

/**
 * Every scheduled job the site runs, in the order the cron route runs them.
 * The Scheduled tasks screen reads this list; the names must match the
 * runJob() calls in src/app/(engage)/api/cron/publish-scheduled/route.ts
 * (the cron-runjob spec checks that).
 */

export type CronSchedule = 'every 5 minutes' | 'hourly' | 'hourly (checks the backup time)'

export type CronJob = {
  /** Stable key stored on each run row. */
  name: string
  /** Plain-English name for the screen. */
  label: string
  /** One sentence on what the job does. */
  description: string
  schedule: CronSchedule
  /** The feature that must be on for the job to do anything. Null when it always runs. */
  feature: FeatureKey | null
  /** Where the runs are recorded. Backups keep their own run log. */
  source: 'cron' | 'backups'
}

export const CRON_JOBS: CronJob[] = [
  { name: 'schedules', label: 'Scheduled publishing', description: 'Publishes and unpublishes pages, posts, products, events and courses at their set times.', schedule: 'every 5 minutes', feature: null, source: 'cron' },
  { name: 'abandoned-carts', label: 'Abandoned cart emails', description: 'Sends the reminder emails for carts that were left unpaid, when those reminders are switched on.', schedule: 'every 5 minutes', feature: 'ecommerce', source: 'cron' },
  { name: 'pagespeed', label: 'PageSpeed tests', description: 'Runs one queued PageSpeed test after a page is published, when "test after publish" is on.', schedule: 'every 5 minutes', feature: 'speed', source: 'cron' },
  { name: 'webhooks-retry', label: 'Form webhook retries', description: 'Sends again any form submission webhook that failed.', schedule: 'every 5 minutes', feature: 'forms', source: 'cron' },
  { name: 'webhook-deliveries', label: 'Webhook deliveries', description: 'Sends the webhooks builder deliveries that are due, including retries, and removes delivery log entries older than 30 days.', schedule: 'every 5 minutes', feature: null, source: 'cron' },
  { name: 'prune-submissions', label: 'Form entry clean-up', description: 'Removes form entries that are older than the retention period set on each form.', schedule: 'hourly', feature: 'forms', source: 'cron' },
  { name: 'prune-email-log', label: 'Email log clean-up', description: 'Removes email log entries older than 90 days.', schedule: 'hourly', feature: 'email', source: 'cron' },
  { name: 'gift-cards', label: 'Gift card delivery', description: 'Emails gift cards whose send date has arrived.', schedule: 'every 5 minutes', feature: 'ecommerce', source: 'cron' },
  { name: 'scheduled-emails', label: 'Reminder emails', description: 'Sends membership renewal and event reminder emails, held during quiet hours.', schedule: 'every 5 minutes', feature: 'email', source: 'cron' },
  { name: 'display-rates', label: 'Display currency rates', description: 'Refreshes the exchange rates used to show prices in other currencies.', schedule: 'hourly', feature: 'ecommerce', source: 'cron' },
  { name: 'cleanup', label: 'Data clean-up', description: 'Removes old versions, trashed items and logs as set on the Data and system settings.', schedule: 'hourly', feature: null, source: 'cron' },
  { name: 'backups', label: 'Backups', description: 'Takes the scheduled site backup at the time set on the Backups screen.', schedule: 'hourly (checks the backup time)', feature: 'backups', source: 'backups' },
]

export const cronJobNames = (): string[] => CRON_JOBS.filter((job) => job.source === 'cron').map((job) => job.name)
