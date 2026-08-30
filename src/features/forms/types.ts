/**
 * The shared vocabulary for forms.
 *
 * These types describe a form *as stored*, not as the CMS engine generates it.
 * The generated types are regenerated on every build and would drag the whole
 * config into the browser bundle; the renderer, the parser and the conditional
 * evaluator all need the same shapes on both sides of the wire, so they are
 * declared once here and kept deliberately loose (everything optional) because
 * a form is user-defined data and half of it is genuinely absent most of the
 * time.
 */

export const FORMS_FEATURE_KEY = 'forms' as const

export type FormFieldType =
  | 'text'
  | 'textarea'
  | 'email'
  | 'phone'
  | 'number'
  | 'select'
  | 'radio'
  | 'checkbox'
  | 'date'
  | 'file'
  | 'hidden'
  | 'html'
  | 'section'
  | 'page'
  | 'calculation'

/** Types that never carry a value a visitor typed. */
export const PRESENTATIONAL_TYPES: FormFieldType[] = ['html', 'section', 'page']

export type FieldWidth = 'full' | 'half' | 'third' | 'twoThirds' | 'quarter'

export type ConditionOperator =
  | 'equals'
  | 'notEquals'
  | 'contains'
  | 'notContains'
  | 'greaterThan'
  | 'lessThan'
  | 'isEmpty'
  | 'isNotEmpty'

export type ConditionRule = {
  field?: string
  operator?: ConditionOperator
  value?: string
}

export type ConditionalLogic = {
  enabled?: boolean
  /** `show` means the field is hidden until the rules match; `hide` is the inverse. */
  action?: 'show' | 'hide'
  match?: 'all' | 'any'
  rules?: ConditionRule[]
}

export type FormFieldOption = {
  label?: string
  value?: string
  /** Added to the form's total when this option is chosen, on a purchasable form. */
  price?: number
}

export type FormFieldDef = {
  id?: string
  type?: FormFieldType
  label?: string
  name?: string
  required?: boolean
  placeholder?: string
  helpText?: string
  defaultValue?: string
  options?: FormFieldOption[]
  width?: FieldWidth
  /** Raw markup for an `html` field, and the body of a `section` heading. */
  html?: string
  min?: number
  max?: number
  /** `file` only: comma-separated extensions, e.g. ".pdf,.jpg". */
  accept?: string
  conditional?: ConditionalLogic
  calculation?: {
    formula?: string
    decimalPlaces?: number
    prefix?: string
    suffix?: string
  }
  pricing?: {
    /** Charge for this field on a purchasable form. */
    priced?: boolean
    /** Flat amount added when the field has any value. */
    amount?: number
    /** Multiply the field's own numeric value by this. */
    unitPrice?: number
  }
}

export type FormNotification = {
  enabled?: boolean
  recipients?: string
  subject?: string
  message?: string
}

export type FormConfirmation = {
  enabled?: boolean
  /** Name of the field holding the visitor's address. */
  toField?: string
  subject?: string
  message?: string
}

export type FormPayment = {
  purchasable?: boolean
  basePrice?: number
  /** Overrides the summed field prices when set - a calculation field name. */
  totalField?: string
  currency?: string
  /** Product the resulting line item is booked against. See pricing.ts. */
  product?: number | string | { id?: number | string }
}

export type FormDoc = {
  id?: number | string
  title?: string
  fields?: FormFieldDef[]
  settings?: {
    submitButtonLabel?: string
    successMessage?: string
    errorMessage?: string
    redirectUrl?: string
  }
  notification?: FormNotification
  confirmation?: FormConfirmation
  spam?: {
    /** 'inherit' takes the site default from Form Settings. */
    honeypot?: Inherited
    minimumFillTime?: Inherited
    turnstile?: Inherited
  }
  payment?: FormPayment
}

export type Inherited = 'inherit' | 'on' | 'off'

/** What a visitor sent, keyed by field name. */
export type SubmissionValues = Record<string, unknown>

/** One priced row handed to checkout. See pricing.ts. */
export type LineItem = {
  label: string
  /** Whole currency units, not cents - matched to the shop plugin's price fields. */
  amount: number
  quantity: number
  /** Field name this row came from; absent for the form's base price. */
  source?: string
}

export type FormPricing = {
  currency: string
  lines: LineItem[]
  total: number
}

/** The spam and defaults settings a submission is judged against. */
export type ResolvedFormSettings = {
  storeSubmissions: boolean
  sendAdminNotification: boolean
  notificationRecipients: string
  honeypot: boolean
  minimumFillTimeSeconds: number
  turnstile: boolean
  turnstileSiteKey: string
  turnstileSecretKey: string
  submitButtonLabel: string
  successMessage: string
  errorMessage: string
  retentionDays: number
}

/** The subset of a form the browser needs. Never includes secrets. */
export type PublicFormConfig = {
  id: number | string
  title: string
  fields: FormFieldDef[]
  submitButtonLabel: string
  successMessage: string
  errorMessage: string
  redirectUrl?: string
  honeypot: boolean
  minimumFillTimeSeconds: number
  turnstileSiteKey?: string
  purchasable: boolean
  currency: string
}
