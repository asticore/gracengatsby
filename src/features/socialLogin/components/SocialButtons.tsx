import React from 'react'

import type { PublicProvider } from '../settings'

/**
 * "Continue with ..." buttons. Rendered only for providers that are switched on
 * AND fully configured (the caller passes exactly those); with none, nothing is
 * drawn at all. Plain links: the start route does the redirect.
 */
export const SocialButtons: React.FC<{
  providers: PublicProvider[]
  next?: string
  area?: 'account' | 'admin'
  verb?: string
}> = ({ providers, next, area = 'account', verb = 'Continue with' }) => {
  if (providers.length === 0) return null
  return (
    <div className="account-social" data-testid="social-buttons">
      <p className="account-social__or">or</p>
      <ul className="account-social__list" style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: '0.5rem' }}>
        {providers.map((provider) => {
          const query = new URLSearchParams({ area })
          if (next) query.set('next', next)
          return (
            <li key={provider.id}>
              <a className={`btn btn--ghost account-social__button account-social__button--${provider.id}`} href={`/api/social/${provider.id}/start?${query.toString()}`}>
                {verb} {provider.label}
              </a>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
