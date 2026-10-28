/**
 * The deep link into the builder's Translate mode.
 *
 * `/admin/visual-editor/collection/<slug>/<id>?lang=<locale>&translate=1` opens
 * the page with that language selected and the translate panel showing. Pure,
 * so the rule (which language wins, what a bad value does) is tested without
 * the builder.
 */

export type TranslateParams = {
  /** True when translate=1 (or true) was asked for. */
  translate: boolean
  /** The target language to edit, or null to edit the default language. */
  locale: string | null
}

export function resolveTranslateParams(search: string, targets: readonly string[], defaultLocale: string): TranslateParams {
  const params = new URLSearchParams(search)
  const flag = params.get('translate')
  const translate = flag === '1' || flag === 'true'
  const lang = params.get('lang')

  // A language that is not an active target is ignored rather than trusted: the
  // builder only ever edits languages the site offers.
  if (lang && lang !== defaultLocale && targets.includes(lang)) return { translate: true, locale: lang }
  if (translate && targets.length > 0) return { translate: true, locale: targets[0] ?? null }
  return { translate, locale: null }
}

/** The builder URL for one document in one language. */
export function translateEditorPath(collection: string, documentId: string, locale: string): string {
  const params = new URLSearchParams({ lang: locale, translate: '1' })
  return `/admin/visual-editor/collection/${encodeURIComponent(collection)}/${encodeURIComponent(documentId)}?${params.toString()}`
}
