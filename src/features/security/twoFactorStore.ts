import { findUserAuthRowByID, updateUserAuthRow } from '@/cms/db/collections/users'
import { verifyPassword } from '@/localapi/auth'

import type { TwoFactorRow, TwoFactorStore } from './twoFactor'

/**
 * The real users table behind the two-factor core. Server-only: it reaches the
 * database and node crypto (password check), so nothing the middleware loads
 * may import it. The core in twoFactor.ts takes a store as an argument for
 * exactly that reason.
 */
export const defaultTwoFactorStore: TwoFactorStore = {
  findByID: async (id) => (await findUserAuthRowByID(id)) as unknown as TwoFactorRow | null,
  updateByID: (id, data) => updateUserAuthRow(id, data),
  checkPassword: (row, password) =>
    typeof row.salt === 'string' && typeof row.hash === 'string' && verifyPassword(password, row.salt, row.hash),
}
