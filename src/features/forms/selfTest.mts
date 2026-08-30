/**
 * Exercises the two pieces that had to be written from scratch: the calculation
 * parser and the conditional-logic evaluator, plus the sanitiser that joins
 * them and the pricing built on top.
 *
 * Run with:
 *   npx tsx src/features/forms/selfTest.mts
 *
 * A standalone script rather than a vitest spec because these functions have no
 * dependencies at all - no engine, no database, no DOM - so the whole point is
 * that they can be checked without any of the harness the rest of the suite
 * needs. It exits non-zero on failure, so CI can run it as-is.
 */

import assert from 'node:assert/strict'

// Imported module by module rather than through the feature's index, so the
// test pulls in only the pure logic and never a React component.
const { applyCalculations, resolveVisibility, sanitiseValues, splitIntoPages } = await import('./conditions.ts')
const { evaluateFormula, parseFormula } = await import('./expression.ts')
const { priceSubmission } = await import('./pricing.ts')
const { buildCsv } = await import('./csv.ts')
const { checkFillTime, checkHoneypot } = await import('./spam.ts')

let passed = 0
let failed = 0

const test = (name: string, fn: () => void) => {
  try {
    fn()
    passed += 1
  } catch (error) {
    failed += 1
    console.error(`FAIL  ${name}\n      ${(error as Error).message.split('\n')[0]}`)
  }
}

// --- the expression parser --------------------------------------------------

test('arithmetic and precedence', () => {
  assert.equal(evaluateFormula('2 + 3 * 4', {}), 14)
  assert.equal(evaluateFormula('(2 + 3) * 4', {}), 20)
  assert.equal(evaluateFormula('10 - 2 - 3', {}), 5) // left associative
  assert.equal(evaluateFormula('2 * 3 % 4', {}), 2)
  assert.equal(evaluateFormula('-4 + 10', {}), 6)
  assert.equal(evaluateFormula('--4', {}), 4)
  assert.equal(evaluateFormula('1.5 * 2', {}), 3)
  assert.equal(evaluateFormula('.5 + .5', {}), 1)
})

test('field references, bare and braced', () => {
  assert.equal(evaluateFormula('guests * 25', { guests: 4 }), 100)
  assert.equal(evaluateFormula('{number of guests} * 25', { 'number of guests': 3 }), 75)
  assert.equal(evaluateFormula('a + b * c', { a: 1, b: 2, c: 3 }), 7)
})

test('values are coerced the way a half-filled form needs', () => {
  assert.equal(evaluateFormula('n + 1', {}), 1, 'missing field is 0')
  assert.equal(evaluateFormula('n + 1', { n: '' }), 1, 'blank field is 0')
  assert.equal(evaluateFormula('n * 2', { n: '$1,250.50' }), 2501, 'currency text is stripped')
  assert.equal(evaluateFormula('n + 1', { n: true }), 2, 'a ticked box is 1')
  assert.equal(evaluateFormula('n * 10', { n: ['a', 'b', 'c'] }), 30, 'a multi-select counts its choices')
  assert.equal(evaluateFormula('n + 1', { n: 'not a number' }), 1)
})

test('division by an empty field yields 0, never Infinity or NaN', () => {
  assert.equal(evaluateFormula('10 / n', { n: 0 }), 0)
  assert.equal(evaluateFormula('10 / n', {}), 0)
  assert.equal(evaluateFormula('10 % n', { n: 0 }), 0)
  assert.ok(Number.isFinite(evaluateFormula('10 / 0', {})))
})

test('bad formulas are reported, not thrown, and never run as code', () => {
  const cases = [
    '',
    '2 +',
    '(2 + 3',
    '2 + 3)',
    'alert("x")',
    'process.exit(1)',
    'a["b"]',
    '1; console.log(2)',
    'constructor',
    '{unclosed',
    '2 ** 3',
    'a === b',
  ]
  for (const formula of cases) {
    const result = parseFormula(formula)
    if (formula === 'constructor') {
      // A bare identifier is a field reference, nothing more - it resolves to 0
      // rather than to anything on Object.prototype.
      assert.equal(result.ok, true)
      assert.equal(evaluateFormula(formula, {}), 0)
      continue
    }
    if (formula === 'alert("x")' || formula === 'process.exit(1)' || formula === 'a["b"]') {
      assert.equal(result.ok, false, `${formula} must not parse`)
      continue
    }
    assert.equal(result.ok, false, `${formula} must not parse`)
  }
})

