/**
 * Proves the things about this feature that cannot be read off the source: that
 * the weighted split actually lands on its weights over a realistic number of
 * visitors, that a visitor is genuinely stuck to their arm, that two tests do
 * not correlate, and that a tampered cookie is rejected.
 *
 * Pure arithmetic and WebCrypto - no database, no engine, no config. Run:
 *   npx tsx src/features/abTesting/selfTest.mts
 *
 * It exits non-zero on failure.
 */
import { assignVariant, bucketOf, newVisitorId, pickVariant } from './assign'
import { decodeVisitor, encodeVisitor, emptyVisitor } from './cookie'
import { goalMatches } from './conversions'
import { buildResults } from './results'
import { MIN_VISITORS_PER_ARM, proportionZ, twoSidedP } from './stats'
import type { ActiveTest, GoalSpec, VariantSpec } from './types'

const results: string[] = []
let failures = 0
const check = (label: string, ok: boolean, detail = '') => {
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` - ${detail}` : ''}`)
  if (!ok) failures += 1
}

const variant = (key: string, weight: number, isControl = false): VariantSpec => ({
  key,
  label: `Variant ${key}`,
  weight,
  isControl,
  pageId: null,
  templateId: null,
})

const N = 10_000

const run = async () => {
  // --- Weighted split -----------------------------------------------------
  const cases: { name: string; variants: VariantSpec[]; tolerance: number }[] = [
    { name: '50/50', variants: [variant('A', 50, true), variant('B', 50)], tolerance: 0.015 },
    { name: '90/10', variants: [variant('A', 90, true), variant('B', 10)], tolerance: 0.015 },
    {
      name: '70/20/10',
      variants: [variant('A', 70, true), variant('B', 20), variant('C', 10)],
      tolerance: 0.015,
    },
    // Relative weights, not percentages: 3:1 must be the same split as 75:25.
    { name: '3:1', variants: [variant('A', 3, true), variant('B', 1)], tolerance: 0.015 },
  ]

  const visitors = Array.from({ length: N }, () => newVisitorId())

  for (const testCase of cases) {
    const counts = new Map<string, number>()
    for (const visitorId of visitors) {
      const key = assignVariant(visitorId, `test-${testCase.name}`, testCase.variants)
      counts.set(key ?? '?', (counts.get(key ?? '?') ?? 0) + 1)
    }

    const total = testCase.variants.reduce((sum, arm) => sum + arm.weight, 0)
    const worst = testCase.variants.reduce((max, arm) => {
      const expected = arm.weight / total
      const actual = (counts.get(arm.key) ?? 0) / N
      return Math.max(max, Math.abs(actual - expected))
    }, 0)

    check(
      `${testCase.name} split lands within ${(testCase.tolerance * 100).toFixed(1)}pp over ${N.toLocaleString()} visitors`,
      worst <= testCase.tolerance,
      `worst arm off by ${(worst * 100).toFixed(2)}pp; got ${[...counts].map(([k, v]) => `${k}=${v}`).join(' ')}`,
    )
  }

  // --- Stickiness ---------------------------------------------------------
  const sticky = [variant('A', 50, true), variant('B', 50)]
  const drifted = visitors.filter((visitorId) => {
    const first = assignVariant(visitorId, 'sticky', sticky)
    for (let repeat = 0; repeat < 5; repeat += 1) {
      if (assignVariant(visitorId, 'sticky', sticky) !== first) return true
    }
    return false
  })
  check('the same visitor gets the same arm on every visit', drifted.length === 0, `${drifted.length} drifted`)

  // The cookie is the fast path, but the hash has to agree with it - otherwise
  // a visitor whose cookie is lost would silently swap arms mid-test.
  const buckets = visitors.slice(0, 1000).map((visitorId) => bucketOf(visitorId, 'sticky'))
  check(
    'bucketing is deterministic and inside [0, 1)',
    buckets.every((value, index) => value === bucketOf(visitors[index], 'sticky') && value >= 0 && value < 1),
  )

  // --- Independence between tests -----------------------------------------
  // Without the test id in the hash, everybody in the low bucket would sit in
  // the first arm of every test at once and every result would correlate.
  const both = visitors.filter(
    (visitorId) =>
      assignVariant(visitorId, 'test-one', sticky) === assignVariant(visitorId, 'test-two', sticky),
  ).length
  check(
    'two tests bucket independently',
    Math.abs(both / N - 0.5) < 0.02,
    `${((both / N) * 100).toFixed(1)}% agreed, expected ~50%`,
  )

  // --- Degenerate weights -------------------------------------------------
  const zeroed = [variant('A', 0, true), variant('B', 0)]
  const zeroCounts = new Set(visitors.slice(0, 500).map((id) => assignVariant(id, 'zero', zeroed)))
  check('all-zero weights fall back to an even split rather than dying', zeroCounts.size === 2)

  const oneArm = [variant('A', 100, true), variant('B', 0)]
  const served = new Set(visitors.map((id) => assignVariant(id, 'onearm', oneArm)))
  check('a zero-weight arm is never served', served.size === 1 && served.has('A'))

  check('an empty variant list picks nothing', pickVariant([], 0.5) === null)

  // --- Cookie -------------------------------------------------------------
  const secret = 'test-secret-value'
  const state = emptyVisitor()
  state.a['12'] = 'B'
  state.c['12:gA'] = 1

  const encoded = await encodeVisitor(state, secret)
  const decoded = await decodeVisitor(encoded, secret)
  check('a signed cookie round-trips', decoded?.id === state.id && decoded?.a['12'] === 'B')

  check('a cookie signed with another secret is rejected', (await decodeVisitor(encoded, 'other')) === null)

  const tampered = encoded.replace(/^./, (first) => (first === 'e' ? 'f' : 'e'))
  check('an edited cookie body is rejected', (await decodeVisitor(tampered, secret)) === null)
  check('junk is rejected', (await decodeVisitor('not-a-cookie', secret)) === null)

  // --- Goal matching ------------------------------------------------------
  const goal = (over: Partial<GoalSpec>): GoalSpec => ({
    key: 'gA',
    label: 'Goal',
    type: 'page-visited',
    path: null,
    selector: null,
    formId: null,
    ...over,
  })

  check(
    'a page goal matches regardless of a trailing slash',
    goalMatches(goal({ path: '/thank-you/' }), { kind: 'page-visited', path: '/thank-you' }),
  )
  check(
    'a page goal does not match another path',
    !goalMatches(goal({ path: '/thank-you' }), { kind: 'page-visited', path: '/basket' }),
  )
  check(
    'a form goal with no form named counts any form',
    goalMatches(goal({ type: 'form-submitted' }), { kind: 'form-submitted', formId: '9' }),
  )
  check(
    'a form goal naming a form ignores other forms',
    !goalMatches(goal({ type: 'form-submitted', formId: '3' }), { kind: 'form-submitted', formId: '9' }),
  )

  // --- Honesty about significance -----------------------------------------
  const test: ActiveTest = {
    id: '1',
    name: 'Hero copy',
    scope: 'page',
    pageId: '1',
    targetPath: '/',
    blockId: null,
    variants: [variant('A', 50, true), variant('B', 50)],
    goals: [goal({ type: 'element-clicked', selector: '.cta' })],
  }

  const rows = (a: [number, number], b: [number, number]) => [
    { test_id: '1', variant_key: 'A', goal_key: '', visitors: a[0], conversions: 0, value_total: 0 },
    { test_id: '1', variant_key: 'B', goal_key: '', visitors: b[0], conversions: 0, value_total: 0 },
    { test_id: '1', variant_key: 'A', goal_key: 'gA', visitors: 0, conversions: a[1], value_total: 0 },
    { test_id: '1', variant_key: 'B', goal_key: 'gA', visitors: 0, conversions: b[1], value_total: 0 },
  ]

  const tiny = buildResults(test, rows([8, 2], [7, 5]))[0]
  check(
    'a 71% vs 25% rate on fifteen visitors is refused, not celebrated',
    tiny.readiness === 'too-few' && /Too early/.test(tiny.verdict),
    tiny.verdict,
  )

  const nothing = buildResults(test, rows([0, 0], [0, 0]))[0]
  check('an untouched test says so', nothing.readiness === 'no-data')

  const flat = buildResults(test, rows([5000, 500], [5000, 510]))[0]
  check(
    'a 2% lift on ten thousand visitors is reported as inconclusive with a target',
    flat.readiness === 'inconclusive' && (flat.neededPerArm ?? 0) > 5000,
    `${flat.neededPerArm} needed per arm`,
  )

  const clear = buildResults(test, rows([5000, 500], [5000, 650]))[0]
  check(
    'a 30% lift on ten thousand visitors clears the bar',
    clear.readiness === 'significant' && /not a proof/.test(clear.verdict),
  )
  check(
    'and the significant verdict still warns about repeated checking',
    /checked repeatedly/.test(clear.verdict),
  )

  check(
    'the arm size floor is enforced',
    buildResults(test, rows([MIN_VISITORS_PER_ARM - 1, 30], [5000, 650]))[0].readiness === 'too-few',
  )

  // Sanity on the maths itself against a hand-checkable case.
  const z = proportionZ(500, 5000, 650, 5000)
  check('the z-test agrees with a hand calculation', z !== null && Math.abs(z - 4.7) < 0.2, String(z))
  check('p-values are two-sided and bounded', twoSidedP(1.96) > 0.049 && twoSidedP(1.96) < 0.051)

  console.log(results.join('\n'))
  console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILED`)
  process.exit(failures === 0 ? 0 : 1)
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
