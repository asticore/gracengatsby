import { abCookieHeader, recordConversion, resolveAbContext } from './runtime'
import type { AbContext, ActiveTest, GoalSpec } from './types'

/**
 * Turning "something happened" into "goal G of test T converted".
 *
 * A goal is scored against the tests the visitor is *already* in, never
 * against the test running on the page where the goal fired. Somebody bucketed
 * into a homepage test who later reaches /thank-you must have that purchase
 * credited to the homepage arm they saw, which is the entire reason the cookie
 * carries assignments for tests that have nothing to do with the current page.
 */

export type Trigger =
  | { kind: 'page-visited'; path: string }
  | { kind: 'element-clicked'; selector: string }
  | { kind: 'form-submitted'; formId?: string | null }
  | { kind: 'order-placed'; value?: number }

const samePath = (left: string | null, right: string): boolean => {
  if (!left) return false
  const clean = (value: string) => {
    const path = value.split('?')[0].replace(/\/+$/, '')
    return path === '' ? '/' : path
  }
  return clean(left) === clean(right)
}

/** Does this goal describe what just happened? */
export const goalMatches = (goal: GoalSpec, trigger: Trigger): boolean => {
  switch (trigger.kind) {
    case 'page-visited':
      return goal.type === 'page-visited' && samePath(goal.path, trigger.path)
    case 'element-clicked':
      // The browser reports which of the goal's own selectors matched, so this
      // is a comparison rather than a second round of selector parsing here.
      return goal.type === 'element-clicked' && goal.selector === trigger.selector
    case 'form-submitted':
      // A goal with no form named counts any form: the common case is a site
      // with one enquiry form and no wish to name it twice.
      return goal.type === 'form-submitted' && (!goal.formId || goal.formId === String(trigger.formId ?? ''))
    case 'order-placed':
      return goal.type === 'order-placed'
    default:
      return false
  }
}

const valueOf = (trigger: Trigger): number =>
  trigger.kind === 'order-placed' && Number.isFinite(trigger.value) ? Number(trigger.value) : 0

/**
 * Scores one trigger against every test the visitor is in.
 *
 * Returns how many conversions were actually written - repeats are dropped
 * inside recordConversion, so calling this on every page view of a thank-you
 * page still counts one conversion per visitor.
 */
export const applyTrigger = async (context: AbContext, trigger: Trigger): Promise<number> => {
  if (!context.enabled) return 0

  const tests: ActiveTest[] = context.allTests.filter((test) => context.assignments[test.id])
  let written = 0

  for (const test of tests) {
    for (const goal of test.goals) {
      if (!goalMatches(goal, trigger)) continue
      if (await recordConversion(context, test.id, goal.key, valueOf(trigger))) written += 1
    }
  }

  return written
}

type Engine = Parameters<typeof resolveAbContext>[0]

const parseTrigger = (body: Record<string, unknown>): Trigger | null => {
  const kind = body.kind
  if (kind === 'page-visited' && typeof body.path === 'string') return { kind, path: body.path }
  if (kind === 'element-clicked' && typeof body.selector === 'string') return { kind, selector: body.selector }
  if (kind === 'form-submitted') return { kind, formId: typeof body.formId === 'string' ? body.formId : null }
  return null
}

/**
 * The endpoint the browser tracker posts to.
 *
 * `order-placed` is deliberately not accepted here. Money is scored server-side
 * from the order itself (see recordOrderConversion) - a value the page could
 * post would be a number an attacker chooses, and the resulting revenue-per-
 * variant chart would be worth nothing.
 *
 * Always 204, whatever happened. The response tells the page nothing about
 * which test it is in or whether the goal counted, because the page has no use
 * for either and both are levers for probing the cookie.
 */
export const handleTrackRequest = async (engine: Engine, request: Request): Promise<Response> => {
  const noContent = (cookie: string | null): Response =>
    new Response(null, { status: 204, headers: cookie ? { 'Set-Cookie': cookie } : {} })

  if (request.method !== 'POST') return new Response(null, { status: 405 })

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return noContent(null)
  }

  const trigger = parseTrigger(body)
  if (!trigger) return noContent(null)

  const context = await resolveAbContext(engine, request)
  await applyTrigger(context, trigger)

  // The dedupe set changed, so the cookie has to go back or the next identical
  // event would be counted a second time.
  return noContent(await abCookieHeader(context, request))
}

/**
 * Scores an order against whatever tests its buyer is in.
 *
 * Called from the shop's own order hook rather than from the browser, so the
 * amount is the amount that was actually charged. The cookie cannot be written
 * back from there, which means an order-placed goal is deduped by the events
 * table's unique index rather than by the visitor's dedupe set - one order is
 * one event either way.
 */
export const recordOrderConversion = async (
  engine: Engine,
  request: Request,
  total: number,
): Promise<number> => {
  const context = await resolveAbContext(engine, request)
  return applyTrigger(context, { kind: 'order-placed', value: total })
}
