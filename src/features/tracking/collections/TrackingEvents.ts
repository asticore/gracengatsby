import type { CollectionConfig } from '@/engine'

import { roleAccess } from '@/access/ecommerceAccess'

import { STANDARD_EVENTS, TRIGGER_TYPES, URL_MATCH_MODES, validateTrackingEvent, type TrackingEventDef } from '../events'
import { TRACKING_EVENTS_SLUG, TRACKING_EVENTS_TABLE } from '../slugs'

const onlyFor = (trigger: string) => (_: unknown, s: Record<string, unknown>) => s?.triggerType === trigger

/** One conversion or behaviour event, sent to every connected tag platform once its consent category is granted. */
export const TrackingEvents: CollectionConfig = {
  slug: TRACKING_EVENTS_SLUG,
  dbName: TRACKING_EVENTS_TABLE,
  labels: { singular: 'Tracking event', plural: 'Tracking events' },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'platformEvent', 'triggerType', 'enabled'],
    group: 'Content',
    description: 'Events fired on the public site: a click, form submit, page view, scroll depth or time on page. Platforms are set under Integrations. Nothing fires until the visitor accepts the matching cookie category.',
    components: {
      beforeList: ['@/features/tracking/editor/TrackingEventsListActions#TrackingEventsListActions'],
    },
  },
  access: {
    create: roleAccess('tracking', 'create'),
    delete: roleAccess('tracking', 'delete'),
    read: roleAccess('tracking', 'read'),
    update: roleAccess('tracking', 'update'),
  },
  fields: [
    { name: 'name', type: 'text', required: true, admin: { description: 'The event name sent to platforms, e.g. Enquiry or Newsletter signup.' } },
    {
      name: 'platformEvent',
      type: 'select',
      required: true,
      defaultValue: 'Custom',
      options: STANDARD_EVENTS.map((value) => ({ label: value === 'Custom' ? 'Custom (use the name above)' : value, value })),
    },
    {
      name: 'triggerType',
      type: 'select',
      required: true,
      defaultValue: 'click',
      options: TRIGGER_TYPES.map((value) => ({ label: value, value })),
    },
    {
      name: 'selector',
      type: 'text',
      admin: { description: 'CSS selector, e.g. #enquire or a.btn-primary. Needed for click and submit.', condition: (_: unknown, s: Record<string, unknown>) => s?.triggerType === 'click' || s?.triggerType === 'submit' },
    },
    { name: 'selectorText', type: 'text', admin: { description: 'Optional hint: the button text, to help you recognise the element.', condition: onlyFor('click') } },
    {
      type: 'row',
      fields: [
        { name: 'urlMatchMode', type: 'select', defaultValue: 'any', options: URL_MATCH_MODES.map((value) => ({ label: value, value })), admin: { width: '25%' } },
        { name: 'urlMatch', type: 'text', admin: { width: '50%', description: 'Path, e.g. /contact. Ignored when the match is "any".' } },
        { name: 'domain', type: 'text', admin: { width: '25%', description: 'Host only, e.g. example.com. Blank for every domain.' } },
      ],
    },
    { name: 'scrollDepth', type: 'number', defaultValue: 50, admin: { description: 'Percent of the page scrolled, 1 to 100.', condition: onlyFor('scroll') } },
    { name: 'timeSeconds', type: 'number', defaultValue: 30, admin: { description: 'Seconds on the page, 1 to 3600.', condition: onlyFor('time') } },
    {
      type: 'row',
      fields: [
        { name: 'value', type: 'number', admin: { width: '33%', description: 'Optional monetary value.' } },
        { name: 'currency', type: 'text', admin: { width: '33%', description: 'Three letters, e.g. USD.' } },
        { name: 'contentName', type: 'text', admin: { width: '33%', description: 'Optional name of the item or page.' } },
      ],
    },
    {
      name: 'valueSource',
      type: 'select',
      defaultValue: 'none',
      options: [
        { label: 'None', value: 'none' },
        { label: 'Fixed amount', value: 'fixed' },
        { label: 'Cart total', value: 'cartTotal' },
        { label: 'Product price (product page)', value: 'productPrice' },
        { label: 'Order total (confirmation page)', value: 'orderTotal' },
        { label: 'Quantity', value: 'quantity' },
        { label: 'Text of an element', value: 'elementText' },
        { label: 'Attribute of an element', value: 'elementAttr' },
        { label: 'Data layer variable', value: 'dataLayer' },
      ],
      admin: { description: 'Where the value sent with the event comes from, read when it fires.' },
    },
    { name: 'valueRef', type: 'text', admin: { description: 'Attribute name (e.g. data-price) or data layer variable name.', condition: (_: unknown, s: Record<string, unknown>) => s?.valueSource === 'elementAttr' || s?.valueSource === 'dataLayer' } },
    { name: 'valueSelector', type: 'text', admin: { description: 'Optional CSS selector of the element to read. Blank reads the clicked element.', condition: (_: unknown, s: Record<string, unknown>) => s?.valueSource === 'elementText' || s?.valueSource === 'elementAttr' } },
    { name: 'enabled', type: 'checkbox', defaultValue: true },
  ],
  defaultSort: 'name',
  hooks: {
    beforeValidate: [
      async ({ data, originalDoc }) => {
        if (!data) return data
        const merged = { ...(originalDoc ?? {}), ...data } as unknown as TrackingEventDef
        const errors = validateTrackingEvent(merged)
        if (errors.length) {
          const { ValidationError } = await import('@/localapi/operations')
          throw new ValidationError(errors.map((message) => ({ path: 'name', message })))
        }
        return data
      },
    ],
  },
}
