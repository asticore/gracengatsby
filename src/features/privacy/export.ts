import type { D1Like } from '@/features/apiKeys'
import { buildExportDocument, type ExportInput } from './core'
import { canSeeBookingsByEmail } from '@/features/accounts/access'
import { asEngine, customerRecords } from './data'

/** The customer's data document for the signed-in customer. The caller passes the session user only. */
export async function exportCustomerData(
  engine: unknown,
  d1: D1Like,
  user: { id: number; email: string } & Record<string, unknown>,
  now: Date = new Date(),
): Promise<Record<string, unknown>> {
  const records = await customerRecords(asEngine(engine), d1, Number(user.id), String(user.email ?? ''))
  const input: ExportInput = {
    user,
    addresses: records.addresses,
    orders: records.orders,
    // Guest bookings are matched by address, so they are exported only once the address is verified.
    bookings: canSeeBookingsByEmail(user) ? records.bookings : [],
    submissions: records.submissions.map((s) => ({ form: s.form, submittedAt: s.submittedAt, values: s.values })),
    requestedAt: now.toISOString(),
  }
  return buildExportDocument(input)
}
