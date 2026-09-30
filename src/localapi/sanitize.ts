/**
 * Deterministic replacement for the one side effect this app used to get, by
 * accident, from the reference engine's `buildConfig()` sanitizer
 * (the plan doc: last runtime use of `buildConfig`).
 *
 * `buildConfig()` mutates an `auth: true` collection's own `fields` array in
 * place, appending the implicit auth columns (`updatedAt`, `createdAt`,
 * `email`, `resetPasswordToken`, `resetPasswordExpiration`, `salt`, `hash`,
 * `loginAttempts`, `lockUntil`, `sessions`). `readRegistry` hands the SAME
 * object to every REST/Local-API handler, and `operations.ts` relies on those
 * fields being present (field-level `access.create/update: () => false` on
 * the password columns, `required`/`unique` on `email`, the `loginAttempts`
 * default). That only happened when some module in the same runtime happened
 * to import `engage.config.ts`; the `/api/[...slug]` route no longer does, so
 * the injection must not depend on it. This reproduces exactly what the
 * sanitizer appended (compared field-by-field against a real
 * `buildConfig()` run on 2026-09-29), with `label` strings instead of real
 * The original engine's i18n functions - no admin locale is configured, so
 * `t('general:email')` is always the English string.
 *
 * Idempotent: a field already present by name is left alone, so running it
 * before, after or without real `buildConfig()` yields the same fields.
 * No `engine` import.
 */

type FieldLike = { name?: string; [key: string]: unknown }

const denyAll = (): boolean => false

const IMPLICIT_AUTH_FIELDS = (): FieldLike[] => [
  {
    name: 'updatedAt',
    type: 'date',
    admin: { disableBulkEdit: true, hidden: true },
    index: true,
    label: 'Updated At',
  },
  {
    name: 'createdAt',
    type: 'date',
    admin: { disableBulkEdit: true, hidden: true },
    index: true,
    label: 'Created At',
  },
  {
    name: 'email',
    type: 'email',
    admin: { components: { Field: false } },
    hooks: {
      beforeChange: [({ value }: { value?: string }) => (value ? value.toLowerCase().trim() : undefined)],
    },
    label: 'Email',
    required: true,
    unique: true,
  },
  { name: 'resetPasswordToken', type: 'text', access: { create: denyAll, update: denyAll }, hidden: true },
  { name: 'resetPasswordExpiration', type: 'date', access: { create: denyAll, update: denyAll }, hidden: true },
  { name: 'salt', type: 'text', access: { create: denyAll, update: denyAll }, hidden: true },
  { name: 'hash', type: 'text', access: { create: denyAll, update: denyAll }, hidden: true },
  {
    name: 'loginAttempts',
    type: 'number',
    access: { create: denyAll, update: denyAll },
    defaultValue: 0,
    hidden: true,
  },
  { name: 'lockUntil', type: 'date', access: { create: denyAll, update: denyAll }, hidden: true },
  {
    name: 'sessions',
    type: 'array',
    access: {
      read: ({ doc, req }: { doc?: { id?: unknown }; req: { user?: { id?: unknown } | null } }) =>
        req.user?.id === doc?.id,
      update: denyAll,
    },
    admin: { disabled: true },
    fields: [
      { name: 'id', type: 'text', required: true },
      { name: 'createdAt', type: 'date', defaultValue: () => new Date() },
      { name: 'expiresAt', type: 'date', required: true },
    ],
  },
]

/** Appends any missing implicit auth field to `config.fields` (in place) when `config.auth` is truthy. Returns `config`. */
export function applyImplicitAuthFields<T extends { fields: unknown[]; auth?: unknown }>(config: T): T {
  if (!config.auth) return config
  const present = new Set((config.fields as FieldLike[]).map((f) => f.name))
  for (const field of IMPLICIT_AUTH_FIELDS()) {
    if (!present.has(field.name)) config.fields.push(field)
  }
  return config
}
