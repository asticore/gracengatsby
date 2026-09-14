// No `@vitest-environment node` / `@/engage.config` ceremony here (compare
// e.g. cms-db-events.int.spec.ts, which needs both to enter the real
// @/engine <-> @/engage.config circular import against a live D1 db):
// src/localapi/validators.ts has zero dependency on @/engine, @/engage.config,
// or the database - it's pure functions over plain JS values, so the
// default jsdom environment this repo's vitest.config.mts already runs
// under is enough. There's no tests/unit/ directory in this repo (only
// tests/int, tests/e2e, tests/helpers - checked before adding this file),
// and vitest.config.mts's `include` only picks up `tests/int/**/*.int.spec.ts`
// anyway, so this lives here rather than in a new top-level convention.
import { describe, expect, it } from 'vitest'

import { array, blocks, checkbox, date, email, fieldValidators, getDefaultValidator, json, number, relationship, richText, select, text, textarea, upload } from '@/localapi/validators'

describe('localapi/validators - fieldValidators lookup table', () => {
  it('exposes exactly the 13 in-scope field types', () => {
    expect(Object.keys(fieldValidators).sort()).toEqual(
      ['array', 'blocks', 'checkbox', 'date', 'email', 'json', 'number', 'relationship', 'richText', 'select', 'text', 'textarea', 'upload'].sort(),
    )
  })

  it('getDefaultValidator looks up by field type, and returns undefined for an out-of-scope type', () => {
    expect(getDefaultValidator('text')).toBe(text)
    expect(getDefaultValidator('password')).toBeUndefined()
    expect(getDefaultValidator('nonsense')).toBeUndefined()
  })
})

describe('text', () => {
  it('passes a valid string within bounds', () => {
    expect(text('hello', { minLength: 2, maxLength: 10 })).toBe(true)
  })

  it('fails a string longer than maxLength', () => {
    expect(text('this is way too long', { maxLength: 5 })).not.toBe(true)
  })

  it('fails a string shorter than minLength', () => {
    expect(text('ab', { minLength: 5 })).not.toBe(true)
  })

  it('required: true fails on empty string', () => {
    expect(text('', { required: true })).not.toBe(true)
  })

  it('required: true fails on undefined', () => {
    expect(text(undefined, { required: true })).not.toBe(true)
  })

  it('required: false passes on undefined/null immediately (no length checks run)', () => {
    expect(text(undefined, { required: false, minLength: 5 })).toBe(true)
    expect(text(null, { required: false, minLength: 5 })).toBe(true)
  })

  it('hasMany: validates every entry\'s length, and validates row count first', () => {
    expect(text(['ok', 'also-ok'], { hasMany: true, maxLength: 20 })).toBe(true)
    expect(text(['ok', 'this-one-is-too-long'], { hasMany: true, maxLength: 5 })).not.toBe(true)
    expect(text(['a'], { hasMany: true, minRows: 2 })).not.toBe(true)
    expect(text(['a', 'b', 'c'], { hasMany: true, maxRows: 2 })).not.toBe(true)
  })

  it('required fails on an empty array even though `[]` is truthy', () => {
    expect(text([], { required: true, hasMany: true })).not.toBe(true)
  })
})

describe('textarea', () => {
  it('passes a valid value', () => {
    expect(textarea('some notes', {})).toBe(true)
  })

  it('fails a value longer than maxLength', () => {
    expect(textarea('way too long for this field', { maxLength: 5 })).not.toBe(true)
  })

  it('required: true fails on empty string', () => {
    expect(textarea('', { required: true })).not.toBe(true)
  })

  it('required: false passes on empty string', () => {
    expect(textarea('', { required: false })).toBe(true)
  })

  it('a falsy value skips length checks entirely (unlike text, no hasMany/array shape)', () => {
    expect(textarea('', { minLength: 5, maxLength: 10 })).toBe(true)
  })
})

