import type { SendEmailResult } from '@/features/email'

/**
 * The two messages the account area sends: a reset link, and the reply to a
 * registration attempt on an address that already has an account.
 *
 * The Email feature reaches for the engine, which loads the whole config, so
 * it is imported at call time rather than at module load - the same dodge
 * Forms and Members use, for the same reason.
 */
const loadSendEmail = async () => (await import('@/features/email')).sendEmail

const escapeHtml = (value: string): string =>
  value.replace(
    /[&<>"]/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char] as string,
  )

const asHtml = (body: string): string =>
  body
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br />')}</p>`)
    .join('\n')

export const sendResetEmail = async (
  to: string,
  resetUrl: string,
  minutes: number,
): Promise<SendEmailResult> => {
  const body = [
    'Someone asked to reset the password on your account.',
    `Open this link to choose a new one - it works once, and expires in ${minutes} minutes:\n${resetUrl}`,
    'If this was not you, ignore this email. Your password has not changed.',
  ].join('\n\n')

  const sendEmail = await loadSendEmail()
  return sendEmail({
    to,
    subject: 'Reset your password',
    text: body,
    html: `${asHtml(body)}\n<p><a href="${escapeHtml(resetUrl)}">Choose a new password</a></p>`,
  })
}

/**
 * Sent when someone registers with an address that is already in use.
 *
 * The registration screen cannot say "that address is taken" without becoming
 * a way to test which addresses have accounts, so the person who actually owns
 * the mailbox is told instead - which is also the only person who needs to
 * know.
 */
export const sendAlreadyRegisteredEmail = async (
  to: string,
  signInUrl: string,
  resetUrl: string,
): Promise<SendEmailResult> => {
  const body = [
    'Someone tried to create an account with this email address, but you already have one.',
    `Sign in here:\n${signInUrl}`,
    `Forgotten your password? Reset it here:\n${resetUrl}`,
    'If this was not you, nothing has changed and you can ignore this email.',
  ].join('\n\n')

  const sendEmail = await loadSendEmail()
  return sendEmail({ to, subject: 'You already have an account', text: body, html: asHtml(body) })
}

export const sendWelcomeEmail = async (to: string, accountUrl: string): Promise<SendEmailResult> => {
  const body = [
    'Your account is ready.',
    `You can see your orders, addresses and bookings here:\n${accountUrl}`,
  ].join('\n\n')

  const sendEmail = await loadSendEmail()
  return sendEmail({ to, subject: 'Your account is ready', text: body, html: asHtml(body) })
}
