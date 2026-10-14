import { EmailBrand } from '@/globals/EmailBrand'

import { createGlobalOps } from '../generic'
import { emailBrand } from '../schema'

/**
 * The `email-brand` global (src/globals/EmailBrand.ts): the logo, colours, font and footer for designed emails.
 * Read by src/features/email/templateLoad.ts through the engine; the ops here serve the registry.
 */
export type EmailBrandDoc = {
  id: number
  enabled?: boolean | null
  logo?: number | { id: number; url?: string | null } | null
  logoWidth?: number | null
  accent?: string | null
  textColor?: string | null
  background?: string | null
  contentBackground?: string | null
  fontStack?: string | null
  buttonRadius?: number | null
  footerText?: string | null
  address?: string | null
  updatedAt: string
  createdAt: string
}

const ops = createGlobalOps(emailBrand, EmailBrand, {}, {})

export const findEmailBrand = ops.find as unknown as () => Promise<EmailBrandDoc | null>
export const updateEmailBrand = ops.update as unknown as (
  data: Partial<Omit<EmailBrandDoc, 'id' | 'updatedAt' | 'createdAt'>>,
) => Promise<EmailBrandDoc>
