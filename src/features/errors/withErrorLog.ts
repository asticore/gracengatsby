import { logError } from './log'

/**
 * Wraps a route handler so that a thrown error, or a 5xx answer, is written to
 * the error log. The response or the error is passed on unchanged, so the
 * route behaves exactly as it did before.
 *
 * Use it on the routes where a failure costs money or a booking, such as the
 * payment webhooks, and leave the rest alone.
 */
export function withErrorLog<Args extends unknown[]>(
  handler: (request: Request, ...args: Args) => Promise<Response>,
  source: string,
): (request: Request, ...args: Args) => Promise<Response> {
  return async (request: Request, ...args: Args): Promise<Response> => {
    const path = safePath(request)
    const userAgent = request.headers.get('user-agent') ?? undefined
    try {
      const response = await handler(request, ...args)
      if (response.status >= 500) {
        await logError({ source, message: `The route answered with HTTP ${response.status}.`, path, userAgent })
      }
      return response
    } catch (error) {
      await logError({ source, message: error instanceof Error ? error.message : String(error), error, path, userAgent })
      throw error
    }
  }
}

function safePath(request: Request): string {
  try {
    return new URL(request.url).pathname
  } catch {
    return ''
  }
}