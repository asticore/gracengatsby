/**
 * Proves the things about this feature that cannot be read off the source: the
 * access boundaries between two customers, and that a reset link really is
 * single-use and time-limited.
 *
 * Run:
 *   npx tsx src/features/accounts/selfTest.mts
 *
 * It writes real rows into whatever database the config points at, so run it
 * against a local D1 only. It exits non-zero on failure.
 */
import { getPayload } from 'payload'
import { sql } from '@payloadcms/db-d1-sqlite'

import config from '../../engage.config'
import { addressForCustomer, createAddress, deleteAddress, setDefaultAddress, updateAddress } from './addresses'
import { completePasswordReset, requestPasswordReset, signIn, verifyPassword } from './auth'
import { bookingsForCustomer } from './bookings'
import { orderForCustomer, ordersForCustomer } from './orders'
import { readPreferences, writePreferences } from './preferences'

const results: string[] = []
let failures = 0
const check = (label: string, ok: boolean, detail = '') => {
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` - ${detail}` : ''}`)
  if (!ok) failures += 1
}

const run = async () => {
  const engine = await getPayload({ config: await config })
  const stamp = Date.now()

  // This local database predates several features' locked-document columns,
  // which makes every `update` fail before it reaches anything of ours - the
  // password reset included. Patched here, in the harness, so the run gets far
  // enough to test the thing under test; the real database is restored from
  // backup afterwards.
  const db = (engine.db as unknown as { drizzle: { run: (q: unknown) => Promise<unknown> } }).drizzle
  for (const column of [
    'eg_audit_log_id',
    'eg_forms_id',
    'eg_form_submissions_id',
    'eg_backups_id',
    'eg_translations_id',
    'eg_membership_tiers_id',
    'eg_memberships_id',
    'eg_courses_id',
    'eg_lessons_id',
    'eg_enrolments_id',
    'eg_lesson_progress_id',
  ]) {
    await db
      .run(sql.raw(`ALTER TABLE \`eg_locked_documents_rels\` ADD \`${column}\` integer`))
      .catch(() => undefined)
  }

  const makeUser = async (label: string) =>
    (await engine.create({
      collection: 'users',
      data: { email: `acct-${label}-${stamp}@example.test`, password: 'Test-1234!', roles: ['customer'] } as never,
      overrideAccess: true,
    })) as never as { id: number; email: string }

  const alice = await makeUser('alice')
  const bob = await makeUser('bob')

  // --- Orders ---------------------------------------------------------------

  const bobOrder = (await engine.create({
    collection: 'orders' as never,
    data: { customer: bob.id, customerEmail: bob.email, status: 'completed', amount: 4200, currency: 'AUD' } as never,
    overrideAccess: true,
  })) as never as { id: number }

  const aliceSeesOrders = await ordersForCustomer(engine, alice as never)
  check(
    'order list returns none of another customer\'s orders',
    !aliceSeesOrders.some((order) => order.id === bobOrder.id),
    `${aliceSeesOrders.length} row(s) visible to alice`,
  )

  const stolenOrder = await orderForCustomer(engine, alice as never, String(bobOrder.id))
  check('order by id is null for the wrong customer', stolenOrder === null)

  const ownOrder = await orderForCustomer(engine, bob as never, String(bobOrder.id))
  check('order by id is readable by its own customer', ownOrder?.id === bobOrder.id)

  // --- Addresses ------------------------------------------------------------

  const bobAddress = await createAddress(engine, bob as never, {
    firstName: 'Bob',
    lastName: 'Tester',
    addressLine1: '1 Test Street',
    city: 'Melbourne',
    country: 'AU',
  })
  check('a customer can save an address', bobAddress.ok === true)

  const bobAddressId = bobAddress.id as number

  check(
    'address by id is null for the wrong customer',
    (await addressForCustomer(engine, alice as never, bobAddressId)) === null,
  )

  const stolenUpdate = await updateAddress(engine, alice as never, bobAddressId, {
    firstName: 'Mallory',
    lastName: 'Tester',
    addressLine1: '2 Attack Avenue',
    city: 'Melbourne',
    country: 'AU',
  })
  check('another customer cannot edit an address', stolenUpdate.ok === false)

  const afterAttempt = await addressForCustomer(engine, bob as never, bobAddressId)
  check('the address is unchanged after that attempt', afterAttempt?.addressLine1 === '1 Test Street')

  check(
    'another customer cannot make an address their default',
    (await setDefaultAddress(engine, alice as never, bobAddressId)).ok === false,
  )

  // The owner can, and the marker is stored against the owner alone.
  check('the owner can set a default', (await setDefaultAddress(engine, bob as never, bobAddressId)).ok === true)
  check('the default is bob\'s', (await readPreferences(engine, bob as never)).defaultAddressId === bobAddressId)
  check('alice sees no default of her own', (await readPreferences(engine, alice as never)).defaultAddressId === null)

  // Preferences are per-customer even when both have written one.
  await writePreferences(engine, alice as never, { name: 'Alice' })
  check('a customer reads only their own stored name', (await readPreferences(engine, bob as never)).name === '')

  check(
    'another customer cannot delete an address',
    (await deleteAddress(engine, alice as never, bobAddressId)).ok === false,
  )
  check(
    'the address survives that attempt',
    (await addressForCustomer(engine, bob as never, bobAddressId)) !== null,
  )
  check('the owner can delete it', (await deleteAddress(engine, bob as never, bobAddressId)).ok === true)
  check(
    'deleting the default forgets the marker',
    (await readPreferences(engine, bob as never)).defaultAddressId === null,
  )

  // --- Event bookings -------------------------------------------------------

  const event = (await engine.create({
    collection: 'events',
    data: { title: `Test event ${stamp}`, slug: `test-event-${stamp}`, startDate: new Date().toISOString() } as never,
    overrideAccess: true,
  })) as never as { id: number }

  await engine.create({
    collection: 'event-rsvps',
    data: { event: event.id, name: 'Bob', email: bob.email, guestCount: 2 } as never,
    overrideAccess: true,
  })

  const bobBookings = await bookingsForCustomer(engine, bob as never)
  check('a customer sees their own booking', bobBookings.length === 1)

  const aliceBookings = await bookingsForCustomer(engine, alice as never)
  check('a customer sees none of another\'s bookings', aliceBookings.length === 0)

  // The collection rule, not the query's own clause, is what refuses this: no
  // email filter is passed here at all.
  const rawRsvpsForAlice = await engine
    .find({ collection: 'event-rsvps', limit: 100, overrideAccess: false, user: alice as never })
    .catch(() => ({ docs: [] as unknown[] }))
  check(
    'an unfiltered RSVP query returns nothing that is not the caller\'s',
    rawRsvpsForAlice.docs.length === 0,
    `${rawRsvpsForAlice.docs.length} row(s)`,
  )

  // --- The customer record itself ------------------------------------------

  const stolenUser = await engine
    .findByID({ collection: 'users', id: bob.id, overrideAccess: false, user: alice as never })
    .catch((): null => null)
  check('a customer cannot read another customer\'s record', stolenUser === null)

  const stolenPasswordChange = await engine
    .update({
      collection: 'users',
      id: bob.id,
      data: { password: 'Attacker-1234!' } as never,
      overrideAccess: false,
      user: alice as never,
    })
    .catch((): null => null)
  check('a customer cannot change another customer\'s password', stolenPasswordChange === null)

  // --- Sign in and password reset ------------------------------------------

  check('the right password signs in', (await signIn(engine, alice.email, 'Test-1234!')).ok === true)
  check('the wrong password does not', (await signIn(engine, alice.email, 'nope-nope-nope')).ok === false)
  check(
    'sign-in failure says nothing about an unknown address',
    (await signIn(engine, `nobody-${stamp}@example.test`, 'whatever')).message ===
      (await signIn(engine, alice.email, 'wrong-password')).message,
  )

  check('the current password can be re-verified', (await verifyPassword(engine, alice.email, 'Test-1234!')) === true)
  check('a wrong current password is rejected', (await verifyPassword(engine, alice.email, 'wrong')) === false)

  let issued = ''
  await requestPasswordReset(engine, bob.email, (token) => {
    issued = token
    return `https://example.test/account/reset-password?token=${token}`
  })
  check('a reset token is issued for a known address', issued.length > 0)

  let issuedForStranger = ''
  await requestPasswordReset(engine, `ghost-${stamp}@example.test`, (token) => {
    issuedForStranger = token
    return ''
  })
  check('no token is issued for an unknown address', issuedForStranger === '')

  check(
    'a bogus token is refused',
    (await completePasswordReset(engine, 'not-a-real-token', 'Brand-New-9!')).ok === false,
  )

  const firstUse = await completePasswordReset(engine, issued, 'Brand-New-9!')
  check('a valid token sets the new password', firstUse.ok === true)
  check('the new password signs in', (await signIn(engine, bob.email, 'Brand-New-9!')).ok === true)

  const secondUse = await completePasswordReset(engine, issued, 'Third-Password-1!')
  check('the same token cannot be used twice', secondUse.ok === false)
  check(
    'the second attempt did not change the password',
    (await signIn(engine, bob.email, 'Third-Password-1!')).ok === false,
  )

  // Expiry: a token minted with a zero-length life is already past it.
  let expiredToken = ''
  await engine.forgotPassword({
    collection: 'users',
    data: { email: bob.email },
    disableEmail: true,
    expiration: -1000,
  }).then((token) => {
    expiredToken = token ?? ''
  })
  check(
    'an expired token is refused',
    expiredToken.length > 0 && (await completePasswordReset(engine, expiredToken, 'Later-Password-2!')).ok === false,
  )

  console.log(results.join('\n'))
  console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`)
  process.exit(failures === 0 ? 0 : 1)
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
