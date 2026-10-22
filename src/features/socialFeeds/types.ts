export const SOCIAL_PROVIDERS = ['instagram', 'facebook', 'pinterest', 'tiktok', 'youtube', 'rss'] as const
export type SocialProvider = (typeof SOCIAL_PROVIDERS)[number]

/** A connected account as read from the Integrations global. `token` is server-side only. */
export type SocialAccount = {
  id: string
  provider: SocialProvider
  label: string
  accountId: string
  token: string
}

/** One post, normalised across providers. Everything here is safe to render publicly. */
export type SocialPost = {
  id: string
  url: string
  imageUrl: string
  caption: string
  /** ISO timestamp, or '' when the provider gave none. */
  date: string
  likes: number | null
  video: boolean
}

export type AdapterRequest = { url: string; init: { method: string; headers?: Record<string, string>; body?: string } }

export type SocialAdapter = {
  provider: SocialProvider
  /** Exact hostnames (or, when it starts with a dot, any subdomain) the request may go to. */
  hosts: string[]
  /** Hosts (dot suffixes) images may come from. */
  imageHosts: string[]
  buildRequest: (account: SocialAccount, limit: number) => AdapterRequest
  parse: (body: string, account: SocialAccount) => SocialPost[]
}
