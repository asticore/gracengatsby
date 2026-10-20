import type { ElementDef } from '@/lib/elements/registry'
import type { EditorField } from '@/lib/elements/fieldTypes'

/**
 * The form builder's palette: one element per field type, plus the Step break,
 * the Form placement and a Button.
 *
 * These register into the same element registry the page builder uses
 * (src/lib/elements/registry.ts), so a form field is selected, moved, nested
 * in columns and styled with exactly the controls a heading is. Each entry is
 * a row value of the generic `element` block - no new tables.
 *
 * Field settings live in `props` shaped like a FormFieldDef; see
 * `nodeToField` in layout.ts for how they are read back.
 */

const WIDTH_OPTIONS = [
  { label: 'Full width (1/1)', value: 'full' },
  { label: 'Half (1/2)', value: 'half' },
  { label: 'One third (1/3)', value: 'third' },
  { label: 'Two thirds (2/3)', value: 'twoThirds' },
  { label: 'One quarter (1/4)', value: 'quarter' },
]

const label: EditorField = { name: 'label', label: 'Label', type: 'text' }
const name: EditorField = {
  name: 'name',
  label: 'Field key',
  type: 'text',
  width: 'half',
  helpText: 'How the answer is stored and how rules and calculations refer to it. Lowercase, no spaces. Changing it later orphans old entries.',
}
const width: EditorField = {
  name: 'width',
  label: 'Width in the row',
  type: 'select',
  width: 'half',
  options: WIDTH_OPTIONS,
  helpText: 'Fields side by side share a row. For whole-section control use the column widths on the section.',
}
const required: EditorField = { name: 'required', label: 'Required', type: 'checkbox' }
const placeholder: EditorField = { name: 'placeholder', label: 'Placeholder', type: 'text', width: 'half' }
const defaultValue: EditorField = { name: 'defaultValue', label: 'Default value', type: 'text', width: 'half' }
const helpText: EditorField = { name: 'helpText', label: 'Help text', type: 'text', helpText: 'A short note shown under the field.' }
const prefillKey: EditorField = {
  name: 'prefillKey',
  label: 'Pre-fill from URL key',
  type: 'text',
  helpText: 'Fill this from a link such as ?utm_source=news. Only keys listed under Form settings > Behaviour are used.',
}
const logic: EditorField = { name: 'conditional', label: 'Conditional logic', type: 'formLogic' }
const textRules: EditorField[] = [
  { name: 'minLength', label: 'Minimum characters', type: 'number', width: 'half' },
  { name: 'maxLength', label: 'Maximum characters', type: 'number', width: 'half' },
  { name: 'pattern', label: 'Must match pattern (regex)', type: 'text', helpText: 'Optional. For example ^[0-9]{4}$ for a four digit code.' },
  { name: 'patternMessage', label: 'Message when it does not match', type: 'text' },
]
const pricing: EditorField[] = [
  { name: 'priced', label: 'This field affects the price', type: 'checkbox' },
  { name: 'amount', label: 'Flat amount', type: 'number', width: 'half' },
  { name: 'unitPrice', label: 'Price per unit', type: 'number', width: 'half' },
]

const base = (extra: EditorField[] = []): EditorField[] => [label, name, width, ...extra, helpText, required, prefillKey, logic]

type FieldSpec = {
  type: string
  label: string
  icon: string
  description: string
  fields: EditorField[]
  defaults?: Record<string, unknown>
}

