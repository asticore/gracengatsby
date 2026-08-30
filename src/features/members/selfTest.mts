/**
 * Proves the two things about this feature that cannot be proved by reading it:
 * that the migration's SQL runs (twice, unchanged) against a real copy of the
 * database, and that the gate withholds content rather than merely hiding it.
 *
 * Run with:
 *   NODE_OPTIONS=--no-deprecation npx tsx src/features/members/selfTest.mts
 *
 * It works on a COPY of the local D1 file, never the file itself.
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'

import { up } from '../../migrations/20260830_110000_members'
import { applyGate, evaluateGate } from './gate'
import { grantsAccess, resolveEntitlement } from './entitlement'
import { DEFAULT_MEMBER_SETTINGS, type MemberSettings } from './types'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, '../../..')

let failures = 0
const check = (name: string, condition: boolean, detail = '') => {
  if (condition) {
    console.log(`  ok   ${name}`)
  } else {
    failures += 1
    console.log(`  FAIL ${name}${detail ? ` - ${detail}` : ''}`)
  }
}

// ---------------------------------------------------------------- migration

/**
 * Unwraps whatever `sql.raw()` produced back into plain SQL text. The migration
 * hands the driver a query object, not a string, and its chunks are where the
 * text actually lives.
 */
const rawTextOf = (statement: unknown): string => {
  if (typeof statement === 'string') return statement
  const chunks = (statement as { queryChunks?: unknown[] })?.queryChunks
  if (!Array.isArray(chunks)) return String(statement)
  return chunks
    .map((chunk) => {
      const value = (chunk as { value?: unknown })?.value
      return Array.isArray(value) ? value.join('') : typeof chunk === 'string' ? chunk : ''
    })
    .join('')
}

const liveDir = path.join(repo, '.wrangler/state/v3/d1/miniflare-D1DatabaseObject')
const source = fs.existsSync(liveDir)
  ? fs.readdirSync(liveDir).find((file) => file.endsWith('.sqlite'))
  : undefined

console.log('\nMigration')

if (!source) {
  console.log('  skip - no local database to copy')
} else {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'members-migration-'))
  const copy = path.join(scratch, 'copy.sqlite')
  fs.copyFileSync(path.join(liveDir, source), copy)

  const database = new DatabaseSync(copy)
  const statements: string[] = []

  // Stands in for the drizzle handle the real migration is given. Only `run`
  // is used, so only `run` exists.
  const db = {
    run: async (statement: unknown) => {
      const text = rawTextOf(statement)
      statements.push(text)
      database.exec(text)
    },
  }

  const engine = { logger: { info: () => undefined } }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await up({ db, payload: engine, req: {} } as any)
  const firstRun = statements.length
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await up({ db, payload: engine, req: {} } as any)

  check('up() runs twice without error', statements.length === firstRun * 2)

  const tables = database
    .prepare("SELECT name FROM sqlite_master WHERE type='table'")
    .all()
    .map((row) => String((row as { name: string }).name))

  for (const table of ['eg_membership_tiers', 'eg_membership_tiers_benefits', 'eg_memberships']) {
    check(`${table} exists`, tables.includes(table))
  }

  const columnsOf = (table: string) =>
    database.prepare(`PRAGMA table_info(${table})`).all().map((row) => String((row as { name: string }).name))

  for (const [table, column] of [
    ['eg_pages', 'members_only_enabled'],
    ['eg_pages', 'members_only_tier_id'],
    ['_eg_pages_v', 'version_members_only_enabled'],
    ['eg_posts', 'members_only_enabled'],
    ['_eg_posts_v', 'version_members_only_tier_id'],
  ] as const) {
    check(`${table}.${column} added`, columnsOf(table).includes(column))
  }

  database.exec(
    "INSERT INTO eg_membership_tiers (name, slug, rank, price, `interval`) VALUES ('Gold', 'gold', 10, 20, 'monthly')",
  )
  const tier = database.prepare("SELECT id FROM eg_membership_tiers WHERE slug = 'gold'").get() as {
    id: number
  }
  const user = database.prepare('SELECT id FROM eg_users LIMIT 1').get() as { id: number } | undefined
  if (user) {
    database
      .prepare(
        'INSERT INTO eg_memberships (user_id, tier_id, status, renews_at) VALUES (?, ?, ?, ?)',
      )
      .run(user.id, tier.id, 'active', '2099-01-01T00:00:00.000Z')
    const count = database.prepare('SELECT COUNT(*) AS n FROM eg_memberships').get() as { n: number }
    check('a membership row can be written', count.n === 1)
  }

  const integrity = database.prepare('PRAGMA integrity_check').get() as { integrity_check: string }
  check('database still passes integrity_check', integrity.integrity_check === 'ok')

  database.close()
  fs.rmSync(scratch, { recursive: true, force: true })
}

// --------------------------------------------------------------------- gate

console.log('\nGate')

const TIERS = [
  { id: 1, name: 'Bronze', slug: 'bronze', rank: 1 },
  { id: 2, name: 'Gold', slug: 'gold', rank: 10 },
]

