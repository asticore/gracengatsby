/**
 * Section, template and page locks: the pure part (shape, parsing, who may bypass, tree comparison).
 * No database or engine imports, so the visual editor can use the same parsing as the server guard.
 *
 * Stored in a `locks` JSON column on pages and page templates:
 *
 *   {
 *     document?: LockEntry,                 // the whole page/template
 *     nodes: { [nodeKey]: LockEntry }       // one section/element, keyed by node id (see nodeKey)
 *   }
 *
 * LockEntry.mode:
 *   'full'      - nothing inside may change.
 *   'structure' - structure and styling are fixed (blocks, order, columns, design); only the props named
 *                 in `editableProps` (text fields such as "text" or "heading") may change.
 * `unlockRoles` are role slugs (built-in or custom) that may edit through the lock. Admins always may.
 * Adding a lock needs admin or the `locks` permission; changing or removing an existing lock needs admin or being named in that lock's unlockRoles.
 *
 * Everything fails closed: malformed JSON, an unknown mode, or a tree too large to compare is treated as
 * a full lock that only admins can pass.
 */

export type LockMode = 'structure' | 'full'

export type LockEntry = {
  mode: LockMode
  unlockRoles: string[]
  editableProps: string[]
  label?: string
  /** Set when the stored entry was unreadable; such an entry is a full lock for admins only. */
  malformed?: boolean
}

export type Locks = {
  document?: LockEntry
  nodes: Record<string, LockEntry>
  /** True when the whole value was unreadable. */
  malformed?: boolean
}

export const MAX_LOCK_NODES = 500
/** Upper bound on nodes visited per tree comparison; beyond it the save is refused. */
export const MAX_TREE_NODES = 5000
const MAX_DEPTH = 24

export const EMPTY_LOCKS: Locks = { nodes: {} }

const MALFORMED_ENTRY: LockEntry = { mode: 'full', unlockRoles: [], editableProps: [], malformed: true }

const isPlainObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

const stringList = (v: unknown, max = 50): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.length > 0 && x.length <= 80).slice(0, max) : []

function parseEntry(raw: unknown): LockEntry {
  if (!isPlainObject(raw)) return MALFORMED_ENTRY
  if (raw.mode !== 'full' && raw.mode !== 'structure') return MALFORMED_ENTRY
  if (raw.unlockRoles !== undefined && !Array.isArray(raw.unlockRoles)) return MALFORMED_ENTRY
  if (raw.editableProps !== undefined && !Array.isArray(raw.editableProps)) return MALFORMED_ENTRY
  return {
    mode: raw.mode,
    unlockRoles: stringList(raw.unlockRoles),
    editableProps: raw.mode === 'structure' ? stringList(raw.editableProps, 100) : [],
    ...(typeof raw.label === 'string' && raw.label ? { label: raw.label.slice(0, 120) } : {}),
  }
}

/** Reads a stored `locks` value (JSON text or object). Empty values mean "no locks". */
export function parseLocks(input: unknown): Locks {
  let value = input
  if (value === undefined || value === null || value === '') return { nodes: {} }
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value)
    } catch {
      return { nodes: {}, document: MALFORMED_ENTRY, malformed: true }
    }
  }
  if (value === null) return { nodes: {} }
  if (!isPlainObject(value)) return { nodes: {}, document: MALFORMED_ENTRY, malformed: true }

  const locks: Locks = { nodes: {} }
  if (value.document !== undefined && value.document !== null) locks.document = parseEntry(value.document)

  const nodes = value.nodes
  if (nodes !== undefined && nodes !== null) {
    if (!isPlainObject(nodes) || Object.keys(nodes).length > MAX_LOCK_NODES) {
      return { nodes: {}, document: MALFORMED_ENTRY, malformed: true }
    }
    for (const [key, entry] of Object.entries(nodes)) locks.nodes[key] = parseEntry(entry)
  }
  return locks
}

export const hasAnyLock = (locks: Locks): boolean => Boolean(locks.document) || Object.keys(locks.nodes).length > 0

