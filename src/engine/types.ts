/**
 * Config-authoring types: the vocabulary this app's collection/global/block
 * files are written in (`CollectionConfig`, `GlobalConfig`, `Field`, `Access`,
 * hooks, ...).
 *
 * Hand-written replacement for the types that used to be re-exported from the
 * `engine` package (the plan doc, last stage). They describe only
 * what this app's ~40 config files and its own runtime (`src/localapi/*`,
 * `src/admin/*`) actually use - deliberately looser than the vendor's types
 * (every object type carries an index signature) because nothing here is
 * validated by a vendor sanitizer any more: the runtime reads exactly the
 * properties it needs and ignores the rest.
 *
 * No `engine` import anywhere.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

import type { Config, User } from '@/engage-types'
import type { Where } from '@/localapi/access'
import type { Engine } from '@/localapi/engine'

export type { Where }
export type Sort = string | string[]

/** Slug union of every collection in the generated `Config`. */
export type CollectionSlug = keyof Config['collections']

/** The signed-in user as hooks/access functions see it. */
export type TypedUser = User & { collection: 'users' }

/* -------------------------------------------------------------------------- */
/* Requests, access, hooks                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The request object handed to hooks, access rules and custom endpoints: the
 * incoming `Request` plus the engine, the resolved user and (for custom
 * endpoints) the matched route params / query. See `@/localapi/endpoints`.
 */
export type EngineRequest = Request & {
  user?: TypedUser | null
  engine: Engine
  context?: Record<string, unknown>
  routeParams?: Record<string, unknown>
  query?: Record<string, string>
  locale?: string
  t?: (key: string) => string
  [key: string]: unknown
}

export type AccessArgs<TData = any> = {
  req: EngineRequest
  id?: number | string
  data?: TData
  doc?: TData
  [key: string]: unknown
}

/** Collection/global-level access rule: a boolean, or a `Where` constraint that narrows what the caller may touch. */
export type Access<TData = any> = (args: AccessArgs<TData>) => boolean | Where | Promise<boolean | Where>

export type FieldAccessArgs<TData = any, TSibling = any> = {
  req: EngineRequest
  id?: number | string
  data?: TData
  doc?: TData
  siblingData?: TSibling
  [key: string]: unknown
}

/** Field-level access rule: allow or deny (no `Where`). */
export type FieldAccess<TData = any, TSibling = any> = (
  args: FieldAccessArgs<TData, TSibling>,
) => boolean | Promise<boolean>

export type FieldHookArgs = {
  value?: any
  previousValue?: any
  data?: Record<string, any>
  originalDoc?: Record<string, any>
  siblingData?: Record<string, any>
  operation?: 'create' | 'update' | 'read' | 'delete'
  req: EngineRequest
  field: Field
  context?: Record<string, unknown>
  [key: string]: unknown
}

export type FieldHook = (args: FieldHookArgs) => any

export type CollectionBeforeChangeHook<T = any> = (args: {
  data: Partial<T>
  originalDoc?: T
  operation: 'create' | 'update'
  req: EngineRequest
  context: Record<string, unknown>
  collection?: any
  [key: string]: unknown
}) => any

export type CollectionAfterChangeHook<T = any> = (args: {
  doc: T
  previousDoc: T
  operation: 'create' | 'update'
  req: EngineRequest
  context: Record<string, unknown>
  data?: Partial<T>
  collection?: any
  [key: string]: unknown
}) => any

export type CollectionAfterDeleteHook<T = any> = (args: {
  doc: T
  id: number | string
  req: EngineRequest
  context: Record<string, unknown>
  collection?: any
  [key: string]: unknown
}) => any

export type GlobalAfterChangeHook<T = any> = (args: {
  doc: T
  previousDoc: T
  req: EngineRequest
  context: Record<string, unknown>
  data?: Partial<T>
  global?: any
  [key: string]: unknown
}) => any

export type Endpoint = {
  path: string
  method: 'get' | 'post' | 'put' | 'patch' | 'delete' | 'head' | 'options'
  handler: (req: EngineRequest) => Promise<Response> | Response
  custom?: Record<string, unknown>
}

/* -------------------------------------------------------------------------- */
/* Fields                                                                      */
/* -------------------------------------------------------------------------- */

