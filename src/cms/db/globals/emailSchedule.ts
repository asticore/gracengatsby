import { EmailSchedule } from '@/globals/EmailSchedule'

import { createGlobalOps } from '../generic'
import { emailSchedule } from '../schema'

/**
 * The `email-schedule` global (src/globals/EmailSchedule.ts): one switch per automatic email, the reminder timing
 * and quiet hours. A missing row or value means the default (see src/features/email/schedule.ts).
 */
type Switch = { enabled?: boolean | null } | null

export type EmailScheduleDoc = {
  id: number
  accountWelcome?: Switch
  accountReset?: Switch
  accountAlreadyRegistered?: Switch
  membershipRenewal?: ({ enabled?: boolean | null; daysBefore?: number | null }) | null
  rsvpConfirmation?: Switch
  eventReminder?: ({ enabled?: boolean | null; hoursBefore?: number | null }) | null
  approvalSubmitted?: Switch
  approvalDecision?: Switch
  backInStock?: Switch
  lowStockAlert?: Switch
  quietHours?: ({ enabled?: boolean | null; start?: string | null; end?: string | null }) | null
  updatedAt: string
  createdAt: string
}

const ops = createGlobalOps(emailSchedule, EmailSchedule, {}, {})

export const findEmailSchedule = ops.find as unknown as () => Promise<EmailScheduleDoc | null>
export const updateEmailSchedule = ops.update as unknown as (
  data: Partial<Omit<EmailScheduleDoc, 'id' | 'updatedAt' | 'createdAt'>>,
) => Promise<EmailScheduleDoc>
