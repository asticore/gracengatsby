import type { Field } from '@/engine'

/**
 * Denormalised latest PageSpeed result, so list views can show and sort a "PageSpeed" column without
 * joining the results table. Written only by the PageSpeed code (raw SQL), never by the edit form.
 * They are not `hidden` (hidden fields are left out of list columns), so the edit form hides them with
 * a never-true condition. They are read-only, and `pageSpeedBeforeChange` drops them from every save.
 * Columns: `pagespeed_score`, `pagespeed_at` (and the `version_` twins on the versions table).
 */
export const pageSpeedFields: Field[] = [
  {
    name: 'pagespeedScore',
    type: 'number',
    label: 'PageSpeed',
    admin: { readOnly: true, condition: () => false, description: 'Latest mobile performance score from Google PageSpeed Insights (0-100).' },
  },
  {
    name: 'pagespeedAt',
    type: 'date',
    label: 'PageSpeed tested',
    admin: { readOnly: true, condition: () => false, description: 'When the PageSpeed score was last measured.' },
  },
]
