import { EmailTemplates } from '@/globals/EmailTemplates'

import { createGlobalOps } from '../generic'
import { emailTemplates } from '../schema'

/**
 * The `email-templates` global (src/globals/EmailTemplates.ts): one group per email, each with a subject and a body.
 * A blank subject or body means the built-in text (src/features/email/templateDefaults.ts).
 */
type TemplateGroup = { subject?: string | null; body?: string | null } | null

export type EmailTemplatesDoc = {
  id: number
  accountReset?: TemplateGroup
  accountAlreadyRegistered?: TemplateGroup
  accountWelcome?: TemplateGroup
  membershipRenewal?: TemplateGroup
  approvalSubmitted?: TemplateGroup
  approvalDecision?: TemplateGroup
  rsvpConfirmation?: TemplateGroup
  updatedAt: string
  createdAt: string
}

const ops = createGlobalOps(emailTemplates, EmailTemplates, {}, {})

export const findEmailTemplates = ops.find as unknown as () => Promise<EmailTemplatesDoc | null>
export const updateEmailTemplates = ops.update as unknown as (
  data: Partial<Omit<EmailTemplatesDoc, 'id' | 'updatedAt' | 'createdAt'>>,
) => Promise<EmailTemplatesDoc>
