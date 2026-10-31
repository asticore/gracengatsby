import type { FormDoc } from './types'
import { PRESENTATIONAL_TYPES } from './types'
import { hasUnpublishedChanges, resolveLayout, splitLayoutIntoSteps } from './layout'

/**
 * A read-only picture of a form's visual layout, for the admin Forms screen. The admin no longer
 * edits fields; this only counts and lists what the visual editor built (or the legacy field list,
 * for forms made before it). Pure, so the admin view and the tests share one rule.
 */
export type FormLayoutSummary = {
  /** Input fields (presentational blocks such as HTML and section headings are not counted). */
  inputs: number
  required: number
  steps: number
  unpublished: boolean
  /** Labels (or names) of the input fields, in order. */
  items: string[]
}

export function summariseFormLayout(form: FormDoc | null | undefined): FormLayoutSummary {
  const resolved = resolveLayout(form, { draft: true })
  const inputs = resolved.fields.filter((field) => field.type && !PRESENTATIONAL_TYPES.includes(field.type))
  return {
    inputs: inputs.length,
    required: inputs.filter((field) => field.required).length,
    steps: splitLayoutIntoSteps(resolved.layout).length,
    unpublished: hasUnpublishedChanges(form),
    items: inputs.map((field) => field.label || field.name || field.type || '').filter(Boolean),
  }
}
