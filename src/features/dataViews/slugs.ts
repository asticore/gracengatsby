/** Slugs, table name and public paths for Tables and charts. One place, so the collection, migration and readers cannot drift. */

export const DATA_VIEWS_SLUG = 'data-views'
export const DATA_VIEWS_TABLE = 'eg_data_views'

/** Shareable, frameable page: /embed/data/<id-or-slug>. */
export const EMBED_PATH_PREFIX = '/embed/data/'
/** Data endpoint: /api/data-view/<id-or-slug>.csv or .json. */
export const DATA_ENDPOINT_PREFIX = '/api/data-view/'

/** The postMessage type an embedded view sends to its parent so the iframe can grow to fit. */
export const RESIZE_MESSAGE_TYPE = 'eg-data-view-resize'
