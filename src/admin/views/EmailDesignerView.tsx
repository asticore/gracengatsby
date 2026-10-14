import { redirect } from 'next/navigation'
import { getAdminContext, hasAdminPanelAccess } from '@/admin/auth'
import { brandFromStored, designedBlocks, storedLogo } from '@/features/email/designRender'
import { DESIGNABLE_TEMPLATE_KEYS, designField } from '@/features/email/designerSave'
import { EMAIL_TEMPLATE_DEFAULTS } from '@/features/email/templateDefaults'
import { EmailDesignerClient, type DesignerTemplate } from './email-designer/EmailDesignerClient'
import { starterBlocks, templateLabel } from './email-designer/designerModel'

type Stored = Record<string, unknown>

const groupOf = (stored: Stored | null, key: string): { subject?: unknown; body?: unknown } | null =>
  (stored?.[key] as { subject?: unknown; body?: unknown } | null | undefined) ?? null

const textOf = (value: unknown, fallback: string): string => (typeof value === 'string' && value.trim() ? value : fallback)

/**
 * Server wrapper for /admin/email-designer. Admins only. Loads the saved
 * wording and designs of every template, plus the brand settings and logo
 * (the logo is read at depth 1 so its address can be shown), and hands them to
 * the client screen.
 */
export async function EmailDesignerView() {
  const context = await getAdminContext()
  if (!hasAdminPanelAccess(context.user)) redirect('/admin/login')
  if (!context.isAdmin) return <p>You do not have access to the email designer.</p>

  const engine = context.engine as unknown as { findGlobal: (args: Record<string, unknown>) => Promise<Stored | null> }
  const stored = (await engine.findGlobal({ slug: 'email-templates', depth: 0, user: context.user }).catch((): null => null)) ?? null
  const brandDoc = (await engine.findGlobal({ slug: 'email-brand', depth: 1, user: context.user }).catch((): null => null)) ?? null
  const brand = brandFromStored(brandDoc)
  const logo = storedLogo(brandDoc)

  const templates: DesignerTemplate[] = DESIGNABLE_TEMPLATE_KEYS.map((key) => {
    const defaults = EMAIL_TEMPLATE_DEFAULTS[key as keyof typeof EMAIL_TEMPLATE_DEFAULTS]
    const group = groupOf(stored, key)
    // A stored design that no longer checks out counts as no design, so the screen never shows broken blocks.
    const design = designedBlocks(stored?.[designField(key)])
    const body = textOf(group?.body, defaults.body)
    return {
      key,
      label: templateLabel(key),
      subject: textOf(group?.subject, defaults.subject),
      defaultSubject: defaults.subject,
      hasDesign: design !== null,
      blocks: design ?? starterBlocks(body),
    }
  })

  return <EmailDesignerClient templates={templates} brand={brand} logo={logo} />
}
