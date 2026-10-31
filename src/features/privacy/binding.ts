import { resolveD1Binding } from '@/cms/db/connect'
import type { D1Like } from '@/features/apiKeys'
import { createD1PrivacyStore, type PrivacyStore } from './store'

/** The privacy store on the live D1 binding, for screens and routes that run outside the admin gate. */
export async function privacyBinding(): Promise<{ store: PrivacyStore; d1: D1Like }> {
  const d1 = (await resolveD1Binding()) as unknown as D1Like
  return { store: createD1PrivacyStore(async () => d1), d1 }
}