describe('number', () => {
  it('passes a valid number', () => {
    expect(number(5, { min: 1, max: 10 })).toBe(true)
  })

  it('fails a value below min', () => {
    expect(number(0, { min: 1 })).not.toBe(true)
  })

  it('fails a value above max', () => {
    expect(number(20, { max: 10 })).not.toBe(true)
  })

  it('required: true fails on undefined', () => {
    expect(number(undefined, { required: true })).not.toBe(true)
  })

  it('required: false passes on undefined', () => {
    expect(number(undefined, { required: false })).toBe(true)
  })

  it('"0" (string) is a valid number, 0 (number) is valid and not treated as "no value"', () => {
    expect(number('0', {})).toBe(true)
    expect(number(0, { min: -10 })).toBe(true)
  })

  it('"3.14" (string) is a valid number', () => {
    expect(number('3.14', {})).toBe(true)
  })

  it('"" and "abc" are not valid numbers', () => {
    expect(number('', { required: true })).not.toBe(true)
    expect(number('abc', {})).not.toBe(true)
  })

  it('hasMany: validates row count first, then every entry', () => {
    expect(number([1, 2, 3], { hasMany: true })).toBe(true)
    expect(number([1], { hasMany: true, minRows: 2 })).not.toBe(true)
    expect(number([1, 'not-a-number'], { hasMany: true })).not.toBe(true)
  })
})

describe('checkbox', () => {
  it('passes true and false', () => {
    expect(checkbox(true, {})).toBe(true)
    expect(checkbox(false, {})).toBe(true)
  })

  it('false always passes even when required', () => {
    expect(checkbox(false, { required: true })).toBe(true)
  })

  it('fails a non-boolean truthy value', () => {
    expect(checkbox('yes', {})).not.toBe(true)
  })

  it('required missing (undefined) fails with the SAME message-shape as a non-boolean value, not a distinct "required" case', () => {
    const missing = checkbox(undefined, { required: true })
    const nonBoolean = checkbox('yes', { required: false })
    expect(missing).not.toBe(true)
    expect(nonBoolean).not.toBe(true)
    expect(typeof missing).toBe('string')
    expect(missing).toBe(nonBoolean)
  })

  it('required: false passes on undefined', () => {
    expect(checkbox(undefined, { required: false })).toBe(true)
  })
})

describe('email', () => {
  it('passes a valid email', () => {
    expect(email('person@example.com', {})).toBe(true)
  })

  it('passes a valid email with subdomains and a plus tag', () => {
    expect(email('user.name+alias@sub.example.co.uk', {})).toBe(true)
  })

  it('fails a double-dot local or domain part', () => {
    expect(email('user..name@example.com', {})).not.toBe(true)
    expect(email('user@example..com', {})).not.toBe(true)
  })

  it('fails a value with a space', () => {
    expect(email('user @example.com', {})).not.toBe(true)
  })

  it('fails a missing @', () => {
    expect(email('not-an-email', {})).not.toBe(true)
  })

  it('required: true fails on empty/undefined', () => {
    expect(email('', { required: true })).not.toBe(true)
    expect(email(undefined, { required: true })).not.toBe(true)
  })

  it('required: false passes on empty/undefined', () => {
    expect(email('', { required: false })).toBe(true)
    expect(email(undefined, { required: false })).toBe(true)
  })
})

describe('date', () => {
  it('passes a valid ISO date string', () => {
    expect(date('2026-01-15T00:00:00.000Z', {})).toBe(true)
  })

  it('fails an unparseable date string, even when not required', () => {
    expect(date('not-a-date', { required: false })).not.toBe(true)
  })

  it('required: true fails on empty/undefined', () => {
    expect(date('', { required: true })).not.toBe(true)
    expect(date(undefined, { required: true })).not.toBe(true)
  })

  it('required: false passes on empty/undefined', () => {
    expect(date('', { required: false })).toBe(true)
    expect(date(undefined, { required: false })).toBe(true)
  })
})