const SPECS: FieldSpec[] = [
  {
    type: 'text',
    label: 'Text',
    icon: 'Aa',
    description: 'A single line of text.',
    fields: base([placeholder, defaultValue, ...textRules]),
    defaults: { label: 'Text' },
  },
  {
    type: 'textarea',
    label: 'Text area',
    icon: String.fromCodePoint(0xb6),
    description: 'Several lines of text, for messages.',
    fields: base([placeholder, ...textRules]),
    defaults: { label: 'Message' },
  },
  {
    type: 'email',
    label: 'Email',
    icon: '@',
    description: 'An email address, checked for a valid shape.',
    fields: base([placeholder]),
    defaults: { label: 'Email', name: 'email' },
  },
  {
    type: 'phone',
    label: 'Phone',
    icon: String.fromCodePoint(0x260e),
    description: 'A phone number.',
    fields: base([placeholder, ...textRules]),
    defaults: { label: 'Phone' },
  },
  {
    type: 'number',
    label: 'Number',
    icon: '#',
    description: 'A number, with optional minimum and maximum.',
    fields: base([
      placeholder,
      { name: 'min', label: 'Minimum', type: 'number', width: 'half' },
      { name: 'max', label: 'Maximum', type: 'number', width: 'half' },
      ...pricing,
    ]),
    defaults: { label: 'Number' },
  },
  {
    type: 'select',
    label: 'Dropdown',
    icon: String.fromCodePoint(0x25be),
    description: 'Choose one from a list.',
    fields: base([placeholder, { name: 'options', label: 'Choices', type: 'formOptions' }, ...pricing]),
    defaults: { label: 'Choose one', options: [{ label: 'Option 1', value: 'option_1' }, { label: 'Option 2', value: 'option_2' }] },
  },
  {
    type: 'radio',
    label: 'Radio buttons',
    icon: String.fromCodePoint(0x25c9),
    description: 'Choose one, all choices visible.',
    fields: base([{ name: 'options', label: 'Choices', type: 'formOptions' }, ...pricing]),
    defaults: { label: 'Choose one', options: [{ label: 'Option 1', value: 'option_1' }, { label: 'Option 2', value: 'option_2' }] },
  },
  {
    type: 'checkbox',
    label: 'Checkboxes',
    icon: String.fromCodePoint(0x2611),
    description: 'Tick several. With no choices it is a single yes/no box.',
    fields: base([{ name: 'options', label: 'Choices (leave empty for one yes/no box)', type: 'formOptions' }, ...pricing]),
    defaults: { label: 'Choose any', options: [{ label: 'Option 1', value: 'option_1' }, { label: 'Option 2', value: 'option_2' }] },
  },
  {
    type: 'date',
    label: 'Date',
    icon: '\u{1F4C5}',
    description: 'A calendar date.',
    fields: base([defaultValue]),
    defaults: { label: 'Date' },
  },
  {
    type: 'time',
    label: 'Time',
    icon: '\u{1F552}',
    description: 'A time of day.',
    fields: base([defaultValue]),
    defaults: { label: 'Time' },
  },
  {
    type: 'datetime',
    label: 'Date and time',
    icon: '\u{1F5D3}',
    description: 'A date and a time together.',
    fields: base([defaultValue]),
    defaults: { label: 'Date and time' },
  },
  {
    type: 'file',
    label: 'File upload',
    icon: '\u{1F4CE}',
    description: 'Let visitors attach a file. Types are checked against the Media settings allow-list.',
    fields: base([
      { name: 'accept', label: 'Accepted types', type: 'text', helpText: 'Comma-separated extensions, e.g. .pdf,.jpg. Blank accepts anything Media settings allows.' },
      { name: 'maxFileMb', label: 'Largest file (MB)', type: 'number', helpText: 'Never above the Media upload limit.' },
    ]),
    defaults: { label: 'Attachment' },
  },
  {
    type: 'hidden',
    label: 'Hidden',
    icon: '\u{1F441}',
    description: 'Not shown. Carries a fixed value or a value pre-filled from the link (campaign, source).',
    fields: [label, name, defaultValue, prefillKey],
    defaults: { label: 'Source' },
  },
  {
    type: 'rating',
    label: 'Rating',
    icon: String.fromCodePoint(0x2605),
    description: 'Star rating from 1 up to the number you choose.',
    fields: base([{ name: 'scaleMax', label: 'Number of stars (3-10)', type: 'number' }]),
    defaults: { label: 'Rating', scaleMax: 5 },
  },
  {
    type: 'nps',
    label: 'NPS (0-10)',
    icon: '\u{1F4CA}',
    description: 'How likely are you to recommend us, 0 to 10.',
    fields: base(),
    defaults: { label: 'How likely are you to recommend us?' },
  },
  {
    type: 'signature',
    label: 'Signature',
    icon: String.fromCodePoint(0x270d),
    description: 'Draw a signature with a finger or mouse.',
    fields: base(),
    defaults: { label: 'Signature' },
  },
  {
    type: 'matrix',
    label: 'Matrix',
    icon: String.fromCodePoint(0x25a6),
    description: 'A grid: each row is a question answered from the same set of columns.',
    fields: base([
      { name: 'rows', label: 'Rows (the questions)', type: 'formOptions' },
      { name: 'options', label: 'Columns (the answers)', type: 'formOptions' },
    ]),
    defaults: {
      label: 'Rate each',
      rows: [{ label: 'Quality', value: 'quality' }, { label: 'Service', value: 'service' }],
      options: [{ label: 'Poor', value: 'poor' }, { label: 'Good', value: 'good' }, { label: 'Great', value: 'great' }],
    },
  },
  {
    type: 'appointment',
    label: 'Appointment slot',
    icon: '\u{1F4C6}',
    description: 'Pick a day and a time slot from the hours you offer.',
    fields: base([
      { name: 'slotsText', label: 'Time slots', type: 'text', helpText: 'Start times, comma-separated, 24-hour. e.g. 09:00, 09:30, 10:00' },
      { name: 'weekdaysText', label: 'Open days', type: 'text', helpText: 'Numbers, 0 = Sunday ... 6 = Saturday. e.g. 1,2,3,4,5' },
      { name: 'daysAhead', label: 'How many days ahead can be booked', type: 'number' },
      {
        name: 'capacity',
        label: 'Bookings allowed per time',
        type: 'number',
        helpText: 'How many people can book the same start time before it shows as taken. Leave it at 1 for one booking per time.',
      },
    ]),
    defaults: { label: 'Appointment', slotsText: '09:00, 10:00, 11:00, 13:00, 14:00, 15:00', weekdaysText: '1,2,3,4,5', daysAhead: 60, capacity: 1 },
  },
  {
    type: 'address',
    label: 'Address',
    icon: '\u{1F4CD}',
    description: 'A full address. Optional look-up with OpenStreetMap (Nominatim) or Google Places.',
    fields: base([
      {
        name: 'addressLookup',
        label: 'Address look-up',
        type: 'select',
        options: [
          { label: 'None (type it in)', value: 'none' },
          { label: 'OpenStreetMap Nominatim', value: 'nominatim' },
          { label: 'Google Places (needs a Maps key in Integrations)', value: 'google' },
        ],
      },
    ]),
    defaults: { label: 'Address', addressLookup: 'none' },
  },
  {
    type: 'consent',
    label: 'Consent (GDPR)',
    icon: String.fromCodePoint(0x2696),
    description: 'A required tick-box for privacy consent. The answer and the time are stored with the entry.',
    fields: [
      { name: 'label', label: 'Consent wording', type: 'textarea' },
      name,
      { name: 'consentLink', label: 'Privacy policy link', type: 'text' },
      required,
      logic,
    ],
    defaults: { label: 'I agree to the processing of my personal data.', name: 'consent', required: true },
  },
  {
    type: 'calculation',
    label: 'Calculation / total',
    icon: String.fromCodePoint(0x2211),
    description: 'A number worked out from other fields, such as a quote or total.',
    fields: [
      label,
      name,
      { name: 'formula', label: 'Formula', type: 'text', helpText: 'Arithmetic over other fields: {number of guests} * 25 + 10. No functions.' },
      { name: 'decimalPlaces', label: 'Decimal places', type: 'number', width: 'half' },
      { name: 'prefix', label: 'Prefix (e.g. $)', type: 'text', width: 'half' },
      { name: 'suffix', label: 'Suffix', type: 'text', width: 'half' },
      logic,
    ],
    defaults: { label: 'Total', formula: '', decimalPlaces: 2 },
  },
  {
    type: 'payment',
    label: 'Payment summary',
    icon: '\u{1F4B3}',
    description: 'Shows the priced total. Turn on "This form takes payment" under Form settings > Payment.',
    fields: [label, logic],
    defaults: { label: 'Payment' },
  },
]

