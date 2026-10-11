import type { Field } from '@/engine'

/**
 * Section / document locks, stored as JSON (shape and rules in src/features/roles/locks.ts, enforced by
 * lockGuard in beforeChange). Hidden from the edit form: locks are set from the visual editor and the
 * template list, where the person can see which section they apply to.
 */
export const locksField: Field = {
  name: 'locks',
  type: 'json',
  label: 'Locks',
  admin: {
    hidden: true,
    components: { Cell: '@/fields/locks/lockCell#formatLockCell' },
    description: 'Which sections or the whole document are locked, and which roles may unlock them. Set in the visual editor.',
  },
}
