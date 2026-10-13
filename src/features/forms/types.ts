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
  | 'time'
  | 'datetime'
  | 'rating'
  | 'nps'
  | 'signature'
  | 'matrix'
  | 'appointment'
  | 'address'
  | 'consent'
  | 'payment'

/** Types that never carry a value a visitor typed. */
export const PRESENTATIONAL_TYPES: FormFieldType[] = ['html', 'section', 'page', 'payment']

/** Types whose answer is an object or a data URL rather than a short string. */
export const STRUCTURED_TYPES: FormFieldType[] = ['matrix', 'address', 'signature']

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
  /** Text validation, enforced in the browser and again on the server. */
  validation?: {
    minLength?: number
    maxLength?: number
    /** A regular expression source, without delimiters. Tested with the `u` flag. */
    pattern?: string
    patternMessage?: string
  }
  /** `rating` / `nps`: the highest value (rating 1-10, default 5; nps is always 0-10). */
  scaleMax?: number
  /** `matrix`: rows are the questions, options are the shared columns. */
  rows?: FormFieldOption[]
  /** `appointment`: slot start times offered ("09:00"), the weekdays that are open (0 = Sunday) and the booking window. */
  appointment?: {
    slots?: string[]
    weekdays?: number[]
    daysAhead?: number
    /** Longest booking horizon, in days. */
    maxDaysAhead?: number
    /** How many bookings may share one start time (default 1). See slots.ts. */
    capacity?: number
  }
  /** `address`: which lookup helps the visitor type, if any. */
  addressLookup?: 'none' | 'nominatim' | 'google'
  /** `consent`: link to the privacy policy shown in the label. */
  consentLink?: string
  /** `file`: largest file in megabytes (never above the Media upload limit). */
  maxFileMb?: number
  /** Query-string key that pre-fills this field, when that key is whitelisted here. */
  prefillKey?: string
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

export type FormStatus = 'draft' | 'published'

export type FormStylePreset = 'theme' | 'minimal' | 'rounded' | 'underline' | 'card' | 'dark'

/** Per-form options stored as one JSON column. Always read through normaliseFormConfig. */
export type FormConfig = {
  style?: {
    preset?: FormStylePreset
    accent?: string
    /** Author-written CSS, scoped to this form when rendered. See customCss.ts. */
    customCss?: string
  }
  steps?: {
    showProgress?: boolean
    progressStyle?: 'bar' | 'steps' | 'text'
    nextLabel?: string
    backLabel?: string
  }
  success?: {
    mode?: 'message' | 'redirect'
    message?: string
    redirectUrl?: string
  }
  embed?: {
    /** Allow-list of origins that may embed or post to this form. Empty means any origin. */
    allowedOrigins?: string[]
    /** Frameable on other websites at /embed/forms/<key>. */
    enabled?: boolean
  }
  notifications?: FormNotificationRule[]
  webhooks?: FormWebhook[]
  retentionDays?: number
  /** Let a visitor save progress and resume from an emailed link. */
  saveForLater?: boolean
  /** Query-string keys that may pre-fill fields. A field only fills when its `prefillKey` is in here. */
  prefillKeys?: string[]
}

export type FormNotificationRule = {
  id?: string
  name?: string
  enabled?: boolean
  recipients?: string
  subject?: string
  message?: string
  /** Only send when these rules match. Empty means always. */
  conditions?: ConditionalLogic
}

export type FormWebhook = {
  id?: string
  name?: string
  enabled?: boolean
  url?: string
  /** Signing secret. Never leaves the server. */
  secret?: string
}

export type FormDoc = {
  id?: number | string
  title?: string
  fields?: FormFieldDef[]
  /** The working copy the visual editor saves. */
  layout?: unknown
  /** What visitors see: a snapshot of `layout` taken at the last Publish. */
  publishedLayout?: unknown
  /** Absent on forms made before the visual builder: those count as published. */
  formStatus?: FormStatus | null
  embedKey?: string | null
  formConfig?: FormConfig | null
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
  captchaProvider: 'turnstile' | 'recaptcha'
  recaptchaSiteKey: string
  recaptchaSecretKey: string
  recaptchaMinScore: number
  submitButtonLabel: string
  successMessage: string
  errorMessage: string
  retentionDays: number
}

/** The subset of a form the browser needs. Never includes secrets. */
export type PublicFormConfig = {
  id: number | string
  /** Stable public key used by the embed route. */
  key?: string
  title: string
  fields: FormFieldDef[]
  /** The layout tree (sections, columns, headings, fields...) to draw. Absent for a legacy flat form. */
  layout?: unknown[]
  stylePreset?: FormStylePreset
  accent?: string
  customCss?: string
  steps?: { showProgress: boolean; progressStyle: 'bar' | 'steps' | 'text'; nextLabel: string; backLabel: string; titles: string[] }
  prefill?: Record<string, string>
  /** Query-string keys allowed to pre-fill fields (the same whitelist the server uses). The browser reads the page address with these. */
  prefillKeys?: string[]
  /** Browser key for Google Places address lookup. Sent only when a field on this form uses it. */
  mapsKey?: string
  captcha?: { provider: 'turnstile' | 'recaptcha'; siteKey: string }
  saveForLater?: boolean
  /** Set when rendered on a page of another website: posts go to this absolute origin. */
  apiBase?: string
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
