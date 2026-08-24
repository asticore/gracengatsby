import type { Field } from 'payload'

import { FEATURES } from './registry'

/**
 * The Features group in Site Settings, generated from the registry so the
 * toggles can never drift from the features the rest of the system knows about.
 *
 * Laid out three-per-row to stay readable as the list grows. Features that are
 * not fully wired yet say so in their own description rather than silently
 * doing nothing when switched on.
 */
export const featureToggleField: Field = {
  type: 'group',
  name: 'features',
  label: 'Features',
  admin: {
    description:
      'Turn sections of the portal and site on or off. Turning a feature off hides its menu items and its public pages - it never deletes data. To remove a disabled feature’s data, use Database Cleanup.',
  },
  fields: chunk(FEATURES, 3).map((row) => ({
    type: 'row' as const,
    fields: row.map((feature) => ({
      name: feature.key,
      type: 'checkbox' as const,
      label: feature.label,
      defaultValue: feature.defaultEnabled,
      admin: {
        width: '33%',
        description: feature.implemented
          ? feature.description
          : `${feature.description} (Settings are saved; the behaviour is still being built.)`,
      },
    })),
  })),
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}
