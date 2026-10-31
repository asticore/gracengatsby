import type { Access } from '@/engine'
import { resolveAccess, type PermissionUser } from '@/features/roles/permissions'

/**
 * Whether a signed-in user may see the event bookings that were made with their email address.
 *
 * An RSVP has no customer field: anyone can book with any address, signed in or not. So a booking
 * is matched to an account by email only once that account has proved it owns the mailbox
 * (`emailVerifiedAt` is set). Without this, a guest who typed someone else's address would expose
 * their booking to whoever registered with that address next. When the site requires verification
 * to sign in, an unverified customer cannot get this far anyway, so this is the same rule.
 */
export function canSeeBookingsByEmail(user: { email?: string | null; emailVerifiedAt?: string | null; roles?: unknown } | null | undefined): boolean {
  return Boolean(user?.email) && Boolean(user?.emailVerifiedAt)
}

/**
 * Read access for event RSVPs: whoever the permissions allow to read the collection (admin, or a
 * role or override that grants `event-rsvps` read), or a verified customer whose address is on the
 * booking.
 *
 * The collection was admin-only to read, which is right for a form the public
 * can post to and wrong for a screen that shows people their own bookings. The
 * choice was between overriding access in the account screens and filtering by
 * hand - which works until one query forgets the filter - or teaching the
 * collection who owns a row, which is what this does. The account screens then
 * ask for RSVPs without any customer clause at all, and the collection returns
 * exactly the caller's own.
 *
 * A staff role that holds `event-rsvps` read (the editor and viewer built-ins, or a custom role)
 * sees every booking, the same as the RSVPs tab that its permission already opens. A grant that is
 * limited to the user's own documents (scope 'own') gives only the owner rows, because RSVPs have
 * no createdBy field to scope by.
 *
 * The match is by address rather than by relationship because RSVPs have no
 * customer field: the form is open to visitors who have never signed in, and
 * giving it one would be a schema change to a collection this feature does not
 * own. So the address must be one the customer has verified (see
 * `canSeeBookingsByEmail`); an unverified account sees no guest bookings at all.
 */
export const isAdminOrRsvpOwner: Access = ({ req }) => {
  const user = req.user as (PermissionUser & { email?: string | null; emailVerifiedAt?: string | null }) | null | undefined
  if (user?.roles?.includes('admin')) return true
  if (user && resolveAccess(user, 'event-rsvps', 'read') === 'all') return true
  if (!canSeeBookingsByEmail(user)) return false
  return { email: { equals: user!.email as string } }
}