test('a formula reports the fields it uses', () => {
  const result = parseFormula('{a} + b * (a - 2)')
  assert.equal(result.ok, true)
  if (result.ok) assert.deepEqual(result.refs.sort(), ['a', 'b'])
})

// --- conditional logic ------------------------------------------------------

const field = (over: Record<string, unknown>) => ({ type: 'text', ...over }) as never

test('every operator', () => {
  const rules = [
    { op: 'equals', value: 'yes', actual: 'YES', expect: true },
    { op: 'equals', value: 'yes', actual: 'no', expect: false },
    { op: 'notEquals', value: 'yes', actual: 'no', expect: true },
    { op: 'contains', value: 'ell', actual: 'hello', expect: true },
    { op: 'notContains', value: 'zzz', actual: 'hello', expect: true },
    { op: 'greaterThan', value: '5', actual: '10', expect: true },
    { op: 'greaterThan', value: '5', actual: '2', expect: false },
    { op: 'lessThan', value: '5', actual: '2', expect: true },
    { op: 'isEmpty', value: '', actual: '  ', expect: true },
    { op: 'isNotEmpty', value: '', actual: 'x', expect: true },
  ]

  for (const entry of rules) {
    const fields = [
      field({ name: 'source' }),
      field({
        name: 'target',
        conditional: {
          enabled: true,
          action: 'show',
          rules: [{ field: 'source', operator: entry.op, value: entry.value }],
        },
      }),
    ]
    const visible = resolveVisibility(fields, { source: entry.actual })
    assert.equal(visible.has('target'), entry.expect, `${entry.op} ${entry.actual} vs ${entry.value}`)
  }
})

test('multi-select values match on membership', () => {
  const fields = [
    field({ name: 'extras' }),
    field({
      name: 'note',
      conditional: { enabled: true, action: 'show', rules: [{ field: 'extras', operator: 'equals', value: 'meal' }] },
    }),
  ]
  assert.ok(resolveVisibility(fields, { extras: ['bed', 'meal'] }).has('note'))
  assert.ok(!resolveVisibility(fields, { extras: ['bed'] }).has('note'))
})

test('all vs any, and the hide action', () => {
  const make = (match: string, action: string) => [
    field({ name: 'a' }),
    field({ name: 'b' }),
    field({
      name: 'target',
      conditional: {
        enabled: true,
        action,
        match,
        rules: [
          { field: 'a', operator: 'equals', value: '1' },
          { field: 'b', operator: 'equals', value: '2' },
        ],
      },
    }),
  ]

  assert.ok(resolveVisibility(make('all', 'show'), { a: '1', b: '2' }).has('target'))
  assert.ok(!resolveVisibility(make('all', 'show'), { a: '1', b: 'x' }).has('target'))
  assert.ok(resolveVisibility(make('any', 'show'), { a: '1', b: 'x' }).has('target'))
  assert.ok(!resolveVisibility(make('all', 'hide'), { a: '1', b: '2' }).has('target'))
  assert.ok(resolveVisibility(make('all', 'hide'), { a: '1', b: 'x' }).has('target'))
})

test('logic switched on with no rules leaves the field visible', () => {
  const fields = [field({ name: 'target', conditional: { enabled: true, action: 'show', rules: [] } })]
  assert.ok(resolveVisibility(fields, {}).has('target'))
})

