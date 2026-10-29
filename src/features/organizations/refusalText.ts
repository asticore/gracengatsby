import type { PortalStringKey } from '@/features/multilingual/portalStrings'

import type { Refusal } from './service'

/**
 * A refusal sentence for the customer portal, in the visitor's language. The
 * English text is REFUSAL_MESSAGES in `service.ts`, which admin screens keep.
 */
export const refusalText = (code: Refusal, tx: (key: PortalStringKey) => string): string => tx(`orgs.refusal.${code}` as PortalStringKey)