/** Plain JSON for storage: drops the parse-only flags. */
export function serializeLocks(locks: Locks): { document?: LockEntry; nodes: Record<string, LockEntry> } {
  const clean = (e: LockEntry): LockEntry => ({
    mode: e.mode,
    unlockRoles: e.unlockRoles,
    editableProps: e.mode === 'structure' ? e.editableProps : [],
    ...(e.label ? { label: e.label } : {}),
  })
  return {
    ...(locks.document ? { document: clean(locks.document) } : {}),
    nodes: Object.fromEntries(Object.entries(locks.nodes).map(([k, e]) => [k, clean(e)])),
  }
}

export type LockUser = {
  roles?: string[]
  customRoleSlug?: string
  customRolePermissions?: unknown
  permissionOverrides?: unknown
  id?: number
} | null | undefined

/** Built-in role slugs plus the custom role's slug (set on the session user by attachCustomRole). */
export function roleSlugsOfSession(user: LockUser): string[] {
  const slugs = new Set<string>()
  if (Array.isArray(user?.roles)) for (const r of user.roles) if (typeof r === 'string') slugs.add(r)
  if (typeof user?.customRoleSlug === 'string' && user.customRoleSlug) slugs.add(user.customRoleSlug)
  return [...slugs]
}

export const isAdminSession = (user: LockUser): boolean => Boolean(user?.roles?.includes('admin'))

/** May this user edit through the lock (admin, or holds one of the entry's unlock roles)? */
export function canBypassLock(user: LockUser, entry: LockEntry): boolean {
  if (isAdminSession(user)) return true
  if (entry.malformed) return false
  const slugs = roleSlugsOfSession(user)
  return entry.unlockRoles.some((role) => slugs.includes(role))
}

/* -------------------------------------------------------------------------- */
/* Tree comparison                                                             */
/* -------------------------------------------------------------------------- */

type Node = Record<string, unknown>

export class LockBudgetError extends Error {
  constructor() {
    super('The content is too large to check against its locks.')
    this.name = 'LockBudgetError'
  }
}

/** The identity a lock is stored under: the database block id for top-level blocks, `_id` for nested nodes. */
export function nodeKey(node: unknown): string | undefined {
  if (!isPlainObject(node)) return undefined
  const id = node.id
  if (typeof id === 'string' && id) return id
  if (typeof id === 'number') return String(id)
  const own = node._id
  return typeof own === 'string' && own ? own : undefined
}

const isEmpty = (v: unknown): boolean =>
  v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0) || (isPlainObject(v) && Object.keys(v).length === 0)

