import type { Drizzle } from '@/localapi/migrate'

import { loadAdSenseWidget } from './adsense'
import { loadAnalyticsWidget } from './analytics'
import type { EngineArg } from './connection'
import { loadSearchWidget } from './searchConsole'
import { loadSpeedWidget } from './pagespeedSummary'
import type { WidgetKind, WidgetState } from './types'

/** Dispatches one dashboard widget by name. The route checks the admin and the widget name first. */
export async function loadWidget(kind: WidgetKind, engine: EngineArg, db: Drizzle, today: Date = new Date()): Promise<WidgetState<unknown>> {
  switch (kind) {
    case 'search':
      return loadSearchWidget(engine, today)
    case 'analytics':
      return loadAnalyticsWidget(engine, today)
    case 'adsense':
      return loadAdSenseWidget(engine, today)
    case 'speed':
      return loadSpeedWidget(db)
  }
}
