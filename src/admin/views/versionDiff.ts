import { humanizeName } from '@/admin/fields/shared'

export interface DiffEntry {
  field: string
  label: string
  kind: 'changed' | 'added' | 'removed'
  before: string
  after: string
}

const defaultIgnoredKeys = new Set(['id', 'createdAt', 'updatedAt', '_status', 'createdBy', 'updatedBy'])

/**
 * Humanize a field name if humanizeName is not available or needed
 */
function humanizeFieldName(name: string): string {
  return humanizeName(name)
}

/**
 * Format a value for display
 */
function formatValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '(empty)'
  }

  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No'
  }

  if (typeof value === 'string') {
    return value.length > 300 ? value.substring(0, 300) + '...' : value
  }

  if (typeof value === 'number') {
    return String(value)
  }

  // Handle arrays
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return '(empty)'
    }

    // Check if it's an array of objects with blockType (like blocks)
    if (value.length > 0 && typeof value[0] === 'object' && value[0] !== null && 'blockType' in value[0]) {
      const blockTypes = value.map((item) => {
        if (typeof item === 'object' && item !== null && 'blockType' in item) {
          const blockType = (item as Record<string, unknown>).blockType
          return String(blockType)
        }
        return 'Unknown'
      })
      return blockTypes.join(', ')
    }

    // Check if it's an array of primitives
    if (value.every((item) => typeof item !== 'object' || item === null)) {
      const joined = value.map(String).join(', ')
      return joined.length > 300 ? joined.substring(0, 300) + '...' : joined
    }

    // Array of objects: check for id, title, name, filename, email
    const formatted = value.map((item) => {
      if (typeof item === 'object' && item !== null) {
        const obj = item as Record<string, unknown>
        if ('id' in obj) return String(obj.id)
        if ('title' in obj) return String(obj.title)
        if ('name' in obj) return String(obj.name)
        if ('filename' in obj) return String(obj.filename)
        if ('email' in obj) return String(obj.email)
      }
      return String(item)
    })
    const joined = formatted.join(', ')
    return joined.length > 300 ? joined.substring(0, 300) + '...' : joined
  }

  // Handle objects
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>
    // Try single identifying field
    if ('id' in obj) return String(obj.id)
    if ('title' in obj) return String(obj.title)
    if ('name' in obj) return String(obj.name)
    if ('filename' in obj) return String(obj.filename)
    if ('email' in obj) return String(obj.email)

    // Fallback to compact JSON
    const json = JSON.stringify(obj)
    return json.length > 300 ? json.substring(0, 300) + '...' : json
  }

  return String(value)
}

/**
 * Sort object keys for consistent comparison
 */
function sortedStringify(obj: unknown): string {
  if (obj === null || obj === undefined) {
    return JSON.stringify(obj)
  }
  if (typeof obj !== 'object' || Array.isArray(obj)) {
    return JSON.stringify(obj)
  }
  const sorted: Record<string, unknown> = {}
  const keys = Object.keys(obj as Record<string, unknown>).sort()
  for (const key of keys) {
    sorted[key] = (obj as Record<string, unknown>)[key]
  }
  return JSON.stringify(sorted)
}

/**
 * Compare two versions and return a list of differences
 */
export function diffVersion(
  version: Record<string, unknown>,
  current: Record<string, unknown>,
  opts?: { ignore?: string[]; labels?: Record<string, string> }
): DiffEntry[] {
  const ignoredKeys = new Set([...defaultIgnoredKeys, ...(opts?.ignore || [])])
  const labels = opts?.labels || {}
  const diffs: DiffEntry[] = []

  // Get all keys from both objects
  const allKeys = new Set([...Object.keys(version), ...Object.keys(current)])

  for (const key of allKeys) {
    // Skip ignored keys
    if (ignoredKeys.has(key)) {
      continue
    }

    const versionValue = version[key]
    const currentValue = current[key]

    // Use deep equality with sorted keys
    const versionStr = sortedStringify(versionValue)
    const currentStr = sortedStringify(currentValue)

    // Skip if values are equal
    if (versionStr === currentStr) {
      continue
    }

    // Determine the kind of change
    let kind: 'changed' | 'added' | 'removed'
    if (!(key in current)) {
      kind = 'removed'
    } else if (!(key in version)) {
      kind = 'added'
    } else {
      kind = 'changed'
    }

    const label = labels[key] || humanizeFieldName(key)
    const before = formatValue(versionValue)
    const after = formatValue(currentValue)

    diffs.push({
      field: key,
      label,
      kind,
      before,
      after,
    })
  }

  return diffs
}