const FREE_PAID_OPTIONS = [
  { label: 'Free (RSVP)', value: 'free' },
  { label: 'Paid (ticketed)', value: 'paid' },
]

describe('select', () => {
  it('passes a value that matches an option', () => {
    expect(select('free', { options: FREE_PAID_OPTIONS })).toBe(true)
  })

  it('fails a value that matches no option (invalid selection - real Payload behavior beyond the task summary, confirmed against validations.js)', () => {
    expect(select('nonsense', { options: FREE_PAID_OPTIONS })).not.toBe(true)
  })

  it('matches the bare-string option shorthand too, for parity even though this app never uses it', () => {
    expect(select('a', { options: ['a', 'b'] })).toBe(true)
    expect(select('c', { options: ['a', 'b'] })).not.toBe(true)
  })

  it('hasMany: passes distinct valid selections', () => {
    expect(select(['admin', 'customer'], { hasMany: true, options: [{ label: 'Admin', value: 'admin' }, { label: 'Customer', value: 'customer' }] })).toBe(true)
  })

  it('hasMany: fails duplicate selections (only checked when hasMany and length > 1)', () => {
    expect(
      select(['admin', 'admin'], { hasMany: true, options: [{ label: 'Admin', value: 'admin' }, { label: 'Customer', value: 'customer' }] }),
    ).not.toBe(true)
  })

  it('a single duplicate-looking array without hasMany is not dedup-checked', () => {
    expect(select(['free', 'free'], { hasMany: false, options: FREE_PAID_OPTIONS })).toBe(true)
  })

  it('required: true fails on undefined/null', () => {
    expect(select(undefined, { required: true, options: FREE_PAID_OPTIONS })).not.toBe(true)
    expect(select(null, { required: true, options: FREE_PAID_OPTIONS })).not.toBe(true)
  })

  it('required + hasMany fails on an empty array', () => {
    expect(select([], { required: true, hasMany: true, options: FREE_PAID_OPTIONS })).not.toBe(true)
  })

  it('required on non-hasMany does NOT fail on an empty string, once the empty string is itself a valid option (matches real, slightly surprising, Payload behavior - required only checks undefined/null/hasMany-empty-array, never string length)', () => {
    const optionsWithEmpty = [{ label: 'None', value: '' }, ...FREE_PAID_OPTIONS]
    expect(select('', { required: true, options: optionsWithEmpty })).toBe(true)
  })
})

describe('relationship / upload (shape-only validation, no DB existence check)', () => {
  it('passes a valid numeric id (this app\'s real idType default)', () => {
    expect(relationship(42, { relationTo: 'events' })).toBe(true)
    expect(upload(42, { relationTo: 'media' })).toBe(true)
  })

  it('fails a non-numeric-shaped id under the default idType', () => {
    expect(relationship('not-an-id', { relationTo: 'events' })).not.toBe(true)
  })

  it('fails a non-empty-string id under idType "text"', () => {
    expect(relationship('abc123', { relationTo: 'events', idType: 'text' })).toBe(true)
    expect(relationship('', { relationTo: 'events', idType: 'text' })).not.toBe(true)
  })

  it('required: true fails on undefined/null and on an empty array', () => {
    expect(relationship(undefined, { relationTo: 'events', required: true })).not.toBe(true)
    expect(relationship([], { relationTo: 'events', required: true })).not.toBe(true)
  })

  it('required: false passes on undefined and on an empty array', () => {
    expect(relationship(undefined, { relationTo: 'events', required: false })).toBe(true)
    expect(relationship([], { relationTo: 'events', required: false })).toBe(true)
  })

  it('minRows is only enforced when the array is non-empty - an empty array skips it, only `required` catches full-emptiness', () => {
    // Intentionally different from array/blocks below.
    expect(relationship([], { relationTo: 'faqs', minRows: 2, required: false })).toBe(true)
    expect(relationship([1], { relationTo: 'faqs', minRows: 2 })).not.toBe(true)
    expect(relationship([1, 2], { relationTo: 'faqs', minRows: 2, maxRows: 3 })).toBe(true)
    expect(relationship([1, 2, 3, 4], { relationTo: 'faqs', maxRows: 3 })).not.toBe(true)
  })

  it('validates shape only, not existence - an id that "looks right" passes even though nothing was queried', () => {
    expect(relationship(999999, { relationTo: 'events' })).toBe(true)
  })
})