test('hiding a field cascades to the fields that depend on it', () => {
  const fields = [
    field({ name: 'a' }),
    field({
      name: 'b',
      conditional: { enabled: true, action: 'show', rules: [{ field: 'a', operator: 'equals', value: 'go' }] },
    }),
    field({
      name: 'c',
      conditional: { enabled: true, action: 'show', rules: [{ field: 'b', operator: 'isNotEmpty' }] },
    }),
  ]

  const shown = resolveVisibility(fields, { a: 'go', b: 'filled' })
  assert.ok(shown.has('b') && shown.has('c'))

  // `a` no longer says "go", so b hides - and c, which only exists because b
  // had a value, must hide with it even though b's value is still in the data.
  const hidden = resolveVisibility(fields, { a: 'stop', b: 'filled' })
  assert.ok(!hidden.has('b') && !hidden.has('c'))
})

test('a cycle settles instead of hanging', () => {
  const fields = [
    field({
      name: 'a',
      conditional: { enabled: true, action: 'show', rules: [{ field: 'b', operator: 'isNotEmpty' }] },
    }),
    field({
      name: 'b',
      conditional: { enabled: true, action: 'show', rules: [{ field: 'a', operator: 'isNotEmpty' }] },
    }),
  ]
  const visible = resolveVisibility(fields, { a: 'x', b: 'y' })
  assert.ok(visible instanceof Set)
})

// --- calculations over conditional fields -----------------------------------

test('calculations chain and round', () => {
  const fields = [
    field({ name: 'nights', type: 'number' }),
    field({ name: 'rate', type: 'number' }),
    field({ name: 'sub', type: 'calculation', calculation: { formula: 'nights * rate', decimalPlaces: 2 } }),
    field({ name: 'gst', type: 'calculation', calculation: { formula: 'sub * 0.1', decimalPlaces: 2 } }),
    field({ name: 'total', type: 'calculation', calculation: { formula: 'sub + gst', decimalPlaces: 2 } }),
  ]

  const out = applyCalculations(fields, { nights: 3, rate: 149.95 })
  assert.equal(out.sub, 449.85)
  assert.equal(out.gst, 44.99)
  assert.equal(out.total, 494.84)
})

test('a hidden calculation is 0, not a stale number', () => {
  const fields = [
    field({ name: 'wants', type: 'checkbox' }),
    field({ name: 'qty', type: 'number' }),
    field({
      name: 'extra',
      type: 'calculation',
      calculation: { formula: 'qty * 10' },
      conditional: { enabled: true, action: 'show', rules: [{ field: 'wants', operator: 'equals', value: 'true' }] },
    }),
  ]

  const shown = sanitiseValues(fields, { wants: true, qty: 5 })
  assert.equal(shown.values.extra, 50)

  const hiddenResult = sanitiseValues(fields, { wants: false, qty: 5 })
  assert.equal(hiddenResult.values.extra, 0)
})

// --- the server-side guarantee ----------------------------------------------

test('a hidden field cannot be submitted', () => {
  const fields = [
    field({ name: 'kind' }),
    field({
      name: 'secret',
      conditional: { enabled: true, action: 'show', rules: [{ field: 'kind', operator: 'equals', value: 'open' }] },
    }),
  ]

  const honest = sanitiseValues(fields, { kind: 'open', secret: 'kept' })
  assert.equal(honest.values.secret, 'kept')

  // The same request with `kind` set to anything else - the browser would never
  // have shown `secret`, so the server must drop it.
  const forged = sanitiseValues(fields, { kind: 'closed', secret: 'smuggled' })
  assert.equal('secret' in forged.values, false)
})

test('a submitted calculation is recomputed, not trusted', () => {
  const fields = [
    field({ name: 'qty', type: 'number' }),
    field({ name: 'price', type: 'calculation', calculation: { formula: 'qty * 100' } }),
  ]
  const out = sanitiseValues(fields, { qty: 2, price: 0.01 })
  assert.equal(out.values.price, 200)
})

test('unknown keys in a request are discarded', () => {
  const fields = [field({ name: 'name' })]
  const out = sanitiseValues(fields, { name: 'Ada', injected: 'nope' })
  assert.equal('injected' in out.values, false)
})

// --- pricing ----------------------------------------------------------------

