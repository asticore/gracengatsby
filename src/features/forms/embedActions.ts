'use server'

import { headers } from 'next/headers'

import { getAdminContext } from '@/admin/auth'
import { refuseWhileImpersonating } from '@/features/impersonation/policy'
import { audit } from '@/features/security/auditLog'
import { getSecuritySettings } from '@/features/security/settings'

import { normaliseFormConfig } from './config'
import { embedRowFrom, type EmbedRow } from './embedAdmin'
import type { FormConfig } from './types'

/**
 * What the External embeds screen calls. Reading the list needs the Forms read permission. Turning embedding on
 * or off, or changing the websites allowed, needs the Forms integrations permission (the same rule the form
 * save uses), or admin. Only `formConfig.embed` is written: the webhook settings and their secrets are read on
 * the server and written back unchanged, so they never reach the browser.
 */

export type EmbedResult = { ok: true } | { ok: false; error: string }

async function canRead(): Promise<{ engine: Awaited<ReturnType<typeof getAdminContext>>['engine']; user: unknown } | null> {
  const context = await getAdminContext()
  if (!context.user) return null
  if (!(context.isAdmin || context.can('forms', 'read'))) return null
  return { engine: context.engine, user: context.user }
}

async function canChangeEmbeds(): Promise<{ engine: Awaited<ReturnType<typeof getAdminContext>>['engine']; user: unknown; email: string } | null> {
  const context = await getAdminContext()
  if (!context.user) return null
  if (!(context.isAdmin || context.can('forms.integrations', 'update'))) return null
  return { engine: context.engine, user: context.user, email: String((context.user as { email?: unknown }).email ?? '') }
}

/** Every form with its embed state, for the screen. Empty when the viewer may not read forms. */
export async function listEmbeddableForms(): Promise<{ ok: true; rows: EmbedRow[]; canChange: boolean } | { ok: false; error: string }> {
  const reader = await canRead()
  if (!reader) return { ok: false, error: 'You do not have access to Forms.' }
  const result = await reader.engine.find({ collection: 'forms', depth: 0, limit: 500, sort: 'title', user: reader.user as never })
  const rows = result.docs.map((doc): EmbedRow => {
    const form = doc as { id: number | string; title?: unknown; formStatus?: unknown; embedKey?: unknown; formConfig?: unknown }
    return embedRowFrom({ ...form, formConfig: normaliseFormConfig(form.formConfig) as FormConfig })
  })
  const canChange = (await canChangeEmbeds()) !== null
  return { ok: true, rows, canChange }
}

/**
 * Turns embedding on or off for one form and sets the websites allowed to embed it. An empty list means any website.
 * The embed key never changes, so a snippet already placed on a site keeps working.
 */
export async function setFormEmbed(input: { id: number | string; enabled: boolean; allowedOrigins: string[] }): Promise<EmbedResult> {
  const blocked = refuseWhileImpersonating(await headers())
  if (blocked) return { ok: false, error: blocked }
  const writer = await canChangeEmbeds()
  if (!writer) return { ok: false, error: 'You do not have permission to change embeds.' }
  const id = typeof input.id === 'string' && /^\d+$/.test(input.id) ? Number(input.id) : input.id
  if (typeof id !== 'number' && typeof id !== 'string') return { ok: false, error: 'That form does not exist.' }
  const current = (await writer.engine.findByID({ collection: 'forms', depth: 0, id: id as number, overrideAccess: true }).catch((): null => null)) as { formConfig?: unknown } | null
  if (!current) return { ok: false, error: 'That form does not exist.' }
  const config = normaliseFormConfig(current.formConfig)
  config.embed = { ...(config.embed ?? {}), enabled: input.enabled, allowedOrigins: input.allowedOrigins.slice(0, 50) }
  try {
    await writer.engine.update({ collection: 'forms', id: id as number, data: { formConfig: config }, overrideAccess: true })
  } catch {
    return { ok: false, error: 'The embed could not be saved. Try again.' }
  }
  await audit(
    {
      action: 'update',
      actorEmail: writer.email || null,
      collectionSlug: 'forms',
      documentId: id,
      detail: `embed ${input.enabled ? 'on' : 'off'}, ${input.allowedOrigins.length} websites allowed`,
    },
    await getSecuritySettings(writer.engine as never),
  ).catch((): void => undefined)
  return { ok: true }
}
