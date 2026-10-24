import type { SendEmailResult } from '@/features/email'

/**
 * The messages the account area sends: a reset link, the reply to a
 * registration attempt on an address that already has an account, and the
 * welcome. The wording comes from the Email templates settings, falling back to
 * the built-in text when a field is blank (src/features/email/templateDefaults.ts).
 *
 * The Email feature reaches for the engine, which loads the whole config, so
 * it is imported at call time rather than at module load - the same dodge
 * Forms and Members use, for the same reason.
 */
const loadSendEmail = async () => (await import('@/features/email')).sendEmail
const loadTemplates = async () => import('@/features/email/templateLoad')

const escapeHtml = (value: string): string =>
  value.replace(
    /[&<>"]/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char] as string,
  )

export const sendResetEmail = async (
  to: string,
  resetUrl: string,
  minutes: number,
): Promise<SendEmailResult> => {
  const { renderEmailTemplate } = await loadTemplates()
  const mail = await renderEmailTemplate('accountReset', { link: resetUrl, minutes: String(minutes) })

  const sendEmail = await loadSendEmail()
  return sendEmail({
    to,
    template: 'account.reset',
    subject: mail.subject,
    text: mail.text,
    html: `${mail.html}\n<p><a href="${escapeHtml(resetUrl)}">Choose a new password</a></p>`,
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
  const { renderEmailTemplate } = await loadTemplates()
  const mail = await renderEmailTemplate('accountAlreadyRegistered', { signInLink: signInUrl, resetLink: resetUrl })

  const sendEmail = await loadSendEmail()
  return sendEmail({ to, template: 'account.exists', subject: mail.subject, text: mail.text, html: mail.html })
}

export const sendWelcomeEmail = async (to: string, accountUrl: string): Promise<SendEmailResult> => {
  const { renderEmailTemplate } = await loadTemplates()
  const mail = await renderEmailTemplate('accountWelcome', { link: accountUrl })

  const sendEmail = await loadSendEmail()
  return sendEmail({ to, template: 'account.welcome', subject: mail.subject, text: mail.text, html: mail.html })
}

export const sendVerifyEmail = async (to: string, verifyUrl: string, hours: number): Promise<SendEmailResult> => {
  const { renderEmailTemplate } = await loadTemplates()
  const mail = await renderEmailTemplate('accountVerify', { link: verifyUrl, hours: String(hours) })

  const sendEmail = await loadSendEmail()
  return sendEmail({
    to,
    template: 'account.verify',
    subject: mail.subject,
    text: mail.text,
    html: `${mail.html}\n<p><a href="${escapeHtml(verifyUrl)}">Confirm your email address</a></p>`,
  })
}

/** The emailed one-click sign-in link. The button sends the reader to a page that signs them in only when they press it. */
export const sendMagicLinkEmail = async (to: string, link: string, minutes: number): Promise<SendEmailResult> => {
  const { renderEmailTemplate } = await loadTemplates()
  const mail = await renderEmailTemplate('accountMagicLink', { link, minutes: String(minutes) })

  const sendEmail = await loadSendEmail()
  return sendEmail({
    to,
    template: 'account.magic-link',
    subject: mail.subject,
    text: mail.text,
    html: `${mail.html}\n<p><a href="${escapeHtml(link)}">Sign in</a></p>`,
  })
}

/** The six-digit sign-in code. Digits only, so nothing in it needs escaping beyond the template itself. */
export const sendLoginCodeEmail = async (to: string, code: string, minutes: number): Promise<SendEmailResult> => {
  const { renderEmailTemplate } = await loadTemplates()
  const mail = await renderEmailTemplate('accountLoginCode', { code, minutes: String(minutes) })

  const sendEmail = await loadSendEmail()
  return sendEmail({ to, template: 'account.login-code', subject: mail.subject, text: mail.text, html: mail.html })
}