type Label = string | Record<string, string> | ((args: any) => string) | false

export type FieldAdmin = {
  description?: string | Record<string, string> | ((args: any) => string)
  condition?: (data: any, siblingData: any, ctx?: any) => boolean
  components?: Record<string, any>
  hidden?: boolean
  disabled?: boolean
  readOnly?: boolean
  position?: 'sidebar'
  width?: string
  placeholder?: string | Record<string, string>
  style?: Record<string, unknown>
  className?: string
  disableBulkEdit?: boolean
  disableListColumn?: boolean
  disableListFilter?: boolean
  initCollapsed?: boolean
  [key: string]: unknown
}

export type FieldBase = {
  name?: string
  label?: Label
  required?: boolean
  unique?: boolean
  index?: boolean
  localized?: boolean
  hidden?: boolean
  virtual?: boolean | string
  defaultValue?: unknown
  saveToJWT?: boolean | string
  admin?: FieldAdmin
  access?: {
    create?: FieldAccess
    read?: FieldAccess
    update?: FieldAccess
    [key: string]: unknown
  }
  hooks?: {
    beforeValidate?: FieldHook[]
    beforeChange?: FieldHook[]
    afterChange?: FieldHook[]
    afterRead?: FieldHook[]
    [key: string]: unknown
  }
  validate?: (value: any, options: any) => true | string | Promise<true | string>
  custom?: Record<string, unknown>
  [key: string]: unknown
}

export type SelectOption = string | { label: Label; value: string }

export type TextField = FieldBase & { type: 'text'; hasMany?: boolean; minLength?: number; maxLength?: number }
export type TextareaField = FieldBase & { type: 'textarea'; minLength?: number; maxLength?: number; rows?: number }
export type EmailField = FieldBase & { type: 'email' }
export type CodeField = FieldBase & { type: 'code'; language?: string }
export type JSONField = FieldBase & { type: 'json' }
export type NumberField = FieldBase & { type: 'number'; hasMany?: boolean; min?: number; max?: number; step?: number }
export type PointField = FieldBase & { type: 'point' }
export type CheckboxField = FieldBase & { type: 'checkbox' }
export type DateField = FieldBase & { type: 'date' }
export type SelectField = FieldBase & { type: 'select'; options: SelectOption[]; hasMany?: boolean }
export type RadioField = FieldBase & { type: 'radio'; options: SelectOption[] }
export type RelationshipField = FieldBase & {
  type: 'relationship'
  relationTo: string | string[]
  hasMany?: boolean
  filterOptions?: unknown
  maxDepth?: number
}
export type UploadField = FieldBase & { type: 'upload'; relationTo: string; hasMany?: boolean; filterOptions?: unknown }
export type RichTextField = FieldBase & { type: 'richText'; editor?: unknown }
export type JoinField = FieldBase & { type: 'join'; collection: string | string[]; on: string; maxDepth?: number }
export type UIField = FieldBase & { type: 'ui' }
export type ArrayField = FieldBase & { type: 'array'; fields: Field[]; minRows?: number; maxRows?: number; labels?: { singular?: Label; plural?: Label } }
export type GroupField = FieldBase & { type: 'group'; fields: Field[] }
export type RowField = FieldBase & { type: 'row'; fields: Field[] }
export type CollapsibleField = FieldBase & { type: 'collapsible'; fields: Field[] }
export type TabsField = FieldBase & {
  type: 'tabs'
  tabs: Array<{ name?: string; label?: Label; fields: Field[]; description?: string; [key: string]: unknown }>
}
export type BlocksField = FieldBase & {
  type: 'blocks'
  blocks: Block[]
  minRows?: number
  maxRows?: number
  labels?: { singular?: Label; plural?: Label }
}

export type Block = {
  slug: string
  fields: Field[]
  interfaceName?: string
  labels?: { singular?: Label; plural?: Label }
  imageURL?: string
  imageAltText?: string
  dbName?: string
  admin?: Record<string, unknown>
  custom?: Record<string, unknown>
  [key: string]: unknown
}

export type Field =
  | TextField
  | TextareaField
  | EmailField
  | CodeField
  | JSONField
  | NumberField
  | PointField
  | CheckboxField
  | DateField
  | SelectField
  | RadioField
  | RelationshipField
  | UploadField
  | RichTextField
  | JoinField
  | UIField
  | ArrayField
  | GroupField
  | RowField
  | CollapsibleField
  | TabsField
  | BlocksField