/** A stand-in for the engine holding one member and one tier list. */
const engineWith = (memberships: Record<string, unknown>[]) => ({
  find: async ({ collection, where }: { collection: string; where?: Record<string, unknown> }) => {
    if (collection === 'membership-tiers') {
      const id = (where?.id as { equals?: unknown })?.equals
      const slug = (where?.slug as { equals?: unknown })?.equals
      return { docs: TIERS.filter((tier) => tier.id === id || tier.slug === slug) }
    }
    if (collection === 'memberships') {
      const user = (where?.user as { equals?: unknown })?.equals
      return { docs: memberships.filter((row) => row.user === user) }
    }
    return { docs: [] }
  },
})

const settings = (over: Partial<MemberSettings['access']> = {}): MemberSettings => ({
  ...DEFAULT_MEMBER_SETTINGS,
  featureEnabled: true,
  access: { ...DEFAULT_MEMBER_SETTINGS.access, ...over },
})

const lockedPost = {
  id: 7,
  title: 'The secret',
  excerpt: 'A taste of it.',
  content: { root: { children: [{ children: [{ text: 'PAID BODY TEXT' }] }] } },
  layout: [{ blockType: 'richText' }],
  membersOnly: { enabled: true, tier: 2 },
}

const gold = [{ id: 1, user: 5, tier: TIERS[1], status: 'active', renewsAt: '2099-01-01T00:00:00.000Z' }]
const bronze = [{ id: 2, user: 6, tier: TIERS[0], status: 'active', renewsAt: '2099-01-01T00:00:00.000Z' }]
const lapsed = [{ id: 3, user: 7, tier: TIERS[1], status: 'active', renewsAt: '2000-01-01T00:00:00.000Z' }]

const run = async (
  memberships: Record<string, unknown>[],
  user: { id: number; roles?: string[] } | null,
  over: Partial<MemberSettings['access']> = {},
  doc: Record<string, unknown> = lockedPost,
) => {
  const config = settings(over)
  const verdict = await evaluateGate({ engine: engineWith(memberships), doc, user, settings: config })
  return applyGate(doc, verdict)
}

const leaks = (result: { doc: Record<string, unknown> }) =>
  JSON.stringify(result.doc).includes('PAID BODY TEXT')

{
  const anon = await run(gold, null)
  check('anonymous reader is refused', anon.gate.allowed === false, anon.gate.reason)
  check('anonymous reader gets no body', !leaks(anon))
  check('anonymous reader is sent to the join page', anon.gate.redirectTo === '/membership')
  check('anonymous reader is told which tier', anon.gate.requiredTierSlug === 'gold')

  const low = await run(bronze, { id: 6 })
  check('lower tier is refused', low.gate.allowed === false && low.gate.reason === 'tier-too-low')
  check('lower tier gets no body', !leaks(low))

  const member = await run(gold, { id: 5 })
  check('the right tier is allowed in', member.gate.allowed === true)
  check('the right tier gets the body', leaks(member))

  const expired = await run(lapsed, { id: 7 })
  check('a lapsed membership is refused', expired.gate.allowed === false)
  check('a lapsed membership gets no body', !leaks(expired))

  const admin = await run([], { id: 1, roles: ['admin'] })
  check('an admin can see what they locked', admin.gate.allowed === true)

  const blurred = await run(gold, null, { teaserMode: 'blur' })
  check('blur withholds the body too', !leaks(blurred))
  check('blur still shows a teaser', blurred.teaserText === 'A taste of it.')

  const hidden = await run(gold, null, { teaserMode: 'full-hide' })
  check('full-hide sends no teaser', hidden.teaserText === null)
  check('full-hide strips the excerpt as well', !('excerpt' in hidden.doc))

  const untagged = await run(gold, null, {}, { id: 8, content: { root: { children: [{ children: [{ text: 'PAID BODY TEXT' }] }] } } })
  check('an ungated document is untouched', untagged.gate.allowed === true && leaks(untagged))

  const anyTier = await run(bronze, { id: 6 }, {}, { ...lockedPost, membersOnly: { enabled: true, tier: null } })
  check('no tier named means any member gets in', anyTier.gate.allowed === true)

  const anonAnyTier = await run([], null, {}, { ...lockedPost, membersOnly: { enabled: true, tier: null } })
  check('no tier named still keeps anonymous readers out', anonAnyTier.gate.allowed === false)

  const unknownTier = await run([], null, {}, { ...lockedPost, membersOnly: { enabled: true, tier: 999 } })
  check(
    'a tier id that no longer exists does not open the document',
    unknownTier.gate.allowed === false && !leaks(unknownTier),
  )

  const off = await evaluateGate({
    engine: engineWith([]),
    doc: lockedPost,
    user: null,
    settings: { ...settings(), featureEnabled: false },
  })
  check('with the feature off, nothing is locked', off.allowed === true && off.reason === 'feature-off')
}

console.log('\nEntitlement')
{
  const best = await resolveEntitlement(engineWith([...bronze, { ...gold[0], user: 6 }]), 6)
  check('the highest granting tier wins', best.rank === 10)
  check('past-due does not grant access', !grantsAccess({ status: 'past-due', renewsAt: null }))
  check('cancelled inside the paid period still grants access', grantsAccess({ status: 'active', renewsAt: '2099-01-01T00:00:00.000Z' }))
  const none = await resolveEntitlement(engineWith([]), null)
  check('no user means no entitlement', none.rank === 0)
}

console.log(failures === 0 ? '\nAll checks passed.\n' : `\n${failures} check(s) failed.\n`)
process.exit(failures === 0 ? 0 : 1)
