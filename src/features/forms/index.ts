/**
 * Public surface of the Forms feature.
 *
 * Everything outside this folder imports from here - the config takes the two
 * collections and the block, the block renderer takes the component - so the
 * internal layout can change without touching an integration point.
 *
 * The whole feature is gated on the `forms` flag at two places and only two:
 * the block renderer draws nothing when it is off, and the submission endpoint
 * 404s. The collections stay registered either way, so switching the feature
 * off hides the screens without touching a single stored entry, and switching
 * it back on restores everything exactly as it was.
 */

export { Forms } from './collections/Forms'
export { FormSubmissions } from './collections/FormSubmissions'
export { FormBlock } from './block'
export { FormBlockRenderer } from './components/FormBlockRenderer'
export { FormRenderer } from './components/FormRenderer'

export {
  DEFAULT_FORM_SETTINGS,
  formsEnabled,
  getFormSettings,
  resolveForForm,
  toPublicConfig,
} from './settings'

export {
  applyCalculations,
  evaluateRule,
  isFieldVisible,
  resolveVisibility,
  sanitiseValues,
  splitIntoPages,
} from './conditions'

export {
  evaluateFormula,
  evaluateNode,
  parseFormula,
  roundTo,
  toNumber,
  type Node as FormulaNode,
  type ParseResult,
} from './expression'

export { buildCheckoutHandoff, priceSubmission, type CheckoutHandoff } from './pricing'

export { answerFields, buildCsv, csvFilename, type ExportRow } from './csv'

export {
  HONEYPOT_FIELD,
  RENDERED_AT_FIELD,
  TURNSTILE_FIELD,
  checkFillTime,
  checkHoneypot,
  checkTurnstile,
  type SpamVerdict,
} from './spam'

export { renderTemplate, sendSubmissionEmails, summarise } from './notify'

export { handleSubmission, rateLimitSubmission, type SubmitOutcome } from './submit'

export {
  FORMS_FEATURE_KEY,
  PRESENTATIONAL_TYPES,
  type ConditionOperator,
  type ConditionRule,
  type ConditionalLogic,
  type FormDoc,
  type FormFieldDef,
  type FormFieldType,
  type FormPricing,
  type LineItem,
  type PublicFormConfig,
  type ResolvedFormSettings,
  type SubmissionValues,
} from './types'
