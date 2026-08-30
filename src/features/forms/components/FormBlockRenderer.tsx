import React from 'react'

import type { FormDoc } from '../types'

import { formsEnabled, getFormSettings, resolveForForm, toPublicConfig } from '../settings'
import { FORMS_SLUG } from '../slugs'
import { FormRenderer } from './FormRenderer'

/**
 * The server half of the Form block: loads the form, resolves its settings
 * against the site defaults, and hands the browser only what it is allowed to
 * see.
 *
 * The engine is loaded through a deferred import for the same reason described
 * in settings.ts: this component is part of the feature's public surface, which
 * the config imports, and `@/lib/engine` imports the config.
 *
 * Renders nothing at all when the Forms feature is off - not an empty box, not
 * a message. A page that used to have a form on it should read as a page
 * without a form, and the submission endpoint 404s in the same state, so there
 * is no half-on condition where the form draws but cannot be sent.
 */
export async function FormBlockRenderer({
  form,
  heading,
  showTitle,
  intro,
}: {
  form?: number | string | FormDoc | null
  heading?: string | null
  showTitle?: boolean | null
  intro?: string | null
}) {
  if (!form) return null

  const { getEngine } = await import('@/lib/engine')
  const engine = await getEngine()

  if (!(await formsEnabled(engine))) return null

  const doc =
    typeof form === 'object'
      ? (form as FormDoc)
      : ((await engine
          .findByID({ collection: FORMS_SLUG, id: form, depth: 0 })
          .catch((): null => null)) as FormDoc | null)

  if (!doc?.id) return null

  const resolved = resolveForForm(doc, await getFormSettings(engine))
  const config = toPublicConfig(doc, resolved)

  const title = heading || (showTitle !== false ? doc.title : '')

  return (
    <section className="built-block built-block--form">
      <div className="page-shell built-block__inner">
        {title ? <h2>{title}</h2> : null}
        {intro ? <p className="form-intro">{intro}</p> : null}
        <FormRenderer config={config} />
      </div>
    </section>
  )
}
