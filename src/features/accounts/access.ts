import type { Access } from '@/engine'
import { resolveAccess, type PermissionUser } from '@/features/roles/permissions'

/**
 * Read access for event RSVPs: whoever the permissions allow to read the collection (admin, or a
 * role or override that grants `event-rsvps` read), or the person whose address is on the booking.
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
 * own. The consequence is worth stating plainly: an RSVP left by a guest is
 * visible to whoever later registers with that email address, and registration
 * does not verify the mailbox. Switching on email verification for the Users
 * collection closes that gap; a `customer` relationship on the RSVP, set when
 * a signed-in visitor books, would close it properly.
 */
export const isAdminOrRsvpOwner: Access = ({ req }) => {
  const user = req.user as (PermissionUser & { email?: string | null }) | null | undefined
  if (user?.roles?.includes('admin')) return true
  if (user && resolveAccess(user, 'event-rsvps', 'read') === 'all') return true
  if (!user?.email) return false
  return { email: { equals: user.email } }
}
