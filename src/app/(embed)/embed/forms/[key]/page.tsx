import { notFound } from 'next/navigation'
import React from 'react'

import { FormRenderer } from '@/features/forms/components/FormRenderer'
import { normaliseFormConfig } from '@/features/forms/config'
import { readPlacesBrowserKey } from '@/features/forms/placesKey'
import { loadPublishedForm } from '@/features/forms/server'
import { formsEnabled, getFormSettings, resolveForForm, toPublicConfig } from '@/features/forms/settings'
import { getEngine } from '@/lib/engine'

export const dynamic = 'force-dynamic'

/**
 * /embed/forms/<id-or-key>
 *
 * The form on a page of its own, for another website to put in an iframe. It
 * 404s for a draft, an unknown key, a form with embedding switched off, and
 * while the Forms feature is off - the same answers for "does not exist" and
 * "is not shared", so the address reveals nothing. Which sites may frame it is
 * decided in the middleware from the form's allow-list.
 */
export default async function EmbedFormPage({
  params,
  searchParams,
}: {
  params: Promise<{ key: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { key } = await params
  const query = await searchParams
  const engine = await getEngine()

  if (!(await formsEnabled(engine))) notFound()
  const form = await loadPublishedForm(engine as never, key)
  if (!form) notFound()
  if (normaliseFormConfig(form.formConfig).embed?.enabled === false) notFound()

  const resolved = resolveForForm(form, await getFormSettings(engine))
  const base = toPublicConfig(form, resolved, { query })
  const config = { ...base, mapsKey: await readPlacesBrowserKey(engine, base.fields) }

  return <FormRenderer config={config} embed />
}