describe('array', () => {
  it('passes a non-empty array within bounds', () => {
    expect(array([{ name: 'a' }, { name: 'b' }], { minRows: 1, maxRows: 5 })).toBe(true)
  })

  it('required: false passes on an empty array', () => {
    expect(array([], { required: false })).toBe(true)
  })

  it('required: true fails on an empty array (message implies "at least 1")', () => {
    expect(array([], { required: true })).not.toBe(true)
  })

  it('fails below minRows (boundary: exactly at minRows passes)', () => {
    expect(array([{}], { minRows: 2 })).not.toBe(true)
    expect(array([{}, {}], { minRows: 2 })).toBe(true)
  })

  it('fails above maxRows (boundary: exactly at maxRows passes)', () => {
    expect(array([{}, {}, {}], { maxRows: 2 })).not.toBe(true)
    expect(array([{}, {}], { maxRows: 2 })).toBe(true)
  })
})

describe('blocks', () => {
  it('passes a non-empty array of blocks within bounds', () => {
    expect(blocks([{ blockType: 'hero' }], { minRows: 1 })).toBe(true)
  })

  it('required: true fails on an empty array', () => {
    expect(blocks([], { required: true })).not.toBe(true)
  })

  it('fails below minRows / above maxRows at the boundary', () => {
    expect(blocks([{ blockType: 'a' }], { minRows: 2 })).not.toBe(true)
    expect(blocks([{ blockType: 'a' }, { blockType: 'b' }], { minRows: 2 })).toBe(true)
    expect(blocks([{ blockType: 'a' }, { blockType: 'b' }, { blockType: 'c' }], { maxRows: 2 })).not.toBe(true)
  })
})

describe('json', () => {
  it('passes a valid, non-empty value', () => {
    expect(json({ a: 1 }, {})).toBe(true)
  })

  it('required: true fails on falsy value', () => {
    expect(json(undefined, { required: true })).not.toBe(true)
    expect(json(null, { required: true })).not.toBe(true)
  })

  it('required: false passes on falsy value', () => {
    expect(json(undefined, { required: false })).toBe(true)
  })

  it('fails when the caller reports a jsonError (already-failed JSON.parse), regardless of required', () => {
    expect(json({ a: 1 }, { jsonError: 'Unexpected token' })).not.toBe(true)
  })
})

describe('richText', () => {
  it('delegates to a configured editor\'s validate function', async () => {
    const editor = { validate: async () => 'editor said no' }
    await expect(richText({ root: { children: [] } }, { editor })).resolves.toBe('editor said no')
  })

  it('passes through a configured editor\'s true result', async () => {
    const editor = { validate: async () => true as const }
    await expect(richText({ root: { children: [] } }, { editor })).resolves.toBe(true)
  })

  it('fallback (no editor configured): required fails when there are no non-empty root children', async () => {
    await expect(richText({ root: { children: [] } }, { required: true })).resolves.not.toBe(true)
    await expect(richText(undefined, { required: true })).resolves.not.toBe(true)
  })

  it('fallback (no editor configured): passes when there is root content', async () => {
    await expect(richText({ root: { children: [{ type: 'paragraph' }] } }, { required: true })).resolves.toBe(true)
  })

  it('fallback (no editor configured): not required passes even with no content', async () => {
    await expect(richText({ root: { children: [] } }, { required: false })).resolves.toBe(true)
  })
})
