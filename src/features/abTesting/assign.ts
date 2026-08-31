import type { VariantSpec } from './types'

/**
 * Which variant a visitor sees, decided by arithmetic rather than by a lookup.
 *
 * The whole point of hashing instead of drawing a random number is that the
 * answer is reproducible: the same visitor id and test id always land in the
 * same bucket, so a visitor whose cookie is lost and regenerated from the same
 * id gets the same arm back, and two Workers in two data centres never disagree.
 * That is what lets assignment run with no database round trip at all.
 *
 * Mixing the test id into the hash keeps tests independent - without it, a
 * visitor in the low bucket would sit in the first arm of every test on the
 * site at once, which quietly correlates every result with every other.
 */

/** FNV-1a over the UTF-16 code units, then a murmur3 finaliser. */
const hash32 = (input: string): number => {
  let hash = 0x811c9dc5
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    // FNV prime, via shifts because Math.imul on the prime overflows readability.
    hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0
  }
  // FNV alone clusters badly in the low bits, which is exactly where a
  // cumulative-weight split reads. The finaliser spreads them.
  hash ^= hash >>> 16
  hash = Math.imul(hash, 0x85ebca6b) >>> 0
  hash ^= hash >>> 13
  hash = Math.imul(hash, 0xc2b2ae35) >>> 0
  hash ^= hash >>> 16
  return hash >>> 0
}

/** A stable number in [0, 1) for this visitor and this test. */
export const bucketOf = (visitorId: string, testId: string): number =>
  hash32(`${visitorId}:${testId}`) / 0x100000000

/**
 * Picks a variant by cumulative weight.
 *
 * Weights are relative, not percentages: 3 and 1 is a 75/25 split, and so is
 * 75 and 25. Non-positive or non-finite weights are treated as zero so a typo
 * removes an arm rather than poisoning the whole split; if that leaves nothing
 * with weight, every arm gets an equal share instead of the test dying.
 */
export const pickVariant = (variants: VariantSpec[], bucket: number): string | null => {
  if (variants.length === 0) return null

  const weights = variants.map((variant) =>
    Number.isFinite(variant.weight) && variant.weight > 0 ? variant.weight : 0,
  )
  const total = weights.reduce((sum, weight) => sum + weight, 0)
  const effective = total > 0 ? weights : weights.map(() => 1)
  const effectiveTotal = total > 0 ? total : variants.length

  const clamped = bucket >= 0 && bucket < 1 ? bucket : 0
  let threshold = clamped * effectiveTotal
  for (let index = 0; index < variants.length; index += 1) {
    threshold -= effective[index]
    if (threshold < 0) return variants[index].key
  }
  // Floating-point drift on the last boundary only. The final arm is correct.
  return variants[variants.length - 1].key
}

/** The two steps together, which is how every caller uses them. */
export const assignVariant = (
  visitorId: string,
  testId: string,
  variants: VariantSpec[],
): string | null => pickVariant(variants, bucketOf(visitorId, testId))

/**
 * A fresh visitor id.
 *
 * 128 bits of randomness, hex encoded. Random rather than derived from
 * anything about the person: this id is written to a cookie and joined against
 * conversion rows, so anything derived from an IP or a user agent would turn
 * an analytics counter into a tracking identifier.
 */
export const newVisitorId = (): string => {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}