test('base price, flat, per-unit and option pricing add up', () => {
  const form = {
    id: 1,
    title: 'Booking',
    payment: { purchasable: true, basePrice: 20, currency: 'AUD' },
    fields: [
      field({ name: 'nights', type: 'number', pricing: { priced: true, unitPrice: 150 } }),
      field({ name: 'rush', type: 'checkbox', pricing: { priced: true, amount: 35 } }),
      field({
        name: 'room',
        type: 'select',
        options: [
          { label: 'Standard', value: 'std', price: 0 },
          { label: 'Deluxe', value: 'deluxe', price: 80 },
        ],
      }),
    ],
  } as never

  const values = { nights: 3, rush: true, room: 'deluxe' }
  const pricing = priceSubmission(form, values, new Set(['nights', 'rush', 'room']))
  assert.equal(pricing.total, 20 + 450 + 35 + 80)
  assert.equal(pricing.currency, 'AUD')
})

test('a hidden priced field is not charged for', () => {
  const form = {
    id: 1,
    title: 'Booking',
    payment: { purchasable: true, basePrice: 10, currency: 'AUD' },
    fields: [field({ name: 'addon', type: 'checkbox', pricing: { priced: true, amount: 99 } })],
  } as never

  assert.equal(priceSubmission(form, { addon: true }, new Set(['addon'])).total, 109)
  assert.equal(priceSubmission(form, { addon: true }, new Set()).total, 10)
})

test('a non-purchasable form is free no matter what its fields say', () => {
  const form = {
    id: 1,
    title: 'Contact',
    fields: [field({ name: 'x', pricing: { priced: true, amount: 500 } })],
  } as never
  assert.equal(priceSubmission(form, { x: 'y' }).total, 0)
})

// --- spam -------------------------------------------------------------------

test('honeypot', () => {
  assert.equal(checkHoneypot('', true).spam, false)
  assert.equal(checkHoneypot('bot was here', true).spam, true)
  assert.equal(checkHoneypot('bot was here', false).spam, false, 'off means off')
})

test('minimum fill time', () => {
  const now = 100_000
  assert.equal(checkFillTime(now - 1000, 3, now).spam, true, 'one second is too fast')
  assert.equal(checkFillTime(now - 9000, 3, now).spam, false)
  assert.equal(checkFillTime(undefined, 3, now).spam, false, 'no stamp fails open')
  assert.equal(checkFillTime(now + 5000, 3, now).spam, false, 'clock skew fails open')
  assert.equal(checkFillTime(now - 1, 0, now).spam, false, 'disabled')
})

// --- pages and CSV ----------------------------------------------------------

test('page breaks split the form and are not themselves fields', () => {
  const fields = [field({ name: 'a' }), field({ type: 'page' }), field({ name: 'b' }), field({ name: 'c' })]
  const pages = splitIntoPages(fields)
  assert.equal(pages.length, 2)
  assert.equal(pages[0].length, 1)
  assert.equal(pages[1].length, 2)
  assert.equal(splitIntoPages([field({ name: 'a' })]).length, 1)
})

test('CSV keeps a stable shape and defuses spreadsheet formulas', () => {
  const form = {
    id: 1,
    title: 'Enquiry',
    fields: [
      field({ name: 'name', label: 'Your name' }),
      field({ name: 'note', label: 'Note' }),
      field({ type: 'section', label: 'Heading' }),
    ],
  } as never

  const csv = buildCsv(form, [
    { id: 1, createdAt: '2026-08-01', ip: '1.2.3.4', values: { name: 'Ada, Lovelace', note: 'hi' } },
    { id: 2, createdAt: '2026-08-02', ip: '1.2.3.5', values: { name: '=cmd|calc', legacy: 'old field' } },
  ])

  const lines = csv.trim().split('\r\n')
  assert.ok(lines[0].startsWith('Entry ID,Submitted,IP address,Your name,Note,legacy,'))
  assert.ok(lines[1].includes('"Ada, Lovelace"'), 'a comma is quoted')
  assert.ok(lines[2].includes('\t=cmd|calc'), 'a leading = is neutralised')
  assert.equal(lines.length, 3, 'a presentational field adds no column and no row')
})

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
