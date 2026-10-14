import type { GlobalConfig } from '@/engine'

import { DATE_FORMAT_OPTIONS, SITE_DETAILS_DEFAULTS, TIME_FORMAT_OPTIONS, TIME_ZONE_OPTIONS } from '@/features/site/detailsModel'

import { isAdmin } from '../access/ecommerceAccess'

/**
 * Business identity, time zone and date and clock formats. Event times, invoices and the search engine
 * organisation data read from here. Every value has a default, so a fresh install shows the same output
 * as before this global existed.
 */
export const SiteDetails: GlobalConfig = {
  slug: 'site-details',
  label: 'Site details',
  dbName: 'eg_site_details',
  admin: {
    group: 'Settings',
    description:
      'Your business details, the time zone and how dates and times are shown. Event times, invoices and search engine details use these.',
  },
  access: {
    read: () => true,
    update: isAdmin,
  },
  fields: [
    {
      name: 'timezone',
      type: 'select',
      label: 'Time zone',
      defaultValue: SITE_DETAILS_DEFAULTS.timezone,
      options: TIME_ZONE_OPTIONS,
      admin: { description: 'The time zone that event dates and times are shown in.' },
    },
    {
      name: 'dateFormat',
      type: 'select',
      label: 'Date style',
      defaultValue: SITE_DETAILS_DEFAULTS.dateFormat,
      options: DATE_FORMAT_OPTIONS,
      admin: { description: 'How dates are written on the site. Cards on the events list always use a short month.' },
    },
    {
      name: 'timeFormat',
      type: 'select',
      label: 'Clock',
      defaultValue: SITE_DETAILS_DEFAULTS.timeFormat,
      options: TIME_FORMAT_OPTIONS,
      admin: { description: 'Show times with a 12-hour or 24-hour clock.' },
    },
    {
      type: 'group',
      name: 'business',
      label: 'Business details',
      admin: {
        description: 'Used on invoices and in search engine data. Blank invoice fields fall back to these.',
      },
      fields: [
        {
          name: 'businessName',
          type: 'text',
          label: 'Business name',
          admin: { description: 'The name customers know you by.' },
        },
        {
          name: 'legalName',
          type: 'text',
          label: 'Legal name',
          admin: { description: 'The registered name, if it is different from the business name.' },
        },
        {
          name: 'abn',
          type: 'text',
          label: 'ABN',
          admin: { description: 'Australian Business Number. Shown on tax invoices.' },
        },
        {
          type: 'row',
          fields: [
            { name: 'phone', type: 'text', label: 'Phone', admin: { width: '50%' } },
            { name: 'email', type: 'text', label: 'Email', admin: { width: '50%' } },
          ],
        },
        {
          name: 'website',
          type: 'text',
          label: 'Website address',
          admin: { description: 'The full address, starting with https://' },
        },
        {
          name: 'streetAddress',
          type: 'text',
          label: 'Street address',
        },
        {
          type: 'row',
          fields: [
            { name: 'suburb', type: 'text', label: 'Suburb or town', admin: { width: '50%' } },
            { name: 'state', type: 'text', label: 'State or region', admin: { width: '25%' } },
            { name: 'postcode', type: 'text', label: 'Postcode', admin: { width: '25%' } },
          ],
        },
        {
          name: 'country',
          type: 'text',
          label: 'Country',
          defaultValue: SITE_DETAILS_DEFAULTS.country,
        },
        {
          name: 'openingHours',
          type: 'textarea',
          label: 'Opening hours',
          admin: { description: 'One line per day or group of days, for example "Mon to Fri: 9am to 5pm".' },
        },
      ],
    },
  ],
}