export const FORM_ELEMENTS: ElementDef[] = [
  ...SPECS.map(
    (spec): ElementDef => ({
      type: `ff-${spec.type}`,
      label: spec.label,
      icon: spec.icon,
      category: 'formFields',
      description: spec.description,
      fields: spec.fields,
      defaultProps: () => ({ width: 'full', ...(spec.defaults || {}) }),
    }),
  ),
  {
    type: 'ff-step',
    label: 'Step break',
    icon: String.fromCodePoint(0x21e5),
    category: 'formFields',
    description: 'Splits the form into steps with a progress bar. Place it at the top level, between sections.',
    fields: [{ name: 'title', label: 'Title of the step that starts here', type: 'text' }],
    defaultProps: () => ({ title: 'Next step' }),
  },
  {
    type: 'ff-html',
    label: 'Custom HTML',
    icon: '</>',
    category: 'formFields',
    description: 'Markup shown as written. Only people who can edit forms can add this - it is not escaped.',
    fields: [{ name: 'html', label: 'HTML', type: 'textarea' }],
    defaultProps: () => ({ html: '' }),
  },
  {
    type: 'button',
    label: 'Button',
    icon: String.fromCodePoint(0x25ad),
    description: 'A link styled as a button.',
    category: 'text',
    fields: [
      { name: 'text', label: 'Label', type: 'text', supportsMergeTags: true },
      { name: 'url', label: 'Link', type: 'text', supportsMergeTags: true, helpText: 'Use #top for a back-to-top button.' },
      {
        name: 'variant',
        label: 'Style',
        type: 'select',
        width: 'half',
        options: [
          { label: 'Primary', value: 'primary' },
          { label: 'Secondary', value: 'secondary' },
          { label: 'Plain', value: 'plain' },
        ],
      },
      {
        name: 'styleName',
        label: 'Button style name',
        type: 'text',
        helpText: 'Use a custom style from Theming > Buttons, e.g. outline',
      },
      { name: 'newTab', label: 'Open in new tab', type: 'checkbox' },
      { name: 'nofollow', label: 'Add rel=nofollow', type: 'checkbox' },
      {
        name: 'size',
        label: 'Size',
        type: 'select',
        width: 'half',
        options: [
          { label: 'Small', value: 'sm' },
          { label: 'Medium', value: 'md' },
          { label: 'Large', value: 'lg' },
        ],
      },
      {
        name: 'align',
        label: 'Alignment',
        type: 'select',
        width: 'half',
        options: [
          { label: 'Left', value: 'left' },
          { label: 'Center', value: 'center' },
          { label: 'Right', value: 'right' },
        ],
      },
    ],
    defaultProps: () => ({ text: 'Learn more', url: '/', variant: 'primary', align: 'left', size: 'md' }),
  },
]

/** Element types only meaningful inside a form. Hidden from the page builder's palette. */
export const FORM_ONLY_ELEMENT_TYPES = new Set(FORM_ELEMENTS.filter((el) => el.category === 'formFields').map((el) => el.type))
