import { googleGet } from '../fetchJson'
import { googlePost } from './post'
import type { EngineArg } from './connection'

/**
 * The two ways the widgets talk to Google. The live one is used by the routes; tests pass a fake so no
 * network call is made. googleGet (GET) comes from the connection code; googlePost (POST) is the
 * Search Console and Analytics Data report call.
 */

export type GoogleRequester = {
  get: (engine: EngineArg, url: string) => Promise<unknown>
  post: (engine: EngineArg, url: string, body: unknown) => Promise<unknown>
}

export const liveRequester: GoogleRequester = {
  get: (engine, url) => googleGet(engine, url),
  post: (engine, url, body) => googlePost(engine, url, body),
}
