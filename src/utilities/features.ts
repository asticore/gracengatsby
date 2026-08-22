import { getPayloadClient } from '@/lib/payload'

export type FeatureFlags = {
  ecommerce: boolean
  events: boolean
  blog: boolean
  faq: boolean
  accounts: boolean
  lms: boolean
}

const DEFAULTS: FeatureFlags = {
  ecommerce: true,
  events: true,
  blog: false,
  faq: false,
  accounts: false,
  lms: false,
}

export const getFeatureFlags = async (): Promise<FeatureFlags> => {
  const payload = await getPayloadClient()
  const settings = await payload.findGlobal({ slug: 'site-settings', depth: 0 }).catch((): null => null)
  const features = settings?.features

  return {
    ecommerce: features?.ecommerce ?? DEFAULTS.ecommerce,
    events: features?.events ?? DEFAULTS.events,
    blog: features?.blog ?? DEFAULTS.blog,
    faq: features?.faq ?? DEFAULTS.faq,
    accounts: features?.accounts ?? DEFAULTS.accounts,
    lms: features?.lms ?? DEFAULTS.lms,
  }
}
