import { sendEmail } from './index'
import { renderEmailTemplate } from './templateLoad'
import type { EmailTemplateKey } from './templateDefaults'
import { sampleValuesFor, TEMPLATE_LABELS, testSubject } from './testSamples'

/**
 * Sends test copies of the automatic emails with sample data. Each one goes
 * through the normal sendEmail path with the template name 'test', so the
 * provider, the log and the sender details are exactly what a real email uses.
 */

export type TemplateTestRow = {
  key: string
  label: string
  ok: boolean
  provider?: string
  error?: string
  reason?: string
}

/** Sends one template's test copy. Never throws. */
export const sendTemplateTest = async (key: string, to: string): Promise<TemplateTestRow> => {
  const label = TEMPLATE_LABELS[key] ?? key
  try {
    const rendered = await renderEmailTemplate(key as EmailTemplateKey, sampleValuesFor(key))
    const result = await sendEmail({
      to,
      subject: testSubject(rendered.subject),
      html: rendered.html,
      text: rendered.text,
      template: 'test',
    })
    return { key, label, ok: result.ok, provider: result.provider, error: result.error, reason: result.reason }
  } catch (error) {
    return { key, label, ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

/** Sends the given templates one after another, so the results come back in a fixed order. */
export const sendTemplateTests = async (keys: readonly string[], to: string): Promise<TemplateTestRow[]> => {
  const rows: TemplateTestRow[] = []
  for (const key of keys) {
    rows.push(await sendTemplateTest(key, to))
  }
  return rows
}
