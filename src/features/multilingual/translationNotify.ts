/**
 * "You have translations to do" emails, sent when someone assigns items.
 *
 * Same shape as the approval review emails (src/features/approval/notify.ts): the
 * Email feature is imported when a message is sent, and sendEmail never throws,
 * so a mail problem never fails the assignment that caused it.
 */

type EngineLike = {
  findByID: (args: Record<string, unknown>) => Promise<Record<string, unknown> | null>
}

type Sender = (args: { to: string; subject: string; text: string }) => Promise<unknown>

export function assignmentEmailText(args: { count: number; locales: string[] }): string {
  const noun = args.count === 1 ? 'translation' : 'translations'
  const where = args.locales.length > 0 ? ` into ${args.locales.join(', ')}` : ''
  return [
    `You have been assigned ${args.count} ${noun}${where}.`,
    '',
    'Open Translations in the admin to see your list under "Assigned to me".',
  ].join('\n')
}

/** Emails each user once. Returns how many were sent; never throws. */
export async function notifyAssignees(args: {
  engine: EngineLike
  userIds: number[]
  count: number
  locales: string[]
}): Promise<number> {
  if (args.userIds.length === 0 || args.count === 0) return 0
  let send: Sender
  try {
    const { sendEmail } = await import('@/features/email')
    send = sendEmail as unknown as Sender
  } catch {
    return 0
  }

  let sent = 0
  for (const id of new Set(args.userIds)) {
    try {
      const user = await args.engine.findByID({ collection: 'users', id, depth: 0, overrideAccess: true })
      const email = typeof user?.email === 'string' ? user.email : ''
      if (!email) continue
      await send({
        to: email,
        subject: `Translations assigned to you (${args.count})`,
        text: assignmentEmailText({ count: args.count, locales: args.locales }),
      })
      sent += 1
    } catch {
      // One unreachable mailbox does not stop the others, or the assignment.
    }
  }
  return sent
}