/** Stable text for a value: sorted keys, empty values dropped (null, undefined, "", [], {} all mean "unset"). */
function canon(value: unknown, depth = 0): string {
  if (depth > 40) throw new LockBudgetError()
  if (Array.isArray(value)) return `[${value.map((v) => canon(v, depth + 1)).join(',')}]`
  if (isPlainObject(value)) {
    const keys = Object.keys(value)
      .filter((k) => !isEmpty(value[k]))
      .sort()
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canon(value[k], depth + 1)}`).join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}

/** A section's `columns` arrive as a JSON column: usually an array, tolerate JSON text. */
function columnsOf(node: Node): Node[] {
  let cols = node.columns
  if (typeof cols === 'string') {
    try {
      cols = JSON.parse(cols)
    } catch {
      return []
    }
  }
  return Array.isArray(cols) ? cols.filter(isPlainObject) : []
}

function childrenOf(column: Node): Node[] {
  return Array.isArray(column.blocks) ? column.blocks.filter(isPlainObject) : []
}

/** A node without its identity, its columns (compared separately) and the props that may change. */
function comparable(node: Node, editable: ReadonlySet<string>): string {
  const { _id: _a, id: _b, columns: _c, ...rest } = node
  for (const name of editable) delete rest[name]
  if (isPlainObject(rest.props) && editable.size > 0) {
    const props = { ...rest.props }
    for (const name of editable) delete props[name]
    rest.props = props
  }
  return canon(rest)
}

function columnComparable(column: Node): string {
  const { _id: _a, blocks: _b, ...rest } = column
  return canon(rest)
}

type Budget = { left: number }

function spend(budget: Budget): void {
  budget.left -= 1
  if (budget.left < 0) throw new LockBudgetError()
}

/**
 * True when two nodes have the same structure and styling: same type, same props (except `editable`
 * ones), same columns, and the same children in the same order, all the way down.
 */
export function sameStructure(a: Node, b: Node, editable: ReadonlySet<string>, budget: Budget, depth = 0): boolean {
  if (depth > MAX_DEPTH) throw new LockBudgetError()
  spend(budget)
  if (a.blockType !== b.blockType) return false
  if (comparable(a, editable) !== comparable(b, editable)) return false
  const colsA = columnsOf(a)
  const colsB = columnsOf(b)
  if (colsA.length !== colsB.length) return false
  for (let i = 0; i < colsA.length; i++) {
    if (columnComparable(colsA[i]) !== columnComparable(colsB[i])) return false
    const kidsA = childrenOf(colsA[i])
    const kidsB = childrenOf(colsB[i])
    if (kidsA.length !== kidsB.length) return false
    for (let k = 0; k < kidsA.length; k++) {
      if (!sameStructure(kidsA[k], kidsB[k], editable, budget, depth + 1)) return false
    }
  }
  return true
}

export function sameTree(a: unknown, b: unknown, editable: ReadonlySet<string>, budget: Budget = { left: MAX_TREE_NODES }): boolean {
  const listA = Array.isArray(a) ? a.filter(isPlainObject) : []
  const listB = Array.isArray(b) ? b.filter(isPlainObject) : []
  if (listA.length !== listB.length) return false
  return listA.every((node, i) => sameStructure(node, listB[i], editable, budget))
}

type Indexed = {
  node: Node
  /** Ancestor chain: each ancestor's key (or position index when it has none) and the column entered. */
  path: string
  /** Keys of the keyed siblings in the same column, in order, and this node's place among them. */
  siblings: (string | undefined)[]
  index: number
}

/** Every keyed node in a tree with where it sits (full ancestor path and siblings). */
function indexTree(blocks: unknown, budget: Budget): Map<string, Indexed> {
  const index = new Map<string, Indexed>()
  const walk = (nodes: Node[], path: string, depth: number) => {
    if (depth > MAX_DEPTH) throw new LockBudgetError()
    const siblings = nodes.map((n) => nodeKey(n))
    nodes.forEach((node, i) => {
      spend(budget)
      const key = siblings[i]
      if (key !== undefined && !index.has(key)) index.set(key, { node, path, siblings, index: i })
      const here = `${path}/${key !== undefined ? `k:${key}` : `#${i}`}`
      columnsOf(node).forEach((col, ci) => walk(childrenOf(col), `${here}[${ci}]`, depth + 1))
    })
  }
  walk(Array.isArray(blocks) ? blocks.filter(isPlainObject) : [], '', 0)
  return index
}

/** Keyed siblings before the node that also exist in the other tree's column (ignores unrelated inserts and removals). */
function precedingShared(self: Indexed, other: Indexed): Set<string> {
  const otherKeys = new Set(other.siblings.filter((k): k is string => k !== undefined))
  const result = new Set<string>()
  for (let i = 0; i < self.index; i++) {
    const k = self.siblings[i]
    if (k !== undefined && otherKeys.has(k)) result.add(k)
  }
  return result
}

/** True when a node kept both its place in the tree (ancestors) and its order among the siblings that stayed. */
function samePlace(was: Indexed, now: Indexed): boolean {
  if (was.path !== now.path) return false
  const a = precedingShared(was, now)
  const b = precedingShared(now, was)
  if (a.size !== b.size) return false
  for (const k of a) if (!b.has(k)) return false
  return true
}

export function lockLabel(entry: LockEntry, node?: Node): string {
  if (entry.label) return entry.label
  if (node) {
    const name = typeof node.blockName === 'string' && node.blockName ? node.blockName : undefined
    const type = typeof node.elementType === 'string' && node.elementType ? node.elementType : typeof node.blockType === 'string' ? node.blockType : 'section'
    return name ?? type
  }
  return 'section'
}

const whoMay = (entry: LockEntry): string =>
  entry.unlockRoles.length > 0 ? ` Ask someone with the ${entry.unlockRoles.join(' or ')} role, or an admin, to unlock it.` : ' Only an admin can unlock it.'

const modeText = (entry: LockEntry): string =>
  entry.malformed ? 'locked (its lock settings are unreadable)' : entry.mode === 'full' ? 'fully locked' : 'locked: only its text can be changed'

export type LockCheck = { ok: true } | { ok: false; message: string }

/**
 * Compares the stored blocks with the blocks being saved against the stored locks. `noun` names the
 * document in messages ("page", "template"). Returns the first locked part that would change.
 */
export function checkLockedTree({
  user,
  locks,
  original,
  incoming,
  noun,
}: {
  user: LockUser
  locks: Locks
  original: unknown
  incoming: unknown
  noun: string
}): LockCheck {
  if (!hasAnyLock(locks)) return { ok: true }
  try {
    const budget: Budget = { left: MAX_TREE_NODES }

    const doc = locks.document
    if (doc && !canBypassLock(user, doc)) {
      const editable = new Set(doc.editableProps)
      if (!sameTree(original, incoming, editable, budget)) {
        return {
          ok: false,
          message: `This ${noun} is ${modeText(doc)}. ${doc.mode === 'structure' && !doc.malformed ? 'You can edit its text but not its structure or styling.' : `You cannot change its sections.`}${whoMay(doc)}`,
        }
      }
    }

    const entries = Object.entries(locks.nodes).filter(([, entry]) => !canBypassLock(user, entry))
    if (entries.length > 0) {
      const before = indexTree(original, budget)
      const after = indexTree(incoming, budget)
      for (const [key, entry] of entries) {
        const was = before.get(key)
        if (!was) continue // a lock on something that no longer exists
        const label = lockLabel(entry, was.node)
        const now = after.get(key)
        if (!now) return { ok: false, message: `Section "${label}" is locked and cannot be removed.${whoMay(entry)}` }
        if (!samePlace(was, now)) {
          return { ok: false, message: `Section "${label}" is locked and cannot be moved or reordered.${whoMay(entry)}` }
        }
        const editable = new Set(entry.mode === 'structure' ? entry.editableProps : [])
        if (!sameStructure(was.node, now.node, editable, budget)) {
          return {
            ok: false,
            message: `Section "${label}" is ${modeText(entry)}.${entry.mode === 'structure' && !entry.malformed ? ' You can edit its text but not its structure or styling.' : ''}${whoMay(entry)}`,
          }
        }
      }
    }
  } catch (error) {
    if (error instanceof LockBudgetError) {
      return { ok: false, message: 'This content has locked parts and is too large to check, so the save was refused. Ask an admin.' }
    }
    throw error
  }
  return { ok: true }
}

/** May this user create or change a lock entry? Adding needs the `locks` permission; changing or removing an existing one needs admin or an unlock role named on it. */
export function checkLockChanges({
  user,
  canManage,
  original,
  incoming,
}: {
  user: LockUser
  canManage: boolean
  original: Locks
  incoming: Locks
}): LockCheck {
  if (isAdminSession(user)) return { ok: true }
  const same = (a: LockEntry | undefined, b: LockEntry | undefined) => canon(a ?? null) === canon(b ?? null)

  const check = (name: string, was: LockEntry | undefined, now: LockEntry | undefined): LockCheck => {
    if (same(was, now)) return { ok: true }
    // An existing lock may only be removed, weakened or otherwise changed by someone who can pass it
    // (admin, or named in that lock's unlockRoles). The `locks` permission alone is not enough.
    if (was) {
      if (canBypassLock(user, was)) return { ok: true }
      return { ok: false, message: `Your role cannot change the lock on ${name}.${whoMay(was)}` }
    }
    // A brand-new lock needs the `locks` permission.
    if (canManage) return { ok: true }
    return { ok: false, message: `Your role cannot change the lock on ${name}. Ask an admin to lock or unlock it.` }
  }

  const doc = check('this document', original.document, incoming.document)
  if (!doc.ok) return doc
  const keys = new Set([...Object.keys(original.nodes), ...Object.keys(incoming.nodes)])
  for (const key of keys) {
    const was = original.nodes[key]
    const result = check(`section "${lockLabel((was ?? incoming.nodes[key])!)}"`, was, incoming.nodes[key])
    if (!result.ok) return result
  }
  return { ok: true }
}