/* -------------------------------------------------------------------------- */
/* Collections and globals                                                     */
/* -------------------------------------------------------------------------- */

type EntityAdmin = {
  useAsTitle?: string
  group?: string | Record<string, string> | false
  defaultColumns?: string[]
  description?: string | Record<string, string> | ((args: any) => string)
  hidden?: boolean | ((args: any) => boolean)
  listSearchableFields?: string[]
  components?: Record<string, any>
  livePreview?: unknown
  preview?: unknown
  disableCopyToLocale?: boolean
  pagination?: { defaultLimit?: number; limits?: number[] }
  [key: string]: unknown
}

export type CollectionConfig = {
  slug: CollectionSlug | (string & {})
  dbName?: string
  labels?: { singular?: Label; plural?: Label }
  fields: Field[]
  admin?: EntityAdmin
  access?: {
    create?: Access
    read?: Access
    update?: Access
    delete?: Access
    readVersions?: Access
    unlock?: Access
    admin?: Access
    [key: string]: unknown
  }
  auth?: boolean | Record<string, unknown>
  upload?: boolean | Record<string, unknown>
  versions?: boolean | { drafts?: boolean | Record<string, unknown>; maxPerDoc?: number; [key: string]: unknown }
  timestamps?: boolean
  defaultSort?: string
  disableDuplicate?: boolean
  endpoints?: Endpoint[] | false
  hooks?: {
    beforeValidate?: Array<(args: any) => any>
    beforeChange?: CollectionBeforeChangeHook[]
    afterChange?: CollectionAfterChangeHook[]
    beforeRead?: Array<(args: any) => any>
    afterRead?: Array<(args: any) => any>
    beforeDelete?: Array<(args: any) => any>
    afterDelete?: CollectionAfterDeleteHook[]
    beforeOperation?: Array<(args: any) => any>
    beforeLogin?: Array<(args: any) => any>
    afterLogin?: Array<(args: any) => any>
    afterLogout?: Array<(args: any) => any>
    afterMe?: Array<(args: any) => any>
    afterRefresh?: Array<(args: any) => any>
    afterForgotPassword?: Array<(args: any) => any>
    [key: string]: unknown
  }
  indexes?: unknown[]
  custom?: Record<string, unknown>
  [key: string]: unknown
}

export type GlobalConfig = {
  slug: string
  dbName?: string
  label?: Label
  fields: Field[]
  admin?: EntityAdmin
  access?: {
    read?: Access
    update?: Access
    readVersions?: Access
    [key: string]: unknown
  }
  versions?: boolean | Record<string, unknown>
  endpoints?: Endpoint[] | false
  hooks?: {
    beforeValidate?: Array<(args: any) => any>
    beforeChange?: Array<(args: any) => any>
    afterChange?: GlobalAfterChangeHook[]
    beforeRead?: Array<(args: any) => any>
    afterRead?: Array<(args: any) => any>
    [key: string]: unknown
  }
  custom?: Record<string, unknown>
  [key: string]: unknown
}

/** The shapes the admin nav/dashboard read (`labels`, `admin.group`, ...) once a config has been through this app's own label defaults (`@/localapi/config`). */
export type SanitizedCollectionConfig = CollectionConfig & { labels: { singular: any; plural: any } }
export type SanitizedGlobalConfig = GlobalConfig

/** Props handed to a custom admin view component. The admin resolves its own context (`getAdminContext`); views read `user`, `searchParams` and `initPageResult` at most. */
export type AdminViewServerProps = {
  i18n?: any
  engine?: any
  permissions?: any
  user?: any
  visibleEntities?: any
  initPageResult?: any
  params?: Record<string, any>
  searchParams?: Record<string, string | string[] | undefined>
  [key: string]: unknown
}

/** Props of a field component wired via `admin.components.Field` on a text field. */
export type TextFieldClientProps = {
  field: Record<string, any>
  path?: string
  readOnly?: boolean
  [key: string]: unknown
}

/** Legacy alias kept so the seam's neutral names line up; the browser-facing server-function bridge is not used. */
export type ServerFunctionClient = (args: Record<string, unknown>) => Promise<unknown>
