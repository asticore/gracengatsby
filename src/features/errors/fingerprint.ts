/**
 * Groups repeated errors. Two errors with the same source, message and top
 * stack frame get the same fingerprint, so the log counts them as one entry.
 * Pure and synchronous (no crypto.subtle), so it can run anywhere.
 */

/** The first stack line that names a place in code, with line and column numbers removed. */
export function topFrame(stack: string | null | undefined, message: string): string {
  if (!stack) return ''
  const lines = String(stack)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && line !== message.trim() && !/^[A-Za-z]*Error\b/.test(line))
  const frame = lines.find((line) => line.startsWith('at ') || line.includes('@') || line.includes('/')) ?? lines[0] ?? ''
  return frame.replace(/:\d+(:\d+)?/g, '').replace(/\s+/g, ' ').slice(0, 300)
}

/** 32-bit FNV-1a over the string, with a seed so two independent hashes can be combined. */
function fnv1a(text: string, seed: number): string {
  let hash = seed >>> 0
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

/**
 * The fingerprint for one error: 16 hex characters. Callers pass the already
 * scrubbed message and stack, so a secret that changes between requests does
 * not split one error into many entries.
 */
export function fingerprintFor(source: string, message: string, stack?: string | null): string {
  const key = `${source}\u0000${message}\u0000${topFrame(stack, message)}`
  return fnv1a(key, 0x811c9dc5) + fnv1a(key, 0x9e3779b9)
}