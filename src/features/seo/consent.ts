/**
 * Compatibility exports for the pre-categories consent helper.
 *
 * The banner now lives in features/consent. These names remain because
 * features/seo/index.ts re-exports them. CONSENT_STORAGE_KEY is the OLD key:
 * the new code reads it once, migrates the value, and clears it.
 */

export {
  CONSENT_EVENT,
  LEGACY_CONSENT_STORAGE_KEY as CONSENT_STORAGE_KEY,
} from '@/features/consent/consent'

/** The pre-categories value. New code uses ConsentRecord. */
export type ConsentValue = 'granted' | 'denied'
