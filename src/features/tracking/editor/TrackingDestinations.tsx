'use client'

import { useAdminT } from '@/admin/i18n/AdminUiProvider'

import type { TrackingDestination, TrackingDestinationId } from './domains'

/** The brand names are not translated. Everything around them is. */
const NAMES: Record<TrackingDestinationId, string> = {
  meta: 'Meta pixel (Facebook and Instagram ads)',
  ga4: 'Google Analytics 4',
  gtm: 'Google Tag Manager',
  tiktok: 'TikTok pixel',
}

/**
 * Read-only: where the tracking events go. Each destination is on when its ID is connected on Integrations, and the
 * count is the enabled events it receives. Change the connections on Integrations, not here.
 */
export function TrackingDestinations({ destinations }: { destinations: TrackingDestination[] }): React.ReactElement {
  const t = useAdminT()
  return (
    <section aria-labelledby="tracking-destinations-title" className="settings-page__section" style={{ padding: 16, marginTop: 16 }}>
      <h2 id="tracking-destinations-title" style={{ fontSize: 16, margin: '0 0 4px' }}>{t('tracking.destinations.title')}</h2>
      <p style={{ margin: '0 0 12px', color: '#6b7280', fontSize: 13 }}>{t('tracking.destinations.help')}</p>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
        <tbody>
          {destinations.map((d) => (
            <tr key={d.id} style={{ borderTop: '1px solid #e5e7eb' }}>
              <td style={{ padding: '8px 0' }}>{NAMES[d.id]}</td>
              <td style={{ padding: '8px 0', color: d.on ? '#15803d' : '#6b7280' }}>{d.on ? t('tracking.tags.on') : t('tracking.destinations.notConnected')}</td>
              <td style={{ padding: '8px 0', textAlign: 'right' }}>{d.on ? t('tracking.destinations.routed', { count: d.events }) : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
