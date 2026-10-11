/** Slugs and table names for the Ads feature. One place, so the collection, migration and readers cannot drift. */

export const AD_UNITS_SLUG = 'ad-units'
export const AD_PLACEMENTS_SLUG = 'ad-placements'
export const AD_SETTINGS_SLUG = 'ad-settings'

export const AD_UNITS_TABLE = 'eg_ad_units'
export const AD_PLACEMENTS_TABLE = 'eg_ad_placements'
export const AD_SETTINGS_TABLE = 'eg_ad_settings'
/** Raw counter table written from POST /api/ad-track. Not a collection. */
export const AD_STATS_TABLE = 'eg_ad_stats'

export const ADS_FEATURE_KEY = 'ads'

/** Public tracking endpoint. */
export const AD_TRACK_PATH = '/api/ad-track'
